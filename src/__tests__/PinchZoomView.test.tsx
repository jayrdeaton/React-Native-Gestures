import { act, render, screen } from '@testing-library/react'
import { createRef } from 'react'
import { Platform } from 'react-native'

import { lastOnLayout } from '../__mocks__/react-native'
import { lastDetectorProps, lastPanCallbacks, lastPanConfig, lastPinchCallbacks, lastPinchConfig } from '../__mocks__/react-native-gesture-handler'
import { lastAnimatedStyle } from '../__mocks__/react-native-reanimated'
import { type PinchZoomHandle, PinchZoomView, type PinchZoomViewProps } from '../PinchZoomView'

// The viewport as laid out: 400 x 400 unless a test says otherwise.
const layout = (width = 400, height = 400) => act(() => lastOnLayout.current?.({ nativeEvent: { layout: { height, width, x: 0, y: 0 } } }))

const mount = (props: Partial<PinchZoomViewProps> = {}) => {
  const ref = createRef<PinchZoomHandle>()
  render(
    <PinchZoomView ref={ref} testID='zoom' {...props}>
      <span>Content</span>
    </PinchZoomView>
  )
  return ref
}

// The transform on the content (the Animated.View inside the viewport), read live.
const transform = () => (lastAnimatedStyle.current as { transform?: unknown }[]).find((style) => style?.transform)?.transform as [{ translateX: number }, { translateY: number }, { scale: number }]
const scale = () => transform()[2].scale
const translateX = () => transform()[0].translateX

const pinch = (to: number, focalX = 200, focalY = 200) =>
  act(() => {
    lastPinchCallbacks.onStart?.({ focalX, focalY, numberOfPointers: 2, scale: 1 })
    lastPinchCallbacks.onUpdate?.({ focalX, focalY, numberOfPointers: 2, scale: to })
    lastPinchCallbacks.onEnd?.({})
  })
const pan = (from: number, to: number) =>
  act(() => {
    lastPanCallbacks.onBegin?.({ numberOfPointers: 1, x: from, y: 0 })
    lastPanCallbacks.onStart?.({ numberOfPointers: 1, x: from, y: 0 })
    lastPanCallbacks.onUpdate?.({ numberOfPointers: 1, x: to, y: 0 })
    lastPanCallbacks.onEnd?.({ numberOfPointers: 1, x: to, y: 0 })
  })

beforeEach(() => {
  lastOnLayout.current = undefined
  lastAnimatedStyle.current = undefined
  for (const record of [lastPanCallbacks, lastPinchCallbacks]) for (const key of Object.keys(record)) delete record[key as keyof typeof record]
})

describe('PinchZoomView', () => {
  it('renders its content in the stationary viewport, with the zoom gesture on it', () => {
    mount()
    expect(screen.getByTestId('zoom').textContent).toBe('Content')
    expect((lastDetectorProps.gesture as { type: string }).type).toBe('simultaneous')
  })

  it('zooms nothing before its first layout, or after a layout with no size', () => {
    mount()
    expect(lastPinchConfig.enabled).toBe(false)
    expect(lastPanConfig.enabled).toBe(false)
    layout(0, 400)
    expect(lastPinchConfig.enabled).toBe(false)
    layout()
    expect(lastPinchConfig.enabled).toBe(true)
    expect(lastPanConfig.enabled).toBe(true)
  })

  it('transforms only the content, measured against its own size', () => {
    mount()
    layout()
    pinch(2, 300, 200)
    expect(scale()).toBe(2)
    expect(translateX()).toBeCloseTo(-100)
    pan(100, 1000)
    expect(translateX()).toBe(200) // (800 - 400) / 2
  })

  it('stops the pan at the edges of content smaller than the view', () => {
    mount({ contentHeight: 400, contentWidth: 300 })
    layout()
    pinch(2)
    pan(100, 1000)
    expect(translateX()).toBe(100) // (600 - 400) / 2
  })

  it('takes its scale bounds', () => {
    mount({ maxScale: 3, minScale: 0.5 })
    layout()
    pinch(10)
    expect(scale()).toBe(3)
    pinch(0.01)
    expect(scale()).toBe(0.5)
  })

  it('reset() eases the content back to its own size, centered', () => {
    const ref = mount()
    layout()
    pinch(3, 100, 100)
    act(() => ref.current?.reset())
    expect(transform()).toEqual([{ translateX: 0 }, { translateY: 0 }, { scale: 1 }])
  })

  // The browser clicks at pointer-up, and react-native-web presses on that click: a pan or a pinch must not also press what's under it (native
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
        <PinchZoomView testID='zoom'>
          <button onClick={onPress}>Press me</button>
        </PinchZoomView>
      )
      layout()
      return onPress
    }
    const click = () => act(() => screen.getByText('Press me').click())

    it('eats the click that follows a pan or a pinch', () => {
      const onPress = mountPressable()
      pan(100, 150)
      click()
      act(() => lastPanCallbacks.onBegin?.({ numberOfPointers: 1, x: 0, y: 0 }))
      pinch(2)
      click()
      expect(onPress).not.toHaveBeenCalled()
    })

    it('lets a tap press, and the next tap after a pan', () => {
      const onPress = mountPressable()
      act(() => lastPanCallbacks.onBegin?.({ numberOfPointers: 1, x: 0, y: 0 }))
      click()
      expect(onPress).toHaveBeenCalledTimes(1)

      pan(100, 150)
      click()
      act(() => lastPanCallbacks.onBegin?.({ numberOfPointers: 1, x: 0, y: 0 }))
      click()
      expect(onPress).toHaveBeenCalledTimes(2)
    })

    // react-native-web can lose the first layout of a view mounted through Expo Router, so the viewport is measured directly two frames after
    // mount (useOwnSize, whose own tests cover the rest).
    it('measures its viewport when the first layout never arrives', () => {
      const frames: FrameRequestCallback[] = []
      const raf = jest.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => frames.push(callback))
      mount()
      const viewport = screen.getByTestId('zoom')
      Object.defineProperty(viewport, 'offsetWidth', { configurable: true, value: 300 })
      Object.defineProperty(viewport, 'offsetHeight', { configurable: true, value: 200 })
      expect(lastPinchConfig.enabled).toBe(false)
      act(() => {
        while (frames.length) frames.shift()?.(0)
      })
      raf.mockRestore()
      expect(lastPinchConfig.enabled).toBe(true)
      expect(lastPanConfig.enabled).toBe(true)
      pinch(2, 150, 100)
      pan(100, 1000)
      expect(translateX()).toBe(150) // (600 - 300) / 2
    })
  })
})
