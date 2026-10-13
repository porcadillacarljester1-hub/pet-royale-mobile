import { useState, useEffect, useRef, type RefObject } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  LayoutAnimation,
  Platform,
  StatusBar,
  type TextInputProps,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  AlertCircle,
  Circle,
  CheckCircle2,
  XCircle,
  Eye,
  EyeOff,
  ShieldCheck,
  ChevronLeft,
} from 'lucide-react-native';
import { supabase } from '../../lib/supabase';
import { passwordProblem } from '../../lib/passwordPolicy';
import { colors, status, text, fonts, space, radius, shadow, common, hitSlop } from '../../constants/theme';
import { Skeleton } from '../../components/Skeleton';
import FloatField from '../../components/FloatField';
import { BUTTON_H } from '../../components/AuthShell';

/* The rules shown under "New password". They mirror lib/passwordPolicy.ts
   (12+ characters, upper, lower, number, symbol). This list only gives
   live feedback while typing; passwordProblem() stays the real check on
   submit, so if the policy changes, update both. */
const PASSWORD_RULES: { label: string; test: (v: string) => boolean }[] = [
  { label: 'At least 12 characters', test: (v) => v.length >= 12 },
  { label: 'An uppercase letter', test: (v) => /[A-Z]/.test(v) },
  { label: 'A lowercase letter', test: (v) => /[a-z]/.test(v) },
  { label: 'A number', test: (v) => /[0-9]/.test(v) },
  { label: 'A symbol', test: (v) => /[^A-Za-z0-9]/.test(v) },
];

/* One password field, used three times. It uses the same floating-label
   FloatField as the sign-in screen, and owns its own show/hide and focus
   state, so the screen only has to care about the values. */
