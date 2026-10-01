// Sem janela de console no Windows em build de release.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    appasciidoc_lib::run();
}
