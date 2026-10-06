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
  KeyboardAvoidingView,
  Platform,
  StatusBar,
  type TextInputProps,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  AlertCircle,
  CheckCircle2,
  XCircle,
  Eye,
  EyeOff,
  ShieldCheck,
} from 'lucide-react-native';
import { supabase } from '../../lib/supabase';
import { PASSWORD_HINT, passwordProblem } from '../../lib/passwordPolicy';
import { colors, status, text, space, radius, shadow, common, hitSlop } from '../../constants/theme';
import { Skeleton } from '../../components/Skeleton';
import { ScreenHeader } from '../../components/ScreenHeader';

/* One password field, used three times. It owns its own show/hide and
   focus state, so the screen only has to care about the values. */
function PasswordField({
  label,
  value,
  onChangeText,
  placeholder,
  hint,
  autoComplete,
  textContentType,
  inputRef,
  returnKeyType,
  onSubmitEditing,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder: string;
  hint?: string;
  autoComplete: TextInputProps['autoComplete'];
  textContentType: TextInputProps['textContentType'];
  inputRef?: RefObject<TextInput | null>;
  returnKeyType: TextInputProps['returnKeyType'];
  onSubmitEditing: () => void;
}) {
  const [show, setShow] = useState(false);
  const [focused, setFocused] = useState(false);

  return (
    <View>
      <Text style={styles.label}>{label}</Text>
      <View style={[styles.inputWrap, focused && styles.inputWrapFocused]}>
        <TextInput
          ref={inputRef}
          style={styles.input}
          placeholder={placeholder}
          placeholderTextColor={colors.mutedFg}
          secureTextEntry={!show}
          value={value}
          onChangeText={onChangeText}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete={autoComplete}
          textContentType={textContentType}
          returnKeyType={returnKeyType}
          blurOnSubmit={returnKeyType !== 'next'}
          onSubmitEditing={onSubmitEditing}
        />
        <TouchableOpacity
          onPress={() => setShow((v) => !v)}
          activeOpacity={0.7}
          hitSlop={hitSlop}
          accessibilityRole="button"
          accessibilityLabel={show ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
        >
          {show
            ? <EyeOff size={18} color={colors.mutedFg} />
            : <Eye size={18} color={colors.mutedFg} />}
        </TouchableOpacity>
      </View>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

export default function SecurityScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

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
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.background} />

      <ScreenHeader title="Security" onBack={goBack} />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          style={styles.flex}
          contentContainerStyle={[styles.form, { paddingBottom: insets.bottom + space.xxxl }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {usesPassword === null ? (
            <SecuritySkeleton />
          ) : usesPassword ? (
            <>
              <Text style={styles.sectionTitle}>Change password</Text>
              <Text style={styles.sectionSub}>Use a strong password you do not use elsewhere.</Text>

              {error ? (
                <View style={styles.errorBox} accessibilityLiveRegion="polite">
                  <AlertCircle size={17} color={colors.destructive} />
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              ) : null}

              <View style={styles.card}>
                <PasswordField
                  label="Current password"
                  value={currentPassword}
                  onChangeText={edit(setCurrentPassword)}
                  placeholder="Enter current password"
                  autoComplete="current-password"
                  textContentType="password"
                  returnKeyType="next"
                  onSubmitEditing={() => newRef.current?.focus()}
                />

                <View style={styles.divider} />

                <PasswordField
                  label="New password"
                  value={newPassword}
                  onChangeText={edit(setNewPassword)}
                  placeholder="Enter new password"
                  hint={PASSWORD_HINT}
                  autoComplete="new-password"
                  textContentType="newPassword"
                  inputRef={newRef}
                  returnKeyType="next"
                  onSubmitEditing={() => confirmRef.current?.focus()}
                />

                <View>
                  <PasswordField
                    label="Confirm new password"
                    value={confirmPassword}
                    onChangeText={edit(setConfirmPassword)}
                    placeholder="Re-enter new password"
                    autoComplete="new-password"
                    textContentType="newPassword"
                    inputRef={confirmRef}
                    returnKeyType="go"
                    onSubmitEditing={handleChangePassword}
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
                  <>
                    <ShieldCheck
                      size={17}
                      color={canSubmit ? colors.primaryFg : colors.mutedFg}
                    />
                    <Text style={[styles.saveBtnText, !canSubmit && common.buttonPrimaryTextDisabled]}>
                      Update password
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </>
          ) : (
            <View style={styles.providerNotice}>
              <View style={styles.providerIcon}>
                <ShieldCheck size={19} color={colors.primary} strokeWidth={1.9} />
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

  form: { padding: space.xl },
  loader: { marginTop: space.xxxl },

  sectionTitle: { ...text.heading, color: colors.foreground, marginBottom: space.xs },
  sectionSub: { ...text.small, color: colors.mutedFg, marginBottom: space.lg },

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

  card: { ...common.card, gap: space.lg },
  divider: { ...common.divider },

  label: { ...common.label },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    height: 52,
    backgroundColor: colors.white,
    borderWidth: 1.5,
    borderColor: colors.input,
    borderRadius: radius.md,
    paddingHorizontal: space.lg,
  },
  inputWrapFocused: { borderColor: colors.primary },
  input: { flex: 1, ...text.body, color: colors.foreground, padding: 0 },
  hint: { ...text.caption, color: colors.mutedFg, marginTop: space.xs },

  matchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: space.sm,
  },
  matchText: { ...text.caption, fontFamily: text.bodyBold.fontFamily },

  saveBtn: {
    ...common.buttonPrimary,
    marginTop: space.xl,
    ...shadow.primary,
  },
  saveBtnBusy: { opacity: 0.75 },
  saveBtnText: { ...common.buttonPrimaryText },

  providerNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    backgroundColor: colors.secondary,
    borderRadius: radius.card,
    padding: space.lg,
  },
  providerIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  providerCopy: { flex: 1 },
  providerTitle: { ...text.bodyBold, color: colors.secondaryFg },
  providerSub: { ...text.caption, color: colors.secondaryFg, marginTop: 2 },
});

/* ── Loading state ──
   Shown for the moment it takes to learn how this account signs in.
   Shaped like the password form, the common case. */
function SecuritySkeleton() {
  return (
    <View accessibilityLabel="Loading" accessibilityLiveRegion="polite">
      <Skeleton width={140} height={16} />
      <Skeleton width="70%" height={12} style={{ marginTop: space.sm, marginBottom: space.lg }} />
      <View style={styles.card}>
        {[0, 1, 2].map((i) => (
          <View key={i}>
            <Skeleton width={110} height={12} style={{ marginBottom: space.sm }} />
            <Skeleton width="100%" height={52} radius={radius.md} />
          </View>
        ))}
      </View>
      <Skeleton width="100%" height={52} radius={radius.lg} style={{ marginTop: space.xl }} />
    </View>
  );
}
