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
    .ps-text{font-size:14px;margin:0;flex:1}
    .ps-actions{display:flex;align-items:center;gap:12px}
    .ps-link{color:#fff;font-size:14px;text-decoration:underline;font-weight:600}
    .ps-link:hover{opacity:0.85}
    .ps-close{background:transparent;border:0;font-size:18px;cursor:pointer;color:inherit;line-height:1;padding:4px 6px}
    .ps-close:hover{opacity:0.85}
  `;

  const wrapper = document.createElement('div');
  wrapper.className = 'ps-wrapper';

  const message = document.createElement('span');
  message.className = 'ps-text';
  message.textContent = 'This is a public session which is shared between multiple users. Please be mindful!';

  const actions = document.createElement('div');
  actions.className = 'ps-actions';

  const dashboardLink = document.createElement('a');
  dashboardLink.href = 'https://forpublicai.github.io/libraries-kiosk/';
  dashboardLink.target = '_blank';
  dashboardLink.rel = 'noopener noreferrer';
  dashboardLink.className = 'ps-link';
  dashboardLink.textContent = 'Dashboard';

  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'ps-close';
  close.setAttribute('aria-label', 'Hide public session banner');
  close.textContent = '×';

  actions.appendChild(dashboardLink);
  actions.appendChild(close);

  wrapper.appendChild(message);
  wrapper.appendChild(actions);

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
  if (minimized) {
    hideBanner();
  } else {
    showBanner();
    requestAnimationFrame(applyPaddingFromBanner);
  }

  window.addEventListener('resize', () => {
    if (banner.style.display !== 'none') applyPaddingFromBanner();
  });
})();
