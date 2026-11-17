import { evalExpr } from './expr.js';

export const MAX_STEP_SECONDS = 0.1;

export function createRuntime(doc, { reducedMotion = false } = {}) {
  const beh = doc.behavior ?? {};
  const clock = beh.clock;
  const vars = Object.fromEntries(Object.entries(beh.variables ?? {}).map(([id, v]) => [id, v.initial]));
  const state = {
    vars,
    time: clock ? (reducedMotion ? clock.reducedMotion?.time ?? clock.initialTime ?? 0 : clock.initialTime ?? 0) : 0,
    playing: clock ? clock.autoplay !== false && !reducedMotion : false,
  };
  const duration = clock?.duration ?? 1;
  const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

  function applyEffect(f) {
    if (f.op === 'setVariable') api.setVariable(f.id, f.value);
    else if (f.op === 'setTime') api.setTime(f.value);
    else if (f.op === 'play') state.playing = !reducedMotion && !!clock;
    else if (f.op === 'pause') state.playing = false;
  }

  const api = {
    state,
    setVariable(id, value) {
      const def = beh.variables?.[id];
      if (!def) throw new Error(`Unknown variable '${id}'`);
      if (def.type === 'number') { if (typeof value !== 'number' || !Number.isFinite(value)) throw new TypeError(`'${id}' needs a number`); value = clamp(value, def.min ?? -Infinity, def.max ?? Infinity); }
      else if (def.type === 'boolean') { if (typeof value !== 'boolean') throw new TypeError(`'${id}' needs a boolean`); }
      else if (!def.options.includes(value)) throw new RangeError(`'${value}' is not an option of '${id}'`);
      state.vars[id] = value;
    },
    setTime(t) { state.time = clamp(t, 0, duration); },
    play() { if (clock) state.playing = true; },
    pause() { state.playing = false; },
    tick(dtSeconds) {
      if (!clock || !state.playing) return;
      const t = state.time + Math.min(Math.max(dtSeconds, 0), MAX_STEP_SECONDS);
      if (clock.loop === false) { state.time = Math.min(t, duration); if (t >= duration) state.playing = false; }
      else state.time = t % duration;
    },
    applyControl(controlId, input) {
      const c = beh.controls?.[controlId];
      if (!c) throw new Error(`Unknown control '${controlId}'`);
      if (c.kind === 'toggle' || c.kind === 'slider') api.setVariable(c.variable, input);
      else if (c.kind === 'selector') {
        const opt = c.options.find((o) => o.value === input);
        if (!opt) throw new RangeError(`'${input}' is not an option of control '${controlId}'`);
        api.setVariable(c.variable, input);
        (opt.effects ?? []).forEach(applyEffect);
      } else if (c.kind === 'playback') state.playing = typeof input === 'boolean' ? input : !state.playing;
      else if (c.kind === 'scrubber') { api.setTime(clamp(input, 0, 1) * duration); state.playing = false; }
      else if (c.kind === 'restart') (c.effects ?? []).forEach(applyEffect);
    },
    resolve() {
      const cache = {};
      const baseEnv = { time: state.time, progress: state.time / duration, index: 0, count: 0 };
      const env = {
        ...baseEnv,
        ref(id) {
          if (id in vars) return state.vars[id];
          if (!(id in cache)) cache[id] = evalExpr(beh.derived[id].expression, env);
          return cache[id];
        },
      };
      const derived = Object.fromEntries(Object.keys(beh.derived ?? {}).map((id) => [id, env.ref(id)]));
      const bindings = [];
      for (const [bindingId, b] of Object.entries(beh.bindings ?? {})) {
        const shapes = b.target.shapes ?? (b.target.shape ? [b.target.shape] : [undefined]);
        shapes.forEach((shape, i) => {
          let value = evalExpr(b.expression, { ...env, index: i, count: shapes.length });
          if (b.property === 'opacity') value = clamp(value, 0, 1);
          bindings.push({ bindingId, scene: b.target.scene, node: b.target.node, ...(shape ? { shape } : {}), property: b.property, value });
        });
      }
      const readouts = Object.fromEntries(Object.entries(doc.presentation?.readouts ?? {}).map(([id, r]) => [
        id, { label: r.label, value: evalExpr(r.value, env), ...(r.description !== undefined ? { description: evalExpr(r.description, env) } : {}) },
      ]));
      return { time: state.time, progress: baseEnv.progress, playing: state.playing, variables: { ...state.vars }, derived, bindings, readouts };
    },
  };
  return api;
}
