// Page save, print and drag protections for the shared reading site.
// Selection, clipboard operations and context menus use native browser behaviour.
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
// Course materials (AI PDF) stay downloadable and their links can be dragged.
// Recordings are never published.
const MATERIAL_SELECTOR = 'a.material-link';
export function installPageProtection(doc = globalThis.document) {
  if (!doc || doc.__pageProtection) return;
  doc.__pageProtection = true;
  doc.addEventListener('dragstart', event => {
    if (isEditable(event.target) || elementOf(event.target)?.closest?.(MATERIAL_SELECTOR)) return;
    event.preventDefault();
  }, true);
  doc.addEventListener('keydown', event => {
    if (!(event.ctrlKey || event.metaKey)) return;
    // event.code survives Option/Alt combinations such as Cmd+Option+U.
    const key = /^Key[A-Z]$/.test(event.code || '') ? event.code.slice(3).toLowerCase() : String(event.key || '').toLowerCase();
    // Save page, print and view source are blocked everywhere.
    if (['s', 'p', 'u'].includes(key)) event.preventDefault();
  }, true);
  // The browser's own Print menu cannot be blocked from script; style.css
  // hides the page in print media instead.
}
if (typeof document !== 'undefined') installPageProtection(document);
