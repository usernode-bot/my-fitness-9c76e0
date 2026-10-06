# My Fitness

A simple, mobile-first fitness tracker that runs on Homeroom.

- **Home**: today's calories (goal, eaten, burned, remaining), protein,
  carbs and fat, steps, water, weight and workouts at a glance.
- **Food**: food log by meal with calories and macros, recent foods for
  quick re-adding, and a water tracker.
- **Workout**: workouts with duration, distance, speed and calories burned
  (estimated from MET values when left empty), plus daily steps.
- **Progress**: weight chart with target line, daily and weekly charts for
  calories, water, steps and workout minutes, today's goals and
  achievements.
- **Profile**: age, gender, height, weight, target weight and activity
  level; BMI, BMR (Mifflin-St Jeor) and TDEE; editable daily goals;
  reminders for water, meals, workouts and weight; Auto / Light / Dark theme.

Everything saves as you go to the app's Postgres database, per Homeroom
user. Units are metric (kg, cm, km, ml).

## Code

- `server.js`: Express server, auth, schema and the JSON API
  (`/api/state` plus small write routes).
- `public/index.html`: page shell (platform bridge, native UI kit, theme).
- `public/app.js`: the whole client: views, charts, calculations, reminders.
- `dapp.json`: app name, description and proposal checks.
