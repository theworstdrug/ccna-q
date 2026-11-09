// Cloud library: your reference PDFs (their text, and optionally the PDF file) live in a
// PRIVATE GitHub repository you own, so every device gets the same library.
//
//   library/index.json            { version, docs: [{ id, name, pages, size, added, parts, pdf }] }
//   library/docs/<id>/<k>.json    chunks, split into parts (keeps each file small)
//   library/pdf/<id>.pdf          the original PDF, when it was backed up
//
// Uploads and deletes are single commits made with the Git Data API. The token is a
// fine-grained personal access token limited to that one repository (Contents: read & write).
// It is kept only on this device (not in the JSON backup).

import { listDocs, saveDoc, deleteDoc } from './refs.js';

const CFG = 'ccnaq.cloud';
const PART = 700; // chunks per part file
export const DEFAULT_REPO = 'theworstdrug/ccna-books';

/** { repo, branch, token } – repo and branch default to your private books repo. */
export function cloudConfig() {
  let c = null;
  try { c = JSON.parse(localStorage.getItem(CFG) || 'null'); } catch { /* blocked */ }
  return { repo: c?.repo || DEFAULT_REPO, branch: c?.branch || 'main', token: c?.token || '' };
}
export function setCloudConfig(cfg) {
  try { if (cfg) localStorage.setItem(CFG, JSON.stringify(cfg)); else localStorage.removeItem(CFG); } catch { /* storage blocked */ }
}
export const cloudOn = () => { const c = cloudConfig(); return !!(c?.repo && c?.token); };

/** owner/name from "owner/name" or a github.com URL. */
export function parseRepo(s) {
  const m = String(s || '').trim().replace(/\.git$/, '').match(/(?:github\.com[/:])?([\w.-]+)\/([\w.-]+)\/?$/);
  return m ? `${m[1]}/${m[2]}` : null;
}

class CloudError extends Error {
  constructor(msg, status) { super(msg); this.status = status; }
}

async function gh(path, { method = 'GET', body, raw = false, cfg = cloudConfig() } = {}) {
  if (!cfg?.repo || !cfg?.token) throw new CloudError('Cloud library is not connected.');
  const res = await fetch(`https://api.github.com/repos/${cfg.repo}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${cfg.token}`,
      Accept: raw ? 'application/vnd.github.raw+json' : 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  });
  if (!res.ok) {
    let msg = `GitHub said ${res.status}`;
    try { msg = (await res.json()).message || msg; } catch { /* not JSON */ }
    if (res.status === 401) msg = 'The token was rejected (expired or mistyped).';
    if (res.status === 403) msg = `Access denied: give the token "Contents: Read and write" on ${cfg.repo}. (${msg})`;
    throw new CloudError(msg, res.status);
  }
  if (raw === 'response') return res;
  if (raw === 'blob') return res.blob();
  if (raw) return res.text();
  return res.status === 204 ? null : res.json();
}

const branch = (cfg = cloudConfig()) => cfg?.branch || 'main';

/** A file from the books repo as a streaming Response (works for files up to 100 MB). */
export const ghRaw = path => gh(`/contents/${path.split('/').map(encodeURIComponent).join('/')}?ref=${encodeURIComponent(branch())}`, { raw: 'response' });

/** Check the connection; returns a short description of the repo. */
export async function testCloud(cfg) {
  const info = await gh('', { cfg });
  if (!info.private) throw new CloudError(`${cfg.repo} is PUBLIC. Use a private repository: your books would be downloadable by anyone.`);
  if (!info.permissions?.push) throw new CloudError('This token can read the repository but not write to it.');
  try { await gh(`/git/ref/heads/${encodeURIComponent(branch(cfg))}`, { cfg }); } catch (e) {
    if (e.status === 404 || e.status === 409) throw new CloudError(`Branch "${branch(cfg)}" not found. If the repository is empty, add a README on GitHub first.`);
    throw e;
  }
  return `${info.full_name} · private · branch ${branch(cfg)}`;
}

async function readIndex() {
  try {
    return JSON.parse(await gh(`/contents/library/index.json?ref=${encodeURIComponent(branch())}`, { raw: true }));
  } catch (e) {
    if (e.status === 404) return { version: 1, docs: [] };
    throw e;
  }
}

const b64 = async blob => {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let s = '';
  for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
  return btoa(s);
};

/** One commit that writes `files` ({ path: string | Blob }) and deletes `remove` (paths). */
async function commit(message, files, remove = []) {
  const ref = await gh(`/git/ref/heads/${encodeURIComponent(branch())}`);
  const head = await gh(`/git/commits/${ref.object.sha}`);
  const tree = [];
  for (const [path, content] of Object.entries(files)) {
    const blob = content instanceof Blob
      ? await gh('/git/blobs', { method: 'POST', body: { content: await b64(content), encoding: 'base64' } })
      : await gh('/git/blobs', { method: 'POST', body: { content, encoding: 'utf-8' } });
    tree.push({ path, mode: '100644', type: 'blob', sha: blob.sha });
  }
  for (const path of remove) tree.push({ path, mode: '100644', type: 'blob', sha: null });
  const t = await gh('/git/trees', { method: 'POST', body: { base_tree: head.tree.sha, tree } });
  const c = await gh('/git/commits', { method: 'POST', body: { message, tree: t.sha, parents: [ref.object.sha] } });
  await gh(`/git/refs/heads/${encodeURIComponent(branch())}`, { method: 'PATCH', body: { sha: c.sha } });
  return c.sha;
}

