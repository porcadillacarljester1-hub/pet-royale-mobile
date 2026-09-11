import { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Image, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Constants from 'expo-constants';

const TEAL = '#0D9488';
const TEAL_LIGHT = '#CCFBF1';
const BORDER = '#E5E7EB';
const SUB = '#6B7280';
const INK = '#111827';
const BG = '#F4F7FB';

export default function ProfileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [user, setUser] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [pets, setPets] = useState<any[]>([]);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [fullName, setFullName] = useState('');
  const [isVerified, setIsVerified] = useState(false);

  const appVersion = Constants.expoConfig?.version || '1.0.0';

  useEffect(() => { fetchUserData(); }, []);

  const fetchUserData = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      setUser(user);
      setFullName(user.user_metadata?.full_name || '');
      setAvatarUrl(user.user_metadata?.avatar_url || null);
      setIsVerified(!!user.email_confirmed_at);

      const { data: petsData } = await (supabase as any)
        .from('pets')
        .select('*')
        .eq('owner_id', user.id)
        .order('created_at', { ascending: false });
      setPets(petsData || []);
    }
    setIsLoading(false);
  };

  const handleSignOut = () => {
    Alert.alert('Log Out', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log Out',
        style: 'destructive',
        onPress: async () => {
          await supabase.auth.signOut();
          router.replace('/');
        },
      },
    ]);
  };

  const initials = fullName?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase() || '?';

  if (isLoading) {
    return <View style={styles.loadingWrap}><ActivityIndicator size="large" color={TEAL} /></View>;
  }

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <Text style={styles.headerTitle}>Profile</Text>
        <TouchableOpacity style={styles.gearBtn} onPress={() => router.push('/(tabs)/settings' as any)} activeOpacity={0.7}>
          <Ionicons name="settings-outline" size={19} color={INK} />
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {/* ── Profile card ── */}
        <TouchableOpacity style={styles.profileCard} onPress={() => router.push('/account' as any)} activeOpacity={0.85}>
          {avatarUrl ? (
            <Image source={{ uri: avatarUrl }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarFallback}><Text style={styles.avatarInitials}>{initials}</Text></View>
          )}
          <View style={{ flex: 1 }}>
            <Text style={styles.profileName}>{fullName || 'Pet Owner'}</Text>
            <Text style={styles.profileEmail}>{user?.email}</Text>
            {isVerified && (
              <View style={styles.verifiedPill}>
                <Ionicons name="checkmark-circle" size={12} color={TEAL} />
                <Text style={styles.verifiedPillText}>Verified account</Text>
              </View>
            )}
          </View>
          <Ionicons name="chevron-forward" size={18} color="#D1D5DB" />
        </TouchableOpacity>

        {/* ── My Pets ── */}
        <View style={styles.sectionRow}>
          <Text style={styles.sectionTitleLg}>My Pets</Text>
          <TouchableOpacity onPress={() => router.push('/(tabs)/pets' as any)}>
            <Text style={styles.viewAllText}>View all</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.petTilesRow}>
          {pets.slice(0, 2).map((pet) => (
            <TouchableOpacity
              key={pet.id}
              style={styles.petTile}
              onPress={() => router.push({ pathname: '/pet-detail', params: { id: pet.id } } as any)}
              activeOpacity={0.85}
            >
              {pet.photo_url ? (
                <Image source={{ uri: pet.photo_url }} style={styles.petTilePhoto} />
              ) : (
                <View style={styles.petTilePhotoFallback}><Ionicons name="paw" size={22} color={TEAL} /></View>
              )}
              <Text style={styles.petTileName} numberOfLines={1}>{pet.name}</Text>
              <Text style={styles.petTileBreed} numberOfLines={1}>{pet.breed || pet.species}</Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity style={styles.addPetTile} onPress={() => router.push('/(tabs)/pets' as any)} activeOpacity={0.8}>
            <Ionicons name="add" size={22} color={TEAL} />
            <Text style={styles.addPetTileText}>Add pet</Text>
          </TouchableOpacity>
        </View>

        {/* ── ACCOUNT ── */}
        <Text style={styles.groupLabel}>ACCOUNT</Text>
        <View style={styles.card}>
          <TouchableOpacity style={styles.menuRow} onPress={() => router.push('/account' as any)} activeOpacity={0.7}>
            <View style={styles.menuIconWrap}><Ionicons name="person-outline" size={19} color={TEAL} /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.menuLabel}>Personal Information</Text>
              <Text style={styles.menuSub}>Name, phone and address</Text>
            </View>
            <Ionicons name="chevron-forward" size={17} color="#D1D5DB" />
          </TouchableOpacity>
          <View style={styles.cardDivider} />

          <TouchableOpacity style={styles.menuRow} onPress={() => router.push('/(tabs)/pets' as any)} activeOpacity={0.7}>
            <View style={styles.menuIconWrap}><Ionicons name="paw-outline" size={19} color={TEAL} /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.menuLabel}>Pets</Text>
              <Text style={styles.menuSub}>View and manage your pets</Text>
            </View>
            <View style={styles.countBadge}><Text style={styles.countBadgeText}>{pets.length}</Text></View>
            <Ionicons name="chevron-forward" size={17} color="#D1D5DB" />
          </TouchableOpacity>
          <View style={styles.cardDivider} />

          <TouchableOpacity style={styles.menuRow} onPress={() => router.push('/(tabs)/payment-history' as any)} activeOpacity={0.7}>
            <View style={styles.menuIconWrap}><Ionicons name="receipt-outline" size={19} color={TEAL} /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.menuLabel}>Payment History</Text>
              <Text style={styles.menuSub}>View your past payments</Text>
            </View>
            <Ionicons name="chevron-forward" size={17} color="#D1D5DB" />
          </TouchableOpacity>
        </View>

        {/* ── PREFERENCES ── */}
        <Text style={styles.groupLabel}>PREFERENCES</Text>
        <View style={styles.card}>
          <TouchableOpacity style={styles.menuRow} onPress={() => router.push('/(tabs)/notifications' as any)} activeOpacity={0.7}>
            <View style={styles.menuIconWrap}><Ionicons name="notifications-outline" size={19} color={TEAL} /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.menuLabel}>Notifications</Text>
              <Text style={styles.menuSub}>Reminders and clinic updates</Text>
            </View>
            <Ionicons name="chevron-forward" size={17} color="#D1D5DB" />
          </TouchableOpacity>
          <View style={styles.cardDivider} />

          <TouchableOpacity style={styles.menuRow} onPress={() => router.push('/(tabs)/security' as any)} activeOpacity={0.7}>
            <View style={styles.menuIconWrap}><Ionicons name="shield-outline" size={19} color={TEAL} /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.menuLabel}>Security</Text>
              <Text style={styles.menuSub}>Password, biometrics, sessions</Text>
            </View>
            <Ionicons name="chevron-forward" size={17} color="#D1D5DB" />
          </TouchableOpacity>
          <View style={styles.cardDivider} />

          <TouchableOpacity style={styles.menuRow} onPress={() => router.push('/(tabs)/settings' as any)} activeOpacity={0.7}>
            <View style={styles.menuIconWrap}><Ionicons name="settings-outline" size={19} color={TEAL} /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.menuLabel}>App Settings</Text>
              <Text style={styles.menuSub}>Language, theme and units</Text>
            </View>
            <Ionicons name="chevron-forward" size={17} color="#D1D5DB" />
          </TouchableOpacity>
        </View>

        {/* ── SUPPORT ── */}
        <Text style={styles.groupLabel}>SUPPORT</Text>
        <View style={styles.card}>
          <TouchableOpacity style={styles.menuRow} onPress={() => router.push('/(tabs)/help' as any)} activeOpacity={0.7}>
            <View style={styles.menuIconWrap}><Ionicons name="help-circle-outline" size={19} color={TEAL} /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.menuLabel}>Help & Support</Text>
              <Text style={styles.menuSub}>Contact the clinic team</Text>
            </View>
            <Ionicons name="chevron-forward" size={17} color="#D1D5DB" />
          </TouchableOpacity>
          <View style={styles.cardDivider} />

          <TouchableOpacity style={styles.menuRow} onPress={() => router.push('/(tabs)/about' as any)} activeOpacity={0.7}>
            <View style={styles.menuIconWrap}><Ionicons name="information-circle-outline" size={19} color={TEAL} /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.menuLabel}>About Pet Royale</Text>
              <Text style={styles.menuSub}>Version {appVersion} · Terms & privacy</Text>
            </View>
            <Ionicons name="chevron-forward" size={17} color="#D1D5DB" />
          </TouchableOpacity>
        </View>

        {/* ── Log Out ── */}
        <TouchableOpacity style={styles.logoutBtn} onPress={handleSignOut} activeOpacity={0.8}>
          <Ionicons name="log-out-outline" size={18} color="#DC2626" />
          <Text style={styles.logoutText}>Log Out</Text>
        </TouchableOpacity>

        <Text style={styles.versionText}>Pet Royale · v{appVersion}</Text>

        <View style={{ height: 32 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: BG },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: BG, paddingHorizontal: 18, paddingBottom: 14,
  },
  headerTitle: { fontSize: 24, fontWeight: '800', color: INK, letterSpacing: -0.4 },
  gearBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
  },

  scrollContent: { paddingHorizontal: 18 },

  profileCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#fff', borderRadius: 16, padding: 14, marginBottom: 20,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 2,
  },
  avatar: { width: 52, height: 52, borderRadius: 26 },
  avatarFallback: { width: 52, height: 52, borderRadius: 26, backgroundColor: TEAL, alignItems: 'center', justifyContent: 'center' },
  avatarInitials: { fontSize: 19, fontWeight: '800', color: '#fff' },
  profileName: { fontSize: 15.5, fontWeight: '800', color: INK, marginBottom: 2 },
  profileEmail: { fontSize: 12, color: SUB, marginBottom: 6 },
  verifiedPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: TEAL_LIGHT, alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20,
  },
  verifiedPillText: { fontSize: 10.5, fontWeight: '700', color: TEAL },

  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  sectionTitleLg: { fontSize: 16, fontWeight: '800', color: INK },
  viewAllText: { fontSize: 12.5, fontWeight: '700', color: TEAL },

  petTilesRow: { flexDirection: 'row', gap: 10, marginBottom: 24 },
  petTile: {
    flex: 1, backgroundColor: '#fff', borderRadius: 16, padding: 12, alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 5, elevation: 1,
  },
  petTilePhoto: { width: 48, height: 48, borderRadius: 24, marginBottom: 8 },
  petTilePhotoFallback: { width: 48, height: 48, borderRadius: 24, backgroundColor: TEAL_LIGHT, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  petTileName: { fontSize: 12.5, fontWeight: '700', color: INK },
  petTileBreed: { fontSize: 10.5, color: SUB, marginTop: 1 },
  addPetTile: {
    flex: 1, borderRadius: 16, borderWidth: 1.5, borderColor: TEAL, borderStyle: 'dashed',
    alignItems: 'center', justifyContent: 'center', paddingVertical: 18, gap: 4,
  },
  addPetTileText: { fontSize: 11.5, fontWeight: '700', color: TEAL },

  groupLabel: { fontSize: 11.5, fontWeight: '800', color: SUB, letterSpacing: 0.8, marginBottom: 8 },

  card: {
    backgroundColor: '#fff', borderRadius: 16, marginBottom: 20, overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 5, elevation: 1,
  },
  menuRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 13 },
  menuIconWrap: { width: 38, height: 38, borderRadius: 19, backgroundColor: TEAL_LIGHT, alignItems: 'center', justifyContent: 'center' },
  menuLabel: { fontSize: 14, fontWeight: '700', color: INK, marginBottom: 2 },
  menuSub: { fontSize: 11.5, color: SUB },
  cardDivider: { height: 1, backgroundColor: BORDER, marginLeft: 64 },
  countBadge: { backgroundColor: BG, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3, marginRight: 4 },
  countBadgeText: { fontSize: 11.5, fontWeight: '700', color: INK },

  logoutBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#fff', borderRadius: 16, paddingVertical: 15, marginBottom: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 5, elevation: 1,
  },
  logoutText: { color: '#DC2626', fontWeight: '700', fontSize: 14 },
  versionText: { fontSize: 11.5, color: SUB, textAlign: 'center' },
});