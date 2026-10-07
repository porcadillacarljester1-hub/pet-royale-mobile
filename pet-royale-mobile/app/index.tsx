import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  StatusBar,
  useWindowDimensions,
} from 'react-native';
import { router } from 'expo-router';
import { CalendarCheck, PawPrint, CreditCard, ArrowRight } from 'lucide-react-native';
import { colors, text, fonts, space } from '../constants/theme';
import BrandMark from '../components/BrandMark';
import { Skeleton } from '../components/Skeleton';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GOLD_INK } from '../constants/flow';
import Rings from '../components/Rings';

const HERO_IMAGE =
  'https://images.unsplash.com/photo-1535320730793-87242ae1f53d?auto=format&fit=crop&w=1600&q=80';


const FEATURES = [
  { Icon: CalendarCheck, label: 'Book visits' },
  { Icon: PawPrint, label: 'Manage pets' },
  { Icon: CreditCard, label: 'Track payments' },
];

export default function LandingScreen() {
  const insets = useSafeAreaInsets();
  const { width: SCREEN_W, height: SCREEN_H } = useWindowDimensions();
  const statusBarHeight = Math.max(insets.top, StatusBar.currentHeight ?? 0);

  // Photo takes the top 62% of the screen; the sheet overlaps its lower edge.
  const heroHeight = Math.round(SCREEN_H * 0.62);

  /* Sized to the device. The brandmark is the first thing people see, so it
     grows with the screen width (about 40 on a typical phone, never below 34
     or above 46). The headline is now three lines, so on short screens it
     steps down a little to leave room for the photo. */
  const logoHeight = Math.round(Math.min(46, Math.max(34, SCREEN_W * 0.11)));
  const titleSize = SCREEN_H < 700 ? 32 : 36;
  const titleLine = titleSize + 4;

  const [heroZoom] = useState(() => new Animated.Value(1));
  const [fadeHeader] = useState(() => new Animated.Value(0));
  const [fadeSheet] = useState(() => new Animated.Value(0));
  const [slideSheet] = useState(() => new Animated.Value(40));
  const [ctaScale] = useState(() => new Animated.Value(1));

  const [heroLoaded, setHeroLoaded] = useState(false);

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(heroZoom, { toValue: 1.08, duration: 9000, useNativeDriver: true }),
        Animated.timing(heroZoom, { toValue: 1, duration: 9000, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  /* Entrance: logo fades in, then the bottom sheet slides up. */
  useEffect(() => {
    Animated.sequence([
      Animated.timing(fadeHeader, { toValue: 1, duration: 350, useNativeDriver: true }),
      Animated.parallel([
        Animated.timing(fadeSheet, { toValue: 1, duration: 450, useNativeDriver: true }),
        Animated.timing(slideSheet, { toValue: 0, duration: 450, useNativeDriver: true }),
      ]),
    ]).start();
  }, []);

  const pressIn = () =>
    Animated.spring(ctaScale, { toValue: 0.98, useNativeDriver: true, speed: 40 }).start();
  const pressOut = () =>
    Animated.spring(ctaScale, { toValue: 1, useNativeDriver: true, speed: 20 }).start();

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      {/* ───────────── PHOTO ───────────── */}
      <View style={[styles.hero, { height: heroHeight }]}>
        {!heroLoaded && (
          <View style={StyleSheet.absoluteFill} accessibilityLabel="Loading photo">
            <Skeleton width="100%" height={heroHeight} radius={0} />
          </View>
        )}
        <Animated.Image
          source={{ uri: HERO_IMAGE }}
          style={[styles.heroImage, { transform: [{ scale: heroZoom }] }]}
          resizeMode="cover"
          onLoad={() => setHeroLoaded(true)}
          onError={() => setHeroLoaded(true)}
        />
        {/* Navy wash, same brand colour as before. */}
        <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(5,31,66,0.45)' }]} />

        <Rings style={styles.rings} />

        {/* Brandmark: top-left, a comfortable gap below the status bar, and
            the same side margin as the text in the sheet so the two line up. */}
        <Animated.View
          style={[
            styles.logoWrap,
            { opacity: fadeHeader, paddingTop: statusBarHeight + space.lg },
          ]}
          accessible
          accessibilityRole="header"
          accessibilityLabel="Pet Royale"
        >
          <BrandMark height={logoHeight} color={colors.accent} />
        </Animated.View>
      </View>

      {/* ───────────── BOTTOM SHEET ───────────── */}
      <Animated.View
        style={[
          styles.sheet,
          {
            paddingBottom: 22 + insets.bottom,
            opacity: fadeSheet,
            transform: [{ translateY: slideSheet }],
          },
        ]}
      >
        <Text style={styles.eyebrow}>Clinic &amp; Veterinary Services</Text>

        {/* Three lines: Where every / pet is / royalty. */}
        <Text
          style={[styles.title, { fontSize: titleSize, lineHeight: titleLine }]}
          maxFontSizeMultiplier={1.15}
        >
          {'Where every\npet is\n'}
          <Text style={styles.titleItalic}>royalty.</Text>
        </Text>

        <View style={styles.features}>
          {FEATURES.map(({ Icon, label }) => (
            <View key={label} style={styles.feature}>
              <View style={styles.featureIcon}>
                <Icon size={20} color={colors.primary} strokeWidth={2} />
              </View>
              <Text style={styles.featureLabel} maxFontSizeMultiplier={1.2}>{label}</Text>
            </View>
          ))}
        </View>

        <Animated.View style={{ transform: [{ scale: ctaScale }] }}>
          <TouchableOpacity
            style={styles.btnMain}
            onPress={() => router.push('/register' as any)}
            onPressIn={pressIn}
            onPressOut={pressOut}
            activeOpacity={0.9}
            accessibilityRole="button"
            accessibilityLabel="Create account"
          >
            <Text style={styles.btnMainLabel}>Create account</Text>
          </TouchableOpacity>
        </Animated.View>

        <TouchableOpacity
          style={styles.btnAlt}
          onPress={() => router.push('/signin' as any)}
          activeOpacity={0.75}
          accessibilityRole="button"
          accessibilityLabel="Sign in"
        >
          <Text style={styles.btnAltLabel}>Sign in</Text>
        </TouchableOpacity>

        <Text style={styles.terms}>
          By continuing you agree to the clinic&apos;s terms and privacy policy.
        </Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.primary },

  /* Photo */
  hero: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    overflow: 'hidden',
    backgroundColor: colors.primary,
  },
  rings: { position: 'absolute', right: -70, top: -60 },
  heroImage: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
  },
  logoWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    // 22 matches the sheet's side padding below, so the logo and the
    // headline share the same left edge.
    paddingHorizontal: 22,
    alignItems: 'flex-start',
  },

  /* Bottom sheet */
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.card,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    paddingTop: 26,
    paddingHorizontal: 22,
    gap: 12,
    shadowColor: '#041733',
    shadowOffset: { width: 0, height: -10 },
    shadowOpacity: 0.18,
    shadowRadius: 30,
    elevation: 16,
  },
  eyebrow: { ...text.eyebrow, color: colors.mutedFg },
  title: {
    fontFamily: fonts.display,
    letterSpacing: -0.9,
    color: colors.foreground,
  },
  titleItalic: {
    fontFamily: fonts.displayRegular,
    fontStyle: 'italic',
    color: GOLD_INK,
  },
  features: { flexDirection: 'row', justifyContent: 'space-between', marginVertical: 6 },
  feature: { flex: 1, alignItems: 'center', gap: 8 },
  /* Same beige circles as the Profile screen. */
  featureIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.muted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureLabel: { ...text.smallBold, color: colors.foreground, textAlign: 'center' },
  servicesLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 4,
  },
  servicesLinkLabel: { ...text.bodyBold, color: colors.primary },

  btnMain: {
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 20,
    elevation: 6,
  },
  btnMainLabel: { ...text.bodyBold, color: colors.white },
  btnAlt: {
    height: 48,
    borderRadius: 24,
    borderWidth: 1.5,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnAltLabel: { ...text.bodyBold, color: colors.primary },
  terms: {
    ...text.small,
    color: colors.mutedFg,
    textAlign: 'center',
    marginTop: 2,
  },
});
