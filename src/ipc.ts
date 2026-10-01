/**
 * Camada unica e tipada sobre o IPC do Tauri.
 * Todo acesso ao nucleo Rust passa por aqui - nada de `invoke` solto pelos componentes.
 */
import { invoke } from '@tauri-apps/api/core';

/** Resposta do comando `ping` - usada no boot para provar que o IPC funciona. */
export interface AppInfo {
  name: string;
  version: string;
  tauriVersion: string;
  os: string;
}

export async function ping(): Promise<AppInfo> {
  return invoke<AppInfo>('ping');
}
