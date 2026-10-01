//! Exportação de PDF (tarefas 55–57).
//!
//! - `print_to_pdf` — renderiza o HTML de impressão numa janela oculta e grava
//!   um PDF direto no caminho escolhido, sem diálogo. Windows via WebView2
//!   `PrintToPdf`; Linux via WebKitGTK `WebKitPrintOperation`. Onde não há
//!   implementação nativa, devolve erro e o front-end usa o caminho antigo
//!   (`window.print()` num iframe).
//! - `add_pdf_outline` — abre um PDF já gravado e injeta uma árvore de
//!   marcadores (`/Outlines`) a partir dos títulos, casando cada título com a
//!   página onde o texto aparece (tarefa 57). Puro Rust (`lopdf`).

use serde::Deserialize;

#[derive(Deserialize, Clone)]
pub struct Heading {
    pub text: String,
    /// 1 = seção de topo, 2 = subseção, …
    pub level: u32,
}

// ------------------------------------------------------------------ 57: outline

/// Minúsculas, espaços colapsados e acentos latinos removidos — para casar o
/// título com o texto extraído do PDF mesmo com pequenas diferenças.
fn norm(s: &str) -> String {
    let folded: String = s
        .to_lowercase()
        .chars()
        .map(|c| match c {
            'á' | 'à' | 'â' | 'ã' | 'ä' => 'a',
            'é' | 'è' | 'ê' | 'ë' => 'e',
            'í' | 'ì' | 'î' | 'ï' => 'i',
            'ó' | 'ò' | 'ô' | 'õ' | 'ö' => 'o',
            'ú' | 'ù' | 'û' | 'ü' => 'u',
            'ç' => 'c',
            'ñ' => 'n',
            other => other,
        })
        .collect();
    folded.split_whitespace().collect::<Vec<_>>().join(" ")
}

/// Casa cada título com a 1ª página (índice 0-based) cujo texto o contém, sem
/// retroceder. Página não encontrada herda a do título anterior. Puro — testável.
fn resolve_pages(page_text: &[String], headings: &[Heading]) -> Vec<(String, u32, usize)> {
    let pages: Vec<String> = page_text.iter().map(|t| norm(t)).collect();
    let mut items = Vec::new();
    let mut cursor = 0usize;
    for h in headings {
        let needle = norm(&h.text);
        if needle.is_empty() {
            continue;
        }
        let found = pages
            .iter()
            .enumerate()
            .skip(cursor)
            .find(|(_, t)| t.contains(&needle))
            .map(|(i, _)| i);
        if let Some(i) = found {
            cursor = i;
        }
        items.push((h.text.clone(), h.level.max(1), found.unwrap_or(cursor)));
    }
    items
}

/// Injeta `/Outlines` no PDF em `path` a partir de `headings`.
#[tauri::command]
pub fn add_pdf_outline(path: String, headings: Vec<Heading>) -> Result<(), String> {
    use lopdf::{Dictionary, Document, Object};

    if headings.is_empty() {
        return Ok(());
    }

    let mut doc = Document::load(&path).map_err(|e| format!("não abriu o PDF: {e}"))?;
    let pages: Vec<(u32, lopdf::ObjectId)> = doc.get_pages().into_iter().collect();
    if pages.is_empty() {
        return Err("PDF sem páginas".into());
    }

    // texto cru de cada página (o `resolve_pages` normaliza)
    let page_text: Vec<String> = pages
        .iter()
        .map(|(n, _)| doc.extract_text(&[*n]).unwrap_or_default())
        .collect();

    let page_ref_of = |idx: usize| Object::Reference(pages[idx.min(pages.len() - 1)].1);

    // 1º passo: resolve (título, nível, página)
    let items = resolve_pages(&page_text, &headings);
    if items.is_empty() {
        return Ok(());
    }

    // 2º passo: cria os objetos de item (encadeados) e monta a hierarquia por nível
    let outlines_id = doc.new_object_id();
    let item_ids: Vec<lopdf::ObjectId> = items.iter().map(|_| doc.new_object_id()).collect();

    // pilha de (nível, id) para achar o pai de cada item
    let mut stack: Vec<(u32, lopdf::ObjectId)> = Vec::new();
    // filhos por pai (id do pai, ou None para a raiz)
    let mut children: std::collections::HashMap<Option<lopdf::ObjectId>, Vec<usize>> =
        std::collections::HashMap::new();
    let mut parent_of: Vec<Option<lopdf::ObjectId>> = vec![None; items.len()];

    for (idx, (_t, level, _p)) in items.iter().enumerate() {
        while stack.last().map(|(l, _)| *l >= *level).unwrap_or(false) {
            stack.pop();
        }
        let parent = stack.last().map(|(_, id)| *id);
        parent_of[idx] = parent;
        children.entry(parent).or_default().push(idx);
        stack.push((*level, item_ids[idx]));
    }

    // grava cada item
    for (idx, (title, _level, page)) in items.iter().enumerate() {
        let sibs = &children[&parent_of[idx]];
        let pos = sibs.iter().position(|&i| i == idx).unwrap();
        let mut d = Dictionary::new();
        d.set("Title", Object::string_literal(title.as_str()));
        d.set(
            "Parent",
            Object::Reference(parent_of[idx].unwrap_or(outlines_id)),
        );
        if pos > 0 {
            d.set("Prev", Object::Reference(item_ids[sibs[pos - 1]]));
        }
        if pos + 1 < sibs.len() {
            d.set("Next", Object::Reference(item_ids[sibs[pos + 1]]));
        }
        let kids = children
            .get(&Some(item_ids[idx]))
            .cloned()
            .unwrap_or_default();
        if let (Some(&f), Some(&l)) = (kids.first(), kids.last()) {
            d.set("First", Object::Reference(item_ids[f]));
            d.set("Last", Object::Reference(item_ids[l]));
            d.set("Count", Object::Integer(-(kids.len() as i64)));
        }
        d.set(
            "Dest",
            Object::Array(vec![page_ref_of(*page), Object::Name(b"Fit".to_vec())]),
        );
        doc.objects.insert(item_ids[idx], Object::Dictionary(d));
    }

    // objeto raiz /Outlines
    let roots = &children[&None];
    let mut outline = Dictionary::new();
    outline.set("Type", Object::Name(b"Outlines".to_vec()));
    if let (Some(&f), Some(&l)) = (roots.first(), roots.last()) {
        outline.set("First", Object::Reference(item_ids[f]));
        outline.set("Last", Object::Reference(item_ids[l]));
    }
    outline.set("Count", Object::Integer(roots.len() as i64));
    doc.objects.insert(outlines_id, Object::Dictionary(outline));

    doc.catalog_mut()
        .map_err(|e| format!("catálogo inválido: {e}"))?
        .set("Outlines", Object::Reference(outlines_id));

    doc.save(&path)
        .map_err(|e| format!("não gravou o PDF: {e}"))?;
    Ok(())
}

