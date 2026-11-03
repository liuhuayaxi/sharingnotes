const OPTION='sharingnotes.analytics.environment.v1',QUEUE='sharingnotes.analytics.queue.v1';
export const ENDPOINT='https://sharingnotes-analytics.sharingnotes-service.workers.dev/collect';
export function sharingEnvironment(storage) {try{return storage.getItem(OPTION)!=='off';}catch{return true;}}
export function makeBatch(events,enabled,nav,viewport) {
 const result={events:events.map(({id,at,kind,note,value})=>({id,at,kind,note,value})),details:enabled};
 if(enabled)result.environment={browser:String(nav.userAgent||'').slice(0,400),platform:String(nav.platform||'').slice(0,100),language:String(nav.language||'').slice(0,40),viewport:viewport.width+'×'+viewport.height};
 return result;
}
export function initAnalytics(getNote) {
 let queue=[],busy=false,focus={},milestones=new Map(),errors=0;
 try{queue=JSON.parse(localStorage.getItem(QUEUE)||'[]');if(!Array.isArray(queue))queue=[];}catch{}
 // No visitor/session ID. Queue contains only random retry IDs and basic events.
 queue=queue.filter(e=>e&&e.at>Date.now()-5*86400000).slice(-200);
 const storage=()=>{try{return localStorage;}catch{return {getItem:()=>null,setItem:()=>{}};}};
 const enabled=()=>sharingEnvironment(storage());
 function persist(){try{localStorage.setItem(QUEUE,JSON.stringify(queue));}catch{}}
 function track(kind,note='',value=1){if(!ENDPOINT)return;queue.push({id:crypto.randomUUID(),at:Date.now(),kind,note,value});queue=queue.slice(-200);persist();}
 async function flush(){
  if(!ENDPOINT||busy||!queue.length)return;busy=true;const events=queue.slice(0,20);
  try{const payload=makeBatch(events,enabled(),navigator,{width:innerWidth,height:innerHeight});const r=await fetch(ENDPOINT,{method:'POST',body:JSON.stringify(payload),headers:{'Content-Type':'text/plain'},credentials:'omit',referrerPolicy:'no-referrer',keepalive:true});if(r.ok){const data=await r.json(),ids=new Set(data.accepted||[]);queue=queue.filter(e=>!ids.has(e.id));persist();}else if(r.status===400){queue=queue.filter(e=>!events.includes(e));persist();}}catch{}finally{busy=false;}
 }
 function flushFocus(){for(const [note,value] of Object.entries(focus)){if(value>=1)track('focus',note,Math.min(120000,Math.round(value)));}focus={};}
 const api={track,focus(ms){const note=getNote()?.id||'';focus[note]=(focus[note]||0)+ms;if(focus[note]>=60000){track('focus',note,Math.round(focus[note]));delete focus[note];}},progress(note,percent){if(!note)return;let seen=milestones.get(note);if(!seen){seen=new Set();milestones.set(note,seen);}for(const n of [25,50,75,100])if(percent>=n&&!seen.has(n)){seen.add(n);track('read_'+n,note);}},error(kind='error_load'){if(errors++<5)track(kind);},flush};
 setInterval(()=>{flushFocus();void flush();},60000);
 const leave=()=>queueMicrotask(()=>{flushFocus();void flush();});window.addEventListener('pagehide',leave);document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')leave();});window.addEventListener('blur',leave);window.addEventListener('online',()=>void flush());
 window.addEventListener('error',()=>api.error('error_script'));window.addEventListener('unhandledrejection',()=>api.error('error_script'));
 const $=id=>document.getElementById(id),dialog=$('settings-dialog');
 function render(){const value=enabled();$('share-environment').checked=value;$('environment-status').textContent=value?'已开启 IP 与浏览器环境分享':'已关闭 IP 与浏览器环境分享；汇总使用统计继续';}
 $('settings-button').onclick=()=>{render();dialog.showModal();};$('close-settings').onclick=()=>dialog.close();
 $('share-environment').onchange=event=>{try{localStorage.setItem(OPTION,event.target.checked?'on':'off');}catch{$('environment-status').textContent='浏览器未允许保存设置';return;}render();};
 window.addEventListener('storage',event=>{if(event.key===OPTION)render();});
 dialog.addEventListener('close',()=>$('settings-button').focus({preventScroll:true}));
 track('visit');setTimeout(()=>void flush(),5000);return api;
}
