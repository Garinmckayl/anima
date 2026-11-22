import { escXml, assertCapabilities, pickScene, paletteCss, renderSvg } from './render.js';
import { createRuntime } from './runtime.js';
import { evidenceReport } from './review.js';

function safeJson(value) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

function renderSourceLinks(src) {
  const links = [];
  if (src.doi) links.push(`<a href="https://doi.org/${src.doi.split('/').map(encodeURIComponent).join('/')}" target="_blank" rel="noopener">DOI:${escXml(src.doi)}</a>`);
  if (src.pmid) links.push(`<a href="https://pubmed.ncbi.nlm.nih.gov/${encodeURIComponent(src.pmid)}/" target="_blank" rel="noopener">PMID:${escXml(src.pmid)}</a>`);
  if (src.pdb) links.push(`<a href="https://www.rcsb.org/structure/${encodeURIComponent(src.pdb)}" target="_blank" rel="noopener">PDB:${escXml(src.pdb)}</a>`);
  if (src.url && src.url.startsWith('https://')) links.push(`<a href="${escXml(src.url)}" target="_blank" rel="noopener">Link</a>`);
  return links.length ? ` <span class="ani-src-links">${links.join(' · ')}</span>` : '';
}

function renderClaimBadges(reportEntry) {
  const pills = [];
  pills.push(`<span class="ani-pill ani-pill-${escXml(reportEntry.kind)}">${escXml(reportEntry.kind)}</span>`);
  if (reportEntry.kind !== 'illustrative') {
    pills.push(reportEntry.cited
      ? '<span class="ani-pill ani-pill-cited">cited</span>'
      : '<span class="ani-pill ani-pill-uncited">uncited</span>');
  }
  if (reportEntry.sourceSupport.state === 'current') {
    pills.push(`<span class="ani-pill ani-pill-reviewed">source-support: ${escXml(reportEntry.sourceSupport.verdict)}</span>`);
  } else if (reportEntry.sourceSupport.state === 'stale') {
    pills.push('<span class="ani-pill ani-pill-stale">source-support review stale</span>');
  }
  if (reportEntry.scientificAccuracy.state === 'current') {
    pills.push(`<span class="ani-pill ani-pill-reviewed">scientific: ${escXml(reportEntry.scientificAccuracy.verdict)}</span>`);
  } else if (reportEntry.scientificAccuracy.state === 'stale') {
    pills.push('<span class="ani-pill ani-pill-stale">scientific review stale</span>');
  }
  return pills.join('');
}

function renderControlsMarkup(doc, theme, themeToggle) {
  const controls = Object.entries(doc.behavior?.controls ?? {});
  const vars = doc.behavior?.variables ?? {};
  const parts = [];
  for (const [id, c] of controls) {
    if (c.kind === 'playback') {
      parts.push(`<button type="button" class="ani-btn" data-ani-ctrl="${escXml(id)}" data-ani-kind="playback" aria-label="${escXml(c.label)}"><span data-ani-play-label>Pause</span></button>`);
    } else if (c.kind === 'restart') {
      parts.push(`<button type="button" class="ani-btn" data-ani-ctrl="${escXml(id)}" data-ani-kind="restart" aria-label="${escXml(c.label)}">↻ ${escXml(c.label)}</button>`);
    } else if (c.kind === 'scrubber') {
      parts.push(`<label class="ani-range-wrap"><span>${escXml(c.label)}</span><input type="range" class="ani-range" data-ani-ctrl="${escXml(id)}" data-ani-kind="scrubber" min="0" max="1000" value="0" aria-label="${escXml(c.label)}"><span class="ani-range-val" data-ani-scrub-pct="${escXml(id)}">0%</span></label>`);
    } else if (c.kind === 'selector') {
      const opts = c.options.map((o) => `<button type="button" class="ani-btn" data-ani-ctrl="${escXml(id)}" data-ani-kind="selector" data-ani-value="${escXml(o.value)}" aria-pressed="false">${escXml(o.label)}</button>`).join('');
      parts.push(`<div class="ani-btn-group" role="group" aria-label="${escXml(c.label)}"><span class="ani-ctrl-label">${escXml(c.label)}</span>${opts}</div>`);
    } else if (c.kind === 'toggle') {
      parts.push(`<button type="button" class="ani-btn" data-ani-ctrl="${escXml(id)}" data-ani-kind="toggle" aria-pressed="false">${escXml(c.label)}</button>`);
    } else if (c.kind === 'slider') {
      const v = vars[c.variable] ?? {};
      const min = v.min ?? 0;
      const max = v.max ?? 1;
      const step = (max - min) / 200 || 0.01;
      parts.push(`<label class="ani-range-wrap"><span>${escXml(c.label)}</span><input type="range" class="ani-range" data-ani-ctrl="${escXml(id)}" data-ani-kind="slider" min="${escXml(min)}" max="${escXml(max)}" step="${escXml(step)}" value="${escXml(v.initial ?? min)}" aria-label="${escXml(c.label)}"><span class="ani-range-val" data-ani-slider-val="${escXml(id)}">${escXml(v.initial ?? min)}</span></label>`);
    }
  }
  if (themeToggle) {
    parts.push(`<button type="button" class="ani-btn ani-theme-btn" data-ani-theme-toggle aria-label="Switch theme">${theme === 'light' ? 'Dark' : 'Light'}</button>`);
  }
  return parts.length ? `<div class="ani-controls">${parts.join('')}</div>` : '';
}

