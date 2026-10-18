# @rific/gestures

Shared gestures for React Native apps, so every swipe in the fleet feels the same.

## SwipeToDismiss

Content the player swipes away: a toast, a list row, a player's seat. It follows the finger, fades toward 40% as it nears the distance that dismisses it, springs back when let go short, and otherwise flies off the screen and calls `onDismiss`.

- Sideways in either direction, past 30% of its own width
- A quick flick is enough on its own: at least 500pt/s, moving the way it was swiped, after at least 12pt
- With `edge`, also off that edge (`'top'` or `'bottom'`), past half its height, while a drag the other way only gives a little
- Without `edge`, sideways only: a drag that goes up or down first is left to the scroll view around it, so it works for swipe-to-delete rows in a list
- Measured in its own coordinates, so it works inside a turned frame (an app that fakes landscape by rotating a View)
- `restore()` brings it back when the app declines the dismissal (a confirm cancelled)

```tsx
import { SwipeToDismiss, type SwipeToDismissHandle } from '@rific/gestures'

// A row in a ScrollView or FlatList: swiped away sideways, scrolling untouched.
<SwipeToDismiss onDismiss={() => remove(item.id)}>
  <Row item={item} />
</SwipeToDismiss>

// A banner at the bottom of the screen: also pushed down off it.
<SwipeToDismiss edge='bottom' onDismiss={hide}>
  <Banner />
</SwipeToDismiss>

// Asking first: the row flies off, and comes back if the player cancels.
const swipe = useRef<SwipeToDismissHandle>(null)
<SwipeToDismiss ref={swipe} onDismiss={() => setConfirming(true)}>
  <Row item={item} />
</SwipeToDismiss>
// ...on Cancel:
swipe.current?.restore()
```

| Prop | Type | |
|---|---|---|
| `onDismiss` | `() => void` | Called once the content has flown off. The swipe is only there while this is: leave it out to turn the swipe off. |
| `edge` | `'top' \| 'bottom'` | Also dismisses toward this edge. Without it the swipe is sideways only. |
| `ref` | `Ref<SwipeToDismissHandle>` | `restore()`: springs dismissed content back and lets it be swiped again. |
| `style` | `StyleProp<ViewStyle>` | The stationary wrapper's style. It never moves; only the content inside follows the finger. |
| `testID` | `string` | On the stationary wrapper. |

The content stays mounted after `onDismiss` until the app removes it (usually at once, with a layout animation closing the gap). Until then, or until `restore()`, a touch on the empty spot does nothing.

A swipe can't be reached by a screen reader, so keep another way to do the same thing (a delete button, an accessibility action).

The thresholds are exported (`SWIPE_DISMISS_FRACTION`, `SWIPE_FLING_VELOCITY`, ...) for anything that wants to match them.

## Installation

```sh
npm install @rific/gestures @rific/core react-native-gesture-handler react-native-reanimated react-native-worklets
```

Requires `react-native-reanimated` 4 or newer (with `react-native-worklets`) and `react-native-gesture-handler` 2 or 3, with `GestureHandlerRootView` at your app root. `@rific/core` (0.5.0+) lets the gesture call back into the component without pinning it in memory.

## License

MIT
