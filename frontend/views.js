'use strict';
let state,
  page = 'dashboard',
  search = '',
  room = 'all';
const paths = {
  home: 'M3 10 12 3l9 7v11h-6v-7H9v7H3Z',
  plug: 'M8 3v5m8-5v5M6 8h12v4a6 6 0 0 1-6 6v4m0-4a6 6 0 0 1-6-6',
  chart: 'M4 20V10m8 10V4m8 16v-7',
  meter: 'M4 18a9 9 0 1 1 16 0M12 13l4-5M7 18h10',
  bill: 'M5 3h14v19l-3-2-4 2-4-2-3 2ZM8 8h8M8 12h8M8 16h4',
  leaf: 'M19 3C8 2 2 7 5 15s16 7 14-12ZM5 20 15 9',
  bolt: 'm13 2-9 12h7l-1 8 10-13h-7Z',
  shield: 'm12 2 8 3v7c0 5-8 10-8 10S4 17 4 12V5ZM8 12l3 3 5-6',
  user: 'M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM4 22v-3a8 8 0 0 1 16 0v3',
};
const icon = (name) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name] || paths.bolt}"/></svg>`;
const nav = [
  ['dashboard', 'Overview', 'home'],
  ['appliances', 'Appliances', 'plug'],
  ['readings', 'Meter readings', 'meter'],
  ['usage', 'Usage analytics', 'chart'],
  ['bill', 'Bill estimator', 'bill'],
  ['bills', 'Bill history', 'bill'],
  ['profile', 'My profile', 'user'],
  ['security', 'Account security', 'shield'],
];
const titles = Object.fromEntries(nav.map(([id, title]) => [id, title]));
function head(title, description, actions = '') {
  return `<div class="page-heading"><div><h1>${title}</h1><p>${description}</p></div><div class="actions">${actions}</div></div>`;
}

function button(text, action, id = '', kind = '') {
  return `<button type="button" class="button ${kind}" data-action="${action}" data-id="${esc(id)}">${text}</button>`;
}

function link(text, target, kind = '') {
  return `<a class="button ${kind}" href="#${target}">${text}</a>`;
}

function panel(title, description, body, action = '') {
  return `<section class="panel"><div class="panel-head"><div><h2>${title}</h2><p>${description}</p></div>${action}</div>${body}</section>`;
}

function empty(title, description, target, label) {
  return `<div class="empty">${icon('leaf')}<h2>${title}</h2><p>${description}</p>${target ? link(label, target) : ''}</div>`;
}

function metric(label, value, note, symbol = 'bolt') {
  return `<article class="metric"><div class="metric-top">${label}${icon(symbol)}</div><strong>${value}</strong><small>${note}</small></article>`;
}

function form(name, body, submit = 'Save changes') {
  return `<form data-form="${name}">${body}${errorBox()}<button class="button primary" type="submit">${submit}</button></form>`;
}

function table(headers, rows) {
  return `<div class="table-wrap"><table><thead><tr>${headers.map((h) => `<th scope="col">${h}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
}
const sourceNote = () =>
  `<p class="version-note">30-day domestic block tariff · effective ${Energy.tariff.effective}. <a href="${Energy.tariff.source}" target="_blank" rel="noopener">PUCSL source ↗</a><br>Planning estimate only. Excludes arrears, taxes, adjustments and solar export credits. For other billing periods or tariff changes, use the <a href="https://www.pucsl.gov.lk/calculator/" target="_blank" rel="noopener">official calculator ↗</a>.</p>`;
function projection() {
  return Energy.forecast(state.readings, state.appliances);
}

