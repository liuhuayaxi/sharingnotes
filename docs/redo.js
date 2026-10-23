/** Interactive 「重做雨课堂习题」 panel for notes that contain ## 课上习题. */

const SECTION = '## 课上习题';
const EXERCISE_RE = /^### 第\s*(\d+)\s*题\s*\n+([\s\S]*?)(?=^### 第\s*\d+\s*题\s*$|\Z)/gm;
const ANSWER_RE = /\n\*\*答案\*\*[:：]?\s*([\s\S]*?)(?=\n\*\*解析\*\*|$)/;
const EXPLAIN_RE = /\n\*\*解析\*\*[:：]?\s*([\s\S]*)$/;

export function extractExercises(markdown) {
  if (!markdown || !markdown.includes(SECTION)) return [];
  const start = markdown.indexOf(SECTION);
  const rest = markdown.slice(start);
  const next = rest.search(/\n## (?!课上习题)/);
  const body = next < 0 ? rest : rest.slice(0, next);
  const parts = body.split(/^### 第\s*(\d+)\s*题\s*$/m);
  // split yields [preamble, num, body, num, body, ...]
  const out = [];
  for (let i = 1; i < parts.length; i += 2) {
    const number = Number(parts[i]);
    let raw = (parts[i + 1] || '').replace(/<!--\s*yuketang:[^>]*-->\s*/g, '');
    const answerMatch = raw.match(ANSWER_RE);
    const explainMatch = raw.match(EXPLAIN_RE);
    const stem = raw.split(/\n\*\*(?:答案|解析)\*\*/)[0].replace(/\n{3,}/g, '\n\n').trim();
    if (!stem) continue;
    out.push({
      number,
      stem,
      answer: (answerMatch?.[1] || '').trim(),
      explanation: (explainMatch?.[1] || '').trim(),
    });
  }
  return out;
}

export function storageKey(noteId) {
  return 'shared-course-notes.redo.' + noteId;
}

export function loadProgress(noteId, readLocal) {
  try {
    const raw = JSON.parse(readLocal(storageKey(noteId), '{}') || '{}');
    return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  } catch {
    return {};
  }
}

function esc(text) {
  return String(text).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
}

const BLANK_TOKEN = (n) => `@@REDOBLANK:${n}@@`;
const BLANK_TOKEN_RE = /@@REDOBLANK:(\d+)@@/g;

/** Render stem like the note body (KaTeX via renderMarkdown), then restore blank inputs.
 *  Inputs are injected after sanitize because renderMarkdown forbids <input>. */
export function stemHtml(stem, {renderMarkdown} = {}) {
  const withTokens = String(stem || '').replace(/\[填空\s*(\d+)\]/g, (_m, n) => BLANK_TOKEN(n));
  let html;
  if (typeof renderMarkdown === 'function') {
    html = renderMarkdown(withTokens);
  } else {
    html = esc(withTokens).replace(/\n/g, '<br>');
  }
  return html.replace(BLANK_TOKEN_RE, (_m, n) =>
    `<input class="redo-blank" type="text" data-blank="${esc(n)}" aria-label="填空${esc(n)}" autocomplete="off" spellcheck="false">`);
}

export function renderRedoPanel(exercises, progress, {renderMarkdown}) {
  if (!exercises.length) return '';
  const cards = exercises.map(ex => {
    const saved = progress[String(ex.number)] || {};
    const done = Boolean(saved.done);
    const revealed = Boolean(saved.revealed);
    const draft = typeof saved.draft === 'string' ? saved.draft : '';
    return `<article class="redo-card" data-number="${ex.number}" data-done="${done}" data-revealed="${revealed}">
      <header class="redo-card-header"><span>第${ex.number}题</span><span class="redo-card-status">${done ? '已重做' : revealed ? '已核对' : '待作答'}</span></header>
      <div class="redo-stem markdown-body">${stemHtml(ex.stem, {renderMarkdown})}</div>
      <label class="redo-draft-label">我的作答（可选，仅保存在本浏览器）
        <textarea class="redo-draft" rows="3" placeholder="写下填空或简答…">${esc(draft)}</textarea>
      </label>
      <div class="redo-actions">
        <button type="button" class="quiet-button redo-check" data-action="reveal">${revealed ? '隐藏答案' : '核对答案与解析'}</button>
        <button type="button" class="quiet-button redo-mark" data-action="toggle-done">${done ? '取消勾选' : '标记已重做'}</button>
      </div>
      <div class="redo-answer" ${revealed ? '' : 'hidden'}>
        <h4>答案</h4>
        <div class="markdown-body">${renderMarkdown(ex.answer || '（笔记未收录答案）')}</div>
        ${ex.explanation ? `<h4>解析</h4><div class="markdown-body">${renderMarkdown(ex.explanation)}</div>` : ''}
      </div>
    </article>`;
  }).join('');
  const doneCount = exercises.filter(ex => progress[String(ex.number)]?.done).length;
  return `<section class="redo-panel" id="redo-panel" aria-label="重做雨课堂习题">
    <div class="redo-heading">
      <p class="eyebrow">REDO · YUKETANG</p>
      <h2>重做雨课堂习题</h2>
      <p class="redo-lead">先独立作答，再核对笔记中的答案与解析。进度保存在当前浏览器（${doneCount}/${exercises.length} 已重做）。</p>
    </div>
    ${cards}
  </section>`;
}

export function mountRedo({host, markdown, noteId, readLocal, writeLocal, renderMarkdown, toast}) {
  const exercises = extractExercises(markdown);
  if (!host) return {exercises: [], destroy() {}};
  if (!exercises.length) {
    host.hidden = true;
    host.replaceChildren();
    return {exercises: [], destroy() {}};
  }
  let progress = loadProgress(noteId, readLocal);
  const save = () => {
    writeLocal(storageKey(noteId), JSON.stringify(progress));
  };
  const paint = () => {
    host.hidden = false;
    host.innerHTML = renderRedoPanel(exercises, progress, {renderMarkdown});
  };
  paint();
  const onClick = event => {
    const button = event.target.closest('[data-action]');
    const card = event.target.closest('.redo-card');
    if (!button || !card) return;
    const number = card.dataset.number;
    const entry = {...(progress[number] || {})};
    if (button.dataset.action === 'reveal') {
      entry.revealed = !entry.revealed;
    } else if (button.dataset.action === 'toggle-done') {
      entry.done = !entry.done;
      if (entry.done) entry.revealed = true;
      toast?.(entry.done ? `第${number}题已标记为重做` : `已取消第${number}题勾选`);
    }
    progress = {...progress, [number]: entry};
    save();
    paint();
  };
  const onInput = event => {
    const card = event.target.closest('.redo-card');
    if (!card || !event.target.classList.contains('redo-draft')) return;
    const number = card.dataset.number;
    progress = {...progress, [number]: {...(progress[number] || {}), draft: event.target.value}};
    save();
  };
  host.addEventListener('click', onClick);
  host.addEventListener('input', onInput);
  return {
    exercises,
    destroy() {
      host.removeEventListener('click', onClick);
      host.removeEventListener('input', onInput);
    },
  };
}
