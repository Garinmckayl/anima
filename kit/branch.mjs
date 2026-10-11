import { depthOf } from "./iso-kit.mjs";
import { tubePieces, tubeSvg } from "./tube.mjs";

export function branchPieces(points, radius, projection, options = {}) {
  const pieces = tubePieces(points, radius, projection, options).map((piece) => ({
    ...piece,
    depth: depthOf(piece.mid, projection),
    kind: "branch",
  }));
  return pieces.sort((a, b) => a.depth - b.depth);
}

export function branchSvg(piece, options = {}) {
  return `<g class="bio-branch" data-depth="${piece.depth.toFixed(3)}">${tubeSvg(piece, options)}</g>`;
}

export function branchesOf(branches, projection) {
  return branches
    .flatMap(({ points, radius, options = {}, ...meta }) =>
      branchPieces(points, radius, projection, options).map((piece) => ({ ...piece, ...meta })),
    )
    .sort((a, b) => a.depth - b.depth);
}
