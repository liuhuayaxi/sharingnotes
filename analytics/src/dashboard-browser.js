const $ = (id) => document.getElementById(id);
const DAY_MS = 86400000;
const kinds = {
  visit: '访问网站',
  note_open: '打开笔记',
  focus: '专注阅读',
  read_25: '读至 25%',
  read_50: '读至 50%',
  read_75: '读至 75%',
  read_100: '读至 100%',
  error_load: '加载错误',
  error_script: '程序错误',
};
const metricNames = { visits: '访问次数', opens: '笔记打开', focus: '专注分钟' };
const colors = ['#147d67', '#73acbf', '#d8b16a', '#8f8eb1', '#bb8793', '#a6afb8'];
const state = {
  data: null,
  model: null,
  catalog: {},
  metric: 'visits',
  day: '',
  sort: 'focus',
  visitor: '',
  activityNext: null,
  visitorNext: null,
  loadVersion: 0,
  activityVersion: 0,
  visitorVersion: 0,
};
const number = (value) => Number(value || 0).toLocaleString('zh-CN');
const escapeHTML = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch],
  );
const dayKey = (at) => new Date(at + 8 * 3600000).toISOString().slice(0, 10);
const localDate = (day) => new Date(day + 'T12:00:00+08:00');
const time = (at) =>
  new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Taipei',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(new Date(at));
const dateTime = (at) =>
  new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Taipei',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(at));
const dateLabel = (day) =>
  new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Taipei',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  }).format(localDate(day));

function duration(ms) {
  if (!ms) return '0 分钟';
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return seconds + ' 秒';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return minutes + ' 分 ' + (seconds % 60) + ' 秒';
  return Math.floor(minutes / 60) + ' 小时 ' + (minutes % 60) + ' 分';
}

function emptyMetrics() {
  return {
    visits: 0,
    opens: 0,
    focus: 0,
    errors: 0,
    complete: 0,
    read_25: 0,
    read_50: 0,
    read_75: 0,
    read_100: 0,
    events: 0,
  };
}

function accumulate(target, event) {
  const count = Number(event.events || 0);
  target.events += count;
  if (event.kind === 'visit') target.visits += count;
  if (event.kind === 'note_open') target.opens += count;
  if (event.kind === 'focus') target.focus += Number(event.value || 0);
  if (event.kind.startsWith('error_')) target.errors += count;
  if (event.kind.startsWith('read_')) target[event.kind] += count;
  if (event.kind === 'read_100') target.complete += count;
}

function aggregate(rows) {
  const total = emptyMetrics();
  const notes = {};
  for (const event of rows) {
    accumulate(total, event);
    if (event.note) {
      const note = (notes[event.note] ||= { id: event.note, ...emptyMetrics() });
      accumulate(note, event);
    }
  }
  return { total, notes: Object.values(notes) };
}

function buildModel(data) {
  const linked = Object.fromEntries(data.linkedDaily.map((day) => [day.day, day]));
  const byDay = {};
  for (const event of data.daily) (byDay[event.day] ||= []).push(event);
  const days = [];
  for (
    let at = Date.parse(data.range.from + 'T00:00:00+08:00');
    dayKey(at) <= data.range.to;
    at += DAY_MS
  ) {
    const day = dayKey(at);
    days.push({
      day,
      recorded: Boolean(data.firstDay && day >= data.firstDay),
      ...aggregate(byDay[day] || []),
      linked: linked[day] || { visitors: 0, sessions: 0, events: 0 },
    });
  }
  return { days, ...aggregate(data.daily) };
}

function noteInfo(id) {
  return state.catalog[id] || { title: id, course: '未匹配课程' };
}

function noteLink(id, className = '') {
  if (!id) return '—';
  const note = noteInfo(id);
  return `<a class="${className}" href="https://liuhuayaxi.github.io/sharingnotes/?note=${encodeURIComponent(id)}" target="_blank" rel="noopener" title="${escapeHTML(note.course + ' · ' + note.title)}">${escapeHTML(note.title)}</a>`;
}

