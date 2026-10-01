use std::path::Path;

use git2::{IndexAddOption, Repository, RepositoryInitOptions, Status, StatusOptions};

use super::GitStatus;

fn open(root: &str) -> Result<Repository, String> {
    let path = Path::new(root);
    let repo = Repository::open(path)
        .map_err(|_| "Esta pasta ainda não é um repositório Git".to_string())?;
    let workdir = repo
        .workdir()
        .ok_or_else(|| "O Git não suporta repositório bare como workspace".to_string())?;
    let canonical_root = path
        .canonicalize()
        .map_err(|e| format!("Não foi possível acessar a pasta: {e}"))?;
    let canonical_workdir = workdir
        .canonicalize()
        .map_err(|e| format!("Não foi possível acessar o repositório: {e}"))?;
    if canonical_root != canonical_workdir {
        return Err("Abra a pasta raiz do repositório Git para sincronizá-la".into());
    }
    Ok(repo)
}

pub(super) fn open_for_remote(root: &str) -> Result<Repository, String> {
    open(root)
}

pub fn init(root: &str) -> Result<(), String> {
    let path = Path::new(root);
    if !path.is_dir() {
        return Err("A pasta do workspace não existe".into());
    }
    let mut options = RepositoryInitOptions::new();
    options.initial_head("main");
    let repo = Repository::init_opts(path, &options)
        .map_err(|e| format!("Não foi possível iniciar o Git: {e}"))?;
    repo.config()
        .and_then(|mut c| {
            c.set_bool("core.autocrlf", false)?;
            c.set_str("user.name", "AppAsciiDoc")?;
            c.set_str("user.email", "appasciidoc@users.noreply.github.com")
        })
        .map_err(|e| format!("Não foi possível configurar LF no repositório: {e}"))?;
    Ok(())
}

pub fn ensure_identity(repository: &Repository) -> Result<(), String> {
    let mut config = repository
        .config()
        .map_err(|e| format!("Não foi possível ler a configuração Git: {e}"))?;
    if config.get_string("user.name").is_err() {
        config
            .set_str("user.name", "AppAsciiDoc")
            .map_err(|e| format!("Não foi possível configurar o autor Git: {e}"))?;
    }
    if config.get_string("user.email").is_err() {
        config
            .set_str("user.email", "appasciidoc@users.noreply.github.com")
            .map_err(|e| format!("Não foi possível configurar o e-mail Git: {e}"))?;
    }
    Ok(())
}

pub fn status(root: &str) -> Result<GitStatus, String> {
    let repo = match open(root) {
        Ok(repo) => repo,
        Err(_) => {
            return Ok(GitStatus {
                initialized: false,
                branch: None,
                changed: 0,
                staged: 0,
                unstaged: 0,
                untracked: 0,
                ahead: 0,
                behind: 0,
            })
        }
    };
    let mut options = StatusOptions::new();
    options
        .include_untracked(true)
        .recurse_untracked_dirs(true)
        .include_ignored(false);
    let statuses = repo
        .statuses(Some(&mut options))
        .map_err(|e| format!("Não foi possível ler o estado Git: {e}"))?;
    let mut staged = 0;
    let mut unstaged = 0;
    let mut untracked = 0;
    for entry in statuses.iter() {
        let s = entry.status();
        if s.intersects(
            Status::INDEX_NEW
                | Status::INDEX_MODIFIED
                | Status::INDEX_DELETED
                | Status::INDEX_RENAMED
                | Status::INDEX_TYPECHANGE,
        ) {
            staged += 1;
        }
        if s.intersects(
            Status::WT_MODIFIED | Status::WT_DELETED | Status::WT_RENAMED | Status::WT_TYPECHANGE,
        ) {
            unstaged += 1;
        }
        if s.contains(Status::WT_NEW) {
            untracked += 1;
        }
    }
    let branch = repo
        .head()
        .ok()
        .and_then(|h| h.shorthand().map(ToOwned::to_owned));
    let (ahead, behind) = branch
        .as_deref()
        .and_then(|name| {
            let local = format!("refs/heads/{name}");
            let upstream = repo
                .find_branch(name, git2::BranchType::Local)
                .ok()?
                .upstream()
                .ok()?;
            let upstream_name = upstream.get().name()?.to_owned();
            let _ = local;
            repo.graph_ahead_behind(
                repo.refname_to_id(&format!("refs/heads/{name}")).ok()?,
                repo.refname_to_id(&upstream_name).ok()?,
            )
            .ok()
        })
        .unwrap_or((0, 0));
    Ok(GitStatus {
        initialized: true,
        branch,
        changed: staged + unstaged + untracked,
        staged,
        unstaged,
        untracked,
        ahead,
        behind,
    })
}

pub fn commit(root: &str, message: &str) -> Result<Option<String>, String> {
    let repo = open(root)?;
    if message.trim().is_empty() {
        return Err("Informe uma mensagem para o commit".into());
    }
    let mut index = repo
        .index()
        .map_err(|e| format!("Não foi possível abrir o índice Git: {e}"))?;
    index
        .add_all(["*"], IndexAddOption::DEFAULT, None)
        .map_err(|e| format!("Não foi possível preparar as alterações: {e}"))?;
    index
        .update_all(["*"], None)
        .map_err(|e| format!("Não foi possível preparar exclusões: {e}"))?;
    index
        .write()
        .map_err(|e| format!("Não foi possível gravar o índice Git: {e}"))?;
    let tree_id = index
        .write_tree()
        .map_err(|e| format!("Não foi possível criar a árvore Git: {e}"))?;
    let tree = repo
        .find_tree(tree_id)
        .map_err(|e| format!("Não foi possível ler a árvore Git: {e}"))?;
    let statuses = {
        let mut opts = StatusOptions::new();
        opts.include_untracked(true).recurse_untracked_dirs(true);
        repo.statuses(Some(&mut opts))
            .map_err(|e| format!("Não foi possível ler o estado Git: {e}"))?
            .is_empty()
    };
    if statuses {
        return Ok(None);
    }
    let signature = repo.signature().map_err(|_| {
        "Configure user.name e user.email no Git antes de criar commits".to_string()
    })?;
    let parent = repo.head().ok().and_then(|h| h.peel_to_commit().ok());
    let parents: Vec<&git2::Commit<'_>> = parent.iter().collect();
    let id = repo
        .commit(
            Some("HEAD"),
            &signature,
            &signature,
            message.trim(),
            &tree,
            &parents,
        )
        .map_err(|e| format!("Não foi possível criar o commit: {e}"))?;
    Ok(Some(id.to_string()))
}
