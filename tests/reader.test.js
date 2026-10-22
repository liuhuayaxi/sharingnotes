import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync, readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {safeNoteFile, safeImageFile, searchText, highlightedHtml, snippet, stamp, reviewLabel} from '../docs/core.js';

test('only exported local note paths can be fetched',()=>{
  assert.equal(safeNoteFile('notes/0123456789abcdef0123-012345abcdef.json'),true);
  for(const file of ['https://example.com/note.json','../private.json','notes/../settings.json','notes/x.json']) assert.equal(safeNoteFile(file),false);
});
test('image paths accept only content-addressed published PNGs',()=>{
  assert.equal(safeImageFile('data/images/'+'a'.repeat(64)+'.png'),true);
  for(const file of ['https://example.com/image.png','data:image/png;base64,abc','../private.png','data/images/../../private.png','assets/fig-1234567890abcdef.png'])assert.equal(safeImageFile(file),false);
});
test('Chinese and English ordinary text search respects course and source filters',()=>{
  const notes=[{id:'a',title:'DFB 激光器',course:'光电子学',date:'2026-10-17'},{id:'b',title:'全反射',course:'物理光学',date:'2026-10-16'}];
  const index=[{note:'a',kind:'note',section:'section-1',heading:'布拉格条件',text:'DFB 激光器的布拉格波长。'},{note:'b',kind:'source',section:'source-1',heading:'课堂原文',text:'全反射以及布拉格条件。'}];
  assert.equal(searchText(index,'dfb 布拉格',notes).length,1);
  assert.equal(searchText(index,'布拉格',notes).length,1);
  assert.equal(searchText(index,'布拉格',notes,{includeSources:true}).length,2);
  assert.equal(searchText(index,'布拉格',notes,{includeSources:true,course:'物理光学'})[0].note,'b');
});
test('search highlighting escapes all non-highlight markup',()=>{
  const result=highlightedHtml('<img src=x onerror=alert(1)> 布拉格','布拉格');
  assert.equal(result.includes('<img'),false);assert.equal(result.includes('<mark>布拉格</mark>'),true);
  assert.doesNotThrow(()=>highlightedHtml('a+b (test)','a+b (test)'));
});
test('search previews hide source markup and internal authoring comments',()=>{
  const text=snippet('## 布拉格 <strong>条件</strong> <!-- knowledge:internal --> [原文 S1](#source-1)','布拉格');
  assert.equal(/<strong>|knowledge:|#source-|##/.test(text),false);
  assert.equal(text.includes('布拉格 条件'),true);
});
test('source time labels and review states retain their meaning',()=>{
  assert.equal(stamp(3661),'1:01:01');assert.equal(stamp(61),'1:01');assert.equal(reviewLabel('pending'),'待核对');
});
test('published page has no school credential fields, authentication scripts or school network permission',()=>{
  const html=readFileSync(new URL('../docs/index.html',import.meta.url),'utf8');
  assert.equal(/type=["']password/.test(html),false);assert.equal(html.includes("connect-src 'self'"),true);
  for(const file of ['auth.js','callback.js','result.js']) assert.equal(existsSync(new URL('../docs/'+file,import.meta.url)),false);
  const app=readFileSync(new URL('../docs/app.js',import.meta.url),'utf8');
  assert.equal(/ssoLogin|checkAccount|i\.njupt\.edu\.cn/.test(app),false);
});
test('public assets contain no media or raw application configuration files',()=>{
  const walk=folder=>readdirSync(folder,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(new URL(e.name+'/',folder)):[e.name]);
  const names=walk(new URL('../docs/',import.meta.url));
  for(const name of names) assert.equal(/\.(mp3|mp4|m4a|aac|flac|wav|pdf|db|sqlite|zip)$/i.test(name),false,name);
});
test('all published notes match their manifest and every citation has a source target',()=>{
  const root=new URL('../docs/data/',import.meta.url);
  const catalog=JSON.parse(readFileSync(new URL('catalog.json',root),'utf8'));
  const manifest=JSON.parse(readFileSync(new URL('publish-manifest.json',root),'utf8'));
  assert.equal(catalog.authentication,'disabled');assert.equal(catalog.includesImages,true);
  for(const entry of catalog.notes){
    assert.equal(safeNoteFile(entry.file),true);
    const bytes=readFileSync(new URL(entry.file,root));const note=JSON.parse(bytes);
    assert.equal(createHash('sha256').update(bytes).digest('hex'),manifest.notes.find(m=>m.id===entry.id).sha256);
    const sources=new Set(note.sources.map(s=>s.id));
    for(const match of note.markdown.matchAll(/\]\(#source-(\d+)\)/g))assert.equal(sources.has(match[1]),true,entry.id+':'+match[1]);
    const serialized=JSON.stringify(note);
    assert.equal(/\/Users\/|file:\/\/|"(?:inference_settings|course_settings|downloads|audio_filename)":/.test(serialized),false);
    const imagePaths=new Set((note.images||[]).map(image=>image.src));
    for(const match of note.markdown.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g))assert.equal(imagePaths.has(match[1])&&safeImageFile(match[1]),true);
    for(const image of note.images||[]){
      assert.equal(safeImageFile(image.src),true);
      const imageBytes=readFileSync(new URL('../docs/'+image.src,import.meta.url));
      assert.equal(createHash('sha256').update(imageBytes).digest('hex'),image.sha256);
      assert.equal(imageBytes.subarray(1,4).toString(),'PNG');
      assert.equal(imageBytes.readUInt32BE(16),image.width);assert.equal(imageBytes.readUInt32BE(20),image.height);
    }
  }
});
