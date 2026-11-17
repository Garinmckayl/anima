import test from 'node:test';
import assert from 'node:assert/strict';
import { validateDocument, parseDocument, looksLikeAni, checkExpr } from '../src/index.js';
import { crispr, clone } from './helpers.js';

const codes = (doc) => validateDocument(doc).errors.map((e) => e.code);
const find = (doc, code) => validateDocument(doc).errors.find((e) => e.code === code);

test('the converted CRISPR figure is valid, and its evidence gaps surface as warnings, not silence', () => {
  const r = validateDocument(crispr());
  assert.equal(r.valid, true);
  assert.equal(r.errors.filter((e) => e.severity === 'error').length, 0);
  const w = r.errors.map((e) => e.code);
  assert.ok(w.includes('UNSOURCED_ESTABLISHED_CLAIM') && w.includes('DESCRIPTION_WITHOUT_CLAIM'));
});

test('structured errors: dangling references carry a pointer path and a code', () => {
  const d = crispr(); d.biology.relationships.hnh_cleaves_ts.target = 'nonexistent';
  assert.deepEqual(find(d, 'DANGLING_ENTITY_REFERENCE'), { code: 'DANGLING_ENTITY_REFERENCE', path: '/biology/relationships/hnh_cleaves_ts/target', message: "Entity 'nonexistent' does not exist.", severity: 'error' });
});

test('every reference kind is checked', () => {
  const cases = [
    ['DANGLING_CLAIM_REFERENCE', (d) => d.biology.entities.cas9.claimIds = ['nope']],
    ['DANGLING_SOURCE_REFERENCE', (d) => d.evidence.claims.c_structure_basis.sourceIds = ['nope']],
    ['DANGLING_ENTITY_REFERENCE', (d) => d.scenes.overview.nodes.hnh_domain.entityId = 'nope'],
    ['DANGLING_GRADIENT_REFERENCE', (d) => d.scenes.overview.nodes.rec_lobe.shapes[0].fill = { gradient: 'nope' }],
    ['DANGLING_NODE_REFERENCE', (d) => d.behavior.bindings.hnh_rotate.target.node = 'nope'],
    ['DANGLING_SCENE_REFERENCE', (d) => d.behavior.bindings.hnh_rotate.target.scene = 'nope'],
    ['DANGLING_SHAPE_REFERENCE', (d) => d.behavior.bindings.spacer_opacity.target.shape = 'nope'],
    ['DANGLING_VARIABLE_REFERENCE', (d) => d.behavior.derived.is_match.expression.args[0].id = 'nope'],
    ['REVIEW_TARGET_MISSING', (d) => d.provenance.reviews.r1 = { aspect: 'source-support', claimId: 'nope', scopeHash: 'sha256:' + '0'.repeat(64), reviewer: { name: 'x' }, date: '2026-01-01', verdict: 'supported' }],
    ['DANGLING_READOUT_REFERENCE', (d) => d.presentation.plate.summaryReadoutId = 'nope'],
  ];
  for (const [code, mutate] of cases) { const d = crispr(); mutate(d); assert.ok(codes(d).includes(code), code); }
});

test('behavior type safety', () => {
  let d = crispr(); d.behavior.bindings.hnh_rotate.property = 'visible';
  assert.ok(codes(d).includes('BINDING_TYPE_MISMATCH'), 'number into boolean property');
  d = crispr(); d.behavior.bindings.hud_text.property = 'opacity';
  assert.ok(codes(d).includes('BINDING_TYPE_MISMATCH'), 'text into number property');
  d = crispr(); d.behavior.bindings.hud_text.target.shape = 'ts_flash'; d.behavior.bindings.hud_text.target.node = 'heteroduplex';
  assert.ok(codes(d).includes('BINDING_PROPERTY_INVALID'), 'text on a circle');
  d = crispr(); d.behavior.bindings.hnh_rotate.target.shape = 'x';
  assert.ok(codes(d).includes('BINDING_PROPERTY_INVALID') || codes(d).includes('DANGLING_SHAPE_REFERENCE'));
  d = crispr(); d.behavior.bindings.products_opacity.expression = { op: 'index' };
  assert.ok(codes(d).includes('INDEX_OUTSIDE_TARGETS'));
  d = crispr(); d.behavior.derived.pairing.expression = { op: 'add', args: [1, 'x'] };
  assert.ok(codes(d).includes('TYPE_MISMATCH'));
  d = crispr(); d.behavior.derived.a = { expression: { op: 'ref', id: 'b' } }; d.behavior.derived.b = { expression: { op: 'ref', id: 'a' } };
  assert.ok(codes(d).includes('DERIVED_CYCLE'));
  d = crispr(); d.behavior.variables.fidelity.initial = 'other';
  assert.ok(codes(d).includes('INITIAL_NOT_IN_OPTIONS'));
  d = crispr(); d.behavior.controls.fidelity_selector.options[0].effects = [{ op: 'setVariable', id: 'fidelity', value: 'zzz' }];
  assert.ok(codes(d).includes('EFFECT_VALUE_INVALID'));
});

