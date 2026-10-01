//! Cifras de arquivos com o formato interoperável age (senha humana/scrypt).

use std::fs::{self, OpenOptions};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use age::secrecy::SecretString;
use age::{Decryptor, Encryptor, Identity};
use tauri::State;
use zeroize::{Zeroize, Zeroizing};

use crate::git::GitState;

fn write_new(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let mut options = OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    let mut file = options
        .open(path)
        .map_err(|e| format!("Não foi possível criar o arquivo de saída: {e}"))?;
    if let Err(e) = file.write_all(bytes).and_then(|_| file.sync_all()) {
        let _ = fs::remove_file(path);
        return Err(format!("Falha ao gravar arquivo de saída: {e}"));
    }
    Ok(())
}

fn write_replace(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let dir = path
        .parent()
        .ok_or_else(|| "Caminho de saída inválido".to_string())?;
    let suffix = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or_default();
    let temp = dir.join(format!(".age-{}-{suffix}.tmp", std::process::id()));
    write_new(&temp, bytes)?;
    if let Err(error) = crate::fs::replace_file(&temp, path) {
        let _ = fs::remove_file(&temp);
        return Err(format!(
            "Não foi possível substituir o arquivo age: {error}"
        ));
    }
    Ok(())
}

fn encrypted_path(path: &Path) -> Result<PathBuf, String> {
    let mut name = path
        .file_name()
        .ok_or_else(|| "Caminho de arquivo inválido".to_string())?
        .to_os_string();
    name.push(".age");
    Ok(path.with_file_name(name))
}

#[tauri::command]
pub fn age_encrypt_file(
    state: State<'_, GitState>,
    path: String,
    passphrase: String,
) -> Result<String, String> {
    let _guard = state
        .operation
        .lock()
        .map_err(|_| "Git ficou indisponível".to_string())?;
    if passphrase.chars().count() < 8 {
        return Err("Use uma senha com pelo menos 8 caracteres".into());
    }
    let source = PathBuf::from(&path);
    if !source.is_file()
        || source
            .extension()
            .is_some_and(|e| e.eq_ignore_ascii_case("age"))
    {
        return Err("Selecione um arquivo existente que ainda não esteja criptografado".into());
    }
    let dest = encrypted_path(&source)?;
    let mut plaintext = Zeroizing::new(
        fs::read(&source).map_err(|e| format!("Não foi possível ler o arquivo: {e}"))?,
    );
    let secret = SecretString::from(passphrase);
    let encryptor = Encryptor::with_user_passphrase(secret);
    let mut ciphertext = Vec::new();
    {
        let mut writer = encryptor
            .wrap_output(&mut ciphertext)
            .map_err(|e| format!("Não foi possível iniciar a criptografia age: {e}"))?;
        writer
            .write_all(&plaintext)
            .map_err(|e| format!("Falha ao criptografar: {e}"))?;
        writer
            .finish()
            .map_err(|e| format!("Falha ao finalizar a criptografia: {e}"))?;
    }
    plaintext.zeroize();
    if dest.exists() {
        write_replace(&dest, &ciphertext)?;
    } else {
        write_new(&dest, &ciphertext)?;
    }
    fs::remove_file(&source).map_err(|e| {
        let _ = fs::remove_file(&dest);
        format!("A cópia criptografada foi removida porque não foi possível apagar o original: {e}")
    })?;
    Ok(dest.to_string_lossy().replace('\\', "/"))
}