function empty(target, message) {
  target.innerHTML = `<p class="empty">${escapeHTML(message)}</p>`;
}

function emptyTable(target, columns, message) {
  target.innerHTML = `<tr><td colspan="${columns}" class="empty">${escapeHTML(message)}</td></tr>`;
}

async function api(path, params) {
  const response = await fetch(path + '?' + params);
  if (response.status === 401) {
    location.reload();
    throw Error('登录已过期');
  }
  if (!response.ok)
    throw Error(
      response.status === 400 ? '请检查日期范围，最多查看最近 30 天。' : '数据读取失败，请重试。',
    );
  return response.json();
}

function rangeParams() {
  return new URLSearchParams({ from: state.data.range.from, to: state.data.range.to });
}

function renderSummary() {
  const { total, notes, days } = state.model;
  const activeDays = days.filter((day) => day.total.events > 0).length;
  const metrics = [
    ['访问次数', number(total.visits), `${activeDays} 天有使用记录`],
    ['笔记打开', number(total.opens), `涉及 ${notes.length} 篇笔记`],
    [
      '专注时长',
      number(Math.round(total.focus / 6000) / 10) + '<span class="metric-unit">分钟</span>',
      duration(total.focus),
    ],
    ['关联访客', number(state.data.linked.visitors), '按浏览器标识去重'],
    ['关联会话', number(state.data.linked.sessions), '所选日期内去重'],
    [
      '错误记录',
      number(total.errors),
      `加载 ${number(state.data.daily.filter((e) => e.kind === 'error_load').reduce((sum, e) => sum + e.events, 0))} · 程序 ${number(state.data.daily.filter((e) => e.kind === 'error_script').reduce((sum, e) => sum + e.events, 0))}`,
    ],
  ];
  $('summary').innerHTML = metrics
    .map(
      ([label, value, caption]) =>
        `<article class="metric-card"><div class="metric-label"><i class="metric-dot"></i>${label}</div><strong>${value}</strong><small>${caption}</small></article>`,
    )
    .join('');
}

function chartValue(day) {
  return state.metric === 'focus' ? day.total.focus / 60000 : day.total[state.metric];
}

