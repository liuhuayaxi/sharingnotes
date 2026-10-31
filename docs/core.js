export const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const compact = value => String(value || '').normalize('NFKC').toLocaleLowerCase().replace(/\s+/g, '');
export function queryTerms(query) { return String(query || '').trim().split(/\s+/).filter(Boolean).slice(0, 8).map(compact); }
export function safeNoteFile(file) { return /^notes\/[a-f0-9]{20}-[a-f0-9]{12}\.json$/.test(file); }
export function safeImageFile(file) { return /^data\/images\/[a-f0-9]{64}\.png$/.test(file); }
export function newestNotes(notes) {
  return [...notes].sort((a,b) => String(b.lessonAt || b.date).localeCompare(String(a.lessonAt || a.date)) || a.title.localeCompare(b.title,'zh-CN') || a.id.localeCompare(b.id));
}
export const UNASSIGNED_CHAPTER = '__unassigned__';
export function noteChapters(note) {
  const declared = Array.isArray(note?.chapters) ? note.chapters : [];
  const chapters = [...new Set(declared.filter(value => typeof value === 'string').map(value => value.trim()).filter(Boolean))];
  if (!chapters.length && typeof note?.chapter === 'string' && note.chapter.trim()) chapters.push(note.chapter.trim());
  return chapters;
}
export function chapterLabel(note) { return (typeof note?.chapter === 'string' && note.chapter.trim()) || noteChapters(note).join(' · ') || '章节待确认'; }
export function matchesChapter(note, chapter = '') {
  if (!chapter) return true;
  const chapters = noteChapters(note);
  return chapter === UNASSIGNED_CHAPTER ? chapters.length === 0 : chapters.includes(chapter);
}
export function scopedNotes(notes, {course = '', chapter = '', favoritesOnly = false, favorites = new Set(), sort = 'newest'} = {}) {
  const result = newestNotes(notes.filter(note => (!course || note.course === course) && matchesChapter(note, chapter) && (!favoritesOnly || favorites.has(note.id))));
  return sort === 'oldest' ? result.reverse() : result;
}
export function chapterCounts(notes, course = '') {
  const counts = new Map();
  // Keep explicit chapters in teaching order. No title/body guessing is used.
  for (const note of scopedNotes(notes, {course, sort: 'oldest'})) {
    const chapters = noteChapters(note);
    for (const chapter of chapters.length ? chapters : [UNASSIGNED_CHAPTER]) counts.set(chapter, (counts.get(chapter) || 0) + 1);
  }
  return [...counts].filter(([chapter]) => chapter !== UNASSIGNED_CHAPTER)
    .concat(counts.has(UNASSIGNED_CHAPTER) ? [[UNASSIGNED_CHAPTER, counts.get(UNASSIGNED_CHAPTER)]] : [])
    .map(([chapter, notes]) => ({chapter, label: chapter === UNASSIGNED_CHAPTER ? '章节待确认' : chapter, notes}));
}
export function stamp(seconds) {
  const value = Math.max(0, Math.floor(Number(seconds) || 0));
  return value >= 3600 ? `${Math.floor(value/3600)}:${String(Math.floor(value%3600/60)).padStart(2,'0')}:${String(value%60).padStart(2,'0')}` : `${Math.floor(value/60)}:${String(value%60).padStart(2,'0')}`;
}
export function searchText(index, query, notes, {course = '', chapter = '', favoritesOnly = false, favorites = new Set(), includeSources = false, limit = 70} = {}) {
  const terms = queryTerms(query);
  if (!terms.length) return [];
  const byId = new Map(notes.map(n => [n.id, n]));
  const best = new Map();
  for (const chunk of index) {
    const note = byId.get(chunk.note);
    if (!note || (course && note.course !== course) || !matchesChapter(note, chapter) || (favoritesOnly && !favorites.has(note.id)) || (!includeSources && chunk.kind === 'source')) continue;
    const title = compact(note.title + ' ' + chapterLabel(note)), heading = compact(chunk.heading), text = compact(chunk.text);
    if (!terms.every(term => (title + heading + text).includes(term))) continue;
    const score = terms.reduce((total, term) => total + (title.includes(term) ? 8 : 0) + (heading.includes(term) ? 5 : 0) + (text.includes(term) ? 2 : 0), chunk.kind === 'note' ? 2 : 0);
    const key = [chunk.note, chunk.kind, chunk.section].join(':');
    if (!best.has(key) || best.get(key).score < score) best.set(key, {...chunk, score, title: note.title, chapter: chapterLabel(note), course: note.course, date: note.date});
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
// Sidebar course badges come from each course's own name, never from list
// order. Published courses keep a fixed badge so a new course can never change
// them; other names use keyword rules, then the first distinctive character of
// the name that no other course uses.
const KNOWN_COURSE_SYMBOLS = {'光电子器件（全英文）':'器','光电子学':'电','微型计算机原理与接口技术':'微','激光原理':'激','物理光学':'物','通信原理C':'信'};
const courseKey = name => String(name || '').normalize('NFKC').replace(/\s+/g, '').replace(/\(/g, '（').replace(/\)/g, '）');
const COURSE_SYMBOL_RULES = [['器件','器'],['光电子','电'],['计算机','微'],['激光','激'],['物理','物'],['通信','信'],['信号','号'],['电路','路']];
const GENERIC_SYMBOL_CHARS = new Set([...'课程原理学与和及的之基础概论导引全英文中双语实验（）()［］[]·、，, -—_：:']);
const symbolChars = name => [...String(name || '').normalize('NFKC')].filter(c => /[\p{Script=Han}\p{L}\p{N}]/u.test(c));
export function courseSymbols(courses) {
  const result = new Map(), used = new Set(['全']);
  const names = [...new Set((courses || []).map(String).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'zh-CN'));
  const take = (name, symbol) => { result.set(name, symbol); used.add(symbol); };
  for (const name of names) {
    const known = KNOWN_COURSE_SYMBOLS[courseKey(name)];
    if (known && !used.has(known)) take(name, known);
  }
  for (const name of names) {
    if (result.has(name)) continue;
    const rule = COURSE_SYMBOL_RULES.find(([key, symbol]) => name.includes(key) && !used.has(symbol));
    if (rule) take(name, rule[1]);
  }
  for (const name of names) {
    if (result.has(name)) continue;
    const chars = symbolChars(name);
    const symbol = chars.find(c => !GENERIC_SYMBOL_CHARS.has(c) && !used.has(c.toLocaleUpperCase()))
      || chars.find(c => !used.has(c.toLocaleUpperCase())) || '课';
    take(name, symbol.toLocaleUpperCase());
  }
  return result;
}
export function courseSymbol(course, courses = [course]) { return course ? courseSymbols(courses).get(course) || '课' : '全'; }
// A citation without a published passage (e.g. an AI template such as
// [原文 Sxx](#source-xx)) is shown as plain text, never as a chip leading nowhere.
export function unlinkUnresolvedCitations(root, sources) {
  const ids = new Set((sources || []).map(s => String(s.id)));
  let count = 0;
  for (const a of [...root.querySelectorAll('a[href^="#source-"]')]) {
    if (ids.has(a.getAttribute('href').slice(8))) continue;
    a.replaceWith(a.ownerDocument.createTextNode(a.textContent)); count++;
  }
  return count;
}
