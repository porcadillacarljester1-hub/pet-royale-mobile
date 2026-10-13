import { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, StatusBar,
  ScrollView, KeyboardAvoidingView, Keyboard, Platform, Alert,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../lib/supabase';
import { colors, status, text, space, common } from '../constants/theme';
import { Skeleton } from '../components/Skeleton';
import { ScreenHeader } from '../components/ScreenHeader';
import { PhoneInput } from '../components/PhoneInput';
import { getCountry, isValidMobile, toE164 } from '../lib/phone';
import { useClientProfile } from '../lib/useClientProfile';

type ClientProfile = ReturnType<typeof useClientProfile>;

/**
 * Edit mobile number. It saves straight to clients.phone, which is what
 * the clinic reads.
 *
 * NOT BUILT YET: confirming the number with a texted code. That needs an
 * SMS provider behind it (Supabase phone auth or Twilio). When it exists,
 * "Save" here becomes "Send code" and opens a code-entry screen; the
 * number should only be written to clients.phone after the code checks out.
 */
export default function AccountMobileScreen() {
  const profile = useClientProfile();

  /* The form only mounts once the profile has loaded, so its state can
     start with the right values. That removes the need for an effect that
     copies profile data into state after the first render. */
  /* `ready` never goes back to false, so a refocus-triggered reload can't
     unmount the form and wipe what's being typed. */
  const [ready, setReady] = useState(false);
  if (!profile.isLoading && !ready) setReady(true);

  if (!ready) {
    return (
      <View style={styles.container}>
        <ScreenHeader title="Mobile number" onBack={() => router.back()} large />
        <View style={styles.form}>
          <Skeleton width="100%" height={60} />
        </View>
      </View>
    );
  }

  return <AccountMobileForm profile={profile} />;
}

function AccountMobileForm({ profile }: { profile: ClientProfile }) {
  const insets = useSafeAreaInsets();
  const [countryIso, setCountryIso] = useState(profile.countryIso);
  const [national, setNational] = useState(profile.national);
  const [isSaving, setIsSaving] = useState(false);
  const [phoneError, setPhoneError] = useState('');
  const [keyboardOpen, setKeyboardOpen] = useState(false);

  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () => setKeyboardOpen(true));
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setKeyboardOpen(false));
    return () => { show.remove(); hide.remove(); };
  }, []);

  const country = getCountry(countryIso);
  const isDirty = countryIso !== profile.countryIso || national !== profile.national;
  const footerPadding = { paddingBottom: keyboardOpen ? space.md : space.xxl + insets.bottom };

  const handleSave = async () => {
    if (!national) {
      setPhoneError('The clinic needs a number to reach you.');
      return;
    }
    if (!isValidMobile(country, national)) {
      setPhoneError(`Enter a valid mobile number for ${country.name}.`);
      return;
    }
    if (!profile.user) return;

    Keyboard.dismiss();
    setIsSaving(true);
    setPhoneError('');

    const name = [profile.firstName, profile.lastName].filter(Boolean).join(' ');
    const { error } = await (supabase as any)
      .from('clients')
      .upsert(
        { id: profile.user.id, name, email: profile.user.email, phone: toE164(country, national) },
        { onConflict: 'id' }
      );

    setIsSaving(false);
    if (error) {
      Alert.alert('Couldn\u2019t save', 'Please check your connection and try again.');
      return;
    }
    router.back();
  };

  const handleBack = () => {
    if (!isDirty) return router.back();
    Alert.alert('Unsaved changes', 'Discard your changes?', [
      { text: 'Keep editing', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: () => router.back() },
    ]);
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.background} />
      <ScreenHeader title="Mobile number" onBack={handleBack} large />

      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.form}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        automaticallyAdjustKeyboardInsets
        showsVerticalScrollIndicator={false}
      >
        <View>
          {/* The label floats inside the number field, so there's no
              separate label line above it. */}
          <PhoneInput
            variant="float"
            label="Mobile number"
            iso={countryIso}
            national={national}
            onChangeIso={(iso) => { setCountryIso(iso); if (phoneError) setPhoneError(''); }}
            onChangeNational={(digits) => { setNational(digits); if (phoneError) setPhoneError(''); }}
            error={!!phoneError}
            editable={!isSaving}
          />
          <Text style={[styles.hint, !!phoneError && { color: status.danger.fg }]}>
            {phoneError || 'The clinic uses this for appointment and vaccine reminders.'}
          </Text>
        </View>
      </ScrollView>

      <View style={[styles.footer, footerPadding]}>
        <TouchableOpacity
          style={[styles.saveBtn, !isDirty && !isSaving && common.buttonPrimaryDisabled, isSaving && { opacity: 0.75 }]}
          onPress={handleSave}
          disabled={!isDirty || isSaving}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityState={{ disabled: !isDirty || isSaving, busy: isSaving }}
        >
          {isSaving ? (
            <ActivityIndicator color={colors.primaryFg} />
          ) : (
            <Text style={[common.buttonPrimaryText, !isDirty && common.buttonPrimaryTextDisabled]}>Save</Text>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { ...common.screen },
  flex: { flex: 1 },
  form: { padding: space.xxl, gap: space.lg },
  hint: { ...text.small, color: colors.mutedFg, marginTop: space.sm },
  footer: {
    paddingHorizontal: space.xxl,
    paddingTop: space.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
  },
  saveBtn: { ...common.buttonPrimary },
});
