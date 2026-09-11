import { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert, Image, TextInput, Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const TEAL = '#0D9488';
const TEAL_LIGHT = '#CCFBF1';
const BORDER = '#E5E7EB';
const SUB = '#6B7280';
const INK = '#111827';
const BG = '#F4F7FB';

export default function AccountScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [user, setUser] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [isVerified, setIsVerified] = useState(false);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [phoneError, setPhoneError] = useState('');

  const [showToast, setShowToast] = useState(false);
  const toastAnim = useRef(new Animated.Value(-60)).current;

  const savedValues = useRef({ firstName: '', lastName: '', phone: '', address: '' });

  useEffect(() => { fetchUserData(); }, []);

  const fetchUserData = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      setUser(user);
      const full = user.user_metadata?.full_name || '';
      const parts = full.split(' ');
      const fn = parts[0] || '';
      const ln = parts.slice(1).join(' ') || '';
      const ph = user.user_metadata?.phone || '';
      const addr = user.user_metadata?.address || '';

      setFirstName(fn);
      setLastName(ln);
      setPhone(ph);
      setAddress(addr);
      setAvatarUrl(user.user_metadata?.avatar_url || null);
      setIsVerified(!!user.email_confirmed_at);

      savedValues.current = { firstName: fn, lastName: ln, phone: ph, address: addr };
    }
    setIsLoading(false);
  };

  const isDirty =
    firstName !== savedValues.current.firstName ||
    lastName !== savedValues.current.lastName ||
    phone !== savedValues.current.phone ||
    address !== savedValues.current.address;

  const validatePhone = (value: string) => {
    if (!value) return true;
    const digitsOnly = value.replace(/\D/g, '');
    return digitsOnly.length >= 10 && digitsOnly.length <= 13;
  };

  const handlePhoneChange = (value: string) => {
    setPhone(value);
    if (value && !validatePhone(value)) {
      setPhoneError('Enter a valid phone number');
    } else {
      setPhoneError('');
    }
  };

  const triggerToast = () => {
    setShowToast(true);
    Animated.sequence([
      Animated.timing(toastAnim, { toValue: 0, duration: 280, useNativeDriver: true }),
      Animated.delay(2200),
      Animated.timing(toastAnim, { toValue: -60, duration: 220, useNativeDriver: true }),
    ]).start(() => setShowToast(false));
  };

  const handleSave = async () => {
    if (!firstName.trim()) {
      Alert.alert('Required', 'First name cannot be empty.');
      return;
    }
    if (phone && !validatePhone(phone)) {
      Alert.alert('Invalid Phone', 'Please enter a valid phone number.');
      return;
    }

    setIsSaving(true);
    const full_name = [firstName.trim(), lastName.trim()].filter(Boolean).join(' ');
    const { error } = await supabase.auth.updateUser({
      data: { full_name, phone: phone.trim(), address: address.trim() },
    });
    setIsSaving(false);

    if (error) {
      Alert.alert('Error', 'Failed to save changes. Please try again.');
      return;
    }

    savedValues.current = { firstName, lastName, phone, address };
    triggerToast();
  };

  const handleBack = () => {
    if (isDirty) {
      Alert.alert('Unsaved Changes', 'You have unsaved changes. Discard them?', [
        { text: 'Keep Editing', style: 'cancel' },
        { text: 'Discard', style: 'destructive', onPress: () => router.back() },
      ]);
    } else {
      router.back();
    }
  };

  const initials = ((firstName?.[0] || '') + (lastName?.[0] || '')).toUpperCase() || (user?.email?.[0]?.toUpperCase() || '?');

  if (isLoading) {
    return <View style={styles.loadingWrap}><ActivityIndicator size="large" color={TEAL} /></View>;
  }

  return (
    <View style={styles.container}>
      {/* ── Toast ── */}
      {showToast && (
        <Animated.View style={[styles.toast, { top: insets.top + 8, transform: [{ translateY: toastAnim }] }]}>
          <Ionicons name="checkmark-circle" size={18} color={TEAL} />
          <Text style={styles.toastText}>Profile updated successfully.</Text>
        </Animated.View>
      )}

      {/* ── Header ── */}
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <TouchableOpacity style={styles.backBtn} onPress={handleBack} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={22} color={INK} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <View style={styles.headerTitleRow}>
            <Text style={styles.headerTitle}>Personal Information</Text>
            {isSaving ? (
              <ActivityIndicator color={TEAL} size="small" />
            ) : (
              <TouchableOpacity
                style={[styles.saveBtn, !isDirty && styles.saveBtnDisabled]}
                onPress={handleSave}
                disabled={!isDirty}
                activeOpacity={0.8}
              >
                <Text style={[styles.saveBtnText, !isDirty && styles.saveBtnTextDisabled]}>Save</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
      <Text style={styles.headerSub}>Update your public profile and private contact details.</Text>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {/* ── Profile card ── */}
        <View style={styles.profileCard}>
          <View style={styles.avatarWrap}>
            {avatarUrl ? (
              <Image source={{ uri: avatarUrl }} style={styles.avatar} />
            ) : (
              <View style={styles.avatarFallback}>
                <Text style={styles.avatarInitials}>{initials}</Text>
              </View>
            )}
            <TouchableOpacity
              style={styles.avatarCameraBadge}
              onPress={() => router.push('/profile-photo' as any)}
              activeOpacity={0.85}
            >
              <Ionicons name="camera" size={13} color="#fff" />
            </TouchableOpacity>
          </View>
          <View style={{ flex: 1 }}>
            <View style={styles.nameRow}>
              <Text style={styles.profileName}>{[firstName, lastName].filter(Boolean).join(' ') || 'Pet Owner'}</Text>
              {isVerified && (
                <View style={styles.verifiedPill}>
                  <Ionicons name="checkmark-circle" size={12} color={TEAL} />
                  <Text style={styles.verifiedPillText}>Verified</Text>
                </View>
              )}
            </View>
            <TouchableOpacity
              onPress={() => router.push('/profile-photo' as any)}
              activeOpacity={0.7}
            >
              <Text style={styles.changePhotoText}>Change photo</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Public Profile ── */}
        <View style={styles.sectionHeader}>
          <View style={styles.sectionIconWrap}>
            <Ionicons name="globe-outline" size={16} color={TEAL} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.sectionTitle}>PUBLIC PROFILE</Text>
            <Text style={styles.sectionSub}>Your name as shown across the app.</Text>
          </View>
        </View>

        <View style={styles.card}>
          <View style={styles.fieldBlock}>
            <Text style={styles.fieldLabel}>
              First Name <Text style={styles.required}>*</Text>
            </Text>
            <View style={styles.inputRow}>
              <TextInput
                style={styles.input}
                value={firstName}
                onChangeText={setFirstName}
                placeholder="Enter first name"
                placeholderTextColor="#9CA3AF"
              />
              <Ionicons name="person-outline" size={17} color={TEAL} />
            </View>
          </View>

          <View style={styles.fieldDivider} />

          <View style={styles.fieldBlock}>
            <Text style={styles.fieldLabel}>Last Name (Optional)</Text>
            <View style={styles.inputRow}>
              <TextInput
                style={styles.input}
                value={lastName}
                onChangeText={setLastName}
                placeholder="Enter last name"
                placeholderTextColor="#9CA3AF"
              />
              <Ionicons name="person-outline" size={17} color={TEAL} />
            </View>
          </View>
        </View>

        {/* ── Private Info ── */}
        <View style={styles.sectionHeader}>
          <View style={styles.sectionIconWrap}>
            <Ionicons name="lock-closed-outline" size={16} color={TEAL} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.sectionTitle}>PRIVATE INFO</Text>
            <Text style={styles.sectionSub}>Only you can see this. Keep it up to date.</Text>
          </View>
        </View>

        <View style={styles.card}>
          <View style={styles.fieldBlock}>
            <Text style={styles.fieldLabel}>Email</Text>
            <View style={styles.inputRow}>
              <Text style={styles.readonlyValue}>{user?.email}</Text>
              <View style={styles.lockedBadge}>
                <Ionicons name="lock-closed" size={11} color={SUB} />
                <Text style={styles.lockedBadgeText}>Locked</Text>
              </View>
            </View>
            <Text style={styles.fieldHint}>Contact support to change your email address.</Text>
          </View>

          <View style={styles.fieldDivider} />

          <View style={styles.fieldBlock}>
            <Text style={styles.fieldLabel}>Phone Number</Text>
            <View style={styles.inputRow}>
              <TextInput
                style={styles.input}
                value={phone}
                onChangeText={handlePhoneChange}
                placeholder="+63 9XX XXX XXXX"
                placeholderTextColor="#9CA3AF"
                keyboardType="phone-pad"
              />
              <Ionicons name="call-outline" size={17} color={TEAL} />
            </View>
            {phoneError ? <Text style={styles.fieldHintError}>{phoneError}</Text> : null}
          </View>

          <View style={styles.fieldDivider} />

          <View style={styles.fieldBlock}>
            <Text style={styles.fieldLabel}>Address (Optional)</Text>
            <View style={styles.inputRow}>
              <TextInput
                style={styles.input}
                value={address}
                onChangeText={setAddress}
                placeholder="e.g. 123 Rizal St., Calbayog City"
                placeholderTextColor="#9CA3AF"
              />
              <Ionicons name="location-outline" size={17} color={TEAL} />
            </View>
          </View>
        </View>

        {/* ── Security note ── */}
        <TouchableOpacity style={styles.secureCard} activeOpacity={0.8}>
          <View style={styles.secureIconWrap}>
            <Ionicons name="shield-checkmark" size={18} color={TEAL} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.secureTitle}>Your information is secure</Text>
            <Text style={styles.secureText}>
              We never share your private details with third parties.
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={TEAL} />
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: BG },

  toast: {
    position: 'absolute', left: 16, right: 16, zIndex: 100,
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#ECFDF5', borderWidth: 1, borderColor: '#A7F3D0',
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 6,
  },
  toastText: { fontSize: 13, fontWeight: '600', color: '#065F46', flex: 1 },

  header: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    backgroundColor: BG, paddingHorizontal: 16, paddingBottom: 4,
  },
  backBtn: {
    width: 38, height: 38, borderRadius: 19,
    alignItems: 'center', justifyContent: 'center', marginTop: 2,
  },
  headerTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerTitle: { fontSize: 19, fontWeight: '800', color: INK, letterSpacing: -0.3 },
  saveBtn: { backgroundColor: TEAL, borderRadius: 20, paddingHorizontal: 18, paddingVertical: 8 },
  saveBtnDisabled: { backgroundColor: '#E5E7EB' },
  saveBtnText: { color: '#fff', fontSize: 13.5, fontWeight: '700' },
  saveBtnTextDisabled: { color: '#9CA3AF' },
  headerSub: { fontSize: 12.5, color: SUB, marginTop: 4, marginBottom: 16, paddingHorizontal: 16 + 38 + 12 },

  scrollContent: { paddingHorizontal: 16 },

  profileCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 14,
    backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 20,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 2,
  },
  avatarWrap: { position: 'relative' },
  avatar: { width: 58, height: 58, borderRadius: 29 },
  avatarFallback: { width: 58, height: 58, borderRadius: 29, backgroundColor: TEAL, alignItems: 'center', justifyContent: 'center' },
  avatarInitials: { fontSize: 20, fontWeight: '800', color: '#fff' },
  avatarCameraBadge: {
    position: 'absolute', bottom: -2, right: -2,
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: TEAL, alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#fff',
  },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 3, flexWrap: 'wrap' },
  profileName: { fontSize: 16, fontWeight: '800', color: INK },
  verifiedPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: TEAL_LIGHT, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20,
  },
  verifiedPillText: { fontSize: 10.5, fontWeight: '700', color: TEAL },
  changePhotoText: { fontSize: 12.5, fontWeight: '700', color: TEAL, marginTop: 4 },

  sectionHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 10 },
  sectionIconWrap: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: TEAL_LIGHT, alignItems: 'center', justifyContent: 'center',
  },
  sectionTitle: { fontSize: 12, fontWeight: '800', color: INK, letterSpacing: 0.6 },
  sectionSub: { fontSize: 11.5, color: SUB, marginTop: 2 },

  card: {
    backgroundColor: '#fff', borderRadius: 16, padding: 4, marginBottom: 20,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 5, elevation: 1,
  },
  fieldBlock: { paddingHorizontal: 14, paddingVertical: 12 },
  fieldLabel: { fontSize: 12.5, fontWeight: '700', color: INK, marginBottom: 7 },
  required: { color: '#DC2626' },
  inputRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10,
    borderWidth: 1.5, borderColor: BORDER, borderRadius: 10,
    paddingHorizontal: 13, paddingVertical: 11,
  },
  input: { flex: 1, fontSize: 15, fontWeight: '600', color: INK, padding: 0 },
  readonlyValue: { flex: 1, fontSize: 15, fontWeight: '600', color: SUB },
  lockedBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: BG, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8,
  },
  lockedBadgeText: { fontSize: 10.5, fontWeight: '700', color: SUB },
  fieldHint: { fontSize: 11, color: SUB, marginTop: 6 },
  fieldHintError: { fontSize: 11, color: '#DC2626', marginTop: 6 },
  fieldDivider: { height: 1, backgroundColor: BORDER, marginHorizontal: 14 },

  secureCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: TEAL_LIGHT, borderRadius: 16, padding: 14,
  },
  secureIconWrap: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center',
  },
  secureTitle: { fontSize: 13, fontWeight: '800', color: INK, marginBottom: 3 },
  secureText: { fontSize: 11.5, color: '#0F766E', lineHeight: 16 },
});