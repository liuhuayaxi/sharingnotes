import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {safeResourceUrl,resourceMatches} from '../docs/library.js';
test('only published content addressed course attachments can play or open',()=>{
 const base='https://github.com/liuhuayaxi/sharingnotes/releases/download/course-media/';
 assert.ok(safeResourceUrl(base+'audio-'+'a'.repeat(64)+'.m4a','audio'));
 assert.ok(safeResourceUrl(base+'pdf-'+'b'.repeat(64)+'.pdf','pdf'));
 for(const url of ['javascript:alert(1)','http://127.0.0.1:8765/api/settings',base+'../secret',base+'audio-'+'a'.repeat(64)+'.m4a?token=secret',base.replace('sharingnotes','other')+'pdf-'+'a'.repeat(64)+'.pdf'])assert.equal(safeResourceUrl(url,'audio'),false);
});
test('materials search keeps course and date filtering together',()=>{
 const item={course:'物理光学',title:'全反射与隐失波',date:'2026-10-16'};
 assert.ok(resourceMatches(item,'物理光学','全反射'));assert.ok(resourceMatches(item,'','2026-10'));
 assert.equal(resourceMatches(item,'光电子学','全反射'),false);assert.equal(resourceMatches(item,'','8086'),false);
});

test('published recording and PDF associations contain only public data',()=>{
 const url=new URL('../docs/data/resources.json',import.meta.url);if(!existsSync(url))return;
 const raw=readFileSync(url,'utf8'),data=JSON.parse(raw),catalog=JSON.parse(readFileSync(new URL('../docs/data/catalog.json',import.meta.url)));
 const ids=new Set(catalog.notes.map(n=>n.id)),pdfs=new Set(data.pdfs.map(p=>p.id));
 assert.equal(/\/Users\/|file:\/\/|token_file|inference_settings|course_settings/.test(raw),false);
 for(const a of data.recordings){assert.ok(ids.has(a.noteId));assert.ok(safeResourceUrl(a.url,'audio')||(a.pending&&!a.url));assert.ok(a.bytes>0);}
 for(const p of data.pdfs)assert.ok(safeResourceUrl(p.url,'pdf')||(p.pending&&!p.url));
 for(const [note,materials]of Object.entries(data.noteMaterials)){assert.ok(ids.has(note));for(const id of materials)assert.ok(pdfs.has(id));}
});
