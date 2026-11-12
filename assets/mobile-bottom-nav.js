(function () {
  const isNativeWebView = window.location.protocol === 'http:'
    && window.location.hostname === 'localhost'
    && window.location.port === '';
  if (!isNativeWebView || document.getElementById('sbrymsMobileNav')) return;

  const items = [
    {
      label: 'Home',
      page: 'face app.html',
      href: 'FACE APP.html',
      icon: '<path d="m3 10 9-7 9 7"></path><path d="M5 9v11h14V9"></path><path d="M9 20v-6h6v6"></path>'
    },
    {
      label: 'Dashboard',
      page: 'dashboard.html',
      href: 'dashboard.html',
      icon: '<rect x="3" y="3" width="7" height="8" rx="1"></rect><rect x="14" y="3" width="7" height="5" rx="1"></rect><rect x="14" y="12" width="7" height="9" rx="1"></rect><rect x="3" y="15" width="7" height="6" rx="1"></rect>'
    },
    {
      label: 'Team Meet',
      page: 'team-meet.html',
      href: 'team-meet.html',
      icon: '<rect x="2.5" y="5" width="14" height="14" rx="2.5"></rect><path d="m16.5 10 5-3v10l-5-3"></path><circle cx="7.5" cy="11" r="1.5"></circle><circle cx="12" cy="11" r="1.5"></circle><path d="M5.5 16v-1a2 2 0 0 1 4 0v1m.5 0v-1a2 2 0 0 1 4 0v1"></path>'
    },
    {
      label: 'Profile',
      page: 'profile.html',
      href: 'profile.html',
      icon: '<circle cx="12" cy="8" r="3.5"></circle><path d="M5 21a7 7 0 0 1 14 0"></path>'
    }
  ];

  const currentPage = decodeURIComponent(window.location.pathname.split('/').pop() || 'FACE APP.html').toLowerCase();
  const nav = document.createElement('nav');
  nav.id = 'sbrymsMobileNav';
  nav.className = 'sbryms-mobile-nav';
  nav.setAttribute('aria-label', 'Main navigation');
  nav.innerHTML = items.map((item) => {
    const active = item.page === currentPage;
    return `<a class="sbryms-mobile-nav-item${active ? ' active' : ''}" href="${item.href}"${active ? ' aria-current="page"' : ''}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${item.icon}</svg>
      <span>${item.label}</span>
    </a>`;
  }).join('');

  const style = document.createElement('style');
  style.textContent = `
    html.native-bottom-nav body {
      padding-bottom: calc(78px + env(safe-area-inset-bottom)) !important;
    }
    .sbryms-mobile-nav {
      position: fixed !important;
      right: 0 !important;
      bottom: 0 !important;
      left: 0 !important;
      z-index: 9999 !important;
      display: grid !important;
      grid-template-columns: repeat(4, minmax(0, 1fr)) !important;
      gap: 4px !important;
      padding: 8px 10px calc(8px + env(safe-area-inset-bottom)) !important;
      border-top: 1px solid rgba(255,255,255,.12) !important;
      background: rgba(5,12,25,.97) !important;
      box-shadow: 0 -8px 24px rgba(0,0,0,.24) !important;
      -webkit-backdrop-filter: blur(14px);
      backdrop-filter: blur(14px);
    }
    .sbryms-mobile-nav-item {
      display: flex !important;
      min-width: 0 !important;
      min-height: 48px !important;
      flex-direction: column !important;
      align-items: center !important;
      justify-content: center !important;
      gap: 4px !important;
      border-radius: 12px !important;
      color: #aebbd0 !important;
      font: 600 10px/1.1 'Segoe UI', sans-serif !important;
      text-align: center !important;
      text-decoration: none !important;
      -webkit-tap-highlight-color: transparent;
    }
    .sbryms-mobile-nav-item svg {
      display: block !important;
      width: 23px !important;
      height: 23px !important;
      flex: 0 0 auto !important;
      stroke: currentColor !important;
      fill: none !important;
    }
    .sbryms-mobile-nav-item.active {
      color: #5ed5bf !important;
      background: rgba(94,213,191,.1) !important;
    }
    @media (max-width: 700px) {
      html.native-bottom-nav .sidebar > .nav-label,
      html.native-bottom-nav .sidebar > .nav {
        display: none !important;
      }
    }
  `;
  document.documentElement.classList.add('native-bottom-nav');
  document.head.appendChild(style);
  document.body.appendChild(nav);
})();
