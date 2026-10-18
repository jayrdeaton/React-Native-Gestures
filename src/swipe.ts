// The swipe-to-dismiss rules, kept as tiny worklet functions so they are unit-testable without a gesture runtime. `distance` is how far
// the pointer has moved along one of the view's OWN axes since the pan activated (see SwipeToDismiss.tsx's buildSwipeGesture for how that is
// measured), `length` is the view's own laid-out size along that axis, and `velocity` is the pointer's speed along it, in points per second
// (sampled from those same local positions, see sampleVelocity). Moved verbatim from @rific/toaster's swipe.ts (0.9.0), whose toasts were
// the first to be swiped away, so every swipe in the fleet feels the same.

/** A sideways swipe past this fraction of the view's width dismisses it. */
export const SWIPE_DISMISS_FRACTION = 0.3
/** A swipe toward the view's edge (up for `edge='top'`, down for `'bottom'`) past this fraction of its height dismisses it. */
export const SWIPE_EDGE_DISMISS_FRACTION = 0.5
/** A flick at least this fast (points per second, moving the way it was swiped) dismisses the view however short it was... */
export const SWIPE_FLING_VELOCITY = 500
/** ...once it has moved this far, so the jitter of a tap can never count as one. */
export const SWIPE_FLING_MIN_DISTANCE = 12
/** How much of each new sample's speed the running velocity takes (an exponential moving average), so one uneven step can't make or break a flick. */
export const SWIPE_VELOCITY_SMOOTHING = 0.6
/** A pointer that hasn't moved for this long before it lifts was held still, not flicked. */
export const SWIPE_VELOCITY_STALE_MS = 80
/** A drag AWAY from the view's edge moves it this fraction of the way, so it gives a little but never leaves. */
export const SWIPE_EDGE_RESISTANCE = 0.2
/** A dismissed view flies out to this multiple of the clearance length, in the direction it was swiped. */
export const SWIPE_EXIT_FACTOR = 1.5

// `fraction`'s default is applied in the body, never the parameter list: a worklet reads module constants from its closure inside its body, so
// a default parameter naming one runs before they exist and throws on the UI thread. That crashed every release build of @rific/toaster
// 0.8.0-0.8.2 on a sideways swipe (the one call that leaves `fraction` out). See worklets.test.ts.
export function swipeShouldDismiss(distance: number, length: number, velocity = 0, fraction?: number): boolean {
  'worklet'
  if (Math.abs(distance) > length * (fraction ?? SWIPE_DISMISS_FRACTION)) return true
  return Math.abs(distance) >= SWIPE_FLING_MIN_DISTANCE && Math.abs(velocity) >= SWIPE_FLING_VELOCITY && Math.sign(velocity) === Math.sign(distance)
}

/** The axis a pan is locked to, from how far the pointer had moved since touch-down when it activated: sideways unless it went mostly up or down. */
export function swipeIsVertical(dx: number, dy: number): boolean {
  'worklet'
  return Math.abs(dy) > Math.abs(dx)
}

/** Where a vertical drag puts the view: all the way toward its edge (`edge` is -1 for the top, 1 for the bottom), a little the other way. */
export function swipeEdgeDrag(distance: number, edge: number): number {
  'worklet'
  return distance * edge >= 0 ? distance : distance * SWIPE_EDGE_RESISTANCE
}

/** The running velocity after a pointer moved `delta` points in `elapsedMs`. A sample with no elapsed time changes nothing (the caller carries its
 * movement into the next one). */
export function sampleVelocity(previous: number, delta: number, elapsedMs: number): number {
  'worklet'
  if (elapsedMs <= 0) return previous
  return previous + ((delta / elapsedMs) * 1000 - previous) * SWIPE_VELOCITY_SMOOTHING
}

/** The velocity a release counts with: none if the pointer stopped before it lifted. */
export function releaseVelocity(velocity: number, msSinceLastMove: number): number {
  'worklet'
  return msSinceLastMove > SWIPE_VELOCITY_STALE_MS ? 0 : velocity
}

/** `clearance` is the length that must be cleared to leave the screen: the view's own width, or the larger window dimension when the view is
 * narrower than the screen or the frame is turned. */
export function swipeExitTarget(distance: number, clearance: number): number {
  'worklet'
  return distance > 0 ? clearance * SWIPE_EXIT_FACTOR : -clearance * SWIPE_EXIT_FACTOR
}
