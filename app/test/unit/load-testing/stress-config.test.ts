import { describe, expect, it } from 'vitest'
import {
  allocateMixedVus,
  assertStressVuSafety,
  buildStressStages,
  getAccountSlot,
  parseStressLevels,
} from '../../load/helpers/stress-config.js'

const LEVELS_VARIABLE = 'TEST_STRESS_LEVELS'

describe('parseStressLevels', () => {
  it('uses the documented defaults when no levels are configured', () => {
    expect(parseStressLevels('', LEVELS_VARIABLE)).toEqual([5, 10, 20, 30])
  })

  it('parses trimmed positive integer levels', () => {
    expect(parseStressLevels(' 2, 8,16 ', LEVELS_VARIABLE)).toEqual([2, 8, 16])
  })

  it.each(['0,5', '5.5,10', '5,201', 'five,10'])(
    'rejects an unsafe level list: %s',
    (levels) => {
      expect(() => parseStressLevels(levels, LEVELS_VARIABLE)).toThrowError(LEVELS_VARIABLE)
    }
  )
})

describe('assertStressVuSafety', () => {
  it('returns the maximum configured VU level within the default gate', () => {
    expect(assertStressVuSafety([5, 30, 10], LEVELS_VARIABLE, false)).toBe(30)
  })

  it('rejects levels above 50 without the explicit high-VU opt-in', () => {
    expect(() => assertStressVuSafety([50, 51], LEVELS_VARIABLE, false)).toThrowError(
      'ALLOW_HIGH_VU_COUNT=true'
    )
  })

  it('allows levels above 50 after the explicit opt-in', () => {
    expect(assertStressVuSafety([50, 200], LEVELS_VARIABLE, true)).toBe(200)
  })
})

describe('allocateMixedVus', () => {
  it('allocates the default levels at an exact 80/20 split', () => {
    expect([5, 10, 20, 30].map(allocateMixedVus)).toEqual([
      { authenticated: 4, anonymous: 1 },
      { authenticated: 8, anonymous: 2 },
      { authenticated: 16, anonymous: 4 },
      { authenticated: 24, anonymous: 6 },
    ])
  })

  it('keeps at least one VU in each group for totals of two or more', () => {
    expect(allocateMixedVus(2)).toEqual({ authenticated: 1, anonymous: 1 })
    expect(allocateMixedVus(3)).toEqual({ authenticated: 2, anonymous: 1 })
  })

  it('assigns the only VU to the authenticated workflow for a total of one', () => {
    expect(allocateMixedVus(1)).toEqual({ authenticated: 1, anonymous: 0 })
  })

  it('rejects non-positive and fractional totals', () => {
    expect(() => allocateMixedVus(0)).toThrowError('positive integer')
    expect(() => allocateMixedVus(2.5)).toThrowError('positive integer')
  })
})

describe('buildStressStages', () => {
  it('builds one target per level and a final ramp to zero', () => {
    expect(buildStressStages([5, 10], '1m', (level) => level)).toEqual([
      { duration: '1m', target: 5 },
      { duration: '1m', target: 10 },
      { duration: '1m', target: 0 },
    ])
  })

  it('supports allocating a subset of each total level', () => {
    expect(
      buildStressStages([5, 10], '30s', (level) => allocateMixedVus(level).anonymous)
    ).toEqual([
      { duration: '30s', target: 1 },
      { duration: '30s', target: 2 },
      { duration: '30s', target: 0 },
    ])
  })

  it('returns only the ramp-down stage when no levels are provided', () => {
    expect(buildStressStages([], '15s', (level) => level)).toEqual([
      { duration: '15s', target: 0 },
    ])
  })
})

describe('getAccountSlot', () => {
  it('maps a contiguous authenticated VU pool to distinct account slots', () => {
    const slots = [25, 26, 27, 28].map((vuId) => getAccountSlot(vuId, 4))

    expect(new Set(slots).size).toBe(4)
    expect(slots).toEqual([1, 2, 3, 4])
  })

  it('wraps later VU IDs into the configured account pool', () => {
    expect(getAccountSlot(9, 4)).toBe(1)
  })

  it('rejects invalid VU IDs and account counts', () => {
    expect(() => getAccountSlot(0, 4)).toThrowError('VU ID')
    expect(() => getAccountSlot(1, 0)).toThrowError('account count')
  })
})
