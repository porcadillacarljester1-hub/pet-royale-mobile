import { useState, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, StatusBar,
  ScrollView, KeyboardAvoidingView, Keyboard, Platform, Alert, type TextInputProps,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../lib/supabase';
import { colors, space, common, radius, fonts } from '../constants/theme';
import { Skeleton } from './Skeleton';
import { ScreenHeader } from './ScreenHeader';
import { useClientProfile } from '../lib/useClientProfile';

type ClientProfile = ReturnType<typeof useClientProfile>;

const FIELD_H = 52;

export type SingleFieldEditProps = {
  /** Screen header, e.g. "Address". */
  title: string;
  /** Placeholder / accessibility label of the field. */
  label: string;
  /** The clients column to save to. Also the auth metadata key. */
  column: 'address' | 'fb_messenger';
  /** The current saved value, taken from the loaded profile. */
  initialOf: (profile: ClientProfile) => string;
  /** Tidies the typed value before it is checked and saved. */
  normalize: (value: string) => string;
  /** A message if the value isn't acceptable, otherwise null. */
  problem: (value: string) => string | null;
  /** Keyboard and autofill settings for this field. */
  inputProps?: Omit<TextInputProps, 'style' | 'value' | 'onChangeText' | 'onFocus' | 'onBlur'>;
};

/**
 * One text field with a Save button, in the same style as Account name.
 * Used by Address and Messenger. Saved to the clients row and kept in step
 * in auth metadata, the same way the name is (see useClientProfile).
 */
export default function SingleFieldEditScreen(props: SingleFieldEditProps) {
  const profile = useClientProfile();

  /* Show the skeleton only until the profile has loaded the first time.
     `ready` never goes back to false, so a refocus-triggered reload can't
     unmount the form and wipe what's being typed. */
  const [ready, setReady] = useState(false);
  if (!profile.isLoading && !ready) setReady(true);

  if (!ready) {
    return (
      <View style={styles.container}>
        <ScreenHeader title={props.title} onBack={() => router.back()} large />
        <View style={styles.form}>
          <Skeleton width="100%" height={FIELD_H} radius={radius.pill} />
        </View>
      </View>
    );
  }

  return <EditForm profile={profile} {...props} />;
}

function EditForm({
  profile, title, label, column, initialOf, normalize, problem, inputProps,
}: SingleFieldEditProps & { profile: ClientProfile }) {
  const insets = useSafeAreaInsets();
  const initial = initialOf(profile);
  const [value, setValue] = useState(initial);
  const [isSaving, setIsSaving] = useState(false);
  const [focused, setFocused] = useState(false);
  const [keyboardOpen, setKeyboardOpen] = useState(false);

  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () => setKeyboardOpen(true));
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setKeyboardOpen(false));
    return () => { show.remove(); hide.remove(); };
  }, []);

  const isDirty = normalize(value) !== normalize(initial);
  const footerPadding = { paddingBottom: keyboardOpen ? space.md : space.xxl + insets.bottom };

  const handleSave = async () => {
    const clean = normalize(value);
    const message = problem(clean);
    if (message) {
      Alert.alert(`Check your ${label.toLowerCase()}`, message);
      return;
    }
    if (!profile.user) return;

    Keyboard.dismiss();
    setIsSaving(true);

    const { error } = await (supabase as any)
      .from('clients')
      .upsert({ id: profile.user.id, [column]: clean, email: profile.user.email }, { onConflict: 'id' });

    if (error) {
      setIsSaving(false);
      Alert.alert('Couldn\u2019t save', 'Please check your connection and try again.');
      return;
    }

    await supabase.auth.updateUser({ data: { [column]: clean } });
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
      <ScreenHeader title={title} onBack={handleBack} large />

      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.form}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        automaticallyAdjustKeyboardInsets
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.field, focused && styles.fieldFocused]}>
          <TextInput
            {...inputProps}
            ref={inputRef}
            style={styles.fieldInput}
            value={value}
            onChangeText={setValue}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder={inputProps?.placeholder ?? label}
            placeholderTextColor={colors.mutedFg}
            accessibilityLabel={label}
            selectionColor={colors.primary}
            returnKeyType="done"
            editable={!isSaving}
          />
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
  saveBtn: { ...common.buttonPrimary },
});
