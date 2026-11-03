import {passkeyRequest} from './passkeys.js';
import passkeyClient from './passkey-client.js';
import {dashboard,loginPage,dashboardScript} from './views.js';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TYPES=new Set(['visit','note_open','read_25','read_50','read_75','read_100','focus','error_load','error_script']);
const DAY_MS=86400000,enc=new TextEncoder();
function headers(extra={}) {return {'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin',...extra};}
function response(value,status=200,extra={}) {return Response.json(value,{status,headers:headers(extra)});}
function safeText(value,max){return typeof value==='string'?value.replace(/[\u0000-\u001f\u007f]/g,'').slice(0,max):'';}
export function validateBatch(body,now=Date.now()) {
 if(!body||!Array.isArray(body.events)||body.events.length<1||body.events.length>20)throw Error('batch');
 const events=body.events.map(e=>{
  if(!e||!UUID.test(e.id)||!TYPES.has(e.kind)||!Number.isFinite(e.at)||e.at>now+300000||e.at<now-6*DAY_MS)throw Error('event');
  const note=e.note||'';if(note!==''&&!/^[a-f0-9]{20}$/.test(note))throw Error('note');
  if((e.kind==='note_open'||e.kind.startsWith('read_'))&&!note)throw Error('note');
  const value=e.kind==='focus'?e.value:1;if(!Number.isInteger(value)||value<1||value>120000)throw Error('value');
  return {id:e.id,at:e.at,day:new Date(e.at+8*3600000).toISOString().slice(0,10),kind:e.kind,note,value};
 });
 // Missing/false option always disables environment persistence.
 const details=body.details===true&&body.environment&&typeof body.environment==='object';
 const environment=details?{browser:safeText(body.environment.browser,400),platform:safeText(body.environment.platform,100),language:safeText(body.environment.language,40),viewport:safeText(body.environment.viewport,30)}:null;
 return {events,environment};
}
async function sign(value,secret) {
 const key=await crypto.subtle.importKey('raw',enc.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const signature=await crypto.subtle.sign('HMAC',key,enc.encode(value));
 return [...new Uint8Array(signature)].map(b=>b.toString(16).padStart(2,'0')).join('');
}
async function equal(a,b){const [x,y]=await Promise.all([crypto.subtle.digest('SHA-256',enc.encode(a)),crypto.subtle.digest('SHA-256',enc.encode(b))]);return new Uint8Array(x).every((v,i)=>v===new Uint8Array(y)[i]);}
async function authorized(request,env){
 const cookie=request.headers.get('Cookie')?.match(/(?:^|;\s*)sn_admin=([^;]+)/)?.[1]||'', [expiry,signature]=cookie.split('.');
 if(!env.ADMIN_SECRET||!/^\d+$/.test(expiry)||Number(expiry)<Date.now()||Number(expiry)>Date.now()+9*3600000)return false;
 return equal(signature||'',await sign(expiry,env.ADMIN_SECRET));
}
const html=body=>new Response(body,{headers:headers({'Content-Type':'text/html; charset=utf-8','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; script-src 'self'; connect-src 'self' https://liuhuayaxi.github.io; form-action 'self'; base-uri 'none'; frame-ancestors 'none'"})});
// Best-effort instance limit, not a global quota. No IP rate-limit identifier.
let windowStart=0,requestCount=0;
function overloaded(){const now=Date.now();if(now-windowStart>60000){windowStart=now;requestCount=0;}return ++requestCount>600;}
export async function collect(request,env) {
 const origin=request.headers.get('Origin');if(origin!==env.ALLOWED_ORIGIN)return response({error:'origin'},403);
 const cors={'Access-Control-Allow-Origin':origin,'Vary':'Origin'};
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers:headers({...cors,'Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type','Access-Control-Max-Age':'86400'})});
 if(request.method!=='POST')return response({error:'method'},405,cors);
 if(overloaded())return response({error:'busy'},429,cors);
 if(Number(request.headers.get('Content-Length')||0)>16000)return response({error:'size'},413,cors);
 let batch;
 try {
  const reader=request.body?.getReader();if(!reader)throw Error('body');const chunks=[];let bytes=0;
  while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.length;if(bytes>16000){await reader.cancel();return response({error:'size'},413,cors);}chunks.push(value);}
  const joined=new Uint8Array(bytes);let offset=0;for(const chunk of chunks){joined.set(chunk,offset);offset+=chunk.length;}
  batch=validateBatch(JSON.parse(new TextDecoder().decode(joined)));
 }catch{return response({error:'invalid'},400,cors);}
 const now=Date.now();
 await env.DB.batch([env.DB.prepare('DELETE FROM diagnostics WHERE received_at<?').bind(now-30*DAY_MS),env.DB.prepare('DELETE FROM receipts WHERE received_at<?').bind(now-30*DAY_MS),env.DB.prepare('DELETE FROM daily WHERE day<?').bind(new Date(now+8*3600000-30*DAY_MS).toISOString().slice(0,10))]);
 const writes=batch.events.map(e=>env.DB.prepare('INSERT OR IGNORE INTO receipts(id,received_at,day,kind,note,value) VALUES(?,?,?,?,?,?)').bind(e.id,now,e.day,e.kind,e.note,e.value));
 // Server IP isolated from reading events; 30-day expiry.
 if(batch.environment){const d=batch.environment;writes.push(env.DB.prepare('INSERT INTO diagnostics(received_at,ip,browser,platform,language,viewport) VALUES(?,?,?,?,?,?)').bind(now,safeText(request.headers.get('CF-Connecting-IP'),64),d.browser,d.platform,d.language,d.viewport));}
 await env.DB.batch(writes);return response({accepted:batch.events.map(e=>e.id)},200,cors);
}
export default {
 async fetch(request,env) {
  const url=new URL(request.url);
  try {
   if(url.pathname==='/collect')return await collect(request,env);
   if(url.pathname==='/health')return response({ok:true});
   if(url.pathname==='/passkey.js')return new Response(passkeyClient,{headers:headers({'Content-Type':'text/javascript'})});
   if(url.pathname.startsWith('/passkey/')){
    if(overloaded())return response({error:'busy'},429);
    if(Number(request.headers.get('Content-Length')||0)>20000)return response({error:'size'},413);
    const result=await passkeyRequest(request,env,await authorized(request,env));
    if(!result.authenticated)return result;
    const expiry=String(Date.now()+8*3600000),token=expiry+'.'+await sign(expiry,env.ADMIN_SECRET);
    return response({ok:true},200,{'Set-Cookie':'sn_admin='+token+'; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=28800'});
   }
   if(url.pathname==='/login'&&request.method==='POST'){
    if(request.headers.get('Origin')!==url.origin)return response({error:'origin'},403);
    if(overloaded()||Number(request.headers.get('Content-Length')||0)>2048)return response({error:'limited'},429);
    const password=(await request.formData()).get('password')?.trim();
    if(typeof password!=='string'||!env.ADMIN_SECRET||!await equal(password,env.ADMIN_SECRET))return html(loginPage('口令不正确'));
    const expiry=String(Date.now()+8*3600000),token=expiry+'.'+await sign(expiry,env.ADMIN_SECRET);
    return new Response(null,{status:303,headers:headers({'Location':'/','Set-Cookie':'sn_admin='+token+'; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=28800'})});
   }
   if(url.pathname==='/logout')return new Response(null,{status:303,headers:headers({'Location':'/','Set-Cookie':'sn_admin=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0'})});
   if(!await authorized(request,env))return url.pathname.startsWith('/api/')?response({error:'unauthorized'},401):html(loginPage());
   if(url.pathname==='/')return html(dashboard);
   if(url.pathname==='/dashboard.js')return new Response(dashboardScript,{headers:headers({'Content-Type':'text/javascript'})});
   if(url.pathname==='/api/stats') {
    const days=Math.min(30,Math.max(1,Number(url.searchParams.get('days'))||30)),since=new Date(Date.now()+8*3600000-(days-1)*DAY_MS).toISOString().slice(0,10);
    const [daily,diagnostics]=await env.DB.batch([env.DB.prepare('SELECT day,kind,note,events,value FROM daily WHERE day>=? ORDER BY day DESC').bind(since),env.DB.prepare('SELECT received_at,ip,browser,platform,language,viewport FROM diagnostics WHERE received_at>=? ORDER BY received_at DESC LIMIT 100').bind(Date.now()-30*DAY_MS)]);
    return response({daily:daily.results,diagnostics:diagnostics.results});
   }
   return response({error:'not_found'},404);
  }catch{return response({error:'unavailable'},503);}
 },
 async scheduled(event,env){const cutoff=Date.now()-30*DAY_MS;await env.DB.batch([env.DB.prepare('DELETE FROM diagnostics WHERE received_at<?').bind(cutoff),env.DB.prepare('DELETE FROM receipts WHERE received_at<?').bind(cutoff),env.DB.prepare('DELETE FROM daily WHERE day<?').bind(new Date(cutoff+8*3600000).toISOString().slice(0,10))]);}
};