function chart() {
  const data = Energy.intervals(state.readings).slice(-10);
  if (!data.length)
    return empty(
      'A clearer picture starts with two readings',
      'Log cumulative meter values on different dates to see your average daily use.',
      'readings',
      'Add a meter reading'
    );
  const max = Math.max(...data.map((d) => d.average), 1) * 1.15,
    h = 170,
    step = 570 / data.length;
  return `<svg class="chart" role="img" aria-label="Average daily energy use between meter readings, in kWh" viewBox="0 0 650 240">${[0, 0.25, 0.5, 0.75, 1].map((p) => `<line x1="48" x2="628" y1="${195 - p * h}" y2="${195 - p * h}"/><text x="4" y="${199 - p * h}">${num(max * p)}</text>`).join('')}${data.map((d, i) => `<rect x="${55 + i * step + step * 0.2}" y="${195 - (d.average / max) * h}" width="${step * 0.55}" height="${Math.max((d.average / max) * h, 1)}" rx="4"><title>${d.from} to ${d.to}: ${num(d.average)} kWh/day</title></rect><text text-anchor="middle" x="${55 + i * step + step * 0.475}" y="218">${d.to.slice(5)}</text>`).join('')}</svg><p class="chart-description">Each bar is a daily average across a reading interval. See Usage analytics for the full table.</p>`;
}
const houseArt = `<svg class="hero-art" viewBox="0 0 380 240" fill="none" aria-hidden="true"><circle cx="246" cy="111" r="98" fill="#e1e9d8"/><circle cx="302" cy="48" r="19" fill="#dfc889"/><path d="M40 212h321" stroke="#bacbb1"/><path d="M99 117 210 56l105 64-108 65Z" fill="#74957b"/><path d="m99 117 108 65v45L99 164Z" fill="#f9faf2"/><path d="m207 182 108-62v47l-108 60Z" fill="#d3ddc8"/><path d="m85 115 119-70 125 74-14 7-111-66-108 64Z" fill="#3b644b"/><path d="m154 78 41-23 68 41-40 24Z" fill="#284e42" stroke="#f0f4e9" stroke-width="2"/><path d="m170 70 68 41m-51-51 68 41m-84-10 40-24m-19 37 40-24" stroke="#9ab5a3"/><path d="m115 141 23 13v29l-23-13Zm36 20 23 13v29l-23-13Z" fill="#c6d7bc"/><path d="m237 181 27-15v29l-27 15Z" fill="#729581"/><path d="M66 172v38m-12-33c-20-18-2-48 13-33 22-18 33 17 12 31-7 8-18 6-25 2Z" fill="#8ea582"/><path d="M334 189v24m-13-29c-17-14-1-39 12-26 18-14 28 13 10 25-6 7-16 5-22 1Z" fill="#a2b394"/><rect x="55" y="46" width="72" height="33" rx="8" fill="#fff"/><circle cx="70" cy="62" r="5" fill="#74a078"/><path d="M83 58h30m-30 8h20" stroke="#c6d2be" stroke-width="3" stroke-linecap="round"/></svg>`;
function dashboard() {
  const estimate = projection();
  const hasData = state.appliances.length > 0 || state.readings.length > 1;
  const source =
    estimate.source === 'meter'
      ? 'From recorded meter intervals'
      : 'From appliance watts × daily hours';
  return (
    head(
      'Your home, in balance.',
      `Welcome back, ${esc(state.user.name)}. Track your electricity use and understand the cost.`,
      link('+ Add reading', 'readings', 'primary')
    ) +
    `<section class="hero"><div class="hero-copy"><span class="eyebrow">THOUGHTFUL ENERGY. EVERY DAY.</span><h2>Good for your home.<br>Better for tomorrow.</h2><p>${hasData ? 'Your household estimate is ' + num(estimate.monthly) + ' kWh over 30 days. Keep recording your meter to see how your use changes.' : 'Start with your appliances and a meter reading. Two readings let you calculate measured consumption.'}</p>${link('View your appliances ↗', 'appliances')}</div>${houseArt}</section>` +
    `<div class="stats-grid">${metric('Average daily use', hasData ? num(estimate.daily) + ' <small>kWh</small>' : '—', source)}${metric('Estimated 30-day use', hasData ? num(estimate.monthly) + ' <small>kWh</small>' : '—', 'Daily average × 30', 'chart')}${metric('Estimated 30-day bill', hasData ? money(Energy.bill(estimate.monthly).total) : '—', 'Planning estimate · dated tariff', 'bill')}${metric('Your appliances', state.appliances.length, 'Rated power and daily running hours', 'plug')}</div>` +
    `<div class="grid-2">${panel('Your energy story', 'Meter-based daily averages · kWh', chart())}${panel('How the estimate works', source, '<p>With two or more meter readings, we divide consumption by the days between readings, using the latest seven intervals. Otherwise we add appliance watts × daily hours ÷ 1,000.</p><p>The 30-day estimate assumes similar daily use. It is not a live meter reading or a prediction of your actual billing period.</p>' + link('Check a bill estimate →', 'bill') + sourceNote())}</div>`
  );
}

