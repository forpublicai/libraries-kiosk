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

    function render(p) {
      var e = easeInOut(p);
      for (var i = 0; i < N; i++) {
        var s = poseFor(i);
        var x = lerp(s.x, 0, e), y = lerp(s.y, 0, e), z = lerp(s.z, 0, e);
        var ry = lerp(s.ry, 0, e), rx = lerp(s.rx, 0, e);
        // deeper panels fade a touch earlier; all gone by ~p=0.82
        var op = 1 - smooth(0.5, 0.82, p + s.d * 0.04);
        panels[i].style.transform =
          'translate(-50%,-50%) translate3d(' + x + 'px,' + y + 'px,' + z + 'px) rotateY(' + ry + 'deg) rotateX(' + rx + 'deg)';
        panels[i].style.opacity = op;
      }
      var dp = smooth(0.52, 0.96, p);
      device.style.opacity = dp;
      device.style.transform =
        'translate(-50%,-50%) translate3d(0,' + lerp(16, 0, dp) + 'px,0) rotateY(' + lerp(-10, 0, dp) + 'deg) scale(' + lerp(0.94, 1, dp) + ')';
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
      panels.forEach(function (p) { p.style.transform = ''; p.style.opacity = ''; });
      device.style.transform = ''; device.style.opacity = '';
    }
    function setup() {
      if (desktopMQ.matches && !reduceMotion) {
        heroPin.classList.add('is-pinned');
        window.addEventListener('scroll', onScroll, { passive: true });
        window.addEventListener('resize', onScroll);
        render(progress());
        playVids();
      } else {
        heroPin.classList.remove('is-pinned');
        window.removeEventListener('scroll', onScroll);
        window.removeEventListener('resize', onScroll);
        clearInline();
      }
    }
    if (desktopMQ.addEventListener) desktopMQ.addEventListener('change', setup);
    else if (desktopMQ.addListener) desktopMQ.addListener(setup);
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
