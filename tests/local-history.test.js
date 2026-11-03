import test from 'node:test';
import assert from 'node:assert/strict';
import {createStudyClock,splitDays,dayKey,readStudyDays} from '../docs/study.js';
import {saveReadingPosition,restoreReadingPosition} from '../docs/reading-progress.js';
const storage=()=>{const map=new Map();return {get length(){return map.size;},key:i=>[...map.keys()][i],getItem:k=>map.get(k)||null,setItem:(k,v)=>map.set(k,v)};};
test('study clock excludes unfocused intervals, flushes on leaving, and skips sleep gaps',()=>{
 let mono=0, wall=new Date(2026,10,3,12).getTime(), total=0;
 const clock=createStudyClock({monotonic:()=>mono,wall:()=>wall,add:(_,ms)=>total+=ms});
 const advance=ms=>{mono+=ms;wall+=ms;};
 advance(5000);clock.flush();assert.equal(total,0);
 clock.setActive(true);advance(5000);clock.flush();assert.equal(total,5000);
 advance(1250);clock.setActive(false);assert.equal(total,6250);
 advance(10000);clock.flush();assert.equal(total,6250);
 clock.setActive(true);advance(120000);clock.flush();assert.equal(total,6250);
 advance(2000);clock.flush();assert.equal(total,8250);
});
test('study intervals crossing local midnight are split across dates',()=>{
 const start=new Date(2026,10,3,23,59,58).getTime(), end=start+5000;
 assert.deepEqual(splitDays(start,end),[['2026-11-03',2000],['2026-11-04',3000]]);
 assert.equal(dayKey(new Date(2026,0,2)),'2026-01-02');
});
test('separate page records merge without overwriting and ignore corrupt data',()=>{
 const s=storage();s.setItem('shared-course-notes.study.v1.a',JSON.stringify({'2026-11-03':2000}));
 s.setItem('shared-course-notes.study.v1.b',JSON.stringify({'2026-11-03':3000,'2026-11-04':4000}));
 s.setItem('shared-course-notes.study.v1.bad','invalid');s.setItem('other','{}');
 assert.deepEqual(readStudyDays(s),{'2026-11-03':5000,'2026-11-04':4000});
});
test('reading anchor restores the same passage after layout changes and accepts old progress',()=>{
 const s=storage(), note={id:'a',version:'v1'}, win={scrollY:1000,scrollTo:({top})=>win.scrollY=top};
 let rect={top:10,bottom:410,height:400};const block={textContent:'current passage',getBoundingClientRect:()=>rect},body={querySelectorAll:()=>[block]};
 saveReadingPosition(note,body,win,s);win.scrollY=0;rect={top:1500,bottom:2300,height:800};
 restoreReadingPosition(note,body,win,s);assert.equal(win.scrollY,1590);
 s.setItem('shared-course-notes.progress.a',JSON.stringify({version:'v1',top:750}));
 restoreReadingPosition(note,body,win,s);assert.equal(win.scrollY,750);
 restoreReadingPosition({...note,version:'v2'},body,win,s);assert.equal(win.scrollY,0);
});
