import React from 'react';
import { View, StyleProp, ViewStyle } from 'react-native';
import { colors } from '../constants/theme';

/* Concentric gold rings from the mockup, drawn with Views (no SVG needed). */
const RATIOS = [220 / 240, 164 / 240, 108 / 240];

type Props = {
  size?: number;
  opacities?: [number, number, number];
  style?: StyleProp<ViewStyle>;
};

export default function Rings({ size = 240, opacities = [0.3, 0.5, 0.8], style }: Props) {
  return (
    <View pointerEvents="none" style={[{ width: size, height: size }, style]}>
      {RATIOS.map((r, i) => {
        const d = size * r;
        return (
          <View
            key={i}
            style={{
              position: 'absolute',
              width: d,
              height: d,
              borderRadius: d / 2,
              borderWidth: 2,
              borderColor: colors.accent,
              opacity: opacities[i],
              left: (size - d) / 2,
              top: (size - d) / 2,
            }}
          />
        );
      })}
    </View>
  );
}
