import {escapeHtml as esc, newestNotes, snippet} from './core.js?v=noaudio1';

export function initWorkspace({catalog, getFavorites, getCourse, openNote}) {
  const root=document.getElementById('workspace');
  function render({favoritesOnly=false}={}) {
    const course=getCourse();
    const notes=newestNotes(catalog.notes.filter(n=>(!course||n.course===course)&&(!favoritesOnly||getFavorites().has(n.id))));
    document.getElementById('workspace-title').textContent=favoritesOnly?'我的收藏':course||'复习工作台';
    document.getElementById('workspace-description').textContent=`${course?'当前课程':'全部课程'} · ${notes.length} 篇笔记，按上课时间从近到远排列`;
    const days=new Map();
    for(const note of notes){if(!days.has(note.date))days.set(note.date,[]);days.get(note.date).push(note);}
    document.getElementById('workspace-timeline').innerHTML=[...days].map(([date,rows],i)=>`<section class="timeline-day"><div class="timeline-date"><time datetime="${date}">${esc(date.slice(5).replace('-',' / '))}</time><span>${i===0?'最近的课':date.slice(0,4)}</span></div><div class="timeline-notes">${rows.map(note=>{
      const excerpt=snippet(note.abstract||'', '').replace(/…$/,'');
      const time=/T(\d{2}:\d{2})/.exec(note.lessonAt||'')?.[1]||'';
      return `<article class="workspace-note"><button class="workspace-note-open" data-open-note="${note.id}" type="button"><span class="workspace-note-top"><span class="course-badge">${esc(note.course)}</span><span>${esc(time)}</span></span><h3>${esc(note.title)}</h3>${excerpt?`<p>${esc(excerpt.slice(0,165))}</p>`:''}<span class="workspace-note-meta">${Math.round(note.wordCount/100)/10} 千字${note.imageCount?' · '+note.imageCount+' 幅配图':''} · ${note.sourceCount} 段原文</span></button><div class="workspace-note-actions"><button class="quiet-button" data-open-note="${note.id}" type="button">开始阅读 →</button></div></article>`;
    }).join('')}</div></section>`).join('')||'<p class="workspace-empty">这里暂时没有笔记。可以切换课程或取消收藏筛选。</p>';
  }
  root.addEventListener('click',event=>{
    const open=event.target.closest('[data-open-note]');if(open)openNote(open.dataset.openNote);
  });
  return {render};
}
