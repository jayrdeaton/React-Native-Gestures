import { act, renderHook } from '@testing-library/react'

import { lastPanCallbacks, lastPanConfig, lastPinchCallbacks, lastPinchConfig } from '../__mocks__/react-native-gesture-handler'
import { type PinchZoomOptions, usePinchZoom } from '../usePinchZoom'
import { ZOOM_MAX_SCALE, ZOOM_PAN_MIN_DISTANCE } from '../zoom'

// A 400 x 400 viewport with content that fills it, unless a test says otherwise.
const mount = (options: Partial<PinchZoomOptions> = {}) => renderHook((props: PinchZoomOptions) => usePinchZoom(props), { initialProps: { height: 400, width: 400, ...options } })

// A pinch as the gesture runtime reports it: `scale` is the pinch's own scale since its fingers went down, the focal point is between the
// fingers, relative to the viewport.
const pinchStart = (scale: number, focalX: number, focalY: number, numberOfPointers = 2) => act(() => lastPinchCallbacks.onStart?.({ focalX, focalY, numberOfPointers, scale }))
const pinchMove = (scale: number, focalX: number, focalY: number, numberOfPointers = 2) => act(() => lastPinchCallbacks.onUpdate?.({ focalX, focalY, numberOfPointers, scale }))
const pinchEnd = () => act(() => lastPinchCallbacks.onEnd?.({}))
const pinch = (scale: number, focalX = 200, focalY = 200) => {
  pinchStart(1, focalX, focalY)
  pinchMove(scale, focalX, focalY)
  pinchEnd()
}

// A pan: `x`/`y` are relative to the viewport; `translationX/Y` (window space) can be passed to show they're never read.
const panStart = (x: number, y: number, numberOfPointers = 1) =>
  act(() => {
    lastPanCallbacks.onBegin?.({ numberOfPointers, x, y })
    lastPanCallbacks.onStart?.({ numberOfPointers, x, y })
  })
const panMove = (x: number, y: number, numberOfPointers = 1, extra: { translationX?: number; translationY?: number } = {}) => act(() => lastPanCallbacks.onUpdate?.({ numberOfPointers, x, y, ...extra }))
const pan = (from: [number, number], to: [number, number], numberOfPointers = 1) => {
  panStart(from[0], from[1], numberOfPointers)
  panMove(to[0], to[1], numberOfPointers)
  act(() => lastPanCallbacks.onEnd?.({ numberOfPointers, x: to[0], y: to[1] }))
}

beforeEach(() => {
  for (const record of [lastPanCallbacks, lastPinchCallbacks]) for (const key of Object.keys(record)) delete record[key as keyof typeof record]
})

