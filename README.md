# HWG — Solo-Wargame Bot Behavioral Profiling

Hexagonal Wargame Generator (HWG) together with the reproducible code and data for the paper
**"From Label to Behavior: A Dual-Channel Method for Verifying Solo-Wargame Bot Profiles"**
(CEUR-WS / ITTAP-2026).

HWG lets you build hex-map wargame scenarios and play them against a table-driven bot.
The paper introduces a method that profiles the bot's behaviour from simulation along two
axes — **aggressiveness** (`A_m`) and **consistency** (`C`) — and validates it against a
short blind player survey, with a decision procedure that turns the comparison of the
intended, formal, and perceived profiles into a concrete design action.

## Setup

Requirements: **Node.js 18+**.

```bash
npm install
npm run serve          # dev server at http://localhost:8080
```

Open <http://localhost:8080>. The app has three areas:

- **Level builder** — paint a hex map, place units and bases, set victory conditions, and export a level package.
- **Playground** — load a level and play a match, commanding units yourself or letting the bot play a side.
- **Automated** — run headless matches for analysis.

Run the test suite:

```bash
npx vitest run
```

## Reproducing the article

### Play one game against a bot doctrine (the perceptual-study setup)

This is exactly how the blind perceptual pilot was run — a human plays one side, the bot
plays the other with a chosen doctrine.

1. `npm run serve`, then open <http://localhost:8080> → **Playground**.
2. In the **Setup** tab keep **Level = `level_000`** and set the opponent's doctrine
   (**Red profile**) to one of **Defensive / Balanced / Aggressive / Cautious / Random**.
3. Click **Start game**, switch to the **Turn controls** tab, and enable **auto-play** for
   the bot's side.
4. Play your turns; after each of your turns the bot plays its doctrine. Continue to the end
   of the match.

For a blind session the facilitator sets the doctrine without showing the player the Setup
tab, and records the player's aggressiveness rating afterwards.

### Formal profiling run (N = 1000, deterministic)

```bash
# canonical run -> experiments/run-N<N>/
RUN_EXPERIMENTS=1 EXP_N=1000 npx vitest run src/domain/simulation/__tests__/runExperiments.test.js
```

On Windows PowerShell, set the variables first:
`$env:RUN_EXPERIMENTS=1; $env:EXP_N=1000; npx vitest run src/domain/simulation/__tests__/runExperiments.test.js`

Every match uses a deterministic seed (`level_000-seed-k`, `k = 1…N`), so the run is
byte-reproducible. The profiling harness lives in `src/domain/simulation/experiment*.js`,
and the canonical runs are included under `experiments/` (`run-N1000/`, `run-N200/`).

### Perceptual pilot (blind survey)

```bash
node survey/aggregate_survey.mjs
```

Aggregates the blind post-match cards (`survey/pilot_cards.csv`, N = 43) into the
per-doctrine perceived aggressiveness and consistency reported in the paper (Fig. 4,
Table 4).

## What this artifact provides

Backing the paper's reproducibility claims, this repository contains:

- **The game level** — `public/level_000/`: a 5 × 8 hex board (40 cells; plains / forest / water), both players' bases and spawn rows, the unit roster (`level_000_units.json`), and the victory conditions (`level_000_objectives.json`).
- **The seed rule** — every simulated match is seeded `level_000-seed-k` (`k = 1…N`); see `src/domain/simulation/experimentRunner.js`. The canonical runs are committed under `experiments/`.
- **The five doctrines** — implemented under `src/domain/simulation/`: `strategies/heuristicStrategy.js` (aggressive / balanced / defensive via `orientationBias`), `experimentStrategies.js` (`cautious`), and `strategies/randomStrategy.js` (`random`), dispatched by `strategyProfiles.js`. Appendix A of the paper states the same five as prose rules.
- **The behavioural metrics** — aggressiveness `A_m` and consistency `C` in `src/domain/simulation/experimentMetrics.js`.
- **The perceptual-pilot data** — the blind survey cards (`survey/pilot_cards.csv`, N = 43) and the scoring script (`survey/aggregate_survey.mjs`), which reproduces the per-doctrine perceived profile behind Fig. 4 and Table 4.
