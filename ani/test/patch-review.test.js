import test from 'node:test';
import assert from 'node:assert/strict';
import { applyPatch, documentHash, canonicalize, createReview, claimScopeHash, staleReviews, evidenceReport, validateDocument } from '../src/index.js';
import { crispr, clone } from './helpers.js';

const patch = async (doc, ops) => applyPatch(doc, ops, { baseHash: await documentHash(doc) });

test('canonical hashing ignores key order and whitespace', async () => {
  assert.equal(canonicalize({ b: 1, a: [2, { d: 1, c: 2 }] }), '{"a":[2,{"c":2,"d":1}],"b":1}');
  const a = crispr(); const b = JSON.parse(JSON.stringify(a, Object.keys(a).sort()));
  assert.equal(await documentHash(a), await documentHash(JSON.parse(JSON.stringify(a))));
  assert.match(await documentHash(a), /^sha256:[0-9a-f]{64}$/);
  void b;
});

test('a patch needs the current base hash', async () => {
  const doc = crispr();
  let r = await applyPatch(doc, [], {}); assert.equal(r.errors[0].code, 'BASE_HASH_REQUIRED');
  r = await applyPatch(doc, [], { baseHash: 'sha256:' + '0'.repeat(64) }); assert.equal(r.errors[0].code, 'BASE_MISMATCH');
  assert.ok(r.errors[0].current);
});

test('patches are atomic: one bad operation changes nothing', async () => {
  const doc = crispr(), before = JSON.stringify(doc);
  const r = await patch(doc, [
    { op: 'replace', path: '/biology/entities/cas9/label', value: 'Renamed' },
    { op: 'replace', path: '/biology/entities/does_not_exist/label', value: 'x' },
  ]);
  assert.equal(r.ok, false); assert.equal(r.errors[0].code, 'PATCH_OP_FAILED'); assert.equal(r.errors[0].path, '/1');
  assert.equal(JSON.stringify(doc), before, 'input never mutated');
});

test('a patch that yields an invalid document is rejected with structured errors', async () => {
  const r = await patch(crispr(), [{ op: 'replace', path: '/biology/relationships/hnh_cleaves_ts/target', value: 'ghost' }]);
  assert.equal(r.ok, false);
  assert.deepEqual(r.errors.map((e) => [e.code, e.path]), [['DANGLING_ENTITY_REFERENCE', '/biology/relationships/hnh_cleaves_ts/target']]);
});

test('successful patch: revision is bumped by the engine and cannot be forged', async () => {
  const doc = crispr();
  const r = await patch(doc, [{ op: 'replace', path: '/biology/entities/cas9/label', value: 'Cas9 complex' }]);
  assert.equal(r.ok, true); assert.equal(r.document.document.revision, 2); assert.equal(r.hash, await documentHash(r.document));
  for (const path of ['/document/revision', '/format']) {
    const f = await patch(doc, [{ op: 'replace', path, value: 99 }]);
    assert.equal(f.errors[0].code, 'PROTECTED_PATH');
  }
  const whole = await patch(doc, [{ op: 'remove', path: '/document' }]);
  assert.equal(whole.ok, false);
});

test('prototype pollution paths are refused', async () => {
  for (const path of ['/__proto__/x', '/biology/constructor/prototype/x']) {
    const r = await patch(crispr(), [{ op: 'add', path, value: 1 }]);
    assert.equal(r.ok, false); assert.equal({}.x, undefined);
  }
});

test('RFC 6902 operations: add, move, copy, test, array indexes', async () => {
  const doc = crispr();
  const r = await patch(doc, [
    { op: 'test', path: '/biology/entities/cas9/kind', value: 'complex' },
    { op: 'add', path: '/provenance/notes/-', value: 'reviewed layout' },
    { op: 'copy', from: '/biology/entities/cas9/label', path: '/provenance/notes/-' },
    { op: 'add', path: '/provenance/notes/0', value: 'first' },
  ]);
  assert.equal(r.ok, true); assert.equal(r.document.provenance.notes[0], 'first');
  assert.equal(r.document.provenance.notes.at(-1), 'SpCas9–sgRNA–DNA complex');
  const bad = await patch(doc, [{ op: 'test', path: '/biology/entities/cas9/kind', value: 'protein' }]);
  assert.equal(bad.ok, false);
});