describe('usePinchZoom', () => {
  it("starts at the content's own size, centered", () => {
    const { result } = mount()
    expect(result.current.scale.value).toBe(1)
    expect(result.current.translateX.value).toBe(0)
    expect(result.current.translateY.value).toBe(0)
  })

  it('zooms about the point between the fingers, so what is under them stays under them', () => {
    const { result } = mount()
    pinch(2, 300, 100)
    expect(result.current.scale.value).toBe(2)
    // The content point 100 right of center and 100 above it was under (300, 100), and still is: 200 + offset + 2 * point.
    expect(result.current.translateX.value).toBeCloseTo(-100)
    expect(result.current.translateY.value).toBeCloseTo(100)
  })

  it('follows the fingers as they move while pinching', () => {
    const { result } = mount()
    pinch(2)
    pinchStart(1, 200, 200)
    pinchMove(1, 250, 180)
    expect(result.current.scale.value).toBe(2)
    expect(result.current.translateX.value).toBeCloseTo(50)
    expect(result.current.translateY.value).toBeCloseTo(-20)
  })

  it('holds the scale between minScale and maxScale', () => {
    const scaleAfter = (options: Partial<PinchZoomOptions>, ...pinches: number[]) => {
      const { result, unmount } = mount(options)
      for (const to of pinches) pinch(to)
      const scale = result.current.scale.value
      unmount()
      return scale
    }
    expect(scaleAfter({}, 10)).toBe(ZOOM_MAX_SCALE)
    expect(scaleAfter({ maxScale: 3 }, 10)).toBe(3)
    expect(scaleAfter({}, 2, 0.1)).toBe(1)
    expect(scaleAfter({ minScale: 0.5 }, 0.1)).toBe(0.5)
  })

  it('zooms back at once when a pinch past a bound turns around', () => {
    const { result } = mount()
    pinchStart(1, 200, 200)
    pinchMove(8, 200, 200)
    expect(result.current.scale.value).toBe(5)
    pinchMove(7, 200, 200)
    expect(result.current.scale.value).toBeCloseTo(5 * (7 / 8))
  })

  it('skips a pinch event with a bad scale, and measures the next from the last good one', () => {
    const { result } = mount()
    pinchStart(1.1, 200, 200)
    pinchMove(Number.NaN, 200, 200)
    expect(result.current.scale.value).toBe(1)
    pinchMove(2.2, 200, 200)
    expect(result.current.scale.value).toBeCloseTo(2)
  })

  it('anchors the pinch where it activated, so the scale it had by then is not a jump', () => {
    const { result } = mount()
    pinchStart(1.2, 200, 200)
    pinchMove(1.2, 200, 200)
    expect(result.current.scale.value).toBe(1)
  })

  it("pans with one finger, stopping at the content's edges", () => {
    const { result } = mount()
    pinch(2)
    pan([100, 100], [150, 130])
    expect(result.current.translateX.value).toBe(50)
    expect(result.current.translateY.value).toBe(30)
    pan([100, 100], [600, -400])
    expect(result.current.translateX.value).toBe(200)
    expect(result.current.translateY.value).toBe(-200)
  })

  it('does not move content at its own size: there is nothing past its edges to show', () => {
    const { result } = mount()
    pan([100, 100], [180, 160])
    expect(result.current.translateX.value).toBe(0)
    expect(result.current.translateY.value).toBe(0)
  })

  it('pans with two fingers that are not pinching', () => {
    const { result } = mount()
    pinch(2)
    pan([200, 200], [240, 210], 2)
    expect(result.current.translateX.value).toBe(40)
    expect(result.current.translateY.value).toBe(10)
  })

  it('counts two pinching fingers once: the pan stands aside while a pinch is active', () => {
    const { result } = mount()
    pinch(2)
    panStart(200, 200, 2)
    pinchStart(1, 200, 200)
    panMove(250, 200, 2)
    pinchMove(1, 250, 200)
    expect(result.current.translateX.value).toBeCloseTo(50)
    pinchEnd()
    panMove(260, 200, 2)
    expect(result.current.translateX.value).toBeCloseTo(60)
  })

  it("only re-anchors when a finger lands or lifts, since the point it tracks is every finger's centroid", () => {
    const { result } = mount()
    pinch(3)
    panStart(100, 100)
    panMove(110, 100)
    expect(result.current.translateX.value).toBe(10)
    panMove(150, 100, 2)
    expect(result.current.translateX.value).toBe(10)
    panMove(160, 100, 2)
    expect(result.current.translateX.value).toBe(20)

    pinchStart(1, 200, 200)
    pinchMove(1, 260, 200, 3)
    expect(result.current.translateX.value).toBeCloseTo(20)
    pinchMove(1, 270, 200, 3)
    expect(result.current.translateX.value).toBeCloseTo(30)
  })

  it('is relative to the viewport, and never reads the window-space translation (it works inside a turned frame)', () => {
    const { result } = mount()
    pinch(2)
    panStart(100, 100)
    panMove(130, 100, 1, { translationX: 0, translationY: 30 })
    expect(result.current.translateX.value).toBe(30)
    expect(result.current.translateY.value).toBe(0)
  })

  it("keeps content smaller than the viewport centered, and stops the pan at the content's own edges", () => {
    const { result } = mount({ contentHeight: 400, contentWidth: 200 })
    pinch(1.5, 350, 200)
    expect(result.current.translateX.value).toBe(0) // 300 wide in a 400 wide viewport
    pinch(4 / 3, 350, 200) // to 2: 400 wide, still no room
    expect(result.current.scale.value).toBeCloseTo(2)
    expect(result.current.translateX.value).toBe(0)
    pinch(1.5) // to 3: 600 wide, 100 of room either way
    pan([100, 100], [400, 100])
    expect(result.current.translateX.value).toBe(100)
  })

  it('is off until the viewport has a size', () => {
    const { rerender } = mount({ height: 0, width: 0 })
    expect(lastPanConfig.enabled).toBe(false)
    expect(lastPinchConfig.enabled).toBe(false)
    rerender({ height: 400, width: 400 })
    expect(lastPanConfig.enabled).toBe(true)
    expect(lastPinchConfig.enabled).toBe(true)
  })

  it('waits for a real drag before panning, so a tap or a long press reaches the content', () => {
    mount()
    expect(lastPanConfig.minDistance).toBe(ZOOM_PAN_MIN_DISTANCE)
  })

  it('runs the pinch and the pan together', () => {
    const { result } = mount()
    const gesture = result.current.gesture as unknown as { gestures: { type: string }[]; type: string }
    expect(gesture.type).toBe('simultaneous')
    expect(gesture.gestures.map((g) => g.type)).toEqual(['pinch', 'pan'])
  })

  it('does not rebuild the gesture as it updates, only when a size or bound changes', () => {
    const { rerender, result } = mount()
    const built = result.current.gesture
    pinch(2)
    pan([100, 100], [150, 100])
    rerender({ height: 400, width: 400 })
    expect(result.current.gesture).toBe(built)
    rerender({ height: 400, width: 500 })
    expect(result.current.gesture).not.toBe(built)
  })

  it('holds the transform inside new bounds when the viewport or a bound changes', () => {
    const { rerender, result } = mount()
    pinch(2)
    pan([0, 0], [400, 400])
    rerender({ height: 600, width: 600 }) // content now 600 x 600, 1200 zoomed: 300 of room
    expect(result.current.translateX.value).toBe(200)
    rerender({ contentHeight: 400, contentWidth: 400, height: 600, width: 600 }) // 800 zoomed: 100 of room
    expect(result.current.translateX.value).toBe(100)
    expect(result.current.translateY.value).toBe(100)
    rerender({ contentHeight: 400, contentWidth: 400, height: 600, maxScale: 1.25, width: 600 }) // 500 zoomed: smaller than the viewport
    expect(result.current.scale.value).toBe(1.25)
    expect(result.current.translateX.value).toBe(0)
  })

  it("reset() eases back to the content's own size, centered, or the nearest bound to it", () => {
    const { result } = mount()
    pinch(3, 100, 300)
    pan([0, 0], [50, 50])
    act(() => result.current.reset())
    expect(result.current.scale.value).toBe(1)
    expect(result.current.translateX.value).toBe(0)
    expect(result.current.translateY.value).toBe(0)

    const atLeastTwo = mount({ minScale: 2 }).result
    pinch(2)
    expect(atLeastTwo.current.scale.value).toBe(4)
    act(() => atLeastTwo.current.reset())
    expect(atLeastTwo.current.scale.value).toBe(2)
  })

  it('starts inside its bounds when minScale is above 1', () => {
    const { result } = mount({ minScale: 2 })
    expect(result.current.scale.value).toBe(2)
  })

  it('hands back the same shared values for its whole life', () => {
    const { rerender, result } = mount()
    const { scale, translateX, translateY } = result.current
    rerender({ height: 300, width: 300 })
    expect(result.current.scale).toBe(scale)
    expect(result.current.translateX).toBe(translateX)
    expect(result.current.translateY).toBe(translateY)
  })
})
