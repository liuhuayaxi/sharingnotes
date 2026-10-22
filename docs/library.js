import {escapeHtml as esc,stamp} from './core.js?v=protect2';
export function safeResourceUrl(value,kind){
  return new RegExp('^https://github\\.com/liuhuayaxi/sharingnotes/releases/download/course-media/'+kind+'-[a-f0-9]{64}\\.'+(kind==='audio'?'m4a':'pdf')+'$').test(value||'');
}
export function resourceMatches(item,course,query){return (!course||item.course===course)&&(!query||(item.course+' '+item.title+' '+(item.date||'')).toLocaleLowerCase().includes(query.toLocaleLowerCase()));}
export function initLibrary({resources,catalog,getCourse,openNote}){
  const $=id=>document.getElementById(id);let activeNote='',epoch=0,seekEpoch=0;
  const allAudio=resources.recordings.filter(x=>safeResourceUrl(x.url,'audio')||(x.pending&&!x.url));const recordings=new Map(allAudio.filter(x=>!x.pending).map(x=>[x.noteId,x]));
  const pdfs=resources.pdfs.filter(x=>safeResourceUrl(x.url,'pdf')||(x.pending&&!x.url));
  const size=bytes=>`${(bytes/1024/1024).toFixed(1)} MB`;
  const pdfCard=(p,related=false)=>`<article class="material-card"><div><span class="material-type">AI 友好版 PDF</span><h3>${esc(p.title)}</h3><p>${esc(p.course)} · ${p.pages||'?'} 页 · ${size(p.bytes)}${related?' · 本篇笔记使用的资料':''}</p></div>${p.pending?'<span class="material-pending">正在同步附件</span>':`<a class="quiet-button material-link" href="${p.url}" target="_blank" rel="noopener noreferrer">打开 / 下载 ↗</a>`}</article>`;
  function render(){
    const q=$('library-query').value.trim(),course=getCourse(),audio=[...allAudio].filter(x=>resourceMatches(x,course,q)).sort((a,b)=>b.date.localeCompare(a.date));
    const documents=pdfs.filter(x=>resourceMatches(x,course,q));
    $('materials-title').textContent=course?course+' · 课程资料库':'课程资料库';
    $('materials-count').textContent=`${audio.length} 节课堂录音 · ${documents.length} 份 AI 友好版 PDF${audio.some(x=>x.pending)||documents.some(x=>x.pending)?' · 首次附件同步中，刷新页面查看可用资料':''}`;
    $('library-recordings').innerHTML=audio.map(a=>`<article class="material-card"><div><span class="material-type">课堂录音 · ${esc(a.date)}</span><h3>${esc(a.title)}</h3><p>${esc(a.course)} · ${stamp(a.duration)} · ${size(a.bytes)}</p></div><div class="material-actions">${a.pending?`<span class="material-pending">正在同步附件</span><button class="quiet-button" type="button" data-resource-note="${a.noteId}">对应笔记 →</button>`:`<button class="quiet-button" type="button" data-listen-note="${a.noteId}">回听本节</button><button class="quiet-button" type="button" data-resource-note="${a.noteId}">对应笔记 →</button><a class="quiet-button material-link" href="${a.url}" target="_blank" rel="noopener noreferrer">下载录音 ↗</a>`}</div></article>`).join('')||'<p class="workspace-empty">暂无匹配的录音。</p>';
    $('library-pdfs').innerHTML=documents.map(p=>pdfCard(p)).join('')||'<p class="workspace-empty">暂无已完成的 AI 友好版 PDF。</p>';
  }
  function attachNote(note){
    epoch++;activeNote=note?.id||'';const audio=recordings.get(activeNote);const player=$('lesson-audio');player.pause();player.removeAttribute('src');player.load();$('lesson-replay').hidden=!audio;$('audio-status').textContent='';
    if(audio){$('audio-download').href=audio.url;$('audio-duration').textContent=`本节课堂录音 · ${stamp(audio.duration)}`;player.src=audio.url;player.playbackRate=Number($('audio-rate').value);}
    const related=new Set(resources.noteMaterials?.[activeNote]||[]);const docs=pdfs.filter(p=>related.has(p.id));$('note-materials').hidden=!docs.length;$('note-materials-list').innerHTML=docs.map(p=>pdfCard(p,true)).join('');
  }
  async function listen(noteId,seconds=0){
    if(!recordings.has(noteId))return;
    if(activeNote!==noteId){await openNote(noteId);if(activeNote!==noteId)return;}
    const token=epoch,seekToken=++seekEpoch,player=$('lesson-audio');$('lesson-replay').scrollIntoView({behavior:'smooth',block:'center'});$('audio-status').textContent='正在加载录音…';
    const seek=()=>{if(token!==epoch||seekToken!==seekEpoch)return;player.currentTime=Math.min(Math.max(0,Number(seconds)||0),Math.max(0,(Number.isFinite(player.duration)?player.duration:Infinity)-.1));};
    if(player.readyState>=1)seek();else player.addEventListener('loadedmetadata',seek,{once:true});
    try{await player.play();if(token===epoch)$('audio-status').textContent='正在回听，可拖动进度条定位。';}
    catch{if(token===epoch)$('audio-status').textContent='录音暂时无法播放，可以重试或下载后回听。';}
  }
  $('lesson-audio').addEventListener('error',()=>{if(activeNote)$('audio-status').textContent='录音加载失败，请重试或下载后回听。';});
  $('audio-rate').onchange=()=>$('lesson-audio').playbackRate=Number($('audio-rate').value);
  $('library-query').oninput=render;for(const button of document.querySelectorAll('[data-material-tab]'))button.onclick=()=>{const pdf=button.dataset.materialTab==='pdf';$('library-pdf-section').hidden=!pdf;$('library-audio-section').hidden=pdf;for(const tab of document.querySelectorAll('[data-material-tab]'))tab.setAttribute('aria-pressed',String(tab===button));};
  $('materials-library').onclick=event=>{const listenButton=event.target.closest('[data-listen-note]'),read=event.target.closest('[data-resource-note]');if(listenButton)listen(listenButton.dataset.listenNote);else if(read)openNote(read.dataset.resourceNote);};
  return {render,attachNote,listen,hasAudio:id=>recordings.has(id)};
}
