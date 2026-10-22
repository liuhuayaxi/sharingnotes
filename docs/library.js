import {escapeHtml as esc} from './core.js?v=icons1';
// Recordings are never published: only content-addressed AI PDFs on the
// course-media release are accepted as resource links.
export function safeResourceUrl(value){
  return /^https:\/\/github\.com\/liuhuayaxi\/sharingnotes\/releases\/download\/course-media\/pdf-[a-f0-9]{64}\.pdf$/.test(value||'');
}
export function resourceMatches(item,course,query){return (!course||item.course===course)&&(!query||(item.course+' '+item.title+' '+(item.date||item.updatedAt||'')).toLocaleLowerCase().includes(query.toLocaleLowerCase()));}
export function initLibrary({resources,getCourse,openNote}){
  const $=id=>document.getElementById(id);
  const pdfs=(resources.pdfs||[]).filter(x=>safeResourceUrl(x.url)||(x.pending&&!x.url));
  const size=bytes=>`${(bytes/1024/1024).toFixed(1)} MB`;
  const pdfCard=(p,related=false)=>`<article class="material-card"><div><span class="material-type">AI 友好版 PDF</span><h3>${esc(p.title)}</h3><p>${esc(p.course)} · ${p.pages||'?'} 页 · ${size(p.bytes)}${related?' · 本篇笔记使用的资料':''}</p></div>${p.pending?'<span class="material-pending">正在同步附件</span>':`<a class="quiet-button material-link" href="${p.url}" target="_blank" rel="noopener noreferrer">打开 / 下载 ↗</a>`}</article>`;
  function render(){
    const q=$('library-query').value.trim(),course=getCourse();
    const documents=pdfs.filter(x=>resourceMatches(x,course,q));
    $('materials-title').textContent=course?course+' · 课程资料库':'课程资料库';
    $('materials-count').textContent=`${documents.length} 份 AI 友好版 PDF${documents.some(x=>x.pending)?' · 首次附件同步中，刷新页面查看可用资料':''}`;
    $('library-pdfs').innerHTML=documents.map(p=>pdfCard(p)).join('')||'<p class="workspace-empty">暂无已完成的 AI 友好版 PDF。</p>';
  }
  function attachNote(note){
    const related=new Set(resources.noteMaterials?.[note?.id||'']||[]);const docs=pdfs.filter(p=>related.has(p.id));$('note-materials').hidden=!docs.length;$('note-materials-list').innerHTML=docs.map(p=>pdfCard(p,true)).join('');
  }
  $('library-query').oninput=render;
  $('materials-library').onclick=event=>{const read=event.target.closest('[data-resource-note]');if(read)openNote(read.dataset.resourceNote);};
  return {render,attachNote};
}
