import React from 'react'

export const GestureHandlerRootView = ({ children }: { children?: React.ReactNode }) => children ?? null
// Test-only instrumentation: the props most recently handed to a GestureDetector.
export const lastDetectorProps: { gesture?: unknown; touchAction?: string } = {}
export const GestureDetector = ({ children, gesture, touchAction }: { children?: React.ReactNode; gesture?: unknown; touchAction?: string }) => {
  lastDetectorProps.gesture = gesture
  lastDetectorProps.touchAction = touchAction
  return children ?? null
}

type Callbacks = { onBegin?: (e: any) => void; onEnd?: (e: any) => void; onStart?: (e: any) => void; onUpdate?: (e: any) => void }

// Test-only instrumentation: counts how many times a new Pan gesture is constructed, so tests can assert gestures are memoized instead of
// rebuilt on every render.
export const panInstanceCount = { current: 0 }

// Test-only instrumentation: the most recently registered onBegin/onStart/onUpdate/onEnd worklets, so tests can simulate a swipe by invoking
// them directly.
export const lastPanCallbacks: Callbacks = {}

// Test-only instrumentation: the config chained onto the most recent Pan, so tests can assert how a gesture was set up.
export const lastPanConfig: { activeOffsetX?: number[]; enabled?: boolean; failOffsetY?: number[]; maxPointers?: number; minDistance?: number } = {}

// The same for the most recent Pinch.
export const lastPinchCallbacks: Callbacks = {}
export const lastPinchConfig: { enabled?: boolean } = {}

const makeHandler = (type: string, callbacks: Callbacks, config: Record<string, unknown>) => {
  const handler: Record<string, unknown> = { type }
  const setter = (key: string) => (value: unknown) => {
    config[key] = value
    return handler
  }
  const on = (key: keyof Callbacks) => (fn: (e: any) => void) => {
    callbacks[key] = fn
    return handler
  }
  Object.assign(handler, {
    activeOffsetX: setter('activeOffsetX'),
    enabled: setter('enabled'),
    failOffsetY: setter('failOffsetY'),
    maxPointers: setter('maxPointers'),
    minDistance: setter('minDistance'),
    onBegin: on('onBegin'),
    onEnd: on('onEnd'),
    onStart: on('onStart'),
    onUpdate: on('onUpdate')
  })
  return handler
}

// A fresh gesture starts with none of the previous one's config or callbacks.
const clear = (...records: object[]) => {
  for (const record of records) for (const key of Object.keys(record)) delete (record as Record<string, unknown>)[key]
}

export const Gesture = {
  Pan: () => {
    panInstanceCount.current++
    clear(lastPanConfig)
    return makeHandler('pan', lastPanCallbacks, lastPanConfig)
  },
  Pinch: () => {
    clear(lastPinchCallbacks, lastPinchConfig)
    return makeHandler('pinch', lastPinchCallbacks, lastPinchConfig)
  },
  Simultaneous: (...gestures: unknown[]) => ({ gestures, type: 'simultaneous' })
}
