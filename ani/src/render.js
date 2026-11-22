import { createRuntime } from './runtime.js';
import { SUPPORTED_CAPABILITIES } from './validate.js';

export function escXml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

const pct = (n) => `${Number((n * 100).toFixed(4))}%`;

const attr = (name, value) => (value === undefined || value === null ? '' : ` ${name}="${escXml(value)}"`);

export function assertCapabilities(doc) {
  const caps = doc?.requirements?.capabilities ?? [];
  const missing = caps.filter((c) => !SUPPORTED_CAPABILITIES.includes(c));
  if (missing.length) throw new Error(`Unsupported capabilities: ${missing.join(', ')}`);
}

export function pickScene(doc, sceneId) {
  const scenes = doc?.scenes ?? {};
  const id = sceneId ?? doc?.presentation?.defaultScene ?? Object.keys(scenes)[0];
  if (!id || !Object.hasOwn(scenes, id)) throw new Error(`Scene '${id ?? ''}' does not exist.`);
  return { sceneId: id, scene: scenes[id] };
}

function resolvePaint(paint, palette, theme, idPrefix, cssTokens) {
  if (paint === undefined || paint === null) return 'none';
  if (typeof paint === 'string') return paint;
  if (paint.token) {
    if (cssTokens) return `var(--ani-tok-${paint.token})`;
    return palette?.[paint.token]?.[theme] ?? palette?.[paint.token]?.dark ?? 'none';
  }
  if (paint.gradient) return `url(#${idPrefix}grad-${paint.gradient})`;
  return 'none';
}

function collectBindings(resolved, sceneId) {
  const nodes = new Map();
  const shapes = new Map();
  for (const b of resolved?.bindings ?? []) {
    if (b.scene !== sceneId) continue;
    if (b.shape === undefined) {
      let entry = nodes.get(b.node);
      if (!entry) { entry = {}; nodes.set(b.node, entry); }
      entry[b.property] = b.value;
    } else {
      const key = `${b.node}\0${b.shape}`;
      let entry = shapes.get(key);
      if (!entry) { entry = { attr: {} }; shapes.set(key, entry); }
      if (b.property.startsWith('attr.')) entry.attr[b.property.slice(5)] = b.value;
      else entry[b.property] = b.value;
    }
  }
  return { nodes, shapes };
}

export function formatNodeTransform(node, nb) {
  if (!nb) return undefined;
  const parts = [];
  if (nb.translateX !== undefined || nb.translateY !== undefined) {
    parts.push(`translate(${nb.translateX ?? 0} ${nb.translateY ?? 0})`);
  }
  if (nb.rotate !== undefined) {
    const o = node.transformOrigin;
    parts.push(o ? `rotate(${nb.rotate} ${o[0]} ${o[1]})` : `rotate(${nb.rotate})`);
  }
  return parts.length ? parts.join(' ') : undefined;
}

function renderDefs(scene, theme, idPrefix, cssTokens) {
  const parts = [];
  const palette = scene.palette ?? {};
  for (const [gid, g] of Object.entries(scene.gradients ?? {})) {
    const stops = g.stops.map((st) => {
      const color = resolvePaint(st.color, palette, theme, idPrefix, cssTokens);
      return `<stop${attr('offset', pct(st.offset))}${attr('stop-color', color)}${attr('stop-opacity', st.opacity)}/>`;
    }).join('');
    if (g.kind === 'linear') {
      const from = g.from ?? [0, 0];
      const to = g.to ?? [1, 0];
      parts.push(`<linearGradient${attr('id', `${idPrefix}grad-${gid}`)}${attr('x1', pct(from[0]))}${attr('y1', pct(from[1]))}${attr('x2', pct(to[0]))}${attr('y2', pct(to[1]))}>${stops}</linearGradient>`);
    } else {
      const c = g.center ?? [0.5, 0.5];
      const r = g.radius ?? 0.5;
      parts.push(`<radialGradient${attr('id', `${idPrefix}grad-${gid}`)}${attr('cx', pct(c[0]))}${attr('cy', pct(c[1]))}${attr('r', pct(r))}>${stops}</radialGradient>`);
    }
  }
  const needsGlow = Object.values(scene.nodes).some((n) => n.shapes.some((s) => s.effect === 'glow'));
  if (needsGlow) {
    parts.push(`<filter${attr('id', `${idPrefix}ani-glow`)} x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="3" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`);
  }
  return parts.length ? `<defs>${parts.join('')}</defs>` : '';
}

