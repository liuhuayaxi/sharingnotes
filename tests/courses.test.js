import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {courseSymbols,courseSymbol} from '../docs/core.js';
const published=['光电子器件（全英文）','光电子学','微型计算机原理与接口技术','激光原理','物理光学','通信原理 C'];
test('each published course gets its own fitting badge, independent of list order',()=>{
 const expected={'光电子器件（全英文）':'器','光电子学':'电','微型计算机原理与接口技术':'微','激光原理':'激','物理光学':'物','通信原理 C':'信'};
 for(const order of [published,[...published].reverse(),[published[3],published[5],published[0],published[4],published[1],published[2]]])
  assert.deepEqual(Object.fromEntries(courseSymbols(order)),expected);
 assert.equal(courseSymbol(''),'全');assert.equal(courseSymbol('激光原理',published),'激');
});
test('new courses get distinct badges from their own names without changing existing ones',()=>{
 const extra=['光纤通信','数字电路','信号与系统','电磁场与电磁波','高等数学（上）','高等数学（下）','Linear Algebra','原理'];
 const symbols=courseSymbols([...extra,...published]);
 for(const name of published)assert.equal(symbols.get(name),courseSymbols(published).get(name),name);
 const values=[...symbols.values()];assert.equal(new Set(values).size,values.length,values.join());assert.ok(!values.includes('全'));
 for(const name of extra)assert.ok([...name.toLocaleUpperCase()].includes(symbols.get(name))||symbols.get(name)==='课',name+':'+symbols.get(name));
});
test('the sidebar uses name-derived badges and the site shows no authentication notice',()=>{
 const app=readFileSync(new URL('../docs/app.js',import.meta.url),'utf8'),html=readFileSync(new URL('../docs/index.html',import.meta.url),'utf8');
 assert.match(app,/courseSymbols\(state\.catalog\.courses\)/);assert.equal(/\['全','光','波'/.test(app),false);
 assert.equal(/认证暂未启用|认证未启用|暂未启用认证/.test(html+app),false);
 assert.equal(/<span>\s*<\/span>|·\s*<\/span>|<span>\s*·/.test(html),false);
});
