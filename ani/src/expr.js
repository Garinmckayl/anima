export const LIMITS = { depth: 24, nodes: 256 };

const N = 'number', B = 'boolean', S = 'string';
export const OPS = {
  ref: { special: true }, time: { args: [], ret: N }, progress: { args: [], ret: N },
  index: { args: [], ret: N }, count: { args: [], ret: N },
  add: { min: 2, type: N, ret: N }, mul: { min: 2, type: N, ret: N }, min: { min: 2, type: N, ret: N }, max: { min: 2, type: N, ret: N },
  sub: { args: [N, N], ret: N }, div: { args: [N, N], ret: N }, pow: { args: [N, N], ret: N },
  neg: { args: [N], ret: N }, abs: { args: [N], ret: N }, sin: { args: [N], ret: N }, cos: { args: [N], ret: N },
  round: { args: [N], ret: N }, floor: { args: [N], ret: N },
  clamp: { args: [N, N, N], ret: N },
  ease: { args: [N], ret: N },
  lt: { args: [N, N], ret: B }, le: { args: [N, N], ret: B }, gt: { args: [N, N], ret: B }, ge: { args: [N, N], ret: B },
  eq: { same: true, ret: B }, ne: { same: true, ret: B },
  and: { min: 2, type: B, ret: B }, or: { min: 2, type: B, ret: B }, not: { args: [B], ret: B },
  if: { special: true },
  concat: { min: 2, type: S, ret: S }, str: { args: [N], ret: S },
};

const typeOfLiteral = (v) => (typeof v === 'number' ? N : typeof v === 'string' ? S : B);

export function checkExpr(expr, path, ctx, errors) {
  const budget = { nodes: 0 };
  const err = (code, p, message) => { errors.push({ code, path: p, message }); return null; };
  const walk = (e, p, depth) => {
    if (++budget.nodes > LIMITS.nodes) return err('EXPRESSION_TOO_LARGE', p, `Expression exceeds ${LIMITS.nodes} nodes.`);
    if (depth > LIMITS.depth) return err('EXPRESSION_TOO_DEEP', p, `Expression nesting exceeds ${LIMITS.depth}.`);
    if (typeof e !== 'object' || e === null) return typeOfLiteral(e);
    const def = OPS[e.op];
    if (!def) return err('UNKNOWN_OPERATOR', `${p}/op`, `Unknown operator '${e.op}'.`);
    const args = e.args ?? [];
    if (e.op === 'ref') {
      if (args.length) return err('BAD_ARITY', p, "'ref' takes an 'id', not args.");
      const t = ctx.refType(e.id);
      return t ?? err('DANGLING_VARIABLE_REFERENCE', `${p}/id`, `'${e.id}' is not a variable or derived value.`);
    }
    if (e.id !== undefined) return err('BAD_ARITY', `${p}/id`, `'${e.op}' does not take an 'id'.`);
    if ((e.op === 'index' || e.op === 'count') && !ctx.allowIndex)
      return err('INDEX_OUTSIDE_TARGETS', p, `'${e.op}' is only valid in a binding whose target lists 'shapes'.`);
    const types = args.map((a, i) => walk(a, `${p}/args/${i}`, depth + 1));
    if (types.includes(null)) return null;
    if (e.op === 'if') {
      if (args.length !== 3) return err('BAD_ARITY', p, "'if' takes (condition, then, else).");
      if (types[0] !== B) return err('TYPE_MISMATCH', `${p}/args/0`, "'if' condition must be boolean.");
      if (types[1] !== types[2]) return err('TYPE_MISMATCH', p, `'if' branches differ: ${types[1]} vs ${types[2]}.`);
      return types[1];
    }
    if (def.same) {
      if (args.length !== 2) return err('BAD_ARITY', p, `'${e.op}' takes 2 args.`);
      return types[0] === types[1] ? B : err('TYPE_MISMATCH', p, `'${e.op}' compares ${types[0]} with ${types[1]}.`);
    }
    if (def.min !== undefined) {
      if (args.length < def.min) return err('BAD_ARITY', p, `'${e.op}' needs at least ${def.min} args.`);
      const bad = types.findIndex((t) => t !== def.type);
      return bad < 0 ? def.ret : err('TYPE_MISMATCH', `${p}/args/${bad}`, `'${e.op}' expects ${def.type}, got ${types[bad]}.`);
    }
    if (args.length !== def.args.length) return err('BAD_ARITY', p, `'${e.op}' takes ${def.args.length} args, got ${args.length}.`);
    const bad = types.findIndex((t, i) => t !== def.args[i]);
    return bad < 0 ? def.ret : err('TYPE_MISMATCH', `${p}/args/${bad}`, `'${e.op}' expects ${def.args[bad]}, got ${types[bad]}.`);
  };
  return walk(expr, path, 0);
}

export function refsOf(expr, out = new Set()) {
  if (typeof expr === 'object' && expr !== null) {
    if (expr.op === 'ref') out.add(expr.id);
    for (const a of expr.args ?? []) refsOf(a, out);
  }
  return out;
}

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const finite = (x) => (Number.isFinite(x) ? x : 0);

export function evalExpr(e, env) {
  if (typeof e !== 'object' || e === null) return e;
  const a = e.args ?? [];
  const v = (i) => evalExpr(a[i], env);
  switch (e.op) {
    case 'ref': return env.ref(e.id);
    case 'time': return env.time; case 'progress': return env.progress;
    case 'index': return env.index; case 'count': return env.count;
    case 'add': return finite(a.reduce((s, _, i) => s + v(i), 0));
    case 'mul': return finite(a.reduce((s, _, i) => s * v(i), 1));
    case 'min': return Math.min(...a.map((_, i) => v(i)));
    case 'max': return Math.max(...a.map((_, i) => v(i)));
    case 'sub': return finite(v(0) - v(1));
    case 'div': return finite(v(0) / v(1));
    case 'pow': return finite(v(0) ** v(1));
    case 'neg': return -v(0); case 'abs': return Math.abs(v(0));
    case 'sin': return Math.sin(v(0)); case 'cos': return Math.cos(v(0));
    case 'round': return Math.round(v(0)); case 'floor': return Math.floor(v(0));
    case 'clamp': return clamp(v(0), v(1), v(2));
    case 'ease': { const x = clamp(v(0), 0, 1); return x * x * (3 - 2 * x); }
    case 'lt': return v(0) < v(1); case 'le': return v(0) <= v(1);
    case 'gt': return v(0) > v(1); case 'ge': return v(0) >= v(1);
    case 'eq': return v(0) === v(1); case 'ne': return v(0) !== v(1);
    case 'and': return a.every((_, i) => v(i)); case 'or': return a.some((_, i) => v(i));
    case 'not': return !v(0);
    case 'if': return v(0) ? v(1) : v(2);
    case 'concat': return a.map((_, i) => v(i)).join('');
    case 'str': return String(v(0));
    default: throw new Error(`Unknown operator ${e.op}`);
  }
}
