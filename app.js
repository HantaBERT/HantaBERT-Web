const API = 'https://hantabert-api.faizath.com';

const EXAMPLE =
  'ATGAAAGACCTTCTGAAGAAATTTGAGAACCTGAGCACCAAGCCGATGGATGACATCAAGAGGCTGATGGAC' +
  'AACATGCAGAAGATCCTGGAGGCCTTCAGCAAGTCAGCAGAGAAGGCAGCCAAGGAGCTCAAGAACAAGCTG' +
  'AAGGAGATGAAGAAGCAGCAGAACACCAAGGAGAAGCTGGAGAAGATGAAGAAGCAGCAGAATACCAAGGAG';

// ── State ─────────────────────────────────────────────────────────

let topN      = 3;
let busy      = false;
let modelUp   = null;   // null = unknown, true/false = known
let pollTimer = null;
let worldTopo = null;   // cached TopoJSON

// ── Helpers ───────────────────────────────────────────────────────

const $  = id => document.getElementById(id);
const pct = v => `${(v * 100).toFixed(1)}%`;

function show(id) { $(id).hidden = false; }
function hide(id) { $(id).hidden = true; }

// ── Model health ──────────────────────────────────────────────────

async function pollHealth() {
  try {
    const r = await fetch(`${API}/health`);
    const d = await r.json();
    onModelStatus(d.model_loaded === true);
  } catch {
    onModelStatus(false);
  }
}

function onModelStatus(up) {
  modelUp = up;
  const pip  = $('status-pip');
  const lbl  = $('status-label');
  const warn = $('model-warn');
  const btn  = $('btn-classify');

  if (up) {
    pip.className   = 'status-pip';
    lbl.textContent = 'Ready';
    warn.hidden     = true;
    if (!busy) btn.disabled = false;
    clearInterval(pollTimer);
    pollTimer = null;
  } else {
    pip.className   = 'status-pip loading';
    lbl.textContent = 'Loading';
    warn.hidden     = false;
    btn.disabled    = true;
    if (!pollTimer) pollTimer = setInterval(pollHealth, 5000);
  }
}

// ── Sequence stats ────────────────────────────────────────────────

function updateCount() {
  const n = $('seq').value.replace(/[^A-Za-z]/g, '').length;
  $('seq-count').textContent = n ? `${n.toLocaleString()} bp` : '0 bp';
}

// ── Error display ─────────────────────────────────────────────────

function showSeqError(msg) {
  const e  = $('seq-error');
  const ta = $('seq');
  e.textContent = msg;
  e.hidden = false;
  ta.classList.add('invalid');
}

function clearSeqError() {
  $('seq-error').hidden = true;
  $('seq').classList.remove('invalid');
}

function showApiError(msg) {
  const e = $('api-error');
  e.textContent = msg;
  e.hidden = false;
}

function clearApiError() { $('api-error').hidden = true; }

// ── Classify ──────────────────────────────────────────────────────

async function classify() {
  if (busy) return;

  clearSeqError();
  clearApiError();
  hide('trunc-warn');

  const seq = $('seq').value.trim();
  if (!seq) { showSeqError('Sequence cannot be empty.'); $('seq').focus(); return; }

  setLoading(true);

  try {
    const res = await fetch(`${API}/predict`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sequence: seq, top_n: topN }),
    });

    if (res.status === 422) { showSeqError('Sequence rejected — check for invalid characters.'); return; }
    if (res.status === 429) { showApiError('Rate limit reached. Please wait ~60 seconds and try again.'); return; }
    if (res.status === 503) { onModelStatus(false); showApiError('Model still loading — try again in a moment.'); return; }
    if (!res.ok)            { showApiError(`Server error (${res.status}). Please try again.`); return; }

    const data = await res.json();

    if (data.truncated) show('trunc-warn');

    renderResults(data);

    const results = $('results');
    results.hidden = false;
    results.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  } catch {
    showApiError('Could not reach the server. Check your connection and try again.');
  } finally {
    setLoading(false);
  }
}

function setLoading(on) {
  busy = on;
  const btn = $('btn-classify');
  btn.disabled            = on || modelUp === false;
  $('btn-label').textContent = on ? 'Analyzing' : 'Classify';
  $('btn-chevron').hidden    = on;
  $('btn-spin').hidden       = !on;
}

// ── FASTA parser ──────────────────────────────────────────────────

function parseFasta(text) {
  return text.split('\n')
    .filter(line => !line.startsWith('>'))
    .join('')
    .replace(/\s/g, '');
}

// ── Stepper ───────────────────────────────────────────────────────

function syncStepper() {
  $('topn-val').textContent  = topN;
  $('topn-minus').disabled   = topN <= 1;
  $('topn-plus').disabled    = topN >= 23;
}

// ── Render results ────────────────────────────────────────────────

function renderResults(data) {
  renderSpecies(data.species, data.sequence_length, data.truncated);
  renderHost(data.host);
  renderGeo(data.geo);
}

// Species

