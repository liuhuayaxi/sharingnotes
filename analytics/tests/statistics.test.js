import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { statisticsWindow, statistics, activity } from '../src/statistics.js';
import worker from '../src/worker.js';
import { dashboardScript } from '../src/views.js';

const now = Date.parse('2026-11-04T15:50:00Z');
const url = (query) => new URL('https://test/api/stats?' + query);
const visitor = '22345678-1234-4123-8123-123456789abc';
const session = '32345678-1234-4123-8123-123456789abc';

test('deployed dashboard script matches the editable browser source', () => {
  assert.equal(dashboardScript, readFileSync(new URL('../src/dashboard-browser.js', import.meta.url), 'utf8'));
});

function database() {
  const sqlite = new DatabaseSync(':memory:');
  for (const name of ['0001_statistics', '0002_passkeys', '0003_visitors']) {
    sqlite.exec(readFileSync(new URL('../migrations/' + name + '.sql', import.meta.url), 'utf8'));
  }
  return {
    sqlite,
    prepare(sql) {
      const statement = sqlite.prepare(sql);
      return {
        all: async () => ({ results: statement.all() }),
        bind(...values) {
          return { all: async () => ({ results: statement.all(...values) }) };
        },
      };
    },
    async batch(statements) {
      return Promise.all(statements.map((statement) => statement.all()));
    },
  };
}

function insertEvent(db, id, at, kind = 'visit', value = 1) {
  db.sqlite
    .prepare('INSERT INTO visitor_events VALUES(?,?,?,?,?,?,?,?,?,?)')
    .run(id, visitor, session, now, at, kind, 'a'.repeat(20), value, '', '');
}

test('preset and custom ranges use UTC+8 calendar boundaries and reject invalid dates', () => {
  const range = statisticsWindow(url('days=7'), now);
  assert.equal(range.from, '2026-10-29');
  assert.equal(range.to, '2026-11-04');
  assert.equal(range.start, Date.parse('2026-10-28T16:00:00Z'));
  assert.equal(range.end, Date.parse('2026-11-04T16:00:00Z'));
  assert.equal(statisticsWindow(url('days=1'), now + 11 * 60000).to, '2026-11-05');
  for (const query of [
    'days=2.5',
    'days=31',
    'from=2026-02-30&to=2026-11-04',
    'from=2026-11-04&to=2026-11-03',
    'to=2026-11-05',
    'from=2026-10-01',
  ]) {
    assert.throws(() => statisticsWindow(url(query), now), /invalid_range/);
  }
});

test('daily identities, all-time-in-range identities, hours and diagnostics share exact bounds', async () => {
  const db = database();
  const start = Date.parse('2026-11-03T16:00:00Z');
  insertEvent(db, 'before', start - 1);
  insertEvent(db, 'start', start);
  insertEvent(db, 'focus', start + 1000, 'focus', 32000);
  insertEvent(db, 'end', start + 86400000);
  db.sqlite.exec(
    "INSERT INTO daily VALUES('2026-11-03','visit','',2,2),('2026-11-04','visit','',3,3)",
  );
  const insertDiagnostic = db.sqlite.prepare(
    'INSERT INTO diagnostics(received_at,ip,browser,platform,language,viewport) VALUES(?,?,?,?,?,?)',
  );
  for (let i = 0; i < 130; i++)
    insertDiagnostic.run(
      start + i,
      '',
      'Mozilla Chrome/130 Safari/537',
      'MacIntel',
      'zh-CN',
      '1440×900',
    );
  const data = await statistics(db, statisticsWindow(url('from=2026-11-04&to=2026-11-04'), now));
  assert.equal(data.daily.length, 1);
  assert.equal(data.linked.events, 2);
  assert.equal(data.linked.visitors, 1);
  assert.equal(data.linked.sessions, 1);
  assert.equal(data.linkedDaily[0].day, '2026-11-04');
  assert.equal(data.hourly[0].hour, 0);
  assert.equal(data.hourly[0].focus_ms, 32000);
  assert.equal(data.visitors[0].focus_ms, 32000);
  assert.equal(data.environment.records, 130);
  assert.equal(data.environment.browsers[0].records, 130);
  assert.equal(data.diagnostics.length, 100);
  assert.equal(data.firstDay, '2026-11-03');
  db.sqlite.close();
});

