import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Modal, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

const NAV = '#1a237e';
const GOLD = '#f5c518';

export default function HomeScreen() {
  const router = useRouter();
  const [userName, setUserName] = useState('');
  const [greeting, setGreeting] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        setUserName(user.user_metadata?.full_name || user.email || 'Pet Owner');
      }
    });
    const hour = new Date().getHours();
    if (hour < 12) setGreeting('Good morning');
    else if (hour < 18) setGreeting('Good afternoon');
    else setGreeting('Good evening');
  }, []);

  const services = [
    { icon: 'heart' as const,           label: 'Veterinary\nCheck-ups',        color: '#e53935' },
    { icon: 'medical' as const,          label: 'Vaccination &\nDeworming',     color: '#2e7d32' },
    { icon: 'cut' as const,              label: 'Grooming',                      color: '#6a1b9a' },
    { icon: 'bandage' as const,          label: 'Minor & Major\nSurgeries',     color: '#e65100' },
    { icon: 'shield-checkmark' as const, label: 'Confinement &\nEmergency',     color: '#00838f' },
  ];

  const tips = [
    'Regular deworming every 3 months keeps your pet healthy.',
    'Keep fresh water available for your pet at all times.',
    'Daily exercise improves your pet\'s mood and lifespan.',
    'Annual vaccinations protect against life-threatening diseases.',
  ];

  const [tipIndex] = useState(() => Math.floor(Math.random() * tips.length));

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.replace('/');
  };

  return (
    <>
      {/* ── Side Drawer ── */}
      <Modal visible={menuOpen} transparent animationType="fade" onRequestClose={() => setMenuOpen(false)}>
        <Pressable style={styles.drawerOverlay} onPress={() => setMenuOpen(false)}>
          <Pressable style={styles.drawer} onPress={() => {}}>
            {/* Drawer header */}
            <View style={styles.drawerHeader}>
              <View style={styles.crownBox}>
                <Ionicons name="trophy" size={18} color={GOLD} />
              </View>
              <View>
                <Text style={styles.drawerBrandName}>Pet Royale'</Text>
                <Text style={styles.drawerBrandSub}>CLINIC & VETERINARY</Text>
              </View>
            </View>

            <View style={styles.drawerDivider} />

            {/* Menu items */}
            {[
              { icon: 'information-circle-outline' as const, label: 'About & Clinic Info', onPress: () => { setMenuOpen(false); router.push('/(tabs)/about' as any); } },
              { icon: 'settings-outline'           as const, label: 'Settings', onPress: () => { setMenuOpen(false); router.push('/(tabs)/settings' as any); } },
            ].map((item, i) => (
              <TouchableOpacity key={i} style={styles.drawerItem} onPress={item.onPress} activeOpacity={0.7}>
                <Ionicons name={item.icon} size={20} color={NAV} />
                <Text style={styles.drawerItemText}>{item.label}</Text>
                <Ionicons name="chevron-forward" size={15} color="#c8d0e4" style={{ marginLeft: 'auto' }} />
              </TouchableOpacity>
            ))}

            <View style={styles.drawerDivider} />

            <TouchableOpacity style={styles.drawerSignOut} onPress={handleSignOut} activeOpacity={0.8}>
              <Ionicons name="log-out-outline" size={20} color="#c0392b" />
              <Text style={styles.drawerSignOutText}>Sign Out</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>

      {/* ── Header ── */}
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
        <View style={styles.headerRight}>
          <View style={styles.headerRightTop}>
            <View>
              <Text style={styles.greetingText}>{greeting} 👋</Text>
              <Text style={styles.userName} numberOfLines={1}>{userName}</Text>
            </View>
            <TouchableOpacity style={styles.menuBtn} onPress={() => setMenuOpen(true)} activeOpacity={0.7}>
              <Ionicons name="menu" size={22} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* ── Hero Banner ── */}
      <View style={styles.banner}>
        <View style={styles.bannerGlow} pointerEvents="none" />
        <View style={styles.bannerBadge}>
          <Text style={styles.bannerBadgeText}>PET ROYALE CLINIC</Text>
        </View>
        <Text style={styles.bannerTitle}>Where every{'\n'}pet is royalty.</Text>
        <Text style={styles.bannerSub}>"We Care For You and Your Pets"</Text>
        <TouchableOpacity
          style={styles.bannerBtn}
          onPress={() => router.push('/(tabs)/book' as any)}
          activeOpacity={0.85}
        >
          <Text style={styles.bannerBtnText}>Book Appointment</Text>
          <Ionicons name="arrow-forward" size={14} color={NAV} />
        </TouchableOpacity>
      </View>

      {/* ── Clinic Strip ── */}
      <View style={styles.clinicStrip}>
        <View style={styles.clinicStripItem}>
          <Ionicons name="location" size={14} color={GOLD} />
          <Text style={styles.clinicStripText}>Calbayog City, Eastern Samar</Text>
        </View>
        <View style={styles.clinicStripDot} />
        <View style={styles.clinicStripItem}>
          <Ionicons name="call" size={14} color={GOLD} />
          <Text style={styles.clinicStripText}>+63 950 279 1505</Text>
        </View>
      </View>

      {/* ── Pet Tip Card ── */}
      <View style={styles.tipCard}>
        <View style={styles.tipIconWrap}>
          <Ionicons name="bulb" size={18} color={GOLD} />
        </View>
        <View style={styles.tipRight}>
          <Text style={styles.tipLabel}>PET CARE TIP</Text>
          <Text style={styles.tipText}>{tips[tipIndex]}</Text>
        </View>
      </View>

      {/* ── Services ── */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Our Services</Text>
          <View style={styles.sectionLine} />
        </View>
        <View style={styles.servicesGrid}>
          {services.map((service, index) => (
            <TouchableOpacity
              key={index}
              style={styles.serviceCard}
              onPress={() => router.push('/(tabs)/book' as any)}
              activeOpacity={0.8}
            >
              <View style={[styles.serviceIconWrap, { backgroundColor: service.color + '18' }]}>
                <Ionicons name={service.icon} size={26} color={service.color} />
              </View>
              <Text style={styles.serviceLabel}>{service.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>



      <View style={{ height: 24 }} />
    </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f0f2f8',
  },

  /* ── Header ── */
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
  headerRight: {
    alignItems: 'flex-end',
  },
  headerRightTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  menuBtn: {
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  greetingText: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 11,
  },
  userName: {
    color: GOLD,
    fontSize: 14,
    fontWeight: '700',
    maxWidth: 140,
    marginTop: 2,
  },

  /* ── Banner ── */
  banner: {
    backgroundColor: NAV,
    marginHorizontal: 14,
    marginTop: 14,
    borderRadius: 16,
    padding: 22,
    overflow: 'hidden',
    position: 'relative',
  },
  bannerGlow: {
    position: 'absolute',
    bottom: -60,
    left: -60,
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: GOLD,
    opacity: 0.05,
  },
  bannerBadge: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: 'rgba(245,197,24,0.35)',
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginBottom: 10,
  },
  bannerBadgeText: {
    color: GOLD,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.5,
  },
  bannerTitle: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '800',
    lineHeight: 28,
    marginBottom: 6,
    letterSpacing: -0.3,
  },
  bannerSub: {
    color: 'rgba(245,197,24,0.75)',
    fontSize: 11,
    fontStyle: 'italic',
    marginBottom: 16,
  },
  bannerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: GOLD,
    alignSelf: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 10,
  },
  bannerBtnText: {
    color: NAV,
    fontWeight: '700',
    fontSize: 13,
  },

  /* ── Clinic Strip ── */
  clinicStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: NAV,
    marginHorizontal: 14,
    marginTop: 10,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 10,
  },
  clinicStripItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    flex: 1,
  },
  clinicStripText: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 11.5,
    flex: 1,
  },
  clinicStripDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },

  /* ── Tip Card ── */
  tipCard: {
    backgroundColor: NAV,
    marginHorizontal: 14,
    marginTop: 10,
    borderRadius: 12,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  tipIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(245,197,24,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(245,197,24,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  tipRight: { flex: 1 },
  tipLabel: {
    color: GOLD,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.4,
    marginBottom: 3,
  },
  tipText: {
    color: 'rgba(255,255,255,0.82)',
    fontSize: 12,
    lineHeight: 17,
  },

  /* ── Section ── */
  section: {
    paddingHorizontal: 14,
    marginTop: 20,
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

  /* ── Services ── */
  servicesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  serviceCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
    width: '48%',
    shadowColor: NAV,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 6,
    elevation: 3,
  },
  serviceIconWrap: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  serviceLabel: {
    fontSize: 11,
    color: NAV,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 15,
  },

  /* ── Drawer ── */
  drawerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
    flexDirection: 'row',
  },
  drawer: {
    width: '72%',
    backgroundColor: '#fff',
    paddingTop: 52,
    paddingBottom: 32,
    paddingHorizontal: 20,
    shadowColor: '#000',
    shadowOffset: { width: -4, height: 0 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 16,
  },
  drawerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 16,
  },
  drawerBrandName: {
    color: NAV,
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: -0.2,
    lineHeight: 17,
  },
  drawerBrandSub: {
    color: '#8a97b0',
    fontSize: 8.5,
    fontWeight: '600',
    letterSpacing: 1.2,
    marginTop: 2,
  },
  drawerDivider: {
    height: 1,
    backgroundColor: '#eef1f8',
    marginVertical: 10,
  },
  drawerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 13,
  },
  drawerItemText: {
    fontSize: 14,
    fontWeight: '600',
    color: NAV,
  },
  drawerSignOut: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 13,
    marginTop: 4,
  },
  drawerSignOutText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#c0392b',
  },
});
