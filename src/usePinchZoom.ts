import { useCallback, useEffect, useMemo } from 'react'
import { Gesture } from 'react-native-gesture-handler'
import { type SharedValue, useSharedValue, withTiming } from 'react-native-reanimated'

import { ZOOM_MAX_SCALE, ZOOM_MIN_SCALE, ZOOM_PAN_MIN_DISTANCE, ZOOM_RESET_MS, zoomAboutFocal, zoomClampOffset, zoomClampScale, zoomPinchScale } from './zoom'

export type PinchZoomOptions = {
  /** The viewport's own width: the stationary view the gesture is attached to. Nothing zooms until it and `height` are above 0. */
  width: number
  /** The viewport's own height. */
  height: number
  /** The content's laid-out width, centered in the viewport. Leave it out for content that fills the viewport. */
  contentWidth?: number
  /** The content's laid-out height, centered in the viewport. Leave it out for content that fills the viewport. */
  contentHeight?: number
  /** The smallest scale, 1 (the content's own size) unless given. Below 1 the content can shrink inside the viewport, centered. */
  minScale?: number
  /** The largest scale, 5 unless given. */
  maxScale?: number
}

export type PinchZoom = {
  /** Pinch and pan together: attach it to the stationary viewport (a GestureDetector around a view that never moves), never to the content. */
  gesture: ReturnType<typeof Gesture.Simultaneous>
  /** The content's scale, about its own center. */
  scale: SharedValue<number>
  /** How far the content's center is from the viewport's, sideways. */
  translateX: SharedValue<number>
  /** How far the content's center is from the viewport's, up or down. */
  translateY: SharedValue<number>
  /** Eases the content back to its own size (or the nearest bound to it), centered. */
  reset: () => void
}

type ZoomBounds = { contentHeight: number; contentWidth: number; height: number; maxScale: number; minScale: number; width: number }

// The gesture is measured in the viewport's OWN coordinates, never the window's: the pinch's `focalX/Y` and the pan's `x`/`y` are relative to
// the view the gesture is attached to, through every ancestor transform, so a zoom inside a turned frame (an app that fakes landscape by
// rotating a View) moves along the content's own axes. The pan's `translationX/Y` are window-space and never read. That only works while the
// view the gesture is attached to doesn't move, so the gesture goes on the stationary viewport and only the content inside it is transformed.
//
// Every step is applied to the current transform as it comes, from the change since the gesture's last event, rather than from where the
// gesture started, so the pinch and the pan can run together, each adding its own movement, and turning a pinch around at a bound zooms back at
// once. The pinch moves the content with its focal point (the point between the fingers) and scales it about that point, so what's under the
// fingers stays under them; the pan moves it with a single finger, and with two that aren't pinching (a pinch only activates once their
// distance changes). While a pinch is active the pan stands aside, so the two fingers' movement counts once. After every step the scale is held
// between the bounds and the offset where the content still covers the viewport (centered while it's smaller).
//
// Details that matter: (1) each gesture is anchored where it ACTIVATES (`onStart`), not at touch-down, so the content never jumps by the touch
// slop. (2) `x`/`y` and the focal point are the centroid of every finger down, so they step when a finger lands or lifts: an event with a
// different number of fingers than the last one only re-anchors. (3) The pan waits for ZOOM_PAN_MIN_DISTANCE, so a tap or a long press still
// reaches what's in the content. (4) A gesture that activated marks the touch (`swallowClick`) so the web's click that follows is never a press
// (see swallowClick.ts); only PinchZoomView, which hosts arbitrary content, uses it.
type ZoomState = {
  lastFocalX: SharedValue<number>
  lastFocalY: SharedValue<number>
  lastPanX: SharedValue<number>
  lastPanY: SharedValue<number>
  lastPinchScale: SharedValue<number>
  panPointers: SharedValue<number>
  pinching: SharedValue<boolean>
  pinchPointers: SharedValue<number>
  scale: SharedValue<number>
  swallowClick: SharedValue<boolean>
  translateX: SharedValue<number>
  translateY: SharedValue<number>
}

// The zoom's own state, all on the UI thread. Every shared value is stable for the hook's lifetime, so the object is too.
function useZoomState(): ZoomState {
  const lastFocalX = useSharedValue(0)
  const lastFocalY = useSharedValue(0)
  const lastPanX = useSharedValue(0)
  const lastPanY = useSharedValue(0)
  const lastPinchScale = useSharedValue(1)
  const panPointers = useSharedValue(0)
  const pinching = useSharedValue(false)
  const pinchPointers = useSharedValue(0)
  const scale = useSharedValue(1)
  const swallowClick = useSharedValue(false)
  const translateX = useSharedValue(0)
  const translateY = useSharedValue(0)
  return useMemo(() => ({ lastFocalX, lastFocalY, lastPanX, lastPanY, lastPinchScale, panPointers, pinching, pinchPointers, scale, swallowClick, translateX, translateY }), [lastFocalX, lastFocalY, lastPanX, lastPanY, lastPinchScale, panPointers, pinching, pinchPointers, scale, swallowClick, translateX, translateY])
}

