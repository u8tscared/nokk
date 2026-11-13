// Nokk · landing : animations, écrans qui défilent, partage et parrainage.
(function () {
  'use strict';
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var params = new URLSearchParams(location.search);

  // ——— Parrainage : ?ref=CODE (compte de l'app) et ?de=Prénom&c=Caserne (lien personnalisé) ———
  var ref = (params.get('ref') || '').replace(/[^\w-]/g, '').slice(0, 40);
  try {
    if (ref) sessionStorage.setItem('nokk:ref', ref);
    else ref = sessionStorage.getItem('nokk:ref') || '';
  } catch (e) {}
  $$('[data-app]').forEach(function (a) {
    var q = ref ? '?ref=' + encodeURIComponent(ref) : '';
    var m = a.getAttribute('data-app');
    a.href = '../' + q + (/^demo(-pompier|-caserne)?$/.test(m) ? '#' + m : '');
  });

  var de = (params.get('de') || '').trim().slice(0, 30);
  var cs = (params.get('c') || '').trim().slice(0, 40);
  var banner = $('#referral');
  if (de && banner) {
    $('#ref-who').textContent = de;
    $('#ref-where').textContent = cs ? '(' + cs + ')' : '';
    banner.hidden = false;
    $('.referral-x', banner).addEventListener('click', function () { banner.hidden = true; });
  }

  // ——— Barre de lecture + nav qui se fige ———
  var nav = $('.nav'), bar = $('.progress span'), mcta = $('.mobile-cta');
  var heroEnd = 0;
  function onScroll() {
    var y = scrollY, h = document.documentElement.scrollHeight - innerHeight;
    bar.style.setProperty('--p', h > 0 ? (y / h).toFixed(4) : 0);
    nav.classList.toggle('scrolled', y > 12);
    if (mcta) mcta.classList.toggle('on', y > heroEnd && y < h - 600);
    stepsOnScroll();
  }
  addEventListener('scroll', onScroll, { passive: true });
  addEventListener('resize', function () { heroEnd = ($('.hero') || {}).offsetHeight * 0.7 || 600; onScroll(); });
  heroEnd = ($('.hero') || {}).offsetHeight * 0.7 || 600;

  // ——— Révélations ———
  var io = 'IntersectionObserver' in window ? new IntersectionObserver(function (es) {
    es.forEach(function (e) {
      if (!e.isIntersecting) return;
      e.target.classList.add('in');
      $$('.count', e.target).forEach(countUp);
      io.unobserve(e.target);
    });
  }, { rootMargin: '0px 0px -12% 0px', threshold: 0.08 }) : null;
  $$('.reveal, .card, .dash-wrap, .off-demo').forEach(function (el, i) {
    if (el.closest('.hero')) return;
    if (!io) { el.classList.add('in'); return; }
    // petit décalage entre voisins
    var sib = el.parentElement ? Array.prototype.indexOf.call(el.parentElement.children, el) : 0;
    if (el.classList.contains('reveal') && !el.style.getPropertyValue('--d')) el.style.setProperty('--d', Math.min(sib, 6) * 0.06 + 's');
    io.observe(el);
  });

  function fmt(n) { return Math.round(n).toLocaleString('fr-FR').replace(/ | /g, ' '); }
  function countUp(el) {
    if (el.dataset.done) return;
    el.dataset.done = 1;
    var to = +el.dataset.to;
    if (reduce || !to) { el.textContent = fmt(to); return; }
    var t0 = performance.now(), dur = 1600;
    (function tick(t) {
      var k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 4);
      el.textContent = fmt(to * e);
      if (k < 1) requestAnimationFrame(tick);
    })(t0);
  }

  // ——— Hero : téléphone qui fait une vraie tournée ———
  (function hero() {
    var svg = $('.hmap'); if (!svg) return;
    var route = $('#h-route'), g = $('#h-doors'), me = $('#h-me'), halo = $('#h-me-halo');
    var NS = 'http://www.w3.org/2000/svg';
    var L = route.getTotalLength(), step = 13, doors = [];
    for (var d = 6, side = 1; d < L - 4; d += step, side = -side) {
      var p = route.getPointAtLength(d), q = route.getPointAtLength(Math.min(L, d + 1));
      var dx = q.x - p.x, dy = q.y - p.y, n = Math.hypot(dx, dy) || 1;
      var c = document.createElementNS(NS, 'circle');
      c.setAttribute('cx', (p.x - dy / n * 8 * side).toFixed(1));
      c.setAttribute('cy', (p.y + dx / n * 8 * side).toFixed(1));
      c.setAttribute('r', 4.6);
      c.setAttribute('class', 'door');
      c.setAttribute('stroke', '#fff');
      c.setAttribute('stroke-width', 2);
      g.appendChild(c);
      doors.push(c);
    }
    var COL = { done: 'var(--st-done)', rep: 'var(--st-repasser)', no: '#5b6d71', todo: 'var(--paper)' };
    var streets = ['rue des Lilas', 'rue Pasteur', 'av. Foch', 'rue Victor-Hugo', 'bd Gambetta', 'rue Jean-Jaurès'];
    var amounts = [10, 15, 20, 10, 5, 15, 20, 10];
    var state, euro, idx, cycle = 0;
    function setDoor(i, s) { doors[i].setAttribute('fill', COL[s]); doors[i].style.stroke = s === 'todo' ? 'var(--ink)' : '#fff'; doors[i].setAttribute('stroke-opacity', s === 'todo' ? .55 : 1); }
    function reset() {
      euro = 495; idx = Math.floor(doors.length * 0.38);
      for (var i = 0; i < doors.length; i++) {
        var r = (i * 7919) % 100;
        setDoor(i, i < idx ? (r < 68 ? 'done' : r < 86 ? 'rep' : 'no') : 'todo');
      }
      paint();
    }
    function addr(i) { return (2 + i * 2) + ' ' + streets[Math.floor(i / 7) % streets.length]; }
    function paint() {
      $('#h-euro').textContent = fmt(euro);
      $('#h-done').textContent = 36 + (idx - Math.floor(doors.length * 0.38));
      $('#h-bar-g').style.width = (30 + (idx - Math.floor(doors.length * 0.38)) * 1.6) + '%';
      $('#h-num').textContent = 2 + idx * 2;
      $('#h-addr').textContent = addr(idx);
      var c = doors[Math.min(idx, doors.length - 1)];
      var x = +c.getAttribute('cx'), y = +c.getAttribute('cy');
      me.setAttribute('cx', x - 10); me.setAttribute('cy', y - 6);
      halo.setAttribute('cx', x - 10); halo.setAttribute('cy', y - 6);
    }
    reset();
    if (reduce) return;
    var sheet = $('#h-sheet'), scrim = $('#h-scrim'), ok = $('#h-ok'), toast = $('#h-toast'), btn = $('.m-tabs .door');
    var chips = $$('#h-amounts span');
    function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
    var visible = true;
    if ('IntersectionObserver' in window) new IntersectionObserver(function (e) { visible = e[0].isIntersecting; }).observe(svg);
    async function loop() {
      await wait(1800);
      for (;;) {
        if (!visible || document.hidden) { await wait(600); continue; }
        if (idx >= doors.length) { await wait(1200); reset(); continue; }
        var amount = amounts[cycle++ % amounts.length];
        var refused = cycle % 5 === 0;
        btn.classList.add('press'); await wait(160); btn.classList.remove('press');
        $('#h-sheet-addr').textContent = addr(idx);
        chips.forEach(function (c) { c.classList.remove('on'); });
        sheet.classList.add('on'); scrim.classList.add('on');
        await wait(950);
        if (!refused) {
          var chip = chips.filter(function (c) { return parseInt(c.textContent, 10) === amount; })[0];
          if (chip) chip.classList.add('on');
          ok.textContent = 'Valider · ' + amount + ' €';
          await wait(700);
          ok.classList.add('press'); await wait(160); ok.classList.remove('press');
        } else {
          var abs = $('.sheet-quick span', sheet); abs.style.background = 'var(--rim-2)'; await wait(500); abs.style.background = '';
        }
        sheet.classList.remove('on'); scrim.classList.remove('on');
        ok.textContent = 'Valider';
        setDoor(idx, refused ? 'rep' : 'done');
        doors[idx].classList.remove('pop'); void doors[idx].getBBox(); doors[idx].classList.add('pop');
        if (!refused) {
          euro += amount;
          toast.textContent = '+' + amount + ' €';
          toast.classList.remove('on'); void toast.offsetWidth; toast.classList.add('on');
        }
        idx++;
        paint();
        await wait(1500);
      }
    }
    loop();
  })();

  // ——— Inclinaison du téléphone et des cartes flottantes à la souris ———
  if (!reduce && matchMedia('(pointer: fine)').matches) {
    var hv = $('.hero-visual'), ph = $('[data-tilt]');
    hv && hv.addEventListener('pointermove', function (e) {
      var r = hv.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
      ph.style.transform = 'rotateY(' + (x * 10).toFixed(2) + 'deg) rotateX(' + (-y * 8).toFixed(2) + 'deg)';
      $$('[data-depth]', hv).forEach(function (c) { var k = +c.dataset.depth; c.style.transform = 'translate(' + (x * k).toFixed(1) + 'px,' + (y * k).toFixed(1) + 'px)'; });
    });
    hv && hv.addEventListener('pointerleave', function () { ph.style.transform = ''; $$('[data-depth]', hv).forEach(function (c) { c.style.transform = ''; }); });
  }

  // ——— Comment ça marche : l'écran suit l'étape lue ———
  var steps = $$('.step'), screens = $$('#how-screens .hs'), rail = $('.how-rail span');
  // Sur téléphone, chaque étape reçoit sa copie de l'écran.
  steps.forEach(function (s, i) {
    var slot = $('.step-phone', s); if (!slot || !screens[i]) return;
    var ph = document.createElement('div'); ph.className = 'phone'; ph.setAttribute('aria-hidden', 'true');
    var sc = document.createElement('div'); sc.className = 'screen';
    var clone = screens[i].cloneNode(true); clone.removeAttribute('data-screen'); clone.classList.add('clone');
    sc.appendChild(clone); ph.appendChild(sc); slot.appendChild(ph);
  });
  var cur = -1;
  function stepsOnScroll() {
    if (!steps.length) return;
    var mid = innerHeight * 0.55, best = 0;
    steps.forEach(function (s, i) { if (s.getBoundingClientRect().top < mid) best = i; });
    var first = steps[0].getBoundingClientRect(), last = steps[steps.length - 1].getBoundingClientRect();
    if (rail) rail.parentElement.style.setProperty('--rail', Math.max(0, Math.min(1, (mid - first.top) / (last.bottom - first.top))).toFixed(3));
    if (best === cur) return;
    cur = best;
    steps.forEach(function (s, i) { s.classList.toggle('on', i === best); });
    screens.forEach(function (sc, i) { sc.classList.toggle('on', i === best); });
    var cl = $$('.hs.clone', steps[best]); cl.forEach(function (c) { c.classList.add('on'); });
    $$('.count', screens[best]).forEach(function (el) { delete el.dataset.done; countUp(el); });
  }
  // Clones mobiles : animés quand ils sont visibles
  if ('IntersectionObserver' in window) {
    var io2 = new IntersectionObserver(function (es) { es.forEach(function (e) { e.target.classList.toggle('on', e.isIntersecting); }); }, { threshold: 0.3 });
    $$('.hs.clone').forEach(function (c) { io2.observe(c); });
  } else $$('.hs.clone').forEach(function (c) { c.classList.add('on'); });

  // ——— QR : planche A4 ———
  function qrSvg(text, opts) {
    if (typeof qrcode !== 'function') return '';
    var q = qrcode(0, (opts && opts.ec) || 'M'); q.addData(text); q.make();
    var n = q.getModuleCount(), m = (opts && opts.margin) != null ? opts.margin : 0, s = n + m * 2, d = '';
    for (var r = 0; r < n; r++) for (var c = 0; c < n; c++) if (q.isDark(r, c)) d += 'M' + (c + m) + ' ' + (r + m) + 'h1v1h-1z';
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + s + ' ' + s + '" shape-rendering="crispEdges"><rect width="' + s + '" height="' + s + '" fill="#fff"/><path d="' + d + '" fill="' + ((opts && opts.color) || '#12262a') + '"/></svg>';
  }
  function whenQr(fn) { if (typeof qrcode === 'function') fn(); else addEventListener('load', fn); }
  whenQr(function () {
    var grid = $('#a4-grid'); if (!grid) return;
    var html = '';
    for (var k = 0; k < 20; k++) html += '<span class="cell" style="--k:' + k + '">' + qrSvg('https://nokkapp.fr/r/S12-' + (1000 + k * 37).toString(36), { ec: 'L' }) + '</span>';
    grid.innerHTML = html;
  });

  // ——— QR : histoire en 3 temps, qui avance toute seule ———
  (function story() {
    var root = $('[data-story]'); if (!root) return;
    var tabs = $$('.story-tabs button', root), scenes = $$('.scene', root), prog = $('.story-progress', root);
    var i = 0, t = 0, DUR = 7000, last = 0, seen = false, paused = false;
    function show(n) {
      i = n; t = 0;
      tabs.forEach(function (b, k) { b.classList.toggle('on', k === n); b.setAttribute('aria-selected', k === n); });
      scenes.forEach(function (s, k) {
        if (k === n) { s.classList.remove('on'); void s.offsetWidth; s.classList.add('on'); } else s.classList.remove('on');
      });
      prog.style.setProperty('--i', n);
    }
    tabs.forEach(function (b, k) { b.addEventListener('click', function () { show(k); paused = true; prog.style.setProperty('--t', 1); }); });
    root.addEventListener('pointerenter', function () { paused = true; });
    root.addEventListener('pointerleave', function () { paused = false; });
    if ('IntersectionObserver' in window) new IntersectionObserver(function (e) { seen = e[0].isIntersecting; if (seen) last = performance.now(); }, { threshold: 0.35 }).observe(root);
    else seen = true;
    show(0);
    if (reduce) return;
    (function frame(now) {
      if (seen && !paused && !document.hidden) {
        t += Math.min(64, now - last);
        if (t >= DUR) show((i + 1) % scenes.length);
        prog.firstElementChild.style.transform = 'scaleX(' + (t / DUR).toFixed(3) + ')';
      }
      last = now;
      requestAnimationFrame(frame);
    })(performance.now());
  })();

  // ——— Partage : lien personnalisé + QR ———
  (function share() {
    var name = $('#sh-name'), place = $('#sh-cs'); if (!name) return;
    var base = new URL('./', location.href);
    base.search = ''; base.hash = '';
    var url = base.href;
    try { var saved = JSON.parse(localStorage.getItem('nokk:landing:share') || '{}'); name.value = saved.de || ''; place.value = saved.c || ''; } catch (e) {}
    function build() {
      var u = new URL(base.href);
      if (name.value.trim()) u.searchParams.set('de', name.value.trim());
      if (place.value.trim()) u.searchParams.set('c', place.value.trim());
      url = u.href;
      $('#sh-url').textContent = url.replace(/^https?:\/\//, '');
      var who = name.value.trim();
      var msg = (who ? 'Salut, c\'est ' + who + '. ' : '') + 'Regarde Nokk, l\'appli qu\'on utilise pour la tournée des calendriers : secteurs, parcours, caisse, et ça marche sans réseau. Gratuit toute cette saison : ';
      $('#sh-wa').href = 'https://wa.me/?text=' + encodeURIComponent(msg + url);
      $('#sh-sms').href = 'sms:?&body=' + encodeURIComponent(msg + url);
      $('#sh-mail').href = 'mailto:?subject=' + encodeURIComponent('Nokk, l\'appli pour la tournée des calendriers') + '&body=' + encodeURIComponent(msg + url);
      whenQr(function () { $('#sh-qr').innerHTML = qrSvg(url, { ec: 'H', margin: 0 }); });
      try { localStorage.setItem('nokk:landing:share', JSON.stringify({ de: name.value.trim(), c: place.value.trim() })); } catch (e) {}
    }
    name.addEventListener('input', build); place.addEventListener('input', build);
    $('#share-form').addEventListener('submit', function (e) { e.preventDefault(); });
    build();
    var copy = $('#sh-copy');
    copy.addEventListener('click', function () {
      function done() { copy.textContent = 'Copié ✓'; copy.classList.add('copied'); setTimeout(function () { copy.textContent = 'Copier'; copy.classList.remove('copied'); }, 1800); }
      if (navigator.clipboard) navigator.clipboard.writeText(url).then(done, function () { prompt('Copiez le lien :', url); });
      else prompt('Copiez le lien :', url);
    });
    var native = $('#sh-native');
    if (navigator.share) {
      native.hidden = false;
      native.addEventListener('click', function () { navigator.share({ title: 'Nokk', text: 'La tournée des calendriers, enfin simple.', url: url }).catch(function () {}); });
    }
    $('#sh-dl').addEventListener('click', function () {
      var svg = $('#sh-qr svg'); if (!svg) return;
      var img = new Image(), size = 1024;
      img.onload = function () {
        var cv = document.createElement('canvas'); cv.width = size; cv.height = size + 140;
        var x = cv.getContext('2d');
        x.fillStyle = '#fff'; x.fillRect(0, 0, cv.width, cv.height);
        x.imageSmoothingEnabled = false;
        x.drawImage(img, 64, 64, size - 128, size - 128);
        x.fillStyle = '#12262a'; x.font = '800 54px Archivo, Arial, sans-serif'; x.textAlign = 'center';
        x.fillText('nokk', size / 2, size + 20);
        x.font = '600 30px Figtree, Arial, sans-serif'; x.fillStyle = '#5b6d71';
        x.fillText('La tournée des calendriers, enfin simple', size / 2, size + 76);
        var a = document.createElement('a'); a.download = 'nokk-qr.png'; a.href = cv.toDataURL('image/png'); a.click();
      };
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(svg));
    });
  })();

  // ——— Avant / avec Nokk : glissière ———
  (function compare() {
    var el = $('#compare'); if (!el) return;
    var range = $('.cmp-range', el), touched = false, raf = 0;
    function set(v) { v = Math.max(0, Math.min(100, v)); el.style.setProperty('--x', v + '%'); range.value = Math.round(v); }
    function fromEvent(e) { var r = el.getBoundingClientRect(); return (e.clientX - r.left) / r.width * 100; }
    var dragging = false, sx = 0, sy = 0, decided = false;
    el.addEventListener('pointerdown', function (e) {
      touched = true; cancelAnimationFrame(raf); dragging = true; decided = e.pointerType === 'mouse'; sx = e.clientX; sy = e.clientY;
      if (decided) { set(fromEvent(e)); el.classList.add('drag'); el.setPointerCapture(e.pointerId); }
    });
    el.addEventListener('pointermove', function (e) {
      if (!dragging) return;
      if (!decided) {
        var dx = Math.abs(e.clientX - sx), dy = Math.abs(e.clientY - sy);
        if (dx < 6 && dy < 6) return;
        if (dy > dx) { dragging = false; return; }
        decided = true; el.classList.add('drag'); try { el.setPointerCapture(e.pointerId); } catch (_) {}
      }
      set(fromEvent(e));
    });
    function end(e) { if (dragging && !decided && e && e.type === 'pointerup') set(fromEvent(e)); dragging = false; el.classList.remove('drag'); }
    el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
    range.addEventListener('input', function () { touched = true; cancelAnimationFrame(raf); set(+range.value); });
    // Balayage de démonstration la première fois qu'on la voit
    if (reduce || !('IntersectionObserver' in window)) return;
    var ob = new IntersectionObserver(function (es) {
      if (!es[0].isIntersecting) return;
      ob.disconnect();
      var keys = [[0, 50], [700, 50], [1700, 88], [2900, 12], [4100, 50]], t0 = performance.now();
      (function tick(now) {
        if (touched) return;
        var t = now - t0, i = 1;
        while (i < keys.length && keys[i][0] < t) i++;
        if (i >= keys.length) { set(50); return; }
        var a = keys[i - 1], b = keys[i], k = (t - a[0]) / (b[0] - a[0]);
        k = k < .5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
        set(a[1] + (b[1] - a[1]) * k);
        raf = requestAnimationFrame(tick);
      })(t0);
    }, { threshold: 0.5 });
    ob.observe(el);
  })();

  // ——— Avis (feedback) ———
  (function feedback() {
    var dlg = $('#feedback'); if (!dlg) return;
    var API = 'https://nokk-api.marceau-ruis.workers.dev/feedback';
    var form = $('#fb-form'), msg = $('#fb-msg'), err = $('#fb-err'), send = $('#fb-send');
    var steps = $$('.fb-step', dlg);
    function show(name) { steps.forEach(function (s) { s.hidden = s.dataset.step !== name; }); }
    function open(e) {
      if (e) e.preventDefault();
      show('form'); err.hidden = true;
      try { var d = JSON.parse(localStorage.getItem('nokk:landing:feedback') || '{}'); if (d.message && !msg.value) msg.value = d.message; } catch (_) {}
      if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
      setTimeout(function () { msg.focus(); }, 60);
    }
    function close() { if (dlg.close) dlg.close(); else dlg.removeAttribute('open'); }
    $$('[data-feedback]').forEach(function (b) { b.addEventListener('click', open); });
    $('.fb-x', dlg).addEventListener('click', close);
    $$('[data-close]', dlg).forEach(function (b) { b.addEventListener('click', close); });
    dlg.addEventListener('click', function (e) { if (e.target === dlg) close(); });
    msg.addEventListener('input', function () { try { localStorage.setItem('nokk:landing:feedback', JSON.stringify({ message: msg.value })); } catch (_) {} });
    if (location.hash === '#avis') open();
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var fd = new FormData(form), text = (fd.get('message') || '').trim();
      if (!text) { msg.classList.remove('shake'); void msg.offsetWidth; msg.classList.add('shake'); msg.focus(); return; }
      var payload = { kind: fd.get('kind') || 'idee', message: text, page: 'landing', ua: navigator.userAgent.slice(0, 200) };
      if (fd.get('note')) payload.note = +fd.get('note');
      var contact = (fd.get('contact') || '').trim(); if (contact) payload.contact = contact;
      if (ref) payload.ref = ref;
      send.disabled = true; send.textContent = 'Envoi…'; err.hidden = true;
      fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
        .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json().catch(function () { return {}; }); })
        .then(function () {
          form.reset(); try { localStorage.removeItem('nokk:landing:feedback'); } catch (_) {}
          show('done');
        })
        .catch(function () {
          err.textContent = navigator.onLine === false
            ? 'Pas de réseau pour l\'instant. Votre message est gardé : réessayez dès que vous captez.'
            : 'L\'envoi n\'a pas marché. Votre message est gardé, réessayez dans un instant.';
          err.hidden = false;
        })
        .then(function () { send.disabled = false; send.textContent = 'Envoyer'; });
    });
  })();

  onScroll();
})();
