import { canonicalize, documentHash } from './canonical.js';
import { validateDocument } from './validate.js';
import { staleReviews } from './review.js';

const BAD_SEGMENTS = new Set(['__proto__', 'constructor', 'prototype']);
const PROTECTED = ['/format', '/document/revision'];

function parsePointer(p) {
  if (typeof p !== 'string' || (p !== '' && !p.startsWith('/'))) throw new Error(`Invalid JSON Pointer '${p}'`);
  const segs = p === '' ? [] : p.slice(1).split('/').map((s) => s.replace(/~1/g, '/').replace(/~0/g, '~'));
  for (const s of segs) if (BAD_SEGMENTS.has(s)) throw new Error(`Forbidden path segment '${s}'`);
  return segs;
}
function walk(doc, segs) {
  let cur = doc;
  for (const s of segs) {
    if (Array.isArray(cur)) { if (!/^(0|[1-9][0-9]*)$/.test(s) || +s >= cur.length) throw new Error(`No array index '${s}'`); cur = cur[+s]; }
    else if (cur && typeof cur === 'object' && Object.hasOwn(cur, s)) cur = cur[s];
    else throw new Error(`Path segment '${s}' does not exist`);
  }
  return cur;
}
const isPrefix = (a, b) => a.length < b.length && a.every((s, i) => s === b[i]);

function getAt(doc, segs) { return walk(doc, segs); }
function addAt(doc, segs, value) {
  if (!segs.length) throw new Error('Replacing the document root is not allowed');
  const parent = walk(doc, segs.slice(0, -1)), key = segs.at(-1);
  if (Array.isArray(parent)) {
    if (key === '-') parent.push(value);
    else if (/^(0|[1-9][0-9]*)$/.test(key) && +key <= parent.length) parent.splice(+key, 0, value);
    else throw new Error(`Bad array index '${key}'`);
  } else if (parent && typeof parent === 'object') parent[key] = value;
  else throw new Error('Parent is not a container');
}
function removeAt(doc, segs) {
  if (!segs.length) throw new Error('Removing the document root is not allowed');
  const parent = walk(doc, segs.slice(0, -1)), key = segs.at(-1);
  walk(doc, segs);
  if (Array.isArray(parent)) parent.splice(+key, 1); else delete parent[key];
}

function applyOp(doc, op) {
  const segs = parsePointer(op.path);
  switch (op.op) {
    case 'add': addAt(doc, segs, structuredClone(op.value)); break;
    case 'remove': removeAt(doc, segs); break;
    case 'replace': walk(doc, segs); removeAt(doc, segs); addAt(doc, segs, structuredClone(op.value)); break;
    case 'move': {
      const from = parsePointer(op.from);
      if (isPrefix(from, segs)) throw new Error("Cannot move a value into itself");
      const v = getAt(doc, from); removeAt(doc, from); addAt(doc, segs, v); break;
    }
    case 'copy': addAt(doc, segs, structuredClone(getAt(doc, parsePointer(op.from)))); break;
    case 'test': if (canonicalize(getAt(doc, segs)) !== canonicalize(op.value)) throw new Error('test failed: value differs'); break;
    default: throw new Error(`Unknown patch op '${op.op}'`);
  }
}

export async function applyPatch(doc, ops, { baseHash } = {}) {
  const fail = (...errors) => ({ ok: false, errors: errors.map((e) => ({ severity: 'error', ...e })) });
  if (!Array.isArray(ops)) return fail({ code: 'PATCH_NOT_ARRAY', path: '', message: 'A patch is an array of operations.' });
  if (ops.length > 1000) return fail({ code: 'PATCH_TOO_LARGE', path: '', message: 'A patch may contain at most 1000 operations.' });
  const current = await documentHash(doc);
  if (!baseHash) return fail({ code: 'BASE_HASH_REQUIRED', path: '', message: 'Name the document hash this patch was made against.', current });
  if (baseHash !== current) return fail({ code: 'BASE_MISMATCH', path: '', message: 'The document changed since this patch was made. Re-inspect and re-propose.', current });

  const draft = structuredClone(doc);
  for (const [i, op] of ops.entries()) {
    for (const prot of PROTECTED) {
      for (const p of [op?.path, op?.from]) if (typeof p === 'string' && (p === prot || prot.startsWith(p + '/') && p !== ''))
        return fail({ code: 'PROTECTED_PATH', path: `/${i}/path`, message: `${prot} is managed by the engine.` });
    }
    try { applyOp(draft, op); }
    catch (e) { return fail({ code: 'PATCH_OP_FAILED', path: `/${i}`, message: e.message }); }
  }
  draft.document.revision = doc.document.revision + 1;

  const { valid, errors } = validateDocument(draft);
  if (!valid) return { ok: false, errors: errors.filter((e) => e.severity === 'error'), warnings: errors.filter((e) => e.severity === 'warning') };
  const before = new Set((await staleReviews(doc)).map((r) => r.reviewId));
  const newlyStaleReviews = (await staleReviews(draft)).filter((r) => !before.has(r.reviewId));
  return { ok: true, document: draft, hash: await documentHash(draft), warnings: errors, newlyStaleReviews };
}
