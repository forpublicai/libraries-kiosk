/* Public AI for Libraries — landing interactions
   No dependencies. Progressive enhancement only. */
(function () {
  'use strict';

  var reduceMotion = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- Mobile nav ---------- */
  var toggle = document.querySelector('.nav__toggle');
  var links = document.querySelector('.nav__links');
  if (toggle && links) {
    function closeNav() {
      links.classList.remove('open');
      toggle.setAttribute('aria-expanded', 'false');
    }
    toggle.addEventListener('click', function () {
      var open = links.classList.toggle('open');
      toggle.setAttribute('aria-expanded', String(open));
    });
    links.querySelectorAll('a').forEach(function (a) {
      a.addEventListener('click', closeNav);
    });
    // Close on Escape
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && links.classList.contains('open')) {
        closeNav();
        toggle.focus();
      }
    });
    // Close when clicking outside the menu
    document.addEventListener('click', function (e) {
      if (links.classList.contains('open') &&
          !links.contains(e.target) && !toggle.contains(e.target)) {
        closeNav();
      }
    });
    // Reset when growing back to desktop width
    window.addEventListener('resize', function () {
      if (window.innerWidth > 1000) closeNav();
    });
  }

  /* ---------- Scroll reveal ---------- */
  var reveals = Array.prototype.slice.call(document.querySelectorAll('.reveal'));
  if (reduceMotion || !('IntersectionObserver' in window)) {
    reveals.forEach(function (el) { el.classList.add('in'); });
  } else {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('in');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });
    reveals.forEach(function (el) { io.observe(el); });
  }

  /* ---------- Kiosk 3D deck: scroll-scrubbed collapse into the kiosk UI ---------- */
  var heroPin = document.getElementById('heroPin');
  var deck = document.getElementById('kioskDeck');
  var device = document.getElementById('kioskDevice');
  if (heroPin && deck && device) {
    var panels = Array.prototype.slice.call(deck.querySelectorAll('.panel'));
    var N = panels.length;
    var vids = Array.prototype.slice.call(deck.querySelectorAll('.panel__vid'));
    var desktopMQ = window.matchMedia('(min-width:1001px)');
    var ticking = false;
    var ENDS = null; // per-panel landing target (its matching card slot)

    var ENDS = null; // per-panel landing target (its matching card slot)
    
    // Start = the same card layout but each panel larger, slightly tilted and
    // nudged so they overlap into a collage; then they settle onto their cards.
    var START_MULT = 1.42;          // how much bigger than the final card the panel starts
    var START_Z = 46;               // a touch of depth at the start
    var ROT = [-5, 4, -6, 5, -4];   // start rotateY per panel (video,code,music,chat,images)
    var RZ = [-3, 2, -4, 3, -2];    // start in-plane tilt per panel
    // start nudge off card centre [x,y] per panel (video,code,music,chat,images)
    // top row (code/music/chat) starts well up to fill the space above the collage
    var OFF = [[-220, -8], [14, -360], [22, -172], [-140, -204], [120, -250]];

    
    function playVids() {
      vids.forEach(function (v) {
        var p = v.play && v.play();
        if (p && p.catch) p.catch(function () {});
      });
    }

    function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }
    function lerp(a, b, t) { return a + (b - a) * t; }
    function easeInOut(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
    function smooth(a, b, t) { t = clamp((t - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }

    // depth: 0 = frontmost (images), N-1 = deepest (video)
    // Steeply rotated (~60°) so the panels read edge-on like a stack you look into;
    // deep Z spacing separates them so they no longer pile up flat.
    function poseFor(i) {
      var d = (N - 2) - i;
      return { x: -98 * d, y: -30 * d, z: -10 * d, ry: -58, rx: 4, d: d };
    }

    // Each panel's landing target = the centre of its matching service card,
    // measured (unscaled) relative to the screen's centre. So a layer ends up
    // exactly on its card in the Explore Services UI.
    function computeEnds() {
      panels.forEach(function (p) { p.style.height = ''; }); // measure natural height
      var dw = device.offsetWidth, dh = device.offsetHeight;
      ENDS = panels.map(function (panel) {
        var cap = panel.getAttribute('data-cap');
        var card = cap && device.querySelector('.kui__card[data-cap="' + cap + '"]');
        if (!card || !panel.offsetWidth || !dw) return { tx: 0, ty: 0, scale: 0.5, baseH: 0, cropH: 0 };
        var cx = card.offsetLeft + card.offsetWidth / 2;
        var cy = card.offsetTop + card.offsetHeight / 2;
        var scale = card.offsetWidth / panel.offsetWidth;
        var baseH = panel.offsetHeight;
        // height (pre-scale) that makes the panel end up exactly the card's height,
        // so a too-tall layer (the wide Videos one) crops to match the others
        var cropH = card.offsetHeight / scale;
        return { tx: cx - dw / 2, ty: cy - dh / 2, scale: scale, baseH: baseH, cropH: cropH };
      });
    }

    function render(p) {
      var e = easeInOut(p);
      for (var i = 0; i < N; i++) {

        var t = (ENDS && ENDS[i]) || { tx: 0, ty: 0, scale: 0.5 };
      // start pose: same card centre, bigger, tilted, nudged into a collage
        var sx = t.tx + OFF[i][0], sy = t.ty + OFF[i][1], ss = t.scale * START_MULT;
        var x = lerp(sx, t.tx, e), y = lerp(sy, t.ty, e), z = lerp(START_Z, 0, e);
        var ry = lerp(ROT[i], 0, e), rz = lerp(RZ[i], 0, e), rx = lerp(2, 0, e);
        var sc = lerp(ss, t.scale, e);
        panels[i].style.transform =
'translate(-50%,-50%) translate3d(' + x + 'px,' + y + 'px,' + z + 'px) rotateY(' + ry + 'deg) rotateX(' + rx + 'deg) rotateZ(' + rz + 'deg) scale(' + sc + ')';
        // crop tall layers (the wide Videos frame) down to the card's height as we near the merge
        if (t.cropH && t.baseH && t.cropH < t.baseH - 4) {
          panels[i].style.height = lerp(t.baseH, t.cropH, e) + 'px';
        }
        // hold opaque through the settle, then dissolve into the card
        panels[i].style.opacity = 1 - smooth(0.84, 1, p);
      }
      // the Explore Services screen materialises as the layers arrive
          var dp = smooth(0.72, 0.97, p);
      device.style.opacity = dp;
      device.style.transform = 'translate(-50%,-50%) scale(' + lerp(0.985, 1, dp) + ')';
    }

    function progress() {
      var rect = heroPin.getBoundingClientRect();
      var dist = heroPin.offsetHeight - window.innerHeight;
      if (dist <= 0) return 0;
      return clamp(-rect.top / dist, 0, 1);
    }
    function onScroll() {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(function () { render(progress()); ticking = false; });
    }
    function clearInline() {
      panels.forEach(function (p) { p.style.transform = ''; p.style.opacity = ''; p.style.height = ''; });
      device.style.transform = ''; device.style.opacity = '';
    }
    function recompute() {
      if (!heroPin.classList.contains('is-pinned')) return;
      computeEnds();
      render(progress());
    }
    function setup() {
      if (desktopMQ.matches && !reduceMotion) {
        heroPin.classList.add('is-pinned');
        computeEnds();
        window.addEventListener('scroll', onScroll, { passive: true });
        window.addEventListener('resize', recompute);
        render(progress());
        playVids();
      } else {
        heroPin.classList.remove('is-pinned');
        window.removeEventListener('scroll', onScroll);
        window.removeEventListener('resize', recompute);
        clearInline();
      }
    }
    if (desktopMQ.addEventListener) desktopMQ.addEventListener('change', setup);
    else if (desktopMQ.addListener) desktopMQ.addListener(setup);
    // card sizes can shift once fonts finish loading — re-measure then
    window.addEventListener('load', recompute);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(recompute);
    setup();
  }

  /* ---------- Operational state labels ---------- */
  var mapStates = Array.prototype.slice.call(document.querySelectorAll('.netmap__state'));
  if (mapStates.length) {
    function closeStates(except) {
      mapStates.forEach(function (state) {
        if (state !== except) state.classList.remove('is-open');
      });
    }

    mapStates.forEach(function (state) {
      function openState() {
        closeStates(state);
        state.classList.add('is-open');
      }
      function closeState() {
        state.classList.remove('is-open');
      }

      state.addEventListener('pointerenter', openState);
      state.addEventListener('pointerleave', closeState);
      state.addEventListener('focusin', openState);
      state.addEventListener('focusout', closeState);
      state.addEventListener('click', openState);
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeStates();
    });
  }

})();
