(() => {
  const BANNER_ID = 'public-session-banner';
  const MINI_ID = 'public-session-mini';
  if (document.getElementById(BANNER_ID)) return;

  const banner = document.createElement('div');
  banner.id = BANNER_ID;

  const shadow = banner.attachShadow({ mode: 'closed' });
  const style = document.createElement('style');
  style.textContent = `
    .ps-wrapper{display:flex;align-items:center;justify-content:space-between;gap:12px;background:#ef3c24;color:#fff;padding:8px 12px;font-family:Segoe UI, Roboto, Arial, sans-serif;box-shadow:0 2px 6px rgba(0,0,0,0.12);}
    .ps-text{font-size:14px;margin:0}
    .ps-close{background:transparent;border:0;font-size:18px;cursor:pointer;color:inherit;line-height:1;padding:4px 6px}
    .ps-close:hover{opacity:0.85}
  `;

  const wrapper = document.createElement('div');
  wrapper.className = 'ps-wrapper';

  const message = document.createElement('span');
  message.className = 'ps-text';
  // initial text will be replaced when remaining count arrives
  message.textContent = 'Shared public session – calculating remaining…';

  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'ps-close';
  close.setAttribute('aria-label', 'Hide public session banner');
  close.textContent = '×';

  wrapper.appendChild(message);
  wrapper.appendChild(close);

  shadow.appendChild(style);
  shadow.appendChild(wrapper);

  document.documentElement.prepend(banner);

  const mini = document.createElement('div');
  mini.id = MINI_ID;
  mini.style.display = 'none';

  const attachMini = () => {
    if (mini.isConnected) return;
    if (document.body) {
      document.body.appendChild(mini);
    } else {
      document.addEventListener('DOMContentLoaded', attachMini, { once: true });
    }
  };
  attachMini();

  const setPadding = (value) => {
    try { document.documentElement.style.paddingTop = value; } catch (_) {}
  };

  const measureHeight = () => {
    const rect = banner.getBoundingClientRect();
    return Math.round(rect.height || 44);
  };

  const storeState = (value) => { try { sessionStorage.setItem('ppb:minimized', value ? '1' : '0'); } catch (_) {} };
  const readState = () => { try { return sessionStorage.getItem('ppb:minimized') === '1'; } catch (_) { return false; } };

  const applyPaddingFromBanner = () => {
    const height = measureHeight();
    setPadding(`${height}px`);
  };

  const updateBannerRemaining = (remaining, limit) => {
    try {
      const pct = Math.max(0, Math.min(1, remaining / limit));
      message.textContent = `This is a public session which is shared between multiple users. Please be mindful! Public session: ${remaining} / ${limit} chars left`;
      // Optional: subtle gradient indicating usage
      wrapper.style.background = `linear-gradient(to right,#ef3c24 ${Math.round((1-pct)*100)}%,#ef3c24)`;
    } catch (_) {}
  };

  let blocked = false;

  const showBanner = () => {
    attachMini();
    banner.style.display = 'block';
    mini.style.display = 'none';
    requestAnimationFrame(applyPaddingFromBanner);
    storeState(false);
  };

  const hideBanner = () => {
    banner.style.display = 'none';
    mini.style.display = 'block';
    setPadding('4px');
    storeState(true);
  };

  close.addEventListener('click', hideBanner);
  mini.addEventListener('click', showBanner);

  const minimized = readState();
  if (minimized) hideBanner(); else showBanner();
  requestAnimationFrame(applyPaddingFromBanner);

  // Character counting listeners (only if not blocked)
  const sendChars = (n) => { if (blocked || n <= 0) return; try { chrome.runtime.sendMessage({ type: 'ps_chars', chars: n }); } catch (_) {} };

  const onBeforeInput = (e) => {
    if (blocked) return;
    // beforeinput with data counts inserted characters; ignore deletions
    if (e.data && e.data.length) sendChars(e.data.length);
    // inputType paste fallback
    else if (e.inputType && e.inputType.startsWith('insertFromPaste')) {
      const len = e.data?.length || 0;
      if (len) sendChars(len);
    }
  };
  const onCompositionEnd = (e) => { if (!blocked && e.data) sendChars(e.data.length); };
  const onKeydown = (e) => {
    if (blocked) return;
    if (e.key && e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) sendChars(1);
  };
  document.addEventListener('beforeinput', onBeforeInput, true);
  document.addEventListener('compositionend', onCompositionEnd, true);
  document.addEventListener('keydown', onKeydown, true);

  // Request initial state
  try { chrome.runtime.sendMessage({ type: 'ps_request_state' }, (resp) => {
    if (!resp) return;
    updateBannerRemaining(resp.remaining, resp.limit);
    if (resp.blocked) triggerBlock();
  }); } catch (_) {}

  // Blocking overlay
  let overlay;
  const triggerBlock = () => {
    if (blocked) return;
    blocked = true;
    hideBanner(); // banner not needed when fully blocked
    overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:#000;display:flex;align-items:center;justify-content:center;color:#fff;font-size:32px;font-family:Segoe UI,Roboto,Arial,sans-serif;';
    overlay.textContent = 'Public session limit reached. Close this window to reset.';
    document.documentElement.appendChild(overlay);
  };

  // Listen for background updates
  try { chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type === 'ps_remaining') updateBannerRemaining(msg.remaining, msg.limit);
    else if (msg?.type === 'ps_block') triggerBlock();
  }); } catch (_) {}

  window.addEventListener('resize', () => {
    if (banner.style.display !== 'none') applyPaddingFromBanner();
  });
})();
