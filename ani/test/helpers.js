import { readFileSync } from 'node:fs';
export const load = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
export const crispr = () => load('../examples/crispr-cas9.ani');
export const clone = (x) => structuredClone(x);
