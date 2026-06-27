/* ═══════════════════════════════════════════════════════════════
   storage.js — localStorage abstraction layer
   All data access goes through this module. No other module
   touches localStorage directly.
═══════════════════════════════════════════════════════════════ */

const Storage = (() => {

  const KEYS = {
    PROFILE:   'snapcal_profile',
    GOALS:     'snapcal_goals',
    MEALS:     'snapcal_meals',
    SETTINGS:  'snapcal_settings',
    ONBOARDED: 'snapcal_onboarded',
  };

  /* ── Primitives ─────────────────────────────────────────── */

  const _get = (key) => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  };

  const _set = (key, value) => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch { return false; }
  };

  const _remove = (key) => {
    try { localStorage.removeItem(key); return true; }
    catch { return false; }
  };

  /* ── Profile ─────────────────────────────────────────────
     Shape: { name, age, gender, height, weight, activity, goal, joinedAt }
  ─────────────────────────────────────────────────────────── */

  const getProfile = ()          => _get(KEYS.PROFILE);
  const setProfile = (profile)   => _set(KEYS.PROFILE, profile);

  /* ── Goals ───────────────────────────────────────────────
     Shape: { calories, protein, carbs, fat, bmr, tdee }
  ─────────────────────────────────────────────────────────── */

  const getGoals = ()        => _get(KEYS.GOALS);
  const setGoals = (goals)   => _set(KEYS.GOALS, goals);

  /* ── Meals ───────────────────────────────────────────────
     Each meal: {
       id, name, calories, protein, carbs, fat,
       category, imageData, timestamp (ISO), date (YYYY-MM-DD)
     }
  ─────────────────────────────────────────────────────────── */

  const getMeals = ()         => _get(KEYS.MEALS) || [];
  const setMeals = (meals)    => _set(KEYS.MEALS, meals);

  const addMeal = (meal) => {
    const meals = getMeals();
    meals.push(meal);
    return setMeals(meals);
  };

  const updateMeal = (id, updates) => {
    const meals = getMeals();
    const idx = meals.findIndex(m => m.id === id);
    if (idx === -1) return false;
    meals[idx] = { ...meals[idx], ...updates };
    return setMeals(meals);
  };

  const deleteMeal = (id) => {
    return setMeals(getMeals().filter(m => m.id !== id));
  };

  const getMealsForDate = (dateStr) => {
    return getMeals().filter(m => m.date === dateStr);
  };

  const clearMeals = () => setMeals([]);

  /* ── Settings ────────────────────────────────────────────
     Shape: { darkMode: boolean }
  ─────────────────────────────────────────────────────────── */

  const getSettings = ()           => _get(KEYS.SETTINGS) || { darkMode: false };
  const setSettings = (settings)   => _set(KEYS.SETTINGS, settings);

  /* ── Onboarding flag ─────────────────────────────────── */

  const isOnboarded  = ()  => !!_get(KEYS.ONBOARDED);
  const setOnboarded = ()  => _set(KEYS.ONBOARDED, true);

  /* ── Bulk export / import / reset ───────────────────── */

  const exportAll = () => ({
    profile:    getProfile(),
    goals:      getGoals(),
    meals:      getMeals(),
    settings:   getSettings(),
    exportedAt: new Date().toISOString(),
    version:    1,
  });

  const importAll = (data) => {
    if (!data || typeof data !== 'object') return false;
    if (data.profile)  setProfile(data.profile);
    if (data.goals)    setGoals(data.goals);
    if (Array.isArray(data.meals)) setMeals(data.meals);
    if (data.settings) setSettings(data.settings);
    return true;
  };

  const reset = () => Object.values(KEYS).forEach(_remove);

  /* ── Public API ─────────────────────────────────────── */

  return {
    getProfile, setProfile,
    getGoals,   setGoals,
    getMeals,   setMeals, addMeal, updateMeal, deleteMeal,
    getMealsForDate, clearMeals,
    getSettings, setSettings,
    isOnboarded, setOnboarded,
    exportAll, importAll, reset,
  };

})();