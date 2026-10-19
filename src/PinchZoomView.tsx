import { type ReactNode, type Ref, useCallback, useImperativeHandle, useRef, useState } from 'react'
import { type LayoutChangeEvent, type StyleProp, StyleSheet, View, type ViewStyle } from 'react-native'
import { GestureDetector } from 'react-native-gesture-handler'
import Animated, { useAnimatedStyle } from 'react-native-reanimated'

import { useSwallowClick } from './swallowClick'
import { usePinchZoomState } from './usePinchZoom'

/** What a `ref` to a PinchZoomView can do. */
export type PinchZoomHandle = {
  /** Eases the content back to its own size (or the nearest bound to it), centered: for a new image, a new game, a Fit button. */
  reset: () => void
}

export type PinchZoomViewProps = {
  children?: ReactNode
  /** The content's laid-out height. Leave it out for content that fills the view; give it for content smaller than the view (an image fitted
   * inside it, a board), so the pan stops at the content's own edges. */
  contentHeight?: number
  /** The content's laid-out width. See `contentHeight`. */
  contentWidth?: number
  /** The largest scale, 5 unless given. */
  maxScale?: number
  /** The smallest scale, 1 (the content's own size) unless given. Below 1 the content can shrink inside the view, centered. */
  minScale?: number
  ref?: Ref<PinchZoomHandle>
  /** The stationary viewport's style. Give it a size (`flex: 1`, or a width and height): its content is laid out inside it, centered. It clips
   * the zoomed content (`overflow: 'hidden'`) unless this says otherwise. */
  style?: StyleProp<ViewStyle>
  testID?: string
}

/**
 * Content the player pinches to zoom and drags to pan: a photo, a wall, a board. The pinch zooms about the point between the fingers and
 * follows them; one finger, or two that aren't pinching, pans once it has moved 10pt, so a tap or a long press still reaches the content. The
 * scale stays between `minScale` and `maxScale`, and the content never leaves the view uncovered (while it's smaller than the view, it stays
 * centered). The content is laid out centered in the view, which never moves; only the content is transformed. A pinch can't be reached by a
 * screen reader, so anything only visible zoomed in needs another way to it.
 */
export function PinchZoomView({ children, contentHeight, contentWidth, maxScale, minScale, ref, style, testID }: PinchZoomViewProps) {
  // The view's own size: the viewport the bounds are measured against. Nothing zooms until the first layout.
  const [size, setSize] = useState<{ height: number; width: number } | null>(null)
  const { swallowClick, zoom } = usePinchZoomState({ contentHeight, contentWidth, height: size?.height ?? 0, maxScale, minScale, width: size?.width ?? 0 })
  const { gesture, reset, scale, translateX, translateY } = zoom

  const handleLayout = useCallback((e: LayoutChangeEvent) => {
    const { height, width } = e.nativeEvent.layout
    if (width > 0 && height > 0) setSize((prev) => (prev && prev.width === width && prev.height === height ? prev : { height, width }))
  }, [])

  useImperativeHandle(ref, () => ({ reset }), [reset])

  // On the web, the click that follows a pan or a pinch is caught on its way down to the content and stopped (see swallowClick.ts).
  const viewportRef = useRef<View>(null)
  useSwallowClick(viewportRef, swallowClick)

  const zoomStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }, { translateY: translateY.value }, { scale: scale.value }]
  }))

  return (
    <GestureDetector gesture={gesture}>
      <View ref={viewportRef} testID={testID} onLayout={handleLayout} style={[styles.viewport, style]}>
        <Animated.View style={[styles.content, zoomStyle]}>{children}</Animated.View>
      </View>
    </GestureDetector>
  )
}

const styles = StyleSheet.create({
  // Fills the viewport, so its center (the transform's origin) is the viewport's, and centers the content in it.
  content: {
    alignItems: 'center',
    bottom: 0,
    justifyContent: 'center',
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0
  },
  viewport: {
    overflow: 'hidden'
  }
})
