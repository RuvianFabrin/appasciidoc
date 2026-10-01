//! Trava opcional da interface. Ela não criptografa notas nem arquivos.

use rand::RngCore;
use scrypt::{scrypt, Params};
use subtle::ConstantTimeEq;
use tauri::AppHandle;
use zeroize::{Zeroize, Zeroizing};

use crate::config::{self, LockConfig};

const KEY_LEN: usize = 32;

fn params() -> Result<Params, String> {
    Params::new(15, 8, 1, KEY_LEN).map_err(|e| format!("Parâmetros da trava inválidos: {e}"))
}

fn to_hex(bytes: &[u8]) -> String {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let mut output = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        output.push(HEX[(byte >> 4) as usize] as char);
        output.push(HEX[(byte & 0x0f) as usize] as char);
    }
    output
}

fn from_hex(value: &str) -> Result<Vec<u8>, String> {
    if value.len() % 2 != 0 {
        return Err("Dados da trava inválidos".into());
    }
    value
        .as_bytes()
        .chunks_exact(2)
        .map(|pair| {
            let digit = |byte: u8| match byte {
                b'0'..=b'9' => Some(byte - b'0'),
                b'a'..=b'f' => Some(byte - b'a' + 10),
                b'A'..=b'F' => Some(byte - b'A' + 10),
                _ => None,
            };
            let high = digit(pair[0]).ok_or_else(|| "Dados da trava inválidos".to_string())?;
            let low = digit(pair[1]).ok_or_else(|| "Dados da trava inválidos".to_string())?;
            Ok((high << 4) | low)
        })
        .collect()
}

#[tauri::command]
pub fn lock_set(app: AppHandle, mut password: String) -> Result<(), String> {
    if password.chars().count() < 8 {
        password.zeroize();
        return Err("Use uma senha com pelo menos 8 caracteres".into());
    }
    let mut salt = [0_u8; 16];
    rand::rngs::OsRng.fill_bytes(&mut salt);
    let mut verifier = Zeroizing::new(vec![0_u8; KEY_LEN]);
    let derivation = scrypt(password.as_bytes(), &salt, &params()?, &mut verifier);
    password.zeroize();
    derivation.map_err(|e| format!("Não foi possível configurar a trava: {e}"))?;
    let mut current = config::read_config(app.clone());
    current.lock = LockConfig {
        enabled: true,
        salt: to_hex(&salt),
        verifier: to_hex(&verifier),
    };
    config::write_config(app, current)
}

#[tauri::command]
pub fn lock_verify(app: AppHandle, mut password: String) -> Result<bool, String> {
    let lock = config::read_config(app).lock;
    if !lock.enabled {
        password.zeroize();
        return Ok(true);
    }
    let salt = match from_hex(&lock.salt) {
        Ok(salt) => salt,
        Err(error) => {
            password.zeroize();
            return Err(error);
        }
    };
    let expected = match from_hex(&lock.verifier) {
        Ok(verifier) => verifier,
        Err(error) => {
            password.zeroize();
            return Err(error);
        }
    };
    let mut derived = Zeroizing::new(vec![0_u8; KEY_LEN]);
    let result = scrypt(password.as_bytes(), &salt, &params()?, &mut derived);
    password.zeroize();
    result.map_err(|e| format!("Não foi possível verificar a senha: {e}"))?;
    if expected.len() != KEY_LEN {
        return Err("Dados da trava inválidos".into());
    }
    Ok(bool::from(expected.as_slice().ct_eq(derived.as_slice())))
}

#[tauri::command]
pub fn lock_clear(app: AppHandle) -> Result<(), String> {
    let mut current = config::read_config(app.clone());
    current.lock = LockConfig::default();
    config::write_config(app, current)
}