function renderEvidenceMarkup(doc, report) {
  const claims = Object.entries(doc.evidence?.claims ?? {});
  const sources = Object.entries(doc.evidence?.sources ?? {});
  const disclaimer = doc.presentation?.disclaimer;
  if (!claims.length && !sources.length && !disclaimer) return '';

  const claimRows = claims.map(([id, c]) => {
    const badges = renderClaimBadges(report[id]);
    const ctx = c.context ? Object.values(c.context).filter(Boolean).join(' · ') : '';
    const cites = (c.sourceIds ?? []).map((sid) => {
      const loc = c.locators?.[sid];
      return `<a class="ani-cite-ref" href="#ani-src-${escXml(sid)}">[${escXml(sid)}${loc ? `, ${escXml(loc)}` : ''}]</a>`;
    }).join(' ');
    const lims = (c.limitations ?? []).map((l) => `<div class="ani-note-line">Limitation: ${escXml(l)}</div>`).join('');
    const confs = (c.conflicts ?? []).map((l) => `<div class="ani-note-line">Conflict: ${escXml(l)}</div>`).join('');
    return `<li><div class="ani-claim-head">${badges}${cites ? ` <span class="ani-cites">${cites}</span>` : ''}</div><div class="ani-claim-text">${escXml(c.statement)}</div>${ctx ? `<div class="ani-meta-line">${escXml(ctx)}</div>` : ''}${lims}${confs}</li>`;
  }).join('');

  const sourceRows = sources.map(([id, s]) => {
    const authors = (s.authors ?? []).join(', ');
    const pub = [s.container, s.year].filter(Boolean).join(' ');
    const meta = s.metadataStatus ? `<span class="ani-pill ani-pill-meta-${escXml(s.metadataStatus)}">${escXml(s.metadataStatus)}</span>` : '';
    const note = s.note ? `<div class="ani-note-line">${escXml(s.note)}</div>` : '';
    return `<li id="ani-src-${escXml(id)}"><div class="ani-src-head"><strong>${escXml(id)}</strong> ${meta}${renderSourceLinks(s)}</div><div>${escXml(s.title)}${authors ? ` — ${escXml(authors)}` : ''}${pub ? ` (${escXml(pub)})` : ''}</div>${note}</li>`;
  }).join('');

  return `<section class="ani-evidence" aria-label="Evidence and sources">${claims.length ? `<h3>Claims &amp; Evidence Status</h3><ul class="ani-list">${claimRows}</ul>` : ''}${sources.length ? `<h3>Sources</h3><ul class="ani-list">${sourceRows}</ul>` : ''}${disclaimer ? `<p class="ani-disclaimer">${escXml(disclaimer)}</p>` : ''}</section>`;
}

