// Outils géographiques, sans dépendance. Coordonnées en [lon, lat].
const R = 6371008.8;
const rad = (d) => (d * Math.PI) / 180;

export function dist(a, b) {
  const dLat = rad(b[1] - a[1]);
  const dLon = rad(b[0] - a[0]);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

// Projection locale (mètres) autour d'un point de référence : suffisant à l'échelle d'un quartier.
export function projector(ref) {
  const kx = Math.cos(rad(ref[1])) * (Math.PI / 180) * R;
  const ky = (Math.PI / 180) * R;
  return {
    to: (p) => [(p[0] - ref[0]) * kx, (p[1] - ref[1]) * ky],
    from: (q) => [q[0] / kx + ref[0], q[1] / ky + ref[1]],
  };
}

export function bbox(points) {
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  for (const p of points) {
    if (p[0] < w) w = p[0];
    if (p[0] > e) e = p[0];
    if (p[1] < s) s = p[1];
    if (p[1] > n) n = p[1];
  }
  return [w, s, e, n];
}

export function centroid(points) {
  let x = 0, y = 0;
  for (const p of points) { x += p[0]; y += p[1]; }
  return [x / points.length, y / points.length];
}

export function pointInPolygon(p, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if ((yi > p[1]) !== (yj > p[1]) && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function convexHull(points) {
  const pts = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (pts.length < 3) return pts;
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

// Agrandit un polygone convexe de `m` mètres autour de son centre (pour un contour qui respire).
export function inflate(poly, m) {
  const c = centroid(poly);
  const P = projector(c);
  return poly.map((p) => {
    const q = P.to(p);
    const l = Math.hypot(q[0], q[1]) || 1;
    return P.from([q[0] + (q[0] / l) * m, q[1] + (q[1] / l) * m]);
  });
}

// Point le plus proche sur une polyligne : renvoie { point, distance, along }.
export function nearestOnLine(p, line) {
  const P = projector(p);
  const q = [0, 0];
  let best = { d2: Infinity, point: line[0], along: 0 };
  let acc = 0;
  for (let i = 0; i < line.length - 1; i++) {
    const a = P.to(line[i]);
    const b = P.to(line[i + 1]);
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const L2 = dx * dx + dy * dy;
    const L = Math.sqrt(L2);
    let t = L2 ? ((q[0] - a[0]) * dx + (q[1] - a[1]) * dy) / L2 : 0;
    t = Math.max(0, Math.min(1, t));
    const x = a[0] + t * dx, y = a[1] + t * dy;
    const d2 = x * x + y * y;
    if (d2 < best.d2) best = { d2, point: P.from([x, y]), along: acc + t * L };
    acc += L;
  }
  return { point: best.point, distance: Math.sqrt(best.d2), along: best.along };
}

export function lineLength(line) {
  let l = 0;
  for (let i = 0; i < line.length - 1; i++) l += dist(line[i], line[i + 1]);
  return l;
}

export function formatDistance(m) {
  if (m == null || !isFinite(m)) return '';
  if (m < 1000) return `${Math.max(5, Math.round(m / 5) * 5)} m`;
  return `${(m / 1000).toFixed(1).replace('.', ',')} km`;
}
