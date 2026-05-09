import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Animated,
  StatusBar,
} from 'react-native';
import { router } from 'expo-router';

const NAVY = '#12175e';
const GOLD = '#c9a227';
const CREAM = '#f5f0e8';
const CREAM_BORDER = '#e8e0cc';
const TAUPE = '#8a7d5a';

const SERVICES = [
  {
    id: '01',
    title: 'Veterinary Check-ups',
    blurb: 'Full physical assessments, diagnostics & expert consultations.',
  },
  {
    id: '02',
    title: 'Vaccination & Deworming',
    blurb: 'Scheduled vaccines and deworming programs for every life stage.',
  },
  {
    id: '03',
    title: 'Minor & Major Surgeries',
    blurb: 'Routine to complex procedures with skilled surgical care.',
  },
  {
    id: '04',
    title: 'Confinement & Emergency Care',
    blurb: '24/7 emergency response and overnight confinement facilities.',
  },
  {
    id: '05',
    title: 'Grooming',
    blurb: 'Bath, trim, nail care & styling — your pet, looking their best.',
  },
];

export default function ServicesScreen() {
  const fadeHeader = useRef(new Animated.Value(0)).current;
  const itemAnims = useRef(SERVICES.map(() => new Animated.Value(0))).current;

  useEffect(() => {
    Animated.timing(fadeHeader, { toValue: 1, duration: 400, useNativeDriver: true }).start();
    SERVICES.forEach((_, i) => {
      Animated.timing(itemAnims[i], {
        toValue: 1,
        duration: 350,
        delay: 150 + i * 80,
        useNativeDriver: true,
      }).start();
    });
  }, []);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={CREAM} />

      {/* Header */}
      <Animated.View style={[styles.header, { opacity: fadeHeader }]}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => router.back()}
          activeOpacity={0.7}
        >
          <Text style={styles.backArrow}>←</Text>
          <Text style={styles.backLabel}>Back</Text>
        </TouchableOpacity>

        <View style={styles.headerTitles}>
          <Text style={styles.headerTitle}>
            Our{' '}
            <Text style={styles.headerTitleItalic}>Services</Text>
          </Text>
          <Text style={styles.headerSub}>Pet Royale' Clinic & Veterinary</Text>
        </View>

        {/* Crown badge */}
        <View style={styles.crownBadge}>
          <Text style={styles.crownChar}>♛</Text>
        </View>
      </Animated.View>

      {/* Service list */}
      <ScrollView
        style={styles.list}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 120 }}
      >
        {SERVICES.map((item, i) => (
          <Animated.View
            key={item.id}
            style={[
              styles.serviceItem,
              i === SERVICES.length - 1 && styles.serviceItemLast,
              {
                opacity: itemAnims[i],
                transform: [{
                  translateX: itemAnims[i].interpolate({
                    inputRange: [0, 1],
                    outputRange: [-16, 0],
                  }),
                }],
              },
            ]}
          >
            <Text style={styles.serviceNum}>{item.id}</Text>
            <View style={styles.serviceInfo}>
              <Text style={styles.serviceName}>{item.title}</Text>
              <Text style={styles.serviceBlurb}>{item.blurb}</Text>
            </View>
            <Text style={styles.serviceArrow}>→</Text>
          </Animated.View>
        ))}
      </ScrollView>

      {/* Footer CTA */}
      <View style={styles.footer}>
        {/* Book Appointment */}
        <TouchableOpacity
          style={styles.btnBook}
          onPress={() => router.push('/register')}
          activeOpacity={0.85}
        >
          <Text style={styles.btnBookLabel}>Book Appointment</Text>
          <View style={styles.btnBookRight}>
            <Text style={styles.btnBookHint}>Get started</Text>
            <View style={styles.btnBookArrowBox}>
              <Text style={styles.btnBookArrowText}>→</Text>
            </View>
          </View>
        </TouchableOpacity>

        {/* Already have account */}
        <TouchableOpacity
          style={styles.btnAlready}
          onPress={() => router.push('/signIn')}
          activeOpacity={0.7}
        >
          <Text style={styles.btnAlreadyText}>Already have an account? </Text>
          <View style={styles.btnAlreadyLoginWrapper}>
            <Text style={styles.btnAlreadyLogin}>Login</Text>
          </View>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: CREAM,
  },

  // Header
  header: {
    paddingHorizontal: 20,
    paddingTop: 52,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: CREAM_BORDER,
    position: 'relative',
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: '#d5c89a',
    paddingHorizontal: 12,
    paddingVertical: 5,
    alignSelf: 'flex-start',
    marginBottom: 18,
    borderRadius: 10,
  },
  backArrow: {
    fontSize: 18,
    color: TAUPE,
    fontFamily: 'serif',
  },
  backLabel: {
    fontSize: 9,
    fontWeight: '500',
    color: TAUPE,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  headerTitles: {
    paddingRight: 48,
  },
  headerTitle: {
    fontSize: 36,
    fontWeight: '700',
    color: NAVY,
    lineHeight: 36,
    fontFamily: 'serif',
  },
  headerTitleItalic: {
    color: GOLD,
    fontStyle: 'italic',
    fontFamily: 'serif',
  },
  headerSub: {
    fontSize: 15,
    fontWeight: '300',
    color: TAUPE,
    marginTop: 6,
    letterSpacing: 0.3,
  },
  crownBadge: {
    position: 'absolute',
    top: 52,
    right: 20,
    width: 36,
    height: 36,
    backgroundColor: NAVY,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  crownChar: {
    fontSize: 16,
    color: GOLD,
  },

  // List
  list: {
    flex: 1,
  },
  serviceItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: CREAM_BORDER,
    gap: 14,
  },
  serviceItemLast: {
    borderBottomWidth: 0,
  },
  serviceNum: {
    fontSize: 22,
    fontWeight: '600',
    color: CREAM_BORDER,
    fontFamily: 'serif',
    width: 24,
    flexShrink: 0,
  },
  serviceInfo: {
    flex: 1,
  },
  serviceName: {
    fontSize: 16,
    fontWeight: '600',
    color: NAVY,
    fontFamily: 'serif',
    lineHeight: 20,
    marginBottom: 4,
  },
  serviceBlurb: {
    fontSize: 15,
    fontWeight: '300',
    color: TAUPE,
    lineHeight: 20,
  },
  serviceArrow: {
    fontSize: 18,
    color: GOLD,
    fontFamily: 'serif',
    flexShrink: 0,
  },

  // Footer
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 32,
    backgroundColor: CREAM,
    borderTopWidth: 1,
    borderTopColor: CREAM_BORDER,
    gap: 8,
  },
  btnBook: {
    backgroundColor: NAVY,
    height: 54,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 18,
    borderRadius: 10,
  },
  btnBookLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ffffff',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  btnBookRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  btnBookHint: {
    fontSize: 14,
    fontStyle: 'italic',
    color: 'rgba(255,255,255,0.4)',
    fontFamily: 'serif',
  },
  btnBookArrowBox: {
    width: 28,
    height: 28,
    backgroundColor: GOLD,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  btnBookArrowText: {
    fontSize: 18,
    color: NAVY,
    fontFamily: 'serif',
  },
  btnAlready: {
    height: 36,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  btnAlreadyText: {
    fontSize: 15,
    fontWeight: '300',
    color: TAUPE,
  },
  btnAlreadyLoginWrapper: {
    borderBottomWidth: 1,
    borderBottomColor: GOLD,
  },
  btnAlreadyLogin: {
    fontSize: 15,
    fontWeight: '600',
    color: NAVY,
  },
});
