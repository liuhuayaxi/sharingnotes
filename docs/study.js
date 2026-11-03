const PREFIX = "shared-course-notes.study.v1.";
export const dayKey = date => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
export function splitDays(start, end) {
  const parts = [];
  while (start < end) {
    const date = new Date(start), next = new Date(date.getFullYear(),date.getMonth(),date.getDate()+1).getTime();
    const until = Math.min(end,next);
    parts.push([dayKey(date),until-start]); start=until;
  }
  return parts;
}
// Monotonic intervals avoid wall-clock adjustments; skip suspended timer gaps.
export function createStudyClock({monotonic=()=>performance.now(), wall=()=>Date.now(), add}) {
  let active=false, last=monotonic();
  function flush() {
    const now=monotonic(), elapsed=now-last; last=now;
    if(active && elapsed>0 && elapsed<=30000) {
      const end=wall(); for(const [day,ms] of splitDays(end-elapsed,end)) add(day,ms);
    }
  }
  return {flush, setActive(value){flush();active=Boolean(value);}, isActive:()=>active};
}
export function readStudyDays(storage) {
  const days={};
  try {
    for(let i=0;i<storage.length;i++) {
      const key=storage.key(i);if(!key?.startsWith(PREFIX))continue;
      let data;try{data=JSON.parse(storage.getItem(key));}catch{continue;}
      for(const [day,ms] of Object.entries(data||{}))
        if(/^\d{4}-\d{2}-\d{2}$/.test(day) && Number.isFinite(ms) && ms>0) days[day]=(days[day]||0)+ms;
    }
  } catch {}
  return days;
}
export function duration(ms) {
  const minutes=Math.floor(ms/60000);
  if(!minutes)return ms>0?"不足 1 分钟":"0 分钟";
  return minutes>=60?`${Math.floor(minutes/60)} 小时 ${minutes%60} 分钟`:`${minutes} 分钟`;
}
export function initStudy({onFocus=()=>{}}={}) {
  const $=id=>document.getElementById(id), dialog=$("study-dialog");
  const key=PREFIX+crypto.randomUUID(), own={};let saved=true, alive=true, selected=dayKey(new Date()), month=selected.slice(0,7);
  // Per-page records prevent tabs from overwriting each other’s totals.
  const clock=createStudyClock({add(day,ms){onFocus(ms);own[day]=(own[day]||0)+ms;try{localStorage.setItem(key,JSON.stringify(own));saved=true;}catch{saved=false;}}});
  function totals(){let storage;try{storage=localStorage;}catch{}const days=storage?readStudyDays(storage):{};if(!saved)for(const [day,ms] of Object.entries(own))days[day]=(days[day]||0)+ms;return days;}
  function render() {
    const days=totals(), today=dayKey(new Date());
    $("study-today").textContent=duration(days[today]||0);
    $("study-button").title=`今日专注 ${duration(days[today]||0)} · 查看复习热力图`;
    if(!dialog.open)return;
    $("study-state").textContent=saved?(clock.isActive()?"正在计时 · 页面可见且有焦点":"已暂停 · 返回此页面继续计时"):"浏览器未允许保存，当前时长仅在本页保留";
    $("study-total").textContent=duration(Object.values(days).reduce((a,b)=>a+b,0));
    let monthTotal=0, count=0;const [year,number]=month.split("-").map(Number), start=new Date(year,number-1,1), end=new Date(year,number,1);
    const grid=$("study-grid"), focusedDay=document.activeElement?.dataset?.day;grid.replaceChildren();
    for(let i=0;i<(start.getDay()+6)%7;i++){const blank=document.createElement("span");blank.className="study-blank";grid.append(blank);}
    for(let date=new Date(start);date<end;date.setDate(date.getDate()+1)) {
      const day=dayKey(date), ms=days[day]||0, future=day>today;
      monthTotal+=ms;if(ms>0)count++;
      const button=document.createElement("button");button.type="button";button.className="study-day";button.dataset.day=day;
      button.classList.toggle("is-today",day===today);button.dataset.level=ms===0?"0":ms<15*60000?"1":ms<30*60000?"2":ms<60*60000?"3":"4";
      button.disabled=future;button.textContent=date.getDate();button.title=`${day} · ${duration(ms)}`;button.setAttribute("aria-label",button.title);
      button.setAttribute("aria-pressed",String(day===selected));button.onclick=()=>{selected=day;render();};grid.append(button);
      if(day===focusedDay)button.focus({preventScroll:true});
    }
    $("study-month").value=month;$("study-month").max=today.slice(0,7);$("study-next").disabled=month>=today.slice(0,7);$("study-month-total").textContent=duration(monthTotal);$("study-days").textContent=count+" 天";
    $("study-detail").textContent=`${selected} · ${duration(days[selected]||0)}`;
  }
  function sync(){clock.setActive(alive && document.visibilityState==="visible" && document.hasFocus());render();}
  window.addEventListener("focus",sync);window.addEventListener("blur",()=>{clock.setActive(false);render();});document.addEventListener("visibilitychange",sync);
  window.addEventListener("pagehide",()=>{clock.setActive(false);alive=false;});
  window.addEventListener("pageshow",()=>{alive=true;sync();});
  window.addEventListener("storage",render);
  setInterval(()=>{clock.flush();render();},5000);
  function changeMonth(value){if(!/^\d{4}-\d{2}$/.test(value)||value>dayKey(new Date()).slice(0,7))return;month=value;selected=month===dayKey(new Date()).slice(0,7)?dayKey(new Date()):month+"-01";render();}
  function stepMonth(step){const [year,number]=month.split("-").map(Number);changeMonth(dayKey(new Date(year,number-1+step,1)).slice(0,7));}
  $("study-prev").onclick=()=>stepMonth(-1);$("study-next").onclick=()=>stepMonth(1);
  $("study-month").onchange=event=>changeMonth(event.target.value);
  $("study-current").onclick=()=>changeMonth(dayKey(new Date()).slice(0,7));
  $("study-button").onclick=()=>{clock.flush();dialog.showModal();render();};$("close-study").onclick=()=>dialog.close();
  dialog.addEventListener("close",()=>$("study-button").focus({preventScroll:true}));
  sync();return clock;
}
