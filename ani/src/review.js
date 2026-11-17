import { hashValue } from './canonical.js';

const strip = ({ claimIds, extensions, ...rest } = {}) => rest;

export function claimScope(doc, claimId) {
  const claim = doc.evidence.claims[claimId];
  if (!claim) return null;
  const entity = (id) => (doc.biology.entities[id] ? strip(doc.biology.entities[id]) : null);
  const described = (claim.describes ?? []).map((d) => {
    if (d.type === 'entity') return { ...d, value: entity(d.id) };
    if (d.type === 'relationship') {
      const r = doc.biology.relationships?.[d.id];
      return { ...d, value: r ? strip(r) : null, endpoints: r ? [entity(r.source), entity(r.target)] : null };
    }
    return { ...d, value: doc.behavior?.variables?.[d.id] ?? null };
  });
  return {
    claim: strip(claim),
    described,
    sources: (claim.sourceIds ?? []).map((id) => ({ id, value: doc.evidence.sources[id] ?? null })),
  };
}

export async function claimScopeHash(doc, claimId) {
  const scope = claimScope(doc, claimId);
  return scope ? hashValue(scope) : null;
}

export async function createReview(doc, { claimId, aspect, reviewer, verdict, date, note }) {
  const scopeHash = await claimScopeHash(doc, claimId);
  if (!scopeHash) throw new Error(`No such claim '${claimId}'`);
  return { aspect, claimId, scopeHash, reviewer, date, verdict, ...(note ? { note } : {}) };
}

export async function reviewStates(doc) {
  const out = {};
  for (const [id, r] of Object.entries(doc.provenance?.reviews ?? {})) {
    const current = await claimScopeHash(doc, r.claimId);
    out[id] = current === null ? 'orphaned' : current === r.scopeHash ? 'current' : 'stale';
  }
  return out;
}

export async function staleReviews(doc) {
  return Object.entries(await reviewStates(doc)).filter(([, s]) => s !== 'current').map(([reviewId, state]) => ({ reviewId, state }));
}

export async function evidenceReport(doc) {
  const states = await reviewStates(doc);
  const reviews = Object.entries(doc.provenance?.reviews ?? {});
  const out = {};
  for (const [claimId, c] of Object.entries(doc.evidence.claims)) {
    const summary = (aspect) => {
      const mine = reviews.filter(([, r]) => r.claimId === claimId && r.aspect === aspect);
      const cur = mine.filter(([id]) => states[id] === 'current').sort((a, b) => b[1].date.localeCompare(a[1].date))[0];
      if (cur) return { state: 'current', verdict: cur[1].verdict, reviewer: cur[1].reviewer.name, date: cur[1].date };
      if (mine.length) return { state: 'stale', lastVerdict: mine.sort((a, b) => b[1].date.localeCompare(a[1].date))[0][1].verdict };
      return { state: 'none' };
    };
    out[claimId] = {
      kind: c.kind,
      cited: (c.sourceIds ?? []).length > 0,
      sourceSupport: summary('source-support'),
      scientificAccuracy: summary('scientific-accuracy'),
      limitations: (c.limitations ?? []).length,
      conflicts: (c.conflicts ?? []).length,
    };
  }
  return out;
}