function buildZoomGesture(zoom: ZoomState, enabled: boolean, bounds: ZoomBounds) {
  const { contentHeight, contentWidth, height, maxScale, minScale, width } = bounds
  const pinch = Gesture.Pinch()
    .enabled(enabled)
    .onStart((e) => {
      'worklet'
      zoom.pinching.value = true
      zoom.swallowClick.value = true
      zoom.lastPinchScale.value = e.scale
      zoom.lastFocalX.value = e.focalX
      zoom.lastFocalY.value = e.focalY
      zoom.pinchPointers.value = e.numberOfPointers
    })
    .onUpdate((e) => {
      'worklet'
      if (e.numberOfPointers === zoom.pinchPointers.value) {
        const scale = zoomPinchScale(zoom.scale.value, e.scale, zoom.lastPinchScale.value, minScale, maxScale)
        const factor = scale / zoom.scale.value
        // The content under the last focal point follows the fingers to this one, then scales about it.
        const x = zoomAboutFocal(zoom.translateX.value + e.focalX - zoom.lastFocalX.value, e.focalX, width, factor)
        const y = zoomAboutFocal(zoom.translateY.value + e.focalY - zoom.lastFocalY.value, e.focalY, height, factor)
        zoom.scale.value = scale
        zoom.translateX.value = zoomClampOffset(x, contentWidth, scale, width)
        zoom.translateY.value = zoomClampOffset(y, contentHeight, scale, height)
      }
      // A bad scale is skipped rather than anchored to, so the next good one is measured from the last good one.
      if (e.scale > 0 && Number.isFinite(e.scale)) zoom.lastPinchScale.value = e.scale
      zoom.lastFocalX.value = e.focalX
      zoom.lastFocalY.value = e.focalY
      zoom.pinchPointers.value = e.numberOfPointers
    })
    .onEnd(() => {
      'worklet'
      zoom.pinching.value = false
    })
  const pan = Gesture.Pan()
    .enabled(enabled)
    .minDistance(ZOOM_PAN_MIN_DISTANCE)
    .onBegin(() => {
      'worklet'
      zoom.swallowClick.value = false
    })
    .onStart((e) => {
      'worklet'
      zoom.swallowClick.value = true
      zoom.lastPanX.value = e.x
      zoom.lastPanY.value = e.y
      zoom.panPointers.value = e.numberOfPointers
    })
    .onUpdate((e) => {
      'worklet'
      if (!zoom.pinching.value && e.numberOfPointers === zoom.panPointers.value) {
        zoom.translateX.value = zoomClampOffset(zoom.translateX.value + e.x - zoom.lastPanX.value, contentWidth, zoom.scale.value, width)
        zoom.translateY.value = zoomClampOffset(zoom.translateY.value + e.y - zoom.lastPanY.value, contentHeight, zoom.scale.value, height)
      }
      zoom.lastPanX.value = e.x
      zoom.lastPanY.value = e.y
      zoom.panPointers.value = e.numberOfPointers
    })
  return Gesture.Simultaneous(pinch, pan)
}

// The hook behind PinchZoomView, which also needs the web's click flag.
export function usePinchZoomState({ contentHeight, contentWidth, height, maxScale = ZOOM_MAX_SCALE, minScale = ZOOM_MIN_SCALE, width }: PinchZoomOptions): { swallowClick: SharedValue<boolean>; zoom: PinchZoom } {
  const state = useZoomState()
  const { scale, swallowClick, translateX, translateY } = state
  const enabled = width > 0 && height > 0
  const resolvedContentWidth = contentWidth ?? width
  const resolvedContentHeight = contentHeight ?? height

  // The state is stable, so the gesture is only rebuilt when the sizes or bounds change, never as it updates.
  const gesture = useMemo(() => buildZoomGesture(state, enabled, { contentHeight: resolvedContentHeight, contentWidth: resolvedContentWidth, height, maxScale, minScale, width }), [enabled, height, maxScale, minScale, resolvedContentHeight, resolvedContentWidth, state, width])

  // A new size or bound (a turned iPad, a bigger board) holds the transform inside the new bounds at once, rather than at the next touch.
  useEffect(() => {
    if (!enabled) return
    const nextScale = zoomClampScale(scale.get(), minScale, maxScale)
    scale.set(nextScale)
    translateX.set(zoomClampOffset(translateX.get(), resolvedContentWidth, nextScale, width))
    translateY.set(zoomClampOffset(translateY.get(), resolvedContentHeight, nextScale, height))
  }, [enabled, height, maxScale, minScale, resolvedContentHeight, resolvedContentWidth, scale, translateX, translateY, width])

  const reset = useCallback(() => {
    scale.set(withTiming(zoomClampScale(1, minScale, maxScale), { duration: ZOOM_RESET_MS }))
    translateX.set(withTiming(0, { duration: ZOOM_RESET_MS }))
    translateY.set(withTiming(0, { duration: ZOOM_RESET_MS }))
  }, [maxScale, minScale, scale, translateX, translateY])

  const zoom = useMemo(() => ({ gesture, reset, scale, translateX, translateY }), [gesture, reset, scale, translateX, translateY])
  return useMemo(() => ({ swallowClick, zoom }), [swallowClick, zoom])
}

/**
 * Pinch-to-zoom and pan for content centered in a stationary viewport, as a gesture and the shared values it drives, for content that applies
 * the transform itself (a Skia canvas, or a view of your own). PinchZoomView is the same over a plain View.
 *
 * The pinch zooms about the point between the fingers and follows them as they move; one finger, or two that aren't pinching, pans. The scale
 * stays between `minScale` and `maxScale`, and the content never leaves the viewport uncovered (while it's smaller than the viewport, it stays
 * centered). Apply it as `transform: [{ translateX }, { translateY }, { scale }]` about the content's center, which must be the viewport's center
 * at rest: on a View centered in the viewport, or on a Skia Group with `origin` at the viewport's center.
 */
export function usePinchZoom(options: PinchZoomOptions): PinchZoom {
  return usePinchZoomState(options).zoom
}
