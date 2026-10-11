import { depthOf, iso, pathOf, cameraOf } from "./iso-kit.mjs";

const add = (a, b) => a.map((value, index) => value + b[index]);
const sub = (a, b) => a.map((value, index) => value - b[index]);
const mul = (a, scale) => a.map((value) => value * scale);
const dot = (a, b) => a.reduce((sum, value, index) => sum + value * b[index], 0);
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (v) => {
  const length = Math.hypot(...v);
  if (!length) throw new TypeError("A molecular axis cannot be zero");
  return mul(v, 1 / length);
};
const esc = (value) => String(value).replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");

export function moleculeOf(atoms, bonds) {
  if (!Array.isArray(atoms) || !Array.isArray(bonds)) throw new TypeError("moleculeOf requires atom and bond arrays");
  for (const [index, atom] of atoms.entries()) {
    if (!Array.isArray(atom.position) || atom.position.length !== 3 || !atom.position.every(Number.isFinite)) {
      throw new TypeError(`Atom ${index} needs a finite 3D position`);
    }
  }
  for (const bond of bonds) {
    if (!Number.isInteger(bond[0]) || !Number.isInteger(bond[1]) || !atoms[bond[0]] || !atoms[bond[1]]) {
      throw new RangeError("Every bond must reference two existing atoms");
    }
  }
  return { atoms, bonds };
}

export function moleculeSvg(molecule, projection, { atomRadius = 3, bondWidth = 1.5 } = {}) {
  const pieces = molecule.bonds.map(([from, to]) => {
    const a = molecule.atoms[from].position;
    const b = molecule.atoms[to].position;
    const middle = mul(add(a, b), 0.5);
    return {
      depth: depthOf(middle, projection),
      svg: `<path class="bio-bond" data-tone="mid" stroke-width="${bondWidth}" d="${pathOf([iso(a, projection), iso(b, projection)])}"/>`,
    };
  });
  molecule.atoms.forEach((atom, index) => {
    const [cx, cy] = iso(atom.position, projection);
    pieces.push({
      depth: depthOf(atom.position, projection),
      svg: `<g class="bio-atom" data-element="${esc(atom.element ?? "C")}" data-atom="${index}"><circle cx="${cx}" cy="${cy}" r="${atom.radius ?? atomRadius}"/><circle class="bio-atom-highlight" cx="${cx - 0.7}" cy="${cy - 0.8}" r="${Math.max(0.5, (atom.radius ?? atomRadius) * 0.22)}"/></g>`,
    });
  });
  return pieces.sort((a, b) => a.depth - b.depth).map((piece) => piece.svg).join("");
}

export function helixOf({ center = [0, 0, 0], axis = [0, 0, 1], radius = 1, turns = 2, rise = 2, strands = 2, stepsPerTurn = 24, phase = 0 } = {}, projection) {
  const direction = unit(axis);
  const reference = Math.abs(direction[2]) < 0.9 ? [0, 0, 1] : [0, 1, 0];
  const u = unit(cross(direction, reference));
  const v = unit(cross(direction, u));
  const steps = Math.max(8, Math.ceil(turns * stepsPerTurn));
  const paths = Array.from({ length: Math.max(1, strands) }, (_, strand) =>
    Array.from({ length: steps + 1 }, (_, index) => {
      const t = index / steps;
      const angle = phase + (t * turns * Math.PI * 2) + (strand * Math.PI * 2) / Math.max(1, strands);
      return add(add(center, mul(direction, (t - 0.5) * turns * rise)), add(mul(u, Math.cos(angle) * radius), mul(v, Math.sin(angle) * radius)));
    }),
  );
  const rungs = [];
  if (strands === 2) {
    const count = Math.max(2, Math.round(turns * 8));
    for (let index = 0; index <= count; index++) {
      const at = Math.round((index / count) * steps);
      rungs.push([paths[0][at], paths[1][at]]);
    }
  }
  return { kind: "helix", paths, rungs, projection };
}

export function helixSvg(helix, projection = helix.projection, { tone = "hi", rungTone = "lo", width = 1.5 } = {}) {
  const components = helix.paths.map((points) => ({
    depth: points.reduce((sum, point) => sum + depthOf(point, projection) / points.length, 0),
    svg: `<path class="bio-helix-strand iso-line" data-tone="${tone}" stroke-width="${width}" d="${pathOf(points.map((point) => iso(point, projection)))}"/>`,
  }));
  for (const rung of helix.rungs) {
    const middle = mul(add(rung[0], rung[1]), 0.5);
    components.push({
      depth: depthOf(middle, projection),
      svg: `<path class="bio-helix-rung iso-line" data-tone="${rungTone}" d="${pathOf(rung.map((point) => iso(point, projection)))}"/>`,
    });
  }
  return components.sort((a, b) => a.depth - b.depth).map((component) => component.svg).join("");
}

export function ribbonOf(points, projection, { width = 4, tone = "hi" } = {}) {
  if (!Array.isArray(points) || points.length < 2) throw new TypeError("ribbonOf requires at least two points");
  const flat = points.map((point) => iso(point, projection));
  const k = cameraOf(projection).k;
  const left = [];
  const right = [];
  for (let index = 0; index < flat.length; index++) {
    const before = flat[Math.max(0, index - 1)];
    const after = flat[Math.min(flat.length - 1, index + 1)];
    const dx = after[0] - before[0];
    const dy = after[1] - before[1];
    const length = Math.hypot(dx, dy) || 1;
    const nx = -dy / length;
    const ny = dx / length;
    left.push([flat[index][0] + nx * width * k / 2, flat[index][1] + ny * width * k / 2]);
    right.push([flat[index][0] - nx * width * k / 2, flat[index][1] - ny * width * k / 2]);
  }
  return {
    kind: "ribbon",
    tone,
    depth: points.reduce((sum, point) => sum + depthOf(point, projection) / points.length, 0),
    d: pathOf([...left, ...right.reverse()], true),
  };
}

export function ribbonSvg(ribbon) {
  return `<path class="bio-ribbon" data-tone="${ribbon.tone}" d="${ribbon.d}"/>`;
}
