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
