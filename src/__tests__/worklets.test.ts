import { transformFileSync } from '@babel/core'
import path from 'path'

import * as swipe from '../swipe'
import * as zoom from '../zoom'

// The swipe and zoom rules run on the UI thread, where a worklet is rebuilt from its compiled code string with no module scope: the module constants it
// uses arrive through `this.__closure`, unpacked at the top of its body. swipe.test.ts calls the plain functions, so it can't see what only
// breaks there. A default parameter naming a module constant (`fraction = SWIPE_DISMISS_FRACTION`) is evaluated before that body runs, so it
// threw a ReferenceError on the UI thread and crashed every release build of @rific/toaster on a sideways swipe (0.8.0-0.8.2). This compiles swipe.ts
// and zoom.ts with the real Worklets Babel plugin and runs each rule the way the UI runtime does.

type Worklet = ((...args: unknown[]) => unknown) & { __closure?: unknown[]; __initData: { code: string } }

function compileWorklets(file: string): Record<string, Worklet> {
  const result = transformFileSync(file, {
    babelrc: false,
    configFile: false,
    plugins: [require.resolve('react-native-worklets/plugin'), require.resolve('@babel/plugin-transform-modules-commonjs')],
    presets: [require.resolve('@babel/preset-typescript')]
  })
  const compiled = { exports: {} as Record<string, unknown> }
  new Function('module', 'exports', result?.code ?? '')(compiled, compiled.exports)
  return Object.fromEntries(Object.entries(compiled.exports).filter(([, value]) => typeof value === 'function')) as Record<string, Worklet>
}

/** The worklet as the UI runtime builds it: evaluated from its code string in a scope with no module variables, its closure handed in. */
function onUiThread(worklet: Worklet) {
  const fn = new Function(`return ${worklet.__initData.code}`)() as (...args: unknown[]) => unknown
  return (...args: unknown[]) => fn.apply({ __closure: worklet.__closure }, args)
}

// Each rule called with only its required arguments (every default left to the worklet) and with all of them.
const SWIPE_CALLS: Record<string, unknown[][]> = {
  releaseVelocity: [
    [600, 10],
    [600, 200]
  ],
  sampleVelocity: [
    [0, 10, 16],
    [100, 5, 0]
  ],
  swipeEdgeDrag: [
    [-30, -1],
    [30, -1]
  ],
  swipeExitTarget: [
    [40, 400],
    [-40, 400]
  ],
  swipeIsVertical: [
    [2, 10],
    [10, 2]
  ],
  swipeShouldDismiss: [
    [100, 200],
    [10, 300],
    [20, 300, 600],
    [29, 56, 0, swipe.SWIPE_EDGE_DISMISS_FRACTION]
  ]
}

const ZOOM_CALLS: Record<string, unknown[][]> = {
  zoomAboutFocal: [
    [0, 300, 400, 2],
    [-80, 50, 400, 1.25]
  ],
  zoomClampOffset: [
    [250, 400, 2, 400],
    [40, 300, 1, 400]
  ],
  zoomClampScale: [
    [9, 1, 5],
    [0.5, 0.5, 3]
  ],
  zoomMaxOffset: [
    [400, 2, 400],
    [300, 1, 400]
  ],
  zoomPinchScale: [
    [2, 1.5, 1.25, 1, 5],
    [4, 3, 1, 1, 5],
    [2, Number.NaN, 1, 1, 5]
  ]
}

describe.each([
  ['swipe', '../swipe.ts', swipe, SWIPE_CALLS],
  ['zoom', '../zoom.ts', zoom, ZOOM_CALLS]
])('the %s rules on the UI thread', (_rules, file, module, calls) => {
  const worklets = compileWorklets(path.join(__dirname, file))
  const plain = module as unknown as Record<string, (...args: unknown[]) => unknown>

  it('compiles every rule to a worklet, and every rule has calls below', () => {
    expect(Object.keys(worklets).sort()).toEqual(Object.keys(calls).sort())
    for (const worklet of Object.values(worklets)) expect(typeof worklet.__initData?.code).toBe('string')
  })

  it.each(Object.entries(calls))('%s answers on the UI thread as it does in plain JS', (name, args) => {
    const ui = onUiThread(worklets[name])
    for (const call of args) expect(ui(...call)).toEqual(plain[name](...call))
  })
})
