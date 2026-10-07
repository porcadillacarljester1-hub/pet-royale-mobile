import { useEffect, useState } from 'react';
import {
  Animated,
  View,
  type DimensionValue,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { colors, space, radius as radii } from '../constants/theme';

/**
 * A placeholder block that pulses while content loads.
 *
 * A screen that shows a lone spinner on an empty canvas feels slower
 * than it is, and it jumps when the content arrives. Placeholders shaped
 * like the real layout tell the person what is coming and let the page
 * settle in place instead.
 *
 * Every block starts on mount with the same timing, so a screen full of
 * them pulses together. Opacity only, on the native driver, so it costs
 * next to nothing.
 *
 * Height is optional so a block can take its shape from `aspectRatio`
 * in `style` (a square product photo, say).
 */
export function Skeleton({
  width,
  height,
  radius = radii.sm,
  style,
}: {
  width: DimensionValue;
  height?: DimensionValue;
  radius?: number;
  style?: StyleProp<ViewStyle>;
}) {
  // useState with an initializer, not useRef(...).current: the lint rule
  // for React refs rejects reading a ref's value while rendering.
  const [opacity] = useState(() => new Animated.Value(0.5));

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 750, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.5, duration: 750, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={[
        { width, height, borderRadius: radius, backgroundColor: colors.border, opacity },
        style,
      ]}
    />
  );
}

/**
 * An icon tile with two lines beside it — the shape of a list row on
 * the Profile, Home and About screens. Pass the screen's own row style
 * as `style` so padding and hairlines match the real rows exactly.
 * `round` makes the tile a circle, like the icon tiles on Profile and
 * in Home's Recent visits.
 */
export function SkeletonRow({
  tile = 44,
  round = false,
  style,
}: {
  tile?: number;
  round?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[{ flexDirection: 'row', alignItems: 'center', gap: space.lg }, style]}>
      <Skeleton width={tile} height={tile} radius={round ? tile / 2 : radii.md} />
      <View style={{ flex: 1 }}>
        <Skeleton width="35%" height={14} />
        <Skeleton width="65%" height={12} style={{ marginTop: space.sm }} />
      </View>
    </View>
  );
}
