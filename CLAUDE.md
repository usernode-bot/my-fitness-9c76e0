# My Fitness — notes for Claude Code

This app runs on **Homeroom**. If you're Claude Code
editing this repo, read the platform conventions before making
changes:

**Platform conventions (authoritative, always current):**
https://app.onhomeroom.com/claude.md

Fetch that URL at the start of each session — it's the single source
of truth for platform-wide behavior (auth model, `USERNODE_ENV`,
public/private tables, "don't `git push`", etc.). The hosted copy is
updated in place when platform rules change, so fetching it gives you
today's rules, not a stale snapshot.

When running inside Homeroom's dev-chat, those same conventions are
already injected into your system prompt, so the fetch is a no-op in
that path — but it's the right reflex when someone runs Claude Code
against this repo locally or from another harness.

## Connector permission prompts

This repo ships `.claude/settings.json`, which allows the **read-only**
Homeroom connector calls (`mcp__homeroom__get_*`,
`…__list_*`, `…__whoami`) so they stop prompting one at a time. Everything
that acts — filing a request, opening or advancing a proposal — still asks.
Claude Code applies those rules only after you accept the
workspace trust dialog, which lists them for review. See `.claude/README.md`
for the whole story, including what to do if you are still being prompted
(usually: your connector is registered under a different name than the rules
assume).

## Check that this checkout is current

You may be working in a fork of this app whose `main` is behind the app's
canonical repository, and nothing in the checkout says so: `git fetch origin`
compares the fork with itself. This matters before you **read** code to answer
a question about how the app behaves now, not only before you edit it.

The canonical repository is named in `.claude/homeroom-canonical-repo`. Check against
it, not against `origin`:

```sh
git fetch "$(cat .claude/homeroom-canonical-repo)" main
git merge-base --is-ancestor FETCH_HEAD HEAD && echo current || echo behind
```

`behind` means this checkout does not contain the canonical `main`. To answer
a question, read the canonical code instead (`git show FETCH_HEAD:<path>`,
`git grep <pattern> FETCH_HEAD`). To change code, start from the exact base
commit your Homeroom work order gives, and never merge or rebase onto the
canonical `main` yourself: which commit a change is diffed against decides
what the group votes on. With the Homeroom connector, `get_checkout_status`
answers the same question.

A session-start hook (`.claude/hooks/homeroom-freshness.sh`, see `.claude/README.md`) runs
this check for you and tells you when you are behind. It is silent offline, so
its silence is not proof the checkout is current. Inside Homeroom's dev-chat
the platform fixes the base commit, and none of this applies.

If a rule below this line conflicts with the hosted conventions, the
hosted conventions win. This file is **app-specific** — write down
things about *this* app that belong in the repo: product intent,
data-model quirks, style preferences, opt-in policies (e.g. which
tables you've marked private), etc.

---

## About My Fitness

A simple personal fitness tracker: food and macros, water, steps,
workouts, weight, goals, achievements and reminders, with a Home dashboard
and five bottom tabs (Home, Food, Workout, Progress, Profile).

## App-specific conventions

- Every table (`profiles`, `food_entries`, `water_entries`, `daily_steps`,
  `workouts`, `weight_entries`) is `staging:private`: it is personal health
  data. Staging previews start empty; each reviewer logs their own data.
- Units are metric throughout (kg, cm, km, ml).
- "Today" is the viewer's local calendar day. The client sends `day`
  (YYYY-MM-DD, from `usernode.now()`) on every call; the server never
  computes the day itself.
- The profile's current weight is the latest row in `weight_entries`;
  there is no weight column on `profiles`.
- Goals left empty in the profile use the suggested values computed in
  `autoGoals()` in `public/app.js`; achievements are computed client-side
  from the per-day totals `/api/state` returns.
- Light and dark looks: Auto follows the Homeroom theme; the user can pin
  Light or Dark in Profile (saved in `profiles.settings.theme`).
- Reminders fire only while the app is open (in-app toast, plus a browser
  notification when permitted and the page is hidden).
- Chart colours (validated for colour-blind separation): calories and
  single-series charts violet-500, water sky-600, protein blue-500, carbs
  amber-600, fat pink-500.
