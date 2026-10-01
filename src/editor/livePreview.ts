/**
 * Modo inline estilo Typora/Obsidian.
 *
 * Um ViewPlugin varre as linhas visíveis e monta um conjunto de decorations que
 * escondem os marcadores e aplicam o estilo, reexibindo a marcação na linha do
 * cursor. Cobre (Fase 3): títulos (24), negrito/itálico/mono/destaque (22/23),
 * listas e checkboxes (25). Fase 11: sobrescrito/subscrito (85), papéis inline
 * (86), passagem literal (87), substituições tipográficas (89), notas de rodapé
 * (91), macros kbd/btn/menu (92), comentários de bloco (111).
 */
import { type EditorState, Range, StateField, type Text } from '@codemirror/state';
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
} from '@codemirror/view';
import { CodeBlockWidget, FragmentWidget, engineRefresh } from './blockWidgets';
import { getNotePath } from './imageInsert';
import { assetUrl } from '../fs/assets';
import { openRelative, resolveRef } from './linkContext';
import i18n from '../i18n';

// ---------------- widgets ----------------

class LinkWidget extends WidgetType {
  constructor(
    readonly label: string,
    readonly href: string,
  ) {
    super();
  }
  override eq(o: LinkWidget) {
    return o.label === this.label && o.href === this.href;
  }
  override toDOM() {
    const a = document.createElement('span');
    const r = resolveRef(this.href);
    a.className =
      'cm-adoc-link cm-adoc-wikilink' + (!r.external && !r.path ? ' cm-adoc-link--broken' : '');
    a.dataset.href = this.href;
    a.textContent = this.label;
    return a;
  }
  override ignoreEvent() {
    return false;
  }
}

class ImageWidget extends WidgetType {
  constructor(
    readonly ref: string,
    readonly alt: string,
    readonly block: boolean,
  ) {
    super();
  }
  override eq(o: ImageWidget) {
    return o.ref === this.ref && o.alt === this.alt && o.block === this.block;
  }
  override toDOM() {
    let retried = false;
    const make = (): HTMLImageElement => {
      const img = document.createElement('img');
      img.className = this.block ? 'cm-adoc-img cm-adoc-img--block' : 'cm-adoc-img';
      img.alt = this.alt || this.ref;
      const used = assetUrl(getNotePath(), this.ref);
      img.src = used;
      img.addEventListener('error', () => {
        // corrida na 1ª abertura: caminho da nota ainda não estava pronto → 1 retry
        if (!retried && assetUrl(getNotePath(), this.ref) !== used) {
          retried = true;
          img.replaceWith(make());
          return;
        }
        const ph = document.createElement('span');
        ph.className = 'cm-adoc-img-missing';
        ph.textContent = `🖼 ${this.alt || this.ref}`;
        img.replaceWith(ph);
      });
      return img;
    };
    return make();
  }
  override ignoreEvent() {
    return true;
  }
}

class BulletWidget extends WidgetType {
  override eq() {
    return true;
  }
  override toDOM() {
    const s = document.createElement('span');
    s.className = 'cm-adoc-bullet';
    s.textContent = '•';
    return s;
  }
}
const bulletWidget = new BulletWidget();

class CheckboxWidget extends WidgetType {
  constructor(
    readonly checked: boolean,
    readonly from: number,
    readonly to: number,
  ) {
    super();
  }
  override eq(other: CheckboxWidget) {
    return other.checked === this.checked && other.from === this.from;
  }
  override toDOM(view: EditorView) {
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.className = 'cm-adoc-checkbox';
    box.checked = this.checked;
    box.addEventListener('mousedown', (e) => e.preventDefault());
    box.addEventListener('change', () => {
      view.dispatch({
        changes: { from: this.from, to: this.to, insert: this.checked ? '[ ]' : '[x]' },
      });
    });
    return box;
  }
  override ignoreEvent() {
    return false;
  }
}

/** Substitui um trecho por um texto curto (símbolo tipográfico, rótulo, …). */
class TextWidget extends WidgetType {
  constructor(
    readonly text: string,
    readonly cls: string,
  ) {
    super();
  }
  override eq(other: TextWidget) {
    return other.text === this.text && other.cls === this.cls;
  }
  override toDOM() {
    const s = document.createElement('span');
    s.className = this.cls;
    s.textContent = this.text;
    return s;
  }
}

/** icon:nome[opts] → glifo Material Symbols (tarefa 93). */
const ICON_ALIASES: Record<string, string> = {
  heart: 'favorite',
  star: 'star',
  check: 'check',
  'check-circle': 'check_circle',
  times: 'close',
  xmark: 'close',
  close: 'close',
  info: 'info',
  'info-circle': 'info',
  warning: 'warning',
  'exclamation-triangle': 'warning',
  bell: 'notifications',
  home: 'home',
  cog: 'settings',
  gear: 'settings',
  search: 'search',
  download: 'download',
  upload: 'upload',
  trash: 'delete',
  'trash-alt': 'delete',
  edit: 'edit',
  pencil: 'edit',
  file: 'description',
  folder: 'folder',
  link: 'link',
  github: 'code',
  'external-link': 'open_in_new',
  clock: 'schedule',
  calendar: 'calendar_month',
  user: 'person',
  users: 'group',
  lightbulb: 'lightbulb',
  bookmark: 'bookmark',
  tag: 'sell',
  lock: 'lock',
  unlock: 'lock_open',
  eye: 'visibility',
  'thumbs-up': 'thumb_up',
  'thumbs-down': 'thumb_down',
  fire: 'local_fire_department',
  bolt: 'bolt',
  code: 'code',
  terminal: 'terminal',
  bug: 'bug_report',
  rocket: 'rocket_launch',
};