function renderTrend() {
  const { days, total } = state.model;
  const metric = state.metric;
  const width = Math.max(320, $('trend-chart').clientWidth),
    height = 235,
    left = 42,
    right = 12,
    top = 12,
    bottom = 30;
  const plotHeight = height - top - bottom;
  const peak = days.reduce(
    (best, day) => (chartValue(day) > chartValue(best) ? day : best),
    days[0],
  );
  const maximum = Math.max(...days.map(chartValue), 1);
  const magnitude = 10 ** Math.floor(Math.log10(maximum));
  const ceiling = Math.ceil((Math.ceil(maximum / magnitude) * magnitude) / 4) * 4;
  const slot = (width - left - right) / days.length;
  const barWidth = Math.min(44, slot * 0.58);
  const svg = [
    `<svg class="trend-chart" viewBox="0 0 ${width} ${height}" role="group" aria-label="${metricNames[metric]}每日柱状图">`,
  ];
  for (let tick = 0; tick <= 4; tick++) {
    const y = top + (plotHeight * tick) / 4;
    const value = ceiling * (1 - tick / 4);
    svg.push(
      `<line class="chart-grid" x1="${left}" x2="${width - right}" y1="${y}" y2="${y}"/><text class="chart-label" x="${left - 10}" y="${y + 4}" text-anchor="end">${number(Math.round(value * 10) / 10)}</text>`,
    );
  }
  days.forEach((day, index) => {
    const value = chartValue(day);
    const x = left + slot * index + slot / 2;
    const barHeight = day.recorded ? Math.max((value / ceiling) * plotHeight, 2) : 3;
    const label = day.recorded
      ? `${day.day}，${metricNames[metric]} ${number(Math.round(value * 10) / 10)}`
      : `${day.day}，未记录`;
    svg.push(
      `<g class="chart-hit" role="button" tabindex="0" data-day="${day.day}" aria-label="${label}" aria-pressed="${day.day === state.day}"><title>${label}</title><rect fill="transparent" x="${x - slot / 2}" y="0" width="${slot}" height="${height}"/><rect class="${day.recorded ? 'chart-bar' : 'chart-no-data'} ${day.day === state.day ? 'selected' : ''}" x="${x - barWidth / 2}" y="${top + plotHeight - barHeight}" width="${barWidth}" height="${barHeight}" rx="3"/>`,
    );
    if (days.length <= 14 || index % 3 === 0 || index === days.length - 1)
      svg.push(
        `<text class="chart-label" x="${x}" y="${height - 7}" text-anchor="middle">${day.day.slice(5).replace('-', '/')}</text>`,
      );
    if (value > 0 && (days.length <= 14 || day.day === peak.day))
      svg.push(
        `<text class="chart-label" x="${x}" y="${top + plotHeight - barHeight - 7}" text-anchor="middle">${number(Math.round(value * 10) / 10)}</text>`,
      );
    svg.push('</g>');
  });
  svg.push('</svg>');
  $('trend-chart').innerHTML = svg.join('');
  $('trend-legend').textContent = metricNames[metric];
  $('trend-range').textContent = `${state.data.range.from} — ${state.data.range.to} · UTC+8`;
  const recorded = days.filter((day) => day.recorded);
  const sum = metric === 'focus' ? total.focus / 60000 : total[metric];
  const insights = [
    ['期间合计', metric === 'focus' ? duration(total.focus) : number(sum), metricNames[metric]],
    [
      '单日最高',
      maximum === 1 && sum === 0 ? '暂无记录' : peak.day.slice(5).replace('-', ' / '),
      sum === 0
        ? '等待新的使用记录'
        : metric === 'focus'
          ? duration(peak.total.focus)
          : `${number(chartValue(peak))} 次`,
    ],
    [
      '日均',
      recorded.length ? number(Math.round((sum / recorded.length) * 10) / 10) : '—',
      `按 ${recorded.length} 个已记录自然日计算${metric === 'focus' ? ' · 分钟' : ' · 次'}`,
    ],
  ];
  $('trend-insights').innerHTML = insights
    .map(
      ([label, value, detail]) =>
        `<div><p class="insight-label">${label}</p><p class="insight-value">${value}</p><p class="insight-detail">${detail}</p></div>`,
    )
    .join('');
  $('trend-controls')
    .querySelectorAll('button')
    .forEach((button) =>
      button.setAttribute('aria-pressed', String(button.dataset.metric === metric)),
    );
}

function renderDayRail() {
  $('day-rail').innerHTML = [...state.model.days]
    .reverse()
    .map(
      (day) =>
        `<button class="day-button" type="button" data-day="${day.day}" aria-pressed="${day.day === state.day}"><small>${day.day === state.data.range.today ? '今天' : new Intl.DateTimeFormat('zh-CN', { weekday: 'short', timeZone: 'Asia/Taipei' }).format(localDate(day.day))}</small><strong>${day.day.slice(5).replace('-', ' / ')}</strong><div class="day-value">${day.recorded ? number(day.total.visits) + ' 次访问' : '未记录'}</div></button>`,
    )
    .join('');
}

function sortedNotes(notes) {
  return [...notes].sort((a, b) => b.focus - a.focus || b.opens - a.opens);
}

