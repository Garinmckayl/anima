import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const point3 = (point) => [point[0] ?? 0, point[1] ?? 0, point[2] ?? 0];
const sub = (a, b) => a.map((value, index) => value - b[index]);
const dot = (a, b) => a.reduce((sum, value, index) => sum + value * b[index], 0);
const distance = (a, b) => Math.hypot(...sub(a, b));

function segmentDistance(a0, a1, b0, b1) {
  const u = sub(a1, a0);
  const v = sub(b1, b0);
  const w = sub(a0, b0);
  const aa = dot(u, u);
  const bb = dot(u, v);
  const cc = dot(v, v);
  const dd = dot(u, w);
  const ee = dot(v, w);
  const denom = aa * cc - bb * bb;
  let s = denom > 1e-12 ? clamp((bb * ee - cc * dd) / denom, 0, 1) : 0;
  let t = cc > 1e-12 ? clamp((bb * s + ee) / cc, 0, 1) : 0;
  s = aa > 1e-12 ? clamp((bb * t - dd) / aa, 0, 1) : 0;
  t = cc > 1e-12 ? clamp((bb * s + ee) / cc, 0, 1) : 0;
  return distance(addAt(a0, u, s), addAt(b0, v, t));
}

function addAt(point, vector, amount) {
  return point.map((value, index) => value + vector[index] * amount);
}

function boundaryOf(membrane) {
  return membrane.boundary ?? membrane.points ?? [];
}

function intersectionsOf(a, b, tolerance, same = false) {
  const hits = [];
  const countA = a.length;
  const countB = b.length;
  for (let i = 0; i < countA; i++) {
    const a0 = point3(a[i]);
    const a1 = point3(a[(i + 1) % countA]);
    for (let j = 0; j < countB; j++) {
      if (same && (i === j || (i + 1) % countA === j || (j + 1) % countA === i)) continue;
      const b0 = point3(b[j]);
      const b1 = point3(b[(j + 1) % countB]);
      if (segmentDistance(a0, a1, b0, b1) <= tolerance) hits.push([i, j]);
    }
  }
  return hits;
}

export function bioAudit({
  membranes = [],
  labels = [],
  parts = [],
  unitsPerMicron,
  measurements = [],
  intersectionTolerance = 1e-6,
  scaleTolerance = 0.05,
} = {}) {
  const errors = [];
  if (!Number.isFinite(unitsPerMicron) || unitsPerMicron <= 0) {
    errors.push("unitsPerMicron must be a finite positive number");
  }
  if (!Number.isFinite(intersectionTolerance) || intersectionTolerance < 0) {
    errors.push("intersectionTolerance must be a finite non-negative number");
  }
  if (!Number.isFinite(scaleTolerance) || scaleTolerance < 0 || scaleTolerance >= 1) {
    errors.push("scaleTolerance must be a finite number greater than or equal to zero and less than one");
  }

  const validMembranes = membranes.filter((membrane) => {
    const points = boundaryOf(membrane);
    if (points.length < 3 || points.some((point) => !Array.isArray(point) || point.length < 2 || !point.every(Number.isFinite))) {
      errors.push(`membrane ${membrane.id ?? "(unnamed)"} needs at least three finite boundary points`);
      return false;
    }
    return true;
  });

  for (let i = 0; i < validMembranes.length; i++) {
    const a = boundaryOf(validMembranes[i]);
    const ownHits = intersectionsOf(a, a, intersectionTolerance, true);
    if (ownHits.length) errors.push(`membrane ${validMembranes[i].id ?? i} self-intersects`);
    for (let j = i + 1; j < validMembranes.length; j++) {
      const b = boundaryOf(validMembranes[j]);
      if (intersectionsOf(a, b, intersectionTolerance).length) {
        errors.push(`membranes ${validMembranes[i].id ?? i} and ${validMembranes[j].id ?? j} intersect`);
      }
    }
  }

  const partIds = new Set(parts.map((part) => (typeof part === "string" ? part : part?.id)).filter(Boolean).map(String));
  for (const label of labels) {
    const target = label.partId ?? label.target;
    if (!target || !partIds.has(String(target))) errors.push(`label ${label.text ?? label.id ?? "(unnamed)"} references missing part ${target ?? "(none)"}`);
  }

  for (const measurement of measurements) {
    if (!Number.isFinite(unitsPerMicron) || unitsPerMicron <= 0) break;
    const { name = "(unnamed)", worldUnits, microns } = measurement;
    if (!Number.isFinite(worldUnits) || worldUnits <= 0 || !Number.isFinite(microns) || microns <= 0) {
      errors.push(`measurement ${name} needs positive finite worldUnits and microns`);
      continue;
    }
    const actual = worldUnits / microns;
    const relativeError = Math.abs(actual - unitsPerMicron) / unitsPerMicron;
    if (relativeError > scaleTolerance) {
      errors.push(`measurement ${name} disagrees with unitsPerMicron by ${(relativeError * 100).toFixed(1)}%`);
    }
  }
  return { ok: errors.length === 0, errors };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const filename = process.argv[2];
  if (!filename) {
    console.error("Usage: node kit/bio-audit.mjs figure-audit.json");
    process.exitCode = 2;
  } else {
    try {
      const input = JSON.parse(await readFile(filename, "utf8"));
      const result = bioAudit(input);
      for (const error of result.errors) console.error(`bio audit: ${error}`);
      if (!result.ok) process.exitCode = 1;
      else console.log("bio audit passed");
    } catch (error) {
      console.error(`bio audit: ${error.message}`);
      process.exitCode = 1;
    }
  }
}
