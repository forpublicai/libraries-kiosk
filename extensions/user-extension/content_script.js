(() => {
  const FRAME_ID = 'public-session-frame';
  const MINI_ID = 'public-session-mini';
  const CLOSE_ID = 'public-session-close';
  if (document.getElementById(FRAME_ID)) return;

  let lastHeight = 48;
  const isMin = () => { try { return sessionStorage.getItem('ppb:minimized') === '1'; } catch (_) { return false; } };
  const setMin = (v) => { try { sessionStorage.setItem('ppb:minimized', v ? '1' : '0'); } catch (_) {} };

  const setBodyOffset = (valuePx) => {
    if (!document.body) return;
    document.body.style.paddingTop = valuePx;
  };

  const showMini = () => {
    let mini = document.getElementById(MINI_ID);
    if (!mini) {
      mini = document.createElement('div');
      mini.id = MINI_ID;
      mini.style.cssText = 'position:fixed;top:0;left:0;right:0;height:4px;background:#ef3c24;z-index:2147483647;cursor:pointer;';
      mini.title = 'Click to show public session notice';
      mini.addEventListener('click', restore);
      document.body.appendChild(mini);
    }
  };

  const hideMini = () => {
    const mini = document.getElementById(MINI_ID);
    if (mini) {
      mini.removeEventListener('click', restore);
      mini.remove();
    }
  };

  const ensureFrame = () => {
    let frame = document.getElementById(FRAME_ID);
    if (!frame) {
      frame = document.createElement('iframe');
      frame.id = FRAME_ID;
      frame.title = 'Public session notice';
      frame.setAttribute('sandbox', 'allow-scripts');
      frame.style.cssText = 'position:fixed;top:0;left:0;width:100vw;z-index:2147483646;border:0;background:transparent;display:block;pointer-events:none;';
      const html = `<!doctype html><html><head><meta charset="utf-8" />
        <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\" />
        <style>
          :root{color-scheme:light dark}
          html,body{margin:0;padding:0;background:transparent}
          .ps-wrapper{display:flex;align-items:center;gap:12px;box-sizing:border-box;background:#ef3c24;color:#fff;padding:8px 12px;font:14px/1.4 system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;box-shadow:0 2px 6px rgba(0,0,0,.12)}
          .ps-text{margin:0}
        </style>
      </head><body>
        <div class="ps-wrapper"><span class="ps-text">This is a public session which is shared between multiple users. Please be mindful!</span></div>
        <script>
          const resize = () => {
            const h = document.body.firstElementChild?.getBoundingClientRect().height || 0;
            parent.postMessage({ type: 'psb-height', height: Math.round(h) }, '*');
            document.documentElement.style.height = h + 'px';
            document.body.style.height = h + 'px';
          };
          new ResizeObserver(resize).observe(document.body.firstElementChild);
          window.addEventListener('resize', resize, { passive:true });
          window.addEventListener('load', resize);
          resize();
        <\/script>
      </body></html>`;
      frame.srcdoc = html;
      document.body.appendChild(frame);
    }
    return frame;
  };

  const ensureClose = () => {
    let close = document.getElementById(CLOSE_ID);
    if (!close) {
      close = document.createElement('div');
      close.id = CLOSE_ID;
      close.style.position = 'fixed';
      close.style.top = '8px';
      close.style.right = '12px';
      close.style.zIndex = '2147483647';
      close.style.pointerEvents = 'auto';
      const root = close.attachShadow({ mode: 'closed' });
      const st = document.createElement('style');
      st.textContent = `.btn{background:transparent;border:0;color:#fff;font-size:18px;line-height:1;padding:4px 6px;cursor:pointer;font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;text-shadow:0 1px 2px rgba(0,0,0,.35)}.btn:hover{opacity:.85}`;
      const btn = document.createElement('button');
      btn.className = 'btn';
      btn.type = 'button';
      btn.textContent = '×';
      btn.setAttribute('aria-label', 'Hide public session banner');
      btn.addEventListener('click', minimize);
      root.appendChild(st);
      root.appendChild(btn);
      document.body.appendChild(close);
    }
    return close;
  };

  function minimize() {
    setMin(true);
    const frame = ensureFrame();
    const close = ensureClose();
    frame.style.display = 'none';
    showMini();
    setBodyOffset('4px');
    close.style.display = 'none';
  }

  function restore() {
    setMin(false);
    const frame = ensureFrame();
    const close = ensureClose();
    frame.style.display = 'block';
    frame.style.height = (lastHeight || 48) + 'px';
    hideMini();
    setBodyOffset(`${lastHeight || 48}px`);
    close.style.display = 'block';
  }

  function mount() {
    if (!document.body) return false;
    ensureFrame();
    ensureClose();

    // Size + action messages from iframe
    window.addEventListener('message', (ev) => {
      const data = ev && ev.data;
      if (!data) return;
      if (data.type === 'psb-height') {
        lastHeight = Math.max(0, Number(data.height) || 0) || 48;
        const frame = document.getElementById(FRAME_ID);
        if (frame && !isMin()) {
          frame.style.height = lastHeight + 'px';
          setBodyOffset(`${lastHeight}px`);
        }
      }
    });

    // Initial state
    if (isMin()) {
      minimize();
    } else {
      restore();
    }
    return true;
  }

  if (!document.body) {
    const mo = new MutationObserver(() => { if (mount()) mo.disconnect(); });
    mo.observe(document.documentElement, { childList: true, subtree: true });
    document.addEventListener('DOMContentLoaded', () => mount(), { once: true });
  } else {
    mount();
  }
})();
