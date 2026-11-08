// Écrans figés : rien ne bouge sous le doigt s'il n'y a rien à faire défiler.
const FREE = 'input, textarea, select, [contenteditable], canvas, video, .maplibregl-map, [data-free]';

function canScroll(el, dy, dx) {
  for (let n = el; n && n !== document.documentElement; n = n.parentElement) {
    if (n.matches?.(FREE)) return true;
    const s = getComputedStyle(n);
    if (Math.abs(dy) >= Math.abs(dx)) {
      if (/(auto|scroll)/.test(s.overflowY) && n.scrollHeight > n.clientHeight + 1) {
        // Dans le bon sens ?
        if (dy > 0 && n.scrollTop > 0) return true; // le doigt descend : on remonte le contenu
        if (dy < 0 && n.scrollTop + n.clientHeight < n.scrollHeight - 1) return true;
      }
    } else if (/(auto|scroll)/.test(s.overflowX) && n.scrollWidth > n.clientWidth + 1) {
      if (dx > 0 && n.scrollLeft > 0) return true;
      if (dx < 0 && n.scrollLeft + n.clientWidth < n.scrollWidth - 1) return true;
    }
  }
  return false;
}

export function installFreeze(doc = document) {
  let sx = 0, sy = 0, decided = false, allow = true, moved = false;
  doc.addEventListener('touchstart', (e) => {
    if (e.touches.length > 1) { decided = true; allow = true; return; } // pincement permis
    sx = e.touches[0].clientX; sy = e.touches[0].clientY;
    decided = false; allow = true; moved = false;
  }, { passive: true });
  doc.addEventListener('touchmove', (e) => {
    if (e.touches.length > 1) return;
    const dx = e.touches[0].clientX - sx;
    const dy = e.touches[0].clientY - sy;
    if (Math.abs(dx) + Math.abs(dy) > 10) moved = true;
    if (!decided) {
      if (Math.abs(dx) + Math.abs(dy) < 2) return;
      decided = true;
      allow = canScroll(e.target, dy, dx);
    }
    if (!allow && e.cancelable) e.preventDefault();
  }, { passive: false });
  // Un doigt qui a défilé ne « clique » jamais sur ce qui était dessous.
  doc.addEventListener('click', (e) => {
    if (moved && e.isTrusted && e.pointerType !== 'mouse') {
      moved = false;
      e.preventDefault();
      e.stopPropagation();
    }
  }, true);
  doc.addEventListener('touchend', () => setTimeout(() => { moved = false; }, 350), { passive: true });
}
export { canScroll };