function PasswordField({
  label,
  value,
  onChangeText,
  autoComplete,
  textContentType,
  inputRef,
  returnKeyType,
  onSubmitEditing,
  onFocus,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  autoComplete: TextInputProps['autoComplete'];
  textContentType: TextInputProps['textContentType'];
  inputRef?: RefObject<TextInput | null>;
  returnKeyType: TextInputProps['returnKeyType'];
  onSubmitEditing: () => void;
  onFocus?: () => void;
}) {
  const [show, setShow] = useState(false);
  const [focused, setFocused] = useState(false);

  return (
    <FloatField
      label={label}
      value={value}
      focused={focused}
      inputRef={inputRef}
      onChangeText={onChangeText}
      onFocus={() => {
        setFocused(true);
        onFocus?.();
      }}
      onBlur={() => setFocused(false)}
      secureTextEntry={!show}
      autoCapitalize="none"
      autoCorrect={false}
      autoComplete={autoComplete}
      textContentType={textContentType}
      returnKeyType={returnKeyType}
      blurOnSubmit={returnKeyType !== 'next'}
      onSubmitEditing={onSubmitEditing}
      right={
        <TouchableOpacity
          style={styles.eyeBtn}
          onPress={() => setShow((v) => !v)}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={show ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
        >
          {show
            ? <EyeOff size={20} color={colors.mutedFg} />
            : <Eye size={20} color={colors.mutedFg} />}
        </TouchableOpacity>
      }
    />
  );
}

export default function SecurityScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const statusBarHeight = Math.max(insets.top, StatusBar.currentHeight ?? 0);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // null while we find out how this account signs in, so a Google-only
  // account never sees the password form flash up first.
  const [usesPassword, setUsesPassword] = useState<boolean | null>(null);

  const newRef = useRef<TextInput>(null);
  const confirmRef = useRef<TextInput>(null);

  /* ── Keyboard handling (same approach as the sign-in screen) ──
     On edge-to-edge Android the window doesn't shrink for the keyboard, so
     we measure how much of this screen the keyboard covers and add that as
     bottom padding. The form can then scroll clear of it. */
  const rootRef = useRef<View>(null);
  const scrollRef = useRef<ScrollView>(null);
  const [kbPad, setKbPad] = useState(0);
  // While the keyboard is up the screen goes compact (smaller header, no
  // subtitle, tighter spacing) so the whole form and the button fit above it.
  const [kbOpen, setKbOpen] = useState(false);
  // Only let the screen scroll when the content really is taller than it.
  const [viewH, setViewH] = useState(0);
  const [contentH, setContentH] = useState(0);

  const scrollToBottomSoon = (ms = 150) => {
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), ms);
  };

  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', (e) => {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setKbOpen(true);
      rootRef.current?.measureInWindow((_x, y, _w, h) => {
        setKbPad(Math.max(0, y + h - e.endCoordinates.screenY));
        setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);
      });
    });
    const hide = Keyboard.addListener('keyboardDidHide', () => {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setKbOpen(false);
      setKbPad(0);
    });
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  useEffect(() => {
    supabase.auth.getUser()
      .then(({ data: { user } }) => {
        /* An account that signed up with email and later linked Google
           has both providers and does have a password to change. Only
           an account with no email provider is Google-only. */
        const meta = user?.app_metadata ?? {};
        const providers: string[] = meta.providers ?? (meta.provider ? [meta.provider] : []);
        setUsesPassword(providers.length === 0 || providers.includes('email'));
      })
      .catch(() => setUsesPassword(true)); // the server still enforces it
  }, []);

  const passwordsMatch = confirmPassword.length > 0 && newPassword === confirmPassword;
  /* Only call it a mismatch once what's typed has actually diverged from
     the new password. Flagging it after the first character, while the
     person is still typing, is just noise. */
  const passwordsMismatch =
    confirmPassword.length > 0 && !newPassword.startsWith(confirmPassword);

  /* Same idea as Personal information's "No changes to save": the button
     stays off until there is something to submit. Validation messages
     (policy, match, same-as-current) still appear on press. */
  const canSubmit =
    currentPassword.length > 0 && newPassword.length > 0 && confirmPassword.length > 0;
  const saveDisabled = saving || !canSubmit;

  /* Editing any field clears the last error, so a stale message never
     sits under a form the person has already started fixing. */
  const edit = (setter: (v: string) => void) => (v: string) => {
    setter(v);
    if (error) setError('');
  };

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/profile' as any);
  };

  const handleChangePassword = async () => {
    if (saving || !canSubmit) return;
    setError('');

    // Same rule the admin app enforces (see lib/passwordPolicy.ts).
    const problem = passwordProblem(newPassword);
    if (problem) {
      setError(problem);
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('New passwords do not match.');
      return;
    }
    if (newPassword === currentPassword) {
      setError('Choose a password that is different from your current one.');
      return;
    }

    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.email) {
        setError('Could not verify your account. Please try again.');
        return;
      }

      // Re-authenticate with the current password before allowing a change,
      // so someone with a stolen unlocked session can't silently take over
      // the account.
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: currentPassword,
      });

      if (signInError) {
        // Only a rejected credential means "wrong password". Rate limits
        // and network failures shouldn't be reported as one.
        if (signInError.status === 429) {
          setError('Too many attempts. Wait a minute and try again.');
        } else if (!signInError.status) {
          setError("Couldn't reach the server. Check your connection and try again.");
        } else if (signInError.status >= 500) {
          setError('Something went wrong on our side. Please try again in a moment.');
        } else {
          setError('Current password is incorrect.');
        }
        return;
      }

      const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
      if (updateError) {
        setError(updateError.message || 'Failed to update password.');
        return;
      }

      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      Alert.alert('Password updated', 'Your password has been changed.');
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View ref={rootRef} collapsable={false} style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.background} />

      {/* Same back button as the sign-in screen: a plain chevron, no circle. */}
      <View style={[styles.header, { paddingTop: statusBarHeight + space.sm }]}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={goBack}
          activeOpacity={0.7}
          hitSlop={hitSlop}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <ChevronLeft size={28} color={colors.primary} strokeWidth={2.2} />
        </TouchableOpacity>
        <Text style={styles.sectionTitle} accessibilityRole="header">
          Change password
        </Text>
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          ref={scrollRef}
          style={styles.flex}
          contentContainerStyle={[
            styles.form,
            { paddingBottom: insets.bottom + (kbOpen ? space.lg : space.xxxl) + kbPad },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          bounces={false}
          overScrollMode="never"
          scrollEnabled={contentH > viewH + 1}
          onLayout={(e) => setViewH(e.nativeEvent.layout.height)}
          onContentSizeChange={(_, h) => setContentH(h)}
        >
          {usesPassword === null ? (
            <SecuritySkeleton />
          ) : usesPassword ? (
            <>
              {!kbOpen && (
                <Text style={styles.sectionSub}>Use a strong password you do not use elsewhere.</Text>
              )}

              {error ? (
                <View style={styles.errorBox} accessibilityLiveRegion="polite">
                  <AlertCircle size={17} color={colors.destructive} />
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              ) : null}

              <View style={[styles.fields, kbOpen && styles.fieldsCompact]}>
                <PasswordField
                  label="Current password"
                  value={currentPassword}
                  onChangeText={edit(setCurrentPassword)}
                  autoComplete="current-password"
                  textContentType="password"
                  returnKeyType="next"
                  onSubmitEditing={() => newRef.current?.focus()}
                />

                <View>
                  <PasswordField
                    label="New password"
                    value={newPassword}
                    onChangeText={edit(setNewPassword)}
                    autoComplete="new-password"
                    textContentType="newPassword"
                    inputRef={newRef}
                    returnKeyType="next"
                    onSubmitEditing={() => confirmRef.current?.focus()}
                    onFocus={() => scrollToBottomSoon()}
                  />

                  {/* Ticks off as the person types. Icon and colour both
                      change, so it doesn't rely on colour alone. */}
                  <View style={[styles.rules, kbOpen && styles.rulesCompact]}>
                    {PASSWORD_RULES.map((rule) => {
                      const met = rule.test(newPassword);
                      return (
                        <View
                          key={rule.label}
                          style={styles.ruleRow}
                          accessible
                          accessibilityLabel={`${rule.label}, ${met ? 'met' : 'not met'}`}
                        >
                          {met
                            ? <CheckCircle2 size={15} color={colors.primary} strokeWidth={2} />
                            : <Circle size={15} color={colors.mutedFg} strokeWidth={1.8} />}
                          <Text style={[styles.ruleText, met && styles.ruleTextMet]}>
                            {rule.label}
                          </Text>
                        </View>
                      );
                    })}
                  </View>
                </View>

                <View>
                  <PasswordField
                    label="Confirm new password"
                    value={confirmPassword}
                    onChangeText={edit(setConfirmPassword)}
                    autoComplete="new-password"
                    textContentType="newPassword"
                    inputRef={confirmRef}
                    returnKeyType="go"
                    onSubmitEditing={handleChangePassword}
                    onFocus={() => scrollToBottomSoon()}
                  />

                  {passwordsMatch && (
                    <View style={styles.matchRow}>
                      <CheckCircle2 size={14} color={status.success.fg} />
                      <Text style={[styles.matchText, { color: status.success.fg }]}>
                        Passwords match
                      </Text>
                    </View>
                  )}
                  {passwordsMismatch && (
                    <View style={styles.matchRow}>
                      <XCircle size={14} color={colors.destructive} />
                      <Text style={[styles.matchText, { color: status.danger.fg }]}>
                        Passwords don&apos;t match
                      </Text>
                    </View>
                  )}
                </View>
              </View>

              <TouchableOpacity
                style={[
                  styles.saveBtn,
                  kbOpen && styles.saveBtnCompact,
                  !canSubmit && !saving && common.buttonPrimaryDisabled,
                  saving && styles.saveBtnBusy,
                ]}
                onPress={handleChangePassword}
                disabled={saveDisabled}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel="Update password"
                accessibilityState={{ disabled: saveDisabled, busy: saving }}
              >
                {saving ? (
                  <ActivityIndicator color={colors.primaryFg} />
                ) : (
                  <Text style={[styles.saveBtnText, !canSubmit && common.buttonPrimaryTextDisabled]}>
                    Update password
                  </Text>
                )}
              </TouchableOpacity>
            </>
          ) : (
            <View style={styles.providerNotice}>
              <View style={styles.providerIcon}>
                <ShieldCheck size={20} color={colors.primary} strokeWidth={1.9} />
              </View>
              <View style={styles.providerCopy}>
                <Text style={styles.providerTitle}>Signed in with Google</Text>
                <Text style={styles.providerSub}>
                  Your password is managed by Google, so there is nothing to change here.
                </Text>
              </View>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { ...common.screen },
  flex: { flex: 1 },

  form: { paddingHorizontal: space.xxl, paddingTop: space.lg },
  loader: { marginTop: space.xxxl },

  /* Same title style as "Welcome back" on the sign-in screen. */
  sectionTitle: {
    fontFamily: fonts.display,
    fontSize: 28,
    lineHeight: 34,
    letterSpacing: -0.5,
    color: colors.foreground,
  },
  sectionSub: {
    ...text.body,
    color: colors.mutedFg,
    marginTop: space.sm,
    marginBottom: space.xl,
  },

  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    backgroundColor: colors.destructiveBg,
    borderWidth: 1,
    borderColor: colors.destructive,
    borderRadius: radius.md,
    padding: space.md,
    marginBottom: space.lg,
  },
  errorText: { ...text.small, color: status.danger.fg, flex: 1 },

  /* No card around the fields: they sit straight on the background,
     like the sign-in form. */
  fields: { gap: space.md },
  fieldsCompact: { gap: space.sm },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    paddingHorizontal: space.lg,
  },
  backBtn: {
    width: BUTTON_H,
    height: BUTTON_H,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },

  eyeBtn: {
    width: BUTTON_H,
    height: BUTTON_H,
    alignItems: 'center',
    justifyContent: 'center',
  },

  rules: { gap: 6, marginTop: space.md },
  rulesCompact: { gap: 4, marginTop: space.sm },
  ruleRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  ruleText: { ...text.caption, color: colors.mutedFg },
  ruleTextMet: { color: colors.primary },

  matchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: space.sm,
  },
  matchText: { ...text.caption, fontFamily: text.bodyBold.fontFamily },

  saveBtn: {
    height: BUTTON_H,
    borderRadius: BUTTON_H / 2,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: space.xl,
    ...shadow.primary,
  },
  saveBtnBusy: { opacity: 0.75 },
  saveBtnCompact: { marginTop: space.lg },
  saveBtnText: { ...common.buttonPrimaryText },

  /* Same card and beige icon circle as the Profile tiles. */
  providerNotice: {
    ...common.card,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.lg,
  },
  providerIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.muted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  providerCopy: { flex: 1 },
  providerTitle: { ...text.bodyBold, color: colors.foreground },
  providerSub: { ...text.caption, color: colors.mutedFg, marginTop: 2 },
});

/* ── Loading state ──
   Shown for the moment it takes to learn how this account signs in.
   Shaped like the password form, the common case. */
function SecuritySkeleton() {
  return (
    <View accessibilityLabel="Loading" accessibilityLiveRegion="polite">
      <Skeleton width={140} height={16} />
      <Skeleton width="70%" height={12} style={{ marginTop: space.sm, marginBottom: space.lg }} />
      <View style={styles.fields}>
        {[0, 1, 2].map((i) => (
          <View key={i}>
            <Skeleton width="100%" height={BUTTON_H + 4} radius={radius.md} />
          </View>
        ))}
      </View>
      <Skeleton width="100%" height={BUTTON_H} radius={BUTTON_H / 2} style={{ marginTop: space.xl }} />
    </View>
  );
}
