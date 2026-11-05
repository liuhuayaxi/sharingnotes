import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { statisticsWindow, statistics, activity, comparisonWindow, tally } from '../src/statistics.js';
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
  for (const name of ['0001_statistics', '0002_passkeys', '0003_visitors', '0004_context']) {
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

function insertEvent(db, id, at, kind = 'visit', value = 1, extra = {}) {
  db.sqlite
    .prepare(
      'INSERT INTO visitor_events(id,visitor,session,received_at,at,kind,note,value,ip,browser,country,referrer) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',
    )
    .run(
      id,
      extra.visitor || visitor,
      extra.session || session,
      now,
      at,
      kind,
      extra.note ?? 'a'.repeat(20),
      value,
      '',
      extra.browser || '',
      extra.country || '',
      extra.referrer || '',
    );
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

test('comparison window stays inside retention and tally separates actions', () => {
  const week = statisticsWindow(url('days=7'), now);
  const previous = comparisonWindow(week, now);
  assert.equal(previous.from, '2026-10-22');
  assert.equal(previous.to, '2026-10-28');
  assert.equal(comparisonWindow(statisticsWindow(url('days=30'), now), now), null);
  assert.deepEqual(
    tally([
      { kind: 'visit', events: 3, value: 3 },
      { kind: 'focus', events: 2, value: 90000 },
      { kind: 'copy', events: 4, value: 4 },
      { kind: 'transcript', events: 1, value: 1 },
      { kind: 'page_library', events: 2, value: 2 },
      { kind: 'error_script', events: 1, value: 1 },
    ]),
    {
      visits: 3,
      opens: 0,
      focus: 90000,
      errors: 1,
      completions: 0,
      copies: 4,
      transcripts: 1,
      searches: 0,
      library: 2,
      workspace: 0,
    },
  );
});

test('new and returning visitors, session span, referrers, countries and devices', async () => {
  const db = database();
  const current = Date.parse('2026-11-04T04:00:00Z');
  const earlier = Date.parse('2026-10-24T04:00:00Z');
  insertEvent(db, 'old-1', earlier, 'visit', 1, { referrer: 'github.com' });
  insertEvent(db, 'old-2', current, 'visit', 1, { referrer: 'github.com' });
  insertEvent(db, 'old-3', current + 30 * 60000, 'focus', 60000);
  const fresh = '42345678-1234-4123-8123-123456789abc';
  const freshSession = '52345678-1234-4123-8123-123456789abc';
  insertEvent(db, 'new-1', current + 60000, 'visit', 1, {
    visitor: fresh,
    session: freshSession,
    referrer: '',
  });
  db.sqlite.exec(`
    INSERT INTO daily VALUES
      ('2026-10-24','visit','',4,4),
      ('2026-11-04','visit','',6,6),
      ('2026-11-04','copy','${'b'.repeat(20)}',3,3),
      ('2026-11-04','transcript','${'b'.repeat(20)}',2,2);
    INSERT INTO traffic VALUES
      ('2026-10-24','referrer','github.com',4),
      ('2026-11-04','referrer','github.com',5),
      ('2026-11-04','referrer','direct',2),
      ('2026-11-04','country','CN',6),
      ('2026-10-24','country','JP',1);
  `);
  db.sqlite
    .prepare(
      'INSERT INTO diagnostics(received_at,ip,browser,platform,language,viewport,country) VALUES(?,?,?,?,?,?,?)',
    )
    .run(
      current,
      '',
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit Mobile/15E148',
      'iPhone',
      'zh-CN',
      '390×844',
      'CN',
    );
  const data = await statistics(db, statisticsWindow(url('days=7'), now), now);
  assert.equal(data.engagement.newVisitors, 1);
  assert.equal(data.engagement.returningVisitors, 1);
  assert.equal(data.engagement.sessions, 2);
  assert.equal(data.engagement.avgSpanMs, 15 * 60000);
  assert.equal(data.engagement.focusMs, 60000);
  assert.deepEqual(
    data.referrers.map((row) => [row.label, row.events]),
    [
      ['github.com', 5],
      ['direct', 2],
    ],
  );
  assert.equal(data.countries.length, 1);
  assert.equal(data.countries[0].label, 'CN');
  assert.equal(Number(data.countries[0].events), 6);
  assert.equal(data.devices[0].label, '手机');
  assert.equal(data.languages[0].label, 'zh-CN');
  assert.equal(data.compare.from, '2026-10-22');
  assert.equal(data.compare.visits, 4);
  assert.equal(data.compare.copies, 0);
  assert.equal(data.compare.visitors, 1);
  assert.equal(tally(data.daily).copies, 3);
  assert.equal(tally(data.daily).transcripts, 2);
  assert.equal(data.diagnostics[0].country, 'CN');
  db.sqlite.close();
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
  assert.equal(context.weekStart('2026-11-04'), '2026-11-02');
  assert.equal(context.weekStart('2026-11-08'), '2026-11-02');
  const up = context.changeFrom(12, 8);
  assert.equal(up.text, '+50%');
  assert.equal(up.direction, 'up');
  const down = context.changeFrom(4, 8);
  assert.equal(down.text, '-50%');
  assert.equal(down.direction, 'down');
  assert.equal(context.changeFrom(1, null), null);
});
