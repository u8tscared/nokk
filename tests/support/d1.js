// Base D1 simulée sur SQLite (node:sqlite), pour tester l'API telle qu'elle tourne chez Cloudflare.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite');

export function d1() {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync(new URL('../../worker/schema.sql', import.meta.url), 'utf8'));
  const stmt = (sql, args = []) => ({
    bind: (...a) => stmt(sql, a),
    first: async () => db.prepare(sql).get(...args) ?? null,
    all: async () => ({ results: db.prepare(sql).all(...args) }),
    run: async () => { const r = db.prepare(sql).run(...args); return { meta: { changes: r.changes } }; },
    _exec: () => db.prepare(sql).run(...args),
  });
  return {
    prepare: (sql) => stmt(sql),
    batch: async (list) => {
      db.exec('BEGIN');
      try { for (const s of list) s._exec(); db.exec('COMMIT'); } catch (e) { db.exec('ROLLBACK'); throw e; }
      return [];
    },
  };
}


// Jetons RS256 signés pour les tests (même format que Firebase).
export async function testKeys(project) {
  const keyPair = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
  const jwk = { ...(await crypto.subtle.exportKey('jwk', keyPair.publicKey)), kid: 'k1' };
  const enc = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  async function token(uid, extra = {}) {
    const now = Math.floor(Date.now() / 1000);
    const h = enc({ alg: 'RS256', kid: 'k1', typ: 'JWT' });
    const p = enc({ iss: 'https://securetoken.google.com/' + project, aud: project, sub: uid, iat: now, exp: now + 3600, email: uid + '@ex.fr', ...extra });
    const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', keyPair.privateKey, new TextEncoder().encode(h + '.' + p));
    return h + '.' + p + '.' + Buffer.from(sig).toString('base64url');
  }
  return { jwk, token };
}
