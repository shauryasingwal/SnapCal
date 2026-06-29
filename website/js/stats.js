/* ═══════════════════════════════════════════════════════════════
   stats.js — analytics, SVG chart, streak
   All data derived from real meal logs. No fake/placeholder values.

   FIX: date arithmetic now uses UTC throughout, matching the format
   meals are stored in (new Date().toISOString().slice(0,10)).
   Previously, setHours(0,0,0,0) set LOCAL midnight then toISOString()
   converted to UTC, shifting the date back by 1 day in UTC+ timezones.
═══════════════════════════════════════════════════════════════ */

const Stats = (() => {

  let currentPeriod = 'daily';    // 'daily' | 'weekly' | 'monthly'
  let currentMetric = 'calories'; // 'calories' | 'protein' | 'carbs' | 'fat'

  const $ = id => document.getElementById(id);

  /* ── UTC date helpers ────────────────────────────────────
     All meals are stored with:  new Date().toISOString().slice(0,10)
     That is the UTC calendar date. Every date we generate here
     must use the same convention so exact-match filters work.
  ─────────────────────────────────────────────────────────── */

  // Current UTC date string — matches what saveMeal() stores
  const utcToday = () => new Date().toISOString().slice(0, 10);

  // Subtract N days from a YYYY-MM-DD string, staying in UTC
  // Using noon (T12:00:00Z) avoids any DST edge-case at midnight
  const subtractDays = (dateStr, n) => {
    const d = new Date(dateStr + 'T12:00:00Z');
    d.setUTCDate(d.getUTCDate() - n);
    return d.toISOString().slice(0, 10);
  };

  // Format a YYYY-MM-DD string for display (uses local representation
  // of the UTC noon instant, which is fine for labels)
  const labelFor = (dateStr, format) => {
    const d = new Date(dateStr + 'T12:00:00Z');
    return d.toLocaleDateString([], format);
  };

  /* ── Period data builder ─────────────────────────────── */

  const buildPeriodData = () => {
    const meals   = Storage.getMeals();
    const today   = utcToday();   // e.g. "2025-06-25"
    const points  = [];

    if (currentPeriod === 'daily' || currentPeriod === 'monthly') {
      const count = currentPeriod === 'daily' ? 7 : 30;

      for (let i = count - 1; i >= 0; i--) {
        const dateStr  = subtractDays(today, i);          // pure UTC arithmetic
        const dayTotal = meals
          .filter(m => m.date === dateStr)                // exact match — now reliable
          .reduce((s, m) => s + (Number(m[currentMetric]) || 0), 0);

        const label = currentPeriod === 'daily'
          ? labelFor(dateStr, { weekday: 'short' }).slice(0, 3)
          : labelFor(dateStr, {}).split('/')[1] || new Date(dateStr + 'T12:00:00Z').getUTCDate().toString();

        points.push({ label, value: dayTotal, date: dateStr });
      }

    } else {
      // Weekly — 7 weeks, most recent last
      for (let i = 6; i >= 0; i--) {
        const weekEnd   = subtractDays(today, i * 7);
        const weekStart = subtractDays(weekEnd, 6);

        const weekTotal = meals
          .filter(m => m.date >= weekStart && m.date <= weekEnd)
          .reduce((s, m) => s + (Number(m[currentMetric]) || 0), 0);

        const label = labelFor(weekStart, { month: 'short', day: 'numeric' });
        points.push({ label, value: weekTotal });
      }
    }

    return points;
  };

  /* ── SVG chart renderer ──────────────────────────────── */

  const W = 340, H = 120, PX = 14, PY = 12;

  const renderChart = (points) => {
    const chartEmpty = $('chart-empty-state');
    const areaPath   = $('chart-area-path');
    const linePath   = $('chart-line-path');
    const xLabels    = $('stats-x-labels');
    const headVal    = $('stats-headline-value');
    const headTrend  = $('stats-headline-trend');

    const allZero = points.every(p => p.value === 0);

    if (allZero) {
      chartEmpty.hidden     = false;
      areaPath.setAttribute('d', '');
      linePath.setAttribute('d', '');
      xLabels.innerHTML     = '';
      headVal.textContent   = '—';
      headTrend.textContent = '';
      headTrend.className   = 'chart-trend';
      return;
    }

    chartEmpty.hidden = true;

    // Headline: average of days that have data
    const nonZero = points.filter(p => p.value > 0);
    const avg     = Math.round(nonZero.reduce((s, p) => s + p.value, 0) / nonZero.length);
    const unit    = currentMetric === 'calories' ? ' kcal' : 'g';
    headVal.textContent = avg + unit;

    // Trend: first half vs second half
    const half   = Math.floor(points.length / 2);
    const fstAvg = points.slice(0, half).reduce((s, p) => s + p.value, 0) / (half || 1);
    const sndAvg = points.slice(half).reduce((s, p) => s + p.value, 0) / ((points.length - half) || 1);

    if (fstAvg > 0) {
      const diff = Math.round(((sndAvg - fstAvg) / fstAvg) * 100);
      if (diff > 2) {
        headTrend.textContent = `▲ ${diff}% vs earlier`;
        headTrend.className   = 'chart-trend up';
      } else if (diff < -2) {
        headTrend.textContent = `▼ ${Math.abs(diff)}% vs earlier`;
        headTrend.className   = 'chart-trend down';
      } else {
        headTrend.textContent = 'Consistent';
        headTrend.className   = 'chart-trend';
      }
    } else {
      headTrend.textContent = '';
      headTrend.className   = 'chart-trend';
    }

    // SVG path geometry
    const maxVal = Math.max(...points.map(p => p.value)) * 1.08 || 1;
    const n      = points.length;

    const toX = i => PX + (i / (n - 1)) * (W - PX * 2);
    const toY = v => H - PY - ((v / maxVal) * (H - PY * 2));

    // Smooth cubic-bezier line
    let lineD = '';
    points.forEach((p, i) => {
      const x = toX(i).toFixed(1);
      const y = toY(p.value).toFixed(1);
      if (i === 0) {
        lineD += `M${x},${y}`;
      } else {
        const cpX = ((toX(i) + toX(i - 1)) / 2).toFixed(1);
        lineD += ` C${cpX},${toY(points[i-1].value).toFixed(1)} ${cpX},${y} ${x},${y}`;
      }
    });

    linePath.setAttribute('d', lineD);

    // Area fill
    const firstX = toX(0).toFixed(1);
    const lastX  = toX(n - 1).toFixed(1);
    const bottom = (H - PY).toFixed(1);
    areaPath.setAttribute('d', `${lineD} L${lastX},${bottom} L${firstX},${bottom} Z`);

    // X-axis labels (show a readable subset)
    xLabels.innerHTML = '';
    const step = Math.max(1, Math.ceil(n / 7));
    points.forEach((p, i) => {
      if (i % step !== 0 && i !== n - 1) return;
      const span = document.createElement('span');
      span.className   = 'chart-x-label';
      span.textContent = p.label;
      xLabels.appendChild(span);
    });
  };

  /* ── Average macros ──────────────────────────────────── */

  const renderAverages = () => {
    const meals = Storage.getMeals();
    const today = utcToday();

    const dayCount  = currentPeriod === 'monthly' ? 30
                    : currentPeriod === 'weekly'  ? 49   // 7 weeks
                    :                               7;

    const cutoffStr = subtractDays(today, dayCount);      // UTC arithmetic
    const inWindow  = meals.filter(m => m.date >= cutoffStr);

    const avgOf = (metric) => {
      const vals = inWindow.map(m => Number(m[metric]) || 0).filter(v => v > 0);
      return vals.length
        ? Math.round(vals.reduce((s, v) => s + v, 0) / vals.length)
        : 0;
    };

    const fmt = (val, unit) => val ? val + unit : '—';
    $('stats-avg-protein').textContent = fmt(avgOf('protein'), 'g');
    $('stats-avg-carbs').textContent   = fmt(avgOf('carbs'),   'g');
    $('stats-avg-fat').textContent     = fmt(avgOf('fat'),     'g');
  };

  /* ── Streak ──────────────────────────────────────────── */

  const renderStreak = () => {
    const meals = Storage.getMeals();
    const today = utcToday();

    let streak = 0;
    for (let i = 0; i < 365; i++) {
      const ds = subtractDays(today, i);                  // UTC arithmetic
      if (meals.some(m => m.date === ds)) streak++;
      else break;
    }

    $('stats-streak-title').textContent =
      streak === 1 ? '1 Day Streak' : `${streak} Day Streak`;
  };

  /* ── Headline label ──────────────────────────────────── */

  const METRIC_LABELS = {
    calories: 'AVG. DAILY CALORIES',
    protein:  'AVG. DAILY PROTEIN',
    carbs:    'AVG. DAILY CARBS',
    fat:      'AVG. DAILY FAT',
  };

  const updateLabel = () => {
    $('stats-headline-label').textContent = METRIC_LABELS[currentMetric] || '';
  };

  /* ── Full render ─────────────────────────────────────── */

  const render = () => {
    updateLabel();
    renderChart(buildPeriodData());
    renderAverages();
    renderStreak();
  };

  /* ── Init ────────────────────────────────────────────── */

  const init = () => {

    $('stats-period-control').addEventListener('click', (e) => {
      const btn = e.target.closest('.seg-btn');
      if (!btn?.dataset.period) return;

      document.querySelectorAll('#stats-period-control .seg-btn').forEach(b => {
        b.classList.remove('seg-btn--active');
        b.setAttribute('aria-selected', 'false');
      });
      btn.classList.add('seg-btn--active');
      btn.setAttribute('aria-selected', 'true');

      currentPeriod = btn.dataset.period;
      render();
    });

    $('stats-metric-pills').addEventListener('click', (e) => {
      const pill = e.target.closest('.metric-pill');
      if (!pill?.dataset.metric) return;

      document.querySelectorAll('.metric-pill').forEach(p => {
        p.classList.remove('metric-pill--active');
        p.setAttribute('aria-pressed', 'false');
      });
      pill.classList.add('metric-pill--active');
      pill.setAttribute('aria-pressed', 'true');

      currentMetric = pill.dataset.metric;
      updateLabel();
      renderChart(buildPeriodData());
    });
  };

  return { init, render };

})();