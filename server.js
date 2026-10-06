const express = require('express');
const path = require('path');
const { Pool } = require('pg');
const jwt = require('jsonwebtoken');

const app = express();
const port = process.env.PORT || 3000;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// The platform signs user-identity tokens with an RSA private key it never
// shares. Containers get only the PUBLIC half, so this app can verify who a
// user is but cannot mint an identity — and neither can any other app.
const JWT_PUBLIC_KEY = (process.env.USERNODE_JWT_PUBLIC_KEY || '')
  .replace(/\\n/g, '\n');

// Tokens are minted for one app: the audience is this app's numeric id, so a
// token issued for a different app is rejected below rather than accepted as
// a valid user.
const APP_AUDIENCE = process.env.USERNODE_APP_ID
  ? 'usernode:app:' + process.env.USERNODE_APP_ID
  : null;

// Paths that stay open without authentication. Add a path here (and add it
// with `app.get`/`app.post` below) if you deliberately want it public.
// Everything else requires a valid platform-issued JWT.
const PUBLIC_API_PATHS = new Set(['/health']);

app.use(express.json());

// The platform's three centrally hosted files — the bridge, the native UI
// kit and the Tailwind runtime — are reachable at these paths on this app's
// OWN origin, so index.html can load them with a RELATIVE path and never
// name the platform's hostname. A hostname baked into an app is what breaks
// every app at once when the platform's domain moves.
//
// In production and on a staging preview the platform's edge answers these
// before the request ever reaches this process (a per-app Ingress rule on
// Kubernetes, the wildcard site's matcher on the docker runtime). This
// handler is what makes the same relative paths work under a plain
// `node server.js`, where there is no edge in front of the app at all.
//
// Registered BEFORE the auth middleware because these three files are
// public: the platform serves them anonymously from any app origin, and a
// login redirect arriving where a <script> was expected is exactly the
// failure a relative path is meant to avoid.
// The platform's origin, at RUNTIME, and ONLY from the variable the platform
// injects. No hostname is written into this file: a baked-in one is what left
// the whole fleet pointing at a domain the platform had moved away from.
// Unset only outside the platform (a plain local `node server.js`) — set
// USERNODE_PLATFORM_ORIGIN there too if you want the hosted assets locally.
const PLATFORM_ORIGIN = (process.env.USERNODE_PLATFORM_ORIGIN || '')
  .replace(/\/+$/, '');

app.get(/^\/usernode-(?:bridge|native|tailwind)\//, async (req, res) => {
  try {
    if (!PLATFORM_ORIGIN) return res.sendStatus(503);
    const upstream = await fetch(PLATFORM_ORIGIN + req.path);
    if (!upstream.ok) return res.sendStatus(upstream.status);
    const type = upstream.headers.get('content-type');
    if (type) res.type(type);
    // max-age=0 with revalidation, never a long TTL: the whole point of
    // central hosting is that a platform-side fix lands on the next load.
    res.set('Cache-Control', 'public, max-age=0, must-revalidate');
    return res.send(Buffer.from(await upstream.arrayBuffer()));
  } catch (err) {
    console.warn('hosted asset fetch failed: ' + err.message);
    return res.sendStatus(502);
  }
});

// Verify platform-issued JWT if one was passed, then enforce auth on
// anything not explicitly marked public. The iframe adds `?token=…`
// on load; the frontend script forwards the token via `x-usernode-token`
// on subsequent fetches.
app.use((req, res, next) => {
  const token = req.query.token || req.headers['x-usernode-token'];
  if (token && JWT_PUBLIC_KEY && APP_AUDIENCE) {
    try {
      // Pin the algorithm, issuer and audience. Without `algorithms` a
      // caller could hand us an HS256 token signed with the public PEM
      // (which every app knows) and forge any user.
      const claims = jwt.verify(token, JWT_PUBLIC_KEY, {
        algorithms: ['RS256'],
        issuer: 'usernode',
        audience: APP_AUDIENCE,
      });
      // `pur` names what the token is for. Only user-identity tokens
      // authenticate a person here.
      if (claims && claims.pur === 'iframe') req.user = claims;
    } catch {}
  }

  // Static assets (CSS/JS/images) are always served; the API and the HTML
  // shell are gated so direct hits to the staging/prod subdomain don't
  // leak app data to the public internet.
  if (req.method !== 'GET' || req.path.startsWith('/api/')) {
    if (PUBLIC_API_PATHS.has(req.path)) return next();
    if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  }
  next();
});

