import { callWorkletCallback, useWorkletCallback } from '@rific/core'
import { type ReactNode, type Ref, useCallback, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { type LayoutChangeEvent, type StyleProp, useWindowDimensions, View, type ViewStyle } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, { Extrapolation, interpolate, type SharedValue, useAnimatedReaction, useAnimatedStyle, useDerivedValue, useSharedValue, withSpring, withTiming } from 'react-native-reanimated'
import { scheduleOnRN } from 'react-native-worklets'

import { useSwallowClick } from './swallowClick'
import { releaseVelocity, sampleVelocity, SWIPE_DISMISS_FRACTION, SWIPE_EDGE_DISMISS_FRACTION, swipeEdgeDrag, swipeExitTarget, swipeIsVertical, swipeShouldDismiss } from './swipe'

/** How far a sideways-only swipe has to move sideways before it takes the touch, and how far up or down before it gives the touch up to a
 * scroll view around it instead. */
export const SWIPE_ACTIVE_OFFSET = 10
/** How long a dismissed view takes to fly out. */
export const SWIPE_EXIT_MS = 180

/** What a `ref` to a SwipeToDismiss can do. */
export type SwipeToDismissHandle = {
  /** Springs dismissed content back into place and lets it be swiped again: for a dismissal the app then declined, e.g. a confirm cancelled. */
  restore: () => void
}

export type SwipeToDismissProps = {
  children?: ReactNode
  /** Also dismisses with a swipe toward this edge (the edge a toast stack sits on), past half the view's height, while a drag the other way
   * only gives a little. Without it the swipe is sideways only, and a drag that goes up or down first is left to a scroll view around it. */
  edge?: 'bottom' | 'top'
  /** Called once the content has flown off. The swipe is only there while this is: leave it out to turn the swipe off. */
  onDismiss?: () => void
  ref?: Ref<SwipeToDismissHandle>
  /** The stationary wrapper's style. The gesture is attached to it and it never moves; only the content inside it follows the finger. */
  style?: StyleProp<ViewStyle>
  testID?: string
}

// The swipe is measured in the view's OWN coordinate space, not the window's.
//
// A pan's `translationX/Y` are reported in WINDOW space, but `x`/`y` are relative to the view the handler is attached to, and UIKit/Android
// compute that through every ancestor transform. So a view rendered inside a turned frame (an app that fakes landscape by rotating a View
// while the OS stays portrait-locked, or any other transformed ancestor) is swiped along ITS OWN axes with no knowledge of the rotation:
// the distance is `x` (or `y`) now minus at activation. That only works if the view the gesture is attached to does not itself move while the
// finger drags (a view that follows the finger keeps `x` constant, which is why RNGH's docs recommend the absolute values in that case), so
// the detector wraps the STATIONARY wrapper below, and only the content inside it is translated.
//
// A swipe goes one of two ways, locked when the pan activates by how the pointer had moved since touch-down (`onBegin`): sideways, either
// direction, past SWIPE_DISMISS_FRACTION of the view's width; or, with an `edge`, toward it, past SWIPE_EDGE_DISMISS_FRACTION of its height,
// while a drag the other way only gives a little (swipeEdgeDrag). Either way a flick dismisses it too, however short (swipeShouldDismiss): its
// speed is sampled from the same local positions with the clock (`Date.now()`, which the UI runtime has), because the gesture's own
// `velocityX/Y` are window-space. Without an `edge` the pan only activates sideways and fails once the pointer goes up or down first, so a
// scroll view the view sits in keeps its scrolling; on the web that takes the wrapper's `touch-action: pan-y` too (gesture-handler's default
// is `none`, which would stop a phone's browser scrolling a page when a drag starts on the view).
//
// Details that matter: (1) the anchor is captured when the pan ACTIVATES (`onStart`), not at touch-down: Android and web re-base their own
// translation at activation, so anchoring there makes the content track the finger from 0 on every platform instead of jumping by the touch
// slop (~8dp) on the first update. (2) `maxPointers(1)`: `x` is the centroid of every finger on the view, so a second finger landing or lifting
// would step it discontinuously and could dismiss the view by accident. (3) Once the content is flying out it is gone until `restore()`: a
// touch on the empty wrapper meanwhile does nothing (`gone`), rather than dragging the content back in from off-screen. (4) A swipe is never
// also a press of what's under it. On native, gesture-handler cancels React Native's own touch handling once the pan activates; the web has
// no such step, and the browser's `click` at pointer-up is what react-native-web presses on, so a pan that activated marks the touch
// (`swallowClick`) and the wrapper eats the click that follows (see SwipeToDismiss). Found in Hangman's web preview (2026-10-18): a seat
// flicked away was pressed on its way out, which focused it first.
// `clearance` is how far the exit target must reach to leave the screen whatever the view's size (see swipeExitTarget).
type SwipeState = {
  beginX: SharedValue<number>
  beginY: SharedValue<number>
  dismissed: SharedValue<boolean>
  gone: SharedValue<boolean>
  lastDistance: SharedValue<number>
  lastMoveAt: SharedValue<number>
  startX: SharedValue<number>
  startY: SharedValue<number>
  swallowClick: SharedValue<boolean>
  tracking: SharedValue<boolean>
  translateX: SharedValue<number>
  translateY: SharedValue<number>
  velocity: SharedValue<number>
  vertical: SharedValue<boolean>
}

// The pan's own state, all on the UI thread. Every shared value is stable for the view's lifetime, so the object is too.
function useSwipeState(): SwipeState {
  const beginX = useSharedValue(0)
  const beginY = useSharedValue(0)
  const dismissed = useSharedValue(false)
  const gone = useSharedValue(false)
  const lastDistance = useSharedValue(0)
  const lastMoveAt = useSharedValue(0)
  const startX = useSharedValue(0)
  const startY = useSharedValue(0)
  const swallowClick = useSharedValue(false)
  const tracking = useSharedValue(false)
  const translateX = useSharedValue(0)
  const translateY = useSharedValue(0)
  const velocity = useSharedValue(0)
  const vertical = useSharedValue(false)
  return useMemo(() => ({ beginX, beginY, dismissed, gone, lastDistance, lastMoveAt, startX, startY, swallowClick, tracking, translateX, translateY, velocity, vertical }), [beginX, beginY, dismissed, gone, lastDistance, lastMoveAt, startX, startY, swallowClick, tracking, translateX, translateY, velocity, vertical])
}

// `edge` is which way is "off the edge" along the view's own y axis: -1 for the top, 1 for the bottom, 0 for a sideways-only swipe.
function buildSwipeGesture(swipe: SwipeState, enabled: boolean, width: number, height: number, edge: number, clearance: number) {
  const pan = Gesture.Pan().enabled(enabled).maxPointers(1)
  const axes = edge === 0 ? pan.activeOffsetX([-SWIPE_ACTIVE_OFFSET, SWIPE_ACTIVE_OFFSET]).failOffsetY([-SWIPE_ACTIVE_OFFSET, SWIPE_ACTIVE_OFFSET]) : pan
  return axes
    .onBegin((e) => {
      'worklet'
      swipe.beginX.value = e.x
      swipe.beginY.value = e.y
      swipe.swallowClick.value = false
    })
    .onStart((e) => {
      'worklet'
      swipe.swallowClick.value = true
      swipe.tracking.value = !swipe.gone.value
      if (!swipe.tracking.value) return
      swipe.vertical.value = edge !== 0 && swipeIsVertical(e.x - swipe.beginX.value, e.y - swipe.beginY.value)
      swipe.startX.value = e.x
      swipe.startY.value = e.y
      swipe.lastDistance.value = 0
      swipe.lastMoveAt.value = Date.now()
      swipe.velocity.value = 0
    })
    .onUpdate((e) => {
      'worklet'
      if (!swipe.tracking.value) return
      const distance = swipe.vertical.value ? e.y - swipe.startY.value : e.x - swipe.startX.value
      const now = Date.now()
      const elapsed = now - swipe.lastMoveAt.value
      if (elapsed > 0) {
        swipe.velocity.value = sampleVelocity(swipe.velocity.value, distance - swipe.lastDistance.value, elapsed)
        swipe.lastDistance.value = distance
        swipe.lastMoveAt.value = now
      }
      if (swipe.vertical.value) swipe.translateY.value = swipeEdgeDrag(distance, edge)
      else swipe.translateX.value = distance
    })
    .onEnd((e) => {
      'worklet'
      if (!swipe.tracking.value) return
      swipe.tracking.value = false
      const velocity = releaseVelocity(swipe.velocity.value, Date.now() - swipe.lastMoveAt.value)
      const done = (finished?: boolean) => {
        'worklet'
        if (finished && swipe.gone.value) swipe.dismissed.value = true
      }
      if (swipe.vertical.value) {
        // Measured toward the edge, so the dismiss rule only ever fires that way.
        const toward = (e.y - swipe.startY.value) * edge
        if (toward > 0 && swipeShouldDismiss(toward, height, velocity * edge, SWIPE_EDGE_DISMISS_FRACTION)) {
          swipe.gone.value = true
          swipe.translateY.value = withTiming(swipeExitTarget(edge, clearance), { duration: SWIPE_EXIT_MS }, done)
        } else swipe.translateY.value = withSpring(0)
      } else {
        const distance = e.x - swipe.startX.value
        if (swipeShouldDismiss(distance, width, velocity)) {
          swipe.gone.value = true
          swipe.translateX.value = withTiming(swipeExitTarget(distance, clearance), { duration: SWIPE_EXIT_MS }, done)
        } else swipe.translateX.value = withSpring(0)
      }
    })
}

/**
 * Content the player swipes away: sideways in either direction past 30% of its width, or a quick flick, and with an `edge` also off that
 * edge. It follows the finger, fades toward 40% as it nears the distance that dismisses it, springs back when let go short, and otherwise flies
 * off the screen and calls `onDismiss`. Works inside a scroll view (a sideways-only swipe leaves up and down to it) and inside a turned frame
 * (it measures in its own coordinates). A swipe can't be reached by a screen reader, so keep another way to do the same thing.
 */
export function SwipeToDismiss({ children, edge, onDismiss, ref, style, testID }: SwipeToDismissProps) {
  const swipe = useSwipeState()
  const { dismissed, gone, swallowClick, translateX, translateY } = swipe
  // The view's own size: the reference for the dismiss distances and the exit target. The swipe waits for the first layout.
  const [size, setSize] = useState<{ height: number; width: number } | null>(null)
  const width = size?.width ?? 0
  const height = size?.height ?? 0
  const edgeSign = edge === 'top' ? -1 : edge === 'bottom' ? 1 : 0
  // The exit target must clear the screen even when the view is narrower than it or the frame is turned (window width and height swap), so it
  // is measured against the larger of the view's own width and either window dimension.
  const { height: windowHeight, width: windowWidth } = useWindowDimensions()
  const clearance = Math.max(width, windowWidth, windowHeight)
  const enabled = onDismiss !== undefined && size !== null

  const handleLayout = useCallback((e: LayoutChangeEvent) => {
    const { height: laidOutHeight, width: laidOutWidth } = e.nativeEvent.layout
    if (laidOutWidth > 0) setSize((prev) => (prev && prev.width === laidOutWidth && prev.height === laidOutHeight ? prev : { height: laidOutHeight, width: laidOutWidth }))
  }, [])

  // The completion of the fly-out is signalled through a shared value and acted on here, so scheduleOnRN is called from a worklet declared in
  // the component body rather than one made inside another callback. The reaction is held by this component, so it must not hand
  // react-native-worklets one of the component's own callbacks (the native side keeps it as a GC root for as long as the worklet lives): it
  // calls @rific/core's module-level callWorkletCallback by key.
  const handleDismiss = useCallback(() => onDismiss?.(), [onDismiss])
  const dismissKey = useWorkletCallback(handleDismiss)
  useAnimatedReaction(
    () => dismissed.value,
    (isDismissed, wasDismissed) => {
      if (isDismissed && !wasDismissed) scheduleOnRN(callWorkletCallback, dismissKey)
    }
  )

  useImperativeHandle(
    ref,
    () => ({
      restore: () => {
        gone.set(false)
        dismissed.set(false)
        translateX.set(withSpring(0))
        translateY.set(withSpring(0))
      }
    }),
    [dismissed, gone, translateX, translateY]
  )

  // On the web, the click that follows a swipe (pointer-up) is caught on its way down to the content and stopped (see swallowClick.ts).
  const wrapperRef = useRef<View>(null)
  useSwallowClick(wrapperRef, swallowClick)

  // The swipe's state is stable, so the gesture is only rebuilt when the view's size, edge, clearance or whether it's on changes, never as a
  // swipe updates.
  const gesture = useMemo(() => buildSwipeGesture(swipe, enabled, width, height, edgeSign, clearance), [clearance, edgeSign, enabled, height, swipe, width])

  // Fades to 0.4 as the drag nears the distance that dismisses it, whichever way it goes.
  const opacity = useDerivedValue(() => {
    if (width <= 0 || height <= 0) return 1
    const progress = Math.max(Math.abs(translateX.value) / (width * SWIPE_DISMISS_FRACTION), edgeSign === 0 ? 0 : Math.max(0, translateY.value * edgeSign) / (height * SWIPE_EDGE_DISMISS_FRACTION))
    return interpolate(progress, [0, 1], [1, 0.4], Extrapolation.CLAMP)
  })

  const swipeStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateX: translateX.value }, { translateY: translateY.value }]
  }))

  return (
    <GestureDetector gesture={gesture} touchAction={edgeSign === 0 ? 'pan-y' : 'none'}>
      <View ref={wrapperRef} testID={testID} onLayout={handleLayout} style={style}>
        <Animated.View style={swipeStyle}>{children}</Animated.View>
      </View>
    </GestureDetector>
  )
}
