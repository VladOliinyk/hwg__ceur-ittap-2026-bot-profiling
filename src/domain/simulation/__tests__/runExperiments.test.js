/**
 * Behavioral-profile experiments runner (E1 discrimination, E2 orientationBias
 * dose-response). Gated behind RUN_EXPERIMENTS=1 so the normal `npm test` skips
 * it. Writes per-match CSV + per-condition summary JSON to /experiments.
 *
 *   RUN_EXPERIMENTS=1 EXP_N=20 npx vitest run src/domain/simulation/__tests__/runExperiments.test.js
 *
 * E3 (consistency axis) needs no separate run: it reads the `c` column of the
 * E1 conditions (doctrine vs random).
 */
import { describe, it, expect } from 'vitest'
import { readFile } from 'node:fs/promises'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadLevelPackage } from '../../level/loadLevelPackage.js'
import { runProfileBatch } from '../experimentRunner.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PUBLIC_DIR = path.resolve(__dirname, '../../../../public')

async function fetchFromPublic(url) {
  const stripped = url.startsWith('/') ? url.slice(1) : url
  const abs = path.join(PUBLIC_DIR, stripped)
  try {
    const buf = await readFile(abs, 'utf8')
    const parsed = JSON.parse(buf)
    return { ok: true, status: 200, json: async () => parsed }
  } catch (err) {
    if (err && err.code === 'ENOENT') return { ok: false, status: 404, json: async () => null }
    throw err
  }
}

const RUN = process.env.RUN_EXPERIMENTS === '1'
const N = Number(process.env.EXP_N) > 0 ? Number(process.env.EXP_N) : 20
const OUT_DIR = path.resolve(__dirname, '../../../../experiments', `run-N${N}`)
const MAX_TURNS = Number(process.env.EXP_MAXTURNS) > 0 ? Number(process.env.EXP_MAXTURNS) : 80
const seeds = Array.from({ length: N }, (_, i) => `s${i + 1}`)
const suite = RUN ? describe : describe.skip

const MATCH_COLS = [
  'experiment', 'condition', 'seed', 'winner', 'turns', 'commandCount', 'adCount',
  'A', 'D', 'fires', 'towardMoves', 'awayMoves', 'aMove', 'aAll', 'c',
  'switchRate', 'pA', 'maxRun', 'fractionInRunsGTE3'
]

function toCSV(cols, rows) {
  const esc = v => (v == null ? '' : (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v)))
  return [cols.join(','), ...rows.map(r => r.map(esc).join(','))].join('\n') + '\n'
}

function fmtCI(ci) {
  if (!ci || ci.mean == null) return 'NA'
  return `${ci.mean.toFixed(3)}±${ci.ci95 != null ? ci.ci95.toFixed(3) : 'NA'}`
}

suite('behavioral-profile experiments (RUN_EXPERIMENTS=1)', () => {
  it('runs E1 + E2 and writes CSV/JSON to /experiments', async () => {
    const loaded = await loadLevelPackage('level_000', { fetch: fetchFromPublic })
    if (!loaded.ok) throw new Error('level_000 load failed: ' + JSON.stringify(loaded.errors))
    const levelPackage = loaded.package
    const opponentScheme = { kind: 'doctrine', profile: 'balanced' }

    const rows = []
    const summaries = []
    const record = (experiment, condition, scheme) => {
      const batch = runProfileBatch({ levelPackage, botPlayer: 'player1', botScheme: scheme, opponentScheme, seeds, maxTurns: MAX_TURNS })
      for (const m of batch.matches) {
        rows.push(MATCH_COLS.map(col => (col === 'experiment' ? experiment : col === 'condition' ? condition : m[col])))
      }
      const s = batch.summary
      summaries.push({ experiment, condition, n: s.matchCount, botWinRate: s.botWinRate, aMove: s.aMove, aAll: s.aAll, c: s.c, fractionInRunsGTE3: s.fractionInRunsGTE3, avgTurns: s.avgTurns, avgCommands: s.avgCommands })
    }

    // E1 — scheme discrimination: doctrines + a true cautious + random span the plane
    record('E1', 'aggressive', { kind: 'doctrine', profile: 'aggressive' })
    record('E1', 'balanced', { kind: 'doctrine', profile: 'balanced' })
    record('E1', 'defensive', { kind: 'doctrine', profile: 'defensive' })
    record('E1', 'cautious', { kind: 'cautious' })
    record('E1', 'random', { kind: 'random' })

    // E2bias — orientationBias sweep (engine knob; expect aMove FLAT = collapse, win rising)
    for (let i = 0; i <= 10; i++) {
      const bias = i / 10
      record('E2bias', `bias_${bias.toFixed(1)}`, { kind: 'doctrine', profile: 'balanced', orientationBias: bias })
    }

    // E2mix — mix(beta) sweep (the working lever; expect aMove ≈ 1 - beta dose-response)
    for (let i = 0; i <= 10; i++) {
      const beta = i / 10
      record('E2mix', `beta_${beta.toFixed(1)}`, { kind: 'mix', beta })
    }

    mkdirSync(OUT_DIR, { recursive: true })
    writeFileSync(path.join(OUT_DIR, 'matches.csv'), toCSV(MATCH_COLS, rows))
    writeFileSync(path.join(OUT_DIR, 'summaries.json'), JSON.stringify(summaries, null, 2))

    for (const s of summaries) {
      // eslint-disable-next-line no-console
      console.log(`RESULT ${s.experiment} ${s.condition.padEnd(11)} win=${s.botWinRate.toFixed(2)} aMove=${fmtCI(s.aMove).padEnd(13)} aAll=${fmtCI(s.aAll).padEnd(13)} c=${fmtCI(s.c).padEnd(13)} cmds=${s.avgCommands != null ? s.avgCommands.toFixed(1) : 'NA'} turns=${s.avgTurns != null ? s.avgTurns.toFixed(1) : 'NA'}`)
    }
    expect(rows.length).toBe(27 * N)
  }, 600000)
})
