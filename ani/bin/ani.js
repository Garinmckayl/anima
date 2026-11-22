#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import {
  parseDocument,
  validateDocument,
  documentHash,
  applyPatch,
  evidenceReport,
  reviewStates,
  renderSvg,
  exportHtml,
} from '../src/index.js';

const USAGE = `Usage:
  ani validate <file.ani> [--json]
  ani hash <file.ani>
  ani report <file.ani> [--json]
  ani patch <file.ani> <patch.json> --base <hash|current> [--out <file.ani> | --in-place] [--json]
  ani render <file.ani> [--scene <id>] [--theme dark|light] [--time <sec>] [--reduced-motion] [--var k=v] [--bg <color>] [--out <file.svg>]
  ani export <file.ani> [--scene <id>] [--theme dark|light] [--no-theme-toggle] [--out <file.html>]
`;

function parseArgs(argv) {
  const positionals = [];
  const flags = { vars: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json' || a === '--in-place' || a === '--reduced-motion' || a === '--no-theme-toggle' || a === '--help' || a === '-h') {
      flags[a.replace(/^--?/, '')] = true;
    } else if (a === '--var') {
      if (i + 1 >= argv.length) throw new Error(`Missing value for '${a}'.`);
      flags.vars.push(argv[++i]);
    } else if (a.startsWith('--')) {
      if (i + 1 >= argv.length) throw new Error(`Missing value for '${a}'.`);
      flags[a.slice(2)] = argv[++i];
    } else {
      positionals.push(a);
    }
  }
  return { positionals, flags };
}

function loadAni(path) {
  const text = readFileSync(path, 'utf8');
  const parsed = parseDocument(text);
  if (parsed.errors.length) {
    for (const e of parsed.errors) console.error(`${e.code}: ${e.message}`);
    process.exit(1);
  }
  return parsed.document;
}

function coerceVar(doc, key, raw) {
  const def = doc.behavior?.variables?.[key];
  if (!def) throw new Error(`Unknown variable '${key}'`);
  if (def.type === 'number') return Number(raw);
  if (def.type === 'boolean') {
    if (raw === 'true') return true;
    if (raw === 'false') return false;
    throw new Error(`Variable '${key}' expects true or false`);
  }
  return raw;
}

function requireValid(doc) {
  const res = validateDocument(doc);
  if (!res.valid) {
    for (const e of res.errors.filter((x) => x.severity === 'error')) {
      console.error(`ERROR ${e.code} ${e.path || '/'}: ${e.message}`);
    }
    process.exit(1);
  }
  return res;
}

function writeOut(content, outPath) {
  if (outPath) writeFileSync(outPath, content, 'utf8');
  else process.stdout.write(content);
}

async function main() {
  const { positionals, flags } = parseArgs(process.argv.slice(2));
  const [cmd, file, second] = positionals;
  if (!cmd || flags.help || flags.h) {
    process.stdout.write(USAGE);
    process.exit(flags.help || flags.h ? 0 : 1);
  }
  if (!file) {
    console.error(`Missing input file for '${cmd}'.\n${USAGE}`);
    process.exit(1);
  }

  if (cmd === 'validate') {
    const doc = loadAni(file);
    const res = validateDocument(doc);
    const hash = res.valid ? await documentHash(doc) : null;
    if (flags.json) {
      console.log(JSON.stringify({ valid: res.valid, hash, errors: res.errors }, null, 2));
    } else {
      const errs = res.errors.filter((e) => e.severity === 'error');
      const warns = res.errors.filter((e) => e.severity !== 'error');
      for (const e of errs) console.error(`ERROR ${e.code} ${e.path || '/'}: ${e.message}`);
      for (const w of warns) console.log(`WARN  ${w.code} ${w.path || '/'}: ${w.message}`);
      if (res.valid) console.log(`valid (${warns.length} warning${warns.length === 1 ? '' : 's'}) ${hash}`);
    }
    process.exit(res.valid ? 0 : 1);
  }

  if (cmd === 'hash') {
    const doc = loadAni(file);
    console.log(await documentHash(doc));
    return;
  }

  if (cmd === 'report') {
    const doc = loadAni(file);
    requireValid(doc);
    const report = await evidenceReport(doc);
    const reviews = await reviewStates(doc);
    if (flags.json) {
      console.log(JSON.stringify({ claims: report, reviews }, null, 2));
      return;
    }
    for (const [id, r] of Object.entries(report)) {
      const cited = r.kind === 'illustrative' ? 'illustrative' : (r.cited ? 'cited' : 'uncited');
      console.log(`${id}\t${r.kind}\t${cited}\tsource-support:${r.sourceSupport.state}\tscientific:${r.scientificAccuracy.state}`);
    }
    return;
  }

  if (cmd === 'patch') {
    if (!second) { console.error('Missing patch JSON file.'); process.exit(1); }
    const doc = loadAni(file);
    const ops = JSON.parse(readFileSync(second, 'utf8'));
    const baseHash = flags.base === 'current' ? await documentHash(doc) : flags.base;
    const res = await applyPatch(doc, ops, { baseHash });
    if (!res.ok) {
      if (flags.json) console.log(JSON.stringify(res, null, 2));
      else for (const e of res.errors) console.error(`ERROR ${e.code} ${e.path || '/'}: ${e.message}`);
      process.exit(1);
    }
    const outText = JSON.stringify(res.document, null, 1) + '\n';
    if (flags['in-place']) writeFileSync(file, outText, 'utf8');
    else if (flags.out) writeFileSync(flags.out, outText, 'utf8');
    if (flags.json) {
      console.log(JSON.stringify({ ok: true, revision: res.document.document.revision, hash: res.hash, newlyStaleReviews: res.newlyStaleReviews, warnings: res.warnings }, null, 2));
    } else if (!flags['in-place'] && !flags.out) {
      process.stdout.write(outText);
    } else {
      console.log(`patched rev ${res.document.document.revision} ${res.hash} (newly stale reviews: ${res.newlyStaleReviews.length})`);
    }
    return;
  }

  if (cmd === 'render') {
    const doc = loadAni(file);
    requireValid(doc);
    const variables = {};
    for (const pair of flags.vars) {
      const idx = pair.indexOf('=');
      if (idx < 1) throw new Error(`Invalid --var '${pair}', expected key=value`);
      const k = pair.slice(0, idx);
      variables[k] = coerceVar(doc, k, pair.slice(idx + 1));
    }
    let time;
    if (flags.time !== undefined) {
      time = Number(flags.time);
      if (!Number.isFinite(time)) throw new Error(`Invalid --time '${flags.time}', expected a finite number.`);
    }
    const svg = renderSvg(doc, {
      scene: flags.scene,
      theme: flags.theme,
      time,
      reducedMotion: Boolean(flags['reduced-motion']),
      variables,
      background: flags.bg,
    });
    writeOut(svg + '\n', flags.out);
    return;
  }

  if (cmd === 'export') {
    const doc = loadAni(file);
    requireValid(doc);
    const html = await exportHtml(doc, {
      scene: flags.scene,
      theme: flags.theme,
      themeToggle: !flags['no-theme-toggle'],
    });
    writeOut(html + '\n', flags.out);
    return;
  }

  console.error(`Unknown command '${cmd}'.\n${USAGE}`);
  process.exit(1);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
