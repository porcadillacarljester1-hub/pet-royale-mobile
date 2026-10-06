import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  StatusBar,
  Dimensions,
} from 'react-native';
import { router } from 'expo-router';
import { UserPlus, PawPrint, CalendarCheck, ClipboardList, ShoppingBag } from 'lucide-react-native';
import { colors, text, fonts, space, radius, shadow } from '../constants/theme';
import BrandMark from '../components/BrandMark';
import { Skeleton } from '../components/Skeleton';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const { width: SCREEN_W } = Dimensions.get('window');

const HERO_IMAGE =
  'https://images.unsplash.com/photo-1535320730793-87242ae1f53d?auto=format&fit=crop&w=1600&q=80';

const STEPS = [
  {
    Icon: UserPlus,
    title: 'Create your account',
    body: 'Sign up with your details so the clinic knows who you are.',
  },
  {
    Icon: PawPrint,
    title: 'Register your pet',
    body: "Add your pet's details once, ready for every visit.",
  },
  {
    Icon: CalendarCheck,
    title: 'Book a visit',
    body: 'Send a request for a day and time — the clinic confirms it.',
  },
  {
    Icon: ClipboardList,
    title: 'Track visits and payments',
    body: 'See your appointment and payment history whenever you need it.',
  },
  {
    Icon: ShoppingBag,
    title: 'Browse pet essentials',
    body: 'See the products the clinic offers and what is in stock.',
  },
];

export default function LandingScreen() {
  const insets = useSafeAreaInsets();
  const statusBarHeight = Math.max(insets.top, StatusBar.currentHeight ?? 0);

  const [scrollY] = useState(() => new Animated.Value(0));
  const [heroZoom] = useState(() => new Animated.Value(1));
  const [fadeHeader] = useState(() => new Animated.Value(0));
  const [fadeHero] = useState(() => new Animated.Value(0));
  const [slideHero] = useState(() => new Animated.Value(18));
  const [fadeSteps] = useState(() => new Animated.Value(0));
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

  /* ── Cascading entrance, top to bottom: header, hero, steps. ── */
  useEffect(() => {
    Animated.sequence([
      Animated.timing(fadeHeader, { toValue: 1, duration: 350, useNativeDriver: true }),
      Animated.parallel([
        Animated.timing(fadeHero, { toValue: 1, duration: 500, useNativeDriver: true }),
        Animated.timing(slideHero, { toValue: 0, duration: 500, useNativeDriver: true }),
      ]),
      Animated.timing(fadeSteps, { toValue: 1, duration: 450, useNativeDriver: true }),
    ]).start();
  }, []);

  const pressIn = () =>
    Animated.spring(ctaScale, { toValue: 0.96, useNativeDriver: true, speed: 40 }).start();
  const pressOut = () =>
    Animated.spring(ctaScale, { toValue: 1, useNativeDriver: true, speed: 20 }).start();

  const heroTranslate = scrollY.interpolate({
    inputRange: [-200, 0, 340],
    outputRange: [-60, 0, 120],
    extrapolate: 'clamp',
  });

  /* The status bar is translucent so the photo can run behind it at the
     top of the page. Once the page scrolls, cream content would slide
     under the white clock and battery icons and make them unreadable,
     so a navy strip fades in behind the status bar as soon as the user
     starts scrolling. */
  const statusBarBackdropOpacity = scrollY.interpolate({
    inputRange: [0, 60],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      <Animated.ScrollView
        showsVerticalScrollIndicator={false}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: true }
        )}
        scrollEventThrottle={16}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: space.xxxl + insets.bottom },
        ]}
      >
        {/* ───────────── HERO ───────────── */}
        <View style={styles.heroWrap}>
          {/* Skeleton sits behind the photo and is removed once the
              photo has loaded (or failed). */}
          {!heroLoaded && (
            <View style={StyleSheet.absoluteFill} accessibilityLabel="Loading photo">
              <Skeleton width="100%" height={HERO_HEIGHT} radius={0} />
            </View>
          )}
          <Animated.Image
            source={{ uri: HERO_IMAGE }}
            style={[
              styles.heroImage,
              { transform: [{ scale: heroZoom }, { translateY: heroTranslate }] },
            ]}
            resizeMode="cover"
            onLoad={() => setHeroLoaded(true)}
            onError={() => setHeroLoaded(true)}
          />
          {/* Navy, not grey-black — the same colour as the admin's top
              bar, so the photo reads as part of the brand. */}
          <View
            style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(5,31,66,0.5)' }]}
          />

          <Animated.View
            style={[
              styles.heroHeader,
              {
                opacity: fadeHeader,
                paddingTop: statusBarHeight + space.md,
              },
            ]}
          >
            <BrandMark height={30} color={colors.accent} />

            <TouchableOpacity
              style={styles.loginBtn}
              onPress={() => router.push('/signin' as any)}
              activeOpacity={0.80}
              accessibilityRole="button"
              accessibilityLabel="Sign In"
            >
              <Text style={styles.loginBtnText}>Sign In</Text>
            </TouchableOpacity>
          </Animated.View>

          <Animated.View
            style={[
              styles.heroContent,
              { opacity: fadeHero, transform: [{ translateY: slideHero }] },
            ]}
          >
            <Text style={styles.eyebrow}>Clinic &amp; Veterinary Services</Text>
            <Text style={styles.heroTitle} maxFontSizeMultiplier={1.15}>
              {'Where every\npet is '}
              <Text style={styles.heroTitleItalic}>royalty.</Text>
            </Text>

            <Text style={styles.heroSub} maxFontSizeMultiplier={1.3}>
              Register your pet, book a visit, and keep track of your
              appointments and payments — all in one place.
            </Text>

            <View style={styles.heroActions}>
              <Animated.View style={{ transform: [{ scale: ctaScale }] }}>
                <TouchableOpacity
                  style={styles.btnPrimary}
                  onPress={() => router.push('/register' as any)}
                  onPressIn={pressIn}
                  onPressOut={pressOut}
                  activeOpacity={0.9}
                  accessibilityRole="button"
                  accessibilityLabel="Get Started"
                >
                  <Text style={styles.btnPrimaryLabel}>Get Started</Text>
                </TouchableOpacity>
              </Animated.View>

              <TouchableOpacity
                style={styles.btnGhostHero}
                onPress={() => router.push('/services' as any)}
                activeOpacity={0.75}
                accessibilityRole="button"
                accessibilityLabel="See services"
              >
                <Text style={styles.btnGhostHeroLabel}>See services</Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        </View>

        <Animated.View style={[styles.stepsSection, { opacity: fadeSteps }]}>
          <Text style={styles.sectionEyebrow}>The Pet Royale app</Text>
          <Text style={styles.sectionTitle}>How it works</Text>

          <View style={styles.stepList}>
            {STEPS.map(({ Icon, title, body }, index) => (
              <View key={title} style={styles.stepRow}>
                <View style={styles.stepIcon}>
                  <Icon size={20} color={colors.primary} strokeWidth={2} />
                </View>
                <View style={styles.stepText}>
                  <Text style={styles.stepNumber}>Step {index + 1}</Text>
                  <Text style={styles.stepTitle}>{title}</Text>
                  <Text style={styles.stepBody}>{body}</Text>
                </View>
              </View>
            ))}
          </View>
        </Animated.View>
      </Animated.ScrollView>

      {/* Navy strip behind the status bar; fades in once scrolling starts. */}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.statusBarBackdrop,
          { height: statusBarHeight, opacity: statusBarBackdropOpacity },
        ]}
      />
    </View>
  );
}

