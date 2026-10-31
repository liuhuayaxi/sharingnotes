// Browser integration against a local HTTP server and synthetic publication
// snapshots; production docs/data and remote services are never modified.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(new URL('..',import.meta.url).pathname);
const out=path.resolve(process.env.QWEN_ASR_BROWSER_OUTPUT||'output/playwright/chapter-ui');
const fixtures=[
  {id:'a'.repeat(20),title:'欧姆定律早课',course:'课程A',chapter:'第1章 电路',chapters:['第1章 电路'],date:'2026-10-01',lessonAt:'2026-10-01T08:00:00+08:00'},
  {id:'b'.repeat(20),title:'跨章晚课',course:'课程A',chapter:'第1章 电路 · 第2章 信号',chapters:['第1章 电路','第2章 信号'],date:'2026-10-01',lessonAt:'2026-10-01T10:00:00+08:00'},
  {id:'c'.repeat(20),title:'旧版未标章节',course:'课程A',date:'2026-10-02',lessonAt:'2026-10-02T08:00:00+08:00'},
  {id:'d'.repeat(20),title:'另一个课程',course:'课程B',chapter:'第1章 电路',chapters:['第1章 电路'],date:'2026-10-03'},
].map(note=>({...note,version:'f'.repeat(64),file:`notes/${note.id}-${'f'.repeat(12)}.json`,wordCount:200,imageCount:0,sourceCount:0,abstract:'欧姆定律课堂摘要'}));
const catalog={courses:['课程A','课程B'],notes:fixtures,publishedAt:'2026-10-31T12:00:00+08:00'};
const index=fixtures.map(note=>({note:note.id,kind:'note',section:'section-1',heading:'欧姆定律',text:'电压等于电流乘以电阻。'}));
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://localhost');const json=value=>res.writeHead(200,{'Content-Type':'application/json'}).end(JSON.stringify(value));
 if(url.pathname==='/data/catalog.json'){json(catalog);return;}
 if(url.pathname==='/data/search-index.json'){json(index);return;}
 if(url.pathname==='/data/resources.json'){json({pdfs:[],noteMaterials:{}});return;}
 const note=fixtures.find(note=>'/data/'+note.file===url.pathname);
 if(note){json({...note,markdown:'## 欧姆定律\n\n电压等于电流乘以电阻。',sources:[],images:[]});return;}
 if(url.pathname.startsWith('/data/')){res.writeHead(404).end();return;}
 const file=path.resolve(root,'docs',url.pathname==='/'?'index.html':'.'+url.pathname);
 if(!file.startsWith(path.join(root,'docs')+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404).end();return;}
 res.writeHead(200,{'Content-Type':/\.m?js$/.test(file)?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.html')?'text/html':'application/octet-stream'}).end(fs.readFileSync(file));
});
fs.mkdirSync(out,{recursive:true});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser,page;const checks=[],errors=[];
try{
 browser=await chromium.launch({headless:process.env.HEADED!=='1',channel:'chrome'});
 const context=await browser.newContext({viewport:{width:1440,height:1000}});page=await context.newPage();page.setDefaultTimeout(10000);
 page.on('pageerror',error=>errors.push(error.message));
 page.on('console',message=>{if(message.type()==='error')console.error('Browser:',message.text());});
 page.on('requestfailed',request=>console.error('Failed:',request.url(),request.failure()));
 const origin=`http://127.0.0.1:${server.address().port}`;
 await page.goto(origin+'/?course=课程A');await page.locator('#chapter-filter:not([disabled])').waitFor();
 await page.locator('#chapter-filter').selectOption('第1章 电路');
 assert.equal(await page.locator('.workspace-note').count(),2);
 assert.equal(new URL(page.url()).searchParams.get('chapter'),'第1章 电路');
 await page.locator('#sort-order').selectOption('oldest');
 assert.equal(await page.locator('.workspace-note h3').first().innerText(),'欧姆定律早课');
 checks.push('course > chapter filter and same-day chronological timeline');
 await page.locator('#lesson-list [data-note="'+fixtures[0].id+'"]').click();
 assert.equal(await page.locator('#note-chapter').innerText(),'第1章 电路');
 await page.locator('#note-end').waitFor({state:'visible'});
 assert.equal(await page.locator('#adjacent-notes button').count(),1);
 assert.equal(await page.locator('#adjacent-notes button').getAttribute('data-note'),fixtures[1].id);
 await page.locator('#adjacent-notes button').click();await page.locator('#note-end').waitFor({state:'visible'});
 assert.equal(await page.locator('#note-chapter').innerText(),'第1章 电路 · 第2章 信号');
 assert.equal(await page.locator('#adjacent-notes button').count(),1);
 checks.push('reader subtitle and previous/next stay within chapter');
 await page.locator('#favorite-note').click();await page.locator('#favorites-filter').click();
 assert.equal(new URL(page.url()).searchParams.get('favorites'),'1');
 assert.equal(await page.locator('#lesson-list button').count(),1);
 assert.equal(await page.locator('#adjacent-notes button').count(),0);
 await page.reload();await page.locator('#note-end').waitFor({state:'visible'});
 assert.equal(await page.locator('#chapter-filter').inputValue(),'第1章 电路');
 assert.equal(await page.locator('#favorites-filter').getAttribute('aria-pressed'),'true');
 assert.equal(await page.locator('#sort-order').inputValue(),'oldest');
 checks.push('chapter/favorites/order/note URL restoration');
 await page.locator('#open-search').click();await page.locator('#search-input').fill('欧姆');
 await page.locator('#search-status').filter({hasText:'找到 1 条'}).waitFor();
 assert.equal(await page.locator('.search-result').count(),1);
 assert.match(await page.locator('.search-result strong').innerText(),/跨章晚课/);
 await page.locator('#close-search').click();await page.locator('#favorites-filter').click();
 await page.locator('#chapter-filter').selectOption('__unassigned__');
 assert.equal(await page.locator('.workspace-note').count(),1);
 assert.equal(await page.locator('.workspace-note .chapter-subtitle').innerText(),'章节待确认');
 await page.locator('#open-search').click();
 await page.locator('#search-status').filter({hasText:'章节待确认 · 找到 1 条'}).waitFor();
 assert.equal(await page.locator('.search-result strong').innerText(),'旧版未标章节');
 await page.locator('#close-search').click();
 checks.push('search honors favorites and chapter; legacy notes remain unassigned');
 await page.screenshot({path:path.join(out,'chapter-unassigned.png')});
 await page.locator('#chapter-filter').selectOption('第2章 信号');
 await page.locator('#lesson-list button').click();await page.locator('#note-end').waitFor({state:'visible'});
 await page.screenshot({path:path.join(out,'chapter-reader.png')});
 await page.setViewportSize({width:390,height:844});await page.locator('#menu-button').click();
 await page.locator('#chapter-filter').selectOption('第1章 电路');
 await page.locator('#menu-button').click();
 await page.waitForFunction(()=>Math.abs(document.querySelector('#sidebar').getBoundingClientRect().left)<1);
 await page.screenshot({path:path.join(out,'chapter-mobile.png')});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 checks.push('390px chapter navigation stays inside viewport');
 await page.setViewportSize({width:1440,height:1000});
 await page.goto(origin+'/?course='+encodeURIComponent('课程A')+'&chapter='+encodeURIComponent('第2章 信号')+'&note='+fixtures[2].id);
 await page.locator('#workspace[aria-busy="false"]').waitFor();
 assert.equal(await page.locator('#reader-shell').isVisible(),false);
 assert.equal(await page.locator('.workspace-note h3').innerText(),'跨章晚课');
 await page.locator('#chapter-filter').selectOption('__unassigned__');await page.goBack();
 await page.waitForFunction(()=>document.querySelector('#chapter-filter').value==='第2章 信号');
 assert.equal(await page.locator('.workspace-note h3').innerText(),'跨章晚课');
 checks.push('conflicting note URL does not bypass chapter; browser back restores scope');
 assert.deepEqual(errors,[]);
 fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({passed:true,checks},null,2));
 console.log(`PASS ${checks.length} chapter browser flows`);
 await context.close();
}catch(error){console.error(error, errors);if(page){console.error(await page.locator('body').innerText());await page.screenshot({path:path.join(out,'failure.png')});}process.exitCode=1;}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
