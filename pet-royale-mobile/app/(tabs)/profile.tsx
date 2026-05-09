import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert, Image, TextInput, Modal, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';

const NAV = '#1a237e';
const GOLD = '#f5c518';
const BG = '#f0f2f8';

export default function ProfileScreen() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [petCount, setPetCount] = useState(0);
  const [appointmentCount, setAppointmentCount] = useState(0);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  // Edit modal
  const [showEditModal, setShowEditModal] = useState(false);
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Avatar action sheet
  const [showAvatarSheet, setShowAvatarSheet] = useState(false);
  // Full-screen image viewer
  const [showImageViewer, setShowImageViewer] = useState(false);

  useEffect(() => {
    fetchUserData();
    const channel = supabase.channel('pets-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pets' }, () => fetchUserData())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const fetchUserData = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      setUser(user);
      setFullName(user.user_metadata?.full_name || '');
      setPhone(user.user_metadata?.phone || '');
      setAddress(user.user_metadata?.address || '');
      setAvatarUrl(user.user_metadata?.avatar_url || null);

      const { count: pets } = await supabase
        .from('pets').select('*', { count: 'exact', head: true }).eq('owner_id', user.id);
      setPetCount(pets || 0);

      const { count: appts } = await (supabase as any)
        .from('appointments').select('*', { count: 'exact', head: true })
        .eq('client_name', user.user_metadata?.full_name || user.email);
      setAppointmentCount(appts || 0);
    }
    setIsLoading(false);
  };

  /* ── Avatar actions ── */
  const handleAvatarPress = () => {
    if (avatarUrl) {
      setShowAvatarSheet(true);
    } else {
      pickImage();
    }
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

  /* ── Save profile ── */
  const handleSaveProfile = async () => {
    if (!fullName.trim()) { Alert.alert('Error', 'Full name is required.'); return; }
    setIsSaving(true);
    const { error } = await supabase.auth.updateUser({
      data: { full_name: fullName, phone, address },
    });
    setIsSaving(false);
    if (error) { Alert.alert('Error', 'Failed to update profile.'); return; }
    await fetchUserData();
    setShowEditModal(false);
  };

  const handleLogout = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: async () => {
        await supabase.auth.signOut();
        router.replace('/');
      }},
    ]);
  };

  const initials = fullName?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase() || '?';

  if (isLoading) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator size="large" color={NAV} />
      </View>
    );
  }

  return (
    <>
      <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>

        {/* ── Header / Hero ── */}
        <View style={styles.hero}>
          <View style={styles.heroGlow} pointerEvents="none" />

          {/* Top brand row */}
          <View style={styles.heroBrand}>
            <View style={styles.crownBox}>
              <Ionicons name="trophy" size={16} color={GOLD} />
            </View>
            <Text style={styles.heroBrandText}>Pet Royale'</Text>
          </View>

          {/* Avatar */}
          <TouchableOpacity style={styles.avatarWrap} onPress={handleAvatarPress} activeOpacity={0.9}>
            {uploading ? (
              <View style={styles.avatarInner}>
                <ActivityIndicator color={NAV} />
              </View>
            ) : avatarUrl ? (
              <Image source={{ uri: avatarUrl }} style={styles.avatarImage} />
            ) : (
              <View style={styles.avatarInner}>
                <Text style={styles.avatarInitials}>{initials}</Text>
              </View>
            )}
            <View style={styles.cameraBtn}>
              <Ionicons name="camera" size={12} color="#fff" />
            </View>
          </TouchableOpacity>

          <Text style={styles.heroName}>{fullName || 'Pet Owner'}</Text>
          <Text style={styles.heroEmail}>{user?.email}</Text>

          {(user?.user_metadata?.phone || user?.user_metadata?.address) && (
            <View style={styles.heroMeta}>
              {user.user_metadata?.phone && (
                <View style={styles.heroMetaItem}>
                  <Ionicons name="call-outline" size={12} color="rgba(255,255,255,0.6)" />
                  <Text style={styles.heroMetaText}>{user.user_metadata.phone}</Text>
                </View>
              )}
              {user.user_metadata?.address && (
                <View style={styles.heroMetaItem}>
                  <Ionicons name="location-outline" size={12} color="rgba(255,255,255,0.6)" />
                  <Text style={styles.heroMetaText} numberOfLines={1}>{user.user_metadata.address}</Text>
                </View>
              )}
            </View>
          )}

          <TouchableOpacity style={styles.editBtn} onPress={() => setShowEditModal(true)} activeOpacity={0.85}>
            <Ionicons name="pencil" size={13} color={NAV} />
            <Text style={styles.editBtnText}>Edit Profile</Text>
          </TouchableOpacity>
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

        {/* ── Quick Links ── */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Quick Actions</Text>
            <View style={styles.sectionLine} />
          </View>
          <View style={styles.card}>
            {[
              { icon: 'paw-outline'          as const, label: 'My Pets',          route: '/(tabs)/pets'         },
              { icon: 'calendar-outline'     as const, label: 'My Appointments',  route: '/(tabs)/appointments' },
              { icon: 'add-circle-outline'   as const, label: 'Book Appointment', route: '/(tabs)/book'         },
            ].map((item, i, arr) => (
              <View key={item.label}>
                <TouchableOpacity
                  style={styles.linkRow}
                  onPress={() => router.push(item.route as any)}
                  activeOpacity={0.7}
                >
                  <View style={styles.linkIconWrap}>
                    <Ionicons name={item.icon} size={18} color={GOLD} />
                  </View>
                  <Text style={styles.linkText}>{item.label}</Text>
                  <Ionicons name="chevron-forward" size={15} color="#c8d0e4" />
                </TouchableOpacity>
                {i < arr.length - 1 && <View style={styles.cardDivider} />}
              </View>
            ))}
          </View>
        </View>

        {/* ── Sign Out ── */}
        <View style={styles.section}>
          <TouchableOpacity style={styles.signOutRow} onPress={handleLogout} activeOpacity={0.8}>
            <View style={styles.signOutIcon}>
              <Ionicons name="log-out-outline" size={18} color="#c0392b" />
            </View>
            <Text style={styles.signOutText}>Sign Out</Text>
          </TouchableOpacity>
        </View>

        <View style={{ height: 24 }} />
      </ScrollView>

      {/* ── Avatar Action Sheet ── */}
      <Modal visible={showAvatarSheet} transparent animationType="slide">
        <Pressable style={styles.sheetOverlay} onPress={() => setShowAvatarSheet(false)}>
          <Pressable style={styles.actionSheet}>
            <View style={styles.actionSheetHandle} />
            <Text style={styles.actionSheetTitle}>Profile Photo</Text>

            {/* Preview */}
            {avatarUrl && (
              <TouchableOpacity style={styles.previewWrap} onPress={() => { setShowAvatarSheet(false); setShowImageViewer(true); }} activeOpacity={0.9}>
                <Image source={{ uri: avatarUrl }} style={styles.previewImage} />
                <View style={styles.previewOverlay}>
                  <Ionicons name="expand-outline" size={20} color="#fff" />
                  <Text style={styles.previewOverlayText}>View Full Photo</Text>
                </View>
              </TouchableOpacity>
            )}

            <TouchableOpacity style={styles.actionItem} onPress={pickImage} activeOpacity={0.7}>
              <View style={[styles.actionItemIcon, { backgroundColor: '#eef1f8' }]}>
                <Ionicons name="images-outline" size={18} color={NAV} />
              </View>
              <Text style={styles.actionItemText}>Choose from Library</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.actionItem} onPress={takePhoto} activeOpacity={0.7}>
              <View style={[styles.actionItemIcon, { backgroundColor: '#eef1f8' }]}>
                <Ionicons name="camera-outline" size={18} color={NAV} />
              </View>
              <Text style={styles.actionItemText}>Take a Photo</Text>
            </TouchableOpacity>

            {avatarUrl && (
              <TouchableOpacity style={styles.actionItem} onPress={deleteAvatar} activeOpacity={0.7}>
                <View style={[styles.actionItemIcon, { backgroundColor: '#fdecea' }]}>
                  <Ionicons name="trash-outline" size={18} color="#c0392b" />
                </View>
                <Text style={[styles.actionItemText, { color: '#c0392b' }]}>Remove Photo</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity style={styles.actionCancel} onPress={() => setShowAvatarSheet(false)} activeOpacity={0.8}>
              <Text style={styles.actionCancelText}>Cancel</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Full Screen Image Viewer ── */}
      <Modal visible={showImageViewer} transparent animationType="fade">
        <View style={styles.viewerOverlay}>
          <TouchableOpacity style={styles.viewerClose} onPress={() => setShowImageViewer(false)}>
            <Ionicons name="close" size={24} color="#fff" />
          </TouchableOpacity>
          {avatarUrl && (
            <Image source={{ uri: avatarUrl }} style={styles.viewerImage} resizeMode="contain" />
          )}
          <TouchableOpacity style={styles.viewerChangeBtn} onPress={() => { setShowImageViewer(false); setTimeout(() => setShowAvatarSheet(true), 300); }} activeOpacity={0.85}>
            <Ionicons name="camera-outline" size={16} color={NAV} />
            <Text style={styles.viewerChangeBtnText}>Change Photo</Text>
          </TouchableOpacity>
        </View>
      </Modal>

      {/* ── Edit Profile Modal ── */}
      <Modal visible={showEditModal} transparent animationType="slide">
        <View style={styles.sheetOverlay}>
          <View style={styles.editSheet}>
            <View style={styles.editSheetHeader}>
              <Text style={styles.editSheetTitle}>Edit Profile</Text>
              <TouchableOpacity onPress={() => setShowEditModal(false)}>
                <Ionicons name="close" size={22} color="#4a5568" />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.label}>Full Name <Text style={styles.required}>*</Text></Text>
              <TextInput
                style={styles.input}
                placeholder="Enter full name"
                placeholderTextColor="#bcc5d8"
                value={fullName}
                onChangeText={setFullName}
              />
              <Text style={styles.label}>Phone Number <Text style={styles.optional}>(Optional)</Text></Text>
              <TextInput
                style={styles.input}
                placeholder="09xx xxx xxxx"
                placeholderTextColor="#bcc5d8"
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
              />
              <Text style={styles.label}>Address <Text style={styles.optional}>(Optional)</Text></Text>
              <TextInput
                style={[styles.input, styles.inputMultiline]}
                placeholder="Enter your address"
                placeholderTextColor="#bcc5d8"
                value={address}
                onChangeText={setAddress}
                multiline
                numberOfLines={3}
              />
              <TouchableOpacity style={styles.saveBtn} onPress={handleSaveProfile} disabled={isSaving} activeOpacity={0.85}>
                {isSaving ? <ActivityIndicator color={NAV} /> : <Text style={styles.saveBtnText}>Save Changes</Text>}
              </TouchableOpacity>
              <View style={{ height: 24 }} />
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: BG },

  /* ── Hero ── */
  hero: {
    backgroundColor: NAV, alignItems: 'center',
    paddingTop: 16, paddingBottom: 24, paddingHorizontal: 20,
    position: 'relative', overflow: 'hidden',
  },
  heroGlow: {
    position: 'absolute', bottom: -60, right: -60,
    width: 200, height: 200, borderRadius: 100,
    backgroundColor: GOLD, opacity: 0.05,
  },
  heroBrand: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    alignSelf: 'flex-start', marginBottom: 20,
  },
  crownBox: {
    width: 30, height: 30, borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center', justifyContent: 'center',
  },
  heroBrandText: { color: 'rgba(255,255,255,0.6)', fontSize: 12, fontWeight: '600' },

  avatarWrap: { position: 'relative', marginBottom: 14 },
  avatarInner: {
    width: 88, height: 88, borderRadius: 44,
    backgroundColor: GOLD, alignItems: 'center', justifyContent: 'center',
    borderWidth: 3, borderColor: 'rgba(255,255,255,0.3)',
  },
  avatarImage: {
    width: 88, height: 88, borderRadius: 44,
    borderWidth: 3, borderColor: 'rgba(255,255,255,0.3)',
  },
  avatarInitials: { fontSize: 34, fontWeight: '800', color: NAV },
  cameraBtn: {
    position: 'absolute', bottom: 2, right: 2,
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: NAV, borderWidth: 2, borderColor: '#fff',
    alignItems: 'center', justifyContent: 'center',
  },

  heroName: { color: '#fff', fontSize: 20, fontWeight: '800', letterSpacing: -0.3, marginBottom: 3 },
  heroEmail: { color: 'rgba(255,255,255,0.5)', fontSize: 12, marginBottom: 10 },
  heroMeta: { gap: 4, alignItems: 'center', marginBottom: 14 },
  heroMetaItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  heroMetaText: { color: 'rgba(255,255,255,0.65)', fontSize: 12 },

  editBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: GOLD, paddingHorizontal: 16, paddingVertical: 8,
    borderRadius: 20, marginTop: 4,
  },
  editBtnText: { color: NAV, fontWeight: '700', fontSize: 13 },

  /* ── Stats ── */
  statsRow: {
    flexDirection: 'row', backgroundColor: '#fff',
    marginHorizontal: 14, marginTop: 14, borderRadius: 14,
    shadowColor: NAV, shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07, shadowRadius: 6, elevation: 3,
  },
  statCard: { flex: 1, alignItems: 'center', paddingVertical: 16, gap: 3 },
  statDivider: { width: 1, backgroundColor: '#eef1f8', marginVertical: 12 },
  statNumber: { fontSize: 26, fontWeight: '800', color: NAV, letterSpacing: -0.5 },
  statLabel: { fontSize: 11, color: '#8a97b0', fontWeight: '500' },

  /* ── Section ── */
  section: { paddingHorizontal: 14, marginTop: 18 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  sectionTitle: { fontSize: 14, fontWeight: '800', color: NAV, letterSpacing: -0.2 },
  sectionLine: { flex: 1, height: 1.5, backgroundColor: '#dde3ef', borderRadius: 2 },

  /* ── Card ── */
  card: {
    backgroundColor: '#fff', borderRadius: 12,
    shadowColor: NAV, shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07, shadowRadius: 6, elevation: 3,
  },
  linkRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 13, gap: 12,
  },
  linkIconWrap: {
    width: 34, height: 34, borderRadius: 9,
    backgroundColor: NAV, alignItems: 'center', justifyContent: 'center',
  },
  linkText: { flex: 1, fontSize: 13.5, fontWeight: '600', color: NAV },
  cardDivider: { height: 1, backgroundColor: '#eef1f8', marginHorizontal: 14 },

  /* ── Sign Out ── */
  signOutRow: {
    backgroundColor: '#fff', borderRadius: 12,
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 14, paddingVertical: 13,
    shadowColor: NAV, shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07, shadowRadius: 6, elevation: 3,
  },
  signOutIcon: {
    width: 34, height: 34, borderRadius: 9,
    backgroundColor: '#fdecea', alignItems: 'center', justifyContent: 'center',
  },
  signOutText: { fontSize: 13.5, fontWeight: '700', color: '#c0392b' },

  /* ── Avatar Action Sheet ── */
  sheetOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  actionSheet: {
    backgroundColor: '#fff', borderTopLeftRadius: 22, borderTopRightRadius: 22,
    padding: 20, paddingBottom: 32,
  },
  actionSheetHandle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: '#dde3ef', alignSelf: 'center', marginBottom: 16,
  },
  actionSheetTitle: { fontSize: 15, fontWeight: '800', color: NAV, marginBottom: 14 },

  previewWrap: {
    borderRadius: 12, overflow: 'hidden', marginBottom: 14,
    position: 'relative', height: 180,
  },
  previewImage: { width: '100%', height: '100%' },
  previewOverlay: {
    position: 'absolute', inset: 0,
    backgroundColor: 'rgba(0,0,0,0.3)',
    alignItems: 'center', justifyContent: 'center', gap: 6,
  },
  previewOverlayText: { color: '#fff', fontSize: 13, fontWeight: '600' },

  actionItem: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 12,
  },
  actionItemIcon: {
    width: 38, height: 38, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  actionItemText: { fontSize: 14, fontWeight: '600', color: NAV },
  actionCancel: {
    marginTop: 8, backgroundColor: BG, borderRadius: 10,
    paddingVertical: 13, alignItems: 'center',
  },
  actionCancelText: { fontSize: 14, fontWeight: '700', color: '#8a97b0' },

  /* ── Full Screen Viewer ── */
  viewerOverlay: {
    flex: 1, backgroundColor: '#000',
    alignItems: 'center', justifyContent: 'center',
  },
  viewerClose: {
    position: 'absolute', top: 52, right: 20,
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center', justifyContent: 'center', zIndex: 10,
  },
  viewerImage: { width: '100%', height: '70%' },
  viewerChangeBtn: {
    position: 'absolute', bottom: 52,
    flexDirection: 'row', alignItems: 'center', gap: 7,
    backgroundColor: GOLD, paddingHorizontal: 20, paddingVertical: 11,
    borderRadius: 22,
  },
  viewerChangeBtnText: { color: NAV, fontWeight: '700', fontSize: 14 },

  /* ── Edit Modal ── */
  editSheet: {
    backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 20, maxHeight: '85%',
  },
  editSheetHeader: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', marginBottom: 14,
  },
  editSheetTitle: { fontSize: 16, fontWeight: '800', color: NAV },
  label: {
    fontSize: 11, fontWeight: '700', color: '#4a5568',
    letterSpacing: 0.9, textTransform: 'uppercase', marginBottom: 7, marginTop: 12,
  },
  required: { color: '#c0392b', fontWeight: '700' },
  optional: { color: '#8a97b0', fontWeight: '400', textTransform: 'none', letterSpacing: 0, fontSize: 10 },
  input: {
    backgroundColor: BG, borderWidth: 1.5, borderColor: '#dde3ef',
    borderRadius: 9, paddingHorizontal: 13, paddingVertical: 11,
    fontSize: 14, color: NAV, marginBottom: 4,
  },
  inputMultiline: { height: 80, textAlignVertical: 'top' },
  saveBtn: {
    backgroundColor: GOLD, borderRadius: 10,
    paddingVertical: 14, alignItems: 'center', marginTop: 16,
  },
  saveBtnText: { color: NAV, fontSize: 14, fontWeight: '800' },
});