function appliances() {
  const list = state.appliances.filter(
    (a) =>
      (a.name + ' ' + a.room).toLowerCase().includes(search.toLowerCase()) &&
      (room === 'all' || a.room === room)
  );
  return (
    head(
      'Know what powers your home.',
      'Add rated power and effective daily running hours for useful estimates.',
      button('+ Add appliance', 'add-appliance', '', 'primary')
    ) +
    '<div class="notice">Daily estimates use rated power and effective running hours. For a cycling refrigerator, enter compressor running hours rather than plugged-in hours.</div>' +
    `<div class="filter-row"><input id="applianceSearch" type="search" placeholder="Search by appliance or room…" aria-label="Search appliances" value="${esc(search)}"><select id="roomFilter" aria-label="Filter by room"><option value="all">All rooms</option>${[
      ...new Set(state.appliances.map((a) => a.room)),
    ]
      .sort()
      .map((r) => `<option ${r === room ? 'selected' : ''}>${esc(r)}</option>`)
      .join('')}</select></div>` +
    (list.length
      ? `<div class="grid-3">${list.map((a) => `<article class="appliance-card"><div class="appliance-top"><span class="row-icon">${icon('plug')}</span></div><h2>${esc(a.name)}</h2><p>${esc(a.room)}</p><div class="appliance-stats"><div><small>RATED POWER</small><strong>${num(a.watts)} W</strong></div><div><small>DAILY HOURS</small><strong>${num(a.hours)} h</strong></div><div><small>EST. DAILY USE</small><strong>${num((a.watts * a.hours) / 1000)} kWh</strong></div></div><div class="actions">${button('Edit', 'edit-appliance', a.id)}</div></article>`).join('')}</div>`
      : panel(
          'Your household inventory',
          'Start with your everyday essentials.',
          empty(
            search || room !== 'all' ? 'No matching appliances' : 'A fresh start for your home',
            search
              ? 'Try another name or room.'
              : 'Add a fan, refrigerator, air conditioner or another appliance.'
          )
        ))
  );
}

function readings() {
  return (
    head(
      'A habit that adds up.',
      'Record the cumulative kWh value displayed on your electricity meter.'
    ) +
    `<div class="grid-2 grid-equal">${panel('Add a meter reading', 'Use the same meter for every entry.', form('reading', field('Reading date', 'date', today(), 'date', `required max="${today()}" min="2000-01-01"`) + field('Cumulative meter value (kWh)', 'value', '', 'number', 'required min="0" max="999999999" step="0.001" placeholder="e.g. 12540.5"') + field('Note (optional)', 'note', '', 'text', 'maxlength="250" placeholder="e.g. Weekly reading"'), 'Save reading'))}${panel('A reading, not a monthly total', 'How your meter history works', `<div class="security-icon">${icon('meter')}</div><h2>Let your meter tell the story.</h2><p>Enter the total shown on the meter. The difference between two readings gives consumption over that interval.</p><div class="notice">Example: 12,500 → 12,535 over 7 days means 35 kWh used, or 5 kWh per day.</div><p class="help">One reading per date. To correct a mistake, delete it and add the corrected reading. This history assumes the same cumulative meter. If your meter is replaced or rolls over, keep its previous records and ask for help before entering a new baseline.</p>`)}</div>` +
    panel(
      'Reading history',
      `${state.readings.length} saved readings · oldest to newest`,
      state.readings.length
        ? table(
            ['Date', 'Meter value', 'Since previous', 'Note', ''],
            state.readings.map(
              (r, i) =>
                `<tr><td>${esc(r.date)}</td><td>${num(r.value)} kWh</td><td>${i ? num(r.value - state.readings[i - 1].value) + ' kWh' : 'Baseline'}</td><td>${esc(r.note)}</td><td>${button('Delete', 'delete-readings', r.id)}</td></tr>`
            )
          )
        : empty(
            'Your first reading is your baseline',
            'Add a second reading on another date to calculate actual consumption.'
          )
    )
  );
}

function usage() {
  const intervals = Energy.intervals(state.readings),
    daily = Energy.daily(state.appliances),
    rooms = new Map();
  for (const a of state.appliances)
    rooms.set(a.room, (rooms.get(a.room) || 0) + (a.watts * a.hours) / 1000);
  return (
    head(
      'See the pattern. Find the possibility.',
      'Meter readings and appliance estimates, with their sources clearly shown.'
    ) +
    `<div class="grid-2">${panel('Recorded energy use', 'Daily averages between your readings', chart())}${panel(
      'Estimated use by room',
      'Based on rated power × daily hours',
      rooms.size
        ? [...rooms]
            .sort((a, b) => b[1] - a[1])
            .map(
              ([r, k]) =>
                `<div class="row"><strong>${esc(r)}</strong><span>${num(k)} kWh/day</span></div><progress class="progress" max="${daily || 1}" value="${k}" aria-label="${esc(r)} share of estimated use"></progress>`
            )
            .join('')
        : empty(
            'No appliance estimates yet',
            'Add appliances to compare rooms.',
            'appliances',
            'Add appliance'
          )
    )}</div>` +
    panel(
      'Meter intervals',
      'Recorded changes, without fabricated daily or hourly data.',
      intervals.length
        ? table(
            ['From', 'To', 'Days', 'Consumption', 'Daily average'],
            intervals.map(
              (i) =>
                `<tr><td>${i.from}</td><td>${i.to}</td><td>${i.days}</td><td>${num(i.units)} kWh</td><td>${num(i.average)} kWh</td></tr>`
            )
          )
        : empty(
            'Two readings make a pattern',
            'Interval details appear here after the second reading.'
          )
    )
  );
}
