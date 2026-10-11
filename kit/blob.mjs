import { depthOf, iso } from "./iso-kit.mjs";

const number = (value) => Number(value.toFixed(1));

function curvePath(points) {
  if (points.length < 3) throw new TypeError("blobOf requires at least three points");
  const flat = points.map((point) => point);
  const [first] = flat;
  const commands = [`M${number(first[0])} ${number(first[1])}`];
  for (let index = 0; index < flat.length; index++) {
    const p0 = flat[(index + flat.length - 1) % flat.length];
    const p1 = flat[index];
    const p2 = flat[(index + 1) % flat.length];
    const p3 = flat[(index + 2) % flat.length];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    commands.push(`C${number(c1[0])} ${number(c1[1])} ${number(c2[0])} ${number(c2[1])} ${number(p2[0])} ${number(p2[1])}`);
  }
  return `${commands.join("")}Z`;
}

function inset(points, factor) {
  const centre = points.reduce((sum, point) => [sum[0] + point[0] / points.length, sum[1] + point[1] / points.length], [0, 0]);
  return points.map(([x, y]) => [centre[0] + (x - centre[0]) * factor, centre[1] + (y - centre[1]) * factor]);
}

export function blobOf(points, projection, { tone = "hi", id = null, highlight = 0.72, shade = 0.88 } = {}) {
  if (!Array.isArray(points) || points.length < 3) throw new TypeError("blobOf requires a closed ring of at least three 3D points");
  const flat = points.map((point) => iso(point, projection));
  const depth = points.reduce((sum, point) => sum + depthOf(point, projection) / points.length, 0);
  return {
    kind: "blob",
    id,
    tone,
    depth,
    points,
    d: curvePath(flat),
    highlight: curvePath(inset(flat, highlight)),
    shade: curvePath(inset(flat, shade)),
  };
}

export function membraneOf(outer, inner, projection, options = {}) {
  const outside = blobOf(outer, projection, { ...options, highlight: 1, shade: 1 });
  const inside = blobOf(inner, projection, { ...options, highlight: 1, shade: 1 });
  return { kind: "membrane", ...outside, inner: inside.d, boundary: outer };
}

export function blobSvg(blob) {
  const id = blob.id ? ` id="${String(blob.id).replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")}"` : "";
  return `<g${id} class="bio-blob" data-tone="${blob.tone}"><path class="bio-blob-base" d="${blob.d}"/><path class="bio-blob-shade" d="${blob.shade}"/><path class="bio-blob-highlight" d="${blob.highlight}"/><path class="iso-line bio-blob-edge" data-tone="${blob.tone}" d="${blob.d}"/></g>`;
}

export function membraneSvg(membrane) {
  return `<g class="bio-membrane" data-tone="${membrane.tone}"><path class="bio-membrane-base" fill-rule="evenodd" d="${membrane.d}${membrane.inner}"/><path class="iso-line" data-tone="${membrane.tone}" d="${membrane.d}${membrane.inner}"/></g>`;
}

export function blobPath(points, projection) {
  return curvePath(points.map((point) => iso(point, projection)));
}

export const BIO_CSS = `
.bio-blob-base,.bio-membrane-base{fill:var(--anatomy-shade-2)}
.bio-blob-shade{fill:var(--anatomy-shade-0);opacity:.58}
.bio-blob-highlight{fill:var(--anatomy-top);opacity:.62}
.bio-blob-edge{fill:none}
.bio-membrane-base{fill-rule:evenodd}
.bio-bond{fill:none;stroke:var(--anatomy-mid);stroke-linecap:round}
.bio-atom circle:first-child{fill:var(--anatomy-paper);stroke:var(--anatomy-hi);stroke-width:.6}
.bio-atom .bio-atom-highlight{fill:var(--anatomy-lit);stroke:none;opacity:.65}
.bio-helix-rung{stroke-width:.65}
.bio-ribbon{fill:var(--anatomy-shade-2);stroke:var(--anatomy-hi);stroke-width:.55;stroke-linejoin:round}
`;
