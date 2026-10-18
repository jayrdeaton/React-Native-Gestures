import React from 'react'

// Test-only instrumentation: the `onLayout` handler most recently passed to a View (SwipeToDismiss's stationary wrapper is the only one that has
// one), so a test can deliver a layout event of a given size.
export const lastOnLayout: { current?: (e: any) => void } = {}

export const StyleSheet = {
  create: <T extends object>(styles: T): T => styles,
  flatten: (style: unknown) => style
}

// The window a phone in portrait reports.
export const useWindowDimensions = () => ({ fontScale: 1, height: 812, scale: 3, width: 375 })

// iOS unless a test says otherwise (the web's click handling is only on the web).
export const Platform = { OS: 'ios' as string }

// A View renders a div carrying its testID, so a test can find the wrapper, and hands its ref the div, as react-native-web's does.
export const View = ({ children, onLayout, ref, testID }: { children?: React.ReactNode; onLayout?: (e: any) => void; ref?: React.Ref<HTMLDivElement>; testID?: string }) => {
  if (onLayout) lastOnLayout.current = onLayout
  return (
    <div data-testid={testID} ref={ref}>
      {children}
    </div>
  )
}