test('unique visitors and sessions across days are counted once', async () => {
  const db = database();
  insertEvent(db, 'day1', Date.parse('2026-11-03T04:00:00Z'));
  insertEvent(db, 'day2', Date.parse('2026-11-04T04:00:00Z'));
  const data = await statistics(db, statisticsWindow(url('days=7'), now));
  assert.equal(data.linkedDaily.length, 2);
  assert.equal(data.linked.visitors, 1);
  assert.equal(data.linked.sessions, 1);
  db.sqlite.close();
});

test('activity pagination uses timestamp and ID without losing simultaneous events', async () => {
  const db = database();
  const at = Date.parse('2026-11-04T04:00:00Z');
  for (let i = 0; i < 207; i++)
    insertEvent(db, `${String(i).padStart(8, '0')}-1234-4123-8123-123456789abc`, at);
  const range = statisticsWindow(url('days=1'), now);
  const events = [];
  let cursor = null;
  do {
    const request = url('day=2026-11-04');
    if (cursor) request.searchParams.set('cursor', cursor);
    const page = await activity(db, request, range, visitor);
    events.push(...page.events);
    cursor = page.next;
  } while (cursor);
  assert.equal(events.length, 207);
  assert.equal(new Set(events.map((event) => event.id)).size, 207);
  await assert.rejects(activity(db, url('day=2026-11-03'), range), /invalid_day/);
  await assert.rejects(activity(db, url('cursor=bad'), range), /invalid_cursor/);
  db.sqlite.close();
});

test('all new APIs remain protected and reject invalid authenticated date input', async () => {
  const DB = database(),
    env = { DB, ADMIN_SECRET: 'test-only' };
  for (const path of ['/api/activity', '/api/visitor', '/api/stats']) {
    assert.equal((await worker.fetch(new Request('https://test' + path), env)).status, 401);
  }
  const login = await worker.fetch(
    new Request('https://test/login', {
      method: 'POST',
      headers: { Origin: 'https://test', 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'password=test-only',
    }),
    env,
  );
  const Cookie = login.headers.get('Set-Cookie').split(';')[0];
  assert.equal(
    (
      await worker.fetch(
        new Request('https://test/api/stats?from=invalid', { headers: { Cookie } }),
        env,
      )
    ).status,
    400,
  );
  assert.equal(
    (await worker.fetch(new Request('https://test/api/activity', { headers: { Cookie } }), env))
      .status,
    200,
  );
  DB.sqlite.close();
});

test('browser model keeps unrecorded dates distinct and sums all reading nodes', () => {
  const context = { document: { addEventListener() {} }, Intl, URLSearchParams, Date };
  runInNewContext(
    readFileSync(new URL('../src/dashboard-browser.js', import.meta.url), 'utf8'),
    context,
  );
  const model = context.buildModel({
    range: { from: '2026-11-02', to: '2026-11-04' },
    firstDay: '2026-11-03',
    linkedDaily: [],
    daily: [
      { day: '2026-11-03', kind: 'focus', note: 'a', events: 2, value: 61000 },
      { day: '2026-11-03', kind: 'read_100', note: 'a', events: 3, value: 3 },
    ],
  });
  assert.equal(model.days.length, 3);
  assert.equal(model.days[0].recorded, false);
  assert.equal(model.days[2].recorded, true);
  assert.equal(model.days[2].total.events, 0);
  assert.equal(model.total.focus, 61000);
  assert.equal(model.total.complete, 3);
  assert.equal(model.notes[0].read_100, 3);
  assert.equal(context.duration(32000), '32 秒');
  assert.equal(runInNewContext("escapeHTML('<script>')", context), '&lt;script&gt;');
});
