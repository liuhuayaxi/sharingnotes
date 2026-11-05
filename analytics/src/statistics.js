const DAY_MS = 86400000;
const OFFSET_MS = 8 * 3600000;

export function dateKey(timestamp) {
  return new Date(timestamp + OFFSET_MS).toISOString().slice(0, 10);
}

export function statisticsWindow(url, now = Date.now()) {
  const today = dateKey(now);
  const oldest = dateKey(now - 29 * DAY_MS);
  const days = Number(url.searchParams.get('days') || 30);
  const to = url.searchParams.get('to') || today;
  const from = url.searchParams.get('from') || dateKey(now - (days - 1) * DAY_MS);
  const valid = (value) =>
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value;
  if (
    !Number.isInteger(days) ||
    days < 1 ||
    days > 30 ||
    !valid(from) ||
    !valid(to) ||
    from > to ||
    from < oldest ||
    to > today
  )
    throw Error('invalid_range');
  return {
    from,
    to,
    today,
    oldest,
    timezone: 'Asia/Taipei',
    start: Date.parse(from + 'T00:00:00+08:00'),
    end: Date.parse(to + 'T00:00:00+08:00') + DAY_MS,
  };
}

export function comparisonWindow(range, now = Date.now()) {
  const days = Math.round((range.end - range.start) / DAY_MS);
  if (!Number.isInteger(days) || days < 1) return null;
  const start = range.start - days * DAY_MS;
  const oldest = dateKey(now - 29 * DAY_MS);
  const from = dateKey(start);
  if (from < oldest) return null;
  return { from, to: dateKey(range.start - DAY_MS), start, end: range.start };
}

export function tally(rows) {
  const total = {
    visits: 0,
    opens: 0,
    focus: 0,
    errors: 0,
    completions: 0,
    copies: 0,
    transcripts: 0,
    searches: 0,
    library: 0,
    workspace: 0,
  };
  for (const row of rows || []) {
    const count = Number(row.events || 0);
    const kind = row.kind;
    if (kind === 'visit') total.visits += count;
    else if (kind === 'note_open') total.opens += count;
    else if (kind === 'focus') total.focus += Number(row.value || 0);
    else if (kind === 'read_100') total.completions += count;
    else if (kind === 'copy') total.copies += count;
    else if (kind === 'transcript') total.transcripts += count;
    else if (kind === 'search') total.searches += count;
    else if (kind === 'page_library') total.library += count;
    else if (kind === 'page_workspace') total.workspace += count;
    else if (String(kind).startsWith('error_')) total.errors += count;
  }
  return total;
}

