# @rific/gestures

Shared gestures for React Native apps, so every swipe and pinch in the fleet feels the same.

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

## Pinch to zoom

Content the player pinches to zoom and drags to pan: a photo, a climbing wall, a game board.

- The pinch zooms about the point between the fingers, and the content follows them as they move, so what's under the fingers stays under them
- One finger pans, and so do two that aren't pinching; the pan waits for a 10pt drag, so a tap or a long press still reaches the content
- The scale stays between `minScale` (1 unless given) and `maxScale` (5 unless given), and turning a pinch around at a bound zooms back at once
- The content never leaves the view uncovered: it pans only as far as its own edges, and stays centered while it's smaller than the view
- Measured in the view's own coordinates, so it works inside a turned frame
- On the web, the click that follows a pan or a pinch never presses what's under the finger
- `reset()` eases it back to its own size, centered

### PinchZoomView

The plain-View case. The view itself never moves: its content is laid out centered in it and only the content is transformed. Give it a size (`flex: 1`, or a width and height). It clips the zoomed content (`overflow: 'hidden'`) unless its `style` says otherwise.

```tsx
import { PinchZoomView, type PinchZoomHandle } from '@rific/gestures'

// A photo that fills the view.
<PinchZoomView style={{ flex: 1 }}>
  <Image source={{ uri }} style={{ height: '100%', width: '100%' }} resizeMode='contain' />
</PinchZoomView>

// An image fitted inside the view, or a board: give its size, so the pan stops at its own edges rather than the view's.
<PinchZoomView style={{ flex: 1 }} contentWidth={boardWidth} contentHeight={boardHeight} minScale={0.5} maxScale={3}>
  <Board style={{ height: boardHeight, width: boardWidth }} />
</PinchZoomView>

// Back to the start, e.g. for a new game.
const zoom = useRef<PinchZoomHandle>(null)
zoom.current?.reset()
```

| Prop | Type | |
|---|---|---|
| `contentWidth`, `contentHeight` | `number` | The content's laid-out size. Leave them out for content that fills the view. |
| `minScale` | `number` | The smallest scale, 1 unless given. Below 1 the content can shrink inside the view, centered. |
| `maxScale` | `number` | The largest scale, 5 unless given. |
| `ref` | `Ref<PinchZoomHandle>` | `reset()`: eases the content back to its own size (or the nearest bound to it), centered. |
| `style` | `StyleProp<ViewStyle>` | The stationary view's style. |
| `testID` | `string` | On the stationary view. |

Pressables inside the content keep working: a pan or a pinch cancels the press it started on (on the web too).

### usePinchZoom

The same as a gesture and the shared values it drives, for content that applies the transform itself: a Skia canvas, or a view of your own.

```tsx
import { usePinchZoom } from '@rific/gestures'

const zoom = usePinchZoom({ width, height, contentWidth: boardWidth, contentHeight: boardHeight, maxScale: 3 })
const transform = useDerivedValue(() => [{ translateX: zoom.translateX.value }, { translateY: zoom.translateY.value }, { scale: zoom.scale.value }])

<GestureDetector gesture={zoom.gesture}>
  <Canvas style={{ height, width }}>
    <Group origin={vec(width / 2, height / 2)} transform={transform}>
      <Board x={(width - boardWidth) / 2} y={(height - boardHeight) / 2} />
    </Group>
  </Canvas>
</GestureDetector>
```

| Option | Type | |
|---|---|---|
| `width`, `height` | `number` | The viewport's own size: the stationary view the gesture is attached to. Nothing zooms until both are above 0. |
| `contentWidth`, `contentHeight` | `number` | The content's laid-out size, centered in the viewport. Leave them out for content that fills it. |
| `minScale`, `maxScale` | `number` | As PinchZoomView's. |

It returns `gesture` (the pinch and the pan together), the `scale`, `translateX` and `translateY` shared values, and `reset()`. Two rules:

- **Attach the gesture to a view that never moves** (the canvas, or a wrapper), never to the content being transformed: the gesture is measured in that view's own coordinates.
- **Apply the transform about the viewport's center**, in that order: `transform: [{ translateX }, { translateY }, { scale }]` on a view centered in the viewport (React Native transforms about a view's center), or on a Skia `Group` with `origin` at the viewport's center and the content drawn centered.

The bounds are exported (`ZOOM_MIN_SCALE`, `ZOOM_MAX_SCALE`), with `ZOOM_PAN_MIN_DISTANCE` and `ZOOM_RESET_MS`, for anything that wants to match them.

A pinch can't be reached by a screen reader, so anything only visible zoomed in needs another way to it.

## Installation

```sh
npm install @rific/gestures @rific/core react-native-gesture-handler react-native-reanimated react-native-worklets
```

Requires `react-native-reanimated` 4 or newer (with `react-native-worklets`) and `react-native-gesture-handler` 2 or 3, with `GestureHandlerRootView` at your app root. `@rific/core` (0.5.0+) lets SwipeToDismiss's gesture call back into the component without pinning it in memory.

## License

MIT
