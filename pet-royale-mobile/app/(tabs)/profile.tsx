import { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert, Image, Modal,
  Pressable, StatusBar, Platform
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';

// ── Matching HomeScreen colors exactly ──────────────────────────────────────
const NAVY = '#1a237e';
const GOLD = '#f5c518';
const CREAM_BORDER = '#e8e0cc';
const TAUPE = '#8a7d5a';
const BG = '#f0f2f8';

function Icon({ name, emoji, size = 20, color = NAVY }: { name: any, emoji: string, size?: number, color?: string }) {
  if (Platform.OS === 'web') return <Text style={{ fontSize: size * 0.85 }}>{emoji}</Text>;
  return <Ionicons name={name} size={size} color={color} />;
}

export default function ProfileScreen() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [petCount, setPetCount] = useState(0);
  const [appointmentCount, setAppointmentCount] = useState(0);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [showAvatarSheet, setShowAvatarSheet] = useState(false);
  const [showImageViewer, setShowImageViewer] = useState(false);
  const [fullName, setFullName] = useState('');

  useEffect(() => {
    fetchUserData();
  }, []);

  const fetchUserData = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      setUser(user);
      setFullName(user.user_metadata?.full_name || '');
      setAvatarUrl(user.user_metadata?.avatar_url || null);

      const { count: pets } = await (supabase as any)
        .from('pets').select('*', { count: 'exact', head: true })
        .eq('owner_id', user.id);
      setPetCount(pets || 0);

      const { count: appts } = await (supabase as any)
        .from('appointments').select('*', { count: 'exact', head: true })
        .eq('client_name', user.user_metadata?.full_name || user.email);
      setAppointmentCount(appts || 0);
    }
    setIsLoading(false);
  };

  const handleAvatarPress = () => {
    if (avatarUrl) setShowAvatarSheet(true);
    else pickImage();
  };

  const pickImage = async () => {
    setShowAvatarSheet(false);
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Required', 'Please allow access to your photo library.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'] as any,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.6,
    });
    if (!result.canceled) uploadAvatar(result.assets[0].uri);
  };

  const takePhoto = async () => {
    setShowAvatarSheet(false);
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Required', 'Please allow camera access.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.6,
    });
    if (!result.canceled) uploadAvatar(result.assets[0].uri);
  };

  const deleteAvatar = async () => {
    setShowAvatarSheet(false);
    Alert.alert('Remove Photo', 'Are you sure you want to remove your profile photo?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive',
        onPress: async () => {
          await supabase.auth.updateUser({ data: { avatar_url: null } });
          setAvatarUrl(null);
        },
      },
    ]);
  };

  const uploadAvatar = async (uri: string) => {
    setUploading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const fileExt = uri.split('.').pop() || 'jpg';
      const fileName = `${user.id}.${fileExt}`;
      const response = await fetch(uri);
      const arrayBuffer = await response.arrayBuffer();
      const { error: uploadError } = await supabase.storage
        .from('avatars').upload(fileName, arrayBuffer, { contentType: `image/${fileExt}`, upsert: true });
      if (uploadError) throw uploadError;
      const { data } = supabase.storage.from('avatars').getPublicUrl(fileName);
      await supabase.auth.updateUser({ data: { avatar_url: data.publicUrl } });
      setAvatarUrl(data.publicUrl);
      Alert.alert('Done', 'Profile photo updated!');
    } catch {
      Alert.alert('Error', 'Failed to upload photo. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const initials = fullName?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase() || '?';

  if (isLoading) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator size="large" color={NAVY} />
      </View>
    );
  }

  return (
    <>
      <StatusBar barStyle="light-content" backgroundColor={NAVY} />
      <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>

        {/* ── Header — matches HomeScreen exactly ── */}
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

        {/* ── Hero / profile block ── */}
        <View style={styles.hero}>

          {/* Avatar */}
          <TouchableOpacity style={styles.avatarWrap} onPress={handleAvatarPress} activeOpacity={0.9}>
            {uploading ? (
              <View style={styles.avatarInner}>
                <ActivityIndicator color={NAVY} />
              </View>
            ) : avatarUrl ? (
              <Image source={{ uri: avatarUrl }} style={styles.avatarImage} />
            ) : (
              <View style={styles.avatarInner}>
                <Text style={styles.avatarInitials}>{initials}</Text>
              </View>
            )}
          </TouchableOpacity>

          <Text style={styles.heroName}>{fullName || 'Pet Owner'}</Text>
          <Text style={styles.heroEmail}>{user?.email}</Text>

          {(user?.user_metadata?.phone || user?.user_metadata?.address) && (
            <View style={styles.heroMeta}>
              {user.user_metadata?.phone && (
                <View style={styles.heroMetaItem}>
                  <Icon name="call-outline" emoji="📞" size={11} color="rgba(255,255,255,0.5)" />
                  <Text style={styles.heroMetaText}>{user.user_metadata.phone}</Text>
                </View>
              )}
              {user.user_metadata?.address && (
                <View style={styles.heroMetaItem}>
                  <Icon name="location-outline" emoji="📍" size={11} color="rgba(255,255,255,0.5)" />
                  <Text style={styles.heroMetaText} numberOfLines={1}>{user.user_metadata.address}</Text>
                </View>
              )}
            </View>
          )}

          {/* Set Photo + Edit Info side by side */}
          <View style={styles.heroBtnRow}>
            <TouchableOpacity style={styles.editBtn} onPress={handleAvatarPress} activeOpacity={0.85}>
              <Ionicons name="camera" size={12} color={NAVY} />
              <Text style={styles.editBtnText}>Set Photo</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.editBtn} onPress={() => router.push('/account' as any)} activeOpacity={0.85}>
              <Ionicons name="pencil" size={12} color={NAVY} />
              <Text style={styles.editBtnText}>Edit Info</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Stats ── */}
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>{petCount}</Text>
            <Text style={styles.statLabel}>My Pets</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>{appointmentCount}</Text>
            <Text style={styles.statLabel}>Appointments</Text>
          </View>
        </View>

        {/* ── Quick Actions ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Quick Actions</Text>
          <View style={styles.card}>
            {[
              { icon: 'paw-outline', emoji: '🐾', label: 'My Pets', route: '/(tabs)/pets' },
              { icon: 'calendar-outline', emoji: '📅', label: 'My Appointments', route: '/(tabs)/appointments' },
              { icon: 'add-circle-outline', emoji: '➕', label: 'Book Appointment', route: '/(tabs)/book' },
            ].map((item, i, arr) => (
              <View key={item.label}>
                <TouchableOpacity
                  style={styles.linkRow}
                  onPress={() => router.push(item.route as any)}
                  activeOpacity={0.7}
                >
                  <View style={styles.linkIconWrap}>
                    <Icon name={item.icon as any} emoji={item.emoji} size={16} color={GOLD} />
                  </View>
                  <Text style={styles.linkText}>{item.label}</Text>
                  <Ionicons name="chevron-forward" size={16} color={CREAM_BORDER} />
                </TouchableOpacity>
                {i < arr.length - 1 && <View style={styles.cardDivider} />}
              </View>
            ))}
          </View>
        </View>

        {/* ── Clinic Info ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Clinic Information</Text>
          <View style={styles.clinicCard}>
            <View style={styles.clinicRow}>
              <Text style={styles.clinicLabel}>Address</Text>
              <Text style={styles.clinicValue}>Calbayog City, Eastern Samar</Text>
            </View>
            <View style={styles.clinicDivider} />
            <View style={styles.clinicRow}>
              <Text style={styles.clinicLabel}>Operating Hours</Text>
              <Text style={styles.clinicValue}>Mon - Sat: 8:30 AM - 7:00 PM</Text>
            </View>
            <View style={styles.clinicDivider} />
            <View style={styles.clinicRow}>
              <Text style={styles.clinicLabel}>Grooming Schedule</Text>
              <Text style={styles.clinicValue}>Tue - Sun: 8:30 AM - 6:00 PM</Text>
            </View>
          </View>
        </View>

        <View style={{ height: 32 }} />
      </ScrollView>

      {/* ── Avatar Action Sheet ── */}
      <Modal visible={showAvatarSheet} transparent animationType="slide">
        <Pressable style={styles.sheetOverlay} onPress={() => setShowAvatarSheet(false)}>
          <Pressable style={styles.actionSheet}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Profile Photo</Text>

            {avatarUrl && (
              <TouchableOpacity
                style={styles.previewWrap}
                onPress={() => { setShowAvatarSheet(false); setShowImageViewer(true); }}
                activeOpacity={0.9}
              >
                <Image source={{ uri: avatarUrl }} style={styles.previewImage} />
                <View style={styles.previewOverlay}>
                  <Icon name="expand-outline" emoji="🔍" size={18} color="#fff" />
                  <Text style={styles.previewOverlayText}>View Full Photo</Text>
                </View>
              </TouchableOpacity>
            )}

            <TouchableOpacity style={styles.actionItem} onPress={pickImage} activeOpacity={0.7}>
              <View style={[styles.actionItemIcon, { backgroundColor: '#eef1f8' }]}>
                <Ionicons name="images-outline" size={16} color={NAVY} />
              </View>
              <Text style={styles.actionItemText}>Choose from Library</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.actionItem} onPress={takePhoto} activeOpacity={0.7}>
              <View style={[styles.actionItemIcon, { backgroundColor: '#eef1f8' }]}>
                <Ionicons name="camera-outline" size={16} color={NAVY} />
              </View>
              <Text style={styles.actionItemText}>Take a Photo</Text>
            </TouchableOpacity>

            {avatarUrl && (
              <TouchableOpacity style={styles.actionItem} onPress={deleteAvatar} activeOpacity={0.7}>
                <View style={[styles.actionItemIcon, { backgroundColor: '#fdecea' }]}>
                  <Ionicons name="trash-outline" size={16} color="#c0392b" />
                </View>
                <Text style={[styles.actionItemText, { color: '#c0392b' }]}>Remove Photo</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowAvatarSheet(false)}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Full Screen Image Viewer ── */}
      <Modal visible={showImageViewer} transparent animationType="fade">
        <View style={styles.viewerOverlay}>
          <TouchableOpacity style={styles.viewerClose} onPress={() => setShowImageViewer(false)}>
            <Ionicons name="close" size={22} color="#fff" />
          </TouchableOpacity>
          {avatarUrl && (
            <Image source={{ uri: avatarUrl }} style={styles.viewerImage} resizeMode="contain" />
          )}
          <TouchableOpacity
            style={styles.viewerChangeBtn}
            onPress={() => { setShowImageViewer(false); setTimeout(() => setShowAvatarSheet(true), 300); }}
          >
            <Ionicons name="camera-outline" size={14} color={NAVY} />
            <Text style={styles.viewerChangeBtnText}>Change Photo</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: BG },

  // Header — identical to HomeScreen
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: NAVY,
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

  // Hero
  hero: { backgroundColor: NAVY, alignItems: 'center', paddingBottom: 24, paddingHorizontal: 20, paddingTop: 20 },
  avatarWrap: { marginBottom: 12 },
  avatarInner: { width: 86, height: 86, borderRadius: 43, backgroundColor: GOLD, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: 'rgba(255,255,255,0.2)' },
  avatarImage: { width: 86, height: 86, borderRadius: 43, borderWidth: 3, borderColor: 'rgba(255,255,255,0.2)' },
  avatarInitials: { fontSize: 32, fontWeight: '800', color: NAVY },

  heroName: { color: '#fff', fontSize: 20, fontWeight: '800', marginBottom: 3 },
  heroEmail: { color: 'rgba(255,255,255,0.45)', fontSize: 12, marginBottom: 10 },
  heroMeta: { gap: 4, alignItems: 'center', marginBottom: 14 },
  heroMetaItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  heroMetaText: { color: 'rgba(255,255,255,0.55)', fontSize: 12 },

  heroBtnRow: { flexDirection: 'row', gap: 10, marginTop: 4 },
  editBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: GOLD, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 },
  editBtnText: { color: NAVY, fontWeight: '700', fontSize: 13 },

  // Stats
  statsRow: { flexDirection: 'row', backgroundColor: '#fff', marginHorizontal: 14, marginTop: 14, borderRadius: 12, borderWidth: 1, borderColor: CREAM_BORDER },
  statCard: { flex: 1, alignItems: 'center', paddingVertical: 16, gap: 3 },
  statDivider: { width: 1, backgroundColor: CREAM_BORDER, marginVertical: 12 },
  statNumber: { fontSize: 26, fontWeight: '800', color: NAVY },
  statLabel: { fontSize: 11, color: TAUPE, fontWeight: '500' },

  // Section
  section: { paddingHorizontal: 14, marginTop: 16 },
  sectionTitle: { fontSize: 11, fontWeight: '700', color: TAUPE, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 8 },

  // Card
  card: { backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: CREAM_BORDER },
  linkRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 13, gap: 12 },
  linkIconWrap: { width: 32, height: 32, borderRadius: 8, backgroundColor: NAVY, alignItems: 'center', justifyContent: 'center' },
  linkText: { flex: 1, fontSize: 13.5, fontWeight: '600', color: NAVY },
  cardDivider: { height: 1, backgroundColor: CREAM_BORDER, marginHorizontal: 14 },

  // Clinic Card
  clinicCard: { backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: CREAM_BORDER, padding: 14 },
  clinicRow: { paddingVertical: 8 },
  clinicLabel: { fontSize: 10, fontWeight: '700', color: TAUPE, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 3 },
  clinicValue: { fontSize: 13, color: NAVY, fontWeight: '500' },
  clinicDivider: { height: 1, backgroundColor: CREAM_BORDER },

  // Action Sheet
  sheetOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  actionSheet: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 32 },
  sheetHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: CREAM_BORDER, alignSelf: 'center', marginBottom: 16 },
  sheetTitle: { fontSize: 15, fontWeight: '800', color: NAVY, marginBottom: 14 },
  previewWrap: { borderRadius: 12, overflow: 'hidden', marginBottom: 14, height: 180, position: 'relative' },
  previewImage: { width: '100%', height: '100%' },
  previewOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.3)', alignItems: 'center', justifyContent: 'center', gap: 6 },
  previewOverlayText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  actionItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11 },
  actionItemIcon: { width: 36, height: 36, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  actionItemText: { fontSize: 14, fontWeight: '600', color: NAVY },
  cancelBtn: { marginTop: 8, backgroundColor: BG, borderRadius: 10, paddingVertical: 13, alignItems: 'center', borderWidth: 1, borderColor: CREAM_BORDER },
  cancelBtnText: { fontSize: 14, fontWeight: '700', color: TAUPE },

  // Image Viewer
  viewerOverlay: { flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' },
  viewerClose: { position: 'absolute', top: 52, right: 20, width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center', zIndex: 10 },
  viewerImage: { width: '100%', height: '70%' },
  viewerChangeBtn: { position: 'absolute', bottom: 52, flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: GOLD, paddingHorizontal: 20, paddingVertical: 11, borderRadius: 20 },
  viewerChangeBtnText: { color: NAVY, fontWeight: '700', fontSize: 14 },
});
