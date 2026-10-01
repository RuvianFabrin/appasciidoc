//! Índice do workspace (tarefa 35) e busca full-text (tarefa 36).
//!
//! Para cada `.adoc`: título, âncoras/IDs e links de saída (com linha e tipo,
//! para backlinks e relatório de links quebrados — Fase 5).

use std::fs;
use std::path::Path;

use serde::Serialize;
use walkdir::{DirEntry, WalkDir};

use crate::workspace::{is_adoc, norm};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OutLink {
    /// Alvo como escrito, sem o `#âncora`.
    pub target: String,
    pub anchor: Option<String>,
    pub line: usize,
    /// "xref" | "link" | "wikilink" | "ref"
    pub kind: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteInfo {
    pub path: String,
    pub title: String,
    /// IDs explícitos (`[[id]]`, `[#id]`, `anchor:id[]`) + auto-ids de seção.
    pub anchors: Vec<String>,
    pub out_links: Vec<OutLink>,
}

fn keep_dir(entry: &DirEntry) -> bool {
    if !entry.file_type().is_dir() {
        return true;
    }
    let name = entry.file_name().to_string_lossy();
    !(name.starts_with('.') || matches!(name.as_ref(), "node_modules" | "target"))
}

fn title_of(path: &Path, text: &str) -> String {
    for line in text.lines() {
        let t = line.trim_start();
        if let Some(rest) = t.strip_prefix("= ") {
            return rest.trim().to_string();
        }
        if !t.is_empty() && !t.starts_with(':') && !t.starts_with("//") {
            break;
        }
    }
    path.file_stem()
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or_default()
}

/// Auto-id de seção no estilo Asciidoctor (`idprefix='_'`, minúsculas, separador `_`).
fn slug(title: &str) -> String {
    let mut s = String::from("_");
    let mut prev_sep = true;
    for ch in title.trim().chars() {
        if ch.is_alphanumeric() {
            s.extend(ch.to_lowercase());
            prev_sep = false;
        } else if !prev_sep {
            s.push('_');
            prev_sep = true;
        }
    }
    while s.len() > 1 && s.ends_with('_') {
        s.pop();
    }
    s
}

fn split_anchor(raw: &str) -> (String, Option<String>) {
    match raw.split_once('#') {
        Some((t, a)) if !a.is_empty() => (t.trim().to_string(), Some(a.trim().to_string())),
        _ => (raw.trim().to_string(), None),
    }
}

fn scan_macro(line: &str, lineno: usize, name: &str, kind: &str, out: &mut Vec<OutLink>) {
    let mut rest = line;
    while let Some(i) = rest.find(name) {
        let after = &rest[i + name.len()..];
        let Some(b) = after.find('[') else { break };
        let raw = after[..b].trim();
        if !raw.is_empty() && !raw.contains(':') {
            let (target, anchor) = split_anchor(raw);
            out.push(OutLink {
                target,
                anchor,
                line: lineno,
                kind: kind.to_string(),
            });
        }
        rest = &after[b..];
    }
}

fn scan_refs(line: &str, lineno: usize, out: &mut Vec<OutLink>) {
    // <<id>> / <<id,texto>>
    let mut rest = line;
    while let Some(i) = rest.find("<<") {
        let after = &rest[i + 2..];
        let Some(j) = after.find(">>") else { break };
        let inner = after[..j].split(',').next().unwrap_or("").trim();
        if !inner.is_empty() {
            let (target, anchor) = split_anchor(inner);
            out.push(OutLink {
                target,
                anchor,
                line: lineno,
                kind: "ref".to_string(),
            });
        }
        rest = &after[j + 2..];
    }
}

fn scan_wikilinks(line: &str, lineno: usize, anchors: &mut Vec<String>, out: &mut Vec<OutLink>) {
    let trimmed = line.trim();
    // `[[id]]` sozinho na linha = âncora de bloco
    if let Some(inner) = trimmed
        .strip_prefix("[[")
        .and_then(|s| s.strip_suffix("]]"))
    {
        if !inner.contains("[[") && !inner.contains(' ') && !inner.contains('|') {
            anchors.push(inner.split(',').next().unwrap_or(inner).trim().to_string());
            return;
        }
    }
    // `[[alvo#anc|texto]]` inline = wikilink
    let mut rest = line;
    while let Some(i) = rest.find("[[") {
        let after = &rest[i + 2..];
        let Some(j) = after.find("]]") else { break };
        let inner = &after[..j];
        let core = inner.split('|').next().unwrap_or(inner).trim();
        if !core.is_empty() {
            let (target, anchor) = split_anchor(core);
            out.push(OutLink {
                target,
                anchor,
                line: lineno,
                kind: "wikilink".to_string(),
            });
        }
        rest = &after[j + 2..];
    }
}

fn extract(path: &Path, text: &str) -> NoteInfo {
    let mut anchors = Vec::new();
    let mut out_links = Vec::new();

    for (idx, line) in text.lines().enumerate() {
        let lineno = idx + 1;
        let trimmed = line.trim();

        // âncoras explícitas
        if let Some(inner) = trimmed.strip_prefix("[#").and_then(|s| s.strip_suffix(']')) {
            let id = inner
                .split([',', ' ', '.', '%'])
                .next()
                .unwrap_or(inner)
                .trim();
            if !id.is_empty() {
                anchors.push(id.to_string());
            }
        }
        if let Some(i) = line.find("anchor:") {
            let after = &line[i + 7..];
            if let Some(b) = after.find('[') {
                let id = after[..b].trim();
                if !id.is_empty() {
                    anchors.push(id.to_string());
                }
            }
        }

        // auto-id de seção (== .. ======)
        if let Some(rest) = trimmed.strip_prefix("==") {
            let level = rest.chars().take_while(|c| *c == '=').count();
            let title = rest[level..].trim();
            if !title.is_empty() {
                anchors.push(slug(title));
            }
        }

        // links de saída
        scan_refs(line, lineno, &mut out_links);
        scan_macro(line, lineno, "xref:", "xref", &mut out_links);
        scan_macro(line, lineno, "link:", "link", &mut out_links);
        scan_wikilinks(line, lineno, &mut anchors, &mut out_links);
    }

    anchors.sort();
    anchors.dedup();

    NoteInfo {
        path: norm(path),
        title: title_of(path, text),
        anchors,
        out_links,
    }
}

fn adoc_files(root: &str) -> impl Iterator<Item = DirEntry> {
    WalkDir::new(root)
        .into_iter()
        .filter_entry(keep_dir)
        .flatten()
        .filter(|e| e.file_type().is_file() && is_adoc(&e.file_name().to_string_lossy()))
}

#[tauri::command]
pub fn scan_workspace(root: String) -> Result<Vec<NoteInfo>, String> {
    let mut notes = Vec::new();
    for entry in adoc_files(&root) {
        if let Ok(text) = fs::read_to_string(entry.path()) {
            notes.push(extract(entry.path(), &text));
        }
    }
    notes.sort_by_key(|n| n.title.to_lowercase());
    Ok(notes)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchHit {
    pub path: String,
    pub line: usize,
    pub text: String,
}

#[tauri::command]
pub fn search_workspace(
    root: String,
    query: String,
    limit: usize,
) -> Result<Vec<SearchHit>, String> {
    let needle = query.to_lowercase();
    if needle.is_empty() {
        return Ok(Vec::new());
    }
    let mut hits = Vec::new();
    for entry in adoc_files(&root) {
        if hits.len() >= limit {
            break;
        }
        let Ok(text) = fs::read_to_string(entry.path()) else {
            continue;
        };
        for (i, line) in text.lines().enumerate() {
            if line.to_lowercase().contains(&needle) {
                hits.push(SearchHit {
                    path: norm(entry.path()),
                    line: i + 1,
                    text: line.trim().chars().take(200).collect(),
                });
                if hits.len() >= limit {
                    break;
                }
            }
        }
    }
    Ok(hits)
}
