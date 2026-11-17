import { spawn, execSync } from 'node:child_process';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';

const [htmlPath, outPath] = process.argv.slice(2);
const chrome = process.env.CHROME_PATH || execSync(`find "${process.env.HOME}/.cache/ms-playwright" -path '*chromium-*' -name chrome -type f 2>/dev/null | head -1`).toString().trim();
if (!chrome) throw new Error('Set CHROME_PATH to a Chrome or Chromium binary');
const port = 9340 + Math.floor(Math.random() * 100);
const proc = spawn(chrome, ['--headless=new', '--no-sandbox', '--disable-gpu', `--remote-debugging-port=${port}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), 'oracle-'))}`, 'file://' + resolve(htmlPath)], { stdio: 'ignore' });
try {
  let page;
  for (let i = 0; i < 50 && !page; i++) {
    await new Promise((r) => setTimeout(r, 200));
    try { page = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === 'page' && t.url.startsWith('file:')); } catch {}
  }
  if (!page) throw new Error('page did not load');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let id = 0; const pending = new Map();
  ws.onmessage = (e) => { const m = JSON.parse(e.data); pending.get(m.id)?.(m); pending.delete(m.id); };
  const evaluate = (expression) => new Promise((res, rej) => {
    pending.set(++id, (m) => (m.result?.exceptionDetails ? rej(new Error(JSON.stringify(m.result.exceptionDetails))) : res(m.result.result.value)));
    ws.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression, returnByValue: true } }));
  });
  const read = `(() => { const g = (i) => document.getElementById(i); const t = (i) => g(i).textContent;
    return { texts: { summary: t('corner-readout'), rloop: t('readout-rloop'), rloopDesc: t('desc-rloop'), hnh: t('readout-hnh'), hnhDesc: t('desc-hnh'),
                      cleavage: t('readout-cleavage'), cleavageDesc: t('desc-cleavage'), hud: t('hud-dist-text') },
             transform: g('hnh-transform').getAttribute('transform'), hnhOpacity: g('hnh-domain-group').style.opacity,
             spacerOpacity: g('grna-spacer-path').style.opacity, productsOpacity: g('cleavage-products').style.opacity,
             tsFlash: g('ts-flash').style.opacity, ntsFlash: g('nts-flash').style.opacity,
             line: { x1: g('hnh-ts-dist-line').getAttribute('x1'), y1: g('hnh-ts-dist-line').getAttribute('y1') },
             rungElements: g('hybrid-basepairs').children.length }; })()`;
  const samples = [];
  const values = new Set([...Array.from({ length: 201 }, (_, i) => i * 5), 519, 520, 521, 759, 760, 761, 819, 820, 821, 822, 999]);
  for (const mode of ['match', 'mismatch']) {
    for (const v of [...values].sort((a, b) => a - b)) {
      const state = await evaluate(`(() => { document.getElementById('btn-target-${mode}').click();
        const s = document.getElementById('time-range'); s.value = '${v}'; s.oninput(); return ${read}; })()`);
      samples.push({ fidelity: mode, scrub: v, ...state });
    }
  }
  writeFileSync(outPath, JSON.stringify({ source: htmlPath, capturedWith: 'headless chromium via CDP', samples }, null, 1));
  console.log(`captured ${samples.length} samples; original rung elements in DOM: ${samples[0].rungElements}`);
  ws.close();
} finally { proc.kill(); }
