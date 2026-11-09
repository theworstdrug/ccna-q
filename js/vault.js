// Vault: your books-repo token, encrypted with a passphrase, so each device only needs the
// passphrase once instead of the token.
//
// The encrypted vault lives in the PUBLIC app repo (vault.json), so anyone could download it:
// it is only as strong as the passphrase. Keys are stretched with PBKDF2-SHA256 (600,000
// rounds) and the token is sealed with AES-256-GCM; use the generated five-word passphrase.

import { WORDS } from './data/words.js';
import { cloudConfig, setCloudConfig } from './cloud.js';

export const APP_REPO = 'theworstdrug/ccna-q';
const VAULT_PATH = 'vault.json';
const ITER = 600000;

const b64 = u8 => btoa(String.fromCharCode(...u8));
const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const norm = p => String(p).trim().toLowerCase().replace(/[\s-]+/g, ' ');

/** A random passphrase of `n` words from the EFF short list (~10.3 bits each). */
export function makePassphrase(n = 5) {
  const limit = Math.floor(2 ** 32 / WORDS.length) * WORDS.length; // reject the tail: no modulo bias
  const out = [];
  const r = new Uint32Array(1);
  while (out.length < n) {
    crypto.getRandomValues(r);
    if (r[0] < limit) out.push(WORDS[r[0] % WORDS.length]);
  }
  return out.join(' ');
}

/** Rough strength in bits: word passphrases from the list count 10.3 bits a word. */
export function strengthBits(pass) {
  const p = norm(pass);
  const ws = p.split(' ').filter(Boolean);
  if (ws.length && ws.every(w => WORDS.includes(w))) return Math.round(ws.length * Math.log2(WORDS.length));
  const pool = (/[a-z]/.test(p) ? 26 : 0) + (/[A-Z]/.test(pass) ? 26 : 0) + (/\d/.test(p) ? 10 : 0) + (/[^a-z0-9\s]/i.test(p) ? 32 : 0) + (/\s/.test(p) ? 1 : 0);
  return Math.round(p.replace(/\s/g, '').length * Math.log2(Math.max(pool, 2)) * 0.6); // discounted: people pick patterns
}
export const MIN_BITS = 45;

async function key(pass, salt, iter, usage) {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(norm(pass)), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iter }, base, { name: 'AES-GCM', length: 256 }, false, [usage]);
}

/** Seal { token, repo, branch } with a passphrase. */
export async function seal(secret, pass, iter = ITER) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await key(pass, salt, iter, 'encrypt'), new TextEncoder().encode(JSON.stringify(secret))));
  return { v: 1, kdf: 'PBKDF2-SHA256', iter, cipher: 'AES-256-GCM', salt: b64(salt), iv: b64(iv), ct: b64(ct), at: new Date().toISOString().slice(0, 10) };
}

/** Open a vault; throws "Wrong passphrase" if it doesn't decrypt. */
export async function open(vault, pass) {
  try {
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(vault.iv) }, await key(pass, unb64(vault.salt), vault.iter, 'decrypt'), unb64(vault.ct));
    return JSON.parse(new TextDecoder().decode(pt));
  } catch { throw new Error('Wrong passphrase'); }
}

/** The published vault, or null. Read through the public API (no login needed for a public repo). */
export async function fetchVault() {
  try {
    const res = await fetch(`https://api.github.com/repos/${APP_REPO}/contents/${VAULT_PATH}`, { headers: { Accept: 'application/vnd.github.raw+json' }, cache: 'no-store' });
    if (!res.ok) return null;
    const v = await res.json();
    return v?.ct ? v : null;
  } catch { return null; }
}

/** Unlock this device with the passphrase: saves the token like pasting it would. */
export async function unlock(pass) {
  const v = await fetchVault();
  if (!v) throw new Error('No saved vault yet. Paste the token once, then choose "Remember on my other devices".');
  const s = await open(v, pass);
  setCloudConfig({ repo: s.repo, branch: s.branch, token: s.token });
  return s;
}

/** Publish (or replace) the vault for this device's token. The token needs Contents: write on the app repo too. */
export async function publishVault(pass) {
  const c = cloudConfig();
  if (!c.token) throw new Error('Connect with a token first.');
  if (strengthBits(pass) < MIN_BITS) throw new Error('That passphrase is too easy to guess. Use the generated one.');
  const vault = await seal({ token: c.token, repo: c.repo, branch: c.branch }, pass);
  const api = `https://api.github.com/repos/${APP_REPO}/contents/${VAULT_PATH}`;
  const headers = { Authorization: `Bearer ${c.token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
  const cur = await fetch(api, { headers, cache: 'no-store' });
  const sha = cur.ok ? (await cur.json()).sha : undefined;
  const res = await fetch(api, {
    method: 'PUT', headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: 'Update encrypted token vault', content: btoa(JSON.stringify(vault, null, 1) + '\n'), ...(sha ? { sha } : {}) }),
  });
  if (res.status === 403 || res.status === 404) throw new Error(`Your token can't write to ${APP_REPO}. Edit the token on GitHub: add ${APP_REPO} with Contents: Read and write.`);
  if (!res.ok) throw new Error(`GitHub said ${res.status}`);
  return vault;
}

/** Remove the published vault (e.g. after revoking the token). */
export async function removeVault() {
  const c = cloudConfig();
  const api = `https://api.github.com/repos/${APP_REPO}/contents/${VAULT_PATH}`;
  const headers = { Authorization: `Bearer ${c.token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
  const cur = await fetch(api, { headers, cache: 'no-store' });
  if (!cur.ok) return;
  const res = await fetch(api, { method: 'DELETE', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ message: 'Remove token vault', sha: (await cur.json()).sha }) });
  if (!res.ok) throw new Error(`GitHub said ${res.status}`);
}