class IconWidget extends WidgetType {
  constructor(
    readonly name: string,
    readonly size: number,
    readonly role: string,
  ) {
    super();
  }
  override eq(o: IconWidget) {
    return o.name === this.name && o.size === this.size && o.role === this.role;
  }
  override toDOM() {
    const s = document.createElement('span');
    const glyph = ICON_ALIASES[this.name] ?? this.name.replace(/-/g, '_');
    s.className = 'icon cm-adoc-icon' + (this.role ? ` cm-role-${this.role}` : '');
    s.style.fontSize = `${this.size}px`;
    s.textContent = glyph;
    s.title = this.name;
    return s;
  }
}

/** kbd:[Ctrl+S] → <kbd>Ctrl</kbd>+<kbd>S</kbd> */
class KeysWidget extends WidgetType {
  constructor(readonly keys: string) {
    super();
  }
  override eq(other: KeysWidget) {
    return other.keys === this.keys;
  }
  override toDOM() {
    const wrap = document.createElement('span');
    wrap.className = 'cm-adoc-kbd';
    this.keys.split('+').forEach((k, i) => {
      if (i) wrap.append('+');
      const kb = document.createElement('kbd');
      kb.textContent = k.trim();
      wrap.append(kb);
    });
    return wrap;
  }
}

/** cartão para `video::` / `audio::` / `include::` (tarefas 108 / 115). */
class CardWidget extends WidgetType {
  constructor(
    readonly icon: string,
    readonly label: string,
    readonly onOpen: (() => void) | null,
  ) {
    super();
  }
  override eq(o: CardWidget) {
    return o.icon === this.icon && o.label === this.label;
  }
  override toDOM() {
    const el = document.createElement('span');
    el.className = 'cm-adoc-card';
    const ic = document.createElement('span');
    ic.className = 'icon';
    ic.textContent = this.icon;
    const tx = document.createElement('span');
    tx.textContent = this.label;
    el.append(ic, tx);
    if (this.onOpen) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'cm-adoc-card__open';
      b.textContent = 'abrir';
      b.addEventListener('mousedown', (e) => {
        e.preventDefault();
        this.onOpen!();
      });
      el.append(b);
    }
    return el;
  }
  override ignoreEvent() {
    return false;
  }
}

/** bolha numerada de callout `<1>` (tarefa 105). */
class CalloutWidget extends WidgetType {
  constructor(readonly n: string) {
    super();
  }
  override eq(o: CalloutWidget) {
    return o.n === this.n;
  }
  override toDOM() {
    const s = document.createElement('span');
    s.className = 'cm-adoc-callout';
    s.textContent = this.n;
    return s;
  }
}

// ---------------- regras ----------------

const HEADING_RE = /^(={1,6})(\s+)(?=\S)/;
const LIST_RE = /^(\s*)([*.-]+|\d+[.)])(\s+)/;
/** admonição de uma linha (tarefa 98) */
const ADMON_RE = /^(NOTE|TIP|IMPORTANT|WARNING|CAUTION):(\s+)(?=\S)/;
const ADMON_LABELS: Record<string, string> = {
  NOTE: 'NOTA',
  TIP: 'DICA',
  IMPORTANT: 'IMPORTANTE',
  WARNING: 'ATENÇÃO',
  CAUTION: 'CUIDADO',
};
const CHECKBOX_RE = /^(\[[ xX]\])(\s+)/;
const COMMENT_FENCE_RE = /^\/{4,}\s*$/;

interface MarkRule {
  re: RegExp;
  cls: string;
  open: number;
  close: number;
}

const INLINE_RULES: MarkRule[] = [
  { re: /\*\*([^\n*]+)\*\*/g, cls: 'cm-adoc-strong', open: 2, close: 2 },
  { re: /(?<![\w*])\*([^\n*]+)\*(?![\w*])/g, cls: 'cm-adoc-strong', open: 1, close: 1 },
  { re: /__([^\n_]+)__/g, cls: 'cm-adoc-em', open: 2, close: 2 },
  { re: /(?<![\w_])_([^\n_]+)_(?![\w_])/g, cls: 'cm-adoc-em', open: 1, close: 1 },
  { re: /`([^\n`]+)`/g, cls: 'cm-adoc-code', open: 1, close: 1 },
  { re: /\+\+\+([^\n+]+)\+\+\+/g, cls: 'cm-adoc-code', open: 3, close: 3 },
  { re: /(?<![\w+])\+([^\n+]+)\+(?![\w+])/g, cls: 'cm-adoc-code', open: 1, close: 1 },
  { re: /(?<!\w)#([^\n#]+)#(?!\w)/g, cls: 'cm-adoc-mark', open: 1, close: 1 },
  { re: /\^([^\s^]+)\^/g, cls: 'cm-adoc-sup', open: 1, close: 1 },
  { re: /~([^\s~]+)~/g, cls: 'cm-adoc-sub', open: 1, close: 1 },
];

/** Papel inline `[.role]#texto#` → classe cm-role-<role>, esconde a sintaxe. */
const ROLE_RE = /\[\.([a-z][\w-]*)\]#([^\n#]+)#/g;

