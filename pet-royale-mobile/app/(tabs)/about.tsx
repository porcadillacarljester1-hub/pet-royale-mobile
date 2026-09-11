import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Constants from 'expo-constants';

const TEAL = '#0D9488';
const TEAL_LIGHT = '#CCFBF1';
const BORDER = '#E5E7EB';
const SUB = '#6B7280';
const INK = '#111827';
const BG = '#F4F7FB';

export default function AboutScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const appVersion = Constants.expoConfig?.version || '1.0.0';

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={22} color={INK} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>About Pet Royale</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.content}>
          {/* ── Brand block ── */}
          <View style={styles.brandBlock}>
            <View style={styles.brandIconWrap}>
              <Ionicons name="paw" size={30} color="#fff" />
            </View>
            <Text style={styles.brandName}>Pet Royale</Text>
            <Text style={styles.brandTagline}>"We Care For You and Your Pets"</Text>
          </View>

          {/* ── About Us ── */}
          <Text style={styles.sectionTitle}>About Us</Text>
          <View style={styles.card}>
            <View style={styles.aboutPad}>
              <Text style={styles.aboutText}>
                Pet Royale Clinic and Veterinary Services provides compassionate, professional care for your pets — from routine check-ups and vaccinations to grooming and emergency care.
              </Text>
            </View>
          </View>

          {/* ── Clinic Information ── */}
          <Text style={styles.sectionTitle}>Clinic Information</Text>
          <View style={styles.card}>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Address</Text>
              <Text style={styles.infoValue}>Calbayog City, Eastern Samar</Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Phone</Text>
              <Text style={styles.infoValue}>+63 950 279 1505</Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Clinic Hours</Text>
              <Text style={styles.infoValue}>Mon – Sat: 8:30 AM – 7:00 PM</Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Grooming Hours</Text>
              <Text style={styles.infoValue}>Tue – Sun: 8:30 AM – 6:00 PM</Text>
            </View>
          </View>

          {/* ── Legal ── */}
          <Text style={styles.sectionTitle}>Legal</Text>
          <View style={styles.card}>
            <TouchableOpacity style={styles.row} activeOpacity={0.7}>
              <Text style={styles.rowLabel}>Terms of Service</Text>
              <Ionicons name="chevron-forward" size={16} color="#D1D5DB" />
            </TouchableOpacity>
            <View style={styles.divider} />
            <TouchableOpacity style={styles.row} activeOpacity={0.7}>
              <Text style={styles.rowLabel}>Privacy Policy</Text>
              <Ionicons name="chevron-forward" size={16} color="#D1D5DB" />
            </TouchableOpacity>
          </View>

          {/* ── App Info ── */}
          <Text style={styles.sectionTitle}>App Info</Text>
          <View style={styles.card}>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Version</Text>
              <Text style={styles.infoValue}>{appVersion}</Text>
            </View>
          </View>

          <View style={{ height: 32 }} />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#fff', paddingHorizontal: 12, paddingBottom: 14,
    borderBottomWidth: 1, borderBottomColor: BORDER,
  },
  backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: BG, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 16, fontWeight: '800', color: INK },
  content: { padding: 16 },

  brandBlock: { alignItems: 'center', paddingVertical: 20 },
  brandIconWrap: { width: 64, height: 64, borderRadius: 32, backgroundColor: TEAL, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  brandName: { fontSize: 20, fontWeight: '800', color: INK, marginBottom: 4 },
  brandTagline: { fontSize: 12.5, fontStyle: 'italic', color: SUB },

  sectionTitle: { fontSize: 12.5, fontWeight: '800', color: SUB, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 8, marginTop: 18 },
  card: {
    backgroundColor: '#fff', borderRadius: 14,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 5, elevation: 1,
  },
  aboutPad: { padding: 16 },
  aboutText: { fontSize: 13, color: SUB, lineHeight: 20 },

  infoRow: { paddingHorizontal: 14, paddingVertical: 12 },
  infoLabel: { fontSize: 10.5, color: SUB, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 3 },
  infoValue: { fontSize: 13.5, color: INK, fontWeight: '600' },
  divider: { height: 1, backgroundColor: BORDER, marginLeft: 14 },

  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 14 },
  rowLabel: { fontSize: 13.5, fontWeight: '600', color: INK },
});