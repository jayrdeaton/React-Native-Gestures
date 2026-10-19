import { act, render, screen } from '@testing-library/react'
import { Platform, View } from 'react-native'

import { lastOnLayout } from '../__mocks__/react-native'
import { useOwnSize } from '../useOwnSize'

// A view that puts the hook's ref and onLayout on itself and writes out the size it has.
function Probe() {
  const { onLayout, ref, size } = useOwnSize()
  return (
    <View ref={ref} testID='probe' onLayout={onLayout}>
      <span>{size ? `${size.width}x${size.height}` : 'none'}</span>
    </View>
  )
}

const shown = () => screen.getByTestId('probe').textContent
const layout = (width: number, height: number) => act(() => lastOnLayout.current?.({ nativeEvent: { layout: { height, width, x: 0, y: 0 } } }))

// The node's layout size as the browser has it (jsdom lays nothing out, so it's always 0 there).
const sizeNode = (width: number, height: number) => {
  const node = screen.getByTestId('probe')
  Object.defineProperty(node, 'offsetWidth', { configurable: true, value: width })
  Object.defineProperty(node, 'offsetHeight', { configurable: true, value: height })
}

// Animation frames run only when a test says so.
let frames: Map<number, FrameRequestCallback>
let nextFrameId: number
const frame = () =>
  act(() => {
    const due = [...frames.values()]
    frames.clear()
    for (const callback of due) callback(0)
  })

const os = Platform.OS
beforeEach(() => {
  lastOnLayout.current = undefined
  frames = new Map()
  nextFrameId = 1
  jest.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    frames.set(nextFrameId, callback)
    return nextFrameId++
  })
  jest.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => {
    if (id != null) frames.delete(id)
  })
})
afterEach(() => {
  Platform.OS = os
  jest.restoreAllMocks()
})

describe('useOwnSize', () => {
  it('takes its size from onLayout, ignoring a layout with no width or no height', () => {
    render(<Probe />)
    expect(shown()).toBe('none')
    layout(0, 50)
    layout(200, 0)
    expect(shown()).toBe('none')
    layout(200, 50)
    expect(shown()).toBe('200x50')
    layout(300, 60)
    expect(shown()).toBe('300x60')
  })

  it('never measures the node on native, so it waits for onLayout', () => {
    render(<Probe />)
    sizeNode(300, 60)
    frame()
    frame()
    expect(window.requestAnimationFrame).not.toHaveBeenCalled()
    expect(shown()).toBe('none')
  })

  describe('on the web', () => {
    beforeEach(() => {
      Platform.OS = 'web'
    })

    it('measures the node two frames after mount when no layout has arrived', () => {
      render(<Probe />)
      sizeNode(300, 60)
      frame()
      expect(shown()).toBe('none')
      frame()
      expect(shown()).toBe('300x60')
    })

    it('leaves a size that arrived by onLayout alone, and stops waiting for the frames', () => {
      render(<Probe />)
      sizeNode(999, 999)
      layout(200, 50)
      expect(frames.size).toBe(0)
      frame()
      frame()
      expect(shown()).toBe('200x50')
    })

    it('still takes a layout that arrives after the node was measured', () => {
      render(<Probe />)
      sizeNode(300, 60)
      frame()
      frame()
      layout(320, 64)
      expect(shown()).toBe('320x64')
    })

    it('stays without a size when the node has none either, until a layout arrives', () => {
      render(<Probe />)
      sizeNode(300, 0)
      frame()
      frame()
      expect(shown()).toBe('none')
      layout(300, 60)
      expect(shown()).toBe('300x60')
    })

    it('cancels its frames when unmounted first', () => {
      const { unmount } = render(<Probe />)
      frame()
      unmount()
      expect(frames.size).toBe(0)
    })
  })
})