export async function statistics(db, range, now = Date.now()) {
  const { from, to, start, end } = range;
  const previous = comparisonWindow(range, now);
  const compareFrom = previous?.from || '9999-01-01';
  const compareTo = previous?.to || '9999-01-01';
  const compareStart = previous?.start || 0;
  const compareEnd = previous?.end || 0;
  const [
    daily,
    diagnostics,
    visitors,
    linkedDaily,
    hourly,
    linked,
    coverage,
    browsers,
    platforms,
    diagnosticCount,
    previousDaily,
    previousLinked,
    engagement,
    sessions,
    referrers,
    countries,
    devices,
    languages,
  ] = await db.batch([
    db
      .prepare('SELECT day,kind,note,events,value FROM daily WHERE day>=? AND day<=? ORDER BY day')
      .bind(from, to),
    db
      .prepare(
        'SELECT received_at,ip,browser,platform,language,viewport,country FROM diagnostics WHERE received_at>=? AND received_at<? ORDER BY received_at DESC LIMIT 100',
      )
      .bind(start, end),
    db
      .prepare(
        `SELECT visitor,MIN(at) AS first_seen,MAX(at) AS last_seen,COUNT(DISTINCT session) AS sessions,
      SUM(kind='visit') AS visits,SUM(kind='note_open') AS opens,
      SUM(CASE WHEN kind='focus' THEN value ELSE 0 END) AS focus_ms,
      SUM(kind='read_100') AS completions,COUNT(DISTINCT NULLIF(note,'')) AS notes
      FROM visitor_events WHERE at>=? AND at<? GROUP BY visitor ORDER BY last_seen DESC LIMIT 200`,
      )
      .bind(start, end),
    db
      .prepare(
        `SELECT strftime('%Y-%m-%d',at/1000,'unixepoch','+8 hours') AS day,
      COUNT(DISTINCT visitor) AS visitors,COUNT(DISTINCT session) AS sessions,COUNT(*) AS events
      FROM visitor_events WHERE at>=? AND at<? GROUP BY day ORDER BY day`,
      )
      .bind(start, end),
    db
      .prepare(
        `SELECT strftime('%Y-%m-%d',at/1000,'unixepoch','+8 hours') AS day,
      CAST(strftime('%H',at/1000,'unixepoch','+8 hours') AS INTEGER) AS hour,
      SUM(kind='visit') AS visits,SUM(kind='note_open') AS opens,COUNT(*) AS events,
      SUM(CASE WHEN kind='focus' THEN value ELSE 0 END) AS focus_ms
      FROM visitor_events WHERE at>=? AND at<? GROUP BY day,hour ORDER BY day,hour`,
      )
      .bind(start, end),
    db
      .prepare(
        'SELECT COUNT(DISTINCT visitor) AS visitors,COUNT(DISTINCT session) AS sessions,COUNT(*) AS events FROM visitor_events WHERE at>=? AND at<?',
      )
      .bind(start, end),
    db.prepare('SELECT MIN(day) AS first_day FROM daily'),
    db
      .prepare(
        `SELECT CASE WHEN browser LIKE '%Edg/%' THEN 'Edge' WHEN browser LIKE '%OPR/%' THEN 'Opera'
      WHEN browser LIKE '%Firefox/%' THEN 'Firefox' WHEN browser LIKE '%Chrome/%' OR browser LIKE '%CriOS/%' THEN 'Chrome'
      WHEN browser LIKE '%Safari/%' THEN 'Safari' ELSE '其他' END AS label,COUNT(*) AS records
      FROM diagnostics WHERE received_at>=? AND received_at<? GROUP BY label ORDER BY records DESC`,
      )
      .bind(start, end),
    db
      .prepare(
        `SELECT CASE WHEN browser LIKE '%iPhone%' OR browser LIKE '%iPad%' THEN 'iOS / iPadOS'
      WHEN browser LIKE '%Android%' THEN 'Android' WHEN platform LIKE '%Mac%' THEN 'macOS'
      WHEN platform LIKE '%Win%' THEN 'Windows' WHEN platform LIKE '%Linux%' THEN 'Linux' ELSE '其他' END AS label,COUNT(*) AS records
      FROM diagnostics WHERE received_at>=? AND received_at<? GROUP BY label ORDER BY records DESC`,
      )
      .bind(start, end),
    db
      .prepare('SELECT COUNT(*) AS records FROM diagnostics WHERE received_at>=? AND received_at<?')
      .bind(start, end),
    db
      .prepare('SELECT day,kind,note,events,value FROM daily WHERE day>=? AND day<=?')
      .bind(compareFrom, compareTo),
    db
      .prepare(
        'SELECT COUNT(DISTINCT visitor) AS visitors,COUNT(DISTINCT session) AS sessions FROM visitor_events WHERE at>=? AND at<?',
      )
      .bind(compareStart, compareEnd),
    db
      .prepare(
        `SELECT COALESCE(SUM(CASE WHEN first_at>=? AND first_at<? THEN 1 ELSE 0 END),0) AS new_visitors,
      COALESCE(SUM(CASE WHEN first_at<? THEN 1 ELSE 0 END),0) AS returning_visitors
      FROM (SELECT visitor,MIN(at) AS first_at FROM visitor_events GROUP BY visitor)
      WHERE visitor IN (SELECT visitor FROM visitor_events WHERE at>=? AND at<?)`,
      )
      .bind(start, end, start, start, end),
    db
      .prepare(
        `SELECT COUNT(*) AS sessions,COALESCE(AVG(span),0) AS avg_span,COALESCE(SUM(focus_ms),0) AS focus_ms
      FROM (SELECT MAX(at)-MIN(at) AS span,SUM(CASE WHEN kind='focus' THEN value ELSE 0 END) AS focus_ms
      FROM visitor_events WHERE at>=? AND at<? GROUP BY session)`,
      )
      .bind(start, end),
    db
      .prepare(
        `SELECT label,SUM(events) AS events FROM traffic WHERE kind='referrer' AND day>=? AND day<=?
      GROUP BY label ORDER BY events DESC LIMIT 12`,
      )
      .bind(from, to),
    db
      .prepare(
        `SELECT label,SUM(events) AS events FROM traffic WHERE kind='country' AND day>=? AND day<=?
      GROUP BY label ORDER BY events DESC LIMIT 12`,
      )
      .bind(from, to),
    db
      .prepare(
        `SELECT CASE
      WHEN browser LIKE '%iPad%' OR browser LIKE '%Tablet%' OR (browser LIKE '%Android%' AND browser NOT LIKE '%Mobile%' AND browser NOT LIKE '%Mobi%') THEN '平板'
      WHEN browser LIKE '%Mobi%' OR browser LIKE '%iPhone%' OR browser LIKE '%Android%' THEN '手机'
      WHEN browser='' THEN '未知' ELSE '桌面' END AS label,COUNT(*) AS records
      FROM diagnostics WHERE received_at>=? AND received_at<? GROUP BY label ORDER BY records DESC`,
      )
      .bind(start, end),
    db
      .prepare(
        `SELECT CASE WHEN language='' THEN '未知' ELSE language END AS label,COUNT(*) AS records
      FROM diagnostics WHERE received_at>=? AND received_at<? GROUP BY label ORDER BY records DESC LIMIT 8`,
      )
      .bind(start, end),
  ]);
  const compareTotals = tally(previousDaily.results);
  const sessionRow = sessions.results[0] || {};
  const people = engagement.results[0] || {};
  return {
    range,
    daily: daily.results,
    diagnostics: diagnostics.results,
    visitors: visitors.results,
    linkedDaily: linkedDaily.results,
    hourly: hourly.results,
    linked: linked.results[0],
    firstDay: coverage.results[0]?.first_day || null,
    environment: {
      browsers: browsers.results,
      platforms: platforms.results,
      records: diagnosticCount.results[0]?.records || 0,
    },
    compare: previous
      ? {
          ...previous,
          ...compareTotals,
          visitors: Number(previousLinked.results[0]?.visitors || 0),
          sessions: Number(previousLinked.results[0]?.sessions || 0),
        }
      : null,
    engagement: {
      newVisitors: Number(people.new_visitors || 0),
      returningVisitors: Number(people.returning_visitors || 0),
      sessions: Number(sessionRow.sessions || 0),
      avgSpanMs: Number(sessionRow.avg_span || 0),
      focusMs: Number(sessionRow.focus_ms || 0),
    },
    referrers: referrers.results,
    countries: countries.results,
    devices: devices.results,
    languages: languages.results,
    limits: { visitors: 200, diagnostics: 100 },
    updatedAt: Date.now(),
  };
}

