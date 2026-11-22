import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { documentHash } from '../src/index.js';
import { crispr } from './helpers.js';

const BIN = fileURLToPath(new URL('../bin/ani.js', import.meta.url));
const CRISPR_PATH = fileURLToPath(new URL('../examples/crispr-cas9.ani', import.meta.url));

function runCli(args) {
  return execFileSync(process.execPath, [BIN, ...args], { encoding: 'utf8' });
}

test('CLI validate, hash, and report work on crispr-cas9.ani', async () => {
  const val = JSON.parse(runCli(['validate', CRISPR_PATH, '--json']));
  assert.equal(val.valid, true);
  assert.equal(val.hash, await documentHash(crispr()));

  const hash = runCli(['hash', CRISPR_PATH]).trim();
  assert.equal(hash, val.hash);

  const report = JSON.parse(runCli(['report', CRISPR_PATH, '--json']));
  assert.equal(report.claims.c_structure_basis.cited, true);
  assert.equal(report.claims.c_timeline_illustration.kind, 'illustrative');
});

test('CLI patch validates base hash, writes patched output, and bumps revision', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ani-cli-'));
  try {
    const patchPath = join(dir, 'patch.json');
    const outPath = join(dir, 'patched.ani');
    writeFileSync(patchPath, JSON.stringify([{ op: 'replace', path: '/scenes/overview/nodes/floor_halo/z', value: 11 }]));

    assert.throws(() => runCli(['patch', CRISPR_PATH, patchPath, '--base', 'sha256:' + '0'.repeat(64)]), /BASE_MISMATCH/);

    const res = JSON.parse(runCli(['patch', CRISPR_PATH, patchPath, '--base', 'current', '--out', outPath, '--json']));
    assert.equal(res.ok, true);
    assert.equal(res.revision, 2);
    const updated = JSON.parse(readFileSync(outPath, 'utf8'));
    assert.equal(updated.document.revision, 2);
    assert.equal(updated.scenes.overview.nodes.floor_halo.z, 11);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('CLI render and export write SVG and standalone HTML', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ani-cli-'));
  try {
    const svgPath = join(dir, 'out.svg');
    const htmlPath = join(dir, 'out.html');
    runCli(['render', CRISPR_PATH, '--theme', 'light', '--time', '7.5', '--var', 'fidelity=match', '--out', svgPath]);
    const svg = readFileSync(svgPath, 'utf8');
    assert.ok(svg.startsWith('<svg '));
    assert.ok(svg.includes('HNH DOCKED'));

    runCli(['export', CRISPR_PATH, '--theme', 'dark', '--out', htmlPath]);
    const html = readFileSync(htmlPath, 'utf8');
    assert.ok(html.startsWith('<!doctype html>'));
    assert.ok(html.includes('CRISPR-Cas9 endonuclease DNA cleavage mechanism'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('CLI handles --help exit code and rejects invalid --time and dangling flags', () => {
  const help = runCli(['--help']);
  assert.ok(help.includes('Usage:'));
  assert.ok(runCli(['-h']).includes('Usage:'));
  assert.throws(() => runCli(['render', CRISPR_PATH, '--time', 'abc']), /Invalid --time/);
  assert.throws(() => runCli(['render', CRISPR_PATH, '--var']), /Missing value for '--var'/);
  assert.throws(() => runCli(['render', CRISPR_PATH, '--theme']), /Missing value for '--theme'/);
});