/** Write small files to the books repo in one commit ({ path: string | Blob }); paths in `remove` are deleted. */
export const writeFiles = (message, files, remove = []) => commit(message, files, remove);

/** A JSON file from the books repo, or null if it doesn't exist. */
export async function readJson(path) {
  try { return JSON.parse(await (await ghRaw(path)).text()); } catch (e) { if (e.status === 404) return null; throw e; }
}

const meta = d => ({ id: d.id, name: d.name, pages: d.pages, size: d.size, added: d.added });

/** Split a doc into part files. */
export function docFiles(doc) {
  const files = {};
  const parts = Math.max(1, Math.ceil(doc.chunks.length / PART));
  for (let k = 0; k < parts; k++) files[`library/docs/${doc.id}/${k}.json`] = JSON.stringify({ id: doc.id, part: k, chunks: doc.chunks.slice(k * PART, (k + 1) * PART) });
  return { files, parts };
}

/** Upload a doc (and optionally its PDF file) in one commit. */
export async function uploadDoc(doc, pdfFile = null) {
  const idx = await readIndex();
  const { files, parts } = docFiles(doc);
  const entry = { ...meta(doc), parts, pdf: pdfFile ? `library/pdf/${doc.id}.pdf` : null };
  if (pdfFile) files[entry.pdf] = pdfFile;
  idx.docs = [...idx.docs.filter(d => d.id !== doc.id), entry];
  files['library/index.json'] = JSON.stringify(idx, null, 1);
  await commit(`Library: add ${doc.name}`, files);
  await saveDoc({ ...doc, cloud: true, pdf: entry.pdf });
}

/** Remove a doc everywhere. */
export async function removeDoc(doc) {
  if (doc.cloud && cloudOn()) {
    const idx = await readIndex();
    const entry = idx.docs.find(d => d.id === doc.id);
    if (entry) {
      idx.docs = idx.docs.filter(d => d.id !== doc.id);
      const remove = [...Array(entry.parts || 1).keys()].map(k => `library/docs/${doc.id}/${k}.json`);
      if (entry.pdf) remove.push(entry.pdf);
      await commit(`Library: remove ${doc.name}`, { 'library/index.json': JSON.stringify(idx, null, 1) }, remove);
    }
  }
  await deleteDoc(doc.id);
}

let syncing = null;
/**
 * Two-way sync: download docs that are only in the cloud, upload docs that are only here,
 * and drop local copies of docs that were deleted on another device.
 * onProgress(label). Returns { down, up, gone }.
 */
export function syncLibrary(onProgress = () => {}) {
  if (!cloudOn()) return Promise.resolve({ down: 0, up: 0, gone: 0 });
  if (syncing) return syncing;
  syncing = (async () => {
    onProgress('Checking the cloud library…');
    const idx = await readIndex();
    const local = await listDocs();
    const have = new Map(local.map(d => [d.id, d]));
    const remote = new Map(idx.docs.map(d => [d.id, d]));
    let down = 0, up = 0, gone = 0;
    for (const e of idx.docs) {
      if (have.has(e.id)) continue;
      const chunks = [];
      for (let k = 0; k < (e.parts || 1); k++) {
        onProgress(`Downloading ${e.name} (${k + 1}/${e.parts || 1})…`);
        chunks.push(...JSON.parse(await gh(`/contents/library/docs/${e.id}/${k}.json?ref=${encodeURIComponent(branch())}`, { raw: true })).chunks);
      }
      await saveDoc({ ...meta(e), chunks, cloud: true, pdf: e.pdf || null });
      down++;
    }
    for (const d of local) {
      if (remote.has(d.id)) continue;
      if (d.cloud) { await deleteDoc(d.id); gone++; continue; } // deleted on another device
      onProgress(`Uploading ${d.name}…`);
      await uploadDoc(d);
      up++;
    }
    try { localStorage.setItem('ccnaq.cloud.last', String(Date.now())); } catch { /* ignore */ }
    return { down, up, gone };
  })().finally(() => { syncing = null; });
  return syncing;
}

export const lastSync = () => { try { return +localStorage.getItem('ccnaq.cloud.last') || 0; } catch { return 0; } };

/** The original PDF from the cloud (cached on the device after the first download). */
export async function pdfUrl(doc, page) {
  if (!doc?.pdf) return null;
  const cache = await caches.open('ccnaq-pdf');
  const key = `/__pdf/${doc.id}`;
  let res = await cache.match(key);
  if (!res) {
    const blob = await gh(`/contents/${doc.pdf}?ref=${encodeURIComponent(branch())}`, { raw: 'blob' });
    await cache.put(key, new Response(blob, { headers: { 'Content-Type': 'application/pdf' } }));
    res = await cache.match(key);
  }
  const url = URL.createObjectURL(new Blob([await res.blob()], { type: 'application/pdf' }));
  return page ? `${url}#page=${page}` : url;
}
