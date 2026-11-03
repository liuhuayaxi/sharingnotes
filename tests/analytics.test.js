import test from 'node:test';import assert from 'node:assert/strict';
import {sharingEnvironment,makeBatch} from '../docs/analytics.js';
test('environment sharing defaults on and persists opt-out',()=>{assert.equal(sharingEnvironment({getItem:()=>null}),true);assert.equal(sharingEnvironment({getItem:()=> 'off'}),false);});
test('opt-out still sends basic events with no environment or user identifiers',()=>{
 const e={id:'retry-id',at:1,kind:'visit',note:'',value:1,personal:'private',visitor:'secret'};
 const batch=makeBatch([e],false,{userAgent:'secret browser'},{width:390,height:844});assert.equal('environment' in batch,false);assert.equal(batch.events.length,1);assert.equal(JSON.stringify(batch).includes('private'),false);assert.equal(JSON.stringify(batch).includes('secret'),false);
 const on=makeBatch([e],true,{userAgent:'Browser',platform:'Mac',language:'zh'},{width:390,height:844});assert.equal(on.environment.viewport,'390×844');assert.equal('canvas' in on.environment,false);
});
