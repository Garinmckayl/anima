import assert from "node:assert/strict";
import { blobOf, blobSvg, membraneOf, membraneSvg } from "./blob.mjs";
import { branchPieces, branchSvg } from "./branch.mjs";
import { helixOf, helixSvg, moleculeOf, moleculeSvg, ribbonOf, ribbonSvg } from "./chem.mjs";
import { bioAudit } from "./bio-audit.mjs";

const projection = { origin: [120, 100], scale: 2, azimuth: 45, elevation: 30 };
const ring = [
  [-4, -3, 0],
  [3, -4, 0],
  [5, 1, 0],
  [1, 5, 0],
  [-4, 2, 0],
];
const blob = blobOf(ring, projection, { id: "cell", tone: "hi" });
assert.equal(blob.kind, "blob");
assert.match(blobSvg(blob), /bio-blob-highlight/);
assert.match(membraneSvg(membraneOf(ring, ring.map(([x, y, z]) => [x * 0.8, y * 0.8, z]), projection)), /fill-rule="evenodd"/);

const branches = branchPieces([[0, 0, 0], [8, 1, 2], [15, 5, 3], [24, 8, 1]], (t) => 1.5 - t, projection, { maxLength: 6 });
assert.ok(branches.length > 1);
assert.ok(branches.every((piece) => Number.isFinite(piece.depth)));
assert.match(branchSvg(branches[0]), /tb-body/);

const molecule = moleculeOf(
  [
    { element: "C", position: [0, 0, 0] },
    { element: "O", position: [2, 0, 0] },
    { element: "H", position: [3, 1, 0] },
  ],
  [[0, 1], [1, 2]],
);
assert.match(moleculeSvg(molecule, projection), /data-element="O"/);
assert.throws(() => moleculeOf([{ position: [0, 0, 0] }], [[0, 1]]), RangeError);
const helix = helixOf({ center: [0, 0, 0], radius: 1.4, turns: 1.5 }, projection);
assert.equal(helix.paths.length, 2);
assert.match(helixSvg(helix), /bio-helix-rung/);
assert.match(ribbonSvg(ribbonOf([[0, 0, 0], [3, 0, 1], [6, 2, 1]], projection)), /bio-ribbon/);

const validAudit = bioAudit({
  membranes: [{ id: "cell", boundary: ring }, { id: "nucleus", boundary: ring.map(([x, y, z]) => [x * 0.6, y * 0.6, z]) }],
  parts: ["cell", "nucleus"],
  labels: [{ text: "Nucleus", partId: "nucleus" }],
  unitsPerMicron: 2,
  measurements: [{ name: "known diameter", worldUnits: 8, microns: 4 }],
});
assert.equal(validAudit.ok, true);
const invalidAudit = bioAudit({
  membranes: [
    { id: "one", boundary: [[-2, 0, 0], [2, 0, 0], [2, 2, 0], [-2, 2, 0]] },
    { id: "two", boundary: [[0, -1, 0], [1, -1, 0], [1, 1, 0], [0, 1, 0]] },
  ],
  parts: [],
  labels: [{ text: "Missing", partId: "ghost" }],
  unitsPerMicron: 1,
  measurements: [{ name: "wrong scale", worldUnits: 10, microns: 2 }],
});
assert.equal(invalidAudit.ok, false);
assert.ok(invalidAudit.errors.some((error) => error.includes("intersect")));
assert.ok(invalidAudit.errors.some((error) => error.includes("missing part")));
assert.ok(invalidAudit.errors.some((error) => error.includes("unitsPerMicron")));

console.log("biology kit smoke checks passed");