// --------------------------------------------------------- 55/56: print_to_pdf

/// Grava um PDF do `html` de impressão direto em `out_path`, sem diálogo.
#[tauri::command]
pub async fn print_to_pdf(
    app: tauri::AppHandle,
    html: String,
    out_path: String,
) -> Result<(), String> {
    #[cfg(windows)]
    {
        windows_impl::print(app, html, out_path).await
    }
    #[cfg(target_os = "linux")]
    {
        linux_impl::print(app, html, out_path)
    }
    #[cfg(not(any(windows, target_os = "linux")))]
    {
        let _ = (app, html, out_path);
        Err("print_to_pdf nativo não disponível nesta plataforma".into())
    }
}

// ---- Windows: WebView2 PrintToPdf numa janela oculta -----------------------

#[cfg(windows)]
mod windows_impl {
    use std::sync::mpsc;
    use std::time::{SystemTime, UNIX_EPOCH};

    use tauri::{Url, WebviewUrl, WebviewWindowBuilder};
    use webview2_com::Microsoft::Web::WebView2::Win32::{
        ICoreWebView2Environment6, ICoreWebView2_7,
    };
    use webview2_com::{NavigationCompletedEventHandler, PrintToPdfCompletedHandler};
    use windows::core::{Interface, HSTRING, PCWSTR};

    pub async fn print(
        app: tauri::AppHandle,
        html: String,
        out_path: String,
    ) -> Result<(), String> {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0);
        let tmp = std::env::temp_dir().join(format!("appasciidoc-print-{nanos}.html"));
        std::fs::write(&tmp, html).map_err(|e| format!("temp: {e}"))?;
        let file_url = Url::from_file_path(&tmp)
            .map_err(|_| "url do temp".to_string())?
            .to_string();

        let label = format!("pdf-print-{nanos}");
        let win = WebviewWindowBuilder::new(
            &app,
            &label,
            WebviewUrl::External(
                "about:blank"
                    .parse()
                    .map_err(|_| "about:blank".to_string())?,
            ),
        )
        .visible(false)
        .title("Exportando PDF")
        .build()
        .map_err(|e| format!("janela: {e}"))?;

        let (tx, rx) = mpsc::channel::<Result<(), String>>();
        let out = out_path.clone();

