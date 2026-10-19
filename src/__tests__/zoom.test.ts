import { zoomAboutFocal, zoomClampOffset, zoomClampScale, zoomMaxOffset, zoomPinchScale } from '../zoom'

// Where a content point (measured from the content's center) shows in the viewport, by the model the rules share.
const shown = (point: number, offset: number, scale: number, viewportLength: number) => viewportLength / 2 + offset + scale * point

describe('zoomClampScale', () => {
  it('holds the scale between the bounds', () => {
    expect(zoomClampScale(2, 1, 5)).toBe(2)
    expect(zoomClampScale(0.5, 1, 5)).toBe(1)
    expect(zoomClampScale(9, 1, 5)).toBe(5)
    expect(zoomClampScale(0.5, 0.5, 3)).toBe(0.5)
  })
})

describe('zoomPinchScale', () => {
  it('multiplies the scale by how much the pinch changed since its last event', () => {
    expect(zoomPinchScale(1, 1.5, 1, 1, 5)).toBeCloseTo(1.5)
    expect(zoomPinchScale(2, 1.5, 1.25, 1, 5)).toBeCloseTo(2.4)
    expect(zoomPinchScale(2, 0.5, 1, 1, 5)).toBeCloseTo(1)
  })

  it('holds the result between the bounds', () => {
    expect(zoomPinchScale(4, 2, 1, 1, 5)).toBe(5)
    expect(zoomPinchScale(1.2, 0.5, 1, 1, 5)).toBe(1)
  })

  it('zooms back at once when a pinch turns around at a bound, with no overshoot to undo', () => {
    // Spread well past the bound, then close a little: the scale comes down from the bound straight away.
    const atMax = zoomPinchScale(4, 3, 1, 1, 5)
    expect(atMax).toBe(5)
    expect(zoomPinchScale(atMax, 2.7, 3, 1, 5)).toBeCloseTo(4.5)
  })

  it('changes nothing for a pinch scale that is not a positive number', () => {
    for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(zoomPinchScale(2, bad, 1, 1, 5)).toBe(2)
      expect(zoomPinchScale(2, 1.5, bad, 1, 5)).toBe(2)
    }
  })
})

describe('zoomAboutFocal', () => {
  it('keeps the content point under the focal point under it', () => {
    const viewport = 400
    for (const [offset, scale, factor, focal] of [
      [0, 1, 2, 300],
      [-80, 2, 1.25, 50],
      [120, 3, 0.5, 210]
    ]) {
      const point = (focal - viewport / 2 - offset) / scale
      const next = zoomAboutFocal(offset, focal, viewport, factor)
      expect(shown(point, next, scale * factor, viewport)).toBeCloseTo(focal)
    }
  })

  it('leaves the offset alone about the center, and when nothing scales', () => {
    expect(zoomAboutFocal(30, 200, 400, 2)).toBe(60)
    expect(zoomAboutFocal(30, 350, 400, 1)).toBe(30)
  })
})

describe('zoomMaxOffset', () => {
  it('lets the content move as far as keeps its edges at or past the viewport', () => {
    expect(zoomMaxOffset(400, 2, 400)).toBe(200)
    expect(zoomMaxOffset(400, 1, 400)).toBe(0)
    expect(zoomMaxOffset(300, 2, 400)).toBe(100)
  })

  it('keeps content smaller than the viewport centered', () => {
    expect(zoomMaxOffset(300, 1, 400)).toBe(0)
    expect(zoomMaxOffset(400, 0.5, 400)).toBe(0)
  })
})

describe('zoomClampOffset', () => {
  it('holds the offset where the content still covers the viewport', () => {
    expect(zoomClampOffset(150, 400, 2, 400)).toBe(150)
    expect(zoomClampOffset(250, 400, 2, 400)).toBe(200)
    expect(zoomClampOffset(-250, 400, 2, 400)).toBe(-200)
  })

  it('centers content smaller than the viewport', () => {
    expect(zoomClampOffset(40, 300, 1, 400)).toBe(0)
    expect(zoomClampOffset(-40, 400, 1, 400)).toBe(0)
  })
})