/** Substituições tipográficas (89) — trecho → símbolo. */
const REPLACE_RULES: Array<{ re: RegExp; out: string }> = [
  { re: /\(C\)/g, out: '©' },
  { re: /\(R\)/g, out: '®' },
  { re: /\(TM\)/g, out: '™' },
  { re: /(?<=\s)--(?=\s)/g, out: '—' },
  { re: /\.\.\./g, out: '…' },
  { re: /(?<=\s)->(?=\s)/g, out: '→' },
  { re: /(?<=\s)=>(?=\s)/g, out: '⇒' },
  { re: /(?<=\s)<-(?=\s)/g, out: '←' },
  { re: /(?<=\s)<=(?=\s)/g, out: '⇐' },
  { re: /\{nbsp\}/g, out: ' ' },
];

const MACRO_RE = /\b(?:link|xref|mailto):{1,2}([^\s[\]]*)\[([^\]\n]*)\]/g;
const XREF_RE = /<<([^,<>\n]+)(?:,([^<>\n]+))?>>/g;
const WIKILINK_RE = /\[\[([^\][|#\n]+)(?:#([^\][|\n]+))?(?:\|([^\][\n]+))?\]\]/g;
/** imagem inline: `image:arquivo[alt]` (um só `:`) */
const IMAGE_INLINE_RE = /image:(?!:)([^[\s\]]+)\[([^\]\n]*)\]/g;
/** imagem em bloco: linha inteira `image::arquivo[alt]` */
const IMAGE_BLOCK_RE = /^(\s*)image::([^[\n]+?)\[([^\]\n]*)\]\s*$/;
const FOOTNOTE_RE = /footnote:([\w-]*)\[([^\]\n]*)\]/g;
const KBD_RE = /kbd:\[([^\]\n]+)\]/g;
const BTN_RE = /btn:\[([^\]\n]+)\]/g;
const MENU_RE = /menu:([^[\s]+)\[([^\]\n]+)\]/g;
/** icon:nome[2x,role=green] (tarefa 93) */
const ICON_RE = /icon:([\w-]+)\[([^\]\n]*)\]/g;
/** stem:[...] / latexmath:[...] / asciimath:[...] (tarefa 96) */
const STEM_RE = /(?:stem|latexmath|asciimath):\[([^\]\n]+)\]/g;
/** anchor:id[] e âncora inline [[id]] no meio do texto (tarefa 94) */
const ANCHOR_RE = /anchor:([\w:.-]+)\[([^\]\n]*)\]/g;
/** termos de índice: (((termo))) , indexterm:[...] , indexterm2:[...] (tarefa 94) */
const INDEXTERM_RE = /\(\(\(([^)\n]+)\)\)\)|indexterm2?:\[([^\]\n]*)\]/g;
/** blocos de mídia (tarefa 108) */
const VIDEO_BLOCK_RE = /^video::([^[\n]+?)\[([^\]\n]*)\]\s*$/;
const AUDIO_BLOCK_RE = /^audio::([^[\n]+?)\[([^\]\n]*)\]\s*$/;
/** include (tarefa 115) */
const INCLUDE_RE = /^include::([^[\n]+?)\[([^\]\n]*)\]\s*$/;
/** item da lista de callouts: `<1> texto` / `<.> texto` (tarefa 105) */
const CALLOUT_LIST_RE = /^(<(?:\d+|\.)>)(\s+)(?=\S)/;
/** condicionais (tarefa 114) */
const COND_RE = /^(ifdef|ifndef|ifeval|endif)::/;
/** marca de sumário (tarefa 113) */
const TOC_RE = /^(?:toc::\[\]|:toc:.*)$/;

const hide = Decoration.replace({});

function linkMark(href: string): Decoration {
  const r = resolveRef(href);
  const broken = !r.external && !r.path;
  return Decoration.mark({
    class: 'cm-adoc-link' + (broken ? ' cm-adoc-link--broken' : ''),
    attributes: { 'data-href': href },
  });
}

