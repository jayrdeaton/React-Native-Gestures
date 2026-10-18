import { act, render, screen } from '@testing-library/react'
import { createRef } from 'react'
import { Platform } from 'react-native'

import { lastOnLayout } from '../__mocks__/react-native'
import { lastDetectorProps, lastPanCallbacks, lastPanConfig, panInstanceCount } from '../__mocks__/react-native-gesture-handler'
import { lastAnimatedStyle } from '../__mocks__/react-native-reanimated'
import { SWIPE_ACTIVE_OFFSET, SwipeToDismiss, type SwipeToDismissHandle, type SwipeToDismissProps } from '../SwipeToDismiss'

// The view as laid out: 200 wide and 50 tall unless a test says otherwise, so a sideways swipe dismisses past 60 (30%) and one toward an edge
// past 25 (half).
const layout = (width = 200, height = 50) => act(() => lastOnLayout.current?.({ nativeEvent: { layout: { height, width, x: 0, y: 0 } } }))

const mount = (props: Partial<SwipeToDismissProps> = {}, size?: [number, number]) => {
  const onDismiss = jest.fn()
  const ref = createRef<SwipeToDismissHandle>()
  render(
    <SwipeToDismiss ref={ref} onDismiss={onDismiss} testID='swipe' {...props}>
      <span>Content</span>
    </SwipeToDismiss>
  )
  layout(...(size ?? []))
  return { onDismiss, ref }
}

// A pan as the gesture runtime reports it: the pointer goes down at `down`, the pan activates at `start`, then the pointer is at `end`, where it
// lifts. `x`/`y` are relative to the stationary wrapper; `translationX/Y` are in WINDOW space and are passed as `extra` so a test can say what
// they were. The clock is held still, so the pointer has no speed and only the distance counts (a millisecond ticking over between calls on a
// slow runner would make a short drag a flick).
const pan = (down: [number, number], start: [number, number], end: [number, number], extra: { translationX?: number; translationY?: number } = {}) => {
  const now = jest.spyOn(Date, 'now').mockReturnValue(10_000)
  act(() => {
    lastPanCallbacks.onBegin?.({ x: down[0], y: down[1] })
    lastPanCallbacks.onStart?.({ x: start[0], y: start[1] })
    lastPanCallbacks.onUpdate?.({ x: end[0], y: end[1], ...extra })
    lastPanCallbacks.onEnd?.({ x: end[0], y: end[1], ...extra })
  })
  now.mockRestore()
}
const swipe = (from: number, to: number, extra?: { translationX?: number; translationY?: number }) => pan([from, 0], [from, 0], [to, 0], extra)

// A pan sampled over time: `points` are [ms after activation, local x, local y], activating at the first point (the clock is Date.now, which
// the gesture samples for the pointer's speed). The release is at the last point, `releaseAfter` ms after it.
const timedPan = (points: [number, number, number][], releaseAfter = 0) => {
  const now = jest.spyOn(Date, 'now')
  const at = (ms: number) => now.mockReturnValue(10_000 + ms)
  const [[, startX, startY], ...moves] = points
  act(() => {
    at(0)
    lastPanCallbacks.onBegin?.({ x: startX, y: startY })
    lastPanCallbacks.onStart?.({ x: startX, y: startY })
    for (const [ms, x, y] of moves) {
      at(ms)
      lastPanCallbacks.onUpdate?.({ x, y })
    }
    const [lastMs, lastX, lastY] = points[points.length - 1]
    at(lastMs + releaseAfter)
    lastPanCallbacks.onEnd?.({ x: lastX, y: lastY })
  })
  now.mockRestore()
}

beforeEach(() => {
  panInstanceCount.current = 0
  lastOnLayout.current = undefined
  lastAnimatedStyle.current = undefined
  for (const key of Object.keys(lastPanCallbacks)) delete lastPanCallbacks[key as keyof typeof lastPanCallbacks]
})

