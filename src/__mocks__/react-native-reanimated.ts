import React, { useEffect, useRef } from 'react'

const identity = (x: any) => x

// Test-only instrumentation: the style most recently handed to an Animated.View (the swiped content), so a test can read where it was moved to.
export const lastAnimatedStyle: { current?: any } = {}

const Animated = {
  View: ({ children, style }: { children?: React.ReactNode; style?: any }) => {
    lastAnimatedStyle.current = style
    return children ?? null
  }
}

export default Animated

// Test-only instrumentation: every useAnimatedReaction registers a runner here, and every shared-value write notifies all of them: a coarse
// stand-in for the real UI-thread frame loop that's good enough for these component tests.
const reactionRunners = new Set<() => void>()
const notifyReactions = () => reactionRunners.forEach((run) => run())

// Real reanimated shared values are stable across re-renders (ref-like): mirror that here so memoization deps that include a shared value
// behave correctly. Writing one (`.value =` or `.set()`) notifies useAnimatedReaction subscribers synchronously, the way a worklet mutating it
// on the UI thread drives reactions in the real library.
export const useSharedValue = (init: any) => {
  const ref = useRef<{ get: () => any; set: (next: any) => void; value: any } | null>(null)
  if (ref.current === null) {
    let current = init
    const set = (next: any) => {
      current = next
      notifyReactions()
    }
    ref.current = {
      get: () => current,
      set,
      get value() {
        return current
      },
      set value(next: any) {
        set(next)
      }
    }
  }
  return ref.current
}
// Read live, on every access: a shared value written by a gesture doesn't re-render anything, so a style computed at render would be stale.
export const useAnimatedStyle = (fn: () => any) => new Proxy({}, { get: (_target, key) => fn()[key] })
export const useDerivedValue = (fn: () => any) => ({ value: fn() })
export const useAnimatedReaction = (prepare: () => any, react: (curr: any, prev: any) => void) => {
  const stateRef = useRef<{ hasRun: boolean; prev: any }>({ hasRun: false, prev: undefined })

  useEffect(() => {
    const run = () => {
      const curr = prepare()
      if (!stateRef.current.hasRun || curr !== stateRef.current.prev) {
        react(curr, stateRef.current.hasRun ? stateRef.current.prev : undefined)
        stateRef.current = { hasRun: true, prev: curr }
      }
    }
    reactionRunners.add(run)
    run()
    return () => {
      reactionRunners.delete(run)
    }
  })
}
// A timing lands at once and reports that it finished.
export const withTiming = (toValue: any, _config?: any, callback?: any) => {
  callback?.(true)
  return toValue
}
export const withSpring = identity
export const interpolate = (_value: any, _input: any, output: any) => output[0]
export const Extrapolation = { CLAMP: 'clamp' }
