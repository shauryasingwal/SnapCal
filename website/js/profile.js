/* ═══════════════════════════════════════════════════════════════
   profile.js — profile display, edit modal, settings panel
   Also owns: dark mode, export/import, clear/reset actions.
═══════════════════════════════════════════════════════════════ */

const Profile = (() => {

  const $ = id => document.getElementById(id);

  /* ── BMR / TDEE / goal re-calculation (mirrors onboarding.js) */

  const ACTIVITY_MULTIPLIERS = {
    sedentary:  1.2,
    lightly:    1.375,
    moderately: 1.55,
    very:       1.725,
  };

  const GOAL_ADJUSTMENTS = { lose: -500, maintain: 0, gain: 300 };

  const calcGoals = ({ weight, height, age, gender, activity, goal }) => {
    const base = (10 * weight) + (6.25 * height) - (5 * age);
    const bmr  = gender === 'male'   ? Math.round(base + 5)
               : gender === 'female' ? Math.round(base - 161)
               :                       Math.round(base - 78);
    const tdee     = Math.round(bmr * (ACTIVITY_MULTIPLIERS[activity] || 1.2));
    const calories = Math.max(1200, tdee + (GOAL_ADJUSTMENTS[goal] || 0));
    return {
      calories,
      protein:  Math.round((calories * 0.25) / 4),
      carbs:    Math.round((calories * 0.45) / 4),
      fat:      Math.round((calories * 0.30) / 9),
      bmr, tdee,
    };
  };

  /* ── Helpers ─────────────────────────────────────────── */

  const initials = (name = '') =>
    name.split(' ').map(w => w[0] || '').join('').slice(0, 2).toUpperCase() || 'SC';

  const greeting = () => {
    const h = new Date().getHours();
    return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  };

  /* ── Render profile data to DOM ──────────────────────── */

  const render = () => {
    const profile = Storage.getProfile();
    const goals   = Storage.getGoals();
    if (!profile) return;

    const ini = initials(profile.name);

    // Avatar initials (home header + profile screen)
    [$('home-avatar-initials'), $('profile-avatar-initials')].forEach(el => {
      if (el) el.textContent = ini;
    });

    // Home greeting
    $('home-greeting-time').textContent = greeting();
    $('home-greeting-name').textContent = profile.name?.split(' ')[0] || '—';

    // Profile hero
    $('profile-display-name').textContent = profile.name || '—';

    const joinedDate = profile.joinedAt
      ? new Date(profile.joinedAt).toLocaleDateString([], { month: 'long', year: 'numeric' })
      : '—';
    $('profile-display-joined').textContent = `Member since ${joinedDate}`;

    // Body metrics
    $('profile-metric-age').textContent    = profile.age    ? profile.age + ' yr'   : '—';
    $('profile-metric-height').textContent = profile.height ? profile.height + ' cm' : '—';
    $('profile-metric-weight').textContent = profile.weight ? profile.weight + ' kg' : '—';

    // Daily goals
    if (goals) {
      $('profile-goal-calories').textContent = `${goals.calories ?? '—'} kcal`;
      $('profile-goal-protein').textContent  = `${goals.protein  ?? '—'}g`;
      $('profile-goal-carbs').textContent    = `${goals.carbs    ?? '—'}g`;
      $('profile-goal-fat').textContent      = `${goals.fat      ?? '—'}g`;
    }

    // Dark mode toggle sync
    const settings = Storage.getSettings();
    const toggle   = $('toggle-dark-mode');
    const isDark   = !!settings.darkMode;
    toggle.setAttribute('aria-checked', String(isDark));
    toggle.classList.toggle('on', isDark);
  };

  /* ── Edit profile modal ──────────────────────────────── */

  const openEditModal = () => {
    const profile = Storage.getProfile();
    if (!profile) return;

    $('edit-name').value     = profile.name     || '';
    $('edit-age').value      = profile.age      || '';
    $('edit-weight').value   = profile.weight   || '';
    $('edit-height').value   = profile.height   || '';
    $('edit-gender').value   = profile.gender   || 'male';
    $('edit-activity').value = profile.activity || 'sedentary';

    // Goal choice cards
    document.querySelectorAll('[data-group="edit-goal"]').forEach(btn => {
      const on = btn.dataset.value === (profile.goal || 'maintain');
      btn.setAttribute('aria-checked', String(on));
      btn.classList.toggle('selected', on);
    });

    $('edit-profile-modal').hidden = false;
    setTimeout(() => $('edit-name').focus(), 320);
  };

  const closeEditModal = () => {
    $('edit-profile-modal').hidden = true;
  };

  const saveProfile = () => {
    const name     = $('edit-name').value.trim();
    const age      = parseInt($('edit-age').value, 10);
    const weight   = parseFloat($('edit-weight').value);
    const height   = parseFloat($('edit-height').value);
    const gender   = $('edit-gender').value;
    const activity = $('edit-activity').value;
    const goalBtn  = document.querySelector('[data-group="edit-goal"][aria-checked="true"]');
    const goal     = goalBtn?.dataset.value || 'maintain';

    if (!name)                   { App.showToast('Name is required', 'warning');            return; }
    if (!age || age < 10)        { App.showToast('Enter a valid age (10–100)', 'warning');  return; }
    if (!height || height < 100) { App.showToast('Enter a valid height (cm)', 'warning');   return; }
    if (!weight || weight < 30)  { App.showToast('Enter a valid weight (kg)', 'warning');   return; }

    const existing = Storage.getProfile() || {};
    const updated  = { ...existing, name, age, weight, height, gender, activity, goal };

    Storage.setProfile(updated);
    Storage.setGoals(calcGoals(updated));

    closeEditModal();
    render();
    Meals.renderHomePreview(); // goals changed → refresh ring/bars
    App.showToast('Profile updated ✓', 'success');
  };

  /* ── Dark mode ───────────────────────────────────────── */

  const applyDarkMode = (on) => {
    document.body.classList.toggle('dark-mode', on);
    const toggle = $('toggle-dark-mode');
    toggle.setAttribute('aria-checked', String(on));
    toggle.classList.toggle('on', on);
    Storage.setSettings({ ...Storage.getSettings(), darkMode: on });
  };

  const initDarkMode = () => {
    // Apply persisted preference immediately
    const { darkMode } = Storage.getSettings();
    if (darkMode) document.body.classList.add('dark-mode');

    $('toggle-dark-mode').addEventListener('click', () => {
      const current = $('toggle-dark-mode').getAttribute('aria-checked') === 'true';
      applyDarkMode(!current);
    });
  };

  /* ── Settings actions ────────────────────────────────── */

  const initSettings = () => {

    // ── Export
    $('export-data-btn').addEventListener('click', () => {
      const json = JSON.stringify(Storage.exportAll(), null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = `snapcal-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      App.showToast('Data exported ✓', 'success');
    });

    // ── Import
    $('import-data-btn').addEventListener('click', () => {
      $('import-file-input').click();
    });

    $('import-file-input').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const data = JSON.parse(ev.target.result);
          if (!Storage.importAll(data)) throw new Error('invalid');
          render();
          Meals.renderHomePreview();
          Meals.renderHistory();
          App.showToast('Data imported ✓', 'success');
        } catch {
          App.showToast('Invalid backup file', 'error');
        }
      };
      reader.readAsText(file);
      e.target.value = '';
    });

    // ── Clear meals
    $('clear-meals-btn').addEventListener('click', () => {
      App.showConfirm(
        'Clear All Meals',
        'All logged meals will be permanently deleted. Your profile and goals are kept.',
        () => {
          Storage.clearMeals();
          Meals.renderHomePreview();
          Meals.renderHistory();
          App.showToast('All meals cleared');
        }
      );
    });

    // ── Reset app
    $('reset-app-btn').addEventListener('click', () => {
      App.showConfirm(
        'Reset App',
        'This will erase your profile, all meals, and settings. This cannot be undone.',
        () => {
          Storage.reset();
          location.reload();
        }
      );
    });
  };

  /* ── Init ────────────────────────────────────────────── */

  const init = () => {
    initDarkMode();
    initSettings();

    // Edit modal triggers
    $('edit-profile-btn').addEventListener('click',         openEditModal);
    $('close-edit-profile-btn').addEventListener('click',   closeEditModal);
    $('edit-profile-backdrop').addEventListener('click',    closeEditModal);
    $('save-profile-btn').addEventListener('click',         saveProfile);

    // Home avatar → go to profile
    $('home-avatar-btn').addEventListener('click', () => App.switchScreen('profile'));

    // Edit-goal choice cards
    document.querySelectorAll('[data-group="edit-goal"]').forEach(card => {
      card.addEventListener('click', () => {
        document.querySelectorAll('[data-group="edit-goal"]').forEach(c => {
          c.setAttribute('aria-checked', 'false');
          c.classList.remove('selected');
        });
        card.setAttribute('aria-checked', 'true');
        card.classList.add('selected');
      });
    });

    // Escape to close edit modal
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !$('edit-profile-modal').hidden) closeEditModal();
    });

    // Enter to save from form fields
    ['edit-name','edit-age','edit-weight','edit-height'].forEach(id => {
      $(id).addEventListener('keydown', e => { if (e.key === 'Enter') saveProfile(); });
    });
  };

  return { init, render };

})();
