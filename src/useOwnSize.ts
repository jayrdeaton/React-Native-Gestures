import { useCallback, useEffect, useRef, useState } from 'react'
import { type LayoutChangeEvent, Platform, type View } from 'react-native'

/** A view's own laid-out size. */
export type OwnSize = { height: number; width: number }

/**
 * A view's own size, for the stationary view a gesture is attached to: put `ref` and `onLayout` on it. `size` is null until a layout with a
 * width and a height above 0 arrives; a layout without one is ignored, and a later one replaces it.
 *
 * On the web, react-native-web's onLayout comes from a ResizeObserver, which only reports a change: if a view's first report were ever lost
 * (the fleet's Expo Router first-mount race, which @tastic/core's useSettledLayout and @rific/scroll-view's ScrollViewProvider guard against
 * too), the size would never arrive until something else resized the view, and the gesture would stay off. So on the web, two animation
 * frames after mount, if no size has arrived, the node is measured directly: `offsetWidth`/`offsetHeight`, its layout size (what
 * react-native-web's own onLayout reports), which an ancestor's transform doesn't change, so a view inside a turned frame is still measured in
 * its own coordinates (getBoundingClientRect would give the turned box). A layout that arrives first wins and cancels it.
 *
 * Insurance, not a fix for anything seen in a browser that draws (2026-10-19, see CLAUDE.md, "Its own size"): in headless Chrome every fresh
 * and in-app load of Expo-Starter's demo sized every view through onLayout alone, and with each element's first ResizeObserver report dropped
 * on purpose, this brought them back where 0.1.2 never did. A hidden preview pane that draws no frames delays onLayout and this alike, until
 * its first frame.
 */
export function useOwnSize() {
  const ref = useRef<View>(null)
  const [size, setSize] = useState<OwnSize | null>(null)

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const { height, width } = e.nativeEvent.layout
    if (width > 0 && height > 0) setSize((prev) => (prev && prev.width === width && prev.height === height ? prev : { height, width }))
  }, [])

  const measured = size !== null
  useEffect(() => {
    if (Platform.OS !== 'web' || measured) return
    let second = 0
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => {
        const node = ref.current as unknown as HTMLElement | null
        const width = node?.offsetWidth ?? 0
        const height = node?.offsetHeight ?? 0
        if (width > 0 && height > 0) setSize((prev) => prev ?? { height, width })
      })
    })
    return () => {
      cancelAnimationFrame(first)
      cancelAnimationFrame(second)
    }
  }, [measured])

  return { onLayout, ref, size }
}
