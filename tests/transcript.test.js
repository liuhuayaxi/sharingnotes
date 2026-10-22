import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {encodeTranscript,decodeTranscript,revealNote,revealIndex,transcriptSeed} from '../docs/cipher.js';
import {searchText} from '../docs/core.js';

const data=name=>new URL('../docs/data/'+name,import.meta.url);
const sample='课堂原文：布拉格条件 2d sin θ = mλ，啊这个应该没什么问题吧。\n\n第二段 Bragg 😀';

test('transcript cipher round-trips and is keyed per note, passage and part',async()=>{
  const cipher=await encodeTranscript(sample,'a'.repeat(20),'source-3',0);
  assert.match(cipher,/^[A-Za-z0-9+/]+=*$/);
  assert.equal(await decodeTranscript(cipher,'a'.repeat(20),'source-3',0),sample);
  await assert.rejects(decodeTranscript(cipher,'b'.repeat(20),'source-3',0));
  assert.notEqual(transcriptSeed('a','source-1','note'),transcriptSeed('a','source-1',0));
  assert.equal(await decodeTranscript('','a','source-1',0),'');
});
test('browser decoder reads exactly what the Python exporter writes',async()=>{
  const script="import json,sys;sys.path.insert(0,'scripts');from export_courses import transcript_cipher as c;print(json.dumps([c(sys.argv[1],'n'*20,'source-7','note'),c(sys.argv[1],'n'*20,'source-7',2)]))";
  const run=spawnSync(process.env.PYTHON||'python3',['-c',script,sample],{cwd:new URL('..',import.meta.url),encoding:'utf8'});
  assert.equal(run.status,0,run.stderr);
  const [forNote,forIndex]=JSON.parse(run.stdout);
  assert.equal(await decodeTranscript(forNote,'nnnnnnnnnnnnnnnnnnnn','source-7','note'),sample);
  assert.equal(await decodeTranscript(forIndex,'nnnnnnnnnnnnnnnnnnnn','source-7',2),sample);
});
test('revealed notes and index restore readable classroom text in memory only',async()=>{
  const id='c'.repeat(20),text='真实转写内容';
  const note={id,sources:[{id:'1',start:0,end:5,corrected:true,cipher:await encodeTranscript(text,id,'source-1','note')}]};
  await revealNote(note);assert.equal(note.sources[0].text,text);
  const index=[{note:id,kind:'note',section:'section-1',heading:'h',text:'笔记正文'},{note:id,kind:'source',section:'source-1',heading:'课堂原文 S1',part:0,cipher:await encodeTranscript(text,id,'source-1',0)}];
  await revealIndex(index);
  const notes=[{id,title:'t',course:'c',date:'2026-10-20'}];
  assert.equal(searchText(index,'转写',notes).length,0);
  const hits=searchText(index,'转写',notes,{includeSources:true});assert.equal(hits.length,1);assert.equal(hits[0].text,text);
});
test('published notes and search index carry no plain classroom text but decode completely',async()=>{
  const catalog=JSON.parse(readFileSync(data('catalog.json'),'utf8'));
  const decodedByNote=new Map();
  for(const meta of catalog.notes){
    const note=JSON.parse(readFileSync(data(meta.file),'utf8'));
    assert.equal(note.sources.length,meta.sourceCount);
    for(const source of note.sources){assert.equal('text' in source,false);assert.equal(typeof source.cipher,'string');}
    await revealNote(note);
    for(const source of note.sources)assert.ok(source.text.trim().length>0,meta.id+':'+source.id);
    decodedByNote.set(note.id,new Map(note.sources.map(s=>[s.section||'source-'+s.id,s.text])));
  }
  const index=JSON.parse(readFileSync(data('search-index.json'),'utf8'));
  const sources=index.filter(x=>x.kind==='source');
  for(const chunk of sources){assert.equal('text' in chunk,false);assert.equal(typeof chunk.cipher,'string');assert.ok(Number.isInteger(chunk.part));}
  await revealIndex(index);
  const joined=new Map();for(const chunk of sources){const key=chunk.note+'|'+chunk.section;joined.set(key,(joined.get(key)||'')+chunk.text);}
  for(const [key,text]of joined){const [note,section]=key.split('|');const expected=decodedByNote.get(note)?.get(section);if(expected!==undefined)assert.equal(text,expected,key);}
});