const BASE_CSS = `
.ani-root{--ani-page:#0b0b0f;--ani-card:#121218;--ani-face:#181822;--ani-top:#20202e;--ani-text:#a3a3b2;--ani-strong:#f0f0f8;--ani-muted:#737384;--ani-line:#2a2a3a;--ani-accent:#ffffff;--ani-ok:#4ade80;--ani-ok-b:#15803d;--ani-warn:#fbbf24;--ani-warn-b:#a16207;--ani-info:#60a5fa;--ani-info-b:#2563eb;--ani-mono:ui-monospace,"SF Mono",Menlo,Consolas,monospace}
.ani-root[data-theme="light"]{--ani-page:#f3f4f6;--ani-card:#ffffff;--ani-face:#f9fafb;--ani-top:#eef0f4;--ani-text:#4b5563;--ani-strong:#111827;--ani-muted:#6b7280;--ani-line:#d1d5db;--ani-accent:#111827;--ani-ok:#15803d;--ani-ok-b:#86efac;--ani-warn:#b45309;--ani-warn-b:#fcd34d;--ani-info:#1d4ed8;--ani-info-b:#93c5fd}
*{box-sizing:border-box;margin:0;padding:0}
body.ani-root{background:var(--ani-page);color:var(--ani-text);font:14px/1.55 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;-webkit-font-smoothing:antialiased;padding:24px 16px 48px;display:flex;justify-content:center}
.ani-page{width:100%;max-width:1040px;display:flex;flex-direction:column;gap:20px}
.ani-plate{position:relative;background:var(--ani-card);border:1px solid var(--ani-line);border-radius:4px;padding:42px 20px 20px}
.ani-corners{position:absolute;inset:12px 18px auto 18px;display:flex;justify-content:space-between;gap:12px;pointer-events:none;font:11px/1.2 var(--ani-mono);letter-spacing:.06em}
.ani-corner-fig{color:var(--ani-strong);font-weight:600}
.ani-corner-title{color:var(--ani-muted);text-transform:uppercase;letter-spacing:.1em;text-align:right}
.ani-stage{width:100%;overflow:hidden}
.ani-svg{display:block;width:100%;height:auto;user-select:none}
.ani-entity{cursor:pointer;transition:filter .15s ease}
.ani-entity:hover,.ani-entity:focus{filter:brightness(1.18);outline:none}
.ani-bottom-corners{display:flex;flex-wrap:wrap;justify-content:space-between;gap:8px;margin-top:8px;font:11px/1.3 var(--ani-mono);letter-spacing:.04em}
.ani-corner-hint{color:var(--ani-muted);text-transform:uppercase;font-size:10px}
.ani-corner-readout{color:var(--ani-strong)}
.ani-controls{display:flex;flex-wrap:wrap;align-items:center;gap:10px;margin-top:14px;padding-top:14px;border-top:1px solid var(--ani-line);font:11.5px var(--ani-mono)}
.ani-btn-group{display:inline-flex;flex-wrap:wrap;align-items:center;gap:6px}
.ani-ctrl-label{font-size:10.5px;color:var(--ani-muted);text-transform:uppercase;margin-right:2px}
.ani-btn{background:var(--ani-face);color:var(--ani-strong);border:1px solid var(--ani-line);padding:6px 11px;border-radius:3px;cursor:pointer;font:inherit;font-size:11px;letter-spacing:.03em}
.ani-btn:hover,.ani-btn:focus-visible{border-color:var(--ani-accent);background:var(--ani-top);outline:none}
.ani-btn[data-active="true"]{border-color:var(--ani-accent);background:var(--ani-top);font-weight:600}
.ani-theme-btn{margin-left:auto}
.ani-range-wrap{display:inline-flex;align-items:center;gap:8px;flex:1;min-width:190px;max-width:380px;font-size:10.5px;color:var(--ani-muted);text-transform:uppercase}
.ani-range{flex:1;cursor:pointer}
.ani-range-val{min-width:36px;text-align:right;color:var(--ani-strong)}
.ani-drawer{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;margin-top:14px;padding:14px;background:var(--ani-face);border:1px solid var(--ani-line);border-radius:3px;font-size:12.5px}
.ani-drawer-col h4{font:600 10.5px var(--ani-mono);text-transform:uppercase;letter-spacing:.08em;color:var(--ani-muted);margin-bottom:4px}
.ani-stat{font:600 13px var(--ani-mono);color:var(--ani-strong)}
.ani-drawer-col p{margin-top:4px;font-size:12px;color:var(--ani-text)}
.ani-legend{display:flex;flex-wrap:wrap;gap:14px;margin-top:14px;font:11px var(--ani-mono)}
.ani-legend-item{display:inline-flex;align-items:center;gap:6px}
.ani-swatch{width:11px;height:11px;border-radius:2px;flex-shrink:0}
.ani-evidence{background:var(--ani-card);border:1px solid var(--ani-line);border-radius:4px;padding:18px 20px;font-size:12.5px}
.ani-evidence h3{font:600 11.5px var(--ani-mono);text-transform:uppercase;letter-spacing:.08em;color:var(--ani-strong);margin:0 0 10px}
.ani-evidence h3+ul+h3{margin-top:18px}
.ani-list{list-style:none;display:grid;gap:10px}
.ani-list li{padding-bottom:10px;border-bottom:1px solid var(--ani-line)}
.ani-list li:last-child{border-bottom:none;padding-bottom:0}
.ani-claim-head,.ani-src-head{display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin-bottom:3px}
.ani-claim-text{color:var(--ani-strong)}
.ani-meta-line,.ani-note-line{font-size:11.5px;color:var(--ani-muted);margin-top:2px}
.ani-pill{display:inline-block;font:10px/1.4 var(--ani-mono);padding:1px 6px;border-radius:2px;border:1px solid var(--ani-line);text-transform:uppercase;letter-spacing:.04em}
.ani-pill-established{color:var(--ani-strong)}
.ani-pill-hypothesis{color:var(--ani-warn);border-color:var(--ani-warn-b)}
.ani-pill-illustrative{color:var(--ani-info);border-color:var(--ani-info-b)}
.ani-pill-cited,.ani-pill-reviewed,.ani-pill-meta-verified{color:var(--ani-ok);border-color:var(--ani-ok-b)}
.ani-pill-uncited,.ani-pill-stale,.ani-pill-meta-unchecked{color:var(--ani-warn);border-color:var(--ani-warn-b)}
.ani-cite-ref,.ani-src-links a{font:11px var(--ani-mono);color:var(--ani-strong)}
.ani-disclaimer{margin-top:14px;padding-top:10px;border-top:1px solid var(--ani-line);font-size:11.5px;color:var(--ani-muted);font-style:italic}
@media (max-width:600px){.ani-plate{padding:48px 12px 14px}.ani-corners{flex-direction:column;gap:2px}.ani-corner-title{text-align:left}}
`.trim();

