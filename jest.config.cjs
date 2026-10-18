module.exports = require('@infinitetoken/jest-config/react-native')({
  moduleNameMapper: {
    '^react-native$': '<rootDir>/src/__mocks__/react-native.tsx',
    '^react-native-gesture-handler$': '<rootDir>/src/__mocks__/react-native-gesture-handler.ts',
    '^react-native-reanimated$': '<rootDir>/src/__mocks__/react-native-reanimated.ts',
    '^react-native-worklets$': '<rootDir>/src/__mocks__/react-native-worklets.ts'
  }
})
