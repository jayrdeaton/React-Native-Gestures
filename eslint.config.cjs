const { defineConfig } = require('eslint/config')
const base = require('@infinitetoken/eslint-config/react-native')

module.exports = defineConfig([
  ...base,
  {
    // src/__mocks__ stays ignored: tsconfig.json excludes it from the TS project, so the
    // type-aware parser hard-fails on it if linted (not just a cosmetic warning).
    ignores: ['src/__mocks__/**']
  }
])