test('expression limits', () => {
  let e = 1; for (let i = 0; i < 30; i++) e = { op: 'neg', args: [e] };
  const errs = []; checkExpr(e, '', { refType: () => undefined }, errs);
  assert.equal(errs[0].code, 'EXPRESSION_TOO_DEEP');
  const wide = { op: 'add', args: Array.from({ length: 16 }, () => ({ op: 'add', args: Array.from({ length: 16 }, () => 1) })) };
  const errs2 = []; checkExpr({ op: 'add', args: [wide, wide] }, '', { refType: () => undefined }, errs2);
  assert.equal(errs2[0].code, 'EXPRESSION_TOO_LARGE');
});

test('capabilities: unsupported are refused, unused-but-used are flagged', () => {
  let d = crispr(); d.requirements.capabilities.push('simulation.ode');
  assert.ok(codes(d).includes('UNSUPPORTED_CAPABILITY'));
  d = crispr(); d.requirements.capabilities = d.requirements.capabilities.filter((c) => c !== 'behavior.clock');
  assert.ok(codes(d).includes('CAPABILITY_NOT_DECLARED'));
  d = crispr(); d.formatVersion = '0.2.0';
  assert.ok(codes(d).includes('UNSUPPORTED_FORMAT_VERSION'));
});

test('structure: ID grammar, unknown keys and wrong format are rejected', () => {
  let d = crispr(); d.biology.entities['Bad-ID'] = d.biology.entities.cas9;
  assert.ok(codes(d).some((c) => c.startsWith('SCHEMA_')));
  d = crispr(); d.surprise = 1;
  assert.ok(codes(d).includes('SCHEMA_ADDITIONALPROPERTIES'));
  d = crispr(); d.format = 'cursor';
  assert.deepEqual(codes(d), ['WRONG_FORMAT']);
});

test('security: SVG-injection vectors cannot be expressed', () => {
  let d = crispr(); d.scenes.overview.nodes.rec_lobe.shapes[0].d = 'M 0 0 "/><script>alert(1)</script>';
  assert.ok(codes(d).some((c) => c.startsWith('SCHEMA_')), 'path data is whitelisted');
  d = crispr(); d.scenes.overview.nodes.rec_lobe.shapes[0].fill = 'url(javascript:alert(1))';
  assert.ok(codes(d).some((c) => c.startsWith('SCHEMA_')), 'colors are whitelisted');
  d = crispr(); d.evidence.sources.anders2014.url = 'javascript:alert(1)';
  assert.ok(codes(d).some((c) => c.startsWith('SCHEMA_')), 'only https URLs');
});

test('extension data is allowed where declared and preserved', () => {
  const d = crispr(); d.extensions = { 'vendor.thing': { anything: [1, 2] } }; d.biology.entities.cas9.extensions = { 'vendor.note': 'x' };
  assert.equal(validateDocument(d).valid, true);
  d.extensions = { badkey: 1 };
  assert.ok(codes(d).some((c) => c.startsWith('SCHEMA_')));
});

test('parseDocument and looksLikeAni', () => {
  assert.equal(parseDocument('{nope').errors[0].code, 'INVALID_JSON');
  assert.equal(parseDocument('x'.repeat(9 * 1024 * 1024)).errors[0].code, 'DOCUMENT_TOO_LARGE');
  assert.equal(looksLikeAni('{ "format": "ani", "formatVersion": "0.1.0" }'), true);
  assert.equal(looksLikeAni('RIFF....ACONanih'), false);
});