function renderDay() {
  const day = state.model.days.find((day) => day.day === state.day);
  const { total, notes, linked } = day;
  const ranked = sortedNotes(notes);
  const courseTotals = {};
  for (const note of notes) {
    const course = noteInfo(note.id).course;
    courseTotals[course] = (courseTotals[course] || 0) + note.focus;
  }
  const courses = Object.entries(courseTotals).sort((a, b) => b[1] - a[1]);
  const hours = state.data.hourly.filter((hour) => hour.day === day.day);
  const peak = hours.reduce(
    (best, hour) => (hour.focus_ms > (best?.focus_ms || 0) ? hour : best),
    null,
  );
  let summary = `累计 ${number(total.visits)} 次访问，打开 ${number(total.opens)} 次笔记，专注 ${duration(total.focus)}。`;
  if (!day.recorded) summary = '这一天没有保留的使用记录。';
  else if (!total.events) summary = '这一天没有收到使用记录。';
  $('day-summary').innerHTML =
    `<div class="section-head"><div><p class="eyebrow">DAILY REPORT</p><h2 class="date-heading">${dateLabel(day.day)}</h2></div><span class="tag green">${day.day === state.data.range.today ? '今日进行中' : '每日汇总'}</span></div><p class="daily-copy">${summary}</p><div class="day-metrics">${[
      ['阅读篇数', notes.length],
      ['关联访客', linked.visitors],
      ['关联会话', linked.sessions],
      ['读至 100%', total.complete],
    ]
      .map(
        ([label, value]) =>
          `<div><strong>${day.recorded ? number(value) : '—'}</strong><span>${label}</span></div>`,
      )
      .join(
        '',
      )}</div><div class="day-highlights"><div><span>最投入课程</span>${courses[0]?.[1] ? escapeHTML(courses[0][0]) + ' · ' + duration(courses[0][1]) : '暂无专注记录'}</div><div><span>当天错误</span>${number(total.errors)} 次</div></div>`;
  $('daily-note-count').textContent = notes.length + ' 篇';
  if (!ranked.length) empty($('day-ranking'), '当天暂无笔记阅读记录');
  else
    $('day-ranking').innerHTML = ranked
      .slice(0, 5)
      .map(
        (note, index) =>
          `<div class="rank-row"><span class="rank-number">${String(index + 1).padStart(2, '0')}</span><div><div class="rank-title">${noteLink(note.id)}</div><div class="bar-track"><div class="bar-fill" style="width:${ranked[0].focus ? (note.focus / ranked[0].focus) * 100 : 0}%"></div></div></div><span class="rank-value">${note.focus ? duration(note.focus) : number(note.opens) + ' 次打开'}</span></div>`,
      )
      .join('');
  const maxProgress = Math.max(...[25, 50, 75, 100].map((value) => total['read_' + value]), 1);
  $('reading-progress').innerHTML = [25, 50, 75, 100]
    .map(
      (value) =>
        `<div class="progress-row"><span>读至 ${value}%</span><div class="bar-track"><div class="bar-fill" style="width:${(total['read_' + value] / maxProgress) * 100}%"></div></div><strong>${number(total['read_' + value])}</strong></div>`,
    )
    .join('');
  renderCourses(courses);
  const peakValue = Math.max(...hours.map((hour) => hour.focus_ms), 1);
  $('hours').innerHTML = Array.from({ length: 24 }, (_, hour) => {
    const record = hours.find((item) => item.hour === hour);
    const ms = record?.focus_ms || 0;
    return `<div class="hour-column ${peak?.hour === hour ? 'peak' : ''}" title="${String(hour).padStart(2, '0')}:00–${String(hour + 1).padStart(2, '0')}:00 · 专注 ${duration(ms)} · ${record?.opens || 0} 次打开"><div class="hour-bar" style="height:${(ms / peakValue) * 100}%"></div>${hour % 3 === 0 || hour === 23 ? `<span class="hour-label">${String(hour).padStart(2, '0')}</span>` : ''}</div>`;
  }).join('');
  $('peak-hour').textContent = peak
    ? `${String(peak.hour).padStart(2, '0')}:00 最活跃`
    : '暂无专注记录';
  $('hour-caption').textContent = peak
    ? `峰值时段累计专注 ${duration(peak.focus_ms)} · 按专注事件上报时刻归入小时`
    : '当天暂无关联的专注记录';
  $('activity-count').textContent = number(linked.events) + ' 条关联事件';
  $('activity-caption').textContent = `${day.day} · 关联记录 · 按发生时间排列`;
}

