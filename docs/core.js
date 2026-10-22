export const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const compact = value => String(value || '').normalize('NFKC').toLocaleLowerCase().replace(/\s+/g, '');
export function queryTerms(query) { return String(query || '').trim().split(/\s+/).filter(Boolean).slice(0, 8).map(compact); }
export function safeNoteFile(file) { return /^notes\/[a-f0-9]{20}-[a-f0-9]{12}\.json$/.test(file); }
export function safeImageFile(file) { return /^data\/images\/[a-f0-9]{64}\.png$/.test(file); }
export function newestNotes(notes) {
  return [...notes].sort((a,b) => String(b.lessonAt || b.date).localeCompare(String(a.lessonAt || a.date)) || a.title.localeCompare(b.title,'zh-CN') || a.id.localeCompare(b.id));
}
export function stamp(seconds) {
  const value = Math.max(0, Math.floor(Number(seconds) || 0));
  return value >= 3600 ? `${Math.floor(value/3600)}:${String(Math.floor(value%3600/60)).padStart(2,'0')}:${String(value%60).padStart(2,'0')}` : `${Math.floor(value/60)}:${String(value%60).padStart(2,'0')}`;
}
export function searchText(index, query, notes, {course = '', includeSources = false, limit = 70} = {}) {
  const terms = queryTerms(query);
  if (!terms.length) return [];
  const byId = new Map(notes.map(n => [n.id, n]));
  const best = new Map();
  for (const chunk of index) {
    const note = byId.get(chunk.note);
    if (!note || (course && note.course !== course) || (!includeSources && chunk.kind === 'source')) continue;
    const title = compact(note.title), heading = compact(chunk.heading), text = compact(chunk.text);
    if (!terms.every(term => (title + heading + text).includes(term))) continue;
    const score = terms.reduce((total, term) => total + (title.includes(term) ? 8 : 0) + (heading.includes(term) ? 5 : 0) + (text.includes(term) ? 2 : 0), chunk.kind === 'note' ? 2 : 0);
    const key = [chunk.note, chunk.kind, chunk.section].join(':');
    if (!best.has(key) || best.get(key).score < score) best.set(key, {...chunk, score, title: note.title, course: note.course, date: note.date});
  }
  return [...best.values()].sort((a,b) => b.score-a.score || b.date.localeCompare(a.date)).slice(0, limit);
}
export function snippet(text, query) {
  text = String(text).replace(/<!--[\s\S]*?-->/g,'').replace(/<[^>]*>/g,'')
    .replace(/\[([^\]]+)\]\([^)]*\)/g,'$1').replace(/^\s*#{1,6}\s+/gm,'').replace(/[*`]/g,'');
  const first = String(query).trim().split(/\s+/)[0] || '';
  const start = Math.max(0, String(text).toLocaleLowerCase().indexOf(first.toLocaleLowerCase()) - 45);
  return (start ? '…' : '') + String(text).slice(start, start+190).replace(/\s+/g, ' ') + (text.length > start+190 ? '…' : '');
}
export function highlightedHtml(text, query) {
  const terms = String(query).trim().split(/\s+/).filter(Boolean).slice(0,8).sort((a,b)=>b.length-a.length);
  if (!terms.length) return escapeHtml(text);
  const expression = new RegExp(terms.map(s => s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|'), 'gi');
  let cursor = 0, result = '';
  for (const match of String(text).matchAll(expression)) {
    result += escapeHtml(String(text).slice(cursor, match.index)) + '<mark>' + escapeHtml(match[0]) + '</mark>';
    cursor = match.index + match[0].length;
  }
  return result + escapeHtml(String(text).slice(cursor));
}
export function reviewLabel(status) {
  return ({passed:'已自动核对',pending:'待核对',failed:'核对未通过',needs_review:'待核对',unknown:'未标注核对状态'})[status] || '待核对';
}
