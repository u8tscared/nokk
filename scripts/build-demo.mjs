import { readFileSync, writeFileSync } from 'node:fs';
import { processOsm } from '../src/lib/osm.js';
const j = JSON.parse(readFileSync(process.argv[2]));
const r = processOsm(j);
const round = (p) => [+p[0].toFixed(6), +p[1].toFixed(6)];
const out = {
  town: j.town, center: [j.lon, j.lat],
  streets: r.streets.map(s => ({ name: s.name, big: s.big, lines: s.lines.map(l => l.map(round)) })),
  network: r.network.map(l => l.map(round)),
  doors: r.doors.map(d => ({ id: d.id, street: d.street, num: d.num, p: round(d.p), snap: round(d.snap), line: d.line, along: d.along, flats: d.flats })),
};
writeFileSync('src/demo/area.json', JSON.stringify(out));
console.log(JSON.stringify(out).length);
