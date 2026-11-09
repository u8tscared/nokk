import { signal } from '@preact/signals';
import { useEffect, useRef, useState } from 'preact/hooks';
import { Icon } from './icons.jsx';
import { feel } from '../lib/feedback.js';
import { sheets, closeSheet } from '../lib/nav.js';

// ——— Bouton ———
export function Button({ kind = '', icon, children, onClick, sound = 'tap', class: cls = '', ...rest }) {
  return (
    <button
      class={`btn ${kind} ${cls}`}
      onClick={(e) => { feel(sound); onClick?.(e); }}
      {...rest}
    >
      {icon && <Icon name={icon} />}
      {children}
    </button>
  );
}

export function IconButton({ icon, label, onClick, class: cls = '', ...rest }) {
  return (
    <button class={`icon-btn ${cls}`} aria-label={label} title={label} onClick={(e) => { feel('tap'); onClick?.(e); }} {...rest}>
      <Icon name={icon} />
    </button>
  );
}

export function Seg({ value, options, onChange, light, label }) {
  return (
    <div class={'seg' + (light ? ' light' : '')} role="group" aria-label={label}>
      {options.map((o) => (
        <button
          type="button"
          aria-pressed={value === o.value ? 'true' : 'false'}
          disabled={o.disabled}
          onClick={() => { if (o.disabled) return; feel('tick'); onChange(o.value); }}
          key={o.value}
        >
          {o.icon && <Icon name={o.icon} size={18} />}
          {o.label}
          {o.soon && <span class="badge-soon">Bientôt</span>}
        </button>
      ))}
    </div>
  );
}

export function DotIcon({ icon, tone = '', sm }) {
  return (
    <span class={`dot-ico ${sm ? 'sm' : ''} ${tone ? 'tone-' + tone : ''}`}>
      <Icon name={icon} />
    </span>
  );
}

export function Pill({ tone = '', icon, children }) {
  return (
    <span class={`pill ${tone ? 'tone-' + tone : ''}`}>
      {icon && <Icon name={icon} />}
      {children}
    </span>
  );
}

export function Avatar({ m, lg }) {
  if (!m) return null;
  const ini = m.name.split(/\s+/).map((s) => s[0]).join('').slice(0, 2).toUpperCase();
  return <span class={'avatar' + (lg ? ' lg' : '')} style={{ '--av': m.color || 'var(--accent)' }} title={m.name} aria-label={m.name}>{ini}</span>;
}

export function Empty({ icon, title, text, action }) {
  return (
    <div class="empty">
      <DotIcon icon={icon} />
      <h3 class="card-title">{title}</h3>
      {text && <p>{text}</p>}
      {action}
    </div>
  );
}

export function Field({ id, label, error, hint, children }) {
  return (
    <div class={'field' + (error ? ' has-err' : '')}>
      {label && <label for={id}>{label}</label>}
      {children}
      {error ? <div class="err" role="alert">{error}</div> : hint ? <div class="tiny muted">{hint}</div> : null}
    </div>
  );
}

export function shake(el) {
  if (!el) return;
  el.classList.remove('shake');
  void el.offsetWidth;
  el.classList.add('shake');
  feel('err');
}

// Chiffre qui grossit brièvement quand il change.
export function Bump({ value, children, class: cls = '' }) {
  const ref = useRef();
  const prev = useRef(value);
  useEffect(() => {
    if (prev.current !== value && ref.current) {
      ref.current.classList.remove('bump');
      void ref.current.offsetWidth;
      ref.current.classList.add('bump');
    }
    prev.current = value;
  }, [value]);
  return <span ref={ref} class={cls} style={{ display: 'inline-block' }}>{children}</span>;
}

export function Progress({ parts, label }) {
  const total = parts.reduce((s, p) => s + p.value, 0) || 1;
  return (
    <div class="progress" role="img" aria-label={label}>
      {parts.filter((p) => p.value > 0).map((p) => (
        <span key={p.key} style={{ flexGrow: p.value / total, background: p.color }} />
      ))}
    </div>
  );
}

export function Stepper({ value, onChange, min = 0, max = 9999, step = 1, format = (v) => v, label }) {
  return (
    <div class="stepper" role="group" aria-label={label}>
      <IconButton icon="minus" label={'Moins'} onClick={() => { onChange(Math.max(min, value - step)); }} />
      <div class="val">{format(value)}</div>
      <IconButton icon="plus" label={'Plus'} onClick={() => { onChange(Math.min(max, value + step)); }} />
    </div>
  );
}

export function NumPad({ onKey }) {
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', ',', '0', '⌫'];
  return (
    <div class="numpad">
      {keys.map((k) => (
        <button type="button" key={k} aria-label={k === '⌫' ? 'Effacer' : k} onClick={() => { feel('tick'); onKey(k); }}>{k}</button>
      ))}
    </div>
  );
}

// ——— Toasts ———
export const toasts = signal([]);
let tid = 0;
export function toast(text, { undo, error, duration } = {}) {
  const id = ++tid;
  const t = { id, text, undo, error, out: false };
  toasts.value = [...toasts.value.filter((x) => !x.out).slice(-1).map((x) => ({ ...x, out: true })), t];
  setTimeout(() => { toasts.value = toasts.value.filter((x) => x.id === id || !x.out); }, 260);
  if (error) feel('err');
  const ms = duration || (error ? 3800 : undo ? 4200 : 2300);
  setTimeout(() => dismissToast(id), ms);
  return id;
}
export function dismissToast(id) {
  toasts.value = toasts.value.map((t) => (t.id === id ? { ...t, out: true } : t));
  setTimeout(() => { toasts.value = toasts.value.filter((t) => t.id !== id); }, 260);
}
export function Toasts() {
  return (
    <div class="toasts" role="status" aria-live="polite">
      {toasts.value.map((t) => (
        <div key={t.id} class={'toast' + (t.error ? ' error' : '') + (t.out ? ' out' : '')}>
          {!t.error && (
            <svg class="check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
          )}
          <span>{t.text}</span>
          {t.undo && (
            <button onClick={() => { t.undo(); feel('close'); dismissToast(t.id); }}>Annuler</button>
          )}
        </div>
      ))}
    </div>
  );
}

