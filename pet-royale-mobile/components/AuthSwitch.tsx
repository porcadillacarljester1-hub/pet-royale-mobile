import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated, type StyleProp, type ViewStyle } from 'react-native';
import { colors, text } from '../constants/theme';

export type AuthMode = 'signin' | 'register';

/* The "Sign in | Create account" switch.

   The navy pill slides when a tab is pressed, and also when `active` is
   changed from outside (for example after sign-up sends the person back to
   sign in). This component now stays mounted while the form below it swaps,
   so the pill really slides from one side to the other instead of appearing
   already moved. */
export default function AuthSwitch({
  active,
  onSwitch,
  style,
}: {
  active: AuthMode;
  onSwitch: (to: AuthMode) => void;
  style?: StyleProp<ViewStyle>;
}) {
  const [pos] = useState(() => new Animated.Value(active === 'register' ? 1 : 0));
  // Which label looks selected. Flips the moment you press, while the pill
  // is still sliding.
  const [shown, setShown] = useState<AuthMode>(active);
  // Where the pill is heading (0 = Sign in, 1 = Create account). Stops a
  // press and the `active` change that follows it from starting the same
  // slide twice, which would restart the animation halfway.
  const heading = useRef(active === 'register' ? 1 : 0);

  const slideTo = useCallback(
    (to: AuthMode) => {
      const value = to === 'register' ? 1 : 0;
      if (heading.current === value) return;
      heading.current = value;
      setShown(to);
      Animated.timing(pos, { toValue: value, duration: 180, useNativeDriver: false }).start();
    },
    [pos]
  );

  useEffect(() => {
    slideTo(active);
  }, [active, slideTo]);

  const go = (to: AuthMode) => {
    if (to === shown) return;
    slideTo(to);
    onSwitch(to);
  };

  return (
    <View style={[styles.wrap, style]} accessibilityRole="tablist">
      {/* The sliding pill: half the track wide, so no measuring is needed. */}
      <View style={styles.track} pointerEvents="none">
        <Animated.View
          style={[styles.pill, { left: pos.interpolate({ inputRange: [0, 1], outputRange: ['0%', '50%'] }) }]}
        />
      </View>

      <TouchableOpacity
        style={styles.tab}
        onPress={() => go('signin')}
        activeOpacity={0.7}
        accessibilityRole="tab"
        accessibilityState={{ selected: shown === 'signin' }}
      >
        <Text style={[styles.label, shown === 'signin' && styles.labelOn]}>Sign in</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.tab}
        onPress={() => go('register')}
        activeOpacity={0.7}
        accessibilityRole="tab"
        accessibilityState={{ selected: shown === 'register' }}
      >
        <Text style={[styles.label, shown === 'register' && styles.labelOn]}>Create account</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  // Size, margins and shadow come from the screen via `style`.
  wrap: { flexDirection: 'row' },
  track: { position: 'absolute', left: 4, right: 4, top: 4, bottom: 4 },
  pill: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: '50%',
    borderRadius: 22,
    backgroundColor: colors.primary,
  },
  tab: { flex: 1, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  label: { ...text.smallBold, color: colors.mutedFg },
  labelOn: { color: colors.primaryFg },
});
