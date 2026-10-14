import { useState, useEffect, useRef, type RefObject } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, StatusBar,
  ScrollView, KeyboardAvoidingView, Keyboard, Platform, Alert, type TextInputProps,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../lib/supabase';
import { colors, space, common, radius, fonts } from '../constants/theme';
import { Skeleton } from '../components/Skeleton';
import { ScreenHeader } from '../components/ScreenHeader';
import { tidy, useClientProfile } from '../lib/useClientProfile';

type ClientProfile = ReturnType<typeof useClientProfile>;

/* The field's size and shape, the same as the search bar on Pet Essentials
   and the password fields: a white pill, 52px tall, with a thin border
   that turns navy when focused. The label is the placeholder. */
const FIELD_H = 52;

/* Just the look of the field. It takes the same props the screen already
   passes (label, value, focused, handlers), so nothing else changes. */
function PillField({
  label, value, focused, inputRef, onChangeText, onFocus, onBlur, ...inputProps
}: {
  label: string;
  value: string;
  focused: boolean;
  inputRef?: RefObject<TextInput | null>;
  onChangeText: (v: string) => void;
  onFocus: () => void;
  onBlur: () => void;
} & Omit<TextInputProps, 'style' | 'value' | 'onChangeText' | 'onFocus' | 'onBlur'>) {
  return (
    <View style={[styles.field, focused && styles.fieldFocused]}>
      <TextInput
        {...inputProps}
        ref={inputRef}
        style={styles.fieldInput}
        value={value}
        onChangeText={onChangeText}
        onFocus={onFocus}
        onBlur={onBlur}
        placeholder={label}
        placeholderTextColor={colors.mutedFg}
        accessibilityLabel={label}
        selectionColor={colors.primary}
      />
    </View>
  );
}

/** Edit name: first and last name, saved to the clients row and kept in
    step in auth metadata (see useClientProfile for why). */
export default function AccountNameScreen() {
  const profile = useClientProfile();

  /* Show the skeleton only until the profile has loaded the first time.
     `ready` never goes back to false, so a refocus-triggered reload can't
     unmount the form and wipe what's being typed. Setting state during
     render like this is the supported way to react to a prop change. */
  const [ready, setReady] = useState(false);
  if (!profile.isLoading && !ready) setReady(true);

  if (!ready) {
    return (
      <View style={styles.container}>
        <ScreenHeader title="Account name" onBack={() => router.back()} large />
        <View style={styles.form}>
          <Skeleton width="100%" height={FIELD_H} radius={radius.pill} />
          <Skeleton width="100%" height={FIELD_H} radius={radius.pill} />
        </View>
      </View>
    );
  }

  return <AccountNameForm profile={profile} />;
}

function AccountNameForm({ profile }: { profile: ClientProfile }) {
  const insets = useSafeAreaInsets();
  const [firstName, setFirstName] = useState(profile.firstName);
  const [lastName, setLastName] = useState(profile.lastName);
  const [isSaving, setIsSaving] = useState(false);
  const [focused, setFocused] = useState<'first' | 'last' | null>(null);
  const [keyboardOpen, setKeyboardOpen] = useState(false);

  const firstRef = useRef<TextInput>(null);
  const lastRef = useRef<TextInput>(null);

  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () => setKeyboardOpen(true));
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setKeyboardOpen(false));
    return () => { show.remove(); hide.remove(); };
  }, []);

  const isDirty = firstName !== profile.firstName || lastName !== profile.lastName;
  const footerPadding = { paddingBottom: keyboardOpen ? space.md : space.xxl + insets.bottom };

  const handleSave = async () => {
    const first = tidy(firstName);
    const last = tidy(lastName);
    if (!first) {
      Alert.alert('Required', 'Please enter your first name.');
      return;
    }
    if (!profile.user) return;

    Keyboard.dismiss();
    setIsSaving(true);
    const full_name = [first, last].filter(Boolean).join(' ');

    const { error } = await (supabase as any)
      .from('clients')
      .upsert({ id: profile.user.id, name: full_name, email: profile.user.email }, { onConflict: 'id' });

    if (error) {
      setIsSaving(false);
      Alert.alert('Couldn\u2019t save', 'Please check your connection and try again.');
      return;
    }

    await supabase.auth.updateUser({ data: { full_name, first_name: first, last_name: last } });
    setIsSaving(false);
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
      <ScreenHeader title="Account name" onBack={handleBack} large />

      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.form}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        automaticallyAdjustKeyboardInsets
        showsVerticalScrollIndicator={false}
      >
        <PillField
          label="First name"
          value={firstName}
          focused={focused === 'first'}
          inputRef={firstRef}
          onChangeText={setFirstName}
          onFocus={() => setFocused('first')}
          onBlur={() => setFocused(null)}
          autoCapitalize="words"
          autoComplete="name-given"
          returnKeyType="next"
          blurOnSubmit={false}
          onSubmitEditing={() => lastRef.current?.focus()}
          editable={!isSaving}
        />
        <PillField
          label="Last name"
          value={lastName}
          focused={focused === 'last'}
          inputRef={lastRef}
          onChangeText={setLastName}
          onFocus={() => setFocused('last')}
          onBlur={() => setFocused(null)}
          autoCapitalize="words"
          autoComplete="name-family"
          returnKeyType="done"
          editable={!isSaving}
        />
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

  /* The pill field: white, thin border, navy and slightly thicker when
     focused. */
  field: {
    minHeight: FIELD_H,
    justifyContent: 'center',
    paddingHorizontal: space.lg,
    backgroundColor: colors.card,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  fieldFocused: { borderColor: colors.primary, borderWidth: 1.5 },
  fieldInput: {
    paddingVertical: 12,
    fontFamily: fonts.body,
    fontSize: 16,
    color: colors.foreground,
  },

  footer: {
    paddingHorizontal: space.xxl,
    paddingTop: space.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
  },
  /* Flat: the shadow drew a pale box around the button on Android. */
  saveBtn: { ...common.buttonPrimary },
});
