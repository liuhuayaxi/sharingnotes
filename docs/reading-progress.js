const PREFIX = "shared-course-notes.progress.";
const blocks = body => [...body.querySelectorAll("h1,h2,h3,h4,h5,h6,p,li,pre,table,blockquote")];
export function saveReadingPosition(note, body, win = window, storage) {
  if (!note || !body) return;
  const list = blocks(body);
  let index = list.findIndex(node => node.getBoundingClientRect().bottom > 110);
  if (index < 0) index = list.length - 1;
  const block = list[index], rect = block?.getBoundingClientRect();
  const value = {version:note.version, top:win.scrollY, index,
    fraction:rect ? Math.max(0, Math.min(1, (110-rect.top)/Math.max(1,rect.height))) : 0,
    text:block?.textContent.slice(0,100) || ""};
  try { (storage || localStorage).setItem(PREFIX+note.id, JSON.stringify(value)); } catch {}
}
export function restoreReadingPosition(note, body, win = window, storage) {
  let value;
  try { value = JSON.parse((storage || localStorage).getItem(PREFIX+note.id) || "null"); } catch {}
  if (!value || value.version !== note.version) { win.scrollTo({top:0,behavior:"instant"}); return; }
  const block = Number.isInteger(value.index) ? blocks(body)[value.index] : null;
  const rect = block?.getBoundingClientRect();
  const top = rect && block.textContent.slice(0,100) === value.text && value.top > 110
    ? rect.top+win.scrollY+Math.max(0,Math.min(1,Number(value.fraction)||0))*rect.height-110
    : Number(value.top)||0;
  const target=Math.max(0,top);
  if(!win.addEventListener){win.scrollTo({top:target,behavior:"smooth"});return;}
  win.scrollTo({top:0,behavior:"instant"});
  return new Promise(resolve=>{
    let timer,frame;
    const finish=()=>{clearTimeout(timer);win.cancelAnimationFrame(frame);win.removeEventListener('scrollend',finish);win.removeEventListener('wheel',finish);win.removeEventListener('touchstart',finish);resolve();};
    frame=win.requestAnimationFrame(()=>{
      win.addEventListener('scrollend',finish,{once:true});
      win.addEventListener('wheel',finish,{once:true,passive:true});win.addEventListener('touchstart',finish,{once:true,passive:true});
      timer=setTimeout(finish,1800);
      win.scrollTo({top:target,behavior:win.matchMedia?.('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
    });
  });
}
