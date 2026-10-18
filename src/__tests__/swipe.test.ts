import { releaseVelocity, sampleVelocity, SWIPE_DISMISS_FRACTION, SWIPE_EDGE_DISMISS_FRACTION, SWIPE_EDGE_RESISTANCE, SWIPE_EXIT_FACTOR, SWIPE_FLING_MIN_DISTANCE, SWIPE_FLING_VELOCITY, SWIPE_VELOCITY_SMOOTHING, SWIPE_VELOCITY_STALE_MS, swipeEdgeDrag, swipeExitTarget, swipeIsVertical, swipeShouldDismiss } from '../swipe'

describe('swipeShouldDismiss', () => {
  it('dismisses strictly past the fraction of the view width, in either direction', () => {
    const width = 300
    const threshold = width * SWIPE_DISMISS_FRACTION
    expect(swipeShouldDismiss(threshold, width)).toBe(false) // exactly at the threshold does not
    expect(swipeShouldDismiss(threshold + 1, width)).toBe(true)
    expect(swipeShouldDismiss(-threshold, width)).toBe(false)
    expect(swipeShouldDismiss(-(threshold + 1), width)).toBe(true)
    expect(swipeShouldDismiss(0, width)).toBe(false)
  })

  it("scales with the view's own width: the same drag dismisses a narrow view but not a wide one", () => {
    expect(swipeShouldDismiss(100, 200)).toBe(true) // 100 > 60
    expect(swipeShouldDismiss(100, 400)).toBe(false) // 100 < 120
  })

  it('takes the fraction it is given (the edge swipe uses half the height)', () => {
    expect(swipeShouldDismiss(29, 56, 0, SWIPE_EDGE_DISMISS_FRACTION)).toBe(true)
    expect(swipeShouldDismiss(27, 56, 0, SWIPE_EDGE_DISMISS_FRACTION)).toBe(false)
  })

  it('dismisses a short flick: fast enough, moving the way it was swiped, past the minimum distance', () => {
    expect(swipeShouldDismiss(SWIPE_FLING_MIN_DISTANCE, 300, SWIPE_FLING_VELOCITY)).toBe(true)
    expect(swipeShouldDismiss(-SWIPE_FLING_MIN_DISTANCE, 300, -SWIPE_FLING_VELOCITY)).toBe(true)
    expect(swipeShouldDismiss(SWIPE_FLING_MIN_DISTANCE, 300, SWIPE_FLING_VELOCITY - 1)).toBe(false) // too slow
    expect(swipeShouldDismiss(SWIPE_FLING_MIN_DISTANCE - 1, 300, SWIPE_FLING_VELOCITY * 4)).toBe(false) // too short
    expect(swipeShouldDismiss(40, 300, -SWIPE_FLING_VELOCITY * 2)).toBe(false) // flicked back the other way
  })
})

describe('swipeIsVertical', () => {
  it('is vertical only when the pointer moved more up or down than sideways', () => {
    expect(swipeIsVertical(2, 10)).toBe(true)
    expect(swipeIsVertical(-2, -10)).toBe(true)
    expect(swipeIsVertical(10, 2)).toBe(false)
    expect(swipeIsVertical(10, 10)).toBe(false) // a tie stays sideways, the way the swipe always worked
  })
})

describe('swipeEdgeDrag', () => {
  it('follows the pointer toward the edge and resists the other way', () => {
    expect(swipeEdgeDrag(40, 1)).toBe(40) // bottom stack, down
    expect(swipeEdgeDrag(-40, 1)).toBe(-40 * SWIPE_EDGE_RESISTANCE) // bottom stack, up
    expect(swipeEdgeDrag(-40, -1)).toBe(-40) // top stack, up
    expect(swipeEdgeDrag(40, -1)).toBe(40 * SWIPE_EDGE_RESISTANCE) // top stack, down
  })
})

describe('sampleVelocity / releaseVelocity', () => {
  it('moves the running velocity toward each sample by the smoothing factor, in points per second', () => {
    expect(sampleVelocity(0, 10, 10)).toBeCloseTo(1000 * SWIPE_VELOCITY_SMOOTHING)
    expect(sampleVelocity(1000, 10, 10)).toBeCloseTo(1000)
    expect(sampleVelocity(1000, -10, 10)).toBeCloseTo(1000 - 2000 * SWIPE_VELOCITY_SMOOTHING)
  })

  it('ignores a sample with no elapsed time', () => {
    expect(sampleVelocity(300, 50, 0)).toBe(300)
  })

  it('counts nothing for a pointer held still before it lifted', () => {
    expect(releaseVelocity(900, SWIPE_VELOCITY_STALE_MS)).toBe(900)
    expect(releaseVelocity(900, SWIPE_VELOCITY_STALE_MS + 1)).toBe(0)
  })
})

describe('swipeExitTarget', () => {
  it('flies out to a multiple of the clearance length, in the direction of the swipe', () => {
    expect(swipeExitTarget(120, 300)).toBe(300 * SWIPE_EXIT_FACTOR)
    expect(swipeExitTarget(-120, 300)).toBe(-300 * SWIPE_EXIT_FACTOR)
  })
})