test('REVIEW STALENESS: moving a drawing does not invalidate a review; changing the biology does', async () => {
  const doc = crispr();
  const review = await createReview(doc, { claimId: 'c_rloop_allostery', aspect: 'scientific-accuracy', reviewer: { name: 'Dr. Example', role: 'structural biologist' }, date: '2026-11-17', verdict: 'supported-with-caveats' });
  const r1 = await patch(doc, [{ op: 'add', path: '/provenance/reviews/rv_allostery', value: review }]);
  assert.equal(r1.ok, true); const reviewed = r1.document;
  assert.deepEqual(await staleReviews(reviewed), []);
  assert.equal((await evidenceReport(reviewed)).c_rloop_allostery.scientificAccuracy.state, 'current');

  const moved = await patch(reviewed, [
    { op: 'replace', path: '/scenes/overview/nodes/hnh_domain/transformOrigin', value: [500, 300] },
    { op: 'replace', path: '/scenes/overview/nodes/hnh_domain/z', value: 999 },
    { op: 'replace', path: '/presentation/plate/title', value: 'A new title' },
    { op: 'replace', path: '/behavior/bindings/hnh_rotate/expression', value: { op: 'mul', args: [30, { op: 'ref', id: 'dock' }] } },
  ]);
  assert.equal(moved.ok, true); assert.deepEqual(moved.newlyStaleReviews, []);

  const addedClaim = await patch(reviewed, [
    { op: 'add', path: '/evidence/claims/c_extra', value: { statement: 'Another statement.', kind: 'illustrative', sourceIds: [] } },
    { op: 'add', path: '/biology/entities/hnh_domain/claimIds/-', value: 'c_extra' },
  ]);
  assert.equal(addedClaim.ok, true); assert.deepEqual(addedClaim.newlyStaleReviews, []);

  const scientific = [
    ['relationship kind', { op: 'replace', path: '/biology/relationships/rloop_activates_hnh/kind', value: 'inhibits' }],
    ['claim text', { op: 'replace', path: '/evidence/claims/c_rloop_allostery/statement', value: 'Edited statement.' }],
    ['source swapped', { op: 'replace', path: '/evidence/claims/c_rloop_allostery/sourceIds', value: ['szczelkun2014'] }],
    ['endpoint entity renamed', { op: 'replace', path: '/biology/entities/hnh_domain/label', value: 'HNH (renamed)' }],
    ['source metadata', { op: 'replace', path: '/evidence/sources/dagdas2017/year', value: 2018 }],
  ];
  for (const [what, op] of scientific) {
    const r = await patch(reviewed, [op]);
    assert.equal(r.ok, true, what);
    assert.deepEqual(r.newlyStaleReviews, [{ reviewId: 'rv_allostery', state: 'stale' }], what);
    assert.equal((await evidenceReport(r.document)).c_rloop_allostery.scientificAccuracy.state, 'stale', what);
  }

  const del = await patch(reviewed, [
    { op: 'remove', path: '/biology/entities/hnh_domain/claimIds' },
    { op: 'remove', path: '/biology/entities/r_loop/claimIds' },
    { op: 'remove', path: '/biology/relationships/rloop_activates_hnh/claimIds' },
    { op: 'remove', path: '/evidence/claims/c_rloop_allostery' },
  ]);
  assert.equal(del.ok, false, 'a review pointing at a missing claim is a hard error');
  assert.ok(del.errors.some((e) => e.code === 'REVIEW_TARGET_MISSING'));
});

test('three evidence states stay distinct', async () => {
  const doc = crispr(), rep = await evidenceReport(doc);
  assert.deepEqual(
    [rep.c_rloop_allostery.cited, rep.c_rloop_allostery.sourceSupport.state, rep.c_rloop_allostery.scientificAccuracy.state], [true, 'none', 'none'],
    'cited, but nobody has checked support or reviewed it');
  assert.equal(rep.c_rec_lobe.cited, false);
  assert.equal(rep.c_mismatch_illustration.kind, 'illustrative');
});

test('claimScopeHash is stable and sensitive', async () => {
  const doc = crispr(), h = await claimScopeHash(doc, 'c_seed_mismatch');
  assert.equal(h, await claimScopeHash(clone(doc), 'c_seed_mismatch'));
  const d2 = clone(doc); d2.evidence.claims.c_seed_mismatch.limitations.push('x');
  assert.notEqual(h, await claimScopeHash(d2, 'c_seed_mismatch'));
  assert.equal(await claimScopeHash(doc, 'nope'), null);
});
