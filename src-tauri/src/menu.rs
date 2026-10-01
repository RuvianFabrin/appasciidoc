//! Menu de aplicativo nativo (tarefa 63).
//!
//! Os itens personalizados **não** levam acelerador: os atalhos continuam sendo
//! tratados no front-end (`useKeybindings`), e um acelerador nativo dispararia o
//! evento em duplicata. Os itens de edição (recortar/copiar/colar/selecionar)
//! são `PredefinedMenuItem` — o próprio sistema cuida deles no webview em foco.
//!
//! Ao clicar num item, emitimos o evento `menu` (com o id do item) para a janela
//! em foco; o front-end mapeia o id para o comando correspondente.

use tauri::menu::{Menu, MenuItemBuilder, PredefinedMenuItem, SubmenuBuilder};
use tauri::{AppHandle, Emitter, Manager, Runtime};

struct Labels {
    file: &'static str,
    edit: &'static str,
    view: &'static str,
    go: &'static str,
    help: &'static str,
    new_file: &'static str,
    new_window: &'static str,
    open_file: &'static str,
    open_folder: &'static str,
    save: &'static str,
    save_as: &'static str,
    reload: &'static str,
    export_html: &'static str,
    export_pdf: &'static str,
    close_tab: &'static str,
    close_window: &'static str,
    undo: &'static str,
    redo: &'static str,
    cut: &'static str,
    copy: &'static str,
    paste: &'static str,
    select_all: &'static str,
    preview: &'static str,
    inline: &'static str,
    wrap: &'static str,
    line_numbers: &'static str,
    back: &'static str,
    forward: &'static str,
    quick_open: &'static str,
    palette: &'static str,
    insert_link: &'static str,
    unresolved: &'static str,
    about: &'static str,
}

fn labels(language: &str) -> Labels {
    match language {
        "en" => Labels {
            file: "File",
            edit: "Edit",
            view: "View",
            go: "Go",
            help: "Help",
            new_file: "New file",
            new_window: "New window",
            open_file: "Open file…",
            open_folder: "Open folder…",
            save: "Save",
            save_as: "Save as…",
            reload: "Reload from disk",
            export_html: "Export as HTML…",
            export_pdf: "Export as PDF…",
            close_tab: "Close tab",
            close_window: "Close window",
            undo: "Undo",
            redo: "Redo",
            cut: "Cut",
            copy: "Copy",
            paste: "Paste",
            select_all: "Select all",
            preview: "Toggle preview",
            inline: "Toggle inline / source mode",
            wrap: "Toggle line wrapping",
            line_numbers: "Toggle line numbers",
            back: "Back",
            forward: "Forward",
            quick_open: "Go to file…",
            palette: "Command palette…",
            insert_link: "Insert link to note…",
            unresolved: "Unresolved links",
            about: "About AppAsciiDoc",
        },
        "es" => Labels {
            file: "Archivo",
            edit: "Editar",
            view: "Ver",
            go: "Ir",
            help: "Ayuda",
            new_file: "Nuevo archivo",
            new_window: "Nueva ventana",
            open_file: "Abrir archivo…",
            open_folder: "Abrir carpeta…",
            save: "Guardar",
            save_as: "Guardar como…",
            reload: "Recargar desde el disco",
            export_html: "Exportar como HTML…",
            export_pdf: "Exportar como PDF…",
            close_tab: "Cerrar pestaña",
            close_window: "Cerrar ventana",
            undo: "Deshacer",
            redo: "Rehacer",
            cut: "Cortar",
            copy: "Copiar",
            paste: "Pegar",
            select_all: "Seleccionar todo",
            preview: "Alternar vista previa",
            inline: "Alternar modo en línea / fuente",
            wrap: "Alternar ajuste de línea",
            line_numbers: "Alternar números de línea",
            back: "Atrás",
            forward: "Adelante",
            quick_open: "Ir a archivo…",
            palette: "Paleta de comandos…",
            insert_link: "Insertar enlace a una nota…",
            unresolved: "Enlaces sin resolver",
            about: "Acerca de AppAsciiDoc",
        },
        "zh" => Labels {
            file: "文件",
            edit: "编辑",
            view: "查看",
            go: "转到",
            help: "帮助",
            new_file: "新建文件",
            new_window: "新建窗口",
            open_file: "打开文件…",
            open_folder: "打开文件夹…",
            save: "保存",
            save_as: "另存为…",
            reload: "从磁盘重新加载",
            export_html: "导出为 HTML…",
            export_pdf: "导出为 PDF…",
            close_tab: "关闭标签页",
            close_window: "关闭窗口",
            undo: "撤销",
            redo: "重做",
            cut: "剪切",
            copy: "复制",
            paste: "粘贴",
            select_all: "全选",
            preview: "切换预览",
            inline: "切换行内 / 源码模式",
            wrap: "切换自动换行",
            line_numbers: "切换行号",
            back: "后退",
            forward: "前进",
            quick_open: "转到文件…",
            palette: "命令面板…",
            insert_link: "插入笔记链接…",
            unresolved: "未解析的链接",
            about: "关于 AppAsciiDoc",
        },
        _ => Labels {
            file: "Arquivo",
            edit: "Editar",
            view: "Ver",
            go: "Ir",
            help: "Ajuda",
            new_file: "Novo arquivo",
            new_window: "Nova janela",
            open_file: "Abrir arquivo…",
            open_folder: "Abrir pasta…",
            save: "Salvar",
            save_as: "Salvar como…",
            reload: "Recarregar do disco",
            export_html: "Exportar para HTML…",
            export_pdf: "Exportar para PDF…",
            close_tab: "Fechar aba",
            close_window: "Fechar janela",
            undo: "Desfazer",
            redo: "Refazer",
            cut: "Recortar",
            copy: "Copiar",
            paste: "Colar",
            select_all: "Selecionar tudo",
            preview: "Alternar pré-visualização",
            inline: "Alternar modo inline / fonte",
            wrap: "Alternar quebra de linha",
            line_numbers: "Alternar números de linha",
            back: "Voltar",
            forward: "Avançar",
            quick_open: "Ir para arquivo…",
            palette: "Paleta de comandos…",
            insert_link: "Inserir link para nota…",
            unresolved: "Links não resolvidos",
            about: "Sobre o AppAsciiDoc",
        },
    }
}

