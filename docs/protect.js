// Copy protection for the shared reading site.
// Display is never changed here: this module only listens to clipboard,
// selection, context-menu, drag and keyboard events. Editable fields (search
// boxes, the personal-note textarea) keep their normal behaviour.
const NOISE_RANGES = [[0x4e00, 0x9fa5], [0x3400, 0x4db5]];
const NOISE_SYMBOLS = [...'※¤§¶†‡◆◇○●□■△▲▽▼☆★♀♂♪♫∮∴∵≒≡⊕⊗⊙⌒⌘⏃⏚⍟⎔⏣╳╱╲▓▒░〓〼〄㊣㍿'];
function randomInt(limit) {
  if (globalThis.crypto?.getRandomValues) {
    const value = new Uint32Array(1);
    globalThis.crypto.getRandomValues(value);
    return value[0] % limit;
  }
  return Math.floor(Math.random() * limit);
}
function noiseChar() {
  if (randomInt(5) === 0) return NOISE_SYMBOLS[randomInt(NOISE_SYMBOLS.length)];
  const [start, end] = NOISE_RANGES[randomInt(5) === 0 ? 1 : 0];
  return String.fromCodePoint(start + randomInt(end - start + 1));
}
/** Replace every visible character with random CJK/symbol noise. Line breaks
 * are kept so the pasted garbage has a plausible shape; nothing of the
 * original text survives. An empty selection still yields noise. */
export function scramble(text, minLength = 24) {
  const chars = [...String(text ?? '')];
  if (!chars.length) chars.push(...Array(minLength).fill(' '));
  return chars.map(c => (c === '\n' || c === '\r') ? c : noiseChar()).join('');
}
const escapeHtml = value => value.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function scrambledHtml(text) {
  return '<meta charset="utf-8"><span>' + escapeHtml(scramble(text)).replace(/\r?\n/g, '<br>') + '</span>';
}
function elementOf(target) {
  return target && target.nodeType === 3 ? target.parentElement : target;
}
/** True for places where the reader types: search inputs, the personal-note
 * textarea, selects and contenteditable regions. */
export function isEditable(target) {
  const element = elementOf(target);
  if (!element || typeof element.closest !== 'function') return false;
  if (element.closest('textarea,select,[contenteditable=""],[contenteditable="true"]')) return true;
  const input = element.closest('input');
  return Boolean(input && !/^(checkbox|radio|button|submit|reset|image|file|range|color)$/i.test(input.type || 'text'));
}
// Course materials (AI PDF) stay downloadable, so their links keep the browser
// context menu ("save link as"). Recordings are never published.
const MATERIAL_SELECTOR = 'a.material-link';
export function installCopyProtection(doc = globalThis.document) {
  if (!doc || doc.__copyProtection) return;
  doc.__copyProtection = true;
  const win = doc.defaultView || globalThis;
  const garble = event => {
    if (isEditable(event.target) && isEditable(doc.activeElement)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const selected = String(win.getSelection?.() || '');
    const data = event.clipboardData;
    if (data) {
      data.setData('text/plain', scramble(selected));
      data.setData('text/html', scrambledHtml(selected));
    }
  };
  doc.addEventListener('copy', garble, true);
  doc.addEventListener('cut', garble, true);
  doc.addEventListener('contextmenu', event => {
    const element = elementOf(event.target);
    if (isEditable(element) || element?.closest?.(MATERIAL_SELECTOR)) return;
    event.preventDefault();
  }, true);
  for (const type of ['selectstart', 'dragstart']) {
    doc.addEventListener(type, event => {
      if (isEditable(event.target)) return;
      if (type === 'dragstart' && elementOf(event.target)?.closest?.(MATERIAL_SELECTOR)) return;
      event.preventDefault();
    }, true);
  }
  doc.addEventListener('keydown', event => {
    if (!(event.ctrlKey || event.metaKey)) return;
    // event.code survives Option/Alt combinations such as Cmd+Option+U.
    const key = /^Key[A-Z]$/.test(event.code || '') ? event.code.slice(3).toLowerCase() : String(event.key || '').toLowerCase();
    const typing = isEditable(event.target);
    // Inside a search box or the personal note, copy / cut / select-all act on
    // the reader's own typing and remain available.
    if (['c', 'x', 'a'].includes(key) && !typing) event.preventDefault();
    // Save page, print and view source are blocked everywhere.
    if (['s', 'p', 'u'].includes(key)) event.preventDefault();
  }, true);
  // The browser's own Print menu cannot be blocked from script; style.css
  // hides the page in print media instead.
}
if (typeof document !== 'undefined') installCopyProtection(document);
