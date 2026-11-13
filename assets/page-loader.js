(() => {
  if (window.__sbrymsPageLoaderInstalled) return;
  window.__sbrymsPageLoaderInstalled = true;

  const styles = document.createElement('style');
  styles.textContent = `
    .sbryms-page-loader {
      position: fixed;
      z-index: 2147483647;
      inset: 0;
      display: grid;
      place-items: center;
      background: rgba(2, 4, 7, .82);
      -webkit-backdrop-filter: blur(8px);
      backdrop-filter: blur(8px);
      animation: sbryms-loader-in .14s ease-out both;
    }
    .sbryms-page-loader-mark {
      position: relative;
      width: 82px;
      height: 58px;
      overflow: hidden;
      filter: drop-shadow(0 0 12px rgba(233, 168, 58, .2));
    }
    .sbryms-page-loader-mark img,
    .sbryms-page-loader-shine {
      position: absolute;
      inset: 0;
      display: block;
      width: 100%;
      height: 100%;
      object-fit: contain;
    }
    .sbryms-page-loader-shine {
      background: linear-gradient(110deg, transparent 30%, rgba(255,255,255,.92) 49%, transparent 68%);
      -webkit-mask: url('/assets/page-loader-mark.svg') center / contain no-repeat;
      mask: url('/assets/page-loader-mark.svg') center / contain no-repeat;
      animation: sbryms-loader-shine 1.35s ease-in-out infinite;
    }
    @keyframes sbryms-loader-in {
      from { opacity: 0; }
      to { opacity: 1; }
    }
    @keyframes sbryms-loader-shine {
      from { transform: translateX(-115%); }
      to { transform: translateX(115%); }
    }
    @media (prefers-reduced-motion: reduce) {
      .sbryms-page-loader-shine { animation-duration: 2.7s; }
    }
  `;
  document.head.appendChild(styles);

  let loader;
  let navigationStarting = false;
  const showLoader = () => {
    if (navigationStarting || document.documentElement.classList.contains('native-auth-pending')) return;
    navigationStarting = true;
    loader = document.createElement('div');
    loader.className = 'sbryms-page-loader';
    loader.setAttribute('role', 'status');
    loader.setAttribute('aria-label', 'Loading next page');
    loader.innerHTML = '<div class="sbryms-page-loader-mark"><img src="/assets/page-loader-mark.svg" alt=""><span class="sbryms-page-loader-shine" aria-hidden="true"></span></div>';
    document.body.appendChild(loader);
  };

  document.addEventListener('click', event => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const anchor = event.target instanceof Element ? event.target.closest('a[href]') : null;
    if (!anchor || anchor.target && anchor.target !== '_self' || anchor.hasAttribute('download')) return;
    const target = new URL(anchor.href, window.location.href);
    if (target.origin !== window.location.origin
        || target.href === window.location.href
        || (target.pathname === window.location.pathname && target.search === window.location.search)) return;
    showLoader();
  }, true);

  window.addEventListener('beforeunload', showLoader);
  window.addEventListener('pageshow', () => {
    navigationStarting = false;
    if (loader) {
      loader.remove();
      loader = null;
    }
  });
})();
