import test from 'node:test';
import assert from 'node:assert/strict';
import {extractExercises, stemHtml, renderRedoPanel, storageKey} from '../docs/redo.js';

const SAMPLE = `## 课上习题

### 第1题
<!-- yuketang:Y1 -->
1. 辐射效率的定义是[填空1]。
2. LED 工作在[填空2]偏置。

**答案**：
[填空1] 辐射
[填空2] 正向

**解析**：
略。

### 第2题
简述异质结的作用。

**答案**：限制载流子与光场。

## 复习清单
- [ ] x
`;

test('extracts stems without answers and keeps explanation separately', () => {
  const items = extractExercises(SAMPLE);
  assert.equal(items.length, 2);
  assert.equal(items[0].number, 1);
  assert.match(items[0].stem, /辐射效率/);
  assert.equal(items[0].stem.includes('答案'), false);
  assert.equal(items[0].stem.includes('yuketang'), false);
  assert.match(items[0].answer, /辐射/);
  assert.match(items[1].stem, /异质结/);
});

test('blank markers become inputs and other text is escaped', () => {
  const html = stemHtml('A <b>[填空1]</b> 与[填空2]');
  assert.equal(html.includes('<b>'), false);
  assert.match(html, /data-blank="1"/);
  assert.match(html, /data-blank="2"/);
  assert.match(html, /&lt;b&gt;/);
});

test('panel is omitted without exercises and lists progress', () => {
  assert.equal(renderRedoPanel([], {}, {renderMarkdown: t => t}), '');
  const html = renderRedoPanel(extractExercises(SAMPLE), {'1': {done: true}}, {renderMarkdown: t => t});
  assert.match(html, /重做雨课堂习题/);
  assert.match(html, /1\/2 已重做/);
  assert.match(html, /第1题/);
  assert.equal(storageKey('abc'), 'shared-course-notes.redo.abc');
});
