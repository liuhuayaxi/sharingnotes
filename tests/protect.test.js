import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {scramble,scrambledHtml,isEditable,installCopyProtection} from '../docs/protect.js';
import {newestNotes} from '../docs/core.js';

const docs=name=>new URL('../docs/'+name,import.meta.url);

test('workbench orders exact class times newest first without mutating the catalog',()=>{
  const notes=[{id:'a',title:'上午',date:'2026-10-16',lessonAt:'2026-10-16T08:00:00+08:00'},{id:'b',title:'下午',date:'2026-10-16',lessonAt:'2026-10-16T15:35:00+08:00'},{id:'c',title:'前一天',date:'2026-10-15',lessonAt:'2026-10-15T18:00:00+08:00'}];
  assert.deepEqual(newestNotes(notes).map(n=>n.id),['b','a','c']);assert.equal(notes[0].id,'a');
});

test('scrambled copy keeps the length but none of the original text',()=>{
  const original='布拉格条件：2d sin θ = mλ\n课堂原文 S1 · 0:00–1:00 Bragg condition';
  for(let round=0;round<20;round++){
    const garbage=scramble(original);
    assert.equal([...garbage].length,[...original].length);
    assert.equal(garbage.split('\n').length,original.split('\n').length);
    assert.notEqual(garbage,original);
    assert.equal(/[A-Za-z0-9=·:–]/.test(garbage),false,garbage);
    for(const word of ['布拉格','条件','课堂原文','Bragg','sin'])assert.equal(garbage.includes(word),false);
  }
  assert.ok([...scramble('')].length>=24);
});
test('scrambled HTML clipboard is escaped noise only',()=>{
  const html=scrambledHtml('<b>公式</b>');
  assert.ok(html.startsWith('<meta charset="utf-8"><span>'));
  assert.equal(/<b>|公式/.test(html),false);
});

function fakeDocument(){
  const listeners={};
  const doc={addEventListener:(type,fn)=>(listeners[type]??=[]).push(fn),activeElement:null,defaultView:{getSelection:()=>'课堂原文：真实转写内容'}};
  const fire=(type,init={})=>{const event={defaultPrevented:false,preventDefault(){this.defaultPrevented=true;},stopImmediatePropagation(){},...init};for(const fn of listeners[type]||[])fn(event);return event;};
  return {doc,fire};
}
const element=(tag,{type='',inside=[]}={})=>({nodeType:1,tagName:tag.toUpperCase(),type,closest(selector){const names=[tag,...inside];return selector.split(',').some(s=>names.includes(s.trim()))?this:null;}});

test('forced copy of page content writes garbage for text and HTML',()=>{
  const {doc,fire}=fakeDocument();installCopyProtection(doc);
  const data={};const event=fire('copy',{target:element('p'),clipboardData:{setData:(type,value)=>{data[type]=value;}}});
  assert.equal(event.defaultPrevented,true);
  assert.equal(data['text/plain'].includes('真实转写'),false);assert.equal([...data['text/plain']].length,[...'课堂原文：真实转写内容'].length);
  assert.ok(data['text/html']);assert.equal(data['text/html'].includes('真实转写'),false);
  assert.equal(fire('cut',{target:element('p'),clipboardData:{setData(){}}}).defaultPrevented,true);
});
test('search boxes and the personal note keep normal copy, selection and shortcuts',()=>{
  const {doc,fire}=fakeDocument();installCopyProtection(doc);
  const search=element('input',{type:'search'}),textarea=element('textarea');
  doc.activeElement=search;
  assert.equal(fire('copy',{target:search,clipboardData:{setData(){throw new Error('must not overwrite');}}}).defaultPrevented,false);
  assert.equal(fire('selectstart',{target:textarea}).defaultPrevented,false);
  assert.equal(fire('contextmenu',{target:search}).defaultPrevented,false);
  assert.equal(fire('keydown',{target:search,metaKey:true,key:'c',code:'KeyC'}).defaultPrevented,false);
  assert.equal(fire('keydown',{target:search,ctrlKey:true,key:'a',code:'KeyA'}).defaultPrevented,false);
  assert.equal(isEditable(element('input',{type:'checkbox'})),false);
});
test('content selection, context menu, drag and copy/save/print/source shortcuts are blocked',()=>{
  const {doc,fire}=fakeDocument();installCopyProtection(doc);
  const text={nodeType:3,parentElement:element('p')};
  assert.equal(fire('selectstart',{target:text}).defaultPrevented,true);
  assert.equal(fire('contextmenu',{target:element('img')}).defaultPrevented,true);
  assert.equal(fire('dragstart',{target:element('img')}).defaultPrevented,true);
  for(const key of ['c','x','a','s','p','u'])assert.equal(fire('keydown',{target:element('body'),ctrlKey:true,key,code:'Key'+key.toUpperCase()}).defaultPrevented,true,key);
  assert.equal(fire('keydown',{target:element('body'),metaKey:true,altKey:true,key:'ú',code:'KeyU'}).defaultPrevented,true);
  assert.equal(fire('keydown',{target:element('body'),key:'/',code:'Slash'}).defaultPrevented,false);
  // Course materials (AI PDFs) keep their link menu for downloading.
  assert.equal(fire('contextmenu',{target:element('a',{inside:['a.material-link']})}).defaultPrevented,false);
});

test('note and transcript downloads are gone while course materials stay downloadable',()=>{
  const html=readFileSync(docs('index.html'),'utf8'),app=readFileSync(docs('app.js'),'utf8'),workspace=readFileSync(docs('workspace.js'),'utf8'),library=readFileSync(docs('library.js'),'utf8');
  for(const id of ['open-downloads','workspace-download','download-text','print-note','download-dialog','download-with-sources','build-download'])assert.equal(html.includes(`id="${id}"`),false,id);
  assert.equal(/打包下载|下载本篇|下载包/.test(html+workspace),false);
  assert.equal(/createPackageBuilder|initDownloadPicker|\.download\s*=|application\/zip|window\.print/.test(app+workspace),false);
  for(const file of ['package.js','zip-worker.js','offline-assets.json','vendor/fflate/fflate.js'])assert.equal(existsSync(docs(file)),false,file);
  assert.equal(html.includes('id="audio-download"'),false);assert.equal(library.includes('下载录音'),false);assert.ok(library.includes('打开 / 下载'));
  assert.ok(html.indexOf('protect.js')>0&&html.indexOf('protect.js')<html.indexOf('app.js'));
});
test('copy protection CSS changes selection only and print hiding is print-only',()=>{
  const css=readFileSync(docs('style.css'),'utf8');
  assert.match(css,/html\{-webkit-user-select:none;user-select:none;-webkit-touch-callout:none\}/);
  assert.match(css,/input,textarea,select,[^{]*\{-webkit-user-select:text;user-select:text/);
  assert.match(css,/@media print\{body>\*\{display:none!important\}/);
});
