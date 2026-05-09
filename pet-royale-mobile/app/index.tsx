import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  StatusBar,
} from 'react-native';
import { router } from 'expo-router';

const NAVY = '#12175e';
const GOLD = '#c9a227';
const GOLD_DIM = 'rgba(201,162,39,0.5)';
const WHITE_DIM = 'rgba(255,255,255,0.6)';
const WHITE_FAINT = 'rgba(255,255,255,0.2)';

export default function LandingScreen() {
  const fadeTop = useRef(new Animated.Value(0)).current;
  const fadeHero = useRef(new Animated.Value(0)).current;
  const slideHero = useRef(new Animated.Value(24)).current;
  const fadeBtns = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.timing(fadeTop, { toValue: 1, duration: 400, useNativeDriver: true }),
      Animated.parallel([
        Animated.timing(fadeHero, { toValue: 1, duration: 600, useNativeDriver: true }),
        Animated.timing(slideHero, { toValue: 0, duration: 600, useNativeDriver: true }),
      ]),
      Animated.timing(fadeBtns, { toValue: 1, duration: 400, useNativeDriver: true }),
    ]).start();
  }, []);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={NAVY} />

      {/* Gold top stripe */}
      <View style={styles.stripe} />

      {/* Header */}
      <Animated.View style={[styles.header, { opacity: fadeTop }]}>
        <View style={styles.wordmarkRow}>
          <View style={styles.crownBox}>
            <Text style={styles.crownChar}>♛</Text>
          </View>
          <Text style={styles.wordmark}>Pet Royale'</Text>
        </View>
        <TouchableOpacity
          style={styles.loginBtn}
          onPress={() => router.push('/signIn')}
          activeOpacity={0.7}
        >
          <Text style={styles.loginBtnText}>Login</Text>
        </TouchableOpacity>
      </Animated.View>

      {/* Hero */}
      <Animated.View
        style={[
          styles.hero,
          { opacity: fadeHero, transform: [{ translateY: slideHero }] },
        ]}
      >
        <Text style={styles.eyebrow}>Clinic & Veterinary Services</Text>
        <Text style={styles.title}>
          {'Where\nevery\npet is\n'}
          <Text style={styles.titleItalic}>royalty.</Text>
        </Text>
        <Text style={styles.sub}>
            {'We Care For You\n'} 
            <Text style = {styles.sub}>and Your Pets</Text>
        </Text>
        <View style={styles.rule} />
        <Text style={styles.desc}>
          Professional veterinary care trusted by families who treat their pets like family.
        </Text>
      </Animated.View>

      {/* Buttons */}
      <Animated.View style={[styles.actions, { opacity: fadeBtns }]}>

        {/* Get Started */}
        <TouchableOpacity
          style={styles.btnGetStarted}
          onPress={() => router.push('/register')}
          activeOpacity={0.85}
        >
          <View style={styles.btnGetStartedLeft}>
            <Text style={styles.btnGetStartedLabel}>Get Started</Text>
            <Text style={styles.btnGetStartedHint}>Create your account</Text>
          </View>
          <View style={styles.btnArrowBox}>
            <Text style={styles.btnArrowBoxText}>→</Text>
          </View>
        </TouchableOpacity>

        {/* Our Services */}
        <TouchableOpacity
          style={styles.btnServices}
          onPress={() => router.push('/services')}
          activeOpacity={0.7}
        >
          <Text style={styles.btnServicesLabel}>Our Services</Text>
          <View style={styles.btnServicesRight}>
            <View style={styles.servicesBadge}>
              <Text style={styles.servicesBadgeText}>5 available</Text>
            </View>
            <Text style={styles.btnServicesArrow}>→</Text>
          </View>
        </TouchableOpacity>

      </Animated.View>

      {/* Bottom decoration */}
      <View style={styles.bottom}>
        <Text style={styles.bottomTagline}>{'Veterinary care\nyou can trust.'}</Text>
        <View style={styles.dotGrid}>
          {Array.from({ length: 12 }).map((_, i) => (
            <View key={i} style={styles.dot} />
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: NAVY,
  },
  stripe: {
    height: 5,
    backgroundColor: GOLD,
  },

  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 22,
    paddingTop: 24,
  },
  wordmarkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  crownBox: {
    width: 28,
    height: 28,
    backgroundColor: GOLD,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  crownChar: {
    fontSize: 14,
    color: NAVY,
  },
  wordmark: {
    fontFamily: 'serif',
    fontSize: 15,
    fontWeight: '600',
    color: GOLD,
    letterSpacing: 1.5,
  },
  loginBtn: {
    borderWidth: 1,
    borderColor: GOLD_DIM,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 8,
  },
  loginBtnText: {
    fontSize: 15,
    fontWeight: '500',
    color: GOLD,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },

  // Hero
  hero: {
    paddingHorizontal: 22,
    paddingTop: 32,
  },
  eyebrow: {
    fontSize: 15,
    fontWeight: '500',
    letterSpacing: 3,
    color: 'rgba(255,255,255,0.3)',
    textTransform: 'uppercase',
    marginBottom: 14,
  },
  title: {
    fontSize: 52,
    fontWeight: '700',
    lineHeight: 50,
    color: '#ffffff',
    fontFamily: 'serif',
  },
  titleItalic: {
    color: GOLD,
    fontStyle: 'italic',
    fontFamily: 'serif',
  },
  sub: {
    fontSize: 15,
    fontStyle: 'italic',
    color: 'rgba(255,255,255,0.3)',
    marginTop: 12,
    lineHeight: 20,
    fontFamily: 'serif',
  },
  rule: {
    width: 32,
    height: 1,
    backgroundColor: GOLD,
    marginTop: 20,
    marginBottom: 16,
  },
  desc: {
    fontSize: 15,
    fontWeight: '300',
    color: 'rgba(255,255,255,0.4)',
    lineHeight: 18,
    maxWidth: 220,
  },

  // Buttons
  actions: {
    paddingHorizontal: 22,
    paddingTop: 32,
    gap: 10,
  },
  btnGetStarted: {
    backgroundColor: GOLD,
    height: 54,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 18,
    borderRadius: 10,
  },

  btnGetStartedLeft: {
    gap: 2,
  },
  btnGetStartedLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: NAVY,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  btnGetStartedHint: {
    fontSize: 12,
    fontStyle: 'italic',
    color: 'rgba(13,16,64,0.5)',
    fontFamily: 'serif',
  },
  btnArrowBox: {
    width: 32,
    height: 32,
    borderWidth: 1.5,
    borderColor: 'rgba(13,16,64,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
  },
  btnArrowBoxText: {
    fontSize: 17,
    color: NAVY,
    fontFamily: 'serif',
  },
  btnServices: {
    borderWidth: 1,
    borderColor: WHITE_FAINT,
    height: 54,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 18,
    backgroundColor: 'transparent',
    borderRadius: 10,
  },
  btnServicesLabel: {
    fontSize: 14,
    fontWeight: '400',
    color: WHITE_DIM,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  btnServicesRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  servicesBadge: {
    borderWidth: 1,
    borderColor: 'rgba(201,162,39,0.35)',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 12,
  },
  servicesBadgeText: {
    fontSize: 13,
    color: 'rgba(201,162,39,0.7)',
    letterSpacing: 1,
  },
  btnServicesArrow: {
    fontSize: 17,
    color: 'rgba(255,255,255,0.3)',
    fontFamily: 'serif',
  },

  // Bottom
  bottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 22,
    paddingBottom: 36,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  bottomTagline: {
    fontSize: 15,
    fontStyle: 'italic',
    color: 'rgba(255,255,255,0.3)',
    lineHeight: 15,
    fontFamily: 'serif',
  },
  dotGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    width: 50,
    gap: 5,
    opacity: 0.12,
  },
  dot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: GOLD,
  },
});