app.get('/health', (_req, res) => {
  if (shuttingDown) return res.status(503).json({ status: 'shutting_down' });
  res.json({ status: 'ok' });
});

// The template ships no favicon file; index.html carries an inline SVG
// icon instead. Answer 204 here so anything that still probes
// /favicon.ico (older browsers, direct visits) doesn't fall through to
// the auth-gated catch-all and surface a 401 in the console on every
// fresh load.
app.get('/favicon.ico', (_req, res) => res.status(204).end());

// ---------------------------------------------------------------------------
// My Fitness API. Every row belongs to req.user.id; all tables are marked
// staging:private (they hold health and body data), so a staging preview
// starts with them empty and each reviewer fills in their own.
//
// "Today" is the viewer's local calendar day, so the client sends it as
// `day` (YYYY-MM-DD) rather than the server guessing a time zone.
// ---------------------------------------------------------------------------

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const GENDERS = new Set(['male', 'female', 'other']);
const ACTIVITY = new Set(['sedentary', 'light', 'moderate', 'active', 'very_active']);
const MEALS = new Set(['breakfast', 'lunch', 'dinner', 'snack']);
const WORKOUT_TYPES = new Set(['walking', 'running', 'cycling', 'swimming', 'strength', 'yoga', 'hiit', 'other']);
const GOAL_KEYS = ['calories', 'protein', 'carbs', 'fat', 'water', 'steps', 'workoutMinutes'];

class BadInput extends Error {}

function day(v) {
  if (typeof v !== 'string' || !DAY_RE.test(v) || isNaN(Date.parse(v + 'T00:00:00Z'))) {
    throw new BadInput('day must be YYYY-MM-DD');
  }
  return v;
}

// Optional number in [min, max]; '' / null / undefined mean "not set".
function num(v, min, max, name) {
  if (v === '' || v === null || v === undefined) return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < min || n > max) throw new BadInput(`${name} must be between ${min} and ${max}`);
  return n;
}

function reqNum(v, min, max, name) {
  const n = num(v, min, max, name);
  if (n === null) throw new BadInput(`${name} is required`);
  return n;
}

function oneOf(v, set, name, fallback) {
  if (v === '' || v === null || v === undefined) return fallback;
  if (!set.has(v)) throw new BadInput(`${name} is not valid`);
  return v;
}

function cleanGoals(g) {
  const out = {};
  if (!g || typeof g !== 'object') return out;
  for (const k of GOAL_KEYS) {
    const n = num(g[k], 0, 100000, `goal ${k}`);
    if (n !== null) out[k] = Math.round(n);
  }
  return out;
}

const REMINDER_KEYS = ['water', 'meals', 'workout', 'weight'];
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function cleanSettings(s) {
  const out = {};
  if (!s || typeof s !== 'object') return out;
  if (['system', 'light', 'dark'].includes(s.theme)) out.theme = s.theme;
  if (s.reminders && typeof s.reminders === 'object') {
    out.reminders = {};
    for (const k of REMINDER_KEYS) {
      const r = s.reminders[k];
      if (!r || typeof r !== 'object') continue;
      const times = Array.isArray(r.times) ? r.times.filter((t) => typeof t === 'string' && TIME_RE.test(t)).slice(0, 12) : [];
      out.reminders[k] = { enabled: !!r.enabled, times };
    }
  }
  return out;
}

function wrap(fn) {
  return async (req, res) => {
    try {
      await fn(req, res);
    } catch (err) {
      if (err instanceof BadInput) return res.status(400).json({ error: err.message });
      console.error(err);
      res.status(500).json({ error: 'Something went wrong. Try again.' });
    }
  };
}

