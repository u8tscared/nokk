// Calcul du parcours optimisé à pied, entièrement sur l'appareil (marche hors ligne).
// Idée : on découpe les portes en « tronçons » de rue (on fait les deux côtés en zigzag,
// sauf les grandes avenues : un côté à l'aller, l'autre au retour), puis on ordonne les
// tronçons et leur sens avec un plus-proche-voisin suivi d'une optimisation 2-opt,
// en mesurant les liaisons sur le vrai réseau de rues (Dijkstra).
import { dist, centroid } from './geo.js';

const key = (p) => p[0].toFixed(6) + ',' + p[1].toFixed(6);

export function buildGraph(network) {
  const nodes = new Map(); // key -> index
  const coords = [];
  const adj = [];
  const nodeOf = (p) => {
    const k = key(p);
    let i = nodes.get(k);
    if (i == null) {
      i = coords.length;
      nodes.set(k, i);
      coords.push(p);
      adj.push([]);
    }
    return i;
  };
  for (const line of network) {
    for (let i = 0; i < line.length - 1; i++) {
      const a = nodeOf(line[i]);
      const b = nodeOf(line[i + 1]);
      if (a === b) continue;
      const w = dist(line[i], line[i + 1]);
      adj[a].push(b, w);
      adj[b].push(a, w);
    }
  }
  // Grille pour retrouver vite le nœud le plus proche.
  const cell = 0.002;
  const grid = new Map();
  coords.forEach((p, i) => {
    const g = Math.floor(p[0] / cell) + ':' + Math.floor(p[1] / cell);
    if (!grid.has(g)) grid.set(g, []);
    grid.get(g).push(i);
  });
  function nearest(p) {
    const gx = Math.floor(p[0] / cell), gy = Math.floor(p[1] / cell);
    let best = -1, bd = Infinity;
    for (let r = 1; r <= 3 && best < 0; r++) {
      for (let x = gx - r; x <= gx + r; x++)
        for (let y = gy - r; y <= gy + r; y++)
          for (const i of grid.get(x + ':' + y) || []) {
            const d = dist(p, coords[i]);
            if (d < bd) { bd = d; best = i; }
          }
    }
    return best;
  }
  return { coords, adj, nearest, size: coords.length };
}

// Dijkstra avec tas binaire.
export function dijkstra(g, src) {
  const n = g.size;
  const d = new Float64Array(n).fill(Infinity);
  const prev = new Int32Array(n).fill(-1);
  const heap = [[0, src]];
  d[src] = 0;
  const push = (x) => {
    heap.push(x);
    let i = heap.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (heap[p][0] <= heap[i][0]) break;
      [heap[p], heap[i]] = [heap[i], heap[p]];
      i = p;
    }
  };
  const pop = () => {
    const top = heap[0];
    const last = heap.pop();
    if (heap.length) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
        if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
        if (m === i) break;
        [heap[m], heap[i]] = [heap[i], heap[m]];
        i = m;
      }
    }
    return top;
  };
  while (heap.length) {
    const [du, u] = pop();
    if (du > d[u]) continue;
    const a = g.adj[u];
    for (let k = 0; k < a.length; k += 2) {
      const v = a[k];
      const nd = du + a[k + 1];
      if (nd < d[v]) {
        d[v] = nd;
        prev[v] = u;
        push([nd, v]);
      }
    }
  }
  return { d, prev };
}

function pathTo(g, sp, target) {
  const out = [];
  for (let v = target; v >= 0; v = sp.prev[v]) out.push(g.coords[v]);
  return out.reverse();
}

const isOdd = (num) => (parseInt(num, 10) || 0) % 2 === 1;

export function makeChunks(doors, streetsBig = new Set(), { sides = 'auto', gap = 140 } = {}) {
  const groups = new Map();
  for (const d of doors) {
    const k = d.street + '#' + (d.line ?? 0);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(d);
  }
  const chunks = [];
  for (const list of groups.values()) {
    list.sort((a, b) => a.along - b.along);
    // Coupe aux grands trous (rue interrompue, autre quartier).
    let cur = [list[0]];
    const parts = [];
    for (let i = 1; i < list.length; i++) {
      if (list[i].along - list[i - 1].along > gap) { parts.push(cur); cur = []; }
      cur.push(list[i]);
    }
    parts.push(cur);
    const splitSides = sides === 'cote' || (sides === 'auto' && streetsBig.has(list[0].street));
    for (const part of parts) {
      if (splitSides && part.length > 3) {
        const odd = part.filter((d) => isOdd(d.num));
        const even = part.filter((d) => !isOdd(d.num)).reverse();
        // Un côté à l'aller, l'autre au retour : un seul tronçon en boucle.
        chunks.push({ doors: [...odd, ...even], street: part[0].street });
      } else {
        chunks.push({ doors: part, street: part[0].street });
      }
    }
  }
  return chunks.map((c) => {
    const pts = c.doors.map((d) => d.snap || d.p);
    let inner = 0;
    for (let i = 0; i < pts.length - 1; i++) inner += dist(pts[i], pts[i + 1]);
    return { ...c, a: pts[0], b: pts[pts.length - 1], inner };
  });
}

