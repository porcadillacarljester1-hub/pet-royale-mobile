import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Platform,
  StatusBar,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';

/**
 * Pet Royale loading screen (React Native / Expo).
 * No extra dependencies: the pixel dog is drawn with Views.
 *
 * Driven by real loading:
 *   <LoadingScreen progress={0..1} status="Checking your account…" />
 * The bar only moves forward when the app really finishes a step, so on a
 * slow connection the dog waits where the app is waiting.
 */

type Props = {
  /** 0 to 1. How much of the startup work is done. */
  progress?: number;
  /** Text shown under the bar. */
  status?: string;
};

const COLORS = {
  bg: '#051F42',
  gold: '#D9A52B',
  goldDark: '#B98A1E',
  cream: '#F3EFE6',
  tip: '#D8CFB8',
  trackBorder: '#0A0F1D',
  trackBg: '#140E07',
};

const MONO = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' });
const SERIF = Platform.select({ ios: 'Georgia', android: 'serif', default: 'serif' });

const TRACK_W = 240;
const TRACK_H = 16;
const PX = 4; // dog pixel scale (20x12 grid -> 80x48)

// ---------- Pixel dog ----------
type R = [x: number, y: number, w: number, h: number, color: string];

const BODY: R[] = [
  [2, 3, 10, 4, '#B8793B'],
  [3, 6, 8, 1, '#D9A15B'],
  [11, 1, 5, 5, '#B8793B'],
  [16, 3, 2, 2, '#E3B27A'],
  [17, 3, 1, 1, '#1B1B1B'],
  [14, 2, 1, 1, '#1B1B1B'],
  [11, 1, 2, 3, '#7A4A1F'],
  [11, 5, 4, 1, '#D9A52B'],
  [2, 10, 14, 1, 'rgba(0,0,0,0.28)'],
];
const TAIL_A: R[] = [[1, 1, 1, 2, '#8A5A2B']];
const TAIL_B: R[] = [[0, 3, 2, 1, '#8A5A2B']];
const LEGS_A: R[] = [
  [2, 7, 1, 3, '#8A5A2B'],
  [5, 7, 1, 3, '#B8793B'],
  [8, 7, 1, 3, '#8A5A2B'],
  [11, 7, 1, 3, '#B8793B'],
];
const LEGS_B: R[] = [
  [3, 7, 1, 3, '#8A5A2B'],
  [4, 7, 1, 3, '#B8793B'],
  [9, 7, 1, 3, '#8A5A2B'],
  [10, 7, 1, 3, '#B8793B'],
];

const Pixels = ({ rects }: { rects: R[] }) => (
  <>
    {rects.map(([x, y, w, h, c], i) => (
      <View
        key={i}
        style={{
          position: 'absolute',
          left: x * PX,
          top: y * PX,
          width: w * PX,
          height: h * PX,
          backgroundColor: c,
        }}
      />
    ))}
  </>
);

const Dog = ({ frame }: { frame: 0 | 1 }) => (
  <View
    style={{
      width: 20 * PX,
      height: 12 * PX,
      transform: [{ translateY: frame ? -3 : 0 }],
    }}
  >
    <Pixels rects={BODY} />
    <Pixels rects={frame === 0 ? TAIL_A : TAIL_B} />
    <Pixels rects={frame === 0 ? LEGS_A : LEGS_B} />
  </View>
);

// ---------- Screen ----------
export default function LoadingScreen({ progress = 0, status = 'Starting up…' }: Props) {
  const { height } = useWindowDimensions();
  const [anim] = useState(() => new Animated.Value(0));
  const [frame, setFrame] = useState<0 | 1>(0);

  // Move the bar to the real progress (never backwards)
  const best = useRef(0);
  useEffect(() => {
    const target = Math.min(1, Math.max(best.current, progress));
    best.current = target;
    Animated.timing(anim, {
      toValue: target,
      duration: 600,
      easing: Easing.out(Easing.quad),
      useNativeDriver: false, // animating width
    }).start();
  }, [progress, anim]);

  // 20 hard steps for the pixel look
  const widthPct = useMemo(() => {
    const input = [0];
    const output = ['0%'];
    for (let i = 1; i <= 20; i++) {
      const t = i / 20;
      input.push(t, t);
      output.push(`${((i - 1) / 20) * 100}%`, `${(i / 20) * 100}%`);
    }
    return anim.interpolate({ inputRange: input, outputRange: output });
  }, [anim]);

  // Dog run cycle
  useEffect(() => {
    const f = setInterval(() => setFrame((p) => (p === 0 ? 1 : 0)), 250);
    return () => clearInterval(f);
  }, []);

  return (
    <View
      style={styles.screen}
      accessibilityRole="progressbar"
      accessibilityLabel="Loading Pet Royale"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(progress * 100) }}
    >
      <StatusBar barStyle="light-content" backgroundColor={COLORS.bg} />

      <View style={{ marginTop: height * 0.257, alignItems: 'center' }}>
        <Text style={styles.title}>Pet Royale</Text>
        <Text style={styles.subtitle}>Clinic and Veterinary Services</Text>
      </View>

      <View style={styles.track}>
        <Animated.View style={[styles.fill, { width: widthPct }]}>
          {/* gold stripes, clipped to the filled part only */}
          <View pointerEvents="none" style={styles.clip}>
            {Array.from({ length: Math.ceil(TRACK_W / 12) }).map((_, i) => (
              <View key={i} style={[styles.stripe, { left: i * 12 + 10 }]} />
            ))}
          </View>
          <View style={styles.dog}>
            <Dog frame={frame} />
          </View>
        </Animated.View>
      </View>

      <Text style={styles.status} accessibilityLiveRegion="polite">
        {status}
      </Text>

      <Text style={styles.tip}>Tip: tap a pet to edit or delete it.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, alignItems: 'center', backgroundColor: COLORS.bg },
  title: {
    fontFamily: SERIF,
    fontStyle: 'italic',
    fontWeight: '700',
    fontSize: 54,
    lineHeight: 58,
    color: COLORS.gold,
  },
  subtitle: { marginTop: 8, fontSize: 14, letterSpacing: 0.84, color: COLORS.cream },
  track: {
    width: TRACK_W + 6,
    height: TRACK_H + 6,
    marginTop: 86,
    borderWidth: 3,
    borderColor: COLORS.trackBorder,
    backgroundColor: COLORS.trackBg,
  },
  fill: { height: '100%', backgroundColor: COLORS.gold },
  clip: { ...StyleSheet.absoluteFill, overflow: 'hidden' },
  stripe: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 2,
    backgroundColor: COLORS.goldDark,
  },
  dog: { position: 'absolute', right: 0, bottom: TRACK_H + 6, transform: [{ translateX: 40 }] },
  status: {
    width: 280,
    marginTop: 22,
    textAlign: 'center',
    fontFamily: MONO,
    fontWeight: '700',
    fontSize: 14,
    letterSpacing: 0.84,
    color: COLORS.cream,
  },
  tip: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 56,
    paddingHorizontal: 32,
    textAlign: 'center',
    fontSize: 13,
    color: COLORS.tip,
  },
});
