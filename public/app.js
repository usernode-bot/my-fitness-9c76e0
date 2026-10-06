// My Fitness: single-page app. Five tabs (Home, Food, Workout, Progress,
// Profile) rendered from one /api/state snapshot; every change is saved to
// the server immediately and the snapshot is re-fetched.
(function () {
  'use strict';

  // ---------------------------------------------------------------- helpers

  var params = new URLSearchParams(location.search);
  var TOKEN = params.get('token') || '';

  function $(sel, root) { return (root || document).querySelector(sel); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function fmt(n, digits) {
    if (n == null || !isFinite(n)) return '-';
    return Number(n).toLocaleString('en-US', { maximumFractionDigits: digits || 0, minimumFractionDigits: 0 });
  }
  function now() {
    return window.usernode && typeof window.usernode.now === 'function' ? window.usernode.now() : new Date();
  }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function dayKey(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function parseDay(s) { var p = s.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function addDays(s, n) { var d = parseDay(s); d.setDate(d.getDate() + n); return dayKey(d); }
  function today() { return dayKey(now()); }
  function dayLabel(s, opts) {
    return parseDay(s).toLocaleDateString('en-US', opts || { weekday: 'short', month: 'short', day: 'numeric' });
  }
  // Monday-based week start for a day key.
  function weekStart(s) { var d = parseDay(s); var wd = (d.getDay() + 6) % 7; d.setDate(d.getDate() - wd); return dayKey(d); }

  var ICONS = {
    home: '<path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/><path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    food: '<path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"/>',
    workout: '<path d="M14.4 14.4 9.6 9.6"/><path d="M18.657 21.485a2 2 0 1 1-2.829-2.828l-1.767 1.768a2 2 0 1 1-2.829-2.829l6.364-6.364a2 2 0 1 1 2.829 2.829l-1.768 1.767a2 2 0 1 1 2.828 2.829z"/><path d="m21.5 21.5-1.4-1.4"/><path d="M3.9 3.9 2.5 2.5"/><path d="M6.404 12.768a2 2 0 1 1-2.829-2.829l1.768-1.767a2 2 0 1 1-2.828-2.829l2.828-2.828a2 2 0 1 1 2.829 2.828l1.767-1.768a2 2 0 1 1 2.829 2.829z"/>',
    progress: '<path d="M3 3v16a2 2 0 0 0 2 2h16"/><path d="m19 9-5 5-4-4-3 3"/>',
    profile: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    flame: '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>',
    steps: '<path d="M4 16v-2.38C4 11.5 2.97 10.5 3 8c.03-2.72 1.49-6 4.5-6C9.37 2 10 3.8 10 5.5c0 3.11-2 5.66-2 8.68V16a2 2 0 1 1-4 0Z"/><path d="M20 20v-2.38c0-2.12 1.03-3.12 1-5.62-.03-2.72-1.49-6-4.5-6C14.63 6 14 7.8 14 9.5c0 3.11 2 5.66 2 8.68V20a2 2 0 1 0 4 0Z"/><path d="M16 17h4"/><path d="M4 13h4"/>',
    water: '<path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z"/>',
    scale: '<path d="m16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/><path d="m2 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/><path d="M7 21h10"/><path d="M12 3v18"/><path d="M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2"/>',
    plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
    trash: '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>',
    bell: '<path d="M10.268 21a2 2 0 0 0 3.464 0"/><path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326"/>',
    trophy: '<path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    left: '<path d="m15 18-6-6 6-6"/>',
    right: '<path d="m9 18 6-6-6-6"/>',
    timer: '<path d="M10 2h4"/><path d="M12 14l3-3"/><circle cx="12" cy="14" r="8"/>',
    lock: '<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  };
  function icon(name, cls) {
    return '<svg class="' + (cls || 'w-5 h-5') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICONS[name] + '</svg>';
  }

  function toast(message, opts) {
    if (window.unNative && unNative.toast) return unNative.toast(message, opts || {});
    console.info(message);
  }

  function presentSheet(html, onReady) {
    var el = document.createElement('div');
    el.innerHTML = html;
    if (window.unNative && unNative.presentSheet) {
      var s = unNative.presentSheet({ contentEl: el });
      if (onReady) onReady(el, function () { s.dismiss(); });
      return;
    }
    // Fallback when the hosted kit is unavailable: a plain overlay.
    var wrap = document.createElement('div');
    wrap.className = 'fixed inset-0 z-50 bg-black/40 flex items-end justify-center';
    var card = document.createElement('div');
    card.className = 'w-full max-w-xl bg-white dark:bg-zinc-900 rounded-t-2xl p-4 max-h-full overflow-y-auto';
    card.appendChild(el);
    wrap.appendChild(card);
    wrap.addEventListener('click', function (e) { if (e.target === wrap) wrap.remove(); });
    document.body.appendChild(wrap);
    if (onReady) onReady(el, function () { wrap.remove(); });
  }

  // ------------------------------------------------------------ calculations

  var ACTIVITY = [
    { id: 'sedentary', label: 'Sedentary', hint: 'Little or no exercise', factor: 1.2 },
    { id: 'light', label: 'Lightly active', hint: 'Exercise 1 to 3 days a week', factor: 1.375 },
    { id: 'moderate', label: 'Moderately active', hint: 'Exercise 3 to 5 days a week', factor: 1.55 },
    { id: 'active', label: 'Very active', hint: 'Exercise 6 to 7 days a week', factor: 1.725 },
    { id: 'very_active', label: 'Extra active', hint: 'Hard exercise or a physical job', factor: 1.9 },
  ];
  var MEALS = [
    { id: 'breakfast', label: 'Breakfast' },
    { id: 'lunch', label: 'Lunch' },
    { id: 'dinner', label: 'Dinner' },
    { id: 'snack', label: 'Snacks' },
  ];
  // MET values for the calorie estimate (kcal = MET x kg x hours).
  var WORKOUTS = [
    { id: 'walking', label: 'Walking', met: 3.5, distance: true },
    { id: 'running', label: 'Running', met: 9.8, distance: true },
    { id: 'cycling', label: 'Cycling', met: 7.5, distance: true },
    { id: 'swimming', label: 'Swimming', met: 8, distance: true },
    { id: 'strength', label: 'Strength', met: 5, distance: false },
    { id: 'yoga', label: 'Yoga', met: 2.5, distance: false },
    { id: 'hiit', label: 'HIIT', met: 8, distance: false },
    { id: 'other', label: 'Other', met: 5, distance: true },
  ];
  function workoutType(id) { return WORKOUTS.find(function (w) { return w.id === id; }) || WORKOUTS[WORKOUTS.length - 1]; }

  function bmi(kg, cm) { return kg && cm ? kg / Math.pow(cm / 100, 2) : null; }
  function bmiCategory(v) {
    if (v == null) return '';
    if (v < 18.5) return 'Underweight';
    if (v < 25) return 'Healthy weight';
    if (v < 30) return 'Overweight';
    return 'Obese';
  }
  // Mifflin-St Jeor. "Other" uses the midpoint of the two constants.
  function bmr(p, kg) {
    if (!p || !kg || !p.height_cm || !p.age || !p.gender) return null;
    var c = p.gender === 'male' ? 5 : p.gender === 'female' ? -161 : -78;
    return 10 * kg + 6.25 * p.height_cm - 5 * p.age + c;
  }
  function tdee(p, kg) {
    var b = bmr(p, kg);
    if (b == null || !p.activity_level) return null;
    var a = ACTIVITY.find(function (x) { return x.id === p.activity_level; });
    return a ? b * a.factor : null;
  }
  function estimateBurn(type, minutes, kg) {
    if (!minutes) return null;
    return Math.round(workoutType(type).met * (kg || 70) * minutes / 60);
  }

  function autoGoals(p, kg) {
    var t = tdee(p, kg);
    var cal = 2000;
    if (t) {
      cal = t;
      if (p.target_weight_kg && kg) {
        if (p.target_weight_kg < kg - 0.5) cal = t - 500;
        else if (p.target_weight_kg > kg + 0.5) cal = t + 300;
      }
      cal = Math.max(1200, Math.round(cal / 10) * 10);
    }
    return {
      calories: cal,
      protein: Math.round(cal * 0.3 / 4),
      carbs: Math.round(cal * 0.4 / 4),
      fat: Math.round(cal * 0.3 / 9),
      water: kg ? Math.max(1500, Math.round(kg * 35 / 250) * 250) : 2000,
      steps: 8000,
      workoutMinutes: 150,
    };
  }

  // --------------------------------------------------------------- state

  var S = {
    data: null,       // last /api/state payload
    tab: 'home',
    viewDay: today(),
    progressMode: 'daily',
    progressMetric: 'calories',
    weightRange: 30,
  };

  function profile() { return (S.data && S.data.profile) || {}; }
  function settings() { return profile().settings || {}; }
  function latestWeight() {
    var w = S.data && S.data.weights;
    return w && w.length ? w[w.length - 1].weight_kg : null;
  }
  function goals() {
    var auto = autoGoals(profile(), latestWeight());
    var custom = profile().goals || {};
    var out = {};
    Object.keys(auto).forEach(function (k) { out[k] = custom[k] != null ? custom[k] : auto[k]; });
    return out;
  }
  function dayStats(d) {
    var rows = (S.data && S.data.days) || [];
    for (var i = 0; i < rows.length; i++) if (rows[i].day === d) return rows[i];
    return { day: d, calories: 0, protein: 0, carbs: 0, fat: 0, meals: 0, water: 0, steps: 0, workout_min: 0, workout_kcal: 0, workouts: 0, max_distance: 0 };
  }
  function weekMinutes(endDay) {
    var start = weekStart(endDay), total = 0;
    for (var d = start; d <= endDay; d = addDays(d, 1)) total += dayStats(d).workout_min || 0;
    return total;
  }

  function api(method, url, body) {
    var headers = { 'Content-Type': 'application/json' };
    if (TOKEN) headers['x-usernode-token'] = TOKEN;
    if (window.usernode && usernode.previewNow) headers['x-usernode-now'] = now().toISOString();
    return fetch(url, { method: method, headers: headers, body: body ? JSON.stringify(body) : undefined })
      .then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (j) {
          if (!r.ok) { var e = new Error(j.error || ('Request failed (' + r.status + ')')); e.status = r.status; throw e; }
          return j;
        });
      });
  }

  function load() {
    return api('GET', '/api/state?day=' + S.viewDay).then(function (d) {
      S.data = d;
      syncThemeFromProfile();
      render();
    }).catch(function (e) {
      if (e.status === 401) return renderSignedOut();
      $('#app').innerHTML = '<div class="py-16 text-center"><p class="text-sm text-zinc-600 dark:text-zinc-300">Could not load your data. Check your connection and try again.</p>' +
        '<button id="retry" class="mt-4 px-4 py-2 rounded-xl bg-violet-600 text-white text-sm font-semibold">Try again</button></div>';
      $('#retry').onclick = load;
    });
  }

  // Run a write, then refresh. Errors surface as a toast with the server's
  // message (validation text is written for people).
  function save(method, url, body, done) {
    return api(method, url, body).then(function (r) {
      if (done) done(r);
      return load().then(function () { return r; });
    }).catch(function (e) {
      toast(e.message || 'Could not save. Try again.');
      throw e;
    });
  }

  function syncThemeFromProfile() {
    var t = settings().theme;
    if (!t) return;
    try { localStorage.setItem('mf-theme', t); } catch (_) {}
    if (window.mfApplyTheme) window.mfApplyTheme();
  }

  // ------------------------------------------------------------ UI pieces

  var CARD = 'rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 p-4';
  var BTN_PRIMARY = 'inline-flex items-center justify-center gap-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-semibold px-4 py-2.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400';
  var BTN_SECONDARY = 'inline-flex items-center justify-center gap-1.5 rounded-xl bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-100 text-sm font-medium px-3 py-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400';
  var BTN_ICON = 'un-touch-target inline-flex items-center justify-center w-8 h-8 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400';
  var INPUT = 'w-full rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2.5 text-base text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500';
  var LABEL = 'block text-sm font-medium text-zinc-600 dark:text-zinc-300 mb-1';
  var MUTED = 'text-zinc-500 dark:text-zinc-400';

  function h2(text, right) {
    return '<div class="flex items-center justify-between mt-6 mb-2 px-1"><h2 class="text-base font-semibold">' + text + '</h2>' + (right || '') + '</div>';
  }

  // bar: a thin rounded meter. `fill` must be a whole Tailwind class literal.
  function bar(value, goal, fill) {
    var pct = goal > 0 ? Math.min(100, Math.round(value / goal * 100)) : 0;
    return '<div class="h-2 rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + pct + '">' +
      '<div class="h-full rounded-full ' + fill + '" style="width:' + pct + '%"></div></div>';
  }

  function ring(value, goal, size) {
    var r = 42, c = 2 * Math.PI * r;
    var pct = goal > 0 ? Math.min(1, value / goal) : 0;
    return '<svg viewBox="0 0 100 100" class="' + (size || 'w-28 h-28') + ' -rotate-90" aria-hidden="true">' +
      '<circle cx="50" cy="50" r="' + r + '" fill="none" stroke-width="9" class="stroke-zinc-100 dark:stroke-zinc-800"/>' +
      '<circle cx="50" cy="50" r="' + r + '" fill="none" stroke-width="9" stroke-linecap="round" class="stroke-violet-500" stroke-dasharray="' + (c * pct).toFixed(1) + ' ' + c.toFixed(1) + '"/></svg>';
  }

  function macroRows(st, g) {
    var rows = [
      { label: 'Protein', v: st.protein, goal: g.protein, fill: 'bg-blue-500' },
      { label: 'Carbs', v: st.carbs, goal: g.carbs, fill: 'bg-amber-600' },
      { label: 'Fat', v: st.fat, goal: g.fat, fill: 'bg-pink-500' },
    ];
    return '<div class="grid grid-cols-3 gap-3">' + rows.map(function (m) {
      return '<div><div class="flex items-baseline justify-between text-sm"><span class="font-medium">' + m.label + '</span></div>' +
        '<p class="text-xs ' + MUTED + ' mb-1.5">' + fmt(m.v) + ' / ' + fmt(m.goal) + ' g</p>' + bar(m.v, m.goal, m.fill) + '</div>';
    }).join('') + '</div>';
  }

  function empty(text, action) {
    return '<div class="py-6 text-center"><p class="text-sm ' + MUTED + '">' + text + '</p>' + (action || '') + '</div>';
  }

  // ------------------------------------------------------------- shell

  var TABS = [
    { id: 'home', label: 'Home', title: 'Today' },
    { id: 'food', label: 'Food', title: 'Food' },
    { id: 'workout', label: 'Workout', title: 'Workout' },
    { id: 'progress', label: 'Progress', title: 'Progress' },
    { id: 'profile', label: 'Profile', title: 'Profile' },
  ];

  function renderTabbar() {
    $('#tabbar > div').innerHTML = TABS.map(function (t) {
      var on = t.id === S.tab;
      return '<button type="button" data-tab="' + t.id + '" aria-current="' + (on ? 'page' : 'false') + '" class="flex flex-col items-center gap-0.5 pt-2 pb-2 text-xs font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 ' +
        (on ? 'text-violet-600 dark:text-violet-400' : 'text-zinc-500 dark:text-zinc-400') + '">' + icon(t.id, 'w-6 h-6') + '<span>' + t.label + '</span></button>';
    }).join('');
  }

  function go(tab) {
    if (!TABS.some(function (t) { return t.id === tab; })) tab = 'home';
    if (tab === S.tab && S.data) return;
    S.tab = tab;
    if (location.hash.slice(1) !== tab) history.replaceState(null, '', location.pathname + location.search + '#' + tab);
    // Home and Progress always mean today; the day picker only applies to Food and Workout.
    if ((tab === 'home' || tab === 'progress' || tab === 'profile') && S.viewDay !== today()) {
      S.viewDay = today();
      return load();
    }
    render();
    window.scrollTo(0, 0);
  }

  function renderDaySwitch() {
    var el = $('#day-switch');
    var show = S.tab === 'food' || S.tab === 'workout';
    el.classList.toggle('hidden', !show);
    el.classList.toggle('flex', show);
    if (!show) return;
    var isToday = S.viewDay === today();
    el.innerHTML = '<button type="button" data-day="-1" class="' + BTN_ICON + '" aria-label="Previous day">' + icon('left', 'w-5 h-5') + '</button>' +
      '<span class="text-sm font-medium w-28 text-center">' + (isToday ? 'Today' : esc(dayLabel(S.viewDay))) + '</span>' +
      '<button type="button" data-day="1" class="' + BTN_ICON + (isToday ? ' invisible' : '') + '" aria-label="Next day">' + icon('right', 'w-5 h-5') + '</button>';
  }

  function render() {
    if (!S.data) return;
    var t = TABS.find(function (x) { return x.id === S.tab; });
    $('#page-title').textContent = t.title;
    renderTabbar();
    renderDaySwitch();
    var html = { home: viewHome, food: viewFood, workout: viewWorkout, progress: viewProgress, profile: viewProfile }[S.tab]();
    $('#app').innerHTML = html;
    if (S.tab === 'progress') bindCharts();
    if (S.tab === 'profile') bindProfile();
  }

  function renderSignedOut() {
    $('#page-title').textContent = 'My Fitness';
    renderTabbar();
    $('#app').innerHTML = '<div class="py-16 text-center max-w-xs mx-auto">' +
      '<div class="mx-auto w-12 h-12 rounded-full bg-violet-100 dark:bg-violet-500/15 text-violet-600 dark:text-violet-400 flex items-center justify-center">' + icon('profile', 'w-6 h-6') + '</div>' +
      '<h2 class="mt-4 text-lg font-semibold">Sign in to track your fitness</h2>' +
      '<p class="mt-1 text-sm ' + MUTED + '">Your meals, workouts and progress are saved to your Homeroom account.</p>' +
      '<button type="button" id="ask-account" class="mt-5 ' + BTN_PRIMARY + '">Make an account</button></div>';
    $('#ask-account').onclick = function () {
      if (window.usernode && usernode.askForAccount) usernode.askForAccount({ action: 'track your fitness' });
    };
  }

  // -------------------------------------------------------------- Home

  function viewHome() {
    var d = today(), st = dayStats(d), g = goals(), p = profile();
    var kg = latestWeight();
    var remaining = g.calories - st.calories + st.workout_kcal;
    var setupNeeded = !p.age || !p.height_cm || !kg || !p.gender || !p.activity_level;
    var name = S.data.user && S.data.user.username;

    var html = '<p class="px-1 text-sm ' + MUTED + '">' + esc(dayLabel(d, { weekday: 'long', month: 'long', day: 'numeric' })) + (name ? ' &middot; Hi, ' + esc(name) : '') + '</p>';

    if (setupNeeded) {
      html += '<button type="button" data-go="profile" class="mt-3 w-full text-left ' + CARD + ' flex items-center gap-3 hover:border-violet-300 dark:hover:border-violet-500/50">' +
        '<span class="w-10 h-10 shrink-0 rounded-full bg-violet-100 dark:bg-violet-500/15 text-violet-600 dark:text-violet-400 flex items-center justify-center">' + icon('profile') + '</span>' +
        '<span class="flex-1"><span class="block text-sm font-semibold">Set up your profile</span><span class="block text-sm ' + MUTED + '">Add your age, height and weight to get personal goals.</span></span>' +
        icon('right', 'w-5 h-5 text-zinc-400') + '</button>';
    }

    html += '<button type="button" data-go="food" class="mt-3 w-full text-left ' + CARD + ' flex items-center gap-5 hover:border-violet-300 dark:hover:border-violet-500/50">' +
      '<div class="relative shrink-0">' + ring(st.calories, g.calories) +
      '<div class="absolute inset-0 flex flex-col items-center justify-center"><span class="text-2xl font-bold tabular-nums">' + fmt(Math.abs(remaining)) + '</span><span class="text-xs ' + MUTED + '">' + (remaining >= 0 ? 'kcal left' : 'kcal over') + '</span></div></div>' +
      '<div class="flex-1 grid gap-2 text-sm">' +
      '<div class="flex justify-between"><span class="' + MUTED + '">Goal</span><span class="font-medium tabular-nums">' + fmt(g.calories) + '</span></div>' +
      '<div class="flex justify-between"><span class="' + MUTED + '">Eaten</span><span class="font-medium tabular-nums">' + fmt(st.calories) + '</span></div>' +
      '<div class="flex justify-between"><span class="' + MUTED + '">Burned</span><span class="font-medium tabular-nums">' + fmt(st.workout_kcal) + '</span></div>' +
      '</div></button>';

    html += '<div class="mt-3 ' + CARD + '">' + macroRows(st, g) + '</div>';

    var lastW = S.data.weights.length ? S.data.weights[S.data.weights.length - 1] : null;
    var toTarget = kg && p.target_weight_kg ? kg - p.target_weight_kg : null;
    var tiles = [
      { go: 'workout', icon: 'steps', label: 'Steps', value: fmt(st.steps), sub: 'of ' + fmt(g.steps), v: st.steps, goal: g.steps, fill: 'bg-violet-500' },
      { go: 'food', icon: 'water', label: 'Water', value: fmt(st.water) + ' ml', sub: 'of ' + fmt(g.water) + ' ml', v: st.water, goal: g.water, fill: 'bg-sky-600' },
      { go: 'progress', icon: 'scale', label: 'Weight', value: kg ? fmt(kg, 1) + ' kg' : 'Not set',
        sub: toTarget == null ? (lastW ? 'Logged ' + dayLabel(lastW.day, { month: 'short', day: 'numeric' }) : 'Log your weight') : (Math.abs(toTarget) < 0.05 ? 'At target' : fmt(Math.abs(toTarget), 1) + ' kg to target') },
      { go: 'workout', icon: 'workout', label: 'Workouts', value: fmt(st.workout_min) + ' min', sub: fmt(weekMinutes(d)) + ' of ' + fmt(g.workoutMinutes) + ' min this week', v: weekMinutes(d), goal: g.workoutMinutes, fill: 'bg-violet-500' },
    ];
    html += '<div class="mt-3 grid grid-cols-2 gap-3">' + tiles.map(function (t) {
      return '<button type="button" data-go="' + t.go + '" class="text-left ' + CARD + ' hover:border-violet-300 dark:hover:border-violet-500/50 flex flex-col gap-1">' +
        '<span class="flex items-center gap-2 text-sm ' + MUTED + '">' + icon(t.icon, 'w-4 h-4') + t.label + '</span>' +
        '<span class="text-xl font-bold tabular-nums">' + t.value + '</span>' +
        '<span class="text-xs ' + MUTED + '">' + esc(t.sub) + '</span>' +
        (t.goal ? '<span class="mt-1.5">' + bar(t.v, t.goal, t.fill) + '</span>' : '') + '</button>';
    }).join('') + '</div>';

    // Today's workouts, at a glance.
    var ws = S.viewDay === d ? S.data.today.workouts : [];
    html += h2('Today\'s workouts', '<button type="button" data-action="add-workout" class="text-sm font-medium text-violet-600 dark:text-violet-400">Log workout</button>');
    html += '<div class="' + CARD + '">' + (ws.length ? workoutList(ws, false) : empty('No workouts yet today.')) + '</div>';
    return html;
  }

  // -------------------------------------------------------------- Food

  function viewFood() {
    var d = S.viewDay, t = S.data.today, g = goals();
    var st = { calories: 0, protein: 0, carbs: 0, fat: 0 };
    t.food.forEach(function (f) { st.calories += f.calories; st.protein += f.protein; st.carbs += f.carbs; st.fat += f.fat; });
    var burned = t.workouts.reduce(function (s, w) { return s + w.calories; }, 0);
    var remaining = g.calories - st.calories + burned;
    var water = t.water.reduce(function (s, w) { return s + w.ml; }, 0);

    var html = '<div class="' + CARD + '">' +
      '<div class="flex items-baseline justify-between"><span class="text-sm ' + MUTED + '">Calories remaining</span>' +
      '<span class="text-2xl font-bold tabular-nums">' + fmt(remaining) + '</span></div>' +
      '<p class="mt-1 text-xs ' + MUTED + ' tabular-nums">' + fmt(g.calories) + ' goal &minus; ' + fmt(st.calories) + ' food + ' + fmt(burned) + ' exercise</p>' +
      '<div class="mt-3">' + bar(st.calories, g.calories, 'bg-violet-500') + '</div>' +
      '<div class="mt-4">' + macroRows(st, g) + '</div>' +
      '<button type="button" data-action="add-food" class="mt-4 w-full ' + BTN_PRIMARY + '">' + icon('plus', 'w-4 h-4') + 'Add food</button></div>';

    // Water tracker
    html += h2('Water');
    html += '<div class="' + CARD + '"><div class="flex items-center gap-3">' +
      '<span class="w-10 h-10 shrink-0 rounded-full bg-sky-100 dark:bg-sky-500/15 text-sky-600 dark:text-sky-400 flex items-center justify-center">' + icon('water') + '</span>' +
      '<div class="flex-1"><p class="text-lg font-bold tabular-nums">' + fmt(water) + ' <span class="text-sm font-normal ' + MUTED + '">/ ' + fmt(g.water) + ' ml</span></p>' +
      '<p class="text-xs ' + MUTED + '">' + (water >= g.water ? 'Goal reached. Nice work.' : fmt(g.water - water) + ' ml to go') + '</p></div>' +
      (t.water.length ? '<button type="button" data-action="undo-water" class="text-sm font-medium ' + MUTED + ' hover:text-zinc-800 dark:hover:text-zinc-200">Undo</button>' : '') +
      '</div><div class="mt-3">' + bar(water, g.water, 'bg-sky-600') + '</div>' +
      '<div class="mt-3 grid grid-cols-3 gap-2">' +
      '<button type="button" data-water="250" class="' + BTN_SECONDARY + '">+250 ml</button>' +
      '<button type="button" data-water="500" class="' + BTN_SECONDARY + '">+500 ml</button>' +
      '<button type="button" data-action="custom-water" class="' + BTN_SECONDARY + '">Custom</button></div></div>';

    // Meals
    MEALS.forEach(function (m) {
      var items = t.food.filter(function (f) { return f.meal === m.id; });
      var kcal = items.reduce(function (s, f) { return s + f.calories; }, 0);
      html += h2(m.label + (kcal ? ' <span class="text-sm font-normal ' + MUTED + '">' + fmt(kcal) + ' kcal</span>' : ''),
        '<button type="button" data-action="add-food" data-meal="' + m.id + '" class="' + BTN_ICON + '" aria-label="Add to ' + m.label + '">' + icon('plus', 'w-5 h-5') + '</button>');
      html += '<div class="' + CARD + ' py-1">' + (items.length ? '<ul class="divide-y divide-zinc-100 dark:divide-zinc-800">' + items.map(function (f) {
        return '<li class="flex items-center gap-3 py-2.5"><div class="flex-1 min-w-0"><p class="text-sm font-medium truncate">' + esc(f.name) + '</p>' +
          '<p class="text-xs ' + MUTED + ' tabular-nums">P ' + fmt(f.protein) + ' g &middot; C ' + fmt(f.carbs) + ' g &middot; F ' + fmt(f.fat) + ' g</p></div>' +
          '<span class="text-sm font-semibold tabular-nums">' + fmt(f.calories) + '</span>' +
          '<button type="button" data-del-food="' + f.id + '" class="' + BTN_ICON + '" aria-label="Remove ' + esc(f.name) + '">' + icon('trash', 'w-4 h-4') + '</button></li>';
      }).join('') + '</ul>' : '<p class="py-3 text-sm ' + MUTED + '">Nothing logged.</p>') + '</div>';
    });
    return html;
  }

  function addFoodSheet(meal) {
    if (!meal) {
      var hr = now().getHours();
      meal = hr < 11 ? 'breakfast' : hr < 15 ? 'lunch' : hr >= 17 && hr < 22 ? 'dinner' : 'snack';
    }
    var recent = S.data.recentFoods || [];
    var html = '<form id="food-form" class="grid gap-3 pb-2" novalidate>' +
      '<h2 class="text-lg font-semibold">Add food</h2>' +
      (recent.length ? '<div><p class="' + LABEL + '">Recent</p><div class="flex flex-wrap gap-2">' + recent.map(function (r, i) {
        return '<button type="button" data-recent="' + i + '" class="rounded-full border border-zinc-200 dark:border-zinc-700 px-3 py-1 text-sm">' + esc(r.name) + '</button>';
      }).join('') + '</div></div>' : '') +
      '<div><label class="' + LABEL + '" for="f-name">Food</label><input id="f-name" name="name" class="' + INPUT + '" placeholder="e.g. Oatmeal with banana" maxlength="80" required></div>' +
      '<div><span class="' + LABEL + '">Meal</span><div class="grid grid-cols-4 gap-1 p-1 rounded-xl bg-zinc-100 dark:bg-zinc-800">' + MEALS.map(function (m) {
        return '<label class="cursor-pointer"><input type="radio" name="meal" value="' + m.id + '" class="peer sr-only"' + (m.id === meal ? ' checked' : '') + '>' +
          '<span class="block text-center text-sm py-1.5 rounded-lg peer-checked:bg-white dark:peer-checked:bg-zinc-700 peer-checked:font-semibold peer-focus-visible:ring-2 peer-focus-visible:ring-violet-400">' + m.label + '</span></label>';
      }).join('') + '</div></div>' +
      '<div><label class="' + LABEL + '" for="f-cal">Calories (kcal)</label><input id="f-cal" name="calories" type="number" inputmode="numeric" min="0" class="' + INPUT + '" placeholder="0" required></div>' +
      '<div class="grid grid-cols-3 gap-2">' +
      '<div><label class="' + LABEL + '" for="f-p">Protein (g)</label><input id="f-p" name="protein" type="number" inputmode="decimal" min="0" step="0.1" class="' + INPUT + '" placeholder="0"></div>' +
      '<div><label class="' + LABEL + '" for="f-c">Carbs (g)</label><input id="f-c" name="carbs" type="number" inputmode="decimal" min="0" step="0.1" class="' + INPUT + '" placeholder="0"></div>' +
      '<div><label class="' + LABEL + '" for="f-f">Fat (g)</label><input id="f-f" name="fat" type="number" inputmode="decimal" min="0" step="0.1" class="' + INPUT + '" placeholder="0"></div></div>' +
      '<p id="f-err" class="hidden text-sm text-red-600 dark:text-red-400"></p>' +
      '<button type="submit" class="' + BTN_PRIMARY + '">Add food</button></form>';
    presentSheet(html, function (el, close) {
      var form = $('#food-form', el);
      el.querySelectorAll('[data-recent]').forEach(function (b) {
        b.onclick = function () {
          var r = recent[+b.dataset.recent];
          form.name.value = r.name; form.calories.value = r.calories;
          form.protein.value = r.protein || ''; form.carbs.value = r.carbs || ''; form.fat.value = r.fat || '';
        };
      });
      form.onsubmit = function (e) {
        e.preventDefault();
        var err = $('#f-err', el);
        if (!form.name.value.trim()) { err.textContent = 'Enter a food name.'; err.classList.remove('hidden'); return; }
        if (form.calories.value === '') { err.textContent = 'Enter the calories.'; err.classList.remove('hidden'); return; }
        var body = { day: S.viewDay, name: form.name.value, meal: form.meal.value, calories: form.calories.value,
          protein: form.protein.value, carbs: form.carbs.value, fat: form.fat.value };
        save('POST', '/api/food', body).then(function () { close(); toast('Food added'); })
          .catch(function (e2) { err.textContent = e2.message; err.classList.remove('hidden'); });
      };
    });
  }

  function customWaterSheet() {
    var html = '<form id="water-form" class="grid gap-3 pb-2" novalidate><h2 class="text-lg font-semibold">Add water</h2>' +
      '<div><label class="' + LABEL + '" for="w-ml">Amount (ml)</label><input id="w-ml" name="ml" type="number" inputmode="numeric" min="1" max="5000" class="' + INPUT + '" placeholder="330"></div>' +
      '<button type="submit" class="' + BTN_PRIMARY + '">Add water</button></form>';
    presentSheet(html, function (el, close) {
      var form = $('#water-form', el);
      form.onsubmit = function (e) {
        e.preventDefault();
        if (!form.ml.value) return;
        save('POST', '/api/water', { day: S.viewDay, ml: form.ml.value }).then(close).catch(function () {});
      };
    });
  }

  // ------------------------------------------------------------ Workout

  function speed(w) { return w.distance_km && w.duration_min ? w.distance_km / (w.duration_min / 60) : null; }

  function workoutList(ws, deletable) {
    return '<ul class="divide-y divide-zinc-100 dark:divide-zinc-800">' + ws.map(function (w) {
      var t = workoutType(w.type), sp = speed(w);
      var parts = [fmt(w.duration_min) + ' min'];
      if (w.distance_km) parts.push(fmt(w.distance_km, 2) + ' km');
      if (sp) parts.push(fmt(sp, 1) + ' km/h');
      return '<li class="flex items-center gap-3 py-2.5">' +
        '<span class="w-9 h-9 shrink-0 rounded-full bg-violet-100 dark:bg-violet-500/15 text-violet-600 dark:text-violet-400 flex items-center justify-center">' + icon('workout', 'w-4 h-4') + '</span>' +
        '<div class="flex-1 min-w-0"><p class="text-sm font-medium">' + t.label + '</p><p class="text-xs ' + MUTED + ' tabular-nums">' + parts.join(' &middot; ') + '</p></div>' +
        '<span class="text-sm font-semibold tabular-nums">' + fmt(w.calories) + ' <span class="text-xs font-normal ' + MUTED + '">kcal</span></span>' +
        (deletable ? '<button type="button" data-del-workout="' + w.id + '" class="' + BTN_ICON + '" aria-label="Remove ' + t.label + ' workout">' + icon('trash', 'w-4 h-4') + '</button>' : '') +
        '</li>';
    }).join('') + '</ul>';
  }

  function viewWorkout() {
    var d = S.viewDay, t = S.data.today, g = goals();
    var mins = 0, kcal = 0, dist = 0;
    t.workouts.forEach(function (w) { mins += w.duration_min; kcal += w.calories; dist += w.distance_km || 0; });
    var wk = weekMinutes(d);

    var html = '<div class="' + CARD + '"><div class="grid grid-cols-3 gap-3 text-center">' +
      [['Active', fmt(mins), 'min'], ['Burned', fmt(kcal), 'kcal'], ['Distance', fmt(dist, 1), 'km']].map(function (x) {
        return '<div><p class="text-xs ' + MUTED + '">' + x[0] + '</p><p class="text-xl font-bold tabular-nums">' + x[1] + '</p><p class="text-xs ' + MUTED + '">' + x[2] + '</p></div>';
      }).join('') + '</div>' +
      '<div class="mt-4 flex items-baseline justify-between text-sm"><span class="' + MUTED + '">This week</span><span class="font-medium tabular-nums">' + fmt(wk) + ' / ' + fmt(g.workoutMinutes) + ' min</span></div>' +
      '<div class="mt-1.5">' + bar(wk, g.workoutMinutes, 'bg-violet-500') + '</div>' +
      '<button type="button" data-action="add-workout" class="mt-4 w-full ' + BTN_PRIMARY + '">' + icon('plus', 'w-4 h-4') + 'Log workout</button></div>';

    html += h2('Steps');
    html += '<div class="' + CARD + '"><div class="flex items-center gap-3">' +
      '<span class="w-10 h-10 shrink-0 rounded-full bg-violet-100 dark:bg-violet-500/15 text-violet-600 dark:text-violet-400 flex items-center justify-center">' + icon('steps') + '</span>' +
      '<div class="flex-1"><label for="steps-input" class="text-sm ' + MUTED + '">Steps (goal ' + fmt(g.steps) + ')</label>' +
      '<input id="steps-input" type="number" inputmode="numeric" min="0" max="200000" value="' + (t.steps || '') + '" placeholder="0" class="mt-1 ' + INPUT + '"></div></div>' +
      '<div class="mt-3">' + bar(t.steps, g.steps, 'bg-violet-500') + '</div>' +
      '<p class="mt-2 text-xs ' + MUTED + '">Copy today\'s count from your phone or watch. It saves when you leave the field.</p></div>';

    html += h2('Workouts');
    html += '<div class="' + CARD + ' py-1">' + (t.workouts.length ? workoutList(t.workouts, true)
      : empty('No workouts logged' + (d === today() ? ' today.' : ' on this day.'))) + '</div>';
    return html;
  }

  function addWorkoutSheet() {
    var kg = latestWeight();
    var html = '<form id="workout-form" class="grid gap-3 pb-2" novalidate><h2 class="text-lg font-semibold">Log workout</h2>' +
      '<div><span class="' + LABEL + '">Type</span><div class="grid grid-cols-4 gap-2">' + WORKOUTS.map(function (w, i) {
        return '<label class="cursor-pointer"><input type="radio" name="type" value="' + w.id + '" class="peer sr-only"' + (i === 0 ? ' checked' : '') + '>' +
          '<span class="block text-center text-sm py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 peer-checked:border-violet-500 peer-checked:bg-violet-50 dark:peer-checked:bg-violet-500/15 peer-checked:font-semibold peer-focus-visible:ring-2 peer-focus-visible:ring-violet-400">' + w.label + '</span></label>';
      }).join('') + '</div></div>' +
      '<div class="grid grid-cols-2 gap-2">' +
      '<div><label class="' + LABEL + '" for="w-dur">Duration (min)</label><input id="w-dur" name="duration_min" type="number" inputmode="numeric" min="1" class="' + INPUT + '" placeholder="30"></div>' +
      '<div id="w-dist-wrap"><label class="' + LABEL + '" for="w-dist">Distance (km)</label><input id="w-dist" name="distance_km" type="number" inputmode="decimal" min="0" step="0.01" class="' + INPUT + '" placeholder="Optional"></div></div>' +
      '<div><label class="' + LABEL + '" for="w-cal">Calories burned (kcal)</label><input id="w-cal" name="calories" type="number" inputmode="numeric" min="0" class="' + INPUT + '" placeholder="Estimated automatically"></div>' +
      '<p id="w-calc" class="text-sm ' + MUTED + ' tabular-nums"></p>' +
      '<p id="w-err" class="hidden text-sm text-red-600 dark:text-red-400"></p>' +
      '<button type="submit" class="' + BTN_PRIMARY + '">Log workout</button></form>';
    presentSheet(html, function (el, close) {
      var form = $('#workout-form', el);
      function update() {
        var type = form.type.value, dur = +form.duration_min.value || 0, dist = +form.distance_km.value || 0;
        $('#w-dist-wrap', el).classList.toggle('opacity-50', !workoutType(type).distance);
        var est = estimateBurn(type, dur, kg);
        form.calories.placeholder = est ? 'About ' + est + ' (estimate)' : 'Estimated automatically';
        var bits = [];
        if (dur && dist) bits.push('Speed ' + fmt(dist / (dur / 60), 1) + ' km/h');
        if (dur && dist > 0) { var sec = Math.round(dur * 60 / dist); bits.push('Pace ' + Math.floor(sec / 60) + ':' + pad(sec % 60) + ' min/km'); }
        $('#w-calc', el).textContent = bits.join(' · ');
      }
      form.addEventListener('input', update);
      form.addEventListener('change', update);
      update();
      form.onsubmit = function (e) {
        e.preventDefault();
        var err = $('#w-err', el);
        var dur = +form.duration_min.value;
        if (!dur) { err.textContent = 'Enter how long the workout took.'; err.classList.remove('hidden'); return; }
        var cal = form.calories.value !== '' ? form.calories.value : estimateBurn(form.type.value, dur, kg);
        save('POST', '/api/workouts', { day: S.viewDay, type: form.type.value, duration_min: dur,
          distance_km: form.distance_km.value, calories: cal })
          .then(function () { close(); toast('Workout logged'); })
          .catch(function (e2) { err.textContent = e2.message; err.classList.remove('hidden'); });
      };
    });
  }

  // ----------------------------------------------------------- Progress

  // Achievements are worked out from the per-day totals the server sends.
  function hasRun(daysSet, len) {
    var list = Array.from(daysSet).sort(), run = 0, prev = null;
    for (var i = 0; i < list.length; i++) {
      run = prev && addDays(prev, 1) === list[i] ? run + 1 : 1;
      if (run >= len) return true;
      prev = list[i];
    }
    return false;
  }

  function achievements() {
    var rows = S.data.days, g = goals(), p = profile(), w = S.data.weights;
    var foodDays = new Set(), waterDays = new Set(), totalWorkouts = 0, maxSteps = 0, maxDist = 0;
    var minutesByDay = {};
    rows.forEach(function (r) {
      if (r.meals > 0) foodDays.add(r.day);
      if (g.water && r.water >= g.water) waterDays.add(r.day);
      totalWorkouts += r.workouts;
      maxSteps = Math.max(maxSteps, r.steps);
      maxDist = Math.max(maxDist, r.max_distance || 0);
      if (r.workout_min) minutesByDay[r.day] = r.workout_min;
    });
    // Any 7-day window with 150+ active minutes.
    var activeWeek = Object.keys(minutesByDay).some(function (end) {
      var sum = 0;
      for (var i = 0; i < 7; i++) sum += minutesByDay[addDays(end, -i)] || 0;
      return sum >= 150;
    });
    var first = w.length ? w[0].weight_kg : null, last = w.length ? w[w.length - 1].weight_kg : null;
    var target = p.target_weight_kg;
    var reachedTarget = !!(target && first != null && Math.abs(first - target) > 0.5 && Math.abs(last - target) <= 0.5);
    return [
      { title: 'First bite', desc: 'Log your first food', earned: foodDays.size > 0 },
      { title: 'Off the couch', desc: 'Log your first workout', earned: totalWorkouts > 0 },
      { title: 'Hydrated', desc: 'Reach your water goal in a day', earned: waterDays.size > 0 },
      { title: 'Hydration streak', desc: 'Reach your water goal 7 days in a row', earned: hasRun(waterDays, 7) },
      { title: 'Week of logging', desc: 'Log food 7 days in a row', earned: hasRun(foodDays, 7) },
      { title: '10K day', desc: 'Walk 10,000 steps in a day', earned: maxSteps >= 10000 },
      { title: '5K finisher', desc: 'Cover 5 km in one workout', earned: maxDist >= 5 },
      { title: 'Active week', desc: '150 workout minutes in 7 days', earned: activeWeek },
      { title: 'Ten workouts', desc: 'Log 10 workouts', earned: totalWorkouts >= 10 },
      { title: 'Target reached', desc: 'Reach your target weight', earned: reachedTarget },
    ];
  }

  var METRICS = [
    { id: 'calories', label: 'Calories', unit: 'kcal', key: 'calories', has: 'meals' },
    { id: 'water', label: 'Water', unit: 'ml', key: 'water', has: 'water' },
    { id: 'steps', label: 'Steps', unit: 'steps', key: 'steps', has: 'steps' },
    { id: 'workout', label: 'Workout', unit: 'min', key: 'workout_min', has: 'workouts' },
  ];

  // Bars for the chosen metric: 7 days, or 8 weeks (daily average for
  // intake metrics over the days logged, total minutes for workouts).
  function activitySeries() {
    var m = METRICS.find(function (x) { return x.id === S.progressMetric; }), g = goals(), d = today();
    var bars = [], goal = null;
    if (S.progressMode === 'daily') {
      for (var i = 6; i >= 0; i--) {
        var day = addDays(d, -i), st = dayStats(day);
        bars.push({ label: dayLabel(day, { weekday: 'short' }), full: dayLabel(day), value: st[m.key] || 0 });
      }
      goal = m.id === 'workout' ? null : g[m.id];
    } else {
      var ws = weekStart(d);
      for (var k = 7; k >= 0; k--) {
        var start = addDays(ws, -7 * k), sum = 0, n = 0;
        for (var j = 0; j < 7; j++) {
          var dd = addDays(start, j);
          if (dd > d) break;
          var s2 = dayStats(dd);
          if (s2[m.has] > 0) { sum += s2[m.key] || 0; n++; }
        }
        var v = m.id === 'workout' ? sum : (n ? sum / n : 0);
        bars.push({ label: dayLabel(start, { month: 'short', day: 'numeric' }), full: 'Week of ' + dayLabel(start, { month: 'short', day: 'numeric' }) + (m.id === 'workout' ? '' : ', daily average'), value: Math.round(v) });
      }
      goal = m.id === 'workout' ? g.workoutMinutes : g[m.id];
    }
    return { metric: m, bars: bars, goal: goal };
  }

  var CH_W = 340, CH_H = 170, PAD_L = 40, PAD_R = 8, PAD_T = 12, PAD_B = 24;

  function niceMax(v) {
    if (v <= 0) return 1;
    var e = Math.pow(10, Math.floor(Math.log10(v))), f = v / e;
    var steps = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];
    for (var i = 0; i < steps.length; i++) if (f <= steps[i]) return steps[i] * e;
    return 10 * e;
  }

  function barChart(series) {
    var bars = series.bars, max = niceMax(Math.max(series.goal || 0, Math.max.apply(null, bars.map(function (b) { return b.value; }))) * 1.05);
    var plotW = CH_W - PAD_L - PAD_R, plotH = CH_H - PAD_T - PAD_B, slot = plotW / bars.length, bw = Math.min(28, slot * 0.6);
    var y = function (v) { return PAD_T + plotH - v / max * plotH; };
    var svg = '<svg viewBox="0 0 ' + CH_W + ' ' + CH_H + '" class="w-full h-auto max-h-64" role="img" aria-label="' + esc(series.metric.label) + ' chart">';
    [0, 0.5, 1].forEach(function (f) {
      var gy = y(max * f);
      svg += '<line x1="' + PAD_L + '" x2="' + (CH_W - PAD_R) + '" y1="' + gy + '" y2="' + gy + '" class="stroke-zinc-200 dark:stroke-zinc-800" stroke-width="1"/>' +
        '<text x="' + (PAD_L - 6) + '" y="' + (gy + 3.5) + '" text-anchor="end" class="fill-zinc-500 dark:fill-zinc-400" font-size="10">' + fmt(max * f) + '</text>';
    });
    bars.forEach(function (b, i) {
      var x = PAD_L + slot * i + (slot - bw) / 2, top = y(b.value), hgt = PAD_T + plotH - top;
      var r = Math.min(4, hgt, bw / 2);
      if (hgt > 0.5) {
        svg += '<path data-bar="' + i + '" class="fill-violet-500" d="M' + x + ',' + (PAD_T + plotH) + 'V' + (top + r) + 'Q' + x + ',' + top + ' ' + (x + r) + ',' + top +
          'H' + (x + bw - r) + 'Q' + (x + bw) + ',' + top + ' ' + (x + bw) + ',' + (top + r) + 'V' + (PAD_T + plotH) + 'Z"/>';
      }
      svg += '<text x="' + (x + bw / 2) + '" y="' + (CH_H - 6) + '" text-anchor="middle" class="fill-zinc-500 dark:fill-zinc-400" font-size="10">' + esc(b.label) + '</text>' +
        '<rect data-hit="' + i + '" x="' + (PAD_L + slot * i) + '" y="' + PAD_T + '" width="' + slot + '" height="' + plotH + '" fill="transparent"/>';
    });
    if (series.goal) {
      var gy2 = y(series.goal);
      svg += '<line x1="' + PAD_L + '" x2="' + (CH_W - PAD_R) + '" y1="' + gy2 + '" y2="' + gy2 + '" class="stroke-zinc-400 dark:stroke-zinc-500" stroke-width="1.5" stroke-dasharray="4 4"/>';
    }
    return svg + '</svg>';
  }

  function weightChart(points, target) {
    if (!points.length) return '';
    var t0 = parseDay(points[0].day).getTime(), t1 = parseDay(points[points.length - 1].day).getTime();
    if (t1 === t0) { t0 -= 86400000; t1 += 86400000; }
    var vals = points.map(function (p) { return p.weight_kg; });
    if (target) vals.push(target);
    var lo = Math.floor(Math.min.apply(null, vals) - 1), hi = Math.ceil(Math.max.apply(null, vals) + 1);
    var plotW = CH_W - PAD_L - PAD_R, plotH = CH_H - PAD_T - PAD_B;
    var x = function (d) { return PAD_L + (parseDay(d).getTime() - t0) / (t1 - t0) * plotW; };
    var y = function (v) { return PAD_T + plotH - (v - lo) / (hi - lo) * plotH; };
    var svg = '<svg id="weight-svg" viewBox="0 0 ' + CH_W + ' ' + CH_H + '" class="w-full h-auto max-h-64 touch-none" role="img" aria-label="Weight chart">';
    [lo, (lo + hi) / 2, hi].forEach(function (v) {
      svg += '<line x1="' + PAD_L + '" x2="' + (CH_W - PAD_R) + '" y1="' + y(v) + '" y2="' + y(v) + '" class="stroke-zinc-200 dark:stroke-zinc-800" stroke-width="1"/>' +
        '<text x="' + (PAD_L - 6) + '" y="' + (y(v) + 3.5) + '" text-anchor="end" class="fill-zinc-500 dark:fill-zinc-400" font-size="10">' + fmt(v, 1) + '</text>';
    });
    [points[0], points[points.length - 1]].forEach(function (p, i) {
      svg += '<text x="' + (i ? CH_W - PAD_R : PAD_L) + '" y="' + (CH_H - 6) + '" text-anchor="' + (i ? 'end' : 'start') + '" class="fill-zinc-500 dark:fill-zinc-400" font-size="10">' + esc(dayLabel(p.day, { month: 'short', day: 'numeric' })) + '</text>';
    });
    if (target) {
      svg += '<line x1="' + PAD_L + '" x2="' + (CH_W - PAD_R) + '" y1="' + y(target) + '" y2="' + y(target) + '" class="stroke-zinc-400 dark:stroke-zinc-500" stroke-width="1.5" stroke-dasharray="4 4"/>' +
        '<text x="' + (CH_W - PAD_R) + '" y="' + (y(target) - 4) + '" text-anchor="end" class="fill-zinc-500 dark:fill-zinc-400" font-size="10">Target</text>';
    }
    var d = points.map(function (p, i) { return (i ? 'L' : 'M') + x(p.day).toFixed(1) + ',' + y(p.weight_kg).toFixed(1); }).join('');
    svg += '<path d="' + d + '" fill="none" class="stroke-violet-500" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>';
    var last = points[points.length - 1];
    svg += '<line id="w-cross" x1="0" x2="0" y1="' + PAD_T + '" y2="' + (PAD_T + plotH) + '" class="stroke-zinc-300 dark:stroke-zinc-600 hidden" stroke-width="1"/>' +
      '<circle id="w-dot" cx="' + x(last.day) + '" cy="' + y(last.weight_kg) + '" r="4.5" class="fill-violet-500 stroke-white dark:stroke-zinc-900" stroke-width="2"/>';
    svg += '<rect id="w-hit" x="' + PAD_L + '" y="0" width="' + plotW + '" height="' + CH_H + '" fill="transparent"/>';
    weightChart.geom = { x: x, y: y, points: points };
    return svg + '</svg>';
  }

  function seg(name, options, current) {
    return '<div class="inline-grid ' + (options.length === 3 ? 'grid-cols-3' : 'grid-cols-2') + ' gap-1 p-1 rounded-xl bg-zinc-100 dark:bg-zinc-800" role="group">' + options.map(function (o) {
      var on = String(o.id) === String(current);
      return '<button type="button" data-' + name + '="' + o.id + '" aria-pressed="' + on + '" class="px-3 py-1 rounded-lg text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 ' +
        (on ? 'bg-white dark:bg-zinc-700 font-semibold' : MUTED) + '">' + o.label + '</button>';
    }).join('') + '</div>';
  }

  function viewProgress() {
    var p = profile(), g = goals(), w = S.data.weights, kg = latestWeight();
    var html = '';

    // Weight
    var first = w.length ? w[0].weight_kg : null;
    var change = kg != null && first != null ? kg - first : null;
    var toTarget = kg != null && p.target_weight_kg ? kg - p.target_weight_kg : null;
    var cutoff = S.weightRange ? addDays(today(), -S.weightRange) : '0000';
    var pts = w.filter(function (x) { return x.day >= cutoff; });
    html += '<div class="' + CARD + '"><div class="flex items-start justify-between gap-3"><div>' +
      '<p class="text-sm ' + MUTED + '">Weight</p><p class="text-2xl font-bold tabular-nums">' + (kg != null ? fmt(kg, 1) + ' <span class="text-sm font-normal ' + MUTED + '">kg</span>' : 'Not set') + '</p></div>' +
      '<button type="button" data-action="log-weight" class="' + BTN_PRIMARY + '">' + icon('plus', 'w-4 h-4') + 'Log weight</button></div>' +
      '<div class="mt-3 grid grid-cols-2 gap-3 text-sm"><div><p class="' + MUTED + '">Since start</p><p class="font-semibold tabular-nums">' + (change == null ? '-' : (change > 0 ? '+' : '') + fmt(change, 1) + ' kg') + '</p></div>' +
      '<div><p class="' + MUTED + '">To target</p><p class="font-semibold tabular-nums">' + (toTarget == null ? 'Set a target in Profile' : Math.abs(toTarget) < 0.05 ? 'At target' : fmt(Math.abs(toTarget), 1) + ' kg') + '</p></div></div>';
    if (w.length) {
      html += '<div class="mt-4 flex items-center justify-between gap-2"><p id="w-readout" class="text-sm ' + MUTED + ' tabular-nums"></p>' +
        seg('wrange', [{ id: 30, label: '1M' }, { id: 90, label: '3M' }, { id: 0, label: 'All' }], S.weightRange) + '</div>' +
        '<div class="mt-2">' + (pts.length ? weightChart(pts, p.target_weight_kg) : empty('No weigh-ins in this period.')) + '</div>';
      var recent = w.slice(-5).reverse();
      html += '<ul class="mt-3 divide-y divide-zinc-100 dark:divide-zinc-800 border-t border-zinc-100 dark:border-zinc-800">' + recent.map(function (x) {
        return '<li class="flex items-center justify-between py-2 text-sm"><span class="' + MUTED + '">' + esc(dayLabel(x.day)) + '</span>' +
          '<span class="flex items-center gap-2"><span class="font-medium tabular-nums">' + fmt(x.weight_kg, 1) + ' kg</span>' +
          '<button type="button" data-del-weight="' + x.day + '" class="' + BTN_ICON + '" aria-label="Remove weigh-in on ' + esc(dayLabel(x.day)) + '">' + icon('trash', 'w-4 h-4') + '</button></span></li>';
      }).join('') + '</ul>';
    } else {
      html += empty('Log your weight to see your progress chart.');
    }
    html += '</div>';

    // Activity charts
    var series = activitySeries();
    html += h2('Activity', seg('pmode', [{ id: 'daily', label: 'Daily' }, { id: 'weekly', label: 'Weekly' }], S.progressMode));
    html += '<div class="' + CARD + '"><div class="flex flex-wrap gap-2">' + METRICS.map(function (m) {
      var on = m.id === S.progressMetric;
      return '<button type="button" data-metric="' + m.id + '" aria-pressed="' + on + '" class="rounded-full px-3 py-1 text-sm border focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 ' +
        (on ? 'border-violet-500 bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300 font-semibold' : 'border-zinc-200 dark:border-zinc-700 ' + MUTED) + '">' + m.label + '</button>';
    }).join('') + '</div>' +
      '<p id="bar-readout" class="mt-3 text-sm tabular-nums"></p>' +
      '<div class="mt-1" id="bar-chart">' + barChart(series) + '</div>' +
      (series.goal ? '<p class="mt-1 text-xs ' + MUTED + '">Dashed line: your goal (' + fmt(series.goal) + ' ' + series.metric.unit + ')</p>' : '') + '</div>';
    activitySeries.last = series;

    // Goals for today
    var st = dayStats(today()), wk = weekMinutes(today());
    var goalRows = [
      { label: 'Calories', v: st.calories, goal: g.calories, unit: 'kcal', within: true },
      { label: 'Protein', v: st.protein, goal: g.protein, unit: 'g' },
      { label: 'Water', v: st.water, goal: g.water, unit: 'ml' },
      { label: 'Steps', v: st.steps, goal: g.steps, unit: '' },
      { label: 'Workout this week', v: wk, goal: g.workoutMinutes, unit: 'min' },
    ];
    html += h2('Today\'s goals', '<button type="button" data-go="profile" class="text-sm font-medium text-violet-600 dark:text-violet-400">Edit goals</button>');
    html += '<div class="' + CARD + ' py-1"><ul class="divide-y divide-zinc-100 dark:divide-zinc-800">' + goalRows.map(function (r) {
      var met = r.within ? (r.v > 0 && r.v <= r.goal) : r.v >= r.goal;
      return '<li class="flex items-center gap-3 py-2.5">' +
        '<span class="w-6 h-6 shrink-0 rounded-full flex items-center justify-center ' + (met ? 'bg-violet-600 text-white' : 'border border-zinc-300 dark:border-zinc-600') + '">' + (met ? icon('check', 'w-3.5 h-3.5') : '') + '</span>' +
        '<span class="flex-1 text-sm">' + r.label + '</span>' +
        '<span class="text-sm tabular-nums ' + MUTED + '">' + fmt(r.v) + ' / ' + fmt(r.goal) + (r.unit ? ' ' + r.unit : '') + '</span>' +
        '<span class="sr-only">' + (met ? 'Goal met' : 'Not met yet') + '</span></li>';
    }).join('') + '</ul></div>';

    // Achievements
    var ach = achievements(), earned = ach.filter(function (a) { return a.earned; }).length;
    html += h2('Achievements', '<span class="text-sm ' + MUTED + '">' + earned + ' of ' + ach.length + '</span>');
    html += '<div class="grid grid-cols-2 gap-3">' + ach.map(function (a) {
      return '<div class="' + CARD + ' flex items-start gap-3' + (a.earned ? '' : ' opacity-60') + '">' +
        '<span class="w-9 h-9 shrink-0 rounded-full flex items-center justify-center ' + (a.earned ? 'bg-violet-600 text-white' : 'bg-zinc-100 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-500') + '">' + icon(a.earned ? 'trophy' : 'lock', 'w-4 h-4') + '</span>' +
        '<div class="min-w-0"><p class="text-sm font-semibold">' + a.title + '</p><p class="text-xs ' + MUTED + '">' + a.desc + '</p>' +
        '<p class="sr-only">' + (a.earned ? 'Earned' : 'Locked') + '</p></div></div>';
    }).join('') + '</div>';
    return html;
  }

  function bindCharts() {
    var series = activitySeries.last;
    var readout = $('#bar-readout');
    function showBar(i) {
      var b = series.bars[i];
      readout.innerHTML = '<span class="' + MUTED + '">' + esc(b.full) + ':</span> <span class="font-semibold">' + fmt(b.value) + ' ' + series.metric.unit + '</span>';
      document.querySelectorAll('#bar-chart [data-bar]').forEach(function (el) {
        el.classList.toggle('opacity-50', +el.dataset.bar !== i);
      });
    }
    if (series) {
      showBar(series.bars.length - 1);
      document.querySelectorAll('#bar-chart [data-hit]').forEach(function (el) {
        var i = +el.dataset.hit;
        el.addEventListener('pointerenter', function () { showBar(i); });
        el.addEventListener('click', function () { showBar(i); });
      });
    }
    var geom = weightChart.geom, hit = $('#w-hit');
    if (!hit || !geom) return;
    var svg = $('#weight-svg'), dot = $('#w-dot'), cross = $('#w-cross'), wr = $('#w-readout');
    function showPoint(p) {
      dot.setAttribute('cx', geom.x(p.day)); dot.setAttribute('cy', geom.y(p.weight_kg));
      wr.innerHTML = esc(dayLabel(p.day)) + ': <span class="font-semibold text-zinc-900 dark:text-zinc-100">' + fmt(p.weight_kg, 1) + ' kg</span>';
    }
    showPoint(geom.points[geom.points.length - 1]);
    function move(e) {
      var pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
      var vx = pt.matrixTransform(svg.getScreenCTM().inverse()).x;
      var best = geom.points[0];
      geom.points.forEach(function (p) { if (Math.abs(geom.x(p.day) - vx) < Math.abs(geom.x(best.day) - vx)) best = p; });
      cross.setAttribute('x1', geom.x(best.day)); cross.setAttribute('x2', geom.x(best.day));
      cross.classList.remove('hidden');
      showPoint(best);
    }
    hit.addEventListener('pointermove', move);
    hit.addEventListener('pointerdown', move);
    hit.addEventListener('pointerleave', function () { cross.classList.add('hidden'); showPoint(geom.points[geom.points.length - 1]); });
  }

  function logWeightSheet() {
    var kg = latestWeight();
    var html = '<form id="weight-form" class="grid gap-3 pb-2" novalidate><h2 class="text-lg font-semibold">Log weight</h2>' +
      '<div class="grid grid-cols-2 gap-2"><div><label class="' + LABEL + '" for="wt-kg">Weight (kg)</label><input id="wt-kg" name="kg" type="number" inputmode="decimal" min="20" max="400" step="0.1" value="' + (kg || '') + '" class="' + INPUT + '"></div>' +
      '<div><label class="' + LABEL + '" for="wt-day">Date</label><input id="wt-day" name="day" type="date" max="' + today() + '" value="' + today() + '" class="' + INPUT + '"></div></div>' +
      '<p id="wt-err" class="hidden text-sm text-red-600 dark:text-red-400"></p>' +
      '<button type="submit" class="' + BTN_PRIMARY + '">Save weight</button></form>';
    presentSheet(html, function (el, close) {
      var form = $('#weight-form', el);
      form.onsubmit = function (e) {
        e.preventDefault();
        var err = $('#wt-err', el);
        if (!form.kg.value) { err.textContent = 'Enter your weight.'; err.classList.remove('hidden'); return; }
        save('PUT', '/api/weight', { day: form.day.value || today(), weight_kg: form.kg.value })
          .then(function () { close(); toast('Weight saved'); })
          .catch(function (e2) { err.textContent = e2.message; err.classList.remove('hidden'); });
      };
    });
  }

  // ------------------------------------------------------------ Profile

  var REMINDERS = [
    { id: 'water', label: 'Water', text: 'Time for a glass of water.', defaults: ['10:00', '13:00', '16:00', '19:00'], tab: 'food' },
    { id: 'meals', label: 'Meals', text: 'Remember to log your meal.', defaults: ['08:00', '12:30', '19:00'], tab: 'food' },
    { id: 'workout', label: 'Workout', text: 'Time to move. Log your workout when you are done.', defaults: ['18:00'], tab: 'workout' },
    { id: 'weight', label: 'Weight', text: 'Step on the scale and log your weight.', defaults: ['07:30'], tab: 'progress' },
  ];

  function reminderSettings() {
    var saved = settings().reminders || {};
    var out = {};
    REMINDERS.forEach(function (r) {
      var s = saved[r.id];
      out[r.id] = { enabled: !!(s && s.enabled), times: s && s.times && s.times.length === r.defaults.length ? s.times.slice() : r.defaults.slice() };
    });
    return out;
  }

  function field(id, label, value, attrs) {
    return '<li class="flex items-center justify-between gap-3 px-4 py-2.5"><label for="' + id + '" class="text-sm">' + label + '</label>' +
      '<input id="' + id + '" ' + attrs + ' value="' + (value == null ? '' : esc(value)) + '" class="w-28 text-right rounded-lg bg-transparent px-2 py-1 text-base tabular-nums focus:outline-none focus:ring-2 focus:ring-violet-500"></li>';
  }
  function select(id, label, value, options) {
    return '<li class="flex items-center justify-between gap-3 px-4 py-2.5"><label for="' + id + '" class="text-sm">' + label + '</label>' +
      '<select id="' + id + '" class="w-44 text-right rounded-lg bg-transparent px-2 py-1 text-base focus:outline-none focus:ring-2 focus:ring-violet-500">' +
      '<option value=""' + (value ? '' : ' selected') + '>Choose</option>' + options.map(function (o) {
        return '<option value="' + o.id + '"' + (o.id === value ? ' selected' : '') + '>' + o.label + '</option>';
      }).join('') + '</select></li>';
  }
  var GROUP = 'rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 divide-y divide-zinc-100 dark:divide-zinc-800';

  function bodyNumbers() {
    var p = profile(), kg = latestWeight();
    var b = bmi(kg, p.height_cm), r = bmr(p, kg), t = tdee(p, kg), g = autoGoals(p, kg);
    var missing = [];
    if (!p.age) missing.push('age');
    if (!p.gender) missing.push('gender');
    if (!p.height_cm) missing.push('height');
    if (!kg) missing.push('weight');
    if (!p.activity_level) missing.push('activity level');
    var rows = [
      ['BMI', b ? fmt(b, 1) + ' <span class="' + MUTED + '">' + bmiCategory(b) + '</span>' : '-'],
      ['BMR', r ? fmt(r) + ' kcal/day' : '-'],
      ['TDEE', t ? fmt(t) + ' kcal/day' : '-'],
      ['Suggested intake', t ? fmt(g.calories) + ' kcal/day' : '-'],
    ];
    return rows.map(function (x) {
      return '<li class="flex items-center justify-between gap-3 px-4 py-3 text-sm"><span>' + x[0] + '</span><span class="font-medium tabular-nums text-right">' + x[1] + '</span></li>';
    }).join('') + (missing.length ? '<li class="px-4 py-3 text-xs ' + MUTED + '">Add your ' + missing.join(', ') + ' to calculate these.</li>' :
      '<li class="px-4 py-3 text-xs ' + MUTED + '">BMR uses the Mifflin-St Jeor formula. TDEE is BMR times your activity level. Suggested intake adjusts TDEE toward your target weight.</li>');
  }

  function goalInputs() {
    var auto = autoGoals(profile(), latestWeight()), custom = profile().goals || {};
    var rows = [
      ['calories', 'Calories (kcal)'], ['protein', 'Protein (g)'], ['carbs', 'Carbs (g)'], ['fat', 'Fat (g)'],
      ['water', 'Water (ml)'], ['steps', 'Steps'], ['workoutMinutes', 'Workout (min/week)'],
    ];
    return rows.map(function (r) {
      return field('goal-' + r[0], r[1], custom[r[0]], 'data-goal="' + r[0] + '" type="number" inputmode="numeric" min="0" placeholder="' + fmt(auto[r[0]]) + '"');
    }).join('');
  }

  function viewProfile() {
    var p = profile(), kg = latestWeight(), rem = reminderSettings();
    var html = '<div class="flex items-center justify-between px-1 mb-2"><h2 class="text-base font-semibold">Your details</h2><span id="save-status" class="text-xs ' + MUTED + '" aria-live="polite">Changes save automatically</span></div>';
    html += '<ul class="' + GROUP + '">' +
      field('p-age', 'Age', p.age, 'data-p="age" type="number" inputmode="numeric" min="10" max="120" placeholder="Years"') +
      select('p-gender', 'Gender', p.gender, [{ id: 'female', label: 'Female' }, { id: 'male', label: 'Male' }, { id: 'other', label: 'Other' }]) +
      field('p-height', 'Height (cm)', p.height_cm, 'data-p="height_cm" type="number" inputmode="decimal" min="50" max="272" step="0.1" placeholder="cm"') +
      field('p-weight', 'Weight (kg)', kg, 'data-p="weight_kg" type="number" inputmode="decimal" min="20" max="400" step="0.1" placeholder="kg"') +
      field('p-target', 'Target weight (kg)', p.target_weight_kg, 'data-p="target_weight_kg" type="number" inputmode="decimal" min="20" max="400" step="0.1" placeholder="kg"') +
      select('p-activity', 'Activity level', p.activity_level, ACTIVITY) +
      '</ul>';
    var act = ACTIVITY.find(function (a) { return a.id === p.activity_level; });
    html += '<p id="activity-hint" class="px-1 mt-1.5 text-xs ' + MUTED + '">' + (act ? act.hint : 'Pick how active you are on a typical week.') + '</p>';

    html += h2('Body numbers');
    html += '<ul id="body-numbers" class="' + GROUP + '">' + bodyNumbers() + '</ul>';

    html += h2('Daily goals');
    html += '<ul id="goal-list" class="' + GROUP + '">' + goalInputs() + '</ul>';
    html += '<p class="px-1 mt-1.5 text-xs ' + MUTED + '">Leave a goal empty to use the suggested value shown in grey.</p>';

    html += h2('Reminders');
    html += '<ul class="' + GROUP + '">' + REMINDERS.map(function (r) {
      var s = rem[r.id];
      return '<li class="px-4 py-3"><div class="flex items-center justify-between gap-3"><label for="rem-' + r.id + '" class="text-sm font-medium">' + r.label + '</label>' +
        '<input type="checkbox" id="rem-' + r.id + '" data-rem="' + r.id + '" class="un-switch"' + (s.enabled ? ' checked' : '') + '></div>' +
        '<div class="mt-2 flex flex-wrap gap-2' + (s.enabled ? '' : ' opacity-50') + '">' + s.times.map(function (t, i) {
          return '<input type="time" aria-label="' + r.label + ' reminder ' + (i + 1) + '" data-rem-time="' + r.id + '" data-i="' + i + '" value="' + t + '" class="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-transparent px-2 py-1 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-violet-500">';
        }).join('') + '</div></li>';
    }).join('') + '<li class="px-4 py-3 flex items-center justify-between gap-3"><span id="notif-state" class="text-xs ' + MUTED + '"></span>' +
      '<button type="button" id="notif-btn" class="hidden shrink-0 whitespace-nowrap ' + BTN_SECONDARY + '">' + icon('bell', 'w-4 h-4') + 'Allow notifications</button></li></ul>';
    html += '<p class="px-1 mt-1.5 text-xs ' + MUTED + '">Reminders appear while My Fitness is open. Where your browser allows it, they also show as notifications.</p>';

    var theme = settings().theme || (function () { try { return localStorage.getItem('mf-theme'); } catch (_) { return null; } })() || 'system';
    html += h2('Appearance');
    html += '<div class="' + CARD + ' flex items-center justify-between gap-3"><span class="text-sm">Theme</span>' +
      seg('theme', [{ id: 'system', label: 'Auto' }, { id: 'light', label: 'Light' }, { id: 'dark', label: 'Dark' }], theme) + '</div>';
    html += '<p class="px-1 mt-1.5 text-xs ' + MUTED + '">Auto follows your Homeroom theme.</p>';
    return html;
  }

  function setStatus(text) { var el = $('#save-status'); if (el) el.textContent = text; }

  function refreshProfileDerived() {
    return api('GET', '/api/state?day=' + S.viewDay).then(function (d) {
      S.data = d;
      if (S.tab !== 'profile') return;
      $('#body-numbers').innerHTML = bodyNumbers();
      var auto = autoGoals(profile(), latestWeight());
      document.querySelectorAll('[data-goal]').forEach(function (el) { el.placeholder = fmt(auto[el.dataset.goal]); });
      var act = ACTIVITY.find(function (a) { return a.id === profile().activity_level; });
      $('#activity-hint').textContent = act ? act.hint : 'Pick how active you are on a typical week.';
    });
  }

  function saveProfile(body) {
    setStatus('Saving...');
    return api('PUT', '/api/profile', body).then(function () {
      setStatus('Saved');
      return refreshProfileDerived();
    }).catch(function (e) {
      setStatus('Not saved');
      toast(e.message || 'Could not save. Try again.');
    });
  }

  function saveSettings(patch) {
    var next = Object.assign({}, settings(), patch);
    if (S.data.profile) S.data.profile.settings = next; else S.data.profile = { settings: next, goals: {} };
    return saveProfile({ settings: next });
  }

  function updateNotifUi() {
    var stateEl = $('#notif-state'), btn = $('#notif-btn');
    if (!stateEl) return;
    if (!('Notification' in window)) { stateEl.textContent = 'This browser does not support notifications. Reminders show in the app.'; return; }
    var perm = Notification.permission;
    stateEl.textContent = perm === 'granted' ? 'Notifications are on.' : perm === 'denied' ? 'Notifications are blocked here. Reminders show in the app.' : 'Notifications are off. Reminders show in the app.';
    btn.classList.toggle('hidden', perm !== 'default');
  }

  function bindProfile() {
    var app = $('#app');
    updateNotifUi();
    app.querySelectorAll('[data-p]').forEach(function (el) {
      el.addEventListener('change', function () {
        var body = {}; body[el.dataset.p] = el.value;
        if (el.dataset.p === 'weight_kg') { if (!el.value) return; body.day = today(); }
        saveProfile(body);
      });
    });
    $('#p-gender').addEventListener('change', function (e) { saveProfile({ gender: e.target.value }); });
    $('#p-activity').addEventListener('change', function (e) { saveProfile({ activity_level: e.target.value }); });
    app.querySelectorAll('[data-goal]').forEach(function (el) {
      el.addEventListener('change', function () {
        var g = {};
        app.querySelectorAll('[data-goal]').forEach(function (x) { if (x.value !== '') g[x.dataset.goal] = x.value; });
        saveProfile({ goals: g });
      });
    });
    app.querySelectorAll('[data-rem]').forEach(function (el) {
      el.addEventListener('change', function () {
        var rem = reminderSettings();
        rem[el.dataset.rem].enabled = el.checked;
        el.closest('li').querySelector('.flex-wrap').classList.toggle('opacity-50', !el.checked);
        saveSettings({ reminders: rem });
      });
    });
    app.querySelectorAll('[data-rem-time]').forEach(function (el) {
      el.addEventListener('change', function () {
        if (!el.value) return;
        var rem = reminderSettings();
        rem[el.dataset.remTime].times[+el.dataset.i] = el.value;
        saveSettings({ reminders: rem });
      });
    });
    var btn = $('#notif-btn');
    if (btn) btn.addEventListener('click', function () {
      // Must run inside the tap: browsers refuse permission prompts otherwise.
      try {
        var r = Notification.requestPermission(updateNotifUi);
        if (r && r.then) r.then(updateNotifUi, updateNotifUi);
      } catch (_) { updateNotifUi(); }
    });
  }

  // ----------------------------------------------------------- reminders

  // Checked every 30 s while the app is open. Each reminder time fires once
  // per day, within an hour of its time, and is skipped when it is already
  // done (water goal met, workout or weight already logged today).
  function checkReminders() {
    if (!S.data || !S.data.profile) return;
    var rem = reminderSettings(), d = now(), key = dayKey(d), mins = d.getHours() * 60 + d.getMinutes();
    var st = dayStats(key), g = goals();
    var done = {
      water: st.water >= g.water,
      meals: false,
      workout: st.workouts > 0,
      weight: S.data.weights.some(function (w) { return w.day === key; }),
    };
    REMINDERS.forEach(function (r) {
      var s = rem[r.id];
      if (!s.enabled || done[r.id]) return;
      s.times.forEach(function (t) {
        var parts = t.split(':'), at = +parts[0] * 60 + +parts[1];
        if (mins < at || mins - at > 60) return;
        var fired = 'mf-rem-' + r.id + '-' + key + '-' + t;
        try { if (localStorage.getItem(fired)) return; localStorage.setItem(fired, '1'); } catch (_) { return; }
        fireReminder(r);
      });
    });
  }

  function fireReminder(r) {
    toast(r.text, { duration: 8000, priority: true, action: { label: 'Open', handler: function () { go(r.tab); } } });
    try {
      if ('Notification' in window && Notification.permission === 'granted' && document.visibilityState !== 'visible') {
        new Notification('My Fitness', { body: r.text, tag: 'mf-' + r.id });
      }
    } catch (_) { /* notifications unavailable in this frame; the toast already showed */ }
  }

  // -------------------------------------------------------------- events

  function undoToast(text, redo) {
    toast(text, { action: { label: 'Undo', handler: redo } });
  }

  document.addEventListener('click', function (e) {
    var t = e.target.closest('button');
    if (!t) return;
    var ds = t.dataset;
    if (ds.tab) return go(ds.tab);
    if (ds.go) return go(ds.go);
    if (ds.day) { S.viewDay = addDays(S.viewDay, +ds.day); if (S.viewDay > today()) S.viewDay = today(); return load(); }
    if (ds.action === 'add-food') return addFoodSheet(ds.meal);
    if (ds.action === 'add-workout') return addWorkoutSheet();
    if (ds.action === 'custom-water') return customWaterSheet();
    if (ds.action === 'log-weight') return logWeightSheet();
    if (ds.water) return save('POST', '/api/water', { day: S.viewDay, ml: +ds.water }).then(function () { toast('+' + ds.water + ' ml water'); }).catch(function () {});
    if (ds.action === 'undo-water') {
      var last = S.data.today.water[S.data.today.water.length - 1];
      if (last) save('DELETE', '/api/water/' + last.id).catch(function () {});
      return;
    }
    if (ds.delFood) {
      var f = S.data.today.food.find(function (x) { return String(x.id) === ds.delFood; });
      var fday = S.viewDay;
      return save('DELETE', '/api/food/' + ds.delFood).then(function () {
        if (f) undoToast('Removed ' + f.name, function () { save('POST', '/api/food', Object.assign({ day: fday }, f)).catch(function () {}); });
      }).catch(function () {});
    }
    if (ds.delWorkout) {
      var w = S.data.today.workouts.find(function (x) { return String(x.id) === ds.delWorkout; });
      var wday = S.viewDay;
      return save('DELETE', '/api/workouts/' + ds.delWorkout).then(function () {
        if (w) undoToast('Workout removed', function () { save('POST', '/api/workouts', Object.assign({ day: wday }, w)).catch(function () {}); });
      }).catch(function () {});
    }
    if (ds.delWeight) {
      var wt = S.data.weights.find(function (x) { return x.day === ds.delWeight; });
      return save('DELETE', '/api/weight/' + ds.delWeight).then(function () {
        if (wt) undoToast('Weigh-in removed', function () { save('PUT', '/api/weight', wt).catch(function () {}); });
      }).catch(function () {});
    }
    if (ds.wrange != null) { S.weightRange = +ds.wrange; return render(); }
    if (ds.pmode) { S.progressMode = ds.pmode; return render(); }
    if (ds.metric) { S.progressMetric = ds.metric; return render(); }
    if (ds.theme) {
      try { localStorage.setItem('mf-theme', ds.theme); } catch (_) {}
      if (window.mfApplyTheme) window.mfApplyTheme();
      document.querySelectorAll('[data-theme]').forEach(function (b) {
        var on = b.dataset.theme === ds.theme;
        b.setAttribute('aria-pressed', on);
        b.classList.toggle('bg-white', on); b.classList.toggle('dark:bg-zinc-700', on); b.classList.toggle('font-semibold', on);
        b.classList.toggle('text-zinc-500', !on); b.classList.toggle('dark:text-zinc-400', !on);
      });
      return saveSettings({ theme: ds.theme });
    }
  });

  document.addEventListener('change', function (e) {
    if (e.target.id === 'steps-input') {
      var v = e.target.value === '' ? 0 : e.target.value;
      save('PUT', '/api/steps', { day: S.viewDay, steps: v }).then(function () { toast('Steps saved'); }).catch(function () {});
    }
  });

  window.addEventListener('hashchange', function () { go(location.hash.slice(1) || 'home'); });

  // ---------------------------------------------------------------- boot

  S.tab = TABS.some(function (t) { return t.id === location.hash.slice(1); }) ? location.hash.slice(1) : 'home';
  renderTabbar();
  load();
  setInterval(checkReminders, 30000);
  setTimeout(checkReminders, 3000);
  // Roll over to the new day if the app stays open past midnight.
  var lastDay = today();
  setInterval(function () {
    var t = today();
    if (t !== lastDay) { if (S.viewDay === lastDay) S.viewDay = t; lastDay = t; load(); }
  }, 60000);
})();