        win.with_webview(move |pw| unsafe {
            let core = match pw.controller().CoreWebView2() {
                Ok(c) => c,
                Err(e) => {
                    let _ = tx.send(Err(format!("CoreWebView2: {e}")));
                    return;
                }
            };
            let core7: ICoreWebView2_7 = match core.cast() {
                Ok(c) => c,
                Err(e) => {
                    let _ = tx.send(Err(format!("ICoreWebView2_7: {e}")));
                    return;
                }
            };
            let env6: Result<ICoreWebView2Environment6, _> = pw.environment().cast();

            // registra o handler ANTES de navegar (evita perder o evento)
            let tx2 = tx.clone();
            let out2 = out.clone();
            let handler = NavigationCompletedEventHandler::create(Box::new(move |_s, _a| {
                let settings = env6
                    .as_ref()
                    .ok()
                    .and_then(|e| e.CreatePrintSettings().ok());
                if let Some(s) = &settings {
                    let _ = s.SetShouldPrintBackgrounds(true);
                }
                let path = HSTRING::from(out2.as_str());
                let tx3 = tx2.clone();
                let done = PrintToPdfCompletedHandler::create(Box::new(move |hr, ok| {
                    let r = hr.map_err(|e| format!("PrintToPdf: {e}")).and_then(|()| {
                        if ok {
                            Ok(())
                        } else {
                            Err("PrintToPdf retornou falha".into())
                        }
                    });
                    let _ = tx3.send(r);
                    Ok(())
                }));
                let _ = core7.PrintToPdf(PCWSTR(path.as_ptr()), settings.as_ref(), &done);
                Ok(())
            }));
            let mut token: i64 = 0;
            if let Err(e) = core.add_NavigationCompleted(&handler, &mut token) {
                let _ = tx.send(Err(format!("add_NavigationCompleted: {e}")));
                return;
            }
            let nav = HSTRING::from(file_url.as_str());
            if let Err(e) = core.Navigate(PCWSTR(nav.as_ptr())) {
                let _ = tx.send(Err(format!("Navigate: {e}")));
            }
        })
        .map_err(|e| format!("with_webview: {e}"))?;

        // espera o resultado (com teto de tempo), sem travar o executor
        let res = tauri::async_runtime::spawn_blocking(move || {
            rx.recv_timeout(std::time::Duration::from_secs(30))
                .unwrap_or_else(|_| Err("tempo esgotado ao gerar o PDF".into()))
        })
        .await
        .map_err(|e| format!("join: {e}"))?;

        let _ = win.close();
        let _ = std::fs::remove_file(&tmp);
        res
    }
}

// ---- Linux: WebKitGTK WebKitPrintOperation (export para arquivo) ----------
//
// AVISO: este bloco só compila no Linux (precisa de `libwebkit2gtk-4.1-dev`).
// Não foi possível compilá-lo no ambiente de desenvolvimento (Windows) — validar
// no build Linux.

#[cfg(target_os = "linux")]
mod linux_impl {
    pub fn print(app: tauri::AppHandle, html: String, out_path: String) -> Result<(), String> {
        use std::sync::mpsc;
        use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};
        use webkit2gtk::{PrintOperation, PrintOperationExt, WebViewExt};

        let nanos = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0);
        let tmp = std::env::temp_dir().join(format!("appasciidoc-print-{nanos}.html"));
        std::fs::write(&tmp, html).map_err(|e| format!("temp: {e}"))?;
        let url = format!("file://{}", tmp.display());

        let label = format!("pdf-print-{nanos}");
        let win = WebviewWindowBuilder::new(
            &app,
            &label,
            WebviewUrl::External(url.parse().map_err(|_| "url".to_string())?),
        )
        .visible(false)
        .build()
        .map_err(|e| format!("janela: {e}"))?;

        let (tx, rx) = mpsc::channel::<Result<(), String>>();
        let out = out_path.clone();
        win.with_webview(move |pw| {
            let wv = pw.inner();
            let out2 = out.clone();
            let tx2 = tx.clone();
            wv.connect_load_changed(move |wv, event| {
                if event == webkit2gtk::LoadEvent::Finished {
                    let settings = gtk::PrintSettings::new();
                    settings.set(
                        gtk::PRINT_SETTINGS_OUTPUT_URI,
                        Some(&format!("file://{out2}")),
                    );
                    settings.set("output-file-format", Some("pdf"));
                    let op = PrintOperation::new(wv);
                    op.set_print_settings(&settings);
                    let r = match op.print() {
                        _ => Ok(()),
                    };
                    let _ = tx2.send(r);
                }
            });
        })
        .map_err(|e| format!("with_webview: {e}"))?;

        let res = rx
            .recv_timeout(std::time::Duration::from_secs(30))
            .unwrap_or_else(|_| Err("tempo esgotado".into()));
        let _ = win.close();
        let _ = std::fs::remove_file(&tmp);
        res
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn h(text: &str, level: u32) -> Heading {
        Heading {
            text: text.into(),
            level,
        }
    }

    #[test]
    fn resolve_pages_matches_and_holds_cursor() {
        let pages = vec![
            "capa introducao".into(),
            "  metodos  e  materiais ".into(),
            "resultados discussao".into(),
        ];
        let items = resolve_pages(
            &pages,
            &[
                h("Introdução", 1),
                h("Métodos e materiais", 2),
                h("Resultados", 1),
                h("Seção fantasma", 2),
            ],
        );
        assert_eq!(items[0], ("Introdução".into(), 1, 0));
        assert_eq!(items[1], ("Métodos e materiais".into(), 2, 1));
        assert_eq!(items[2], ("Resultados".into(), 1, 2));
        // não encontrado herda a página do anterior, sem retroceder
        assert_eq!(items[3], ("Seção fantasma".into(), 2, 2));
    }

    #[test]
    fn resolve_pages_skips_empty_titles_and_clamps_level_zero() {
        let items = resolve_pages(&["algo".into()], &[h("", 1), h("Algo", 0)]);
        assert_eq!(items.len(), 1);
        assert_eq!(items[0].1, 1); // nível 0 vira 1
    }
}
