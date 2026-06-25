/* ═══════════════════════════════════════════════════════════════
   onboarding.js — first-launch setup flow
   6 steps: Welcome/Name → Age/Gender → Height/Weight →
            Activity → Goal → Summary
   Calculates BMR → TDEE → daily targets using Mifflin-St Jeor.
═══════════════════════════════════════════════════════════════ */

const Onboarding = (() => {

  const TOTAL_STEPS = 6;
  let currentStep   = 1;

  /* Collected form data across steps */
  const data = {
    name: '', age: null, gender: null,
    height: null, weight: null, activity: null, goal: null,
  };

  const $ = id => document.getElementById(id);

  /* ── Constants ────────────────────────────────────────── */

  const ACTIVITY_MULTIPLIERS = {
    sedentary:  1.2,
    lightly:    1.375,
    moderately: 1.55,
    very:       1.725,
  };

  const GOAL_ADJUSTMENTS = {
    lose:     -500,
    maintain:  0,
    gain:      300,
  };

  /* ── BMR / TDEE / Macro calculation ─────────────────── */

  const calcGoals = ({ weight, height, age, gender, activity, goal }) => {
    // Mifflin-St Jeor
    const base = (10 * weight) + (6.25 * height) - (5 * age);
    const bmr  = gender === 'male'   ? Math.round(base + 5)
               : gender === 'female' ? Math.round(base - 161)
               :                       Math.round(base - 78); // other = midpoint

    const tdee     = Math.round(bmr * (ACTIVITY_MULTIPLIERS[activity] || 1.2));
    const calories = Math.max(1200, tdee + (GOAL_ADJUSTMENTS[goal] || 0));

    // Macro split: 25% protein / 45% carbs / 30% fat
    const protein = Math.round((calories * 0.25) / 4);
    const carbs   = Math.round((calories * 0.45) / 4);
    const fat     = Math.round((calories * 0.30) / 9);

    return { calories, protein, carbs, fat, bmr, tdee };
  };

  /* ── UI helpers ──────────────────────────────────────── */

  const updateProgress = () => {
    const pct = (currentStep / TOTAL_STEPS) * 100;
    $('ob-progress-fill').style.width = pct + '%';

    // Back button: invisible on step 1
    $('ob-back-btn').style.visibility = currentStep === 1 ? 'hidden' : 'visible';

    // Next button label
    $('ob-next-btn').textContent = currentStep === TOTAL_STEPS ? 'Get Started' : 'Continue';
  };

  const showStep = (n, animate = true) => {
    document.querySelectorAll('.ob-step').forEach(el => {
      el.classList.remove('ob-step--active');
    });

    const target = $(`ob-step-${n}`);
    target.classList.add('ob-step--active');

    if (animate) {
      target.style.animation = 'none';
      void target.offsetWidth; // reflow
      target.style.animation = '';
      target.style.animationName = 'obSlideIn';
    }

    currentStep = n;
    updateProgress();

    // Focus first input in step (if any)
    const firstInput = target.querySelector('input');
    if (firstInput) setTimeout(() => firstInput.focus(), 300);
  };

  const shakeInvalid = (el) => {
    el.style.animation = 'none';
    void el.offsetWidth;
    el.style.animation = 'shake 0.4s ease-in-out';
    el.addEventListener('animationend', () => { el.style.animation = ''; }, { once: true });
    el.focus();
  };

  /* ── Validation ──────────────────────────────────────── */

  const validate = () => {
    switch (currentStep) {

      case 1: {
        const name = $('ob-name').value.trim();
        if (!name) { shakeInvalid($('ob-name')); return false; }
        data.name = name;
        return true;
      }

      case 2: {
        const age = parseInt($('ob-age').value, 10);
        if (!age || age < 10 || age > 100) {
          shakeInvalid($('ob-age')); return false;
        }
        if (!data.gender) {
          App.showToast('Please select a gender', 'warning'); return false;
        }
        data.age = age;
        return true;
      }

      case 3: {
        const h = parseFloat($('ob-height').value);
        const w = parseFloat($('ob-weight').value);
        if (!h || h < 100 || h > 250) { shakeInvalid($('ob-height')); return false; }
        if (!w || w < 30  || w > 300) { shakeInvalid($('ob-weight')); return false; }
        data.height = h;
        data.weight = w;
        return true;
      }

      case 4: {
        if (!data.activity) {
          App.showToast('Please select your activity level', 'warning'); return false;
        }
        return true;
      }

      case 5: {
        if (!data.goal) {
          App.showToast('Please select your goal', 'warning'); return false;
        }
        return true;
      }

      default: return true;
    }
  };

  /* ── Step 6: show calculated summary ────────────────── */

  const populateSummary = () => {
    const goals     = calcGoals(data);
    const firstName = data.name.split(' ')[0];

    $('ob-summary-name').textContent      = firstName;
    $('ob-calc-calories').textContent     = goals.calories + ' kcal';
    $('ob-calc-protein').textContent      = goals.protein  + 'g';
    $('ob-calc-carbs').textContent        = goals.carbs    + 'g';
    $('ob-calc-fat').textContent          = goals.fat      + 'g';
  };

  /* ── Navigation ──────────────────────────────────────── */

  const goNext = () => {
    if (!validate()) return;

    if (currentStep === 5) populateSummary(); // prep summary before showing it

    if (currentStep < TOTAL_STEPS) {
      showStep(currentStep + 1);
    } else {
      complete();
    }
  };

  const goBack = () => {
    if (currentStep > 1) showStep(currentStep - 1);
  };

  /* ── Completion ──────────────────────────────────────── */

  const complete = () => {
    const goals   = calcGoals(data);
    const profile = { ...data, joinedAt: new Date().toISOString() };

    Storage.setProfile(profile);
    Storage.setGoals(goals);
    Storage.setSettings({ darkMode: false });
    Storage.setOnboarded();

    $('onboarding').hidden = true;
    $('app').hidden        = false;

    App.init();
  };

  /* ── Choice-card wiring (gender / activity / goal) ──── */

  const initChoiceCards = () => {
    document.querySelectorAll('#onboarding .choice-card').forEach(card => {
      card.addEventListener('click', () => {
        const group = card.dataset.group;
        document.querySelectorAll(`#onboarding .choice-card[data-group="${group}"]`).forEach(c => {
          c.setAttribute('aria-checked', 'false');
          c.classList.remove('selected');
        });
        card.setAttribute('aria-checked', 'true');
        card.classList.add('selected');
        data[group] = card.dataset.value;
      });
    });
  };

  /* ── Allow Enter key to advance steps ───────────────── */

  const initKeyboard = () => {
    document.getElementById('onboarding').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') goNext();
    });
  };

  /* ── Public init ─────────────────────────────────────── */

  const init = () => {
    $('ob-next-btn').addEventListener('click', goNext);
    $('ob-back-btn').addEventListener('click', goBack);
    initChoiceCards();
    initKeyboard();
    updateProgress();
  };

  return { init };

})();