describe('SwipeToDismiss', () => {
  it('renders its content in the stationary wrapper', () => {
    mount()
    expect(screen.getByTestId('swipe').textContent).toBe('Content')
  })

  it('dismisses past 30% of its own width, in either direction, and not before', () => {
    const dismisses = (from: number, to: number) => {
      const { onDismiss } = mount()
      swipe(from, to)
      return onDismiss.mock.calls.length === 1
    }
    expect(dismisses(0, 60)).toBe(false)
    expect(dismisses(0, 61)).toBe(true)
    expect(dismisses(0, -60)).toBe(false)
    expect(dismisses(0, -61)).toBe(true)
  })

  it('springs back when let go short, and flies off past the screen when dismissed', () => {
    mount()
    swipe(0, 40)
    expect(lastAnimatedStyle.current.transform).toEqual([{ translateX: 0 }, { translateY: 0 }])
    swipe(0, 100)
    // 1.5x the larger window dimension (812), in the swipe's direction.
    expect(lastAnimatedStyle.current.transform[0].translateX).toBe(812 * 1.5)
  })

  it('is relative to where the pan activated, and never reads the window-space translation (it works inside a turned frame)', () => {
    const dismisses = (from: number, to: number, extra?: { translationX?: number; translationY?: number }) => {
      const { onDismiss } = mount()
      swipe(from, to, extra)
      return onDismiss.mock.calls.length === 1
    }
    expect(dismisses(100, 150)).toBe(false) // moved 50
    expect(dismisses(100, 180)).toBe(true) // moved 80
    expect(dismisses(0, 100, { translationX: 0, translationY: 400 })).toBe(true)
    expect(dismisses(0, 20, { translationX: 400, translationY: 400 })).toBe(false)
  })

  it('dismisses a short, fast flick, but not a short drag held still before it lifts', () => {
    const { onDismiss } = mount()
    // 30pt in 24ms: far below the 60pt the distance alone needs.
    timedPan([
      [0, 0, 0],
      [8, 10, 0],
      [16, 20, 0],
      [24, 30, 0]
    ])
    expect(onDismiss).toHaveBeenCalledTimes(1)

    const held = mount()
    timedPan(
      [
        [0, 0, 0],
        [8, 10, 0],
        [16, 20, 0],
        [24, 30, 0]
      ],
      200
    )
    expect(held.onDismiss).not.toHaveBeenCalled()
  })

  it('accepts a single finger only, since `x` is the centroid of every finger on the view', () => {
    mount()
    expect(lastPanConfig.maxPointers).toBe(1)
  })

  describe('without an edge', () => {
    it('only takes a sideways drag, leaving one that goes up or down first to a scroll view around it', () => {
      mount()
      expect(lastPanConfig.activeOffsetX).toEqual([-SWIPE_ACTIVE_OFFSET, SWIPE_ACTIVE_OFFSET])
      expect(lastPanConfig.failOffsetY).toEqual([-SWIPE_ACTIVE_OFFSET, SWIPE_ACTIVE_OFFSET])
    })

    it("leaves a phone browser's up and down scrolling alone (web)", () => {
      mount()
      expect(lastDetectorProps.touchAction).toBe('pan-y')
    })

    it('never moves up or down', () => {
      const { onDismiss } = mount()
      pan([50, 0], [52, 12], [52, 300])
      expect(onDismiss).not.toHaveBeenCalled()
      expect(lastAnimatedStyle.current.transform[1].translateY).toBe(0)
    })
  })

  describe('with an edge', () => {
    it('takes a drag either way, so it can tell which way it went', () => {
      mount({ edge: 'bottom' })
      expect(lastPanConfig.activeOffsetX).toBeUndefined()
      expect(lastPanConfig.failOffsetY).toBeUndefined()
      expect(lastDetectorProps.touchAction).toBe('none')
    })

    it('dismisses a drag toward the edge past half its own height, and never one the other way', () => {
      const dismisses = (edge: 'bottom' | 'top', start: [number, number], end: [number, number]) => {
        const { onDismiss } = mount({ edge })
        pan([50, 0], start, end)
        return onDismiss.mock.calls.length === 1
      }
      expect(dismisses('bottom', [50, 10], [50, 35])).toBe(false) // 25
      expect(dismisses('bottom', [50, 10], [50, 36])).toBe(true) // 26
      expect(dismisses('bottom', [50, -10], [50, -400])).toBe(false)
      expect(dismisses('top', [50, -10], [50, -40])).toBe(true)
      expect(dismisses('top', [50, 10], [50, 400])).toBe(false)
    })

    it('locks the axis at activation', () => {
      const dismisses = (start: [number, number], end: [number, number]) => {
        const { onDismiss } = mount({ edge: 'bottom' })
        pan([50, 0], start, end)
        return onDismiss.mock.calls.length === 1
      }
      expect(dismisses([62, 2], [62, 300])).toBe(false) // sideways: moved 0 along x
      expect(dismisses([52, 12], [300, 12])).toBe(false) // vertical: moved 0 along y
    })
  })

  it('has no swipe without onDismiss, or before its first layout', () => {
    render(
      <SwipeToDismiss testID='swipe'>
        <span>Content</span>
      </SwipeToDismiss>
    )
    layout()
    expect(lastPanConfig.enabled).toBe(false)

    const onDismiss = jest.fn()
    render(<SwipeToDismiss onDismiss={onDismiss} />)
    expect(lastPanConfig.enabled).toBe(false)
    layout()
    expect(lastPanConfig.enabled).toBe(true)
  })

  it('ignores a layout with no width', () => {
    mount({}, [0, 50])
    expect(lastPanConfig.enabled).toBe(false)
  })

  it('does not rebuild the gesture as a swipe updates (its state lives in shared values)', () => {
    mount()
    const built = panInstanceCount.current
    act(() => {
      lastPanCallbacks.onStart?.({ x: 0, y: 0 })
      lastPanCallbacks.onUpdate?.({ x: 30, y: 0 })
    })
    expect(panInstanceCount.current).toBe(built)
  })

  it('calls the latest onDismiss', () => {
    const first = jest.fn()
    const second = jest.fn()
    const { rerender } = render(<SwipeToDismiss onDismiss={first} />)
    layout()
    rerender(<SwipeToDismiss onDismiss={second} />)
    swipe(0, 100)
    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledTimes(1)
  })

  // The browser clicks at pointer-up, and react-native-web presses on that click: a swipe must not also press what's under it (native
  // gesture-handler cancels the touch for it).
  describe('on the web', () => {
    const os = Platform.OS
    beforeEach(() => {
      Platform.OS = 'web'
    })
    afterEach(() => {
      Platform.OS = os
    })

    const mountPressable = () => {
      const onPress = jest.fn()
      render(
        <SwipeToDismiss onDismiss={jest.fn()} testID='swipe'>
          <button onClick={onPress}>Press me</button>
        </SwipeToDismiss>
      )
      layout()
      return onPress
    }

    it('eats the click that follows a swipe, whether it went or sprang back', () => {
      const onPress = mountPressable()
      swipe(0, 20)
      act(() => screen.getByText('Press me').click())
      expect(onPress).not.toHaveBeenCalled()
    })

    it('lets a tap press, and the next tap after a swipe', () => {
      const onPress = mountPressable()
      act(() => lastPanCallbacks.onBegin?.({ x: 0, y: 0 }))
      act(() => screen.getByText('Press me').click())
      expect(onPress).toHaveBeenCalledTimes(1)

      swipe(0, 20)
      act(() => screen.getByText('Press me').click())
      act(() => lastPanCallbacks.onBegin?.({ x: 0, y: 0 }))
      act(() => screen.getByText('Press me').click())
      expect(onPress).toHaveBeenCalledTimes(2)
    })
  })

  describe('once dismissed', () => {
    it('stays gone: a touch on the empty wrapper does nothing', () => {
      const { onDismiss } = mount()
      swipe(0, 100)
      const flownTo = lastAnimatedStyle.current.transform[0].translateX
      swipe(0, -100)
      expect(onDismiss).toHaveBeenCalledTimes(1)
      expect(lastAnimatedStyle.current.transform[0].translateX).toBe(flownTo)
    })

    it('restore() springs it back into place and lets it be swiped away again', () => {
      const { onDismiss, ref } = mount()
      swipe(0, 100)
      act(() => ref.current?.restore())
      expect(lastAnimatedStyle.current.transform).toEqual([{ translateX: 0 }, { translateY: 0 }])
      swipe(0, -100)
      expect(onDismiss).toHaveBeenCalledTimes(2)
    })
  })
})
