use git2::{Cred, CredentialType, Direction, RemoteCallbacks, Repository};

use super::repo;

pub(super) fn validate_url(url: &str) -> Result<(), String> {
    let url = url.trim();
    if !(url.starts_with("https://") || url.starts_with("http://")) || url.contains('@') {
        return Err("Use uma URL HTTPS sem usuário ou token embutido nela".into());
    }
    Ok(())
}

pub fn set(root: &str, name: &str, url: &str) -> Result<(), String> {
    validate_url(url)?;
    let repository = repo::open_for_remote(root)?;
    if repository.find_remote(name).is_ok() {
        repository
            .remote_set_url(name, url.trim())
            .map_err(|e| format!("Não foi possível atualizar o remoto: {e}"))
    } else {
        repository
            .remote(name, url.trim())
            .map(|_| ())
            .map_err(|e| format!("Não foi possível adicionar o remoto: {e}"))
    }
}

pub fn test(_root: &str, name: &str, url: &str, username: &str, token: &str) -> Result<(), String> {
    validate_url(url)?;
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or_default();
    let temporary = std::env::temp_dir().join(format!(
        "appasciidoc-git-check-{}-{stamp}",
        std::process::id()
    ));
    std::fs::create_dir_all(&temporary)
        .map_err(|e| format!("Não foi possível preparar teste de conexão: {e}"))?;
    let result = (|| {
        let repository = Repository::init_bare(&temporary)
            .map_err(|e| format!("Não foi possível preparar teste de conexão: {e}"))?;
        let mut remote = repository
            .remote_anonymous(url.trim())
            .map_err(|e| format!("URL de remoto inválida: {e}"))?;
        let username = if username.trim().is_empty() {
            "git".to_string()
        } else {
            username.trim().to_string()
        };
        let token = token.to_string();
        let mut callbacks = RemoteCallbacks::new();
        callbacks.credentials(move |_url, username_from_url, allowed| {
            if !token.is_empty() && allowed.contains(CredentialType::USER_PASS_PLAINTEXT) {
                Cred::userpass_plaintext(username_from_url.unwrap_or(&username), &token)
            } else {
                Cred::default()
            }
        });
        remote
            .connect_auth(Direction::Fetch, Some(callbacks), None)
            .map_err(|e| format!("Falha ao conectar ao remoto '{name}': {e}"))?;
        remote
            .disconnect()
            .map_err(|e| format!("Conectado, mas não foi possível encerrar a conexão: {e}"))?;
        Ok(())
    })();
    let _ = std::fs::remove_dir_all(&temporary);
    result.map_err(|e: String| format!("Falha ao testar remoto '{name}': {e}"))
}
