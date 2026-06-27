/* ═══════════════════════════════════════════════════════════════
   meals.js — meal CRUD, rendering, entry & detail modals
   Owns: home preview list, history list, entry modal, detail modal.
═══════════════════════════════════════════════════════════════ */

const Meals = (() => {

  let activeMealId = null; // tracks which meal is open in detail/edit

  const $ = id => document.getElementById(id);

  /* ── Date / time helpers ─────────────────────────────── */

  const todayStr = () => new Date().toISOString().slice(0, 10);

  const fmtTime = (iso) =>
    new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const fmtDate = (dateStr) => {
    const today = todayStr();
    const yest  = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    if (dateStr === today) return 'Today';
    if (dateStr === yest)  return 'Yesterday';
    return new Date(dateStr + 'T00:00:00').toLocaleDateString([], {
      weekday: 'long', month: 'short', day: 'numeric',
    });
  };

  const CAT_ICONS = {
    breakfast: 'sunrise',
    lunch:     'sun',
    dinner:    'moon',
    snack:     'apple',
  };

  const catIcon = (cat) =>
    `<i data-lucide="${CAT_ICONS[cat] || 'utensils'}" aria-hidden="true"></i>`;

  /* ── XSS guard ───────────────────────────────────────── */

  const esc = (str) =>
    String(str)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;')
      .replace(/>/g,'&gt;').replace(/"/g,'&quot;');

  /* ── Meal Preview Card (shared by home + history) ────── */

  const makeMealCard = (meal) => {
    const card = document.createElement('div');
    card.className = 'meal-preview-card';
    card.setAttribute('role', 'listitem');
    card.dataset.id = meal.id;

    const thumbHtml = meal.imageData
      ? `<img class="meal-preview-thumb" src="${meal.imageData}" alt="${esc(meal.name)}" loading="lazy">`
      : `<div class="meal-preview-thumb" aria-hidden="true">${catIcon(meal.category)}</div>`;

    card.innerHTML = `
      ${thumbHtml}
      <div class="meal-preview-info">
        <div class="meal-preview-name">${esc(meal.name)}</div>
        <div class="meal-preview-meta">${esc(meal.category)} · ${fmtTime(meal.timestamp)}</div>
      </div>
      <div>
        <div class="meal-preview-cal">${meal.calories ?? 0}</div>
        <div class="meal-preview-cal-unit">kcal</div>
      </div>
    `;

    card.addEventListener('click', () => openDetailModal(meal.id));
    return card;
  };

  /* ══════════════════════════════════════════════════════
     HOME SCREEN — ring + macros + today's meal list
  ══════════════════════════════════════════════════════ */

  const renderHomePreview = () => {
    const list    = $('home-meals-list');
    const empty   = $('home-empty-state');
    const meals   = Storage.getMealsForDate(todayStr());

    list.innerHTML = '';

    if (meals.length === 0) {
      list.hidden  = true;
      empty.hidden = false;
    } else {
      list.hidden  = false;
      empty.hidden = true;
      meals.forEach(m => list.appendChild(makeMealCard(m)));
    }

    updateHomeStats(meals);
    if (typeof lucide !== 'undefined') lucide.createIcons();
  };

  const updateHomeStats = (meals) => {
    const goals = Storage.getGoals() || {};
    const goalCal  = goals.calories || 2000;
    const goalPro  = goals.protein  || 150;
    const goalCarb = goals.carbs    || 250;
    const goalFat  = goals.fat      || 70;

    const totals = meals.reduce((acc, m) => ({
      calories: acc.calories + (Number(m.calories) || 0),
      protein:  acc.protein  + (Number(m.protein)  || 0),
      carbs:    acc.carbs    + (Number(m.carbs)     || 0),
      fat:      acc.fat      + (Number(m.fat)       || 0),
    }), { calories: 0, protein: 0, carbs: 0, fat: 0 });

    const remaining = Math.max(0, goalCal - totals.calories);
    const over      = Math.max(0, totals.calories - goalCal);

    // Calorie ring text
    $('home-cal-consumed').textContent  = Math.round(totals.calories);
    $('home-cal-remaining').textContent = Math.round(remaining);
    $('home-cal-goal').textContent      = goalCal;
    $('home-cal-over').textContent      = Math.round(over);

    // SVG ring — circumference 534 (r=85)
    const pct    = Math.min(1, totals.calories / goalCal);
    const offset = 534 - (534 * pct);
    const ring   = $('cal-ring-progress');
    ring.style.strokeDashoffset = offset.toFixed(2);
    // Colour ring red when over goal
    ring.style.stroke = over > 0 ? 'var(--color-danger)' : 'url(#ring-gradient)';

    // Macro bars + text
    const barPct = (val, goal) =>
      Math.min(100, goal > 0 ? Math.round((val / goal) * 100) : 0) + '%';

    $('home-macro-protein-text').textContent = `${Math.round(totals.protein)}g / ${goalPro}g`;
    $('home-macro-carbs-text').textContent   = `${Math.round(totals.carbs)}g / ${goalCarb}g`;
    $('home-macro-fat-text').textContent     = `${Math.round(totals.fat)}g / ${goalFat}g`;

    $('home-macro-protein-bar').style.width = barPct(totals.protein, goalPro);
    $('home-macro-carbs-bar').style.width   = barPct(totals.carbs,   goalCarb);
    $('home-macro-fat-bar').style.width     = barPct(totals.fat,     goalFat);
  };

  /* ══════════════════════════════════════════════════════
     MEALS SCREEN — history grouped by date
  ══════════════════════════════════════════════════════ */

  const renderHistory = () => {
    const list  = $('meals-history-list');
    const empty = $('meals-empty-state');
    const all   = Storage.getMeals();

    list.innerHTML = '';

    if (all.length === 0) {
      list.hidden  = true;
      empty.hidden = false;
      return;
    }

    list.hidden  = false;
    empty.hidden = true;

    // Group by date
    const grouped = {};
    all.forEach(m => {
      const key = m.date || m.timestamp?.slice(0, 10) || todayStr();
      (grouped[key] ??= []).push(m);
    });

    // Render newest-first
    Object.keys(grouped)
      .sort((a, b) => b.localeCompare(a))
      .forEach(date => {
        const dayMeals = grouped[date];
        const dayKcal  = dayMeals.reduce((s, m) => s + (Number(m.calories) || 0), 0);

        const group = document.createElement('div');
        group.className = 'history-group';

        group.innerHTML = `
          <div class="history-group-header">
            <span class="history-group-date">${fmtDate(date)}</span>
            <span class="history-group-total">${dayKcal} kcal</span>
          </div>
        `;

        dayMeals.forEach(m => group.appendChild(makeMealCard(m)));
        list.appendChild(group);
      });

    if (typeof lucide !== 'undefined') lucide.createIcons();
  };

  /* ══════════════════════════════════════════════════════
     MEAL ENTRY MODAL — new meal or edit existing
  ══════════════════════════════════════════════════════ */

  const openEntryModal = (imageData = null, existingMeal = null) => {
    activeMealId = existingMeal?.id ?? null;

    $('meal-entry-title').textContent = existingMeal ? 'Edit Meal' : 'Log Meal';

    // Image preview
    const img         = $('entry-meal-image');
    const placeholder = $('entry-image-placeholder');
    const display     = imageData || existingMeal?.imageData || null;

    if (display) {
      img.src     = display;
      img.hidden  = false;
      placeholder.hidden = true;
    } else {
      img.src     = '';
      img.hidden  = true;
      placeholder.hidden = false;
    }

    // Stash imageData on element so saveMeal() can read it
    img.dataset.imageData = display || '';

    // Pre-fill fields
    $('entry-name').value     = existingMeal?.name     ?? '';
    $('entry-calories').value = existingMeal?.calories ?? '';
    $('entry-protein').value  = existingMeal?.protein  ?? '';
    $('entry-carbs').value    = existingMeal?.carbs    ?? '';
    $('entry-fat').value      = existingMeal?.fat      ?? '';

    // Select default / existing category
    const activeCat = existingMeal?.category ?? autoCategory();
    document.querySelectorAll('.cat-btn').forEach(btn => {
      const on = btn.dataset.category === activeCat;
      btn.setAttribute('aria-checked', String(on));
      btn.classList.toggle('selected', on);
    });

    $('meal-entry-modal').hidden = false;
    setTimeout(() => $('entry-name').focus(), 320);
  };

  // Pick a sensible default category based on current time
  const autoCategory = () => {
    const h = new Date().getHours();
    if (h < 10) return 'breakfast';
    if (h < 14) return 'lunch';
    if (h < 20) return 'dinner';
    return 'snack';
  };

  const closeEntryModal = () => {
    $('meal-entry-modal').hidden = true;
    activeMealId = null;
  };

  const saveMeal = () => {
    const name = $('entry-name').value.trim();
    if (!name) {
      App.showToast('Please enter a meal name', 'warning');
      $('entry-name').focus();
      return;
    }

    const calories  = Number($('entry-calories').value) || 0;
    const protein   = Number($('entry-protein').value)  || 0;
    const carbs     = Number($('entry-carbs').value)    || 0;
    const fat       = Number($('entry-fat').value)      || 0;
    const category  = document.querySelector('.cat-btn[aria-checked="true"]')
                       ?.dataset.category ?? 'snack';
    const imageData = $('entry-meal-image').dataset.imageData || null;

    if (activeMealId) {
      Storage.updateMeal(activeMealId, { name, calories, protein, carbs, fat, category, imageData });
      App.showToast('Meal updated', 'success');
    } else {
      const now  = new Date().toISOString();
      Storage.addMeal({
        id:        'meal_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
        name, calories, protein, carbs, fat, category,
        imageData: imageData || null,
        timestamp: now,
        date:      now.slice(0, 10),
      });
      App.showToast('Meal saved!', 'success');
    }

    closeEntryModal();
    renderHomePreview();
    renderHistory();
  };

  /* ══════════════════════════════════════════════════════
     MEAL DETAIL MODAL — view / edit / delete
  ══════════════════════════════════════════════════════ */

  const openDetailModal = (id) => {
    const meal = Storage.getMeals().find(m => m.id === id);
    if (!meal) return;
    activeMealId = id;

    const img         = $('detail-meal-image');
    const placeholder = $('detail-image-placeholder');

    if (meal.imageData) {
      img.src    = meal.imageData;
      img.hidden = false;
      placeholder.hidden = true;
    } else {
      img.src    = '';
      img.hidden = true;
      placeholder.hidden = false;
    }

    $('detail-meal-name').textContent      = meal.name;
    $('detail-meal-category').textContent  = meal.category;
    $('detail-meal-time').textContent      = fmtTime(meal.timestamp);
    $('detail-macro-calories').textContent = (meal.calories ?? 0) + ' kcal';
    $('detail-macro-protein').textContent  = (meal.protein  ?? 0) + 'g';
    $('detail-macro-carbs').textContent    = (meal.carbs    ?? 0) + 'g';
    $('detail-macro-fat').textContent      = (meal.fat      ?? 0) + 'g';

    $('meal-detail-modal').hidden = false;
  };

  const closeDetailModal = () => {
    $('meal-detail-modal').hidden = true;
    activeMealId = null;
  };

  /* ── Category chip selection ─────────────────────────── */

  const initCategoryChips = () => {
    document.querySelectorAll('.cat-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.cat-btn').forEach(b => {
          b.setAttribute('aria-checked', 'false');
          b.classList.remove('selected');
        });
        btn.setAttribute('aria-checked', 'true');
        btn.classList.add('selected');
      });
    });
  };

  /* ── Init ────────────────────────────────────────────── */

  const init = () => {
    initCategoryChips();

    // Entry modal
    $('close-meal-entry-btn').addEventListener('click', closeEntryModal);
    $('meal-entry-backdrop').addEventListener('click',  closeEntryModal);
    $('save-meal-btn').addEventListener('click',        saveMeal);

    // Detail modal
    $('close-meal-detail-btn').addEventListener('click', closeDetailModal);
    $('meal-detail-backdrop').addEventListener('click',  closeDetailModal);

    $('edit-meal-btn').addEventListener('click', () => {
      const meal = Storage.getMeals().find(m => m.id === activeMealId);
      closeDetailModal();
      openEntryModal(meal?.imageData || null, meal);
    });

    $('delete-meal-btn').addEventListener('click', () => {
      App.showConfirm(
        'Delete Meal',
        'This meal will be permanently removed from your history.',
        () => {
          Storage.deleteMeal(activeMealId);
          closeDetailModal();
          renderHomePreview();
          renderHistory();
          App.showToast('Meal deleted');
        }
      );
    });

    // Home shortcuts
    $('home-see-all-btn').addEventListener('click',   () => App.switchScreen('meals'));
    $('home-log-first-btn').addEventListener('click', () => Camera.open());

    // Allow Enter to save from any entry field
    ['entry-name','entry-calories','entry-protein','entry-carbs','entry-fat'].forEach(id => {
      $(id).addEventListener('keydown', e => { if (e.key === 'Enter') saveMeal(); });
    });

    // Close modals with Escape
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      if (!$('meal-entry-modal').hidden)  closeEntryModal();
      if (!$('meal-detail-modal').hidden) closeDetailModal();
    });
  };

  return {
    init,
    openEntryModal,
    renderHomePreview,
    renderHistory,
  };

})();