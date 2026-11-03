import test from 'node:test';import assert from 'node:assert/strict';
import worker,{validateBatch,collect} from '../src/worker.js';
const now=Date.now(),event={id:'12345678-1234-4123-8123-123456789abc',at:now,kind:'note_open',note:'a'.repeat(20),value:1};
function fakeDB(){const calls=[];return {calls,prepare(sql){return {bind(...values){return {sql,values};}}},async batch(items){calls.push(...items);return items.map(()=>({success:true,meta:{changes:1}}));}};}
test('opt-out ignores environment and any extra identifiers',()=>{
 const data=validateBatch({events:[{...event,ip:'fake',visitor:'fake'}],details:false,environment:{browser:'secret'}},now);
 assert.equal(data.environment,null);assert.equal('ip' in data.events[0],false);assert.equal('visitor' in data.events[0],false);
 assert.equal(validateBatch({events:[event],environment:{browser:'secret'}},now).environment,null);
});
test('allowed environment fields only; no fingerprint or local text',()=>{
 const data=validateBatch({events:[event],details:true,environment:{browser:'Browser',platform:'Mac',language:'zh-CN',viewport:'390×844',canvas:'secret',notes:'personal'}},now);
 assert.deepEqual(Object.keys(data.environment),['browser','platform','language','viewport']);
 for(const bad of [{...event,kind:'search_text'},{...event,id:'bad'},{...event,note:'private path'},{...event,kind:'focus',value:999999}])assert.throws(()=>validateBatch({events:[bad]},now));
});
test('disabled request still aggregates but never persists IP',async()=>{
 const DB=fakeDB();const r=await collect(new Request('https://test/collect',{method:'POST',headers:{Origin:'https://liuhuayaxi.github.io','CF-Connecting-IP':'192.0.2.1'},body:JSON.stringify({events:[event],details:false,environment:{browser:'secret'}})}),{DB,ALLOWED_ORIGIN:'https://liuhuayaxi.github.io'});
 assert.equal(r.status,200);assert.ok(DB.calls.some(c=>c.sql.startsWith('INSERT OR IGNORE INTO receipts')));assert.equal(DB.calls.some(c=>c.sql.startsWith('INSERT INTO diagnostics')),false);assert.equal(JSON.stringify(DB.calls).includes('192.0.2.1'),false);
});
test('diagnostics source IP from server and enforce 30-day cleanup',async()=>{
 const DB=fakeDB();await collect(new Request('https://test/collect',{method:'POST',headers:{Origin:'https://liuhuayaxi.github.io','CF-Connecting-IP':'192.0.2.2'},body:JSON.stringify({events:[event],details:true,ip:'fake',environment:{browser:'test'}})}),{DB,ALLOWED_ORIGIN:'https://liuhuayaxi.github.io'});
 assert.equal(DB.calls.find(c=>c.sql.startsWith('INSERT INTO diagnostics')).values[1],'192.0.2.2');
 const deletion=DB.calls.find(c=>c.sql.startsWith('DELETE FROM diagnostics'));assert.ok(Math.abs(deletion.values[0]-(Date.now()-30*86400000))<1000);
});
test('unauthenticated dashboard API rejected; untrusted origin rejected before DB',async()=>{
 const DB=fakeDB();const r=await worker.fetch(new Request('https://test/api/stats'),{DB,ADMIN_SECRET:'secret'});assert.equal(r.status,401);assert.equal(DB.calls.length,0);
 assert.equal((await collect(new Request('https://test/collect',{method:'POST',headers:{Origin:'https://other'},body:'{}'}),{DB,ALLOWED_ORIGIN:'https://liuhuayaxi.github.io'})).status,403);
});
test('login pages keep same-origin referrer policy and passkey script is public',async()=>{
 const DB=fakeDB();const r=await worker.fetch(new Request('https://test/'),{DB,ADMIN_SECRET:'secret'});
 assert.equal(r.headers.get('Referrer-Policy'),'same-origin');assert.ok((await r.text()).includes('passkey-login'));
 const script=await worker.fetch(new Request('https://test/passkey.js'),{DB,ADMIN_SECRET:'secret'});assert.equal(script.status,200);
 const registration=await worker.fetch(new Request('https://test/passkey/register/options',{method:'POST',headers:{Origin:'https://test','Content-Type':'application/json'},body:'{}'}),{DB,ADMIN_SECRET:'secret'});assert.equal(registration.status,401);
});
test('association requires preference and valid IDs; environment opt-out still respected',async()=>{
 const visitor='22345678-1234-4123-8123-123456789abc',session='32345678-1234-4123-8123-123456789abc';
 const linked={...event,visitor,session};assert.equal(validateBatch({events:[linked]},now).events[0].visitor,undefined);
 assert.equal(validateBatch({events:[linked],linkVisits:true},now).events[0].visitor,visitor);
 const DB=fakeDB();await collect(new Request('https://test/collect',{method:'POST',headers:{Origin:'https://liuhuayaxi.github.io','CF-Connecting-IP':'192.0.2.9'},body:JSON.stringify({events:[linked],linkVisits:true,details:false})}),{DB,ALLOWED_ORIGIN:'https://liuhuayaxi.github.io'});
 const write=DB.calls.find(c=>c.sql.startsWith('INSERT OR IGNORE INTO visitor_events'));assert.ok(write);assert.equal(write.values[1],visitor);assert.equal(write.values[8],'');
});