app.get('/api/state', wrap(async (req, res) => {
  const uid = req.user.id;
  const d = day(req.query.day);
  const [profile, food, water, steps, workouts, weights, days, recent] = await Promise.all([
    pool.query(`SELECT age, gender, height_cm, target_weight_kg, activity_level, goals, settings
                  FROM profiles WHERE user_id = $1`, [uid]),
    pool.query(`SELECT id, meal, name, calories, protein, carbs, fat
                  FROM food_entries WHERE user_id = $1 AND day = $2 ORDER BY created_at, id`, [uid, d]),
    pool.query(`SELECT id, ml FROM water_entries WHERE user_id = $1 AND day = $2 ORDER BY created_at, id`, [uid, d]),
    pool.query(`SELECT steps FROM daily_steps WHERE user_id = $1 AND day = $2`, [uid, d]),
    pool.query(`SELECT id, type, duration_min, distance_km, calories
                  FROM workouts WHERE user_id = $1 AND day = $2 ORDER BY created_at, id`, [uid, d]),
    pool.query(`SELECT to_char(day, 'YYYY-MM-DD') AS day, weight_kg
                  FROM weight_entries WHERE user_id = $1 ORDER BY day`, [uid]),
    // One row per day that has anything logged, all time. Charts and
    // achievements are worked out from this on the client.
    pool.query(`
      SELECT to_char(day, 'YYYY-MM-DD') AS day,
             SUM(calories)::int AS calories, SUM(protein)::real AS protein,
             SUM(carbs)::real AS carbs, SUM(fat)::real AS fat, SUM(meals)::int AS meals,
             SUM(water)::int AS water, SUM(steps)::int AS steps,
             SUM(wmin)::real AS workout_min, SUM(wkcal)::int AS workout_kcal,
             SUM(wcount)::int AS workouts, MAX(wdist)::real AS max_distance
        FROM (
          SELECT day, calories, protein, carbs, fat, 1 AS meals, 0 AS water, 0 AS steps,
                 0 AS wmin, 0 AS wkcal, 0 AS wcount, 0 AS wdist
            FROM food_entries WHERE user_id = $1
          UNION ALL
          SELECT day, 0, 0, 0, 0, 0, ml, 0, 0, 0, 0, 0 FROM water_entries WHERE user_id = $1
          UNION ALL
          SELECT day, 0, 0, 0, 0, 0, 0, steps, 0, 0, 0, 0 FROM daily_steps WHERE user_id = $1
          UNION ALL
          SELECT day, 0, 0, 0, 0, 0, 0, 0, duration_min, calories, 1, COALESCE(distance_km, 0)
            FROM workouts WHERE user_id = $1
        ) t
       GROUP BY day ORDER BY day`, [uid]),
    pool.query(`
      SELECT name, meal, calories, protein, carbs, fat FROM (
        SELECT DISTINCT ON (lower(name)) name, meal, calories, protein, carbs, fat, created_at
          FROM food_entries WHERE user_id = $1
         ORDER BY lower(name), created_at DESC
      ) f ORDER BY created_at DESC LIMIT 8`, [uid]),
  ]);
  res.json({
    user: { username: req.user.username },
    day: d,
    profile: profile.rows[0] || null,
    today: {
      food: food.rows,
      water: water.rows,
      steps: steps.rows[0] ? steps.rows[0].steps : 0,
      workouts: workouts.rows,
    },
    weights: weights.rows,
    days: days.rows,
    recentFoods: recent.rows,
  });
}));

// Profile edits save field by field as the user types, so every key is
// optional and only the keys sent are changed.
app.put('/api/profile', wrap(async (req, res) => {
  const uid = req.user.id;
  const b = req.body || {};
  const fields = {};
  if ('age' in b) fields.age = num(b.age, 10, 120, 'Age');
  if ('gender' in b) fields.gender = oneOf(b.gender, GENDERS, 'Gender', null);
  if ('height_cm' in b) fields.height_cm = num(b.height_cm, 50, 272, 'Height');
  if ('target_weight_kg' in b) fields.target_weight_kg = num(b.target_weight_kg, 20, 400, 'Target weight');
  if ('activity_level' in b) fields.activity_level = oneOf(b.activity_level, ACTIVITY, 'Activity level', null);
  if ('goals' in b) fields.goals = JSON.stringify(cleanGoals(b.goals));
  if ('settings' in b) fields.settings = JSON.stringify(cleanSettings(b.settings));
  if ('age' in fields && fields.age !== null) fields.age = Math.round(fields.age);

  const keys = Object.keys(fields);
  if (keys.length) {
    const cols = ['user_id', ...keys];
    const vals = [uid, ...keys.map((k) => fields[k])];
    const sets = keys.map((k) => `${k} = EXCLUDED.${k}`).concat('updated_at = NOW()');
    await pool.query(
      `INSERT INTO profiles (${cols.join(', ')}) VALUES (${cols.map((_, i) => '$' + (i + 1)).join(', ')})
       ON CONFLICT (user_id) DO UPDATE SET ${sets.join(', ')}`,
      vals,
    );
  }
  // The profile's "current weight" is the latest weigh-in, so editing it
  // records today's weight in the weight tracker.
  if ('weight_kg' in b && b.weight_kg !== '' && b.weight_kg !== null) {
    await upsertWeight(uid, day(b.day), reqNum(b.weight_kg, 20, 400, 'Weight'));
  }
  res.json({ ok: true });
}));