export async function activity(db, url, range, visitor = '') {
  const day = url.searchParams.get('day');
  if (day && (!/^\d{4}-\d{2}-\d{2}$/.test(day) || day < range.from || day > range.to))
    throw Error('invalid_day');
  const start = day ? Date.parse(day + 'T00:00:00+08:00') : range.start;
  const end = day ? start + DAY_MS : range.end;
  const conditions = ['at>=?', 'at<?'];
  const values = [start, end];
  if (visitor) {
    conditions.push('visitor=?');
    values.push(visitor);
  }
  const cursor = url.searchParams.get('cursor');
  if (cursor) {
    let parsed;
    try {
      parsed = JSON.parse(cursor);
    } catch {
      throw Error('invalid_cursor');
    }
    if (
      !Number.isSafeInteger(parsed.at) ||
      typeof parsed.id !== 'string' ||
      !/^[a-f0-9-]{36}$/i.test(parsed.id)
    )
      throw Error('invalid_cursor');
    conditions.push('(at<? OR (at=? AND id<?))');
    values.push(parsed.at, parsed.at, parsed.id);
  }
  const result = await db
    .prepare(
      `SELECT id,at,visitor,session,kind,note,value,ip,browser
    FROM visitor_events WHERE ${conditions.join(' AND ')} ORDER BY at DESC,id DESC LIMIT 101`,
    )
    .bind(...values)
    .all();
  const events = result.results.slice(0, 100);
  const last = events.at(-1);
  return {
    events,
    next: result.results.length > 100 ? JSON.stringify({ at: last.at, id: last.id }) : null,
  };
}