function clientScript(payload) {
  return `(() => {
  'use strict';
  const DATA = ${safeJson(payload)};
  const DOC = DATA.doc;
  const SCENE_ID = DATA.sceneId;
  const MAX_STEP = 0.1;
  const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
  const finite = (x) => (Number.isFinite(x) ? x : 0);

  function evalExpr(e, env) {
    if (typeof e !== 'object' || e === null) return e;
    const a = e.args || [];
    const v = (i) => evalExpr(a[i], env);
    switch (e.op) {
      case 'ref': return env.ref(e.id);
      case 'time': return env.time;
      case 'progress': return env.progress;
      case 'index': return env.index;
      case 'count': return env.count;
      case 'add': return finite(a.reduce((s, _, i) => s + v(i), 0));
      case 'mul': return finite(a.reduce((s, _, i) => s * v(i), 1));
      case 'min': return Math.min(...a.map((_, i) => v(i)));
      case 'max': return Math.max(...a.map((_, i) => v(i)));
      case 'sub': return finite(v(0) - v(1));
      case 'div': return finite(v(0) / v(1));
      case 'pow': return finite(v(0) ** v(1));
      case 'neg': return -v(0);
      case 'abs': return Math.abs(v(0));
      case 'sin': return Math.sin(v(0));
      case 'cos': return Math.cos(v(0));
      case 'round': return Math.round(v(0));
      case 'floor': return Math.floor(v(0));
      case 'clamp': return clamp(v(0), v(1), v(2));
      case 'ease': { const x = clamp(v(0), 0, 1); return x * x * (3 - 2 * x); }
      case 'lt': return v(0) < v(1);
      case 'le': return v(0) <= v(1);
      case 'gt': return v(0) > v(1);
      case 'ge': return v(0) >= v(1);
      case 'eq': return v(0) === v(1);
      case 'ne': return v(0) !== v(1);
      case 'and': return a.every((_, i) => v(i));
      case 'or': return a.some((_, i) => v(i));
      case 'not': return !v(0);
      case 'if': return v(0) ? v(1) : v(2);
      case 'concat': return a.map((_, i) => v(i)).join('');
      case 'str': return String(v(0));
      default: return 0;
    }
  }

  function createRuntime(doc, reducedMotion) {
    const beh = doc.behavior || {};
    const clock = beh.clock;
    const vars = Object.fromEntries(Object.entries(beh.variables || {}).map(([id, v]) => [id, v.initial]));
    const state = {
      vars,
      time: clock ? (reducedMotion ? (clock.reducedMotion && clock.reducedMotion.time !== undefined ? clock.reducedMotion.time : clock.initialTime || 0) : clock.initialTime || 0) : 0,
      playing: clock ? clock.autoplay !== false && !reducedMotion : false,
    };
    const duration = clock ? clock.duration : 1;
    function applyEffect(f) {
      if (f.op === 'setVariable') api.setVariable(f.id, f.value);
      else if (f.op === 'setTime') api.setTime(f.value);
      else if (f.op === 'play') state.playing = !reducedMotion && !!clock;
      else if (f.op === 'pause') state.playing = false;
    }
    const api = {
      state,
      duration,
      setVariable(id, value) {
        const def = beh.variables && beh.variables[id];
        if (!def) return;
        if (def.type === 'number') value = clamp(Number(value), def.min ?? -Infinity, def.max ?? Infinity);
        state.vars[id] = value;
      },
      setTime(t) { state.time = clamp(t, 0, duration); },
      tick(dt) {
        if (!clock || !state.playing) return;
        const t = state.time + Math.min(Math.max(dt, 0), MAX_STEP);
        if (clock.loop === false) { state.time = Math.min(t, duration); if (t >= duration) state.playing = false; }
        else state.time = t % duration;
      },
      applyControl(controlId, input) {
        const c = beh.controls && beh.controls[controlId];
        if (!c) return;
        if (c.kind === 'toggle' || c.kind === 'slider') api.setVariable(c.variable, input);
        else if (c.kind === 'selector') {
          const opt = c.options.find((o) => o.value === input);
          if (!opt) return;
          api.setVariable(c.variable, input);
          (opt.effects || []).forEach(applyEffect);
        } else if (c.kind === 'playback') state.playing = typeof input === 'boolean' ? input : !state.playing;
        else if (c.kind === 'scrubber') { api.setTime(clamp(input, 0, 1) * duration); state.playing = false; }
        else if (c.kind === 'restart') (c.effects || []).forEach(applyEffect);
      },
      resolve() {
        const cache = {};
        const base = { time: state.time, progress: state.time / duration, index: 0, count: 0 };
        const env = {
          ...base,
          ref(id) {
            if (id in vars) return state.vars[id];
            if (!(id in cache)) cache[id] = evalExpr(beh.derived[id].expression, env);
            return cache[id];
          },
        };
        const bindings = [];
        for (const [bindingId, b] of Object.entries(beh.bindings || {})) {
          const shapes = b.target.shapes || (b.target.shape ? [b.target.shape] : [undefined]);
          shapes.forEach((shape, i) => {
            let value = evalExpr(b.expression, { ...env, index: i, count: shapes.length });
            if (b.property === 'opacity') value = clamp(value, 0, 1);
            bindings.push({ bindingId, scene: b.target.scene, node: b.target.node, shape, property: b.property, value });
          });
        }
        const readouts = {};
        for (const [id, r] of Object.entries((doc.presentation && doc.presentation.readouts) || {})) {
          readouts[id] = { label: r.label, value: evalExpr(r.value, env), description: r.description !== undefined ? evalExpr(r.description, env) : undefined };
        }
        return { time: state.time, progress: base.progress, playing: state.playing, variables: { ...state.vars }, bindings, readouts };
      },
    };
    return api;
  }

  const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const rt = createRuntime(DOC, reduced);
  const scene = DOC.scenes[SCENE_ID];
  const nodeEls = new Map();
  const shapeEls = new Map();
  document.querySelectorAll('[data-ani-node]').forEach((el) => {
    const nid = el.getAttribute('data-ani-node');
    nodeEls.set(nid, el);
    el.querySelectorAll('[data-ani-shape]').forEach((s) => {
      shapeEls.set(nid + '\\0' + s.getAttribute('data-ani-shape'), s);
    });
  });

  function render() {
    const res = rt.resolve();
    const nodeState = new Map();
    for (const b of res.bindings) {
      if (b.scene !== SCENE_ID) continue;
      if (b.shape === undefined) {
        let entry = nodeState.get(b.node);
        if (!entry) { entry = {}; nodeState.set(b.node, entry); }
        entry[b.property] = b.value;
      } else {
        const el = shapeEls.get(b.node + '\\0' + b.shape);
        if (!el) continue;
        if (b.property === 'opacity') el.style.opacity = String(b.value);
        else if (b.property === 'text') el.textContent = String(b.value);
        else if (b.property.startsWith('attr.')) el.setAttribute(b.property.slice(5), String(b.value));
      }
    }
    for (const [nid, nb] of nodeState.entries()) {
      const el = nodeEls.get(nid);
      if (!el) continue;
      if (nb.visible !== undefined) {
        el.style.display = nb.visible ? '' : 'none';
        if (nb.visible) el.removeAttribute('display');
      }
      if (nb.opacity !== undefined) el.style.opacity = String(nb.opacity);
      if (nb.translateX !== undefined || nb.translateY !== undefined || nb.rotate !== undefined) {
        const parts = [];
        if (nb.translateX !== undefined || nb.translateY !== undefined) parts.push('translate(' + (nb.translateX || 0) + ' ' + (nb.translateY || 0) + ')');
        if (nb.rotate !== undefined) {
          const o = scene.nodes[nid] && scene.nodes[nid].transformOrigin;
          parts.push(o ? 'rotate(' + nb.rotate + ' ' + o[0] + ' ' + o[1] + ')' : 'rotate(' + nb.rotate + ')');
        }
        el.setAttribute('transform', parts.join(' '));
      }
    }
    for (const [id, r] of Object.entries(res.readouts)) {
      document.querySelectorAll('[data-ani-readout-val="' + id + '"]').forEach((el) => { el.textContent = r.value; });
      if (r.description !== undefined) {
        document.querySelectorAll('[data-ani-readout-desc="' + id + '"]').forEach((el) => { el.textContent = r.description; });
      }
    }
    document.querySelectorAll('[data-ani-kind="playback"]').forEach((btn) => {
      const lbl = btn.querySelector('[data-ani-play-label]');
      if (lbl) lbl.textContent = res.playing ? '❚❚ Pause' : '▶ Play';
      btn.setAttribute('aria-pressed', String(res.playing));
    });
    document.querySelectorAll('[data-ani-kind="scrubber"]').forEach((inp) => {
      inp.value = String(Math.round(res.progress * 1000));
      const pctEl = document.querySelector('[data-ani-scrub-pct="' + inp.getAttribute('data-ani-ctrl') + '"]');
      if (pctEl) pctEl.textContent = Math.round(res.progress * 100) + '%';
    });
    document.querySelectorAll('[data-ani-kind="selector"]').forEach((btn) => {
      const c = DOC.behavior.controls[btn.getAttribute('data-ani-ctrl')];
      const active = res.variables[c.variable] === btn.getAttribute('data-ani-value');
      btn.dataset.active = String(active);
      btn.setAttribute('aria-pressed', String(active));
    });
    document.querySelectorAll('[data-ani-kind="toggle"]').forEach((btn) => {
      const c = DOC.behavior.controls[btn.getAttribute('data-ani-ctrl')];
      const active = Boolean(res.variables[c.variable]);
      btn.dataset.active = String(active);
      btn.setAttribute('aria-pressed', String(active));
    });
    document.querySelectorAll('[data-ani-kind="slider"]').forEach((inp) => {
      const cid = inp.getAttribute('data-ani-ctrl');
      const c = DOC.behavior.controls[cid];
      const val = res.variables[c.variable];
      inp.value = String(val);
      const out = document.querySelector('[data-ani-slider-val="' + cid + '"]');
      if (out) out.textContent = Number(val).toFixed(2).replace(/\\.?0+$/, '');
    });
  }

  document.querySelectorAll('[data-ani-ctrl]').forEach((el) => {
    const cid = el.getAttribute('data-ani-ctrl');
    const kind = el.getAttribute('data-ani-kind');
    if (kind === 'playback' || kind === 'restart') {
      el.addEventListener('click', () => { rt.applyControl(cid); render(); });
    } else if (kind === 'selector') {
      el.addEventListener('click', () => { rt.applyControl(cid, el.getAttribute('data-ani-value')); render(); });
    } else if (kind === 'toggle') {
      el.addEventListener('click', () => {
        const c = DOC.behavior.controls[cid];
        rt.applyControl(cid, !rt.state.vars[c.variable]);
        render();
      });
    } else if (kind === 'scrubber') {
      el.addEventListener('input', () => { rt.applyControl(cid, Number(el.value) / 1000); render(); });
    } else if (kind === 'slider') {
      el.addEventListener('input', () => { rt.applyControl(cid, Number(el.value)); render(); });
    }
  });

  const themeBtn = document.querySelector('[data-ani-theme-toggle]');
  if (themeBtn) {
    themeBtn.addEventListener('click', () => {
      const light = document.body.getAttribute('data-theme') === 'light';
      if (light) document.body.removeAttribute('data-theme');
      else document.body.setAttribute('data-theme', 'light');
      themeBtn.textContent = light ? 'Light' : 'Dark';
    });
  }

  const titleEl = document.querySelector('[data-ani-inspect-title]');
  const descEl = document.querySelector('[data-ani-inspect-desc]');
  if (titleEl && descEl) {
    const showEntity = (eid) => {
      const e = DOC.biology && DOC.biology.entities && DOC.biology.entities[eid];
      if (!e) return;
      titleEl.textContent = e.label + (e.species ? ' (' + e.species + ')' : '');
      descEl.textContent = e.description || e.kind;
    };
    document.querySelectorAll('[data-ani-entity]').forEach((el) => {
      const eid = el.getAttribute('data-ani-entity');
      el.addEventListener('pointerenter', () => showEntity(eid));
      el.addEventListener('focus', () => showEntity(eid));
      el.addEventListener('click', () => showEntity(eid));
    });
  }

  window.addEventListener('keydown', (e) => {
    if (e.target && ['INPUT', 'TEXTAREA', 'BUTTON', 'SELECT', 'A'].includes(e.target.tagName)) return;
    if (e.code === 'Space') {
      const playCtrl = Object.entries((DOC.behavior && DOC.behavior.controls) || {}).find(([, c]) => c.kind === 'playback');
      if (playCtrl) { e.preventDefault(); rt.applyControl(playCtrl[0]); render(); }
    } else if (e.key && e.key.toLowerCase() === 'r') {
      const restartCtrl = Object.entries((DOC.behavior && DOC.behavior.controls) || {}).find(([, c]) => c.kind === 'restart');
      if (restartCtrl) { rt.applyControl(restartCtrl[0]); render(); }
    }
  });

  let inView = true;
  const plate = document.querySelector('.ani-plate');
  if (window.IntersectionObserver && plate) {
    new IntersectionObserver((entries) => { inView = entries[0].isIntersecting; }, { threshold: 0.05 }).observe(plate);
  }

  let prev = 0;
  function frame(now) {
    if (prev && inView && rt.state.playing) {
      rt.tick((now - prev) / 1000);
      render();
    }
    prev = now;
    requestAnimationFrame(frame);
  }
  render();
  if (DOC.behavior && DOC.behavior.clock) requestAnimationFrame(frame);
})();`;
}

