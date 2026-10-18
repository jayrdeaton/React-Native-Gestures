import React from 'react'

export const GestureHandlerRootView = ({ children }: { children?: React.ReactNode }) => children ?? null
// Test-only instrumentation: the props (other than the gesture) most recently handed to a GestureDetector.
export const lastDetectorProps: { touchAction?: string } = {}
export const GestureDetector = ({ children, touchAction }: { children?: React.ReactNode; touchAction?: string }) => {
  lastDetectorProps.touchAction = touchAction
  return children ?? null
}

// Test-only instrumentation: counts how many times a new Pan gesture is constructed, so tests can assert gestures are memoized instead of
// rebuilt on every render.
export const panInstanceCount = { current: 0 }

// Test-only instrumentation: the most recently registered onBegin/onStart/onUpdate/onEnd worklets, so tests can simulate a swipe by invoking
// them directly.
export const lastPanCallbacks: { onBegin?: (e: any) => void; onEnd?: (e: any) => void; onStart?: (e: any) => void; onUpdate?: (e: any) => void } = {}

// Test-only instrumentation: the config chained onto the most recent Pan, so tests can assert how a gesture was set up.
export const lastPanConfig: { activeOffsetX?: number[]; enabled?: boolean; failOffsetY?: number[]; maxPointers?: number } = {}

const makePanHandler = () => {
  const handler = {
    activeOffsetX: (range: number[]) => {
      lastPanConfig.activeOffsetX = range
      return handler
    },
    enabled: (enabled: boolean) => {
      lastPanConfig.enabled = enabled
      return handler
    },
    failOffsetY: (range: number[]) => {
      lastPanConfig.failOffsetY = range
      return handler
    },
    maxPointers: (n: number) => {
      lastPanConfig.maxPointers = n
      return handler
    },
    onBegin: (fn: (e: any) => void) => {
      lastPanCallbacks.onBegin = fn
      return handler
    },
    onEnd: (fn: (e: any) => void) => {
      lastPanCallbacks.onEnd = fn
      return handler
    },
    onStart: (fn: (e: any) => void) => {
      lastPanCallbacks.onStart = fn
      return handler
    },
    onUpdate: (fn: (e: any) => void) => {
      lastPanCallbacks.onUpdate = fn
      return handler
    }
  }
  return handler
}

export const Gesture = {
  Pan: () => {
    panInstanceCount.current++
    // A fresh gesture starts with none of the previous one's config.
    for (const key of Object.keys(lastPanConfig)) delete lastPanConfig[key as keyof typeof lastPanConfig]
    return makePanHandler()
  }
}