function renderSpecies(species, _seqLen, _truncated) {
  const top = species.top_n[0];

  $('species-name').textContent = top.label;
  $('species-conf').textContent = pct(top.confidence);

  // Animate bar
  const bar = $('species-bar');
  bar.style.width = '0';
  requestAnimationFrame(() => requestAnimationFrame(() => {
    bar.style.width = pct(top.confidence);
  }));

  // Ranked list (only shown when top_n > 1)
  const rankedWrap = $('species-ranked');
  if (species.top_n.length <= 1) {
    rankedWrap.hidden = true;
    return;
  }

  rankedWrap.hidden = false;
  $('species-toggle-text').textContent = `Show all ${species.top_n.length} predictions`;

  const rows = $('species-rows');
  rows.innerHTML = species.top_n.map((item, i) => `
    <div class="ranked-row ${i === 0 ? 'is-top' : ''}">
      <span class="rk-num">${i + 1}.</span>
      <span class="rk-label" title="${item.label}">${item.label}</span>
      <span class="rk-conf">${pct(item.confidence)}</span>
    </div>
  `).join('');

  // Wire toggle (fresh each classify)
  const toggle = $('species-toggle');
  const fresh  = toggle.cloneNode(true);
  toggle.replaceWith(fresh);
  rows.hidden = true;
  fresh.setAttribute('aria-expanded', 'false');
  fresh.addEventListener('click', () => {
    const open = rows.hidden;
    rows.hidden = !open;
    fresh.setAttribute('aria-expanded', String(open));
  });
}

// Host

const HOST_ICONS = {
  Rodent: `<div class="host-icon-mask host-icon-rodent" aria-hidden="true"></div>`,
  Human:  `<div class="host-icon-mask host-icon-human" aria-hidden="true"></div>`,
  Others: `<svg viewBox="0 0 44 44" fill="none" aria-hidden="true">
    <circle cx="22" cy="22" r="19" fill="currentColor" opacity="0.12"/>
    <circle cx="22" cy="22" r="19" stroke="currentColor" stroke-width="2" opacity="0.45"/>
    <text x="22" y="31" text-anchor="middle" font-family="system-ui,sans-serif"
      font-size="24" font-weight="700" fill="currentColor">?</text>
  </svg>`,
};

function renderHost(host) {
  const top     = host.top_n[0].label;
  const confMap = Object.fromEntries(host.top_n.map(d => [d.label, d.confidence]));

  $('host-grid').innerHTML = ['Rodent', 'Human', 'Others'].map(name => {
    const conf    = confMap[name];
    const isPred  = name === top;
    const confStr = conf !== undefined ? pct(conf) : '—';
    return `
      <div class="host-row ${isPred ? 'is-predicted' : ''}">
        <div class="host-icon">${HOST_ICONS[name] || HOST_ICONS.Others}</div>
        <div class="host-info">
          <div class="host-name">${name}</div>
        </div>
        <div class="host-conf-val">${confStr}</div>
      </div>
    `;
  }).join('');
}

// Geography

const ISO_REGION = buildIsoMap();

function buildIsoMap() {
  const m = {};
  const assign = (region, ids) => ids.forEach(id => { m[id] = region; });
  assign('Africa', [
    12,24,72,108,120,132,140,148,174,175,178,180,204,226,231,232,262,266,
    270,288,324,384,404,426,430,434,450,454,466,478,480,504,508,516,562,
    566,624,638,646,678,686,690,694,706,710,716,728,729,732,748,768,788,
    800,818,834,854,894,
  ]);
  assign('Americas', [
    28,32,44,52,68,76,84,124,152,170,188,192,212,214,218,222,238,254,
    304,308,312,320,328,332,340,388,474,484,558,591,600,604,630,659,662,
    670,740,780,796,840,850,858,862,
  ]);
  assign('Asia', [
    4,31,48,50,51,64,96,104,116,144,156,158,268,275,356,360,364,368,
    376,392,398,400,408,410,414,417,418,422,446,458,462,496,512,524,
    586,608,626,634,682,702,704,760,762,764,784,792,795,860,887,
  ]);
  assign('Europe', [
    8,20,40,56,70,100,112,191,196,203,208,233,246,250,276,300,336,
    348,352,372,380,428,438,440,442,470,492,498,499,528,578,616,620,
    642,643,674,688,703,705,724,752,756,804,807,826,831,832,833,
  ]);
  assign('Oceania', [
    36,90,184,242,258,296,316,520,540,554,570,574,580,583,584,585,
    598,612,776,798,848,882,
  ]);
  return m;
}

