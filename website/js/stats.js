/* ═══════════════════════════════════════════════════════════════
   stats.js — analytics, SVG chart, streak
   All data is derived from real meal logs. No fake/placeholder values.
═══════════════════════════════════════════════════════════════ */

const Stats = (() => {

  let currentPeriod = 'daily';   // 'daily' | 'weekly' | 'monthly'
  let currentMetric = 'calories'; // 'calories' | 'protein' | 'carbs' | 'fat'

  const $ = id => document.getElementById(id);

  /* ── Period data builder ─────────────────────────────── */

  /**
   * Returns an array of { label, value } objects for the current period/metric.
   * Daily  → 7 individual days
   * Weekly → 7 weeks (each = 7 consecutive days summed)
   * Monthly→ 30 individual days
   */
  const buildPeriodData = () => {
    const meals  = Storage.getMeals();
    const today  = new Date();
    today.setHours(0, 0, 0, 0);

    const points = [];

    if (currentPeriod === 'daily' || currentPeriod === 'monthly') {
      const count = currentPeriod === 'daily' ? 7 : 30;

      for (let i = count - 1; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().slice(0, 10);

        const dayTotal = meals
          .filter(m => m.date === dateStr)
          .reduce((s, m) => s + (Number(m[currentMetric]) || 0), 0);

        const label = currentPeriod === 'daily'
          ? d.toLocaleDateString([], { weekday: 'short' }).slice(0, 3)
          : d.getDate().toString();

        points.push({ label, value: dayTotal, date: dateStr });
      }

    } else { // weekly — 7 weeks, newest last
      for (let i = 6; i >= 0; i--) {
        const weekEnd   = new Date(today);
        weekEnd.setDate(weekEnd.getDate() - i * 7);
        const weekStart = new Date(weekEnd);
        weekStart.setDate(weekStart.getDate() - 6);

        const startStr = weekStart.toISOString().slice(0, 10);
        const endStr   = weekEnd.toISOString().slice(0, 10);

        const weekTotal = meals
          .filter(m => m.date >= startStr && m.date <= endStr)
          .reduce((s, m) => s + (Number(m[currentMetric]) || 0), 0);

        const label = weekStart.toLocaleDateString([], { month: 'short', day: 'numeric' });
        points.push({ label, value: weekTotal });
      }
    }

    return points;
  };

  /* ── SVG chart renderer ──────────────────────────────── */

  // viewBox is "0 0 340 120"
  const W = 340, H = 120, PX = 14, PY = 12;

  const renderChart = (points) => {
    const chartEmpty = $('chart-empty-state');
    const areaPath   = $('chart-area-path');
    const linePath   = $('chart-line-path');
    const xLabels    = $('stats-x-labels');
    const headVal    = $('stats-headline-value');
    const headTrend  = $('stats-headline-trend');

    const allZero = points.every(p => p.value === 0);

    // ── Empty state ──
    if (allZero) {
      chartEmpty.hidden = false;
      areaPath.setAttribute('d', '');
      linePath.setAttribute('d', '');
      xLabels.innerHTML  = '';
      headVal.textContent   = '—';
      headTrend.textContent = '';
      headTrend.className   = 'chart-trend';
      return;
    }

    chartEmpty.hidden = true;

    // ── Headline average (non-zero days only) ──
    const nonZero = points.filter(p => p.value > 0);
    const avg     = Math.round(nonZero.reduce((s, p) => s + p.value, 0) / nonZero.length);
    const unit    = currentMetric === 'calories' ? ' kcal' : 'g';
    headVal.textContent = avg + unit;

    // ── Trend: compare first half vs second half ──
    const half    = Math.floor(points.length / 2);
    const fstAvg  = points.slice(0, half).reduce((s, p) => s + p.value, 0) / (half || 1);
    const sndAvg  = points.slice(half).reduce((s, p) => s + p.value, 0) / ((points.length - half) || 1);

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

    // ── SVG path maths ──
    const maxVal = Math.max(...points.map(p => p.value)) * 1.08;
    const n      = points.length;

    const toX = i => PX + (i / (n - 1)) * (W - PX * 2);
    const toY = v => H - PY - ((v / maxVal) * (H - PY * 2));

    // Smooth cubic bezier line
    let lineD = '';
    points.forEach((p, i) => {
      const x = toX(i).toFixed(1);
      const y = toY(p.value).toFixed(1);
      if (i === 0) {
        lineD += `M${x},${y}`;
      } else {
        const prevX = toX(i - 1);
        const cpX   = ((toX(i) + prevX) / 2).toFixed(1);
        lineD += ` C${cpX},${toY(points[i-1].value).toFixed(1)} ${cpX},${y} ${x},${y}`;
      }
    });

    linePath.setAttribute('d', lineD);

    // Area fill: extend line to bottom corners
    const firstX = toX(0).toFixed(1);
    const lastX  = toX(n - 1).toFixed(1);
    const bottom = (H - PY).toFixed(1);
    areaPath.setAttribute('d', `${lineD} L${lastX},${bottom} L${firstX},${bottom} Z`);

    // ── X-axis labels (show a sensible subset) ──
    xLabels.innerHTML = '';
    const maxLabels   = 7;
    const step        = Math.max(1, Math.ceil(n / maxLabels));

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
    const meals  = Storage.getMeals();
    const today  = new Date();
    today.setHours(0, 0, 0, 0);

    // Use the same date window as the current period
    const dayCount = currentPeriod === 'monthly' ? 30
                   : currentPeriod === 'weekly'  ? 49  // 7 weeks
                   :                               7;   // daily

    const cutoff = new Date(today);
    cutoff.setDate(cutoff.getDate() - dayCount);
    const cutoffStr = cutoff.toISOString().slice(0, 10);

    const inWindow = meals.filter(m => m.date >= cutoffStr);

    const avgOf = (metric) => {
      const vals = inWindow.map(m => Number(m[metric]) || 0).filter(v => v > 0);
      return vals.length ? Math.round(vals.reduce((s, v) => s + v, 0) / vals.length) : 0;
    };

    $('stats-avg-protein').textContent = avgOf('protein') ? avgOf('protein') + 'g' : '—';
    $('stats-avg-carbs').textContent   = avgOf('carbs')   ? avgOf('carbs')   + 'g' : '—';
    $('stats-avg-fat').textContent     = avgOf('fat')     ? avgOf('fat')     + 'g' : '—';
  };

  /* ── Streak ──────────────────────────────────────────── */

  const renderStreak = () => {
    const meals = Storage.getMeals();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let streak = 0;
    for (let i = 0; i < 365; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const ds = d.toISOString().slice(0, 10);
      if (meals.some(m => m.date === ds)) streak++;
      else break;
    }

    const label = streak === 1 ? '1 Day Streak' : `${streak} Day Streak`;
    $('stats-streak-title').textContent = label;
  };

  /* ── Update headline label ───────────────────────────── */

  const METRIC_LABELS = {
    calories: 'AVG. DAILY CALORIES',
    protein:  'AVG. DAILY PROTEIN',
    carbs:    'AVG. DAILY CARBS',
    fat:      'AVG. DAILY FAT',
  };

  const updateHeadlineLabel = () => {
    $('stats-headline-label').textContent = METRIC_LABELS[currentMetric] || '';
  };

  /* ── Full render ─────────────────────────────────────── */

  const render = () => {
    updateHeadlineLabel();
    const points = buildPeriodData();
    renderChart(points);
    renderAverages();
    renderStreak();
  };

  /* ── Init ────────────────────────────────────────────── */

  const init = () => {

    // Period segmented control
    $('stats-period-control').addEventListener('click', (e) => {
      const btn = e.target.closest('.seg-btn');
      if (!btn || !btn.dataset.period) return;

      document.querySelectorAll('#stats-period-control .seg-btn').forEach(b => {
        b.classList.remove('seg-btn--active');
        b.setAttribute('aria-selected', 'false');
      });
      btn.classList.add('seg-btn--active');
      btn.setAttribute('aria-selected', 'true');

      currentPeriod = btn.dataset.period;
      render();
    });

    // Metric pills
    $('stats-metric-pills').addEventListener('click', (e) => {
      const pill = e.target.closest('.metric-pill');
      if (!pill || !pill.dataset.metric) return;

      document.querySelectorAll('.metric-pill').forEach(p => {
        p.classList.remove('metric-pill--active');
        p.setAttribute('aria-pressed', 'false');
      });
      pill.classList.add('metric-pill--active');
      pill.setAttribute('aria-pressed', 'true');

      currentMetric = pill.dataset.metric;
      updateHeadlineLabel();
      renderChart(buildPeriodData());
    });
  };

  return { init, render };

})();
