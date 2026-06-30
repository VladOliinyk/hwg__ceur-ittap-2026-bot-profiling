import { describe, expect, it } from 'vitest'
import { describeForError, describeThrown, summarizeCommand } from '../safeFormat.js'

describe('describeForError', () => {
  it('handles primitives', () => {
    expect(describeForError('hi')).toBe('hi')
    expect(describeForError(42)).toBe('42')
    expect(describeForError(true)).toBe('true')
    expect(describeForError(null)).toBe('null')
    expect(describeForError(undefined)).toBe('undefined')
  })

  it('handles Symbol without throwing (template interpolation would)', () => {
    const s = Symbol('bad')
    expect(() => describeForError(s)).not.toThrow()
    expect(describeForError(s)).toBe('Symbol(bad)')
  })

  it('handles objects and arrays', () => {
    expect(describeForError({})).toBe('[object Object]')
    expect(describeForError([1, 2, 3])).toBe('1,2,3')
  })

  it('returns <unstringifiable> when toString throws', () => {
    const evil = { toString() { throw new Error('nope') } }
    expect(() => describeForError(evil)).not.toThrow()
    expect(describeForError(evil)).toBe('<unstringifiable>')
  })
})

describe('describeThrown', () => {
  it('prefers Error.message when it is a non-empty string', () => {
    expect(describeThrown(new Error('boom'))).toBe('boom')
  })

  it('falls back to String coercion when message is missing/empty', () => {
    expect(describeThrown({ name: 'X' })).toBe('[object Object]')
    expect(describeThrown(new Error(''))).toBe('Error')
    expect(describeThrown('plain string')).toBe('plain string')
  })

  it('handles a thrown value with a throwing .message getter (round 5 fix)', () => {
    const hostile = {
      get message() { throw new Error('message getter blew') },
      toString() { return 'hostile-throwable' }
    }
    expect(() => describeThrown(hostile)).not.toThrow()
    expect(describeThrown(hostile)).toBe('hostile-throwable')
  })

  it('handles a thrown value with both throwing message AND throwing toString', () => {
    const veryHostile = {
      get message() { throw new Error('msg blew') },
      toString() { throw new Error('toString blew') }
    }
    expect(() => describeThrown(veryHostile)).not.toThrow()
    expect(describeThrown(veryHostile)).toBe('<unstringifiable>')
  })

  it('handles Symbol thrown directly', () => {
    const sym = Symbol('thrown')
    expect(() => describeThrown(sym)).not.toThrow()
    expect(describeThrown(sym)).toBe('Symbol(thrown)')
  })

  it('handles null/undefined', () => {
    expect(describeThrown(null)).toBe('null')
    expect(describeThrown(undefined)).toBe('undefined')
  })
})

describe('summarizeCommand', () => {
  it('extracts type and unitId from a normal command', () => {
    const s = summarizeCommand({ type: 'fire', unitId: 'p1_inf1', payload: { target: { q: 1, r: 0, unitId: 'p2_inf1' } } })
    expect(s).toEqual({ type: 'fire', unitId: 'p1_inf1' })
  })

  it('omits unitId when missing or non-string', () => {
    expect(summarizeCommand({ type: 'endTurn' })).toEqual({ type: 'endTurn' })
    expect(summarizeCommand({ type: 'move', unitId: 42 })).toEqual({ type: 'move' })
  })

  it('returns a frozen object', () => {
    const s = summarizeCommand({ type: 'endTurn' })
    expect(Object.isFrozen(s)).toBe(true)
    expect(() => { s.type = 'tampered' }).toThrow(TypeError)
  })

  it('handles non-object command shapes safely', () => {
    expect(summarizeCommand(null)).toEqual({ type: 'null' })
    expect(summarizeCommand(undefined)).toEqual({ type: 'undefined' })
    expect(summarizeCommand('plain')).toEqual({ type: 'plain' })
    expect(summarizeCommand(42)).toEqual({ type: '42' })
  })

  it('tolerates a throwing type getter without throwing', () => {
    const command = { get type() { throw new Error('type getter blew') } }
    expect(() => summarizeCommand(command)).not.toThrow()
    expect(summarizeCommand(command)).toEqual({ type: '<unstringifiable>' })
  })

  it('tolerates a throwing unitId getter without throwing', () => {
    const command = {
      type: 'fire',
      get unitId() { throw new Error('unitId getter blew') }
    }
    expect(() => summarizeCommand(command)).not.toThrow()
    // unitId is omitted entirely when its getter throws.
    expect(summarizeCommand(command)).toEqual({ type: 'fire' })
  })

  it('does not preserve a reference to the strategy-owned command', () => {
    const original = { type: 'teleport', unitId: 'x', counter: 1 }
    const snap = summarizeCommand(original)
    // Different identities — mutating the original cannot reach the snapshot.
    expect(snap).not.toBe(original)
    original.type = 'mutated'
    original.counter = 999
    expect(snap.type).toBe('teleport')
    expect(snap.counter).toBeUndefined()
  })

  it('the snapshot is JSON-safe even if the source had throwing getters', () => {
    const hostile = {
      type: 'teleport',
      get poison() { throw new Error('poison') }
    }
    const snap = summarizeCommand(hostile)
    expect(() => JSON.stringify(snap)).not.toThrow()
    expect(JSON.parse(JSON.stringify(snap))).toEqual({ type: 'teleport' })
  })

  it('coerces a Symbol type without throwing', () => {
    const s = summarizeCommand({ type: Symbol('bad') })
    expect(s.type).toBe('Symbol(bad)')
  })
})
