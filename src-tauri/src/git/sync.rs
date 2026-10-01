use std::fs;
use std::path::Path;

use git2::{
    BranchType, Cred, CredentialType, DiffFormat, DiffOptions, FetchOptions, FileFavor, Index,
    IndexAddOption, MergeOptions, PushOptions, RemoteCallbacks, Repository, RepositoryState,
    StatusOptions,
};
use serde::Serialize;

use super::{remote, repo};

const PATCH_LIMIT: usize = 48_000;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitDiffFile {
    pub path: String,
    pub change: String,
    pub source: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitPreview {
    pub local_branch: String,
    pub remote_branch: String,
    pub ahead: usize,
    pub behind: usize,
    pub local_changes: usize,
    pub files: Vec<GitDiffFile>,
    pub remote_patch: String,
    pub local_patch: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitSyncResult {
    pub local_branch: String,
    pub remote_branch: String,
    pub commit: Option<String>,
    pub conflicts: Vec<String>,
    pub preview: Option<GitPreview>,
}

fn credentials(username: &str, token: &str) -> RemoteCallbacks<'static> {
    let username = if username.trim().is_empty() {
        "git".to_string()
    } else {
        username.trim().to_string()
    };
    let token = token.to_string();
    let mut callbacks = RemoteCallbacks::new();
    callbacks.credentials(move |_url, url_user, allowed| {
        if !token.is_empty() && allowed.contains(CredentialType::USER_PASS_PLAINTEXT) {
            Cred::userpass_plaintext(url_user.unwrap_or(&username), &token)
        } else {
            Cred::default()
        }
    });
    callbacks
}

fn abort_stale_rebase(repository: &Repository) -> Result<(), String> {
    if matches!(
        repository.state(),
        RepositoryState::Rebase | RepositoryState::RebaseInteractive | RepositoryState::RebaseMerge
    ) {
        let mut rebase = repository
            .open_rebase(None)
            .map_err(|e| format!("Rebase incompleto: não foi possível abrir para abortar: {e}"))?;
        rebase.abort().map_err(|e| {
            format!("Rebase incompleto: o abort falhou; pare e recupere o Git manualmente: {e}")
        })?;
    }
    Ok(())
}

fn fetch(repository: &Repository, name: &str, username: &str, token: &str) -> Result<(), String> {
    let mut remote = repository
        .find_remote(name)
        .map_err(|_| format!("Remoto '{name}' não está configurado neste workspace"))?;
    let refspec = format!("+refs/heads/*:refs/remotes/{name}/*");
    let mut options = FetchOptions::new();
    options.remote_callbacks(credentials(username, token));
    remote
        .fetch(&[&refspec], Some(&mut options), None)
        .map_err(|e| format!("Não foi possível buscar atualizações do remoto: {e}"))
}

fn remote_branch(repository: &Repository, remote: &str, local: &str) -> Option<String> {
    let mut branches = repository
        .branches(Some(BranchType::Remote))
        .ok()?
        .filter_map(Result::ok)
        .filter_map(|(branch, _)| branch.name().ok().flatten().map(str::to_owned))
        .filter_map(|name| name.strip_prefix(&format!("{remote}/")).map(str::to_owned))
        .collect::<Vec<_>>();
    branches.sort();
    if branches.iter().any(|name| name == local) {
        return Some(local.to_string());
    }
    for preferred in ["main", "master"] {
        if branches.iter().any(|name| name == preferred) {
            return Some(preferred.to_string());
        }
    }
    branches.into_iter().next()
}

fn local_branch(repository: &Repository) -> Result<String, String> {
    repository
        .head()
        .ok()
        .and_then(|head| head.shorthand().map(str::to_owned))
        .ok_or_else(|| "O workspace não tem uma branch local com commit".to_string())
}

fn local_change_count(repository: &Repository) -> Result<usize, String> {
    let mut options = StatusOptions::new();
    options.include_untracked(true).recurse_untracked_dirs(true);
    repository
        .statuses(Some(&mut options))
        .map(|statuses| statuses.len())
        .map_err(|e| format!("Não foi possível ler alterações locais: {e}"))
}

fn make_preview(
    repository: &Repository,
    remote: &str,
    local: &str,
    remote_name: &str,
) -> Result<GitPreview, String> {
    let mut files = Vec::new();
    let mut remote_patch = String::new();
    let local_commit = repository
        .head()
        .and_then(|head| head.peel_to_commit())
        .map_err(|e| format!("Não foi possível ler a branch local: {e}"))?;
    let upstream_ref = format!("refs/remotes/{remote_name}/{remote}");
    let upstream = repository.find_reference(&upstream_ref).ok();
    let (ahead, behind) = if let Some(reference) = &upstream {
        let theirs = reference
            .peel_to_commit()
            .map_err(|e| format!("Não foi possível ler a branch remota: {e}"))?;
        repository
            .graph_ahead_behind(local_commit.id(), theirs.id())
            .map_err(|e| format!("Não foi possível comparar branches: {e}"))?
    } else {
        (local_commit.parent_count(), 0)
    };
    if let Some(reference) = upstream {
        let theirs = reference
            .peel_to_commit()
            .map_err(|e| format!("Não foi possível ler a branch remota: {e}"))?;
        let ours_tree = local_commit
            .tree()
            .map_err(|e| format!("Não foi possível ler arquivos locais: {e}"))?;
        let theirs_tree = theirs
            .tree()
            .map_err(|e| format!("Não foi possível ler arquivos remotos: {e}"))?;
        let mut options = DiffOptions::new();
        let diff = repository
            .diff_tree_to_tree(Some(&theirs_tree), Some(&ours_tree), Some(&mut options))
            .map_err(|e| format!("Não foi possível comparar arquivos: {e}"))?;
        for delta in diff.deltas() {
            let path = delta
                .new_file()
                .path()
                .or_else(|| delta.old_file().path())
                .map(|p| p.to_string_lossy().replace('\\', "/"))
                .unwrap_or_default();
            files.push(GitDiffFile {
                path,
                change: format!("{:?}", delta.status()),
                source: "remote".into(),
            });
        }
        diff.print(DiffFormat::Patch, |_delta, _hunk, line| {
            if remote_patch.len() < PATCH_LIMIT {
                let remains = PATCH_LIMIT.saturating_sub(remote_patch.len());
                remote_patch.push_str(&String::from_utf8_lossy(
                    &line.content()[..line.content().len().min(remains)],
                ));
            }
            true
        })
        .map_err(|e| format!("Não foi possível montar a comparação: {e}"))?;
    }
    // Inclui alterações staged, unstaged e arquivos novos na prévia.
    let ours_tree = local_commit
        .tree()
        .map_err(|e| format!("Não foi possível ler arquivos locais: {e}"))?;
    let mut options = DiffOptions::new();
    options.include_untracked(true).recurse_untracked_dirs(true);
    let working = repository
        .diff_tree_to_workdir_with_index(Some(&ours_tree), Some(&mut options))
        .map_err(|e| format!("Não foi possível comparar alterações locais: {e}"))?;
    for delta in working.deltas() {
        let path = delta
            .new_file()
            .path()
            .or_else(|| delta.old_file().path())
            .map(|p| p.to_string_lossy().replace('\\', "/"))
            .unwrap_or_default();
        files.push(GitDiffFile {
            path,
            change: format!("{:?}", delta.status()),
            source: "working".into(),
        });
    }
    let mut local_patch = String::new();
    working
        .print(DiffFormat::Patch, |_delta, _hunk, line| {
            if local_patch.len() < PATCH_LIMIT {
                let remains = PATCH_LIMIT.saturating_sub(local_patch.len());
                local_patch.push_str(&String::from_utf8_lossy(
                    &line.content()[..line.content().len().min(remains)],
                ));
            }
            true
        })
        .map_err(|e| format!("Não foi possível montar alterações locais: {e}"))?;
    Ok(GitPreview {
        local_branch: local.to_string(),
        remote_branch: remote.to_string(),
        ahead,
        behind,
        local_changes: local_change_count(repository)?,
        files,
        remote_patch,
        local_patch,
    })
}

pub fn preview(
    root: &str,
    remote: &str,
    username: &str,
    token: &str,
) -> Result<GitPreview, String> {
    let repository = repo::open_for_remote(root)?;
    abort_stale_rebase(&repository)?;
    let local = local_branch(&repository)?;
    fetch(&repository, remote, username, token)?;
    let branch = remote_branch(&repository, remote, &local).unwrap_or_else(|| local.clone());
    make_preview(&repository, &local, &branch, remote)
}

fn auto_resolve_conflicts(
    repository: &Repository,
    root: &Path,
    index: &mut Index,
) -> Result<Vec<String>, String> {
    let conflicts = index
        .conflicts()
        .map_err(|e| format!("Não foi possível listar conflitos: {e}"))?;
    let folder = root.join(".appasciidoc").join("conflitos");
    fs::create_dir_all(&folder)
        .map_err(|e| format!("Não foi possível criar a pasta de conflitos: {e}"))?;
    let exclude = repository.path().join("info").join("exclude");
    if let Ok(current) = fs::read_to_string(&exclude) {
        let cleaned = current
            .lines()
            .filter(|line| line.trim() != "/.appasciidoc/conflitos/")
            .collect::<Vec<_>>()
            .join("\n");
        if cleaned != current.trim_end() {
            fs::write(&exclude, format!("{cleaned}\n")).map_err(|e| {
                format!("Não foi possível preparar as versões de conflito para sync: {e}")
            })?;
        }
    }
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or_default();
    let entries = conflicts
        .map(|conflict| {
            let conflict = conflict.map_err(|e| format!("Conflito inválido no índice: {e}"))?;
            let path = conflict
                .our
                .as_ref()
                .or(conflict.their.as_ref())
                .map(|entry| entry.path.clone())
                .ok_or_else(|| "Conflito sem nome de arquivo".to_string())?;
            let our = conflict
                .our
                .as_ref()
                .map(|entry| {
                    repository
                        .find_blob(entry.id)
                        .map(|blob| blob.content().to_vec())
                        .map_err(|e| format!("Não foi possível ler uma versão conflitante: {e}"))
                })
                .transpose()?;
            let their = conflict
                .their
                .as_ref()
                .map(|entry| {
                    repository
                        .find_blob(entry.id)
                        .map(|blob| blob.content().to_vec())
                        .map_err(|e| format!("Não foi possível ler uma versão conflitante: {e}"))
                })
                .transpose()?;
            Ok::<_, String>((path, our, their))
        })
        .collect::<Result<Vec<_>, _>>()?;
    let mut names = Vec::new();
    for (path, our, their) in entries {
        let relative = std::str::from_utf8(&path).map_err(|_| {
            "O nome de um arquivo em conflito não é UTF-8; o sync foi interrompido.".to_string()
        })?;
        if Path::new(relative)
            .components()
            .any(|part| !matches!(part, std::path::Component::Normal(_)))
        {
            return Err("Um caminho em conflito é inválido; o sync foi interrompido.".into());
        }
        let original = root.join(relative);
        let original_parent = original
            .parent()
            .ok_or_else(|| "Caminho de conflito inválido".to_string())?;
        fs::create_dir_all(original_parent)
            .map_err(|e| format!("Não foi possível preparar o arquivo em conflito: {e}"))?;
        let original_content = our.as_ref().or(their.as_ref());
        match original_content {
            Some(bytes) => fs::write(&original, bytes)
                .map_err(|e| format!("Não foi possível aplicar merge automático: {e}"))?,
            None => {
                let _ = fs::remove_file(&original);
            }
        }
        index
            .remove_path(Path::new(relative))
            .map_err(|e| format!("Não foi possível resolver o índice de conflito: {e}"))?;
        if original_content.is_some() {
            index
                .add_path(Path::new(relative))
                .map_err(|e| format!("Não foi possível preparar arquivo mesclado: {e}"))?;
        }
        let source_path = Path::new(relative);
        let source_stem = source_path
            .file_stem()
            .unwrap_or_default()
            .to_string_lossy()
            .replace(['/', '\\'], "_");
        let source_extension = source_path
            .extension()
            .map(|extension| format!(".{}", extension.to_string_lossy()))
            .unwrap_or_default();
        let path_hash = path.iter().fold(0xcbf29ce484222325_u64, |hash, byte| {
            (hash ^ u64::from(*byte)).wrapping_mul(0x100000001b3)
        });
        for (side, content) in [("versao-a", our.as_deref()), ("versao-b", their.as_deref())] {
            let output_name =
                format!("{source_stem}_{side}_{stamp}_{path_hash:08x}{source_extension}");
            let output = folder.join(&output_name);
            let output_relative = output
                .strip_prefix(root)
                .map_err(|_| "Cópia de conflito fora do workspace".to_string())?;
            let bytes = content.unwrap_or(b"[Este lado removeu o arquivo durante o merge.]\n");
            fs::write(&output, bytes)
                .map_err(|e| format!("Não foi possível preservar uma versão conflitante: {e}"))?;
            index
                .add_all([output_relative], IndexAddOption::FORCE, None)
                .map_err(|e| {
                    format!("Não foi possível incluir as versões preservadas no sync: {e}")
                })?;
            names.push(output.to_string_lossy().replace('\\', "/"));
        }
    }
    if index.has_conflicts() {
        return Err("O Git não conseguiu resolver todos os conflitos automaticamente.".into());
    }
    index
        .write()
        .map_err(|e| format!("Não foi possível salvar o merge automático: {e}"))?;
    Ok(names)
}

pub fn sync(
    root: &str,
    remote: &str,
    url: &str,
    username: &str,
    token: &str,
) -> Result<GitSyncResult, String> {
    remote::validate_url(url)?;
    match Repository::discover(root) {
        Ok(_) => {
            repo::open_for_remote(root)?;
        }
        Err(_) => repo::init(root)?,
    }
    let repository = repo::open_for_remote(root)?;
    repo::ensure_identity(&repository)?;
    remote::set(root, remote, url)?;
    abort_stale_rebase(&repository)?;
    let committed = repo::commit(root, "Sincronização AppAsciiDoc")?;
    let local = repository
        .head()
        .ok()
        .and_then(|head| head.shorthand().map(str::to_owned));
    fetch(&repository, remote, username, token)?;
    let remote_branch = remote_branch(&repository, remote, local.as_deref().unwrap_or("main"))
        .or_else(|| local.clone())
        .unwrap_or_else(|| "main".into());
    let upstream_name = format!("refs/remotes/{remote}/{remote_branch}");
    let Some(local) = local else {
        let upstream = repository
            .find_reference(&upstream_name)
            .map_err(|e| e.to_string())?;
        let commit = upstream.peel_to_commit().map_err(|e| e.to_string())?;
        repository
            .branch(&remote_branch, &commit, false)
            .map_err(|e| format!("Não foi possível preparar a branch local: {e}"))?;
        repository
            .set_head(&format!("refs/heads/{remote_branch}"))
            .map_err(|e| format!("Não foi possível mudar para a branch remota: {e}"))?;
        repository
            .checkout_head(Some(git2::build::CheckoutBuilder::new().safe()))
            .map_err(|e| format!("Não foi possível abrir os arquivos do remoto: {e}"))?;
        if let Ok(mut branch) = repository.find_branch(&remote_branch, BranchType::Local) {
            let _ = branch.set_upstream(Some(&format!("{remote}/{remote_branch}")));
        }
        return Ok(GitSyncResult {
            local_branch: remote_branch.clone(),
            remote_branch,
            commit: committed,
            conflicts: Vec::new(),
            preview: None,
        });
    };
    let preview = make_preview(&repository, &remote_branch, &local, remote).ok();
    let local_oid = repository
        .refname_to_id(&format!("refs/heads/{local}"))
        .map_err(|e| format!("Não foi possível ler branch local: {e}"))?;
    let mut auto_resolved = Vec::new();
    if let Ok(upstream_oid) = repository.refname_to_id(&upstream_name) {
        let (ahead, behind) = match repository.graph_ahead_behind(local_oid, upstream_oid) {
            Ok(pair) => pair,
            Err(_) => {
                let local_commit = repository
                    .find_commit(local_oid)
                    .map_err(|e| e.to_string())?;
                let remote_commit = repository
                    .find_commit(upstream_oid)
                    .map_err(|e| e.to_string())?;
                let empty_id = repository
                    .treebuilder(None)
                    .and_then(|builder| builder.write())
                    .map_err(|e| format!("Não foi possível preparar o merge inicial: {e}"))?;
                let empty_tree = repository.find_tree(empty_id).map_err(|e| e.to_string())?;
                let local_tree = local_commit.tree().map_err(|e| e.to_string())?;
                let remote_tree = remote_commit.tree().map_err(|e| e.to_string())?;
                let mut merge_options = MergeOptions::new();
                merge_options.file_favor(FileFavor::Union);
                let mut index = repository
                    .merge_trees(&empty_tree, &local_tree, &remote_tree, Some(&merge_options))
                    .map_err(|e| {
                        format!("Não foi possível combinar o conteúdo local e remoto: {e}")
                    })?;
                if index.has_conflicts() {
                    auto_resolved.extend(auto_resolve_conflicts(
                        &repository,
                        Path::new(root),
                        &mut index,
                    )?);
                }
                let tree_id = index
                    .write_tree_to(&repository)
                    .map_err(|e| format!("Não foi possível registrar o merge inicial: {e}"))?;
                let tree = repository.find_tree(tree_id).map_err(|e| e.to_string())?;
                let signature = repository
                    .signature()
                    .map_err(|e| format!("Não foi possível identificar o autor do sync: {e}"))?;
                repository
                    .commit(
                        Some("HEAD"),
                        &signature,
                        &signature,
                        "Merge inicial AppAsciiDoc",
                        &tree,
                        &[&local_commit, &remote_commit],
                    )
                    .map_err(|e| format!("Não foi possível gravar o merge inicial: {e}"))?;
                repository
                    .checkout_index(
                        Some(&mut index),
                        Some(&mut git2::build::CheckoutBuilder::new().force()),
                    )
                    .map_err(|e| {
                        format!(
                            "Merge inicial salvo, mas os arquivos não puderam ser atualizados: {e}"
                        )
                    })?;
                // O merge inicial já contém os dois lados; siga direto para o push.
                (1, 0)
            }
        };
        if ahead == 0 && behind > 0 {
            let upstream = repository
                .find_reference(&upstream_name)
                .map_err(|e| e.to_string())?;
            let commit = upstream.peel_to_commit().map_err(|e| e.to_string())?;
            repository
                .reference(
                    &format!("refs/heads/{local}"),
                    commit.id(),
                    true,
                    "fast-forward Git sync",
                )
                .map_err(|e| format!("Não foi possível avançar a branch local: {e}"))?;
            repository
                .checkout_head(Some(git2::build::CheckoutBuilder::new().force()))
                .map_err(|e| {
                    format!("A branch avançou, mas não foi possível atualizar os arquivos: {e}")
                })?;
        } else if ahead > 0 && behind > 0 {
            let local_annotated = repository
                .find_annotated_commit(local_oid)
                .map_err(|e| e.to_string())?;
            let upstream = repository
                .refname_to_id(&upstream_name)
                .and_then(|oid| repository.find_annotated_commit(oid))
                .map_err(|e| e.to_string())?;
            let mut rebase_options = git2::RebaseOptions::new();
            let mut merge_options = MergeOptions::new();
            merge_options.file_favor(FileFavor::Union);
            rebase_options.merge_options(merge_options);
            let mut rebase = repository
                .rebase(
                    Some(&local_annotated),
                    Some(&upstream),
                    None,
                    Some(&mut rebase_options),
                )
                .map_err(|e| format!("Não foi possível iniciar rebase: {e}"))?;
            let signature = repository.signature().map_err(|_| {
                "Configure user.name e user.email no Git antes de sincronizar".to_string()
            })?;
            while let Some(result) = rebase.next() {
                let mut index = match repository.index() {
                    Ok(index) => index,
                    Err(error) => {
                        let _ = rebase.abort();
                        return Err(format!(
                            "Não foi possível ler o índice do merge; rebase abortado: {error}"
                        ));
                    }
                };
                if index.has_conflicts() {
                    match auto_resolve_conflicts(&repository, Path::new(root), &mut index) {
                        Ok(paths) => auto_resolved.extend(paths),
                        Err(error) => {
                            if let Err(abort_error) = rebase.abort() {
                                return Err(format!("Merge automático falhou ({error}) e o abort também falhou ({abort_error})."));
                            }
                            return Err(format!("Merge automático falhou e foi abortado: {error}"));
                        }
                    }
                } else if let Err(error) = result {
                    if let Err(abort_error) = rebase.abort() {
                        return Err(format!("Rebase falhou ({error}) e o abort também falhou ({abort_error}). Pare e recupere o Git manualmente."));
                    }
                    return Err(format!("Rebase abortado: {error}"));
                }
                if let Err(error) = rebase.commit(None, &signature, None) {
                    if let Err(abort_error) = rebase.abort() {
                        return Err(format!("Aplicar commit no rebase falhou ({error}) e o abort também falhou ({abort_error}). Pare e recupere o Git manualmente."));
                    }
                    return Err(format!(
                        "Não foi possível aplicar commit no rebase; operação abortada: {error}"
                    ));
                }
            }
            rebase
                .finish(Some(&signature))
                .map_err(|e| format!("Não foi possível finalizar o rebase: {e}"))?;
        }
    }
    let mut remote_obj = repository
        .find_remote(remote)
        .map_err(|e| format!("Remoto não configurado: {e}"))?;
    let mut options = PushOptions::new();
    options.remote_callbacks(credentials(username, token));
    let refspec = format!("refs/heads/{local}:refs/heads/{remote_branch}");
    remote_obj
        .push(&[refspec.as_str()], Some(&mut options))
        .map_err(|e| format!("Push recusado. Nada foi forçado; confira a prévia do remoto e tente novamente: {e}"))?;
    if let Ok(mut branch) = repository.find_branch(&local, BranchType::Local) {
        let _ = branch.set_upstream(Some(&format!("{remote}/{remote_branch}")));
    }
    Ok(GitSyncResult {
        local_branch: local,
        remote_branch,
        commit: committed,
        conflicts: auto_resolved,
        preview,
    })
}
