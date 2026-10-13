import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  Image,
  ImageSourcePropType,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  ScrollView,
  StatusBar,
  useWindowDimensions,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, text, fonts, space } from '../constants/theme';
import BrandMark from '../components/BrandMark';
import Rings from '../components/Rings';
import { markIntroSeen } from '../utils/firstLaunch';
import { SERVICES } from '../constants/services';

/* Pixel art for each slide. Files live in assets/onboarding/ (with @2x and @3x versions beside each one). */
const ART = {
  account: require('../assets/onboarding/onboarding-1-create-account.png'),
  pet: require('../assets/onboarding/onboarding-2-register-pet.png'),
  visit: require('../assets/onboarding/onboarding-3-book-visit.png'),
  track: require('../assets/onboarding/onboarding-4-track-payments.png'),
  shop: require('../assets/onboarding/onboarding-5-pet-essentials.png'),
  services: require('../assets/onboarding/onboarding-6-clinic-services.png'),
};

const STEPS: { art: ImageSourcePropType; title: string; body: string }[] = [
  { art: ART.account, title: 'Create your account', body: 'Sign up with your details so the clinic knows who you are.' },
  { art: ART.pet, title: 'Register your pet', body: "Add your pet's details once, ready for every visit." },
  { art: ART.visit, title: 'Book a visit', body: "Send a request for a day and time. We'll send you a notification when the clinic confirms it." },
  { art: ART.track, title: 'Track visits and payments', body: 'Get a notification when your visit is completed, and see your appointment and payment history anytime.' },
  { art: ART.shop, title: 'Browse pet essentials', body: 'See the products the clinic offers and what is in stock.' },
];

type Slide = { kind: 'step'; art: ImageSourcePropType; title: string; body: string } | { kind: 'services' };
const SLIDES: Slide[] = [
  ...STEPS.map((st) => ({ kind: 'step' as const, ...st })),
  { kind: 'services' as const },
];

export default function IntroScreen() {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const statusBarHeight = Math.max(insets.top, StatusBar.currentHeight ?? 0);
  const listRef = useRef<FlatList>(null);
  const [index, setIndex] = useState(0);
  const last = index === SLIDES.length - 1;

  const finish = async () => {
    await markIntroSeen();
    router.replace('/' as any); // landing / welcome screen
  };

  const onEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    setIndex(Math.round(e.nativeEvent.contentOffset.x / width));
  };

  const next = () => {
    if (last) return finish();
    listRef.current?.scrollToIndex({ index: index + 1, animated: true });
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      <FlatList
        ref={listRef}
        data={SLIDES}
        keyExtractor={(s) => (s.kind === 'step' ? s.title : 'services')}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onEnd}
        getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
        renderItem={({ item, index: i }) =>
          item.kind === 'step' ? (
            <View style={{ width, height }}>
              <View style={styles.art}>
                <Rings style={styles.rings} />
                <Image
                  source={item.art}
                  style={styles.pixel}
                  resizeMode="contain"
                  fadeDuration={0}
                  accessibilityIgnoresInvertColors
                />
              </View>
              <View style={styles.txt}>
                <Text style={styles.eyebrow}>
                  Step {i + 1} of {STEPS.length}
                </Text>
                <Text style={styles.h2} maxFontSizeMultiplier={1.15}>{item.title}</Text>
                <Text style={styles.p} maxFontSizeMultiplier={1.3}>{item.body}</Text>
              </View>
            </View>
          ) : (
            <View style={{ width, height }}>
              <View style={[styles.art, styles.artShort]}>
                <Rings style={styles.rings} />
                <Image
                  source={ART.services}
                  style={styles.pixel}
                  resizeMode="contain"
                  fadeDuration={0}
                  accessibilityIgnoresInvertColors
                />
              </View>
              <View style={[styles.txt, styles.txtLong]}>
                <Text style={styles.eyebrow}>Our services</Text>
                <Text style={styles.h2} maxFontSizeMultiplier={1.15}>What the clinic offers</Text>
                <ScrollView
                  style={styles.svcsScroll}
                  contentContainerStyle={styles.svcs}
                  showsVerticalScrollIndicator={false}
                  nestedScrollEnabled
                >
                  {SERVICES.map(({ id, Icon, title }) => (
                    <View key={id} style={styles.svc}>
                      <View style={styles.svcTile}>
                        <Icon size={20} color={colors.primary} strokeWidth={2} />
                      </View>
                      <Text style={styles.svcLabel}>{title}</Text>
                    </View>
                  ))}
                </ScrollView>
              </View>
            </View>
          )
        }
      />

      <View style={[styles.logo, { top: statusBarHeight + space.md }]}>
        <BrandMark height={30} color={colors.accent} />
      </View>
      <TouchableOpacity
        style={[styles.skip, { top: statusBarHeight + space.sm }]}
        onPress={finish}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel="Skip intro"
      >
        <Text style={styles.skipLabel}>Skip</Text>
      </TouchableOpacity>

      <View style={[styles.bar, { paddingBottom: 22 + insets.bottom }]}>
        <View style={styles.dots}>
          {SLIDES.map((_, i) => (
            <View key={i} style={[styles.dot, i === index && styles.dotOn]} />
          ))}
        </View>
        <TouchableOpacity
          style={styles.btn}
          onPress={next}
          activeOpacity={0.9}
          accessibilityRole="button"
          accessibilityLabel={last ? 'Get started' : 'Continue'}
        >
          <Text style={styles.btnLabel}>{last ? 'Get started' : 'Continue'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },

  art: {
    flex: 52,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 56,
    backgroundColor: colors.primary,
  },
  rings: { position: 'absolute', right: -70, top: -60 },
  /* Pixel art sits straight on the navy: no tile, no halo.
     160 x 130 is the image's 1x size (5px per art pixel), so the pixels stay sharp. */
  pixel: { width: 160, height: 130 },

  artShort: { flex: 30 },
  txt: { flex: 48, paddingTop: 26, paddingHorizontal: 24 },
  txtLong: { flex: 70 },
  svcsScroll: { marginTop: 16 },
  svcs: { gap: 8, paddingBottom: 160 },
  svc: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  /* Same look as the icon circles on the Profile screen. */
  svcTile: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.muted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  svcLabel: { ...text.smallBold, color: colors.foreground, flex: 1 },
  eyebrow: { ...text.eyebrow, color: colors.mutedFg },
  h2: {
    fontFamily: fonts.display,
    fontSize: 30,
    lineHeight: 34,
    letterSpacing: -0.5,
    color: colors.foreground,
    marginTop: 8,
  },
  p: { ...text.body, color: colors.mutedFg, marginTop: 10, maxWidth: 300 },

  logo: { position: 'absolute', left: 22 },
  skip: {
    position: 'absolute',
    right: 18,
    height: 40,
    paddingHorizontal: 16,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.5)',
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  skipLabel: { ...text.bodyBold, fontSize: 14, color: colors.white },

  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: 14,
    paddingHorizontal: 22,
    gap: 16,
    backgroundColor: colors.background,
  },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 6 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.border },
  dotOn: { width: 22, backgroundColor: colors.accent },
  btn: {
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
  btnLabel: { ...text.bodyBold, color: colors.white },
});