function renderGeo(geo) {
  const top     = geo.top_n[0];
  const confMap = Object.fromEntries(geo.top_n.map(d => [d.label, d.confidence]));

  $('geo-name').textContent = top.label;
  $('geo-conf').textContent = pct(top.confidence);

  drawMap(confMap, top.label);

  $('geo-list').innerHTML = geo.top_n.map((item, i) => `
    <li class="geo-item ${i === 0 ? 'is-top' : ''}">
      <span class="geo-num">${i + 1}.</span>
      <span class="geo-label">${item.label}</span>
      <span class="geo-pct">${pct(item.confidence)}</span>
    </li>
  `).join('');

  // Wire geo toggle
  const geoRanked = $('geo-ranked');
  const geoList   = $('geo-list');
  if (geo.top_n.length <= 1) { geoRanked.hidden = true; return; }

  geoRanked.hidden = false;
  $('geo-toggle-text').textContent = `Show all ${geo.top_n.length} predictions`;

  const oldToggle = $('geo-toggle');
  const newToggle = oldToggle.cloneNode(true);
  oldToggle.replaceWith(newToggle);
  geoList.hidden = true;
  newToggle.setAttribute('aria-expanded', 'false');
  newToggle.addEventListener('click', () => {
    const open = geoList.hidden;
    geoList.hidden = !open;
    newToggle.setAttribute('aria-expanded', String(open));
  });
}

async function drawMap(confMap, predicted) {
  const svg = $('world-map');
  svg.innerHTML = '';

  const placeholder = makeSvgEl('text', { x: 500, y: 260, 'text-anchor': 'middle' });
  placeholder.textContent = 'Loading map…';
  Object.assign(placeholder.style, { fontFamily: 'JetBrains Mono, monospace', fontSize: '12px', fill: 'var(--text-3)' });
  svg.appendChild(placeholder);

  try {
    if (!worldTopo) {
      const r = await fetch('https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json');
      if (!r.ok) throw new Error('fetch');
      worldTopo = await r.json();
    }

    svg.innerHTML = '';

    const W = 1000, H = 500;
    const proj = d3.geoNaturalEarth1().scale(153).translate([W / 2, H / 2 + 20]);
    const path = d3.geoPath().projection(proj);

    const countries = topojson.feature(worldTopo, worldTopo.objects.countries);
    const borders   = topojson.mesh(worldTopo, worldTopo.objects.countries, (a, b) => a !== b);

    const maxConf = Math.max(...Object.values(confMap).filter(Number.isFinite), 0.001);

    // Ocean sphere
    const ocean = makeSvgEl('path', { d: path({ type: 'Sphere' }) });
    ocean.style.fill = 'var(--ocean)';
    svg.appendChild(ocean);

    // Countries
    for (const feature of countries.features) {
      const region = ISO_REGION[+feature.id];
      const conf   = region ? confMap[region] : undefined;
      const d      = path(feature);
      if (!d) continue;

      const p = makeSvgEl('path', { d });
      if (region === predicted) {
        p.style.fill    = 'var(--green)';
        p.style.opacity = '0.70';
      } else if (conf > 0.005) {
        p.style.fill    = 'var(--green)';
        p.style.opacity = String(0.07 + (conf / maxConf) * 0.25);
      } else {
        p.style.fill    = 'var(--land)';
      }
      svg.appendChild(p);
    }

    // Country borders
    const bdr = makeSvgEl('path', { d: path(borders) });
    Object.assign(bdr.style, { fill: 'none', stroke: 'var(--ocean)', strokeWidth: '0.5' });
    svg.appendChild(bdr);

    // Sphere outline
    const outline = makeSvgEl('path', { d: path({ type: 'Sphere' }) });
    Object.assign(outline.style, { fill: 'none', stroke: 'var(--border)', strokeWidth: '0.8' });
    svg.appendChild(outline);

  } catch {
    svg.innerHTML = '';
    const err = makeSvgEl('text', { x: 500, y: 260, 'text-anchor': 'middle' });
    err.textContent = 'Map unavailable';
    Object.assign(err.style, { fontFamily: 'JetBrains Mono, monospace', fontSize: '12px', fill: 'var(--text-3)' });
    svg.appendChild(err);
  }
}

function makeSvgEl(tag, attrs = {}) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

// ── Init ──────────────────────────────────────────────────────────

function init() {
  pollHealth();
  syncStepper();

  $('btn-classify').addEventListener('click', classify);

  $('seq').addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') classify();
  });

  $('seq').addEventListener('input', () => {
    clearSeqError();
    clearApiError();
    updateCount();
  });

  $('fasta-file').addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      $('seq').value = parseFasta(ev.target.result);
      clearSeqError();
      e.target.value = '';
      updateCount();
    };
    reader.readAsText(file);
  });

  $('topn-minus').addEventListener('click', () => { if (topN > 1)  { topN--; syncStepper(); } });
  $('topn-plus').addEventListener('click',  () => { if (topN < 23) { topN++; syncStepper(); } });

  $('btn-example').addEventListener('click', () => {
    $('seq').value = EXAMPLE;
    clearSeqError();
    clearApiError();
    $('seq').focus();
    updateCount();
  });

  $('theme-toggle').addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('theme', next);
  });

  matchMedia('(prefers-color-scheme: light)').addEventListener('change', e => {
    if (!localStorage.getItem('theme')) {
      document.documentElement.setAttribute('data-theme', e.matches ? 'light' : 'dark');
    }
  });
}

document.addEventListener('DOMContentLoaded', init);
