# Perceptual pilot (blind survey)

Raw data and scoring for the blind perceptual channel of the paper
*"From Label to Behavior: A Dual-Channel Method for Verifying Solo-Wargame Bot Profiles"*
(Fig. 4, Table 4).

## Files

- `pilot_cards.csv` — one row per post-match card; `N = 43`.
- `aggregate_survey.mjs` — scores the cards into the per-doctrine perceived profile.

## Protocol

Each player filled a short card immediately after a match, **blind** to the bot's
doctrine label. About 7 players took part; per-player linkage was intentionally not
recorded, so the cards are anonymous and identified only by doctrine.

## Card columns

`doctrine` plus five Likert items (1 = strongly disagree … 5 = strongly agree):

| column | statement |
|---|---|
| `q1` | The opponent acted **aggressively**, pressed my forces |
| `q2` | The opponent stayed **cautious**, kept its distance |
| `q3` | The opponent's moves formed a **recognisable plan** |
| `q4` | The opponent's moves looked **random**, unconnected |
| `q5` | The opponent behaved like a **thinking side** |

## Scoring

- perceived **aggressiveness** = `(q1 + (6 − q2)) / 2`  → 1…5
- perceived **consistency** = `(q3 + (6 − q4)) / 2`  → 1…5
- a trait is **recognised** when its mean ≥ 4.0
- the 95% CI is descriptive (`1.96·SD/√n`); the pilot is small and the items are ordinal, so read it as a spread indicator, not an inferential test.

```bash
node survey/aggregate_survey.mjs
```

reproduces the per-doctrine table behind Fig. 4 / Table 4 (perceived aggressiveness:
Aggressive 4.45, Defensive 1.50, Cautious 1.73, Random 3.45).

## Provenance

Cards were collected in blind post-match batches and re-pasted with overlap during
collection. This file is the **deduplicated** canonical set (exact-duplicate rows
removed): Aggressive 11, Defensive 10, Cautious 11, Random 11 = 43 cards. One duplicate
Defensive card is treated as a re-paste artifact (`N = 10`). The survey instrument
itself is reproduced in the paper's appendix.