/**
 * @param {object} opts
 * @param {Array} opts.doors  portes à faire ({id, street, num, p, snap, line, along})
 * @param {Array} opts.network lignes du réseau piéton
 * @param {[number,number]=} opts.start position de départ (GPS)
 * @param {Set<string>=} opts.big noms des grandes rues
 */
export function planRoute({ doors, network, start = null, big = new Set(), sides = 'auto' }) {
  if (!doors.length) return { order: [], line: [], meters: 0, minutes: 0 };
  const chunks = makeChunks(doors, big, { sides });
  const g = buildGraph(network || []);
  const useGraph = g.size > 1;

  // Endpoints -> nœuds du graphe ; Dijkstra depuis chaque nœud utile (mis en cache).
  const nodeCache = new Map();
  const nodeOfPoint = (p) => {
    const k = key(p);
    if (!nodeCache.has(k)) nodeCache.set(k, useGraph ? g.nearest(p) : -1);
    return nodeCache.get(k);
  };
  const spCache = new Map();
  const sp = (node) => {
    if (!spCache.has(node)) spCache.set(node, dijkstra(g, node));
    return spCache.get(node);
  };
  const walk = (p, q) => {
    if (!useGraph) return dist(p, q) * 1.3;
    const a = nodeOfPoint(p), b = nodeOfPoint(q);
    if (a < 0 || b < 0) return dist(p, q) * 1.3;
    const d = sp(a).d[b];
    const via = d + dist(p, g.coords[a]) + dist(q, g.coords[b]);
    const direct = dist(p, q);
    // Si c'est très proche (même trottoir), on traverse directement.
    if (!isFinite(d) || direct < 35) return Math.min(isFinite(via) ? via : Infinity, direct * 1.15);
    return via;
  };

  const n = chunks.length;
  const entry = (c, o) => (o ? chunks[c].b : chunks[c].a);
  const exit = (c, o) => (o ? chunks[c].a : chunks[c].b);
  const memo = new Map();
  const W = (p, q) => {
    const k = key(p) + '>' + key(q);
    let v = memo.get(k);
    if (v == null) { v = walk(p, q); memo.set(k, v); }
    return v;
  };

  // Départ : la position GPS, sinon l'extrémité la plus excentrée.
  let s = start;
  if (!s) {
    const c = centroid(doors.map((d) => d.p));
    let best = null, bd = -1;
    for (const ch of chunks) for (const p of [ch.a, ch.b]) { const d = dist(p, c); if (d > bd) { bd = d; best = p; } }
    s = best;
  }

  // Plus proche voisin.
  const used = new Array(n).fill(false);
  let seq = [];
  let pos = s;
  for (let k = 0; k < n; k++) {
    let best = -1, bo = 0, bd = Infinity;
    for (let c = 0; c < n; c++) {
      if (used[c]) continue;
      for (const o of [0, 1]) {
        const d = W(pos, entry(c, o));
        if (d < bd) { bd = d; best = c; bo = o; }
      }
    }
    used[best] = true;
    seq.push([best, bo]);
    pos = exit(best, bo);
  }

  const cost = (q) => {
    let t = 0, p = s;
    for (const [c, o] of q) { t += W(p, entry(c, o)); p = exit(c, o); }
    return t;
  };

  // 2-opt orienté + retournement d'un tronçon, jusqu'à stabilité (borné).
  let bestCost = cost(seq);
  const deadline = Date.now() + 600;
  let improved = true;
  while (improved && Date.now() < deadline) {
    improved = false;
    for (let i = 0; i < n && !improved; i++) {
      for (let j = i; j < n; j++) {
        const cand = seq.slice(0, i).concat(seq.slice(i, j + 1).reverse().map(([c, o]) => [c, 1 - o]), seq.slice(j + 1));
        const cc = cost(cand);
        if (cc + 0.5 < bestCost) { seq = cand; bestCost = cc; improved = true; break; }
      }
    }
  }

  // Assemble l'ordre et le tracé.
  const order = [];
  const line = [s];
  let meters = 0;
  pos = s;
  for (const [c, o] of seq) {
    const ch = chunks[c];
    const list = o ? [...ch.doors].reverse() : ch.doors;
    const ent = entry(c, o);
    const linkLen = W(pos, ent);
    meters += linkLen;
    if (useGraph && dist(pos, ent) >= 35) {
      const a = nodeOfPoint(pos), b = nodeOfPoint(ent);
      if (a >= 0 && b >= 0 && isFinite(sp(a).d[b])) line.push(...pathTo(g, sp(a), b));
    }
    for (const d of list) {
      order.push(d.id);
      line.push(d.snap || d.p);
    }
    meters += ch.inner;
    pos = exit(c, o);
  }
  const minutes = Math.round(meters / 75 + order.length * 0.75); // 4,5 km/h + ~45 s par porte
  return { order, line, meters: Math.round(meters), minutes, chunks: seq.length };
}

// Distance d'un trajet naïf (ordre alphabétique des rues, numéros croissants) pour comparer.
export function naiveMeters(doors) {
  let m = 0;
  for (let i = 0; i < doors.length - 1; i++) m += dist(doors[i].p, doors[i + 1].p) * 1.3;
  return Math.round(m);
}
