/* ═══════════════════════════════════════════════════════════════
   app.js — main orchestrator
   Owns: screen navigation, toast notifications, confirm dialog.
   Entry point: DOMContentLoaded at bottom of this file.
═══════════════════════════════════════════════════════════════ */

const App = (() => {

  const $ = id => document.getElementById(id);

  /* ══════════════════════════════════════════════════════
     SCREEN NAVIGATION
  ══════════════════════════════════════════════════════ */

  const SCREENS = ['home', 'meals', 'stats', 'profile'];

  const switchScreen = (name) => {
    if (!SCREENS.includes(name)) return;

    // Hide all screens
    SCREENS.forEach(s => {
      const el = $(`screen-${s}`);
      if (!el) return;
      el.classList.remove('screen--active');
      el.hidden = true;
    });

    // Show target screen with animation
    const target = $(`screen-${name}`);
    if (target) {
      target.hidden = false;
      target.classList.add('screen--active');
      // Trigger animation on next frame
      requestAnimationFrame(() => {
        target.style.animation = 'none';
        void target.offsetWidth;
        target.style.animation = '';
        target.style.animationName = 'screenIn';
      });
    }

    // Sync nav items
    document.querySelectorAll('.nav-item[data-screen]').forEach(btn => {
      const active = btn.dataset.screen === name;
      btn.classList.toggle('nav-item--active', active);
      btn.setAttribute('aria-selected', String(active));
    });

    // Scroll to top
    $('screen-canvas').scrollTo({ top: 0 });

    // Screen-specific data refresh
    if (name === 'home')    Meals.renderHomePreview();
    if (name === 'meals')   Meals.renderHistory();
    if (name === 'stats')   Stats.render();
    if (name === 'profile') Profile.render();
  };

  /* ══════════════════════════════════════════════════════
     TOAST NOTIFICATIONS
  ══════════════════════════════════════════════════════ */

  const showToast = (message, type = '') => {
    const container = $('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast${type ? ` toast--${type}` : ''}`;
    toast.textContent = message;
    toast.setAttribute('role', 'alert');
    container.appendChild(toast);

    // Auto-dismiss after 3 s
    setTimeout(() => {
      toast.classList.add('toast--exiting');
      toast.addEventListener('animationend', () => toast.remove(), { once: true });
      // Fallback removal
      setTimeout(() => toast.remove(), 400);
    }, 3000);
  };

  /* ══════════════════════════════════════════════════════
     CONFIRM DIALOG
  ══════════════════════════════════════════════════════ */

  let _confirmCallback = null;

  const showConfirm = (title, message, onConfirm) => {
    $('confirm-title').textContent   = title;
    $('confirm-message').textContent = message;
    _confirmCallback = onConfirm;
    $('confirm-dialog').hidden = false;
  };

  const closeConfirm = () => {
    $('confirm-dialog').hidden = true;
    _confirmCallback = null;
  };

  const initConfirmDialog = () => {
    $('confirm-cancel-btn').addEventListener('click', closeConfirm);
    $('confirm-ok-btn').addEventListener('click', () => {
      if (typeof _confirmCallback === 'function') _confirmCallback();
      closeConfirm();
    });
    // Close on backdrop click (the dialog-overlay itself)
    $('confirm-dialog').addEventListener('click', (e) => {
      if (e.target === $('confirm-dialog')) closeConfirm();
    });
    // Escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !$('confirm-dialog').hidden) closeConfirm();
    });
  };

  /* ══════════════════════════════════════════════════════
     BOTTOM NAVIGATION WIRING
  ══════════════════════════════════════════════════════ */

  const initNav = () => {
    document.querySelectorAll('.nav-item[data-screen]').forEach(btn => {
      btn.addEventListener('click', () => switchScreen(btn.dataset.screen));
    });

    $('fab-scan-btn').addEventListener('click', () => Camera.open());
  };

  /* ══════════════════════════════════════════════════════
     GLOBAL KEYBOARD SHORTCUTS
  ══════════════════════════════════════════════════════ */

  const initKeyboard = () => {
    document.addEventListener('keydown', (e) => {
      // Alt + number to jump to screen
      if (e.altKey) {
        const map = { '1': 'home', '2': 'meals', '3': 'stats', '4': 'profile' };
        if (map[e.key]) switchScreen(map[e.key]);
      }
    });
  };

  /* ══════════════════════════════════════════════════════
     MAIN INIT  (called after onboarding completes or on return visit)
  ══════════════════════════════════════════════════════ */

  const init = () => {
    // Initialise all modules
    Meals.init();
    Camera.init();
    Stats.init();
    Profile.init();

    // Wire navigation and dialogs
    initNav();
    initConfirmDialog();
    initKeyboard();

    // Initial render for the home screen
    Profile.render();
    Meals.renderHomePreview();
  };

  return { init, switchScreen, showToast, showConfirm };

})();


/* ══════════════════════════════════════════════════════════════
   BOOTSTRAP — runs after all modules are defined
══════════════════════════════════════════════════════════════ */

document.addEventListener('DOMContentLoaded', () => {

  // Apply stored dark mode before any render to prevent flash
  const settings = Storage.getSettings();
  if (settings?.darkMode) document.body.classList.add('dark-mode');

  if (Storage.isOnboarded()) {
    // Returning user — skip onboarding, show app
    document.getElementById('onboarding').hidden = true;
    document.getElementById('app').hidden        = false;
    App.init();
  } else {
    // First launch — show onboarding
    document.getElementById('onboarding').hidden = false;
    document.getElementById('app').hidden        = true;
    Onboarding.init();
  }

  // Render all static Lucide icons present in the DOM
  if (typeof lucide !== 'undefined') lucide.createIcons();

  // Register PWA service worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker
      .register('sw.js')
      .catch(err => console.warn('SW registration failed:', err));
  }

});