function renderCourses(courses) {
  const active = courses.filter(([, ms]) => ms > 0);
  const total = active.reduce((sum, [, ms]) => sum + ms, 0);
  if (!total) {
    empty($('course-chart'), '当天暂无课程专注记录');
    return;
  }
  const groups = active.slice(0, 5);
  if (active.length > 5)
    groups.push(['其他课程', active.slice(5).reduce((sum, [, ms]) => sum + ms, 0)]);
  let offset = 0;
  const stops = groups.map(([, ms], index) => {
    const from = offset;
    offset += (ms / total) * 100;
    return `${colors[index]} ${from}% ${offset}%`;
  });
  $('course-chart').innerHTML =
    `<div class="donut-layout"><div class="donut" role="img" aria-label="${escapeHTML(groups.map(([name, ms]) => name + ' ' + Math.round((ms / total) * 100) + '%').join('，'))}" style="background:conic-gradient(${stops.join(',')})"><div class="donut-hole">${active.length}<small>门课程</small></div></div><div class="course-legend">${groups.map(([name, ms], index) => `<div title="${escapeHTML(name)} · ${duration(ms)}"><i style="background:${colors[index]}"></i><span>${escapeHTML(name)}</span><strong>${Math.round((ms / total) * 100)}%</strong></div>`).join('')}</div></div>`;
}

function renderDays() {
  $('days-count').textContent = state.model.days.length + ' 天';
  $('days').innerHTML = [...state.model.days]
    .reverse()
    .map(
      (day) =>
        `<tr class="${day.day === state.day ? 'selected-row' : ''}"><td><button class="table-button" type="button" data-day="${day.day}">${day.day}${day.day === state.data.range.today ? ' · 今天' : ''}</button></td>${[number(day.total.visits), number(day.total.opens), duration(day.total.focus), number(day.linked.visitors), number(day.linked.sessions), number(day.total.complete), number(day.total.errors)].map((value) => `<td class="number">${day.recorded ? value : '—'}</td>`).join('')}</tr>`,
    )
    .join('');
}

function renderNotes() {
  const search = $('note-search').value.trim().toLocaleLowerCase();
  const notes = state.model.notes
    .filter((note) => {
      const info = noteInfo(note.id);
      return (info.course + ' ' + info.title).toLocaleLowerCase().includes(search);
    })
    .sort((a, b) => b[state.sort] - a[state.sort] || b.opens - a.opens);
  if (!notes.length) emptyTable($('notes'), 7, search ? '没有匹配的笔记' : '所选范围暂无笔记记录');
  else
    $('notes').innerHTML = notes
      .map(
        (note) =>
          `<tr><td class="title-cell">${noteLink(note.id)}<small>${escapeHTML(noteInfo(note.id).course)}</small></td><td class="number">${number(note.opens)}</td><td class="number">${duration(note.focus)}</td>${[25, 50, 75, 100].map((value) => `<td class="number">${number(note['read_' + value])}</td>`).join('')}</tr>`,
      )
      .join('');
  $('notes-foot').textContent =
    `显示 ${notes.length} / ${state.model.notes.length} 篇笔记 · 按${state.sort === 'focus' ? '专注时长' : '打开次数'}排序`;
  $('sort-opens').textContent = '打开次数 ' + (state.sort === 'opens' ? '↓' : '↕');
  $('sort-focus').textContent = '专注时长 ' + (state.sort === 'focus' ? '↓' : '↕');
}

