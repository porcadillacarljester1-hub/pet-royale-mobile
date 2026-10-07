// lib/useTabBarClearance.ts
import { Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/* Space a tab screen must keep clear at the bottom so its last item
   clears the floating tab bar. Doesn't depend on navigator context,
   so it works on any screen. On Android the bar grows by the system
   navigation inset, so we add that. */
export const TAB_BAR_CLEARANCE = Platform.OS === 'ios' ? 104 : 94;

export function useTabBarClearance(): number {
  const insets = useSafeAreaInsets();
  return Platform.OS === 'android'
    ? TAB_BAR_CLEARANCE + insets.bottom
    : TAB_BAR_CLEARANCE;
}