function pushInline(
  ranges: Range<Decoration>[],
  lineFrom: number,
  text: string,
  reveal: boolean,
  attrs?: Map<string, string>,
) {
  // referências de atributo {nome} (tarefa 90)
  if (attrs && !ATTR_DEF_RE.test(text.trim())) {
    ATTR_REF_RE.lastIndex = 0;
    let am: RegExpExecArray | null;
    while ((am = ATTR_REF_RE.exec(text)) !== null) {
      const start = lineFrom + am.index;
      const end = start + am[0].length;
      const val = resolveAttr(am[1], attrs);
      if (val === null) {
        ranges.push(Decoration.mark({ class: 'cm-adoc-attr-missing' }).range(start, end));
      } else if (!reveal) {
        ranges.push(
          val === ''
            ? hide.range(start, end)
            : Decoration.replace({ widget: new TextWidget(val, 'cm-adoc-attr') }).range(start, end),
        );
      } else {
        ranges.push(Decoration.mark({ class: 'cm-adoc-attr' }).range(start, end));
      }
    }
  }

  for (const rule of INLINE_RULES) {
    rule.re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = rule.re.exec(text)) !== null) {
      const start = lineFrom + m.index;
      const end = start + m[0].length;
      ranges.push(Decoration.mark({ class: rule.cls }).range(start + rule.open, end - rule.close));
      if (!reveal) {
        ranges.push(hide.range(start, start + rule.open));
        ranges.push(hide.range(end - rule.close, end));
      }
    }
  }

  ROLE_RE.lastIndex = 0;
  let rm: RegExpExecArray | null;
  while ((rm = ROLE_RE.exec(text)) !== null) {
    const start = lineFrom + rm.index;
    const end = start + rm[0].length;
    const innerStart = start + rm[0].indexOf('#') + 1;
    const innerEnd = end - 1;
    if (innerEnd > innerStart) {
      ranges.push(
        Decoration.mark({ class: `cm-adoc-role cm-role-${rm[1]}` }).range(innerStart, innerEnd),
      );
      if (!reveal) {
        ranges.push(hide.range(start, innerStart));
        ranges.push(hide.range(innerEnd, end));
      }
    }
  }

  IMAGE_INLINE_RE.lastIndex = 0;
  let im: RegExpExecArray | null;
  while ((im = IMAGE_INLINE_RE.exec(text)) !== null) {
    const start = lineFrom + im.index;
    const end = start + im[0].length;
    if (!reveal) {
      ranges.push(
        Decoration.replace({ widget: new ImageWidget(im[1], im[2], false) }).range(start, end),
      );
    }
  }

  MACRO_RE.lastIndex = 0;
  let mm: RegExpExecArray | null;
  while ((mm = MACRO_RE.exec(text)) !== null) {
    const start = lineFrom + mm.index;
    const end = start + mm[0].length;
    const labelStart = start + mm[0].indexOf('[') + 1;
    const labelEnd = end - 1;
    if (labelEnd > labelStart) {
      ranges.push(linkMark(mm[1]).range(labelStart, labelEnd));
      if (!reveal) {
        ranges.push(hide.range(start, labelStart));
        ranges.push(hide.range(labelEnd, end));
      }
    }
  }

  XREF_RE.lastIndex = 0;
  let xm: RegExpExecArray | null;
  while ((xm = XREF_RE.exec(text)) !== null) {
    const start = lineFrom + xm.index;
    const end = start + xm[0].length;
    const labelStart = xm[2] ? start + xm[0].indexOf(',') + 1 : start + 2;
    const labelEnd = end - 2;
    if (labelEnd > labelStart) {
      ranges.push(linkMark(xm[1].trim()).range(labelStart, labelEnd));
      if (!reveal) {
        ranges.push(hide.range(start, labelStart));
        ranges.push(hide.range(labelEnd, end));
      }
    }
  }

  WIKILINK_RE.lastIndex = 0;
  let wm: RegExpExecArray | null;
  while ((wm = WIKILINK_RE.exec(text)) !== null) {
    const start = lineFrom + wm.index;
    const end = start + wm[0].length;
    const href = wm[1].trim() + (wm[2] ? `#${wm[2].trim()}` : '');
    const label = wm[3]?.trim() || wm[1].trim() + (wm[2] ? ` › ${wm[2].trim()}` : '');
    if (reveal) {
      // linha ativa: mostra o `[[...]]` cru, só colore o miolo
      ranges.push(linkMark(href).range(start + 2, end - 2));
    } else {
      ranges.push(Decoration.replace({ widget: new LinkWidget(label, href) }).range(start, end));
    }
  }

  // stem/latexmath/asciimath (96): colore o miolo, esconde a casca quando inativo
  STEM_RE.lastIndex = 0;
  let sm: RegExpExecArray | null;
  while ((sm = STEM_RE.exec(text)) !== null) {
    const start = lineFrom + sm.index;
    const end = start + sm[0].length;
    const innerStart = start + sm[0].indexOf('[') + 1;
    const innerEnd = end - 1;
    if (innerEnd > innerStart) {
      ranges.push(Decoration.mark({ class: 'cm-adoc-stem' }).range(innerStart, innerEnd));
      if (!reveal) {
        ranges.push(hide.range(start, innerStart));
        ranges.push(hide.range(innerEnd, end));
      }
    }
  }

  if (reveal) return;

  // --- daqui pra baixo: só quando a linha NÃO está ativa (widgets) ---

  ICON_RE.lastIndex = 0;
  let icm: RegExpExecArray | null;
  while ((icm = ICON_RE.exec(text)) !== null) {
    const start = lineFrom + icm.index;
    const opts = icm[2] ?? '';
    const sizeM = /(?:^|,)\s*([1-9])x\s*(?:,|$)/.exec(opts) ?? /size=([\d.]+)/.exec(opts);
    const size = sizeM
      ? Math.min(64, Math.round(Number(sizeM[1]) * (sizeM[0].includes('x') ? 18 : 1)))
      : 18;
    const roleM = /role=([\w-]+)/.exec(opts);
    ranges.push(
      Decoration.replace({
        widget: new IconWidget(icm[1], size || 18, roleM ? roleM[1] : ''),
      }).range(start, start + icm[0].length),
    );
  }

  ANCHOR_RE.lastIndex = 0;
  let anm: RegExpExecArray | null;
  while ((anm = ANCHOR_RE.exec(text)) !== null) {
    const start = lineFrom + anm.index;
    ranges.push(
      Decoration.replace({ widget: new TextWidget('#', 'cm-adoc-anchor') }).range(
        start,
        start + anm[0].length,
      ),
    );
  }

  INDEXTERM_RE.lastIndex = 0;
  let ixm: RegExpExecArray | null;
  while ((ixm = INDEXTERM_RE.exec(text)) !== null) {
    const start = lineFrom + ixm.index;
    ranges.push(
      Decoration.replace({ widget: new TextWidget('⌖', 'cm-adoc-indexterm') }).range(
        start,
        start + ixm[0].length,
      ),
    );
  }

  for (const rule of REPLACE_RULES) {
    rule.re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = rule.re.exec(text)) !== null) {
      const start = lineFrom + m.index;
      ranges.push(
        Decoration.replace({ widget: new TextWidget(rule.out, 'cm-adoc-repl') }).range(
          start,
          start + m[0].length,
        ),
      );
    }
  }

  FOOTNOTE_RE.lastIndex = 0;
  let fm: RegExpExecArray | null;
  while ((fm = FOOTNOTE_RE.exec(text)) !== null) {
    const start = lineFrom + fm.index;
    ranges.push(
      Decoration.replace({ widget: new TextWidget('†', 'cm-adoc-fn') }).range(
        start,
        start + fm[0].length,
      ),
    );
  }

  KBD_RE.lastIndex = 0;
  let km: RegExpExecArray | null;
  while ((km = KBD_RE.exec(text)) !== null) {
    const start = lineFrom + km.index;
    ranges.push(
      Decoration.replace({ widget: new KeysWidget(km[1]) }).range(start, start + km[0].length),
    );
  }

  BTN_RE.lastIndex = 0;
  let bm: RegExpExecArray | null;
  while ((bm = BTN_RE.exec(text)) !== null) {
    const start = lineFrom + bm.index;
    ranges.push(
      Decoration.replace({ widget: new TextWidget(bm[1], 'cm-adoc-btn') }).range(
        start,
        start + bm[0].length,
      ),
    );
  }

  MENU_RE.lastIndex = 0;
  let um: RegExpExecArray | null;
  while ((um = MENU_RE.exec(text)) !== null) {
    const start = lineFrom + um.index;
    const trail = um[2]
      .split('>')
      .map((s) => s.trim())
      .join(' › ');
    ranges.push(
      Decoration.replace({ widget: new TextWidget(`${um[1]} › ${trail}`, 'cm-adoc-menu') }).range(
        start,
        start + um[0].length,
      ),
    );
  }
}

