# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# @rific/gestures

Standalone npm package (the `rific` npm org): shared gestures for React Native apps, so every swipe in the fleet feels the same. Started 2026-10-18 with `SwipeToDismiss`, lifted out of `@rific/toaster` (`../React-Native-Toaster`, 0.9.0) for Hangman's Pass & Play seats, with list rows the next obvious use.

**What belongs here** (Jay, 2026-10-18: "swipes and flicks and double taps and long presses"): a gesture earns a place once it carries real logic every app would otherwise rebuild, not as a thin wrapper over a gesture-handler one-liner. `Gesture.Tap().numberOfTaps(2)`, `Gesture.LongPress()` and `Gesture.Fling()` are one line each, so they come in only with something of their own (gated haptics, a leak-safe callback, a fleet-wide feel). Pinch-to-zoom does qualify: Utility's `PinchableImage`, Setter's wall screen and `HoldEditor` and Minesweeper's board each hand-roll pinch plus pan, so it's the likely next addition, as a hook handing back the gesture and its scale/offset shared values (a Skia board needs those, not a View) with a thin view over it. `@tastic/input` is the games' layer of pure input math (swipe direction, aim, throw); layering runs @tastic on @rific, never the reverse, so math both want moves down into here.

## Commands

```bash
npm run lint      # ESLint + Prettier check
npm run fix       # Auto-fix lint/format issues
npm run typecheck # TypeScript type check (tsc --noEmit)
npm test          # Run all Jest tests
npm run build     # Compile to dist/
npm run verify    # lint + test + typecheck + build, in that order
```

Always run `npm run lint` before finishing any task.

## Publishing

```bash
npm version patch   # or minor / major - bumps version and creates git tag
git push --follow-tags  # triggers the publish GitHub Action
```

The publish workflow fires on `v*` tags and runs `npm publish` with provenance (npm trusted publishing). A brand-new package has to exist on npm before trusted publishing can be set up for it, so its first version is published by hand.

## Architecture

| File | Purpose |
|---|---|
| `SwipeToDismiss.tsx` | The component: a stationary wrapper (the gesture's view, `onLayout` for its own size) around an `Animated.View` that follows the finger. `buildSwipeGesture`, the pan's shared values (`useSwipeState`), the fly-out, the fade, `restore()`. |
| `swipe.ts` | The rules as tiny worklet functions, moved verbatim from the toaster: `swipeShouldDismiss` (past a fraction of the view's size, or a flick), `swipeIsVertical` (the axis lock), `swipeEdgeDrag` (resistance away from the edge), `sampleVelocity`/`releaseVelocity` (the flick speed), `swipeExitTarget` (1.5x the clearance, in the swipe's direction). Only the constants are public. |
| `index.ts` | Public exports: `SwipeToDismiss`, `SwipeToDismissHandle`, `SwipeToDismissProps`, `SWIPE_ACTIVE_OFFSET`, `SWIPE_EXIT_MS` and the `swipe.ts` constants. |

### SwipeToDismiss

Everything the toaster learned carries over (see its CLAUDE.md, "Swipe-to-dismiss"): measured in the view's OWN coordinates (`x`/`y` minus where the pan activated, never the window-space `translationX/Y`), so it works inside a turned frame; the gesture on the STATIONARY wrapper, only the content inside it translated; the anchor taken at activation (`onStart`), not touch-down; `maxPointers(1)`; the flick speed sampled from local positions against `Date.now()`; the fly-out's completion signalled through a shared value and a `useAnimatedReaction` calling `@rific/core`'s `callWorkletCallback` by key (never `scheduleOnRN` of a component callback, which pins the component in memory). What's new here:

- **`edge` is optional.** The toaster always had one (its stack's). Without one the pan is sideways only: `activeOffsetX` and `failOffsetY` at `SWIPE_ACTIVE_OFFSET` (10pt), so a drag that goes up or down first fails and the scroll view around it keeps scrolling (the way gesture-handler's own Swipeable rows work in a list). On the web the detector also gets `touchAction='pan-y'`: gesture-handler's default `touch-action: none` on the wrapper would stop a phone's browser scrolling the page when a drag starts on the view (seen on Hangman's seats in the web preview, 2026-10-18). With an `edge` it stays `none`.
- **The swipe is on only while `onDismiss` is passed** (and after the first layout, since the thresholds are fractions of the view's size): `Gesture.Pan().enabled(...)`.
- **`restore()`** (a `ref`), for a dismissal the app declines: springs the content back and re-arms the swipe. Hangman's seats use it when a remove confirm is cancelled. It uses the shared values' `.set()`, which the React Compiler's lint rules accept.
- **Gone until restored:** once the fly-out starts (`gone`), a new touch on the empty wrapper is ignored (`tracking` false for that pan), rather than dragging the content back in from off-screen. The toaster unmounts a toast at once, so it never needed this; a confirm leaves the content mounted.
- **Its own size from its own `onLayout`**, null until the first layout (no window-width guess).
- **A swipe is never also a press (web).** On native, gesture-handler cancels React Native's own touch handling once the pan activates. The web has no such step, and react-native-web presses on the browser's `click` at pointer-up, so a seat flicked away in Hangman's web preview was pressed (focused) on its way out. A pan that activates sets `swallowClick` (cleared at the next touch-down), and a capture-phase `click` listener on the wrapper's DOM node stops that click before it reaches react-native-web's root listener. A plain tap never activates the pan, so it presses as before.
- **`touchAction`** on the detector (web): `pan-y` without an `edge`, so a phone's browser still scrolls up and down when a drag starts on the view; `none` with one.

Checked in Hangman's web preview (2026-10-18, 375x667): a real mouse flick removes a seat with the focus left where it was, a slow short drag springs back, and taps still focus a seat and open its picker. Not yet on a device: Fabric's pan inside a ScrollView (the sideways-only offsets), and a phone browser's `pan-y` scrolling.

## Testing

- Jest (`@infinitetoken/jest-config/react-native`, jsdom) + `@testing-library/react`. Mocks in `src/__mocks__/`, mapped in `jest.config.cjs`: `react-native` (a View records its `onLayout` in `lastOnLayout` and renders a div with its testID), `react-native-gesture-handler` (records the Pan's callbacks in `lastPanCallbacks` and its config in `lastPanConfig`, counts them in `panInstanceCount`), `react-native-reanimated` (shared values that notify reactions on write, `withTiming` landing at once and reporting finished, `useAnimatedStyle` read live through a Proxy, the last one recorded in `lastAnimatedStyle`), `react-native-worklets`.
- `SwipeToDismiss.test.tsx` drives the pan's callbacks directly (a still clock for distance, a ticking one for flicks). The mock calls a disabled gesture's callbacks anyway, so a test of "no swipe" checks `lastPanConfig.enabled`, not a swipe.
- `swipe.test.ts` covers the rules; **`worklets.test.ts` runs them the way the UI thread does** (compiled with the Worklets Babel plugin, rebuilt from their code strings with only `this.__closure`). Never give a worklet a default parameter that names a module constant: it runs before the closure is unpacked and throws on the UI thread (the toaster's 0.8.0-0.8.2 release crash). A new rule in `swipe.ts` needs calls in that test's `CALLS`.
