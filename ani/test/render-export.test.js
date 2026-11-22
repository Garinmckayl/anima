import test from 'node:test';
import assert from 'node:assert/strict';
import { renderSvg, paletteCss, exportHtml, createReview } from '../src/index.js';
import { crispr, clone } from './helpers.js';

test('renderSvg renders crispr in dark and light themes with resolved palette tokens and defs', () => {
  const doc = crispr();
  const dark = renderSvg(doc, { theme: 'dark', time: 0 });
  const light = renderSvg(doc, { theme: 'light', time: 0 });
  assert.ok(dark.startsWith('<svg xmlns="http://www.w3.org/2000/svg"'));
  assert.ok(dark.includes('viewBox="0 0 960 560"'));
  assert.ok(dark.includes('<linearGradient id="grad-rec_grad"'));
  assert.ok(dark.includes('<radialGradient id="grad-protein_halo"'));
  assert.ok(dark.includes('<filter id="ani-glow"'));
  assert.ok(dark.includes('fill="#ebebf5"'));
  assert.ok(dark.includes('stop-color="#06060a"'));
  assert.ok(light.includes('fill="#111827"'));
  assert.ok(light.includes('stop-color="#d1d5db"'));
  assert.ok(!light.includes('fill="#ebebf5"'));
});

test('renderSvg evaluates time, variables, transforms with transformOrigin, and reducedMotion', () => {
  const doc = crispr();
  const docked = renderSvg(doc, { time: 7.5, variables: { fidelity: 'match' } });
  assert.ok(docked.includes('transform="translate(-103 10) rotate(24 438 275)"'));
  assert.ok(docked.includes('>HNH DOCKED</text>'));

  const blocked = renderSvg(doc, { time: 7.5, variables: { fidelity: 'mismatch' } });
  assert.ok(blocked.includes('transform="translate(0 0) rotate(0 438 275)"'));
  assert.ok(blocked.includes('>HNH CHECKPOINT</text>'));

  const reduced = renderSvg(doc, { reducedMotion: true });
  assert.ok(reduced.includes('rotate(') && reduced.includes('438 275'));
});

test('renderSvg treats absent fill and stroke as none and escapes XML characters', () => {
  const doc = clone(crispr());
  doc.scenes.overview.nodes.test_node = {
    z: 999,
    shapes: [
      { type: 'rect', x: 0, y: 0, width: 10, height: 10 },
      { type: 'polyline', points: [[0, 0], [10, 10]], stroke: '#ffffff', strokeWidth: 1 },
      { type: 'text', x: 5, y: 5, text: 'A < B & C > D', fill: '#ffffff', size: 10 },
    ],
  };
  const svg = renderSvg(doc, { time: 0 });
  assert.ok(svg.includes('<rect x="0" y="0" width="10" height="10" fill="none" stroke="none"/>'));
  assert.ok(svg.includes('<polyline points="0,0 10,10" fill="none" stroke="#ffffff" stroke-width="1"/>'));
  assert.ok(svg.includes('>A &lt; B &amp; C &gt; D</text>'));
});

test('renderSvg supports cssTokens mode and paletteCss emits both themes', () => {
  const doc = crispr();
  const svg = renderSvg(doc, { cssTokens: true, dataAttrs: true, time: 0 });
  assert.ok(svg.includes('var(--ani-tok-strong)'));
  assert.ok(svg.includes('data-ani-node="hnh_domain"'));
  assert.ok(svg.includes('data-ani-entity="hnh_domain"'));
  const css = paletteCss(doc.scenes.overview);
  assert.ok(css.includes('--ani-tok-strong:#ebebf5'));
  assert.ok(css.includes('.ani-root[data-theme="light"]'));
  assert.ok(css.includes('--ani-tok-strong:#111827'));
});

test('renderSvg and exportHtml refuse documents with unsupported capabilities', async () => {
  const doc = clone(crispr());
  doc.requirements.capabilities.push('simulation.ode');
  assert.throws(() => renderSvg(doc), /Unsupported capabilities: simulation\.ode/);
  await assert.rejects(() => exportHtml(doc), /Unsupported capabilities: simulation\.ode/);
});

test('exportHtml produces a standalone page with controls, readouts, evidence states, and safe script escaping', async () => {
  const doc = clone(crispr());
  const rev = await createReview(doc, {
    claimId: 'c_structure_basis',
    aspect: 'source-support',
    reviewer: { name: 'Dr. Reviewer' },
    verdict: 'supported',
    date: '2026-11-22',
  });
  doc.provenance.reviews = {
    rev_ok: rev,
    rev_stale: { ...rev, aspect: 'scientific-accuracy', scopeHash: 'sha256:' + '0'.repeat(64) },
  };
  doc.document.description = 'Test </script><script>alert(1)</script>';

  const html = await exportHtml(doc, { theme: 'light' });
  assert.ok(html.startsWith('<!doctype html>'));
  assert.ok(html.includes('<body class="ani-root" data-theme="light">'));
  assert.ok(html.includes('data-ani-ctrl="fidelity_selector"'));
  assert.ok(html.includes('data-ani-ctrl="scrub"'));
  assert.ok(html.includes('data-ani-theme-toggle'));
  assert.ok(html.includes('source-support: supported'));
  assert.ok(html.includes('scientific review stale'));
  assert.ok(html.includes('https://doi.org/10.1126/sciadv.aao0027'));
  assert.ok(html.includes('https://www.rcsb.org/structure/4UN3'));

  const scriptStarts = html.indexOf('<script>');
  const scriptEnds = html.lastIndexOf('</script>');
  const scriptBody = html.slice(scriptStarts + 8, scriptEnds);
  assert.ok(!scriptBody.includes('</script>'));
  assert.ok(scriptBody.includes('\\u003c/script\\u003e'));
  assert.ok(scriptBody.includes("removeAttribute('display')"));
});

test('renderSvg rejects non-finite time values', () => {
  const doc = crispr();
  assert.throws(() => renderSvg(doc, { time: Number.NaN }), TypeError);
  assert.throws(() => renderSvg(doc, { time: Infinity }), TypeError);
});