function renderVisitors() {
  const visitors = state.data.visitors;
  if (!visitors.length) emptyTable($('visitors'), 8, '所选范围暂无关联访客记录');
  else
    $('visitors').innerHTML = visitors
      .map(
        (visitor, index) =>
          `<tr><td><button class="table-button" type="button" data-visitor="${escapeHTML(visitor.visitor)}" title="${escapeHTML(visitor.visitor)}"><span class="visitor-avatar">${String(index + 1).padStart(2, '0')}</span><span class="visitor-id">${escapeHTML(visitor.visitor.slice(0, 8))}</span></button></td><td>${dateTime(visitor.first_seen)}<br><small>${dateTime(visitor.last_seen)}</small></td><td class="number">${number(visitor.sessions)}</td><td class="number">${number(visitor.visits)}</td><td class="number">${number(visitor.opens)}</td><td class="number">${number(visitor.notes)}</td><td class="number">${duration(visitor.focus_ms)}</td><td class="number">${number(visitor.completions)}</td></tr>`,
      )
      .join('');
  $('visitors-foot').textContent =
    `显示最近活跃的 ${visitors.length} / ${number(state.data.linked.visitors)} 个关联访客 · 浏览器标识对应同一浏览器的访问记录`;
}

function distribution(target, rows) {
  const total = rows.reduce((sum, row) => sum + row.records, 0);
  if (!total) {
    empty(target, '暂无环境分享记录');
    return;
  }
  target.innerHTML = rows
    .map(
      (row) =>
        `<div class="distribution-row"><header><span>${escapeHTML(row.label)}</span><span>${number(row.records)} · ${Math.round((row.records / total) * 100)}%</span></header><div class="bar-track"><div class="bar-fill" style="width:${(row.records / total) * 100}%"></div></div></div>`,
    )
    .join('');
}

function renderEnvironment() {
  const { environment, diagnostics } = state.data;
  distribution($('browser-chart'), environment.browsers);
  distribution($('platform-chart'), environment.platforms);
  $('environment-count').textContent = number(environment.records) + ' 次上报';
  if (!diagnostics.length) emptyTable($('diagnostics'), 5, '所选范围暂无环境诊断记录');
  else
    $('diagnostics').innerHTML = diagnostics
      .map(
        (row) =>
          `<tr><td>${dateTime(row.received_at)}</td><td>${escapeHTML(row.ip)}</td><td class="ua">${escapeHTML(row.browser)}</td><td>${escapeHTML(row.platform)}</td><td>${escapeHTML(row.language + ' / ' + row.viewport)}</td></tr>`,
      )
      .join('');
  $('diagnostics-foot').textContent =
    `最近 ${diagnostics.length} / ${number(environment.records)} 条 · 环境分布按全部上报批次统计 · 按接收时间筛选`;
}

function eventBadge(event) {
  const className =
    event.kind === 'focus' ? ' focus' : event.kind.startsWith('error_') ? ' error' : '';
  return `<span class="event-kind${className}">${escapeHTML(kinds[event.kind] || event.kind)}</span>`;
}

async function loadActivity(append = false) {
  const version = ++state.activityVersion;
  const params = rangeParams();
  params.set('day', state.day);
  if (append && state.activityNext) params.set('cursor', state.activityNext);
  $('activity-more').disabled = true;
  $('activity-more').textContent = '加载更多记录';
  if (!append) {
    emptyTable($('activity'), 5, '正在读取当天足迹…');
    $('activity-more').hidden = true;
  }
  try {
    const data = await api('/api/activity', params);
    if (version !== state.activityVersion) return;
    if (!append) $('activity').replaceChildren();
    for (const event of data.events) {
      $('activity').insertAdjacentHTML(
        'beforeend',
        `<tr><td>${time(event.at)}</td><td><button class="table-button visitor-id" type="button" data-visitor="${event.visitor}" title="${event.visitor}">${event.visitor.slice(0, 8)}</button><br><small class="visitor-id">会话 ${event.session.slice(0, 8)}</small></td><td>${eventBadge(event)}</td><td class="event-note">${noteLink(event.note)}</td><td class="number">${event.kind === 'focus' ? duration(event.value) : number(event.value) + ' 次'}</td></tr>`,
      );
    }
    if (!append && !data.events.length) emptyTable($('activity'), 5, '当天暂无关联访问足迹');
    state.activityNext = data.next;
    $('activity-more').hidden = !data.next;
  } catch (error) {
    if (version !== state.activityVersion) return;
    if (!append) emptyTable($('activity'), 5, error.message);
    else $('activity-more').textContent = '读取失败，点击重试';
  } finally {
    if (version === state.activityVersion) $('activity-more').disabled = false;
  }
}

