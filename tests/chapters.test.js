import test from 'node:test';
import assert from 'node:assert/strict';
import {noteChapters,chapterLabel,chapterCounts,matchesChapter,scopedNotes,searchText,UNASSIGNED_CHAPTER} from '../docs/core.js';
const notes=[
  {id:'a',title:'早课',course:'课程A',chapter:'第1章',chapters:['第1章'],date:'2026-10-01',lessonAt:'2026-10-01T08:00:00+08:00'},
  {id:'b',title:'跨章课',course:'课程A',chapter:'第1章 · 第2章',chapters:['第1章','第2章'],date:'2026-10-01',lessonAt:'2026-10-01T10:00:00+08:00'},
  {id:'c',title:'第3章写在标题但未确认',course:'课程A',date:'2026-10-02'},
  {id:'d',title:'另一课程',course:'课程B',chapter:'第1章',date:'2026-10-03'},
];
test('chapter metadata accepts explicit membership and leaves old snapshots unassigned',()=>{
  assert.deepEqual(noteChapters(notes[1]),['第1章','第2章']);
  assert.deepEqual(noteChapters(notes[2]),[]);
  assert.equal(chapterLabel(notes[2]),'章节待确认');
  assert.equal(matchesChapter(notes[2],UNASSIGNED_CHAPTER),true);
  assert.equal(matchesChapter(notes[2],'第3章'),false);
  assert.deepEqual(noteChapters({chapter:'第1章',chapters:[null,1,' 第1章 ','第1章']}),['第1章']);
});
test('chapter counts include cross-chapter classes once per chapter in teaching order',()=>{
  assert.deepEqual(chapterCounts(notes,'课程A'),[
    {chapter:'第1章',label:'第1章',notes:2},
    {chapter:'第2章',label:'第2章',notes:1},
    {chapter:UNASSIGNED_CHAPTER,label:'章节待确认',notes:1},
  ]);
});
test('course chapter and favorite constraints intersect before chronological navigation',()=>{
  assert.deepEqual(scopedNotes(notes,{course:'课程A',chapter:'第1章',sort:'oldest'}).map(n=>n.id),['a','b']);
  assert.deepEqual(scopedNotes(notes,{course:'课程A',chapter:'第1章',favoritesOnly:true,favorites:new Set(['b','d'])}).map(n=>n.id),['b']);
  assert.deepEqual(scopedNotes(notes,{course:'课程A',chapter:UNASSIGNED_CHAPTER}).map(n=>n.id),['c']);
  assert.deepEqual(scopedNotes(notes,{course:'课程A',chapter:'不存在的章'}),[]);
});
test('search respects chapter and favorites for both notes and source passages',()=>{
  const index=notes.flatMap(n=>['note','source'].map(kind=>({note:n.id,kind,section:kind+'1',heading:'欧姆定律',text:'电压等于电流乘电阻'})));
  const results=searchText(index,'欧姆',notes,{course:'课程A',chapter:'第1章',favoritesOnly:true,favorites:new Set(['b','d']),includeSources:true});
  assert.deepEqual(results.map(r=>r.note),['b','b']);
  assert.equal(searchText(index,'欧姆',notes,{course:'课程A',chapter:'第2章'}).length,1);
  assert.equal(searchText(index,'欧姆',notes,{course:'课程A',chapter:UNASSIGNED_CHAPTER})[0].note,'c');
});
