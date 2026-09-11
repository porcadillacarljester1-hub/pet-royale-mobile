import { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'expo-router';

const TEAL = '#0D9488';
const TEAL_LIGHT = '#CCFBF1';
const BORDER = '#E5E7EB';
const SUB = '#6B7280';
const INK = '#111827';
const BG = '#F4F7FB';

export default function SecurityScreen() {
  const router = useRouter();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [deleting, setDeleting] = useState(false);

  const passwordsMatch = confirmPassword.length > 0 && newPassword === confirmPassword;
  const passwordsMismatch = confirmPassword.length > 0 && newPassword !== confirmPassword;

  const handleChangePassword = async () => {
    setError('');

    if (!currentPassword || !newPassword || !confirmPassword) {
      setError('Please fill in all fields.');
      return;
    }
    if (newPassword.length < 6) {
      setError('New password must be at least 6 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('New passwords do not match.');
      return;
    }

    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.email) {
        setError('Could not verify your account. Please try again.');
        setSaving(false);
        return;
      }

      // Re-authenticate with the current password before allowing a change,
      // so someone with a stolen unlocked session can't silently take over the account.
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: currentPassword,
      });

      if (signInError) {
        setError('Current password is incorrect.');
        setSaving(false);
        return;
      }

      const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
      if (updateError) {
        setError(updateError.message || 'Failed to update password.');
        setSaving(false);
        return;
      }

      Alert.alert('Password Updated', 'Your password has been changed successfully.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete Account',
      'This will permanently remove your account and pet records. This cannot be undone. Please contact clinic support to proceed with account deletion.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Contact Support',
          onPress: () => {
            router.push('/(tabs)/help' as any);
          },
        },
      ]
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={22} color={INK} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Security</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.form}>
          <Text style={styles.sectionTitle}>Change Password</Text>
          <Text style={styles.sectionSub}>
            Enter your current password, then choose a new one.
          </Text>

          {error ? (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle-outline" size={16} color="#DC2626" />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <View style={styles.card}>
            <Text style={styles.label}>Current Password</Text>
            <View style={styles.inputWrap}>
              <TextInput
                style={styles.input}
                placeholder="Enter current password"
                placeholderTextColor="#9CA3AF"
                secureTextEntry={!showCurrent}
                value={currentPassword}
                onChangeText={setCurrentPassword}
              />
              <TouchableOpacity onPress={() => setShowCurrent((v) => !v)} style={styles.eyeBtn}>
                <Ionicons name={showCurrent ? 'eye-off-outline' : 'eye-outline'} size={18} color={SUB} />
              </TouchableOpacity>
            </View>

            <View style={styles.divider} />

            <Text style={styles.label}>New Password</Text>
            <View style={styles.inputWrap}>
              <TextInput
                style={styles.input}
                placeholder="At least 6 characters"
                placeholderTextColor="#9CA3AF"
                secureTextEntry={!showNew}
                value={newPassword}
                onChangeText={setNewPassword}
              />
              <TouchableOpacity onPress={() => setShowNew((v) => !v)} style={styles.eyeBtn}>
                <Ionicons name={showNew ? 'eye-off-outline' : 'eye-outline'} size={18} color={SUB} />
              </TouchableOpacity>
            </View>

            <Text style={styles.label}>Confirm New Password</Text>
            <View style={styles.inputWrap}>
              <TextInput
                style={[
                  styles.input,
                  passwordsMatch && { color: '#059669' },
                  passwordsMismatch && { color: '#DC2626' },
                ]}
                placeholder="Re-enter new password"
                placeholderTextColor="#9CA3AF"
                secureTextEntry={!showConfirm}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
              />
              <TouchableOpacity onPress={() => setShowConfirm((v) => !v)} style={styles.eyeBtn}>
                <Ionicons name={showConfirm ? 'eye-off-outline' : 'eye-outline'} size={18} color={SUB} />
              </TouchableOpacity>
            </View>

            {passwordsMatch && (
              <View style={styles.matchRow}>
                <Ionicons name="checkmark-circle" size={13} color="#059669" />
                <Text style={styles.matchText}>Passwords match</Text>
              </View>
            )}
            {passwordsMismatch && (
              <View style={styles.matchRow}>
                <Ionicons name="close-circle" size={13} color="#DC2626" />
                <Text style={[styles.matchText, { color: '#DC2626' }]}>Passwords don't match</Text>
              </View>
            )}
          </View>

          <TouchableOpacity
            style={styles.saveBtn}
            onPress={handleChangePassword}
            disabled={saving}
            activeOpacity={0.85}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="shield-checkmark" size={17} color="#fff" />
                <Text style={styles.saveBtnText}>Update Password</Text>
              </>
            )}
          </TouchableOpacity>

          {/* ── Session info ── */}
          <Text style={[styles.sectionTitle, { marginTop: 28 }]}>Account Protection</Text>
          <View style={styles.card}>
            <View style={styles.infoRow}>
              <View style={styles.infoIconWrap}>
                <Ionicons name="mail-outline" size={16} color={TEAL} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.infoLabel}>Login Method</Text>
                <Text style={styles.infoValue}>Email & Password</Text>
              </View>
            </View>
          </View>

          {/* ── Danger zone ── */}
          <Text style={[styles.sectionTitle, { marginTop: 28, color: '#DC2626' }]}>Danger Zone</Text>
          <TouchableOpacity style={styles.dangerCard} onPress={handleDeleteAccount} activeOpacity={0.7}>
            <Ionicons name="trash-outline" size={18} color="#DC2626" />
            <View style={{ flex: 1 }}>
              <Text style={styles.dangerTitle}>Delete Account</Text>
              <Text style={styles.dangerSub}>Permanently remove your account and data</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color="#FCA5A5" />
          </TouchableOpacity>

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
    backgroundColor: '#fff',
    paddingHorizontal: 12, paddingTop: 52, paddingBottom: 14,
    borderBottomWidth: 1, borderBottomColor: BORDER,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: BG, alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { fontSize: 16, fontWeight: '800', color: INK },

  scroll: { flex: 1 },
  form: { padding: 16 },

  sectionTitle: { fontSize: 14, fontWeight: '800', color: INK, marginBottom: 4 },
  sectionSub: { fontSize: 12.5, color: SUB, marginBottom: 14, lineHeight: 18 },

  errorBox: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FECACA',
    borderRadius: 8, padding: 10, marginBottom: 14,
  },
  errorText: { color: '#DC2626', fontSize: 12.5, flex: 1 },

  card: {
    backgroundColor: '#fff', borderRadius: 14, padding: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04, shadowRadius: 5, elevation: 1,
  },
  divider: { height: 1, backgroundColor: BORDER, marginVertical: 14 },

  label: {
    fontSize: 11, fontWeight: '700', color: SUB,
    letterSpacing: 0.8, textTransform: 'uppercase',
    marginBottom: 7,
  },
  inputWrap: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: BG, borderWidth: 1.5, borderColor: BORDER,
    borderRadius: 10, paddingHorizontal: 13, marginBottom: 14,
  },
  input: { flex: 1, paddingVertical: 12, fontSize: 14, color: INK },
  eyeBtn: { padding: 4 },

  matchRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: -8 },
  matchText: { fontSize: 12, fontWeight: '600', color: '#059669' },

  saveBtn: {
    backgroundColor: TEAL, borderRadius: 10,
    paddingVertical: 14, marginTop: 16,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  saveBtnText: { color: '#fff', fontSize: 14, fontWeight: '800' },

  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  infoIconWrap: {
    width: 34, height: 34, borderRadius: 10,
    backgroundColor: TEAL_LIGHT, alignItems: 'center', justifyContent: 'center',
  },
  infoLabel: { fontSize: 10.5, color: SUB, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.6 },
  infoValue: { fontSize: 13.5, color: INK, fontWeight: '600', marginTop: 2 },

  dangerCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#fff', borderRadius: 14, padding: 16,
    borderWidth: 1, borderColor: '#FECACA',
  },
  dangerTitle: { fontSize: 13.5, fontWeight: '700', color: '#DC2626' },
  dangerSub: { fontSize: 11.5, color: '#F87171', marginTop: 2 },
});