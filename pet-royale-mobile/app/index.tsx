import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  Animated,
  StatusBar,
  Dimensions,
} from 'react-native';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Stethoscope,
  Syringe,
  HeartPulse,
  ShieldAlert,
  Scissors,
  ArrowRight,
  PawPrint,
  Check,
  Home as HomeIcon,
  CalendarCheck,
  ClipboardList,
} from 'lucide-react-native';
import { colors, text, fonts, space, radius, shadow, status } from '../constants/theme';

const { width: SCREEN_W } = Dimensions.get('window');

/* Real, freely-licensed photography (Unsplash License — free for
   commercial use, no attribution required). Swap these two URIs for
   your own clinic photography whenever you have it; everything else
   about the layout stays the same. */
const HERO_IMAGE =
  'https://images.unsplash.com/photo-1535320730793-87242ae1f53d?auto=format&fit=crop&w=1600&q=80';
const LIFESTYLE_IMAGE =
  'https://images.unsplash.com/photo-1516039679827-2cff1760cda6?auto=format&fit=crop&w=1200&q=80';

/* Pulled straight from services.tsx, so the landing page and the
   Services screen never drift out of sync. */
const SERVICES = [
  {
    id: '01',
    title: 'Veterinary Check-ups',
    blurb: 'Full physical assessments, diagnostics & expert consultations.',
    Icon: Stethoscope,
  },
  {
    id: '02',
    title: 'Vaccination & Deworming',
    blurb: 'Scheduled vaccines and deworming programs for every life stage.',
    Icon: Syringe,
  },
  {
    id: '03',
    title: 'Minor & Major Surgeries',
    blurb: 'Routine to complex procedures with skilled surgical care.',
    Icon: HeartPulse,
  },
  {
    id: '04',
    title: 'Confinement & Emergency Care',
    blurb: '24/7 emergency response and overnight confinement facilities.',
    Icon: ShieldAlert,
  },
  {
    id: '05',
    title: 'Grooming',
    blurb: 'Bath, trim, nail care & styling — your pet, looking their best.',
    Icon: Scissors,
  },
];

/* Three lightweight recreations of the real Home / Appointments / Pets
   tabs, used to drive the "app demo" phone mock below. Because these
   mirror the actual screens' structure (not a cartoon), you can drop
   real screenshots in later without changing the surrounding layout —
   just replace <DemoScreenX /> with an <Image>. */
const DEMO_TABS = [
  { key: 'home', label: 'Home', Icon: HomeIcon },
  { key: 'appointments', label: 'Appointments', Icon: CalendarCheck },
  { key: 'pets', label: 'My Pets', Icon: PawPrint },
];

