import { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert, Image, TextInput,
  StatusBar, Platform
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'expo-router';

const NAVY = '#12175e';
const GOLD = '#c9a227';
const CREAM_BORDER = '#e8e0cc';
const TAUPE = '#8a7d5a';
const BG = '#f5f0e8';

function Icon({ name, emoji, size = 20, color = NAVY }: { name: any; emoji: string; size?: number; color?: string }) {
  if (Platform.OS === 'web') return <Text style={{ fontSize: size * 0.85 }}>{emoji}</Text>;
  return <Ionicons name={name} size={size} color={color} />;
}

export default function AccountScreen() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  // Fields
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => { fetchUserData(); }, []);

  const fetchUserData = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      setUser(user);
      const full = user.user_metadata?.full_name || '';
      const parts = full.split(' ');
      setFirstName(parts[0] || '');
      setLastName(parts.slice(1).join(' ') || '');
      setPhone(user.user_metadata?.phone || '');
      setAddress(user.user_metadata?.address || '');
      setAvatarUrl(user.user_metadata?.avatar_url || null);
    }
    setIsLoading(false);
  };

  const handleSave = async () => {
    if (!firstName.trim()) { Alert.alert('Error', 'First name cannot be empty.'); return; }
    setIsSaving(true);
    const full_name = [firstName.trim(), lastName.trim()].filter(Boolean).join(' ');
    const { error } = await supabase.auth.updateUser({
      data: { full_name, phone, address },
    });
    setIsSaving(false);
    if (error) { Alert.alert('Error', 'Failed to save changes.'); return; }
    Alert.alert('Saved', 'Your info has been updated.');
    await fetchUserData();
  };

  const handleLogout = () => {
    Alert.alert('Log Out', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log Out', style: 'destructive',
        onPress: async () => {
          await supabase.auth.signOut();
          router.replace('/');
        },
      },
    ]);
  };

  const initials = (firstName?.[0] || user?.email?.[0] || '?').toUpperCase();

  if (isLoading) {
    return <View style={styles.loadingWrap}><ActivityIndicator size="large" color={NAVY} /></View>;
  }

  return (
    <>
      <StatusBar barStyle="light-content" backgroundColor={NAVY} />

      {/* ── Header ── */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} activeOpacity={0.7}>
          <Icon name="chevron-back" emoji="‹" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Account</Text>
        {isSaving ? (
          <ActivityIndicator color={GOLD} size="small" style={{ marginRight: 16 }} />
        ) : (
          <TouchableOpacity onPress={handleSave} activeOpacity={0.7} style={{ marginRight: 16 }}>
            <Text style={styles.headerDone}>Done</Text>
          </TouchableOpacity>
        )}
      </View>

      <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>

        {/* ── Avatar row ── */}
        <View style={styles.avatarRow}>
          {avatarUrl ? (
            <Image source={{ uri: avatarUrl }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarFallback}>
              <Text style={styles.avatarInitials}>{initials}</Text>
            </View>
          )}
          <View>
            <Text style={styles.avatarName}>{[firstName, lastName].filter(Boolean).join(' ') || 'Pet Owner'}</Text>
            <Text style={styles.avatarEmail}>{user?.email}</Text>
          </View>
        </View>

        {/* ── YOUR INFO ── */}
        <Text style={styles.groupLabel}>Your Info</Text>
        <View style={styles.card}>
          {/* Phone */}
          <View style={styles.fieldRow}>
            <Icon name="call-outline" emoji="📞" size={18} color={TAUPE} />
            <View style={styles.fieldBody}>
              <TextInput
                style={styles.fieldInput}
                value={phone}
                onChangeText={setPhone}
                placeholder="Phone number"
                placeholderTextColor="#bbb"
                keyboardType="phone-pad"
              />
              <Text style={styles.fieldHint}>Phone</Text>
            </View>
          </View>
          <View style={styles.divider} />
          {/* Address / username-style */}
          <View style={styles.fieldRow}>
            <Icon name="location-outline" emoji="📍" size={18} color={TAUPE} />
            <View style={styles.fieldBody}>
              <TextInput
                style={styles.fieldInput}
                value={address}
                onChangeText={setAddress}
                placeholder="Address"
                placeholderTextColor="#bbb"
              />
              <Text style={styles.fieldHint}>Address</Text>
            </View>
          </View>
        </View>

        {/* ── YOUR NAME ── */}
        <Text style={styles.groupLabel}>Your Name</Text>
        <View style={styles.card}>
          <View style={styles.fieldRow}>
            <View style={styles.fieldBody}>
              <TextInput
                style={styles.fieldInput}
                value={firstName}
                onChangeText={setFirstName}
                placeholder="First name"
                placeholderTextColor="#bbb"
              />
            </View>
          </View>
          <View style={styles.divider} />
          <View style={styles.fieldRow}>
            <View style={styles.fieldBody}>
              <TextInput
                style={styles.fieldInput}
                value={lastName}
                onChangeText={setLastName}
                placeholder="Last name (optional)"
                placeholderTextColor="#bbb"
              />
            </View>
          </View>
        </View>

        {/* ── ADD ACCOUNT + LOG OUT ── */}
        <View style={[styles.card, { marginTop: 24 }]}>
          <TouchableOpacity
            style={styles.actionRow}
            activeOpacity={0.7}
            onPress={() => Alert.alert('Add Account', 'Multiple account support coming soon.')}
          >
            <View style={[styles.actionIcon, { backgroundColor: '#3a7bd5' }]}>
              <Icon name="person-add-outline" emoji="➕" size={16} color="#fff" />
            </View>
            <Text style={styles.actionLabel}>Add Account</Text>
          </TouchableOpacity>

          <View style={styles.divider} />

          <TouchableOpacity style={styles.actionRow} activeOpacity={0.7} onPress={handleLogout}>
            <View style={[styles.actionIcon, { backgroundColor: '#fdecea' }]}>
              <Icon name="log-out-outline" emoji="🚪" size={16} color="#c0392b" />
            </View>
            <Text style={[styles.actionLabel, { color: '#c0392b' }]}>Log Out</Text>
          </TouchableOpacity>
        </View>

        <View style={{ height: 48 }} />
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: BG },

  // Header
  header: {
    backgroundColor: NAVY,
    paddingTop: Platform.OS === 'ios' ? 54 : 36,
    paddingBottom: 12,
    paddingHorizontal: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  backBtn: { padding: 4, marginRight: 4 },
  headerTitle: { flex: 1, color: '#fff', fontSize: 18, fontWeight: '700' },
  headerDone: { color: GOLD, fontSize: 15, fontWeight: '700' },

  // Avatar row
  avatarRow: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    paddingHorizontal: 16, paddingVertical: 20,
    backgroundColor: '#fff',
    borderBottomWidth: 1, borderBottomColor: CREAM_BORDER,
    marginBottom: 24,
  },
  avatar: { width: 56, height: 56, borderRadius: 28 },
  avatarFallback: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: GOLD, alignItems: 'center', justifyContent: 'center',
  },
  avatarInitials: { fontSize: 20, fontWeight: '800', color: NAVY },
  avatarName: { fontSize: 16, fontWeight: '700', color: NAVY, marginBottom: 2 },
  avatarEmail: { fontSize: 12, color: TAUPE },

  // Group label (like "Your Info", "Your Name")
  groupLabel: {
    fontSize: 13, fontWeight: '700', color: NAVY,
    marginHorizontal: 16, marginBottom: 6,
  },

  // Card
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1, borderColor: CREAM_BORDER,
    marginHorizontal: 14,
    marginBottom: 8,
    overflow: 'hidden',
  },
  divider: { height: 1, backgroundColor: CREAM_BORDER, marginLeft: 16 },

  // Editable field row
  fieldRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 10, gap: 12,
  },
  fieldBody: { flex: 1 },
  fieldInput: { fontSize: 15, color: NAVY, paddingVertical: 2 },
  fieldHint: { fontSize: 11, color: TAUPE, marginTop: 2 },

  // Action row (Add Account / Log Out)
  actionRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14, gap: 12,
  },
  actionIcon: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  actionLabel: { fontSize: 14, fontWeight: '600', color: NAVY },
});
