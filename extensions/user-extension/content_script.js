(() => {
  const FRAME_ID = 'public-session-frame';
  const MINI_ID = 'public-session-mini';
  if (document.getElementById(FRAME_ID)) return;

  let lastHeight = 48;
  const isMin = () => { try { return sessionStorage.getItem('ppb:minimized') === '1'; } catch (_) { return false; } };
  const setMin = (v) => { try { sessionStorage.setItem('ppb:minimized', v ? '1' : '0'); } catch (_) {} };

  const ensureMini = () => {
    let mini = document.getElementById(MINI_ID);
    if (!mini) {
      mini = document.createElement('div');
      mini.id = MINI_ID;
      mini.style.cssText = 'position:fixed;top:0;left:0;right:0;height:4px;background:#ef3c24;z-index:2147483647;cursor:pointer;display:none;';
      mini.title = 'Click to show public session notice';
      mini.addEventListener('click', restore);
      document.body.appendChild(mini);
    }
    return mini;
  };

  const ensureFrame = () => {
    let frame = document.getElementById(FRAME_ID);
    if (!frame) {
      frame = document.createElement('iframe');
      frame.id = FRAME_ID;
      frame.title = 'Public session notice';
      frame.setAttribute('sandbox', 'allow-scripts');
      frame.style.cssText = 'position:fixed;top:0;left:0;width:100vw;z-index:2147483647;border:0;background:transparent;display:block;pointer-events:auto;';
      const html = `<!doctype html><html><head><meta charset="utf-8" />
        <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\" />
        <style>
          :root{color-scheme:light dark}
          html,body{margin:0;padding:0;background:transparent}
          .ps-wrapper{display:flex;align-items:center;justify-content:space-between;gap:12px;box-sizing:border-box;background:#ef3c24;color:#fff;padding:8px 12px;font:14px/1.4 system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;box-shadow:0 2px 6px rgba(0,0,0,.12)}
          .ps-text{margin:0}
          .ps-x{background:transparent;border:0;color:inherit;font-size:18px;line-height:1;padding:4px 6px;cursor:pointer}
          .ps-x:hover{opacity:.85}
        </style>
      </head><body>
        <div class=\"ps-wrapper\"><span class=\"ps-text\">This is a public session which is shared between multiple users. Please be mindful!</span><button class=\"ps-x\" aria-label=\"Hide banner\">×</button></div>
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
          document.body.querySelector('.ps-x')?.addEventListener('click', () => parent.postMessage({ type: 'psb-minimize' }, '*'));
          resize();
        <\/script>
      </body></html>`;
      frame.srcdoc = html;
      document.body.appendChild(frame);
    }
    return frame;
  };

  function minimize() {
    setMin(true);
    const frame = ensureFrame();
    const mini = ensureMini();
    frame.style.display = 'none';
    mini.style.display = 'block';
  }

  function restore() {
    setMin(false);
    const frame = ensureFrame();
    const mini = ensureMini();
    frame.style.display = 'block';
    frame.style.height = (lastHeight || 48) + 'px';
    mini.style.display = 'none';
  }

  function mount() {
    if (!document.body) return false;
    ensureMini();
    ensureFrame();

    // Size + action messages from iframe
    window.addEventListener('message', (ev) => {
      const data = ev && ev.data;
      if (!data) return;
      if (data.type === 'psb-height') {
        lastHeight = Math.max(0, Number(data.height) || 0) || 48;
        const frame = document.getElementById(FRAME_ID);
        if (frame && !isMin()) frame.style.height = lastHeight + 'px';
      } else if (data.type === 'psb-minimize') {
        minimize();
      }
    });

    // Initial state
    if (isMin()) minimize(); else restore();
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