function renderShape(shape, scene, theme, idPrefix, cssTokens, sb, dataAttrs) {
  const palette = scene.palette ?? {};
  const paint = (p) => resolvePaint(p, palette, theme, idPrefix, cssTokens);
  const a = sb?.attr ?? {};
  const opacity = sb?.opacity !== undefined ? sb.opacity : shape.opacity;
  const shapeAttr = dataAttrs && shape.id ? attr('data-ani-shape', shape.id) : '';
  const common = shapeAttr + attr('opacity', opacity);

  switch (shape.type) {
    case 'path':
      return `<path${common}${attr('d', shape.d)}${attr('fill', paint(shape.fill))}${attr('stroke', paint(shape.stroke))}${attr('stroke-width', shape.strokeWidth)}${attr('stroke-opacity', shape.strokeOpacity)}${attr('stroke-linecap', shape.linecap)}${attr('stroke-dasharray', shape.dash?.join(' '))}${attr('filter', shape.effect === 'glow' ? `url(#${idPrefix}ani-glow)` : undefined)}/>`;
    case 'circle':
      return `<circle${common}${attr('cx', a.cx ?? shape.cx)}${attr('cy', a.cy ?? shape.cy)}${attr('r', a.r ?? shape.r)}${attr('fill', paint(shape.fill))}${attr('stroke', paint(shape.stroke))}${attr('stroke-width', shape.strokeWidth)}/>`;
    case 'ellipse':
      return `<ellipse${common}${attr('cx', a.cx ?? shape.cx)}${attr('cy', a.cy ?? shape.cy)}${attr('rx', shape.rx)}${attr('ry', shape.ry)}${attr('fill', paint(shape.fill))}${attr('stroke', paint(shape.stroke))}${attr('stroke-width', shape.strokeWidth)}/>`;
    case 'line':
      return `<line${common}${attr('x1', a.x1 ?? shape.x1)}${attr('y1', a.y1 ?? shape.y1)}${attr('x2', a.x2 ?? shape.x2)}${attr('y2', a.y2 ?? shape.y2)}${attr('stroke', paint(shape.stroke))}${attr('stroke-width', shape.strokeWidth)}${attr('stroke-opacity', shape.strokeOpacity)}${attr('stroke-linecap', shape.linecap)}${attr('stroke-dasharray', shape.dash?.join(' '))}/>`;
    case 'polyline':
      return `<polyline${common}${attr('points', shape.points.map(([x, y]) => `${x},${y}`).join(' '))} fill="none"${attr('stroke', paint(shape.stroke))}${attr('stroke-width', shape.strokeWidth)}/>`;
    case 'rect':
      return `<rect${common}${attr('x', shape.x)}${attr('y', shape.y)}${attr('width', shape.width)}${attr('height', shape.height)}${attr('rx', shape.rx)}${attr('fill', paint(shape.fill))}${attr('stroke', paint(shape.stroke))}${attr('stroke-width', shape.strokeWidth)}${attr('stroke-dasharray', shape.dash?.join(' '))}/>`;
    case 'text': {
      const content = sb?.text !== undefined ? sb.text : shape.text;
      return `<text${common}${attr('x', shape.x)}${attr('y', shape.y)}${attr('fill', paint(shape.fill))}${attr('font-size', shape.size)}${attr('font-weight', shape.weight)}${attr('text-anchor', shape.anchor)} font-family="ui-monospace, 'SF Mono', Menlo, Consolas, monospace">${escXml(content)}</text>`;
    }
    default:
      throw new Error(`Unsupported shape type '${shape.type}'.`);
  }
}

export function paletteCss(scene) {
  const entries = Object.entries(scene.palette ?? {});
  if (!entries.length) return '';
  const dark = entries.map(([k, v]) => `--ani-tok-${k}:${v.dark}`).join(';');
  const light = entries.map(([k, v]) => `--ani-tok-${k}:${v.light}`).join(';');
  return `.ani-root{${dark}}.ani-root[data-theme="light"]{${light}}`;
}

export function renderSvg(doc, options = {}) {
  assertCapabilities(doc);
  const theme = options.theme === 'light' ? 'light' : 'dark';
  const idPrefix = options.idPrefix ?? '';
  const cssTokens = Boolean(options.cssTokens);
  const dataAttrs = options.dataAttrs ?? false;
  const { sceneId, scene } = pickScene(doc, options.scene);

  let resolved = options.resolved;
  if (!resolved) {
    const rt = createRuntime(doc, { reducedMotion: Boolean(options.reducedMotion) });
    for (const [k, v] of Object.entries(options.variables ?? {})) rt.setVariable(k, v);
    if (options.time !== undefined) {
      if (typeof options.time !== 'number' || !Number.isFinite(options.time)) throw new TypeError(`time must be a finite number, got ${options.time}`);
      rt.setTime(options.time);
    }
    resolved = rt.resolve();
  }

  const { nodes: nodeBindings, shapes: shapeBindings } = collectBindings(resolved, sceneId);
  const ordered = Object.entries(scene.nodes)
    .map(([id, node], order) => ({ id, node, order }))
    .sort((a, b) => a.node.z - b.node.z || a.order - b.order);

  const entities = doc.biology?.entities ?? {};
  const groups = ordered.map(({ id, node }) => {
    const nb = nodeBindings.get(id);
    const opacity = nb?.opacity !== undefined ? nb.opacity : node.opacity;
    const transform = formatNodeTransform(node, nb);
    const display = nb?.visible === false ? 'none' : undefined;
    const entity = node.entityId ? entities[node.entityId] : undefined;
    const cls = entity ? 'ani-node ani-entity' : 'ani-node';
    const extra = dataAttrs
      ? attr('class', cls)
        + attr('data-ani-node', id)
        + attr('data-ani-entity', node.entityId)
        + (entity ? ' tabindex="0"' : '')
      : '';
    const inner = node.shapes
      .map((s) => renderShape(s, scene, theme, idPrefix, cssTokens, s.id ? shapeBindings.get(`${id}\0${s.id}`) : undefined, dataAttrs))
      .join('');
    return `<g${extra}${attr('opacity', opacity)}${attr('transform', transform)}${attr('display', display)}>${inner}</g>`;
  }).join('');

  const [vx, vy, vw, vh] = scene.viewBox;
  const title = doc.document?.title ?? scene.title ?? 'Anima figure';
  const defs = renderDefs(scene, theme, idPrefix, cssTokens);
  const bg = options.background ? `<rect x="${vx}" y="${vy}" width="${vw}" height="${vh}" fill="${escXml(options.background)}"/>` : '';
  const svgClass = options.className ? attr('class', options.className) : '';

  return `<svg xmlns="http://www.w3.org/2000/svg"${svgClass} viewBox="${vx} ${vy} ${vw} ${vh}" width="${vw}" height="${vh}" role="img"${attr('aria-label', title)}>${defs}${bg}${groups}</svg>`;
}