export default function LandingScreen() {
  const scrollY = useRef(new Animated.Value(0)).current;
  const heroZoom = useRef(new Animated.Value(1)).current;

  const fadeHeader = useRef(new Animated.Value(0)).current;
  const fadeHero = useRef(new Animated.Value(0)).current;
  const slideHero = useRef(new Animated.Value(18)).current;
  const fadeTrust = useRef(new Animated.Value(0)).current;
  const fadeServicesHead = useRef(new Animated.Value(0)).current;
  const serviceAnims = useRef(SERVICES.map(() => new Animated.Value(0))).current;
  const fadeDemo = useRef(new Animated.Value(0)).current;
  const fadeCta = useRef(new Animated.Value(0)).current;

  const [demoIndex, setDemoIndex] = useState(0);
  const demoOpacities = useRef(DEMO_TABS.map((_, i) => new Animated.Value(i === 0 ? 1 : 0))).current;

  const ctaScale = useRef(new Animated.Value(1)).current;

  /* ── Slow continuous zoom on the hero photo — the "cinematic" feel
      that doesn't depend on the user scrolling at all. ── */
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(heroZoom, { toValue: 1.08, duration: 9000, useNativeDriver: true }),
        Animated.timing(heroZoom, { toValue: 1, duration: 9000, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  /* ── Cascading entrance, top to bottom. ── */
  useEffect(() => {
    Animated.sequence([
      Animated.timing(fadeHeader, { toValue: 1, duration: 350, useNativeDriver: true }),
      Animated.parallel([
        Animated.timing(fadeHero, { toValue: 1, duration: 500, useNativeDriver: true }),
        Animated.timing(slideHero, { toValue: 0, duration: 500, useNativeDriver: true }),
      ]),
      Animated.timing(fadeTrust, { toValue: 1, duration: 400, useNativeDriver: true }),
      Animated.timing(fadeServicesHead, { toValue: 1, duration: 350, useNativeDriver: true }),
      Animated.stagger(
        80,
        serviceAnims.map((v) =>
          Animated.timing(v, { toValue: 1, duration: 350, useNativeDriver: true })
        )
      ),
      Animated.timing(fadeDemo, { toValue: 1, duration: 450, useNativeDriver: true }),
      Animated.timing(fadeCta, { toValue: 1, duration: 400, useNativeDriver: true }),
    ]).start();
  }, []);

  /* ── Auto-rotating app-demo carousel, cross-fading between tabs. ── */
  useEffect(() => {
    const id = setInterval(() => {
      setDemoIndex((prev) => (prev + 1) % DEMO_TABS.length);
    }, 3200);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    Animated.parallel(
      demoOpacities.map((v, i) =>
        Animated.timing(v, {
          toValue: i === demoIndex ? 1 : 0,
          duration: 380,
          useNativeDriver: true,
        })
      )
    ).start();
  }, [demoIndex]);

  const pressIn = () => Animated.spring(ctaScale, { toValue: 0.96, useNativeDriver: true, speed: 40 }).start();
  const pressOut = () => Animated.spring(ctaScale, { toValue: 1, useNativeDriver: true, speed: 20 }).start();

  const heroTranslate = scrollY.interpolate({
    inputRange: [-200, 0, 340],
    outputRange: [-60, 0, 120],
    extrapolate: 'clamp',
  });

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      <Animated.ScrollView
        showsVerticalScrollIndicator={false}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
          useNativeDriver: true,
        })}
        scrollEventThrottle={16}
        contentContainerStyle={styles.scrollContent}
      >
        {/* ───────────── HERO ───────────── */}
        <View style={styles.heroWrap}>
          <Animated.Image
            source={{ uri: HERO_IMAGE }}
            style={[
              styles.heroImage,
              { transform: [{ scale: heroZoom }, { translateY: heroTranslate }] },
            ]}
            resizeMode="cover"
          />
          <LinearGradient
            colors={['rgba(13,20,26,0.15)', 'rgba(13,20,26,0.35)', colors.foreground]}
            locations={[0, 0.55, 1]}
            style={StyleSheet.absoluteFill}
          />

          <Animated.View style={[styles.heroHeader, { opacity: fadeHeader }]}>
            <View style={styles.wordmarkRow}>
              <View style={styles.markTile}>
                <PawPrint size={18} color={colors.primary} strokeWidth={2.4} />
                <View style={styles.markBadge}>
                  <Check size={7} color={colors.foreground} strokeWidth={4} />
                </View>
              </View>
              <Text style={styles.wordmark}>Pet Royale&apos;</Text>
            </View>
            <TouchableOpacity
              style={styles.loginBtn}
              onPress={() => router.push('/signin')}
              activeOpacity={0.75}
            >
              <Text style={styles.loginBtnText}>Login</Text>
            </TouchableOpacity>
          </Animated.View>

          <Animated.View
            style={[
              styles.heroContent,
              { opacity: fadeHero, transform: [{ translateY: slideHero }] },
            ]}
          >
            <Text style={styles.eyebrow}>Clinic & Veterinary Services</Text>
            <Text style={styles.heroTitle}>
              {'Where every\npet is '}
              <Text style={styles.heroTitleItalic}>royalty.</Text>
            </Text>
            <Text style={styles.heroSub}>
              Professional veterinary care, trusted by families who treat their pets like family.
            </Text>

            <View style={styles.heroActions}>
              <Animated.View style={{ transform: [{ scale: ctaScale }] }}>
                <TouchableOpacity
                  style={styles.btnPrimary}
                  onPress={() => router.push('/register')}
                  onPressIn={pressIn}
                  onPressOut={pressOut}
                  activeOpacity={0.9}
                >
                  <Text style={styles.btnPrimaryLabel}>Get Started</Text>
                  <ArrowRight size={18} color={colors.primaryFg} />
                </TouchableOpacity>
              </Animated.View>

              <TouchableOpacity
                style={styles.btnGhostHero}
                onPress={() => router.push('/services')}
                activeOpacity={0.75}
              >
                <Text style={styles.btnGhostHeroLabel}>See services</Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        </View>

        {/* ───────────── TRUST STRIP ───────────── */}
        <Animated.View style={[styles.trustStrip, { opacity: fadeTrust }]}>
          <View style={styles.trustItem}>
            <Stethoscope size={18} color={colors.primary} strokeWidth={2} />
            <Text style={styles.trustLabel}>Licensed veterinary team</Text>
          </View>
          <View style={styles.trustDivider} />
          <View style={styles.trustItem}>
            <ShieldAlert size={18} color={colors.primary} strokeWidth={2} />
            <Text style={styles.trustLabel}>24/7 emergency care</Text>
          </View>
          <View style={styles.trustDivider} />
          <View style={styles.trustItem}>
            <Syringe size={18} color={colors.primary} strokeWidth={2} />
            <Text style={styles.trustLabel}>Full vaccination programs</Text>
          </View>
        </Animated.View>

        {/* ───────────── SERVICES ───────────── */}
        <View style={styles.section}>
          <Animated.View style={{ opacity: fadeServicesHead }}>
            <Text style={styles.sectionEyebrow}>What we offer</Text>
            <Text style={styles.sectionTitle}>Care for every stage</Text>
            <Text style={styles.sectionSub}>
              Five core services, delivered by the same clinic — from a routine check-up to
              emergency overnight care.
            </Text>
          </Animated.View>

          <View style={styles.servicesList}>
            {SERVICES.map((item, i) => {
              const { Icon } = item;
              return (
                <Animated.View
                  key={item.id}
                  style={{
                    opacity: serviceAnims[i],
                    transform: [
                      {
                        translateY: serviceAnims[i].interpolate({
                          inputRange: [0, 1],
                          outputRange: [14, 0],
                        }),
                      },
                    ],
                  }}
                >
                  <TouchableOpacity
                    style={styles.serviceCard}
                    onPress={() => router.push('/services')}
                    activeOpacity={0.8}
                  >
                    <View style={styles.serviceIconTile}>
                      <Icon size={20} color={colors.primary} strokeWidth={2} />
                    </View>
                    <View style={styles.serviceInfo}>
                      <Text style={styles.serviceName}>{item.title}</Text>
                      <Text style={styles.serviceBlurb}>{item.blurb}</Text>
                    </View>
                    <ArrowRight size={16} color={colors.mutedFg} />
                  </TouchableOpacity>
                </Animated.View>
              );
            })}
          </View>

          <TouchableOpacity
            style={styles.seeAllBtn}
            onPress={() => router.push('/services')}
            activeOpacity={0.7}
          >
            <Text style={styles.seeAllText}>View full service details</Text>
            <ArrowRight size={15} color={colors.primary} />
          </TouchableOpacity>
        </View>

        {/* ───────────── APP DEMO ───────────── */}
        <Animated.View style={[styles.demoSection, { opacity: fadeDemo }]}>
          <Text style={styles.sectionEyebrow}>The Pet Royale app</Text>
          <Text style={styles.sectionTitle}>Manage it all from your pocket</Text>
          <Text style={styles.sectionSub}>
            Book appointments, track vaccination schedules, and check in on your pets records —
            without a phone call.
          </Text>

          <View style={styles.demoRow}>
            {/* Phone mock */}
            <View style={styles.phoneShell}>
              <View style={styles.phoneNotch} />
              <View style={styles.phoneScreen}>
                {DEMO_TABS.map((tab, i) => (
                  <Animated.View
                    key={tab.key}
                    style={[styles.demoScreenLayer, { opacity: demoOpacities[i] }]}
                    pointerEvents={i === demoIndex ? 'auto' : 'none'}
                  >
                    {tab.key === 'home' && (
                      <View style={styles.demoHome}>
                        <Text style={styles.demoGreeting}>Good morning</Text>
                        <Text style={styles.demoGreetingName}>Alex</Text>
                        <View style={styles.demoTileGrid}>
                          {[
                            { label: 'Book Visit', Icon: CalendarCheck },
                            { label: 'My Pets', Icon: PawPrint },
                            { label: 'Records', Icon: ClipboardList },
                            { label: 'Emergency', Icon: ShieldAlert },
                          ].map((t) => (
                            <View key={t.label} style={styles.demoTile}>
                              <t.Icon size={16} color={colors.primary} strokeWidth={2} />
                              <Text style={styles.demoTileLabel}>{t.label}</Text>
                            </View>
                          ))}
                        </View>
                      </View>
                    )}

                    {tab.key === 'appointments' && (
                      <View style={styles.demoAppt}>
                        <Text style={styles.demoApptHeader}>Upcoming</Text>
                        {[
                          { pet: 'Milo', service: 'Vaccination', tone: status.teal },
                          { pet: 'Nala', service: 'Check-up', tone: status.success },
                        ].map((row) => (
                          <View key={row.pet} style={styles.demoApptRow}>
                            <View>
                              <Text style={styles.demoApptPet}>{row.pet}</Text>
                              <Text style={styles.demoApptService}>{row.service}</Text>
                            </View>
                            <View style={[styles.demoPill, { backgroundColor: row.tone.bg }]}>
                              <Text style={[styles.demoPillText, { color: row.tone.fg }]}>
                                Confirmed
                              </Text>
                            </View>
                          </View>
                        ))}
                      </View>
                    )}

                    {tab.key === 'pets' && (
                      <View style={styles.demoPets}>
                        <View style={styles.demoPetCard}>
                          <View style={styles.demoPetAvatar}>
                            <PawPrint size={18} color={colors.primary} strokeWidth={2} />
                          </View>
                          <Text style={styles.demoPetName}>Milo</Text>
                          <Text style={styles.demoPetBreed}>Golden Retriever</Text>
                          <View style={styles.demoRecordsBtn}>
                            <Text style={styles.demoRecordsBtnText}>View records</Text>
                          </View>
                        </View>
                      </View>
                    )}
                  </Animated.View>
                ))}
              </View>
              <View style={styles.phoneHomeIndicator} />
            </View>

            {/* Real photo + copy */}
            <View style={styles.demoCopy}>
              <Image
                source={{ uri: LIFESTYLE_IMAGE }}
                style={styles.demoPhoto}
                resizeMode="cover"
              />
              <View style={styles.demoBullets}>
                {['Book appointments in seconds', 'Digital vaccination records', 'Real-time status updates'].map(
                  (b) => (
                    <View key={b} style={styles.demoBulletRow}>
                      <Check size={13} color={colors.primary} strokeWidth={3} />
                      <Text style={styles.demoBulletText}>{b}</Text>
                    </View>
                  )
                )}
              </View>
            </View>
          </View>

          <View style={styles.demoDots}>
            {DEMO_TABS.map((tab, i) => (
              <TouchableOpacity key={tab.key} onPress={() => setDemoIndex(i)} activeOpacity={0.7}>
                <View style={[styles.demoDot, i === demoIndex && styles.demoDotActive]} />
              </TouchableOpacity>
            ))}
          </View>
        </Animated.View>

        {/* ───────────── FINAL CTA ───────────── */}
        <Animated.View style={[styles.finalCta, { opacity: fadeCta }]}>
          <Text style={styles.finalCtaTitle}>Give your pet the royal treatment</Text>
          <Text style={styles.finalCtaSub}>
            Create an account and book your first visit in under two minutes.
          </Text>
          <TouchableOpacity
            style={styles.btnPrimaryWide}
            onPress={() => router.push('/register')}
            activeOpacity={0.9}
          >
            <Text style={styles.btnPrimaryLabel}>Create free account</Text>
            <ArrowRight size={18} color={colors.primaryFg} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.push('/signin')} activeOpacity={0.7}>
            <Text style={styles.finalCtaLogin}>
              Already have an account? <Text style={styles.finalCtaLoginBold}>Sign in</Text>
            </Text>
          </TouchableOpacity>

          <View style={styles.footerMark}>
            <View style={styles.dividerRow}>
              <View style={styles.dividerLine} />
              <PawPrint size={13} color={colors.border} />
              <View style={styles.dividerLine} />
            </View>
            <Text style={styles.footerTagline}>We care for you and your pets</Text>
          </View>
        </Animated.View>
      </Animated.ScrollView>
    </View>
  );
}