async function upsertWeight(uid, d, kg) {
  await pool.query(
    `INSERT INTO weight_entries (user_id, day, weight_kg) VALUES ($1, $2, $3)
     ON CONFLICT (user_id, day) DO UPDATE SET weight_kg = EXCLUDED.weight_kg`,
    [uid, d, Math.round(kg * 10) / 10],
  );
}

app.post('/api/food', wrap(async (req, res) => {
  const b = req.body || {};
  const name = typeof b.name === 'string' ? b.name.trim().slice(0, 80) : '';
  if (!name) throw new BadInput('Food name is required');
  const { rows } = await pool.query(
    `INSERT INTO food_entries (user_id, day, meal, name, calories, protein, carbs, fat)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
    [req.user.id, day(b.day), oneOf(b.meal, MEALS, 'Meal', 'snack'), name,
      Math.round(reqNum(b.calories, 0, 10000, 'Calories')),
      num(b.protein, 0, 1000, 'Protein') || 0,
      num(b.carbs, 0, 1000, 'Carbs') || 0,
      num(b.fat, 0, 1000, 'Fat') || 0],
  );
  res.json({ id: rows[0].id });
}));

app.delete('/api/food/:id', wrap(async (req, res) => {
  await pool.query('DELETE FROM food_entries WHERE id = $1 AND user_id = $2', [Number(req.params.id) || 0, req.user.id]);
  res.json({ ok: true });
}));

app.post('/api/water', wrap(async (req, res) => {
  const b = req.body || {};
  const { rows } = await pool.query(
    'INSERT INTO water_entries (user_id, day, ml) VALUES ($1, $2, $3) RETURNING id',
    [req.user.id, day(b.day), Math.round(reqNum(b.ml, 1, 5000, 'Amount'))],
  );
  res.json({ id: rows[0].id });
}));

app.delete('/api/water/:id', wrap(async (req, res) => {
  await pool.query('DELETE FROM water_entries WHERE id = $1 AND user_id = $2', [Number(req.params.id) || 0, req.user.id]);
  res.json({ ok: true });
}));

app.put('/api/steps', wrap(async (req, res) => {
  const b = req.body || {};
  await pool.query(
    `INSERT INTO daily_steps (user_id, day, steps) VALUES ($1, $2, $3)
     ON CONFLICT (user_id, day) DO UPDATE SET steps = EXCLUDED.steps`,
    [req.user.id, day(b.day), Math.round(reqNum(b.steps, 0, 200000, 'Steps'))],
  );
  res.json({ ok: true });
}));

app.post('/api/workouts', wrap(async (req, res) => {
  const b = req.body || {};
  const { rows } = await pool.query(
    `INSERT INTO workouts (user_id, day, type, duration_min, distance_km, calories)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [req.user.id, day(b.day), oneOf(b.type, WORKOUT_TYPES, 'Workout type', 'other'),
      reqNum(b.duration_min, 1, 1440, 'Duration'),
      num(b.distance_km, 0, 1000, 'Distance'),
      Math.round(reqNum(b.calories, 0, 10000, 'Calories burned'))],
  );
  res.json({ id: rows[0].id });
}));

app.delete('/api/workouts/:id', wrap(async (req, res) => {
  await pool.query('DELETE FROM workouts WHERE id = $1 AND user_id = $2', [Number(req.params.id) || 0, req.user.id]);
  res.json({ ok: true });
}));

app.put('/api/weight', wrap(async (req, res) => {
  const b = req.body || {};
  await upsertWeight(req.user.id, day(b.day), reqNum(b.weight_kg, 20, 400, 'Weight'));
  res.json({ ok: true });
}));

app.delete('/api/weight/:day', wrap(async (req, res) => {
  await pool.query('DELETE FROM weight_entries WHERE user_id = $1 AND day = $2', [req.user.id, day(req.params.day)]);
  res.json({ ok: true });
}));

app.use(express.static(path.join(__dirname, 'public')));

