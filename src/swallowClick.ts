import { type RefObject, useEffect } from 'react'
import { Platform, type View } from 'react-native'
import type { SharedValue } from 'react-native-reanimated'

/**
 * A drag is never also a press of what's under it (web). On native, gesture-handler cancels React Native's own touch handling once a pan
 * activates. The web has no such step, and react-native-web presses on the browser's `click` at pointer-up, so a gesture that activated sets
 * `swallowClick` (and clears it at the next touch-down), and this catches the click that follows on its way down from the stationary view to
 * the content, before it reaches react-native-web's press handling at the document's root. A plain tap never activates the gesture, so it
 * presses as usual. Found in Hangman's web preview (2026-10-18): a seat flicked away was pressed on its way out.
 */
export function useSwallowClick(ref: RefObject<View | null>, swallowClick: SharedValue<boolean>) {
  useEffect(() => {
    const node = ref.current as unknown as HTMLElement | null
    if (Platform.OS !== 'web' || !node?.addEventListener) return
    const swallow = (event: Event) => {
      if (!swallowClick.get()) return
      swallowClick.set(false)
      event.stopPropagation()
      event.preventDefault()
    }
    node.addEventListener('click', swallow, true)
    return () => node.removeEventListener('click', swallow, true)
  }, [ref, swallowClick])
}