const HERO_HEIGHT = 560;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scrollContent: { paddingBottom: space.xxxl },

  /* Hero */
  heroWrap: {
    height: HERO_HEIGHT,
    overflow: 'hidden',
    borderBottomLeftRadius: radius.card,
    borderBottomRightRadius: radius.card,
    backgroundColor: colors.foreground,
  },
  heroImage: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: SCREEN_W,
    height: HERO_HEIGHT + 120,
  },
  heroHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: space.xxl,
    paddingTop: 56,
  },
  wordmarkRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  markTile: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: colors.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  markBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 13,
    height: 13,
    borderRadius: 7,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wordmark: {
    fontFamily: fonts.display,
    fontSize: 17,
    color: colors.white,
    letterSpacing: 0.3,
  },
  loginBtn: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
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
    position: 'absolute',
    bottom: space.xxxl,
    left: 0,
    right: 0,
    paddingHorizontal: space.xxl,
  },
  eyebrow: {
    ...text.eyebrow,
    color: 'rgba(255,255,255,0.55)',
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
    color: colors.secondary,
  },
  heroSub: {
    ...text.body,
    color: 'rgba(255,255,255,0.75)',
    marginTop: space.md,
    maxWidth: 300,
  },
  heroActions: {
    flexDirection: 'row',
    gap: space.md,
    marginTop: space.xxl,
    alignItems: 'center',
  },
  btnPrimary: {
    height: 50,
    borderRadius: radius.lg,
    backgroundColor: colors.primary,
    paddingHorizontal: space.xl,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    ...shadow.primary,
  },
  btnPrimaryLabel: { ...text.bodyBold, color: colors.primaryFg },
  btnGhostHero: {
    height: 50,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
    paddingHorizontal: space.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnGhostHeroLabel: { ...text.bodyBold, color: colors.white },

  /* Trust strip */
  trustStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.xl,
    paddingVertical: space.xl,
  },
  trustItem: { flex: 1, alignItems: 'center', gap: 6 },
  trustLabel: {
    ...text.caption,
    color: colors.mutedFg,
    textAlign: 'center',
  },
  trustDivider: { width: 1, height: 32, backgroundColor: colors.border },

  /* Section shared */
  section: { paddingHorizontal: space.xxl, paddingTop: space.xl },
  sectionEyebrow: { ...text.eyebrow, color: colors.primary, marginBottom: space.sm },
  sectionTitle: {
    fontFamily: fonts.display,
    fontSize: 28,
    letterSpacing: -0.9,
    color: colors.foreground,
  },
  sectionSub: {
    ...text.body,
    color: colors.mutedFg,
    marginTop: space.sm,
    maxWidth: 320,
  },

  /* Services */
  servicesList: { marginTop: space.xl, gap: space.md },
  serviceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.lg,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radius.lg,
    padding: space.lg,
    ...shadow.card,
  },
  serviceIconTile: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  serviceInfo: { flex: 1 },
  serviceName: { ...text.heading, color: colors.foreground },
  serviceBlurb: { ...text.small, color: colors.mutedFg, marginTop: 2 },
  seeAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: space.lg,
    paddingVertical: space.sm,
  },
  seeAllText: { ...text.smallBold, color: colors.primary },

  /* App demo */
  demoSection: { paddingHorizontal: space.xxl, paddingTop: space.xxxl },
  demoRow: {
    flexDirection: 'row',
    gap: space.xl,
    marginTop: space.xxl,
    alignItems: 'flex-start',
  },
  phoneShell: {
    width: 148,
    height: 300,
    backgroundColor: '#20242B',
    borderRadius: 26,
    padding: 8,
    alignItems: 'center',
  },
  phoneNotch: {
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#3A3F47',
    marginBottom: 6,
  },
  phoneScreen: {
    flex: 1,
    width: '100%',
    backgroundColor: colors.card,
    borderRadius: 18,
    overflow: 'hidden',
  },
  phoneHomeIndicator: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#3A3F47',
    marginTop: 6,
  },
  demoScreenLayer: {
    ...StyleSheet.absoluteFillObject,
    padding: space.md,
  },

  demoHome: { flex: 1 },
  demoGreeting: { ...text.caption, color: colors.mutedFg },
  demoGreetingName: {
    fontFamily: fonts.display,
    fontSize: 18,
    color: colors.foreground,
    marginBottom: space.md,
  },
  demoTileGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  demoTile: {
    width: '47%',
    backgroundColor: colors.secondary,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    gap: 4,
  },
  demoTileLabel: { fontSize: 9, fontFamily: fonts.bodyMedium, color: colors.foreground },

  demoAppt: { flex: 1 },
  demoApptHeader: { ...text.smallBold, color: colors.foreground, marginBottom: space.sm },
  demoApptRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.background,
    borderRadius: 10,
    padding: space.sm,
    marginBottom: 6,
  },
  demoApptPet: { fontSize: 11, fontFamily: fonts.bodyBold, color: colors.foreground },
  demoApptService: { fontSize: 10, color: colors.mutedFg },
  demoPill: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 8 },
  demoPillText: { fontSize: 9, fontFamily: fonts.bodyMedium },

  demoPets: { flex: 1, justifyContent: 'center' },
  demoPetCard: {
    backgroundColor: colors.background,
    borderRadius: 12,
    padding: space.md,
    alignItems: 'center',
  },
  demoPetAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.secondary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  demoPetName: { fontFamily: fonts.bodyBold, fontSize: 12, color: colors.foreground },
  demoPetBreed: { fontSize: 10, color: colors.mutedFg, marginTop: 1 },
  demoRecordsBtn: {
    marginTop: space.sm,
    backgroundColor: colors.primary,
    paddingHorizontal: space.md,
    paddingVertical: 6,
    borderRadius: 8,
  },
  demoRecordsBtnText: { fontSize: 10, fontFamily: fonts.bodyBold, color: colors.primaryFg },

  demoCopy: { flex: 1, gap: space.lg },
  demoPhoto: {
    width: '100%',
    height: 140,
    borderRadius: radius.lg,
  },
  demoBullets: { gap: 8 },
  demoBulletRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  demoBulletText: { ...text.small, color: colors.foreground },

  demoDots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    marginTop: space.xl,
  },
  demoDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.border,
  },
  demoDotActive: {
    width: 18,
    backgroundColor: colors.primary,
  },

  /* Final CTA */
  finalCta: {
    paddingHorizontal: space.xxl,
    paddingTop: space.xxxl * 1.3,
    alignItems: 'center',
  },
  finalCtaTitle: {
    fontFamily: fonts.display,
    fontSize: 26,
    letterSpacing: -0.8,
    color: colors.foreground,
    textAlign: 'center',
  },
  finalCtaSub: {
    ...text.body,
    color: colors.mutedFg,
    textAlign: 'center',
    marginTop: space.sm,
    maxWidth: 280,
  },
  btnPrimaryWide: {
    height: 52,
    borderRadius: radius.lg,
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    paddingHorizontal: space.xxl,
    marginTop: space.xl,
    width: '100%',
    ...shadow.primary,
  },
  finalCtaLogin: {
    ...text.body,
    color: colors.mutedFg,
    marginTop: space.lg,
  },
  finalCtaLoginBold: { ...text.bodyBold, color: colors.primary },

  footerMark: { marginTop: space.xxxl, alignItems: 'center', gap: space.md, width: '100%' },
  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, width: '100%' },
  dividerLine: { flex: 1, height: 1, backgroundColor: colors.border },
  footerTagline: {
    fontFamily: fonts.displayRegular,
    fontSize: 13,
    fontStyle: 'italic',
    color: colors.mutedFg,
  },
});