const HERO_HEIGHT = 560;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scrollContent: { paddingBottom: space.xxxl },

  statusBarBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.primary,
    zIndex: 20,
  },

  /* Hero */
  heroWrap: {
    minHeight: HERO_HEIGHT,
    justifyContent: 'space-between',
    overflow: 'hidden',
    borderBottomLeftRadius: radius.card,
    borderBottomRightRadius: radius.card,
    backgroundColor: colors.primary,
  },
  heroImage: {
    position: 'absolute',
    top: 0,
    bottom: -120,
    left: 0,
    right: 0,
    height: HERO_HEIGHT + 120,
  },
  heroHeader: {
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.xxl,
    paddingTop: 52,
  },
  loginBtn: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.4)',
    paddingHorizontal: space.lg,
    paddingVertical: 7,
    borderRadius: radius.md,
  },
  loginBtnText: {
    ...text.smallBold,
    color: colors.white,
    letterSpacing: 0.5,
  },
  heroContent: {
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
    paddingHorizontal: space.xxl,
    paddingTop: space.xxl,
    paddingBottom: space.xxxl,
  },
  eyebrow: {
    ...text.eyebrow,
    color: 'rgba(255,255,255,0.65)',
    marginBottom: space.md,
  },
  heroTitle: {
    fontFamily: fonts.display,
    fontSize: 42,
    lineHeight: 46,
    letterSpacing: -1.2,
    color: colors.white,
  },
  heroTitleItalic: {
    fontFamily: fonts.displayRegular,
    fontStyle: 'italic',
    color: colors.accent,
  },
  heroSub: {
    ...text.body,
    color: 'rgba(255,255,255,0.78)',
    marginTop: space.md,
    maxWidth: 300,
  },
  heroActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.md,
    marginTop: space.xxl,
    alignItems: 'center',
  },
  btnPrimary: {
    height: 50,
    borderRadius: radius.lg,
    backgroundColor: colors.card,
    paddingHorizontal: space.xl,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    ...shadow.raised,
  },
  btnPrimaryLabel: { ...text.bodyBold, color: colors.primary },
  btnGhostHero: {
    height: 50,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.4)',
    paddingHorizontal: space.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnGhostHeroLabel: { ...text.bodyBold, color: colors.white },

  /* Section shared */
  sectionEyebrow: { ...text.eyebrow, color: colors.primary, marginBottom: space.sm },
  sectionTitle: {
    fontFamily: fonts.display,
    fontSize: 28,
    letterSpacing: -0.9,
    color: colors.foreground,
  },

  /* How it works */
  stepsSection: { 
    paddingHorizontal: space.xxl, 
    paddingTop: space.xxxl,
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
   },
  stepList: { marginTop: space.xxl, gap: space.xl },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.lg,
  },
  stepIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepText: { flex: 1, paddingTop: 2 },
  stepNumber: { ...text.eyebrow, color: colors.primary, marginBottom: 2 },
  stepTitle: { ...text.heading, color: colors.foreground },
  stepBody: { ...text.small, color: colors.mutedFg, marginTop: 2 },
});