// HTML shell: serve the app if authenticated. Unauthenticated top-level
// visits (share links pasted into a browser — Sec-Fetch-Dest: document)
// are sent to the platform's chromeless view of this app, where the shell
// embeds it with a real token so the link just works. Every other
// tokenless case (iframe loads with an expired token, old browsers
// without Sec-Fetch-*) gets the "open in Homeroom" landing page instead
// of a redirect, so the platform shell is never loaded INSIDE its own
// app iframe and stray visits still don't reveal the app.
app.get('*', (req, res) => {
  if (!req.user) {
    // Deep-link pass-through (platform #743): carry the visited
    // path+query into the chromeless view so share links land on the
    // shared screen, not Home. The clean platform route stores `path`
    // as one encoded query value so an inner ?, &, or = survives. The
    // shell decodes and validates it as relative-only before use. The
    // character test keeps the
    // value attribute-safe for the landing anchor below — anything
    // unusual falls back to the bare link.
    const deepPath = /^\/[A-Za-z0-9\-._~!$&()*+,;=:@\/%?]*$/.test(req.originalUrl)
      ? '?path=' + encodeURIComponent(req.originalUrl) : '';
    if (PLATFORM_ORIGIN && req.get('sec-fetch-dest') === 'document') {
      return res.redirect(302, PLATFORM_ORIGIN + '/app/my-fitness-9c76e0/full' + deepPath);
    }
    return res.status(401).send(`<!doctype html><meta charset=utf-8><title>Open in Homeroom</title>
<body style="font-family:system-ui;background:#09090b;color:#e4e4e7;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0">
  <div style="max-width:24rem;padding:2rem;text-align:center">
    <h1 style="font-size:1.25rem;margin:0 0 0.5rem">Open this app inside Homeroom</h1>
    <p style="color:#a1a1aa;font-size:0.9rem;margin:0 0 1.25rem">This page is served via the platform; direct visits aren't authenticated.</p>
    <a href="${PLATFORM_ORIGIN}/app/my-fitness-9c76e0/full${deepPath}" style="display:inline-block;padding:0.5rem 1rem;background:#7c3aed;color:white;border-radius:0.5rem;text-decoration:none;font-size:0.9rem">Open in Homeroom</a>
  </div>
</body>`);
  }
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

async function migrate() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS profiles (
      user_id INTEGER PRIMARY KEY,
      age INTEGER,
      gender TEXT,
      height_cm REAL,
      target_weight_kg REAL,
      activity_level TEXT,
      goals JSONB NOT NULL DEFAULT '{}',
      settings JSONB NOT NULL DEFAULT '{}',
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS food_entries (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      day DATE NOT NULL,
      meal TEXT NOT NULL DEFAULT 'snack',
      name TEXT NOT NULL,
      calories INTEGER NOT NULL DEFAULT 0,
      protein REAL NOT NULL DEFAULT 0,
      carbs REAL NOT NULL DEFAULT 0,
      fat REAL NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS food_entries_user_day ON food_entries (user_id, day);
    CREATE TABLE IF NOT EXISTS water_entries (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      day DATE NOT NULL,
      ml INTEGER NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS water_entries_user_day ON water_entries (user_id, day);
    CREATE TABLE IF NOT EXISTS daily_steps (
      user_id INTEGER NOT NULL,
      day DATE NOT NULL,
      steps INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (user_id, day)
    );
    CREATE TABLE IF NOT EXISTS workouts (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      day DATE NOT NULL,
      type TEXT NOT NULL DEFAULT 'other',
      duration_min REAL NOT NULL,
      distance_km REAL,
      calories INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS workouts_user_day ON workouts (user_id, day);
    CREATE TABLE IF NOT EXISTS weight_entries (
      user_id INTEGER NOT NULL,
      day DATE NOT NULL,
      weight_kg REAL NOT NULL,
      PRIMARY KEY (user_id, day)
    );
  `);
  // Body measurements, food and exercise logs are personal health data:
  // staging previews get the schema, never the rows.
  for (const t of ['profiles', 'food_entries', 'water_entries', 'daily_steps', 'workouts', 'weight_entries']) {
    await pool.query(`COMMENT ON TABLE ${t} IS 'staging:private'`);
  }
}

const DRAIN_MS = 3000;
let shuttingDown = false;
let server;

async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[shutdown] ${signal} received, draining`);
  if (server) {
    server.close(() => {});
    server.closeIdleConnections?.();
    const t = setTimeout(() => server.closeAllConnections?.(), DRAIN_MS);
    t.unref?.();
  }
  try {
    await pool.end();
  } catch (e) {
    console.error('[shutdown] pool.end failed', e.message);
  }
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

async function start() {
  await migrate();
  server = app.listen(port, () => console.log(`Listening on :${port}`));
  // Let Envoy retire idle upstream connections at 60s, with a 15s margin.
  server.keepAliveTimeout = 75_000;
}

start().catch(err => { console.error(err); process.exit(1); });