async function showVisitor(id, append = false, scroll = true) {
  const version = ++state.visitorVersion;
  state.visitor = id;
  $('visitor-detail').hidden = false;
  $('visitor-title').textContent = '访客 ' + id.slice(0, 8);
  $('visitor-caption').textContent = `${id} · ${state.data.range.from} — ${state.data.range.to}`;
  const params = rangeParams();
  params.set('id', id);
  if (append && state.visitorNext) params.set('cursor', state.visitorNext);
  $('visitor-more').disabled = true;
  $('visitor-more').textContent = '加载更多记录';
  if (!append) {
    emptyTable($('visitor-events'), 7, '正在读取访客记录…');
    $('visitor-more').hidden = true;
  }
  if (scroll)
    $('visitor-detail').scrollIntoView({
      behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
      block: 'start',
    });
  try {
    const data = await api('/api/visitor', params);
    if (version !== state.visitorVersion) return;
    if (!append) $('visitor-events').replaceChildren();
    for (const event of data.events)
      $('visitor-events').insertAdjacentHTML(
        'beforeend',
        `<tr><td>${dateTime(event.at)}<br><small>${time(event.at)}</small></td><td class="visitor-id" title="${event.session}">${event.session.slice(0, 8)}</td><td>${eventBadge(event)}</td><td class="event-note">${noteLink(event.note)}</td><td>${event.kind === 'focus' ? duration(event.value) : number(event.value) + ' 次'}</td><td>${escapeHTML(event.ip || '—')}</td><td class="ua">${escapeHTML(event.browser || '—')}</td></tr>`,
      );
    if (!append && !data.events.length)
      emptyTable($('visitor-events'), 7, '所选范围暂无该访客记录');
    state.visitorNext = data.next;
    $('visitor-more').hidden = !data.next;
  } catch (error) {
    if (version !== state.visitorVersion) return;
    if (!append) emptyTable($('visitor-events'), 7, error.message);
    else $('visitor-more').textContent = '读取失败，点击重试';
  } finally {
    if (version === state.visitorVersion) $('visitor-more').disabled = false;
  }
}

function selectDay(day, scroll = false) {
  if (!state.model?.days.some((item) => item.day === day)) return;
  state.day = day;
  renderTrend();
  renderDayRail();
  renderDay();
  renderDays();
  void loadActivity();
  if (scroll)
    $('daily-heading').scrollIntoView({
      block: 'start',
      behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
    });
}

async function load() {
  const from = $('from').value,
    to = $('to').value;
  if (!from || !to || from > to) {
    $('error-banner').hidden = false;
    $('error-banner').textContent = '请选择有效的起止日期，开始日期应早于或等于结束日期。';
    return;
  }
  const version = ++state.loadVersion;
  $('refresh').disabled = true;
  $('apply').disabled = true;
  $('status').textContent = '正在更新…';
  $('error-banner').hidden = true;
  try {
    const data = await api('/api/stats', new URLSearchParams({ from, to }));
    if (version !== state.loadVersion) return;
    state.data = data;
    state.model = buildModel(data);
    renderSummary();
    renderNotes();
    renderVisitors();
    renderEnvironment();
    selectDay(state.model.days.some((day) => day.day === state.day) ? state.day : data.range.to);
    if (state.visitor) void showVisitor(state.visitor, false, false);
    $('dashboard').classList.remove('loading');
    $('status').textContent = '更新于 ' + time(data.updatedAt);
    $('coverage-note').textContent = data.firstDay
      ? `最早保留记录 ${data.firstDay} · 使用记录保留约 30 天`
      : '暂无使用记录 · 数据保留约 30 天';
  } catch (error) {
    if (version !== state.loadVersion) return;
    $('error-banner').hidden = false;
    $('error-banner').textContent =
      error.message + (state.data ? ' 当前保留上次成功读取的数据。' : '');
    $('status').textContent = '更新失败';
  } finally {
    if (version === state.loadVersion) {
      $('refresh').disabled = false;
      $('apply').disabled = false;
    }
  }
}

