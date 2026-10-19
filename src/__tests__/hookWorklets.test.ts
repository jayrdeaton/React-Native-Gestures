import { transformSync } from '@babel/core'
import { readdirSync, readFileSync } from 'fs'
import path from 'path'

// The worklets Babel plugin turns a Reanimated hook's callback into a worklet only when it recognizes the hook by name. The web loads the
// bundled dist, and bundling can rename an import that two files share: 0.1.1's dist called SwipeToDismiss's style hook useAnimatedStyle2,
// so its callback stayed a plain function and threw on every web page (found through Expo-Starter's demo, 2026-10-19). So every such callback
// carries its own 'worklet' directive. This compiles each source file with the real plugin as written and with every Reanimated hook renamed
// the way the bundler did, and checks the two make the same worklets.

const SRC = path.join(__dirname, '..')
const HOOKS = /\b(useAnimatedStyle|useAnimatedProps|useDerivedValue|useAnimatedReaction|useAnimatedScrollHandler|useFrameCallback)\b/g

// How many worklets the plugin makes of the file: each one carries its source as `__initData`. The plugin reads the file at `filename` for
// its source map, so it's the real path even for the renamed source.
function workletCount(source: string, filename: string): number {
  const result = transformSync(source, {
    babelrc: false,
    configFile: false,
    filename,
    plugins: [require.resolve('@babel/plugin-syntax-jsx'), require.resolve('react-native-worklets/plugin')],
    presets: [require.resolve('@babel/preset-typescript')]
  })
  return (result?.code?.match(/__initData/g) ?? []).length
}

// `match`, not `HOOKS.test`: a global regex's `test` resumes from where its last match ended, so it could skip the next file.
const files = readdirSync(SRC).filter((name) => /\.tsx?$/.test(name) && readFileSync(path.join(SRC, name), 'utf8').match(HOOKS) !== null)

describe("a Reanimated hook's callback is a worklet whatever the bundler calls the hook", () => {
  it('finds the files that use one', () => {
    expect(files).toEqual(expect.arrayContaining(['PinchZoomView.tsx', 'SwipeToDismiss.tsx']))
  })

  it.each(files)('%s makes the same worklets with its hooks renamed', (name) => {
    const source = readFileSync(path.join(SRC, name), 'utf8')
    const renamed = source.replace(HOOKS, '$12')
    expect(renamed).not.toEqual(source)
    const filename = path.join(SRC, name)
    const asWritten = workletCount(source, filename)
    expect(asWritten).toBeGreaterThan(0)
    expect(workletCount(renamed, filename)).toBe(asWritten)
  })
})