// ---------------- varredura de blocos ----------------

interface BlockRange {
  kind: 'code' | 'fragment';
  /** linha (1-based) onde o bloco começa a ser substituído (attr `[..]` ou a cerca). */
  fromLine: number;
  openLine: number;
  closeLine: number;
  /** primeira linha de conteúdo — alvo do botão "editar". */
  contentLine: number;
  lang: string;
}

interface LineFlags {
  verbatim: Set<number>;
  comment: Set<number>;
  blocks: BlockRange[];
  /** atributos do documento (`:nome: valor`) + `{doctitle}` (tarefa 90). */
  attrs: Map<string, string>;
  /** linha → papel herdado de um `[.role]` logo acima (tarefa 110). */
  roles: Map<number, string>;
}

const ROLE_META_RE = /^\[\.([\w-]+(?:\s+[\w-]+)*)\]$/;

const ATTR_DEF_RE = /^:([\w][\w-]*):(?:\s+(.*))?$/;
const ATTR_REF_RE = /\{([\w][\w-]*)\}/g;
const BUILTIN_ATTRS: Record<string, string> = {
  sp: ' ',
  nbsp: ' ',
  empty: '',
  blank: '',
  'two-colons': '::',
  'two-semicolons': ';;',
  startsb: '[',
  endsb: ']',
  vbar: '|',
  plus: '+',
  caret: '^',
  asterisk: '*',
  tilde: '~',
  backslash: '\\',
  brvbar: '¦',
};

