// Appels à l'API Nokk (Cloudflare), toujours avec le jeton de connexion.
import { idToken } from './auth.js';

export const API_BASE = (typeof window !== 'undefined' && window.__nokkApi) || 'https://nokk-api.marceau-ruis.workers.dev';

export class ApiError extends Error {
  constructor(status, code) { super(code || 'api_error'); this.status = status; this.code = code; }
}

export async function api(path, { method = 'GET', body, timeout = 25000 } = {}) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const tok = await idToken(attempt > 0);
    if (!tok) throw new ApiError(401, 'signed_out');
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeout);
    let r;
    try {
      r = await fetch(API_BASE + path, {
        method,
        headers: { authorization: 'Bearer ' + tok, ...(body ? { 'content-type': 'application/json' } : {}) },
        body: body ? JSON.stringify(body) : undefined,
        signal: ctrl.signal,
      });
    } catch {
      throw new ApiError(0, 'network');
    } finally {
      clearTimeout(t);
    }
    if (r.status === 401 && attempt === 0) continue; // jeton expiré : on le renouvelle une fois
    let j = null;
    try { j = await r.json(); } catch {}
    if (!r.ok) throw new ApiError(r.status, j?.error);
    return j;
  }
  throw new ApiError(401, 'unauthorized');
}