fn item<R: Runtime>(app: &AppHandle<R>, id: &str, label: &str) -> tauri::menu::MenuItem<R> {
    MenuItemBuilder::with_id(id, label)
        .build(app)
        .expect("item de menu")
}

pub fn install<R: Runtime>(app: &AppHandle<R>, language: &str) -> tauri::Result<()> {
    let l = labels(language);
    let file = SubmenuBuilder::new(app, l.file)
        .item(&item(app, "file.new", l.new_file))
        .item(&item(app, "file.newWindow", l.new_window))
        .separator()
        .item(&item(app, "file.open", l.open_file))
        .item(&item(app, "workspace.open", l.open_folder))
        .separator()
        .item(&item(app, "file.save", l.save))
        .item(&item(app, "file.saveAs", l.save_as))
        .item(&item(app, "file.reload", l.reload))
        .separator()
        .item(&item(app, "export.html", l.export_html))
        .item(&item(app, "export.pdf", l.export_pdf))
        .separator()
        .item(&item(app, "tab.close", l.close_tab))
        .item(&PredefinedMenuItem::close_window(
            app,
            Some(l.close_window),
        )?)
        .build()?;

    let edit = SubmenuBuilder::new(app, l.edit)
        .item(&PredefinedMenuItem::undo(app, Some(l.undo))?)
        .item(&PredefinedMenuItem::redo(app, Some(l.redo))?)
        .separator()
        .item(&PredefinedMenuItem::cut(app, Some(l.cut))?)
        .item(&PredefinedMenuItem::copy(app, Some(l.copy))?)
        .item(&PredefinedMenuItem::paste(app, Some(l.paste))?)
        .item(&PredefinedMenuItem::select_all(app, Some(l.select_all))?)
        .build()?;

    let view = SubmenuBuilder::new(app, l.view)
        .item(&item(app, "view.preview", l.preview))
        .item(&item(app, "view.inlineMode", l.inline))
        .separator()
        .item(&item(app, "view.wrap", l.wrap))
        .item(&item(app, "view.lineNumbers", l.line_numbers))
        .build()?;

    let go = SubmenuBuilder::new(app, l.go)
        .item(&item(app, "nav.back", l.back))
        .item(&item(app, "nav.forward", l.forward))
        .separator()
        .item(&item(app, "go.quickOpen", l.quick_open))
        .item(&item(app, "go.palette", l.palette))
        .separator()
        .item(&item(app, "link.insert", l.insert_link))
        .item(&item(app, "link.unresolved", l.unresolved))
        .build()?;

    let help = SubmenuBuilder::new(app, l.help)
        .item(&item(app, "help.about", l.about))
        .build()?;

    let menu = Menu::with_items(app, &[&file, &edit, &view, &go, &help])?;
    app.set_menu(menu)?;

    app.on_menu_event(|app, event| {
        let id = event.id().0.clone();
        let focused = app
            .webview_windows()
            .into_values()
            .find(|w| w.is_focused().unwrap_or(false));
        match focused {
            Some(w) => {
                let _ = w.emit("menu", id);
            }
            None => {
                let _ = app.emit("menu", id);
            }
        }
    });

    Ok(())
}
