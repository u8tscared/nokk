// Clavier iOS : l'app prend la place visible au-dessus du clavier.
// Pose --vvh (hauteur visible) et --kb (hauteur du clavier) sur <html>, et la classe kb-open.
export function installKeyboard(win = window) {
  const vv = win.visualViewport;
  const root = win.document.documentElement;
  let base = win.innerHeight;
  let raf = 0;

  const editable = (el) => el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable) && !['checkbox', 'radio', 'range', 'button', 'submit', 'file', 'color'].includes(el.type);

  function update() {
    raf = 0;
    const h = vv ? vv.height : win.innerHeight;
    const top = vv ? vv.offsetTop : 0;
    if (!editable(win.document.activeElement)) base = Math.max(base, win.innerHeight);
    const lost = Math.max(0, base - h - top);
    // Faux positifs évités : un champ doit avoir le focus et > 80 px doivent disparaître.
    const open = editable(win.document.activeElement) && lost > 80;
    root.style.setProperty('--vvh', h + 'px');
    root.style.setProperty('--kb', open ? lost + 'px' : '0px');
    root.classList.toggle('kb-open', open);
    if (open) keepVisible(win.document.activeElement, h);
  }
  const schedule = () => { if (!raf) raf = win.requestAnimationFrame(update); };

  function keepVisible(el, visibleH) {
    const r = el.getBoundingClientRect();
    const bar = win.document.querySelector('.sticky-action:not([hidden])');
    const barH = bar ? bar.getBoundingClientRect().height : 0;
    const limit = visibleH - barH - 12;
    // Montre l'intitulé avec le champ.
    const label = el.id ? win.document.querySelector(`label[for="${el.id}"]`) : null;
    const top = label ? Math.min(label.getBoundingClientRect().top, r.top) : r.top;
    const bottom = el.tagName === 'TEXTAREA' ? Math.min(r.bottom, top + 96) : r.bottom;
    let scroller = el.parentElement;
    while (scroller && scroller !== win.document.body) {
      const s = win.getComputedStyle(scroller);
      if (/(auto|scroll)/.test(s.overflowY) && scroller.scrollHeight > scroller.clientHeight) break;
      scroller = scroller.parentElement;
    }
    if (!scroller || scroller === win.document.body) scroller = win.document.scrollingElement;
    if (bottom > limit) scroller.scrollBy({ top: bottom - limit, behavior: 'smooth' });
    else if (top < 8) scroller.scrollBy({ top: top - 16, behavior: 'smooth' });
  }

  vv?.addEventListener('resize', schedule);
  vv?.addEventListener('scroll', schedule);
  win.addEventListener('resize', schedule);
  win.document.addEventListener('focusin', () => setTimeout(schedule, 50));
  win.document.addEventListener('focusout', () => setTimeout(schedule, 50));
  win.document.addEventListener('input', (e) => { if (e.target.tagName === 'TEXTAREA') schedule(); });

  // Touche Entrée : « Suivant » passe au champ d'après, « OK » sur le dernier ferme le clavier.
  win.document.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || e.defaultPrevented || e.isComposing) return;
    const el = e.target;
    if (el.tagName !== 'INPUT' || el.dataset.enter === 'keep') return;
    const scope = el.closest('form, .sheet, .page') || win.document.body;
    const fields = [...scope.querySelectorAll('input:not([type=hidden]):not([disabled]), textarea:not([disabled]), select:not([disabled])')].filter((f) => f.offsetParent !== null);
    const i = fields.indexOf(el);
    if (i >= 0 && i < fields.length - 1) {
      e.preventDefault();
      fields[i + 1].focus();
    } else if (!el.form) {
      e.preventDefault();
      el.blur();
    }
  });
  update();
  return update;
}

// Pose les bons attributs de saisie selon le type de champ.
export const inputKinds = {
  number: { inputMode: 'decimal', enterKeyHint: 'next', autoComplete: 'off' },
  int: { inputMode: 'numeric', pattern: '[0-9]*', enterKeyHint: 'next', autoComplete: 'off' },
  email: { type: 'email', inputMode: 'email', autoCapitalize: 'off', autoCorrect: 'off', spellCheck: false, enterKeyHint: 'next' },
  name: { autoCapitalize: 'words', autoCorrect: 'off', spellCheck: false, enterKeyHint: 'next' },
  search: { type: 'search', inputMode: 'search', enterKeyHint: 'search', autoCorrect: 'off' },
  text: { enterKeyHint: 'next' },
  tel: { type: 'tel', inputMode: 'tel', enterKeyHint: 'next' },
};
