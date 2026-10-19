// The pinch-to-zoom rules, kept as tiny worklet functions so they are unit-testable without a gesture runtime. Each works along one axis of
// the viewport's OWN coordinates (see usePinchZoom.ts for how they are measured). The model: the content is laid out centered in a stationary
// viewport, then moved by `offset` and scaled by `scale` about its own center, which at rest is the viewport's center, so a content point `p`
// (measured from the content's center) shows at `viewportLength / 2 + offset + scale * p`. That is React Native's `transform: [{ translateX },
// { scale }]` on a view centered in the viewport, and Skia's on a Group with its `origin` at the viewport's center.
//
// No rule has a default parameter: a worklet reads module constants from its closure inside its body, so a default naming one runs before
// they exist and throws on the UI thread (see swipe.ts and worklets.test.ts).

/** The smallest scale a pinch goes to unless the app says otherwise: the content's own laid-out size. */
export const ZOOM_MIN_SCALE = 1
/** The largest scale a pinch goes to unless the app says otherwise. */
export const ZOOM_MAX_SCALE = 5
/** How far one finger has to move before it pans the content, so a tap or a long press still reaches what's under it. */
export const ZOOM_PAN_MIN_DISTANCE = 10
/** How long `reset()` takes to bring the content back to its own size, centered. */
export const ZOOM_RESET_MS = 250

/** The scale held between the bounds. */
export function zoomClampScale(scale: number, minScale: number, maxScale: number): number {
  'worklet'
  return Math.min(maxScale, Math.max(minScale, scale))
}

/** The new scale after a pinch's own scale went from `lastEventScale` to `eventScale`: the current scale times that change, held between the
 * bounds. Applied step by step, so turning a pinch around at a bound zooms back at once rather than first undoing the overshoot. A step with a
 * pinch scale that isn't a positive number (seen at a pinch's first events on some devices) changes nothing. */
export function zoomPinchScale(scale: number, eventScale: number, lastEventScale: number, minScale: number, maxScale: number): number {
  'worklet'
  if (!(eventScale > 0) || !(lastEventScale > 0) || !Number.isFinite(eventScale) || !Number.isFinite(lastEventScale)) return scale
  return zoomClampScale((scale * eventScale) / lastEventScale, minScale, maxScale)
}

/** Where the offset goes when the content scales by `factor` about `focal` (a point in the viewport, from its top or left edge), so the content
 * point under the focal point stays under it. */
export function zoomAboutFocal(offset: number, focal: number, viewportLength: number, factor: number): number {
  'worklet'
  return (focal - viewportLength / 2) * (1 - factor) + offset * factor
}

/** How far the content may move from the center either way at this scale: as far as keeps its edges at or past the viewport's, and not at all
 * while it is smaller than the viewport (it stays centered). */
export function zoomMaxOffset(contentLength: number, scale: number, viewportLength: number): number {
  'worklet'
  return Math.max(0, (contentLength * scale - viewportLength) / 2)
}

/** The offset held where the content still covers the viewport (or, smaller than it, centered). */
export function zoomClampOffset(offset: number, contentLength: number, scale: number, viewportLength: number): number {
  'worklet'
  const max = zoomMaxOffset(contentLength, scale, viewportLength)
  if (max === 0) return 0
  return Math.min(max, Math.max(-max, offset))
}
