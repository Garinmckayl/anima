import test from 'node:test';
import assert from 'node:assert/strict';
import { createRuntime } from '../src/index.js';
import { crispr, load } from './helpers.js';

const oracle = load('./fixtures/crispr-oracle.json');
const nums = (s) => [...s.matchAll(/-?\d+(?:\.\d+)?(?:e-?\d+)?/g)].map(Number);
const near = (a, b, msg, tol = 1e-9) => assert.ok(Math.abs(a - b) < tol, `${msg}: ${a} vs ${b}`);
const STYLE_TOL = 1e-6;

test('runtime matches the original figure at every recorded sample', () => {
  assert.equal(oracle.samples.length, 418);
  for (const s of oracle.samples) {
    const rt = createRuntime(crispr());
    rt.applyControl('fidelity_selector', s.fidelity);
    rt.applyControl('scrub', s.scrub / 1000);
    const r = rt.resolve();
    const at = `${s.fidelity}@${s.scrub}`;
    const b = (id, shape) => r.bindings.find((x) => x.bindingId === id && (shape === undefined || x.shape === shape)).value;

    const R = r.readouts;
    assert.equal(R.summary.value, s.texts.summary, at);
    assert.equal(R.rloop.value, s.texts.rloop, at);
    assert.equal(R.rloop.description, s.texts.rloopDesc, at);
    assert.equal(R.hnh.value, s.texts.hnh, at);
    assert.equal(R.hnh.description, s.texts.hnhDesc, at);
    assert.equal(R.cleavage.value, s.texts.cleavage, at);
    assert.equal(R.cleavage.description, s.texts.cleavageDesc, at);
    assert.equal(b('hud_text'), s.texts.hud, at);

    const [tx, ty] = nums(s.transform);
    const [deg] = nums(s.transform.slice(s.transform.indexOf('rotate')));
    near(b('hnh_translate_x'), tx, at + ' tx'); near(b('hnh_translate_y'), ty, at + ' ty'); near(b('hnh_rotate'), deg, at + ' rot');
    near(b('hnh_pulse_opacity'), +s.hnhOpacity, at + ' hnh opacity', STYLE_TOL);
    near(b('spacer_opacity'), +s.spacerOpacity, at + ' spacer', STYLE_TOL);
    near(b('products_opacity'), +s.productsOpacity, at + ' products', STYLE_TOL);
    near(b('ts_flash_opacity'), +s.tsFlash, at + ' ts flash', STYLE_TOL); near(b('nts_flash_opacity'), +s.ntsFlash, at + ' nts flash', STYLE_TOL);
    near(b('hud_line_x1'), +s.line.x1, at + ' x1'); near(b('hud_line_y1'), +s.line.y1, at + ' y1');
  }
});

test('the original never rendered rungs; the converted document does, driven by the same pairing value', () => {
  assert.equal(oracle.samples[0].rungElements, 0, 'original DOM had no rung elements (source defect)');
  for (const s of oracle.samples.filter((x) => x.scrub % 25 === 0)) {
    const rt = createRuntime(crispr());
    rt.applyControl('fidelity_selector', s.fidelity); rt.applyControl('scrub', s.scrub / 1000);
    const rungs = rt.resolve().bindings.filter((x) => x.bindingId === 'rung_opacity');
    assert.equal(rungs.length, 20);
    const lit = rungs.filter((x) => x.value === 1).length;
    const raw = Math.max(0, Math.min(1, (s.scrub / 1000 - 0.08) / 0.48));
    const pairing = s.fidelity === 'match' ? raw : Math.min(0.3, raw);
    const expected = Array.from({ length: 20 }, (_, i) => pairing > i / 20).filter(Boolean).length;
    assert.equal(lit, expected, `${s.fidelity}@${s.scrub}`);
    assert.ok(rungs.every((x) => x.value === 1 || x.value === 0.09));
  }
});

test('control semantics match the original: selector effects, reduced motion, looping, and step cap', () => {
  const doc = crispr();
  let rt = createRuntime(doc);
  assert.equal(rt.state.playing, true); assert.equal(rt.state.time, 0);
  rt.applyControl('fidelity_selector', 'mismatch');
  assert.equal(rt.state.time, 3.6); assert.equal(rt.state.playing, true);
  rt.applyControl('scrub', 0.5); assert.equal(rt.state.playing, false);
  rt.applyControl('fidelity_selector', 'match'); assert.equal(rt.state.time, 0); assert.equal(rt.state.playing, true);

  rt = createRuntime(doc); rt.tick(0.05); near(rt.state.time, 0.05, 'tick');
  rt.tick(5); near(rt.state.time, 0.15, 'a long frame is capped at 0.1 s');
  rt.setTime(8.95); rt.tick(0.1); near(rt.state.time, 0.05, 'loops');

  rt = createRuntime(doc, { reducedMotion: true });
  assert.equal(rt.state.time, 6.5); assert.equal(rt.state.playing, false);
  rt.applyControl('restart'); assert.equal(rt.state.playing, false, 'automatic play never overrides reduced motion');
  rt.applyControl('playback'); assert.equal(rt.state.playing, true, 'an explicit user play still works');
});

test('resolve() is deterministic', () => {
  const a = createRuntime(crispr()), b = createRuntime(crispr());
  a.setTime(5.123); b.setTime(5.123);
  assert.deepEqual(a.resolve(), b.resolve());
});