#[tauri::command]
pub fn age_decrypt_file(
    state: State<'_, GitState>,
    path: String,
    passphrase: String,
) -> Result<String, String> {
    let _guard = state
        .operation
        .lock()
        .map_err(|_| "Git ficou indisponível".to_string())?;
    let source = PathBuf::from(&path);
    if !source.is_file()
        || !source
            .extension()
            .is_some_and(|e| e.eq_ignore_ascii_case("age"))
    {
        return Err("Selecione um arquivo .age existente".into());
    }
    let name = source
        .file_stem()
        .ok_or_else(|| "Nome de arquivo .age inválido".to_string())?;
    let dest = source.with_file_name(name);
    if dest.exists() {
        return Err(format!(
            "O arquivo descriptografado já existe: {}",
            dest.display()
        ));
    }

    let ciphertext =
        fs::read(&source).map_err(|e| format!("Não foi possível ler o arquivo .age: {e}"))?;
    let decryptor =
        Decryptor::new(&ciphertext[..]).map_err(|e| format!("Arquivo age inválido: {e}"))?;
    let identity = age::scrypt::Identity::new(SecretString::from(passphrase));
    let mut reader = decryptor
        .decrypt(std::iter::once(&identity as &dyn Identity))
        .map_err(|e| format!("Senha incorreta ou arquivo danificado: {e}"))?;
    let mut plaintext = Zeroizing::new(Vec::new());
    reader
        .read_to_end(&mut plaintext)
        .map_err(|e| format!("Falha ao descriptografar: {e}"))?;
    exclude_plaintext_from_git(&dest)?;
    write_new(&dest, &plaintext)?;
    plaintext.zeroize();
    // Mantém o .age versionado; o texto aberto é uma cópia local, ignorada pelo Git.
    Ok(dest.to_string_lossy().replace('\\', "/"))
}

fn exclude_plaintext_from_git(path: &Path) -> Result<(), String> {
    let Ok(repo) = git2::Repository::discover(path) else {
        return Ok(());
    };
    let workdir = repo
        .workdir()
        .ok_or_else(|| "Não é possível descriptografar para um repositório Git bare".to_string())?;
    let parent = path
        .parent()
        .ok_or_else(|| "Caminho de saída inválido".to_string())?;
    let canonical_parent = parent
        .canonicalize()
        .map_err(|e| format!("Não foi possível acessar a pasta: {e}"))?;
    let output_path = canonical_parent.join(
        path.file_name()
            .ok_or_else(|| "Nome de arquivo inválido".to_string())?,
    );
    let relative = output_path
        .strip_prefix(workdir)
        .map_err(|_| "O arquivo descriptografado ficaria fora do workspace Git".to_string())?;
    if repo
        .head()
        .ok()
        .and_then(|head| head.peel_to_tree().ok())
        .is_some_and(|tree| tree.get_path(relative).is_ok())
    {
        return Err(
            "Este nome de arquivo ainda está versionado como texto puro. Remova essa versão do Git antes de descriptografar."
                .into(),
        );
    }
    if repo
        .index()
        .ok()
        .and_then(|index| index.get_path(relative, 0))
        .is_some()
    {
        return Err(
            "Este arquivo já está preparado no índice Git como texto puro. Remova-o do índice antes de descriptografar.".into(),
        );
    }
    let relative = relative.to_string_lossy().replace('\\', "/");
    let rule = format!(
        "/{}",
        relative
            .chars()
            .enumerate()
            .map(|(i, ch)| {
                if matches!(ch, '\\' | '*' | '?' | '[' | ']') || (i == 0 && matches!(ch, '!' | '#'))
                {
                    format!("\\{ch}")
                } else {
                    ch.to_string()
                }
            })
            .collect::<String>()
    );
    let exclude = repo.path().join("info").join("exclude");
    let current = fs::read_to_string(&exclude).unwrap_or_default();
    if current.lines().any(|line| line.trim_end() == rule) {
        return Ok(());
    }
    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&exclude)
        .map_err(|e| format!("Não foi possível proteger o texto puro do Git: {e}"))?;
    if !current.is_empty() && !current.ends_with('\n') {
        file.write_all(b"\n").map_err(|e| e.to_string())?;
    }
    writeln!(file, "{rule}")
        .map_err(|e| format!("Não foi possível proteger o texto puro do Git: {e}"))
}