export async function exportHtml(doc, options = {}) {
  assertCapabilities(doc);
  const theme = options.theme === 'light' ? 'light' : 'dark';
  const themeToggle = options.themeToggle !== false;
  const { sceneId, scene } = pickScene(doc, options.scene);
  const rt = createRuntime(doc, { reducedMotion: Boolean(options.reducedMotion) });
  const resolved = rt.resolve();
  const report = await evidenceReport(doc);

  const svg = renderSvg(doc, {
    scene: sceneId,
    theme,
    resolved,
    cssTokens: true,
    dataAttrs: true,
    className: 'ani-svg',
  });

  const pres = doc.presentation ?? {};
  const plate = pres.plate ?? {};
  const figLabel = plate.figureLabel ?? doc.document.id;
  const plateTitle = plate.title ?? doc.document.title;
  const hint = plate.hint ?? '';
  const summaryId = plate.summaryReadoutId;
  const summaryVal = summaryId && resolved.readouts[summaryId] ? resolved.readouts[summaryId].value : '';

  const detailReadouts = Object.entries(resolved.readouts).filter(([id]) => id !== summaryId);
  const hasEntities = Object.values(scene.nodes).some((n) => n.entityId && doc.biology?.entities?.[n.entityId]);
  const drawerCols = detailReadouts.map(([id, r]) => `<div class="ani-drawer-col"><h4>${escXml(r.label)}</h4><div class="ani-stat" data-ani-readout-val="${escXml(id)}">${escXml(r.value)}</div>${r.description !== undefined ? `<p data-ani-readout-desc="${escXml(id)}">${escXml(r.description)}</p>` : ''}</div>`);
  if (hasEntities) {
    drawerCols.push('<div class="ani-drawer-col"><h4>Structure Under Cursor</h4><div class="ani-stat" data-ani-inspect-title>Inspect any structure</div><p data-ani-inspect-desc>Hover, tap, or focus a labelled part to view its biological role.</p></div>');
  }
  const drawerHtml = drawerCols.length ? `<div class="ani-drawer">${drawerCols.join('')}</div>` : '';

  const legend = pres.legend ?? [];
  const legendHtml = legend.length
    ? `<div class="ani-legend">${legend.map((l) => `<div class="ani-legend-item"><span class="ani-swatch" style="background:${escXml(l.color)}"></span><span>${escXml(l.label)}</span></div>`).join('')}</div>`
    : '';

  const controlsHtml = renderControlsMarkup(doc, theme, themeToggle);
  const evidenceHtml = renderEvidenceMarkup(doc, report);
  const css = `${BASE_CSS}\n${paletteCss(scene)}`.trim();
  const bodyTheme = theme === 'light' ? ' data-theme="light"' : '';
  const pageTitle = options.title ?? doc.document.title;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escXml(pageTitle)}</title>
<style>${css}</style>
</head>
<body class="ani-root"${bodyTheme}>
<main class="ani-page">
<section class="ani-plate iso-plate">
<div class="ani-corners"><div class="ani-corner-fig">${escXml(figLabel)}</div><div class="ani-corner-title">${escXml(plateTitle)}</div></div>
<div class="ani-stage">${svg}</div>
<div class="ani-bottom-corners"><div class="ani-corner-hint">${escXml(hint)}</div>${summaryId ? `<div class="ani-corner-readout" data-corner="readout" data-ani-readout-val="${escXml(summaryId)}">${escXml(summaryVal)}</div>` : ''}</div>
${controlsHtml}
${drawerHtml}
${legendHtml}
</section>
${evidenceHtml}
</main>
<script>${clientScript({ doc, sceneId })}</script>
</body>
</html>`;
}