const FENCES = ['----', '....', '====', '____', '****', '--'];
const ATTR_LINE_RE = /^\[.+\]$/;
const SOURCE_ATTR_RE = /^\[(?:source|,)\s*(?:%[\w,]+\s*,?\s*)?,?\s*([\w+#-]*)/i;

function findClose(lines: string[], from: number, delim: string): number {
  for (let j = from + 1; j < lines.length; j += 1) {
    if (lines[j].trim() === delim) return j;
  }
  return -1;
}

function scanBlocks(docText: string): LineFlags {
  const verbatim = new Set<number>();
  const comment = new Set<number>();
  const blocks: BlockRange[] = [];
  const attrs = new Map<string, string>();
  const roles = new Map<number, string>();
  const lines = docText.split('\n');
  let cOpen = false;
  let pendingRole = '';

  for (let i = 0; i < lines.length; i += 1) {
    const trimmed = lines[i].trim();
    const n = i + 1;

    if (i === 0) {
      const dt = /^=\s+(\S.*)$/.exec(lines[0]);
      if (dt) attrs.set('doctitle', dt[1].trim());
    }
    const ad = ATTR_DEF_RE.exec(trimmed);
    if (ad && !verbatim.has(n) && !comment.has(n)) attrs.set(ad[1], (ad[2] ?? '').trim());

    // papel de bloco `[.role]` herda para a próxima linha de conteúdo (tarefa 110)
    const rm = ROLE_META_RE.exec(trimmed);
    if (rm && !verbatim.has(n) && !comment.has(n)) {
      pendingRole = rm[1].trim().split(/\s+/).join(' ');
    } else if (pendingRole && trimmed !== '' && !/^\[.*\]$/.test(trimmed)) {
      roles.set(n, pendingRole);
      pendingRole = '';
    }

    if (cOpen) {
      comment.add(n);
      if (COMMENT_FENCE_RE.test(lines[i])) cOpen = false;
      continue;
    }
    if (COMMENT_FENCE_RE.test(lines[i])) {
      cOpen = true;
      comment.add(n);
      continue;
    }

    // passthrough: não renderiza, só monoespaça
    if (trimmed === '++++') {
      const close = findClose(lines, i, '++++');
      if (close > i) {
        for (let k = i; k <= close; k += 1) verbatim.add(k + 1);
        i = close;
      } else {
        verbatim.add(n);
      }
      continue;
    }

    const isTable = trimmed === '|===';
    const isFence = FENCES.includes(trimmed);
    if (!isTable && !isFence) continue;

    const close = findClose(lines, i, trimmed);
    if (close <= i) continue;

    const attr = i > 0 && ATTR_LINE_RE.test(lines[i - 1].trim()) ? lines[i - 1].trim() : '';
    let kind: 'code' | 'fragment' = isTable ? 'fragment' : 'code';
    let lang = '';
    if (isFence) {
      if (trimmed === '----' || trimmed === '....') {
        kind = 'code';
        const m = attr && SOURCE_ATTR_RE.exec(attr);
        if (m) lang = m[1] ?? '';
      } else {
        kind = 'code';
        const m = attr && SOURCE_ATTR_RE.exec(attr);
        if (attr && /^\[source/i.test(attr)) {
          kind = 'code';
          if (m) lang = m[1] ?? '';
        } else {
          kind = 'fragment';
        }
      }
    }

    const fromLine = attr ? i : i + 1;
    if (kind === 'code' || trimmed === '----' || trimmed === '....') {
      for (let k = i; k <= close; k += 1) verbatim.add(k + 1);
    }
    blocks.push({
      kind,
      fromLine,
      openLine: i + 1,
      closeLine: close + 1,
      contentLine: Math.min(i + 2, close + 1),
      lang,
    });
    i = close;
  }

  return { verbatim, comment, blocks, attrs, roles };
}

function resolveAttr(name: string, attrs: Map<string, string>): string | null {
  if (attrs.has(name)) return attrs.get(name)!;
  if (name in BUILTIN_ATTRS) return BUILTIN_ATTRS[name];
  return null;
}

function blockIsActive(doc: Text, sel: EditorState['selection'], b: BlockRange): boolean {
  if (b.closeLine > doc.lines) return true;
  const fromPos = doc.line(b.fromLine).from;
  const toPos = doc.line(b.closeLine).to;
  return sel.ranges.some((r) => r.from <= toPos && r.to >= fromPos);
}

/** Decorations de BLOCO (replace com widget). Precisa vir de um StateField —
 * o CodeMirror não aceita block decorations vindas de ViewPlugin. */
function blockDecorations(state: EditorState): DecorationSet {
  const { blocks } = scanBlocks(state.doc.toString());
  const doc = state.doc;
  const ranges: Range<Decoration>[] = [];
  for (const b of blocks) {
    if (b.closeLine > doc.lines) continue;
    if (blockIsActive(doc, state.selection, b)) continue; // cursor dentro → texto cru
    const fromPos = doc.line(b.fromLine).from;
    const toPos = doc.line(b.closeLine).to;
    const editPos = doc.line(Math.min(b.contentLine, doc.lines)).from;
    if (b.kind === 'code') {
      const hasBody = b.closeLine > b.openLine + 1;
      const code = hasBody
        ? doc.sliceString(doc.line(b.openLine + 1).from, doc.line(b.closeLine - 1).to)
        : '';
      ranges.push(
        Decoration.replace({
          block: true,
          widget: new CodeBlockWidget(code, b.lang, editPos),
        }).range(fromPos, toPos),
      );
    } else {
      const source = doc.sliceString(fromPos, toPos);
      ranges.push(
        Decoration.replace({ block: true, widget: new FragmentWidget(source, editPos) }).range(
          fromPos,
          toPos,
        ),
      );
    }
  }
  return Decoration.set(ranges, true);
}

const blockField = StateField.define<DecorationSet>({
  create: blockDecorations,
  update(deco, tr) {
    if (tr.docChanged || tr.selection) return blockDecorations(tr.state);
    return deco;
  },
  provide: (f) => EditorView.decorations.from(f),
});

function buildDecorations(view: EditorView, flags: LineFlags): DecorationSet {
  const ranges: Range<Decoration>[] = [];
  const doc = view.state.doc;
  const sel = view.state.selection;
  const lineIsActive = (from: number, to: number) =>
    sel.ranges.some((r) => r.from <= to && r.to >= from);

  // linhas cobertas por um widget de bloco → puladas no loop por linha
  const covered = new Set<number>();
  for (const b of flags.blocks) {
    if (blockIsActive(doc, sel, b)) continue;
    for (let ln = b.fromLine; ln <= Math.min(b.closeLine, doc.lines); ln += 1) covered.add(ln);
  }

  for (const { from, to } of view.visibleRanges) {
    let pos = from;
    while (pos <= to) {
      const line = view.state.doc.lineAt(pos);
      const text = line.text;
      const active = lineIsActive(line.from, line.to);

      if (covered.has(line.number)) {
        pos = line.to + 1;
        continue;
      }

      if (flags.comment.has(line.number)) {
        ranges.push(Decoration.line({ class: 'cm-adoc-comment-line' }).range(line.from));
        pos = line.to + 1;
        continue;
      }
      if (flags.verbatim.has(line.number)) {
        ranges.push(Decoration.line({ class: 'cm-adoc-code-line' }).range(line.from));
        pos = line.to + 1;
        continue;
      }

      // papel herdado de um `[.role]` acima (tarefa 110)
      const role = flags.roles.get(line.number);
      if (role) {
        const cls = role
          .split(' ')
          .map((r) => `cm-role-${r}`)
          .join(' ');
        ranges.push(Decoration.line({ class: cls }).range(line.from));
      }

      const h = HEADING_RE.exec(text);
      if (h) {
        ranges.push(Decoration.line({ class: `cm-adoc-h${h[1].length}` }).range(line.from));
        if (!active) ranges.push(hide.range(line.from, line.from + h[1].length + h[2].length));
        pushInline(ranges, line.from, text, active, flags.attrs);
        pos = line.to + 1;
        continue;
      }

      const li = LIST_RE.exec(text);
      if (li) {
        const markerFrom = line.from + li[1].length;
        const unordered = li[2][0] === '*' || li[2][0] === '-';
        if (unordered && !active) {
          ranges.push(
            Decoration.replace({ widget: bulletWidget }).range(
              markerFrom,
              markerFrom + li[2].length,
            ),
          );
        }
        const cb = CHECKBOX_RE.exec(text.slice(li[0].length));
        if (cb && !active) {
          const cbFrom = line.from + li[0].length;
          const cbTo = cbFrom + cb[1].length;
          ranges.push(
            Decoration.replace({
              widget: new CheckboxWidget(cb[1].toLowerCase() === '[x]', cbFrom, cbTo),
            }).range(cbFrom, cbTo),
          );
        }
        pushInline(ranges, line.from, text, active, flags.attrs);
        pos = line.to + 1;
        continue;
      }

      const img = IMAGE_BLOCK_RE.exec(text);
      if (img) {
        if (!active) {
          ranges.push(
            Decoration.replace({ widget: new ImageWidget(img[2].trim(), img[3], true) }).range(
              line.from + img[1].length,
              line.to,
            ),
          );
        }
        pos = line.to + 1;
        continue;
      }

      if (/^\/\/(?!\/)/.test(text)) {
        ranges.push(Decoration.line({ class: 'cm-adoc-comment-line' }).range(line.from));
        pos = line.to + 1;
        continue;
      }

      // linha de metadados de bloco: [source,js] , [NOTE] , [.role] , [#id]
      if (/^\[[^\]]*\]\s*$/.test(text.trim()) && text.trim() !== '[]') {
        if (!active) ranges.push(Decoration.line({ class: 'cm-adoc-meta-line' }).range(line.from));
        pos = line.to + 1;
        continue;
      }

      // admonição de uma linha `NOTE: ...` (tarefa 98)
      const adm = ADMON_RE.exec(text);
      if (adm) {
        const kind = adm[1].toLowerCase();
        ranges.push(
          Decoration.line({ class: `cm-adoc-admon cm-adoc-admon--${kind}` }).range(line.from),
        );
        if (!active) {
          ranges.push(
            Decoration.replace({
              widget: new TextWidget(
                ADMON_LABELS[adm[1]],
                `cm-adoc-admon__tag cm-adoc-admon--${kind}`,
              ),
            }).range(line.from, line.from + adm[1].length + 1 + adm[2].length),
          );
        }
        pushInline(ranges, line.from, text, active, flags.attrs);
        pos = line.to + 1;
        continue;
      }

      const trimmed = text.trim();

      // continuação de item de lista: `+` sozinho (tarefa 104)
      if (trimmed === '+') {
        ranges.push(Decoration.line({ class: 'cm-adoc-listcont-line' }).range(line.from));
        if (!active && line.to > line.from) ranges.push(hide.range(line.from, line.to));
        pos = line.to + 1;
        continue;
      }

      // condicionais ifdef/ifndef/ifeval/endif (tarefa 114)
      if (COND_RE.test(trimmed)) {
        ranges.push(Decoration.line({ class: 'cm-adoc-cond-line' }).range(line.from));
        pos = line.to + 1;
        continue;
      }

      // marca de sumário :toc: / toc::[] (tarefa 113)
      if (TOC_RE.test(trimmed)) {
        ranges.push(Decoration.line({ class: 'cm-adoc-toc-line' }).range(line.from));
        if (!active) {
          ranges.push(
            Decoration.replace({ widget: new TextWidget('« sumário »', 'cm-adoc-tocmark') }).range(
              line.from,
              line.to,
            ),
          );
        }
        pos = line.to + 1;
        continue;
      }

      // include:: (tarefa 115)
      const inc = INCLUDE_RE.exec(text);
      if (inc) {
        if (!active) {
          const target = inc[1].trim();
          ranges.push(
            Decoration.replace({
              widget: new CardWidget('note_add', `include: ${target}`, () => openRelative(target)),
            }).range(line.from, line.to),
          );
        }
        pos = line.to + 1;
        continue;
      }

      // video:: / audio:: (tarefa 108)
      const vid = VIDEO_BLOCK_RE.exec(text) ?? AUDIO_BLOCK_RE.exec(text);
      if (vid) {
        if (!active) {
          const isVideo = text.startsWith('video::');
          ranges.push(
            Decoration.replace({
              widget: new CardWidget(
                isVideo ? 'movie' : 'volume_up',
                `${i18n.t(isVideo ? 'media.video' : 'media.audio')}: ${vid[1].trim()}`,
                null,
              ),
            }).range(line.from, line.to),
          );
        }
        pos = line.to + 1;
        continue;
      }

      // item da lista de callouts `<1> texto` (tarefa 105)
      const co = CALLOUT_LIST_RE.exec(text);
      if (co) {
        if (!active) {
          const n = co[1].slice(1, -1);
          ranges.push(
            Decoration.replace({ widget: new CalloutWidget(n) }).range(
              line.from,
              line.from + co[1].length + co[2].length,
            ),
          );
        }
        pushInline(ranges, line.from, text, active, flags.attrs);
        pos = line.to + 1;
        continue;
      }

      // régua '''  /  - - -   (tarefa 107)
      if (trimmed === "'''" || trimmed === '- - -') {
        ranges.push(Decoration.line({ class: 'cm-adoc-hr-line' }).range(line.from));
        if (!active && line.to > line.from) ranges.push(hide.range(line.from, line.to));
        pos = line.to + 1;
        continue;
      }

      // quebra de página <<<  (tarefa 107)
      if (trimmed === '<<<') {
        ranges.push(Decoration.line({ class: 'cm-adoc-pagebreak-line' }).range(line.from));
        if (!active && line.to > line.from) ranges.push(hide.range(line.from, line.to));
        pos = line.to + 1;
        continue;
      }

      // título de bloco `.Título`  (tarefa 109)
      const cap = /^\.(?!\.)(\S.*)$/.exec(text);
      if (cap && !LIST_RE.test(text)) {
        ranges.push(Decoration.line({ class: 'cm-adoc-blocktitle-line' }).range(line.from));
        if (!active) ranges.push(hide.range(line.from, line.from + 1));
        pushInline(ranges, line.from, text, active, flags.attrs);
        pos = line.to + 1;
        continue;
      }

      // lista de descrição `Termo:: definição`  (tarefa 103)
      const dl = /^(\s*)([^\s].*?)(:{2,4})(\s+|$)/.exec(text);
      if (dl && !/^\s*(?:https?|link|xref|mailto|image|icon):/.test(text)) {
        const termFrom = line.from + dl[1].length;
        const termTo = termFrom + dl[2].length;
        ranges.push(Decoration.mark({ class: 'cm-adoc-dt' }).range(termFrom, termTo));
        if (!active) ranges.push(hide.range(termTo, termTo + dl[3].length));
        pushInline(ranges, line.from, text, active, flags.attrs);
        pos = line.to + 1;
        continue;
      }

      pushInline(ranges, line.from, text, active, flags.attrs);

      // quebra de linha forçada ` +` no fim da linha (tarefa 88)
      if (!active && / \+$/.test(text)) {
        ranges.push(
          Decoration.replace({ widget: new TextWidget('↵', 'cm-adoc-hardbreak') }).range(
            line.to - 2,
            line.to,
          ),
        );
      }

      pos = line.to + 1;
    }
  }

  return Decoration.set(ranges, true);
}

const livePreviewPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    flags: LineFlags;

    constructor(view: EditorView) {
      this.flags = scanBlocks(view.state.doc.toString());
      this.decorations = buildDecorations(view, this.flags);
    }

    update(update: ViewUpdate) {
      if (update.docChanged) this.flags = scanBlocks(update.state.doc.toString());
      const engineReady = update.transactions.some((tr) =>
        tr.effects.some((e) => e.is(engineRefresh)),
      );
      if (update.docChanged || update.viewportChanged || update.selectionSet || engineReady) {
        this.decorations = buildDecorations(update.view, this.flags);
      }
    }
  },
  { decorations: (v) => v.decorations },
);

/** Modo inline = widgets de bloco (StateField) + decorations inline (ViewPlugin). */
export const livePreview = [blockField, livePreviewPlugin];
