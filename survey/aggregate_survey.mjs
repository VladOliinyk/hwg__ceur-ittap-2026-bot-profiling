// Aggregate the blind perceptual-pilot cards (pilot_cards.csv) into per-doctrine
// perceived aggressiveness and consistency, following the survey scoring rule:
//   perceived aggressiveness = (Q1 + (6 - Q2)) / 2     -> 1..5
//   perceived consistency    = (Q3 + (6 - Q4)) / 2     -> 1..5
// (Q1 "acted aggressively", Q2 "kept its distance", Q3 "recognisable plan",
//  Q4 "moves looked random", Q5 "behaved like a thinking side".)
//
// The 95% CI is descriptive (1.96 * sample-SD / sqrt(n)); the pilot is small
// (N = 43) and the ratings are ordinal, so treat it as a spread indicator, not
// an inferential claim. Recognition threshold per the survey: mean >= 4.0.
//
//   node survey/aggregate_survey.mjs
import { readFileSync } from 'node:fs'

const rows = readFileSync(new URL('./pilot_cards.csv', import.meta.url), 'utf8')
  .trim().split(/\r?\n/).slice(1)
  .map(line => line.split(','))
  .map(([doctrine, q1, q2, q3, q4, q5]) => ({
    doctrine, q1: +q1, q2: +q2, q3: +q3, q4: +q4, q5: +q5
  }))

const perceivedAggressiveness = r => (r.q1 + (6 - r.q2)) / 2
const perceivedConsistency = r => (r.q3 + (6 - r.q4)) / 2

function describe(values) {
  const n = values.length
  const mean = values.reduce((s, x) => s + x, 0) / n
  const sd = Math.sqrt(values.reduce((s, x) => s + (x - mean) ** 2, 0) / (n - 1))
  const ci95 = 1.96 * sd / Math.sqrt(n)
  return { n, mean, sd, ci95 }
}

const byDoctrine = {}
for (const r of rows) (byDoctrine[r.doctrine] ||= []).push(r)

const order = ['Aggressive', 'Defensive', 'Cautious', 'Random']
const f = x => x.toFixed(2)

console.log('Blind perceptual pilot — per-doctrine perceived profile')
console.log('='.repeat(72))
console.log('doctrine      n   perceived aggressiveness    perceived consistency')
console.log('-'.repeat(72))
for (const d of order) {
  const rs = byDoctrine[d] || []
  if (!rs.length) continue
  const a = describe(rs.map(perceivedAggressiveness))
  const c = describe(rs.map(perceivedConsistency))
  console.log(
    `${d.padEnd(12)} ${String(a.n).padStart(2)}   ` +
    `${f(a.mean)} +/- ${f(a.ci95)} (sd ${f(a.sd)})     ` +
    `${f(c.mean)} +/- ${f(c.ci95)} (sd ${f(c.sd)})`
  )
}
console.log('-'.repeat(72))
console.log(`Total cards: ${rows.length}.  Recognition threshold: mean >= 4.0.`)