function setPreset(days) {
  const now = Date.now();
  $('to').value = dayKey(now);
  $('from').value = dayKey(now - (days - 1) * DAY_MS);
}

async function initialize() {
  const today = dayKey(Date.now()),
    oldest = dayKey(Date.now() - 29 * DAY_MS);
  for (const id of ['from', 'to']) {
    $(id).min = oldest;
    $(id).max = today;
  }
  setPreset(30);
  $('filter-form').onsubmit = (event) => {
    event.preventDefault();
    void load();
  };
  $('range').onchange = () => {
    if ($('range').value !== 'custom') {
      setPreset(Number($('range').value));
      void load();
    }
  };
  $('from').onchange = $('to').onchange = () => {
    $('range').value = 'custom';
  };
  $('refresh').onclick = () => {
    if ($('range').value !== 'custom') setPreset(Number($('range').value));
    void load();
  };
  $('note-search').oninput = () => {
    if (state.model) renderNotes();
  };
  $('sort-opens').onclick = () => {
    state.sort = 'opens';
    if (state.model) renderNotes();
  };
  $('sort-focus').onclick = () => {
    state.sort = 'focus';
    if (state.model) renderNotes();
  };
  $('trend-controls').onclick = (event) => {
    const button = event.target.closest('[data-metric]');
    if (button && state.model) {
      state.metric = button.dataset.metric;
      renderTrend();
    }
  };
  for (const id of ['day-rail', 'days', 'trend-chart']) {
    $(id).onclick = (event) => {
      const target = event.target.closest('[data-day]');
      if (target) selectDay(target.dataset.day, id !== 'day-rail');
    };
  }
  $('trend-chart').onkeydown = (event) => {
    if ((event.key === 'Enter' || event.key === ' ') && event.target.dataset.day) {
      event.preventDefault();
      selectDay(event.target.dataset.day, true);
    }
  };
  for (const id of ['activity', 'visitors'])
    $(id).onclick = (event) => {
      const target = event.target.closest('[data-visitor]');
      if (target) void showVisitor(target.dataset.visitor);
    };
  $('activity-more').onclick = () => loadActivity(true);
  $('visitor-more').onclick = () => showVisitor(state.visitor, true, false);
  $('visitor-close').onclick = () => {
    state.visitor = '';
    state.visitorVersion++;
    $('visitor-detail').hidden = true;
  };
  let chartWidth = 0;
  new ResizeObserver(([entry]) => {
    const width = Math.round(entry.contentRect.width);
    if (width !== chartWidth) {
      chartWidth = width;
      if (state.model) renderTrend();
    }
  }).observe($('trend-chart'));
  // Fetch public note names once. A catalog failure keeps statistics available.
  const catalogPromise = fetch('https://liuhuayaxi.github.io/sharingnotes/data/catalog.json', {
    signal: AbortSignal.timeout(8000),
  })
    .then((response) => {
      if (!response.ok) throw Error('catalog');
      return response.json();
    })
    .then((catalog) => {
      state.catalog = Object.fromEntries(catalog.notes.map((note) => [note.id, note]));
      if (state.model) {
        renderNotes();
        renderDay();
        void loadActivity();
      }
    })
    .catch(() => {});
  await load();
  await catalogPromise;
}

document.addEventListener('DOMContentLoaded', initialize);