// ——— Confettis aux couleurs de la marque ———
export function confetti() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const c = document.createElement('canvas');
  c.className = 'confetti';
  const dpr = Math.min(2, devicePixelRatio || 1);
  c.width = innerWidth * dpr;
  c.height = innerHeight * dpr;
  document.body.appendChild(c);
  const g = c.getContext('2d');
  g.scale(dpr, dpr);
  const colors = ['#367a6d', '#d9554f', '#12262a', '#d39a3c', '#a7d3c6'];
  const parts = Array.from({ length: 90 }, () => ({
    x: innerWidth / 2 + (Math.random() - 0.5) * 80,
    y: innerHeight * 0.38,
    vx: (Math.random() - 0.5) * 12,
    vy: -Math.random() * 13 - 4,
    r: Math.random() * Math.PI,
    vr: (Math.random() - 0.5) * 0.4,
    w: 6 + Math.random() * 6,
    h: 4 + Math.random() * 4,
    c: colors[(Math.random() * colors.length) | 0],
  }));
  const t0 = performance.now();
  const frame = (t) => {
    const k = (t - t0) / 1500;
    g.clearRect(0, 0, innerWidth, innerHeight);
    for (const p of parts) {
      p.vy += 0.42; p.vx *= 0.985; p.x += p.vx; p.y += p.vy; p.r += p.vr;
      g.save(); g.globalAlpha = Math.max(0, 1 - k); g.translate(p.x, p.y); g.rotate(p.r); g.fillStyle = p.c;
      g.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); g.restore();
    }
    if (k < 1) requestAnimationFrame(frame);
    else c.remove();
  };
  requestAnimationFrame(frame);
}

// ——— Fenêtres du bas ———
function SheetView({ s, top, index }) {
  const ref = useRef();
  const [out, setOut] = useState(false);
  const drag = useRef(null);

  useEffect(() => {
    feel('sheet');
    const el = ref.current;
    const prevFocus = document.activeElement;
    // Focus dans la fenêtre.
    setTimeout(() => {
      const f = el?.querySelector('[data-autofocus]') || el?.querySelector('button, [href], input, select, textarea');
      if (f && !s.opts.noFocus) f.focus({ preventScroll: true });
    }, 60);
    return () => { feel('close'); prevFocus?.focus?.({ preventScroll: true }); };
  }, []);

  useEffect(() => {
    if (!top) return;
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); closeSheet(); }
      if (e.key === 'Tab') {
        const f = [...ref.current.querySelectorAll('button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])')].filter((x) => x.offsetParent !== null);
        if (!f.length) return;
        const first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [top]);

  // Se ferme en la tirant vers le bas, depuis la poignée ou les 72 px du haut.
  const onDown = (e) => {
    const el = ref.current;
    const rect = el.getBoundingClientRect();
    if (e.clientY - rect.top > 72 && !e.target.closest('.sheet-grip')) return;
    if (e.target.closest('button, input, select, textarea, a, label, .maplibregl-map')) return;
    drag.current = { y: e.clientY, t: performance.now(), h: rect.height, dy: 0 };
    el.classList.add('dragging');
    el.setPointerCapture?.(e.pointerId);
  };
  const onMove = (e) => {
    if (!drag.current) return;
    const dy = Math.max(0, e.clientY - drag.current.y);
    drag.current.dy = dy;
    ref.current.style.setProperty('--drag', dy + 'px');
  };
  const onUp = () => {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    const el = ref.current;
    el.classList.remove('dragging');
    const v = d.dy / Math.max(1, performance.now() - d.t);
    if (d.dy > d.h / 3 || (v > 0.6 && d.dy > 30)) {
      closeSheet();
    } else {
      el.classList.add('settle');
      el.style.setProperty('--drag', '0px');
      setTimeout(() => el.classList.remove('settle'), 380);
    }
  };

  return (
    <div class="sheet-layer" style={{ zIndex: 80 + index }} inert={!top ? '' : undefined}>
      <div class="sheet-scrim" onClick={() => closeSheet()} />
      <div
        ref={ref}
        class={'sheet' + (out ? ' out' : '') + (s.opts.class ? ' ' + s.opts.class : '')}
        role="dialog"
        aria-modal="true"
        aria-label={s.opts.label || 'Fenêtre'}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      >
        <div class="sheet-grip" aria-hidden="true" />
        <div class="sheet-body">{s.render({ close: () => closeSheet(s.id) })}</div>
      </div>
    </div>
  );
}

export function SheetHost() {
  const list = sheets.value;
  useEffect(() => {
    const app = document.querySelector('.app');
    if (!app) return;
    if (list.length) app.setAttribute('inert', '');
    else app.removeAttribute('inert');
  }, [list.length]);
  return (
    <>
      {list.map((s, i) => (
        <SheetView key={s.id} s={s} index={i} top={i === list.length - 1} />
      ))}
    </>
  );
}
