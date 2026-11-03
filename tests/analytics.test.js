import test from 'node:test';import assert from 'node:assert/strict';
import {sharingEnvironment,makeBatch} from '../docs/analytics.js';
test('environment sharing defaults on and persists opt-out',()=>{assert.equal(sharingEnvironment({getItem:()=>null}),true);assert.equal(sharingEnvironment({getItem:()=> 'off'}),false);});
test('opt-out still sends basic events with no environment or user identifiers',()=>{
 const e={id:'retry-id',at:1,kind:'visit',note:'',value:1,personal:'private',visitor:'secret'};
 const batch=makeBatch([e],false,{userAgent:'secret browser'},{width:390,height:844});assert.equal('environment' in batch,false);assert.equal(batch.events.length,1);assert.equal(JSON.stringify(batch).includes('private'),false);assert.equal(JSON.stringify(batch).includes('secret'),false);
 const on=makeBatch([e],true,{userAgent:'Browser',platform:'Mac',language:'zh'},{width:390,height:844});assert.equal(on.environment.viewport,'390×844');assert.equal('canvas' in on.environment,false);
});
import {linkedVisitor} from '../docs/analytics.js';
test('local browser identity persists independently of IP; off disables linking',()=>{
 const data=new Map(),storage={getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v)};let calls=0;
 const id='12345678-1234-4123-8123-123456789abc';
 assert.equal(linkedVisitor(storage,()=>{calls++;return id;}),id);
 assert.equal(linkedVisitor(storage,()=>{calls++;return 'different';}),id);assert.equal(calls,1);
 data.set('sharingnotes.analytics.link.v1','off');assert.equal(linkedVisitor(storage), '');
});
test('linking includes only events recorded with the current enabled identity',()=>{
 const id='12345678-1234-4123-8123-123456789abc';const events=[{id:'a',visitor:id,session:'s',kind:'visit'},{id:'b',kind:'visit'},{id:'c',visitor:'old',kind:'visit'}];
 const on=makeBatch(events,false,{}, {width:1,height:1},id);assert.equal(on.events[0].visitor,id);assert.equal(on.events[1].visitor,undefined);assert.equal(on.events[2].visitor,undefined);
 const off=makeBatch(events,false,{}, {width:1,height:1});assert.equal(off.linkVisits,false);assert.ok(off.events.every(e=>!e.visitor));
});
