import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {safeResourceUrl,resourceMatches} from '../docs/library.js';
test('only published content addressed PDF attachments can open; recordings never can',()=>{
 const base='https://github.com/liuhuayaxi/sharingnotes/releases/download/course-media/';
 assert.ok(safeResourceUrl(base+'pdf-'+'b'.repeat(64)+'.pdf'));
 for(const url of ['javascript:alert(1)','http://127.0.0.1:8765/api/settings',base+'../secret',base+'audio-'+'a'.repeat(64)+'.m4a',base+'audio-'+'a'.repeat(64)+'.m4a?token=secret',base+'pdf-'+'a'.repeat(64)+'.pdf?x=1',base.replace('sharingnotes','other')+'pdf-'+'a'.repeat(64)+'.pdf'])assert.equal(safeResourceUrl(url),false,url);
});
test('materials search keeps course and date filtering together',()=>{
 const item={course:'物理光学',title:'全反射与隐失波',date:'2026-10-16'};
 assert.ok(resourceMatches(item,'物理光学','全反射'));assert.ok(resourceMatches(item,'','2026-10'));
 assert.equal(resourceMatches(item,'光电子学','全反射'),false);assert.equal(resourceMatches(item,'','8086'),false);
});

test('published PDF associations contain only public data and no recordings',()=>{
 const url=new URL('../docs/data/resources.json',import.meta.url);if(!existsSync(url))return;
 const raw=readFileSync(url,'utf8'),data=JSON.parse(raw),catalog=JSON.parse(readFileSync(new URL('../docs/data/catalog.json',import.meta.url)));
 const ids=new Set(catalog.notes.map(n=>n.id)),pdfs=new Set(data.pdfs.map(p=>p.id));
 assert.equal(/\/Users\/|file:\/\/|token_file|inference_settings|course_settings/.test(raw),false);
 assert.equal('recordings' in data,false);assert.equal(/audio-[a-f0-9]{64}|\.m4a\b/.test(raw),false);
 for(const p of data.pdfs)assert.ok(safeResourceUrl(p.url)||(p.pending&&!p.url));
 for(const [note,materials]of Object.entries(data.noteMaterials)){assert.ok(ids.has(note));for(const id of materials)assert.ok(pdfs.has(id));}
});

test('the site has no recording player, recording download or replay-from-timestamp feature',()=>{
 const read=name=>readFileSync(new URL('../docs/'+name,import.meta.url),'utf8');
 const html=read('index.html'),app=read('app.js'),library=read('library.js'),protect=read('protect.js');
 assert.equal(/<audio|lesson-audio|lesson-replay|audio-download|audio-rate|data-material-tab="audio"|library-recordings/.test(html),false);
 assert.equal(/下载录音|回听|课堂录音/.test(html+app+library),false);
 assert.equal(/listen\(|hasAudio|currentTime|\.play\(/.test(app+library),false);
 assert.equal(/audio/.test(protect.match(/MATERIAL_SELECTOR = '([^']*)'/)[1]),false);
});
