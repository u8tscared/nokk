// QR codes dessinés nous-mêmes (SVG pour l'écran, carrés pour le PDF).
import qrcode from 'qrcode-generator';

export function qrMatrix(text, level = 'M') {
  const q = qrcode(0, level);
  q.addData(text, 'Byte');
  q.make();
  const n = q.getModuleCount();
  const dark = (r, c) => q.isDark(r, c);
  return { n, dark };
}

/** Chemin SVG d'un QR (une unité = un module). */
export function qrPath(text, level = 'M') {
  const { n, dark } = qrMatrix(text, level);
  let d = '';
  for (let r = 0; r < n; r++) {
    let c = 0;
    while (c < n) {
      if (!dark(r, c)) { c++; continue; }
      let e = c;
      while (e < n && dark(r, e)) e++;
      d += `M${c} ${r}h${e - c}v1h${c - e}z`;
      c = e;
    }
  }
  return { n, d };
}
