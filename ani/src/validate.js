import Ajv2020 from 'ajv/dist/2020.js';
import schema from '../schema/ani-0.1.schema.json' with { type: 'json' };
import { checkExpr } from './expr.js';

export const FORMAT_VERSION = '0.1.0';
export const MAX_DOCUMENT_BYTES = 8 * 1024 * 1024;
export const SUPPORTED_CAPABILITIES = [
  'scene.svg', 'behavior.clock', 'behavior.boolean', 'behavior.enum', 'behavior.number',
  'behavior.expressions', 'presentation.readouts',
];

const ajv = new Ajv2020({ allErrors: true, discriminator: true, strict: true, allowUnionTypes: true });
const validateSchema = ajv.compile(schema);

const pointer = (...parts) => '/' + parts.map((p) => String(p).replace(/~/g, '~0').replace(/\//g, '~1')).join('/');
const VAR_TYPE = { boolean: 'boolean', enum: 'string', number: 'number' };
const PROP_TYPE = { visible: 'boolean', text: 'string' };
const ATTRS = {
  line: ['x1', 'y1', 'x2', 'y2'], circle: ['cx', 'cy', 'r'], ellipse: ['cx', 'cy'],
};

export function parseDocument(text) {
  if (typeof text !== 'string') return { errors: [{ code: 'NOT_TEXT', path: '', message: 'Document must be UTF-8 text.', severity: 'error' }] };
  if (text.length > MAX_DOCUMENT_BYTES) return { errors: [{ code: 'DOCUMENT_TOO_LARGE', path: '', message: `Document exceeds ${MAX_DOCUMENT_BYTES} bytes.`, severity: 'error' }] };
  try { return { document: JSON.parse(text), errors: [] }; }
  catch (e) { return { errors: [{ code: 'INVALID_JSON', path: '', message: e.message, severity: 'error' }] }; }
}

export function looksLikeAni(text) {
  const head = text.slice(0, 2048);
  return /^\s*\{/.test(head) && /"format"\s*:\s*"ani"/.test(head);
}

export function validateDocument(doc) {
  const errors = [];
  const add = (code, path, message, severity = 'error') => errors.push({ code, path, message, severity });

  if (typeof doc !== 'object' || doc === null || Array.isArray(doc)) {
    add('NOT_AN_OBJECT', '', 'Document root must be an object.');
    return { valid: false, errors };
  }
  if (doc.format !== 'ani') {
    add('WRONG_FORMAT', '/format', `Expected format "ani", got ${JSON.stringify(doc.format)}.`);
    return { valid: false, errors };
  }
  if (typeof doc.formatVersion === 'string') {
    const [maj, min] = doc.formatVersion.split('.').map(Number);
    if (maj !== 0 || min > 1) add('UNSUPPORTED_FORMAT_VERSION', '/formatVersion', `This engine reads 0.1.x; document is ${doc.formatVersion}.`);
  }

  if (!validateSchema(doc)) {
    const seen = new Set();
    for (const e of validateSchema.errors) {
      if (e.keyword === 'oneOf' || e.keyword === 'discriminator' && e.params?.error === 'mapping') continue;
      const key = e.instancePath + e.keyword;
      if (seen.has(key) || seen.size >= 50) continue;
      seen.add(key);
      add('SCHEMA_' + e.keyword.toUpperCase(), e.instancePath, `${e.instancePath || 'document'} ${e.message}${e.params?.additionalProperty ? ` ('${e.params.additionalProperty}')` : ''}`);
    }
    if (!errors.length) add('SCHEMA_INVALID', '', 'Document does not match the schema.');
    return { valid: false, errors };
  }

  semantic(doc, add);
  return { valid: !errors.some((e) => e.severity === 'error'), errors };
}

function semantic(doc, add) {
  const ent = doc.biology.entities, rel = doc.biology.relationships ?? {}, comp = doc.biology.compartments ?? {};
  const claims = doc.evidence.claims, sources = doc.evidence.sources;
  const scenes = doc.scenes ?? {}, beh = doc.behavior ?? {}, vars = beh.variables ?? {}, derived = beh.derived ?? {};
  const has = (m, id) => Object.hasOwn(m, id);

  const need = (map, id, path, code, what) => { if (!has(map, id)) add(code, path, `${what} '${id}' does not exist.`); };
  for (const [id, e] of Object.entries(ent)) {
    if (e.partOf) need(ent, e.partOf, pointer('biology', 'entities', id, 'partOf'), 'DANGLING_ENTITY_REFERENCE', 'Entity');
    if (e.partOf === id) add('SELF_REFERENCE', pointer('biology', 'entities', id, 'partOf'), 'An entity cannot be part of itself.');
    if (e.compartmentId) need(comp, e.compartmentId, pointer('biology', 'entities', id, 'compartmentId'), 'DANGLING_COMPARTMENT_REFERENCE', 'Compartment');
    (e.claimIds ?? []).forEach((c, i) => need(claims, c, pointer('biology', 'entities', id, 'claimIds', i), 'DANGLING_CLAIM_REFERENCE', 'Claim'));
    if (e.description && !(e.claimIds ?? []).length) add('DESCRIPTION_WITHOUT_CLAIM', pointer('biology', 'entities', id), `Entity '${id}' has explanatory text but no claim backing it.`, 'warning');
  }
  for (const [id, r] of Object.entries(rel)) {
    if (!(r.claimIds ?? []).length) add('RELATIONSHIP_WITHOUT_CLAIM', pointer('biology', 'relationships', id), `Relationship '${id}' asserts biology but links no claim.`, 'warning');
    need(ent, r.source, pointer('biology', 'relationships', id, 'source'), 'DANGLING_ENTITY_REFERENCE', 'Entity');
    need(ent, r.target, pointer('biology', 'relationships', id, 'target'), 'DANGLING_ENTITY_REFERENCE', 'Entity');
    (r.claimIds ?? []).forEach((c, i) => need(claims, c, pointer('biology', 'relationships', id, 'claimIds', i), 'DANGLING_CLAIM_REFERENCE', 'Claim'));
  }
  for (const [id, c] of Object.entries(claims)) {
    (c.sourceIds ?? []).forEach((s, i) => need(sources, s, pointer('evidence', 'claims', id, 'sourceIds', i), 'DANGLING_SOURCE_REFERENCE', 'Source'));
    for (const s of Object.keys(c.locators ?? {})) if (!(c.sourceIds ?? []).includes(s)) add('LOCATOR_WITHOUT_SOURCE', pointer('evidence', 'claims', id, 'locators', s), `Locator given for '${s}', which the claim does not cite.`);
    (c.describes ?? []).forEach((d, i) => {
      const map = d.type === 'entity' ? ent : d.type === 'relationship' ? rel : vars;
      need(map, d.id, pointer('evidence', 'claims', id, 'describes', i, 'id'), 'DANGLING_' + d.type.toUpperCase() + '_REFERENCE', d.type[0].toUpperCase() + d.type.slice(1));
    });
    if (c.kind === 'established' && !(c.sourceIds ?? []).length)
      add('UNSOURCED_ESTABLISHED_CLAIM', pointer('evidence', 'claims', id), `Claim '${id}' is marked established but cites no source.`, 'warning');
  }
  for (const [id, r] of Object.entries(doc.provenance?.reviews ?? {}))
    need(claims, r.claimId, pointer('provenance', 'reviews', id, 'claimId'), 'REVIEW_TARGET_MISSING', 'Claim');

  const shapeIndex = {};
  for (const [sid, sc] of Object.entries(scenes)) {
    for (const [nid, n] of Object.entries(sc.nodes)) {
      if (n.entityId) need(ent, n.entityId, pointer('scenes', sid, 'nodes', nid, 'entityId'), 'DANGLING_ENTITY_REFERENCE', 'Entity');
      const ids = {};
      n.shapes.forEach((s, i) => {
        if (s.id === undefined) return;
        if (ids[s.id]) add('DUPLICATE_SHAPE_ID', pointer('scenes', sid, 'nodes', nid, 'shapes', i, 'id'), `Shape id '${s.id}' is used twice in node '${nid}'.`);
        ids[s.id] = s;
      });
      shapeIndex[sid + '/' + nid] = ids;
      n.shapes.forEach((s, i) => {
        for (const k of ['fill', 'stroke']) {
          const p = s[k];
          if (p?.gradient && !has(sc.gradients ?? {}, p.gradient)) add('DANGLING_GRADIENT_REFERENCE', pointer('scenes', sid, 'nodes', nid, 'shapes', i, k), `Gradient '${p.gradient}' is not defined in scene '${sid}'.`);
          if (p?.token && !has(sc.palette ?? {}, p.token)) add('DANGLING_PALETTE_REFERENCE', pointer('scenes', sid, 'nodes', nid, 'shapes', i, k), `Palette token '${p.token}' is not defined in scene '${sid}'.`);
        }
      });
    }
    for (const [eid, e] of Object.entries(sc.edges ?? {})) {
      need(rel, e.relationshipId, pointer('scenes', sid, 'edges', eid, 'relationshipId'), 'DANGLING_RELATIONSHIP_REFERENCE', 'Relationship');
      need(sc.nodes, e.from, pointer('scenes', sid, 'edges', eid, 'from'), 'DANGLING_NODE_REFERENCE', 'Node');
      need(sc.nodes, e.to, pointer('scenes', sid, 'edges', eid, 'to'), 'DANGLING_NODE_REFERENCE', 'Node');
    }
  }
  const pres = doc.presentation ?? {};
  if (pres.defaultScene) need(scenes, pres.defaultScene, '/presentation/defaultScene', 'DANGLING_SCENE_REFERENCE', 'Scene');
  (pres.legend ?? []).forEach((l, i) => (l.entityIds ?? []).forEach((e, j) => need(ent, e, pointer('presentation', 'legend', i, 'entityIds', j), 'DANGLING_ENTITY_REFERENCE', 'Entity')));

  for (const [id, v] of Object.entries(vars)) {
    const p = pointer('behavior', 'variables', id);
    if (v.type === 'enum') {
      if (!v.options) add('ENUM_WITHOUT_OPTIONS', p, `Enum variable '${id}' needs 'options'.`);
      else if (!v.options.includes(v.initial)) add('INITIAL_NOT_IN_OPTIONS', p + '/initial', `Initial value '${v.initial}' is not one of the options.`);
    }
    if (typeof v.initial !== (v.type === 'enum' ? 'string' : v.type)) add('INITIAL_TYPE_MISMATCH', p + '/initial', `Initial value must be ${v.type === 'enum' ? 'a string' : 'a ' + v.type}.`);
    if (v.type === 'number' && v.min !== undefined && v.max !== undefined && v.min > v.max) add('BAD_RANGE', p, 'min exceeds max.');
    if (id in derived) add('DUPLICATE_NAME', pointer('behavior', 'derived', id), `'${id}' is both a variable and a derived value.`);
  }
  const derivedType = {}; const visiting = new Set();
  const refType = (id) => {
    if (has(vars, id)) return VAR_TYPE[vars[id].type];
    if (!has(derived, id)) return undefined;
    if (id in derivedType) return derivedType[id];
    if (visiting.has(id)) { add('DERIVED_CYCLE', pointer('behavior', 'derived', id), `Derived value '${id}' depends on itself.`); return undefined; }
    visiting.add(id);
    derivedType[id] = checkExpr(derived[id].expression, pointer('behavior', 'derived', id, 'expression'), { refType, allowIndex: false }, errorsSink(add)) ?? undefined;
    visiting.delete(id);
    return derivedType[id];
  };
  for (const id of Object.keys(derived)) refType(id);

  for (const [id, c] of Object.entries(beh.controls ?? {})) {
    const p = pointer('behavior', 'controls', id);
    if (['toggle', 'selector', 'slider'].includes(c.kind)) {
      if (!c.variable) add('CONTROL_NEEDS_VARIABLE', p, `Control '${id}' (${c.kind}) needs a 'variable'.`);
      else if (!has(vars, c.variable)) add('DANGLING_VARIABLE_REFERENCE', p + '/variable', `Variable '${c.variable}' does not exist.`);
      else {
        const t = vars[c.variable].type;
        if (c.kind === 'toggle' && t !== 'boolean') add('CONTROL_VARIABLE_TYPE', p, 'A toggle needs a boolean variable.');
        if (c.kind === 'selector' && t !== 'enum') add('CONTROL_VARIABLE_TYPE', p, 'A selector needs an enum variable.');
        if (c.kind === 'slider' && t !== 'number') add('CONTROL_VARIABLE_TYPE', p, 'A slider needs a number variable.');
        if (c.kind === 'selector') (c.options ?? []).forEach((o, i) => { if (!vars[c.variable].options?.includes(o.value)) add('OPTION_NOT_IN_VARIABLE', `${p}/options/${i}/value`, `'${o.value}' is not an option of '${c.variable}'.`); });
      }
    }
    if (c.kind === 'selector' && !c.options?.length) add('SELECTOR_WITHOUT_OPTIONS', p, 'A selector needs options.');
    const effects = [...(c.effects ?? []), ...(c.options ?? []).flatMap((o) => o.effects ?? [])];
    for (const f of effects) {
      if (f.op === 'setVariable') {
        if (!has(vars, f.id ?? '')) add('DANGLING_VARIABLE_REFERENCE', p, `Effect sets unknown variable '${f.id}'.`);
        else if (f.value === undefined || (vars[f.id].type === 'number' ? typeof f.value !== 'number' : vars[f.id].type === 'boolean' ? typeof f.value !== 'boolean' : !vars[f.id].options.includes(f.value)))
          add('EFFECT_VALUE_INVALID', p, `Value ${JSON.stringify(f.value)} is not valid for '${f.id}'.`);
      }
      if (f.op === 'setTime' && typeof f.value !== 'number') add('EFFECT_VALUE_INVALID', p, "'setTime' needs a numeric value.");
    }
    if (['playback', 'restart', 'scrubber'].includes(c.kind) && !beh.clock) add('CONTROL_NEEDS_CLOCK', p, `Control '${id}' (${c.kind}) needs behavior.clock.`);
  }
  const clock = beh.clock;
  if (clock) {
    if (clock.initialTime > clock.duration) add('BAD_CLOCK', '/behavior/clock/initialTime', 'initialTime exceeds duration.');
    if (clock.reducedMotion?.time > clock.duration) add('BAD_CLOCK', '/behavior/clock/reducedMotion/time', 'reducedMotion.time exceeds duration.');
  }

  for (const [id, b] of Object.entries(beh.bindings ?? {})) {
    const p = pointer('behavior', 'bindings', id), t = b.target;
    const node = scenes[t.scene]?.nodes?.[t.node];
    if (!scenes[t.scene]) add('DANGLING_SCENE_REFERENCE', p + '/target/scene', `Scene '${t.scene}' does not exist.`);
    else if (!node) add('DANGLING_NODE_REFERENCE', p + '/target/node', `Node '${t.node}' does not exist in scene '${t.scene}'.`);
    if (t.shape && t.shapes) add('AMBIGUOUS_TARGET', p + '/target', "Use either 'shape' or 'shapes', not both.");
    const shapeIds = t.shapes ?? (t.shape ? [t.shape] : []);
    const index = shapeIndex[t.scene + '/' + t.node] ?? {};
    for (const s of shapeIds) {
      if (node && !has(index, s)) { add('DANGLING_SHAPE_REFERENCE', p + '/target', `Shape '${s}' does not exist in node '${t.node}'.`); continue; }
      const type = index[s]?.type;
      if (b.property === 'text' && type !== 'text') add('BINDING_PROPERTY_INVALID', p + '/property', `'text' can only bind to text shapes ('${s}' is ${type}).`);
      if (b.property.startsWith('attr.') && !ATTRS[type]?.includes(b.property.slice(5))) add('BINDING_PROPERTY_INVALID', p + '/property', `Shape '${s}' (${type}) has no animatable '${b.property.slice(5)}'.`);
      if (/^(translate|rotate)/.test(b.property)) add('BINDING_PROPERTY_INVALID', p + '/property', `'${b.property}' applies to a whole node, not a shape.`);
      if (b.property === 'visible') add('BINDING_PROPERTY_INVALID', p + '/property', "'visible' applies to a whole node; bind 'opacity' on a shape.");
    }
    if (!shapeIds.length && (b.property === 'text' || b.property.startsWith('attr.'))) add('BINDING_PROPERTY_INVALID', p + '/property', `'${b.property}' needs a shape target.`);
    const want = PROP_TYPE[b.property] ?? 'number';
    const got = checkExpr(b.expression, p + '/expression', { refType, allowIndex: !!t.shapes }, errorsSink(add));
    if (got && got !== want) add('BINDING_TYPE_MISMATCH', p + '/expression', `'${b.property}' needs ${want}, expression yields ${got}.`);
  }
  for (const [id, r] of Object.entries(pres.readouts ?? {})) {
    for (const k of ['value', 'description']) {
      if (r[k] === undefined) continue;
      const p = pointer('presentation', 'readouts', id, k);
      const got = checkExpr(r[k], p, { refType, allowIndex: false }, errorsSink(add));
      if (got && got !== 'string') add('READOUT_NOT_TEXT', p, `A readout ${k} must be text, got ${got}.`);
    }
    (r.claimIds ?? []).forEach((c, i) => need(claims, c, pointer('presentation', 'readouts', id, 'claimIds', i), 'DANGLING_CLAIM_REFERENCE', 'Claim'));
  }
  if (pres.plate?.summaryReadoutId) need(pres.readouts ?? {}, pres.plate.summaryReadoutId, '/presentation/plate/summaryReadoutId', 'DANGLING_READOUT_REFERENCE', 'Readout');

  const declared = new Set(doc.requirements.capabilities);
  doc.requirements.capabilities.forEach((c, i) => { if (!SUPPORTED_CAPABILITIES.includes(c)) add('UNSUPPORTED_CAPABILITY', pointer('requirements', 'capabilities', i), `Capability '${c}' is not implemented by this engine; refusing to render an approximation.`); });
  const used = new Set();
  if (Object.keys(scenes).length) used.add('scene.svg');
  if (clock) used.add('behavior.clock');
  for (const v of Object.values(vars)) used.add('behavior.' + v.type);
  if (Object.keys(derived).length || Object.keys(beh.bindings ?? {}).length || Object.keys(pres.readouts ?? {}).length) used.add('behavior.expressions');
  if (Object.keys(pres.readouts ?? {}).length) used.add('presentation.readouts');
  for (const c of used) if (!declared.has(c)) add('CAPABILITY_NOT_DECLARED', '/requirements/capabilities', `Document uses '${c}' but does not list it in requirements.capabilities.`);

  let shapeCount = 0; for (const sc of Object.values(scenes)) for (const n of Object.values(sc.nodes)) shapeCount += n.shapes.length;
  if (shapeCount > 20000) add('LIMIT_EXCEEDED', '/scenes', `Document has ${shapeCount} shapes; the limit is 20000.`);
}

const errorsSink = (add) => ({ push: (e) => add(e.code, e.path, e.message) });
