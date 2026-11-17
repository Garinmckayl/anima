export function canonicalize(value) {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('Non-finite numbers cannot be canonicalized');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return '[' + value.map(canonicalize).join(',') + ']';
  if (typeof value === 'object') {
    const keys = Object.keys(value).filter((k) => value[k] !== undefined).sort();
    return '{' + keys.map((k) => JSON.stringify(k) + ':' + canonicalize(value[k])).join(',') + '}';
  }
  throw new TypeError('Unsupported value in document: ' + typeof value);
}

export async function hashValue(value) {
  const bytes = new TextEncoder().encode(canonicalize(value));
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return 'sha256:' + [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export const documentHash = hashValue;
