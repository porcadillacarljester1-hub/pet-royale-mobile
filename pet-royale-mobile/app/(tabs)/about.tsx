import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const NAV = '#1a237e';
const GOLD = '#f5c518';

export default function AboutScreen() {
  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerBrand}>
          <View style={styles.crownBox}>
            <Ionicons name="trophy" size={18} color={GOLD} />
          </View>
          <View>
            <Text style={styles.brandName}>Pet Royale'</Text>
            <Text style={styles.brandSub}>CLINIC & VETERINARY</Text>
          </View>
        </View>
      </View>

      {/* About Card */}
      <View style={styles.card}>
        <View style={styles.cardGlow} pointerEvents="none" />
        <Text style={styles.cardTitle}>About Us</Text>
        <View style={styles.divider} />
        <Text style={styles.cardText}>
          Pet Royale' Clinic and Veterinary Services is dedicated to providing compassionate, high-quality care for your pets. Partnered with VetMate Farma Corporation, we offer a full range of veterinary services to keep your animals healthy and happy.
        </Text>
        <Text style={styles.cardTagline}>"We Care For You and Your Pets"</Text>
      </View>

      {/* Why Choose Us */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Why Choose Us</Text>
          <View style={styles.sectionLine} />
        </View>
        <View style={styles.whyGrid}>
          {[
            { icon: 'ribbon'           as const, title: 'Licensed Vets',      desc: 'Professionally trained and certified veterinarians.' },
            { icon: 'heart-circle'     as const, title: 'Compassionate Care', desc: 'We treat every pet like our own.' },
            { icon: 'time'             as const, title: 'Flexible Hours',     desc: 'Mon–Sat clinic, Tue–Sun grooming.' },
            { icon: 'shield-checkmark' as const, title: 'Safe & Clean',       desc: 'Hygienic clinic environment at all times.' },
          ].map((item, i) => (
            <View key={i} style={styles.whyCard}>
              <View style={styles.whyIconWrap}>
                <Ionicons name={item.icon} size={20} color={GOLD} />
              </View>
              <Text style={styles.whyTitle}>{item.title}</Text>
              <Text style={styles.whyDesc}>{item.desc}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* Clinic Info */}
      <View style={styles.clinicCard}>
        <View style={styles.clinicGlow} pointerEvents="none" />

        <View style={styles.clinicTitleRow}>
          <Ionicons name="business" size={16} color={GOLD} />
          <Text style={styles.clinicTitle}>Clinic Information</Text>
        </View>

        <View style={styles.clinicDivider} />

        <View style={styles.clinicRow}>
          <Ionicons name="location" size={14} color={GOLD} />
          <Text style={styles.clinicText}>Calbayog City, Eastern Samar</Text>
        </View>
        <View style={styles.clinicRow}>
          <Ionicons name="call" size={14} color={GOLD} />
          <Text style={styles.clinicText}>+63 950 279 1505</Text>
        </View>

        <View style={styles.clinicDivider} />

        <Text style={styles.clinicSectionLabel}>Operating Hours</Text>
        <View style={styles.clinicRow}>
          <Ionicons name="time" size={14} color={GOLD} />
          <Text style={styles.clinicText}>Mon – Sat: 8:30 AM – 7:00 PM</Text>
        </View>

        <View style={styles.clinicDivider} />

        <Text style={styles.clinicSectionLabel}>Grooming Schedule</Text>
        <View style={styles.clinicRow}>
          <Ionicons name="cut" size={14} color={GOLD} />
          <Text style={styles.clinicText}>Tue – Sun: 8:30 AM – 6:00 PM</Text>
        </View>
      </View>

      <View style={{ height: 24 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f0f2f8',
  },
  header: {
    backgroundColor: NAV,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 14,
  },
  headerBrand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  crownBox: {
    width: 36,
    height: 36,
    borderRadius: 9,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandName: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: -0.2,
    lineHeight: 17,
  },
  brandSub: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: 8.5,
    fontWeight: '600',
    letterSpacing: 1.2,
    marginTop: 1,
  },
  card: {
    backgroundColor: NAV,
    margin: 14,
    borderRadius: 16,
    padding: 20,
    overflow: 'hidden',
    position: 'relative',
  },
  cardGlow: {
    position: 'absolute',
    bottom: -50,
    left: -50,
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: GOLD,
    opacity: 0.05,
  },
  cardTitle: {
    color: GOLD,
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 4,
    letterSpacing: -0.2,
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginVertical: 12,
  },
  cardText: {
    color: 'rgba(255,255,255,0.82)',
    fontSize: 13,
    lineHeight: 20,
    marginBottom: 12,
  },
  cardTagline: {
    color: 'rgba(245,197,24,0.7)',
    fontSize: 12,
    fontStyle: 'italic',
  },
  section: {
    paddingHorizontal: 14,
    marginTop: 4,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: NAV,
    letterSpacing: -0.2,
  },
  sectionLine: {
    flex: 1,
    height: 1.5,
    backgroundColor: '#dde3ef',
    borderRadius: 2,
  },
  whyGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  whyCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    width: '48%',
    shadowColor: NAV,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 6,
    elevation: 3,
  },
  whyIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 9,
    backgroundColor: NAV,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  whyTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: NAV,
    marginBottom: 3,
  },
  whyDesc: {
    fontSize: 10.5,
    color: '#6b7a99',
    lineHeight: 15,
  },
  clinicCard: {
    backgroundColor: NAV,
    marginHorizontal: 14,
    marginTop: 16,
    borderRadius: 16,
    padding: 20,
    overflow: 'hidden',
    position: 'relative',
  },
  clinicGlow: {
    position: 'absolute',
    top: -40,
    right: -40,
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: GOLD,
    opacity: 0.05,
  },
  clinicTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  clinicTitle: {
    color: GOLD,
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  clinicSectionLabel: {
    color: 'rgba(147,197,253,0.9)',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.3,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  clinicRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  clinicText: {
    color: 'rgba(255,255,255,0.88)',
    fontSize: 13,
  },
  clinicDivider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginVertical: 10,
  },
});
