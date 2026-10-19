import { useEffect, useState } from 'react';
import { Tabs } from 'expo-router';
import { KeyboardEvents } from 'react-native-keyboard-controller';
import {
  View,
  Text,
  Pressable,
  Platform,
  StyleSheet,
  AppState,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { Ionicons } from '@expo/vector-icons';
import { colors, text, radius } from '../../constants/theme';

export const TAB_BAR_CLEARANCE = Platform.OS === 'ios' ? 104 : 94;

/* Bottom padding screens need so their last item clears the tab bar.
   On Android the bar grows by the system navigation inset (3-button or
   gesture), so this follows the device instead of a fixed number. */
export function useTabBarClearance() {
  const insets = useSafeAreaInsets();
  return Platform.OS === 'android' ? TAB_BAR_CLEARANCE + insets.bottom : TAB_BAR_CLEARANCE;
}

/* Form screens hide the bar so it never competes with their primary
   action. Personal information (app/account.tsx) is outside this layout,
   so it never had one. Add a route name here to hide the bar on it. */
const HIDE_TAB_BAR_ON = new Set<string>(['security']);

/* Routes whose bar is hidden only while the keyboard is open. Add a route
   name here to give another screen the same behavior. */
const HIDE_TAB_BAR_ON_KEYBOARD = new Set<string>(['products']);

type IoniconName = keyof typeof Ionicons.glyphMap;

interface IconSpec {
  sf: SymbolViewProps['name'];
  ion: IoniconName;
  ionFilled: IoniconName;
}

const TABS: { name: string; label: string; icon: IconSpec }[] = [
  {
    name: 'home',
    label: 'Home',
    icon: { sf: 'house', ion: 'home-outline', ionFilled: 'home' },
  },
  {
    name: 'book',
    label: 'Book',
    icon: { sf: 'stethoscope', ion: 'medkit-outline', ionFilled: 'medkit' },
  },
  {
    name: 'products',
    label: 'Shop',
    icon: { sf: 'bag', ion: 'bag-outline', ionFilled: 'bag' },
  },
  {
    name: 'appointments',
    label: 'Visits',
    icon: { sf: 'clock.arrow.circlepath', ion: 'time-outline', ionFilled: 'time' },
  },
  {
    name: 'profile',
    label: 'Profile',
    icon: { sf: 'person', ion: 'person-outline', ionFilled: 'person' },
  },
];

function TabIcon({ spec, focused, tint }: { spec: IconSpec; focused: boolean; tint: string }) {
  if (Platform.OS === 'ios') {
    return (
      <SymbolView
        name={spec.sf}
        size={21}
        tintColor={tint}
        weight={focused ? 'semibold' : 'regular'}
        fallback={<Ionicons name={focused ? spec.ionFilled : spec.ion} size={20} color={tint} />}
      />
    );
  }
  return <Ionicons name={focused ? spec.ionFilled : spec.ion} size={20} color={tint} />;
}

function FloatingTabBar({ state, navigation }: BottomTabBarProps) {
  // Must run before the early return below (rules of hooks).
  const insets = useSafeAreaInsets();

  /* The app resizes with the keyboard (KeyboardProvider), which would push
     this bar up on top of the keys. On the Shop screen only, it is hidden
     while the keyboard is open (search) and comes back as soon as the
     keyboard closes. Every other tab behaves exactly as before.

     Both the "Will" and the "Did" events are listened to: some Android
     devices only report the "Did" ones reliably, and listening to both
     costs nothing (setting the same value twice does nothing). */
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  useEffect(() => {
    const subs = [
      KeyboardEvents.addListener('keyboardWillShow', () => setKeyboardOpen(true)),
      KeyboardEvents.addListener('keyboardDidShow', () => setKeyboardOpen(true)),
      KeyboardEvents.addListener('keyboardWillHide', () => setKeyboardOpen(false)),
      KeyboardEvents.addListener('keyboardDidHide', () => setKeyboardOpen(false)),
    ];
    return () => subs.forEach((s) => s.remove());
  }, []);

  /* A missed keyboard-hide event must never leave the bar hidden. The flag
     is cleared whenever the visible tab changes and whenever the app comes
     back to the foreground. If the keyboard really is open, the next
     show event sets it again. */
  const activeRoute = state.routes[state.index]?.name;
  const [lastRoute, setLastRoute] = useState(activeRoute);
  if (lastRoute !== activeRoute) {
    setLastRoute(activeRoute);
    setKeyboardOpen(false);
  }
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') setKeyboardOpen(false);
    });
    return () => sub.remove();
  }, []);

  if (keyboardOpen && HIDE_TAB_BAR_ON_KEYBOARD.has(state.routes[state.index]?.name)) return null;
  if (HIDE_TAB_BAR_ON.has(state.routes[state.index]?.name)) return null;

  return (
    <View
      style={[
        styles.bar,
        // Android draws edge-to-edge, so the bar has to clear the system
        // navigation (3-button or gesture) itself. iOS is left as it was.
        Platform.OS === 'android' && { paddingBottom: 12 + insets.bottom },
      ]}
    >
      {TABS.map(({ name, label, icon }) => {
        const routeIndex = state.routes.findIndex((r) => r.name === name);
        if (routeIndex === -1) return null;

        const route = state.routes[routeIndex];
        const focused = state.index === routeIndex;
        const tint = focused ? colors.primary : colors.mutedFg;

        const onPress = () => {
          const event = navigation.emit({
            type: 'tabPress',
            target: route.key,
            canPreventDefault: true,
          });
          if (!focused && !event.defaultPrevented) {
            navigation.navigate(route.name);
          }
        };

        return (
          <Pressable
            key={route.key}
            onPress={onPress}
            accessibilityRole="button"
            accessibilityState={focused ? { selected: true } : {}}
            accessibilityLabel={label}
            style={({ pressed }) => [styles.pressable, pressed && styles.pressablePressed]}
            android_ripple={{ color: 'transparent', borderless: false }}
          >
            <View style={[styles.item, focused && styles.itemActive]}>
              <TabIcon spec={icon} focused={focused} tint={tint} />
              <Text
                style={[styles.label, focused && styles.labelActive]}
                numberOfLines={1}
                maxFontSizeMultiplier={1.15}
              >
                {label}
              </Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

export default function TabLayout() {
  return (
    <Tabs
      tabBar={(props) => <FloatingTabBar {...props as any} />}
      screenOptions={{ 
        tabBarAllowFontScaling: false, 
        headerShown: false }}
      backBehavior="history"
    >
      {TABS.map(({ name }) => (
        <Tabs.Screen key={name} name={name} />
      ))}

      {/* Reachable by navigation, not from the bar. */}
      <Tabs.Screen name="pets" options={{ href: null }} />
      <Tabs.Screen name="notifications" options={{ href: null }} />
      <Tabs.Screen name="about" options={{ href: null }} />
      <Tabs.Screen name="security" options={{ href: null }} />
      <Tabs.Screen name="payment-history" options={{ href: null }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingTop: 8,
    paddingBottom: Platform.OS === 'ios' ? 25 : 12,
    paddingHorizontal: 8,
    backgroundColor: colors.card,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  /* Equal columns that don't depend on their content. The active label
     is bold and so wider; if the column followed the label, every tab
     next to it would shift when the selection changes. */
  pressable: {
    flex: 1,
    flexBasis: 0,
    minWidth: 0,
    alignItems: 'center',
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  pressablePressed: { opacity: 0.62 },
  item: {
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    paddingHorizontal: 2,
    paddingVertical: 5,
    minHeight: 44,
  },
  itemActive: { backgroundColor: 'transparent' },
  label: {
    ...text.caption,
    fontSize: 11,
    lineHeight: 14,
    textAlign: 'center',
    color: colors.mutedFg,
  },
  labelActive: {
    fontFamily: text.bodyBold.fontFamily,
    color: colors.foreground,
  },
});
