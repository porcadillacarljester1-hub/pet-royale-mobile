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
  LayoutAnimation,
  Platform,
  StatusBar,
  type TextInputProps,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  AlertCircle,
  Check,
  XCircle,
  CheckCircle2,
  Eye,
  EyeOff,
  ShieldCheck,
  ChevronLeft,
} from 'lucide-react-native';
import { supabase } from '../../lib/supabase';
import { passwordProblem } from '../../lib/passwordPolicy';
import { colors, status, text, fonts, space, radius, shadow, common, hitSlop } from '../../constants/theme';
import { Skeleton } from '../../components/Skeleton';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
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

/* On tablets and landscape the form stays a readable column instead of
   stretching across the whole screen. */
const MAX_FORM_WIDTH = 560;

/* The field's size and shape, the same as the search bar on Pet
   Essentials: a white pill, 52px tall, with a thin border that turns navy
   when focused. The label is the placeholder inside the field. */
const FIELD_H = 52;

/* One password field, used three times. It has a show/hide eye, and owns
   its own show/hide and focus state, so the screen only has to care
   about the values. The label is the placeholder, as in the Pet Essentials
   search bar; it is also the accessibility label. */
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
  invalid = false,
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
  invalid?: boolean;
}) {
  const [show, setShow] = useState(false);
  const [focused, setFocused] = useState(false);

  return (
    <View
      style={[
        styles.field,
        focused && styles.fieldFocused,
        invalid && styles.fieldInvalid,
      ]}
    >
      <TextInput
        ref={inputRef}
        style={styles.fieldInput}
        value={value}
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
        placeholder={label}
        placeholderTextColor={colors.mutedFg}
        accessibilityLabel={label}
        selectionColor={colors.primary}
      />
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
    </View>
  );
}

export default function SecurityScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const statusBarHeight = Math.max(insets.top, StatusBar.currentHeight ?? 0);
  // Keeps content clear of a notch or rounded corner in landscape.
  const sideInset = Math.max(insets.left, insets.right);

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

  /* ── Keyboard handling ──
     The app runs edge-to-edge, so the window doesn't shrink for the
     keyboard. react-native-keyboard-controller's KeyboardAvoidingView
     (below) shrinks the form area by exactly the space the keyboard covers,
     which lifts the pinned button right above the keys on every device. */
  const scrollRef = useRef<ScrollView>(null);
  // While the keyboard is up the screen goes compact (no subtitle, tighter
  // spacing) so as much of the form as possible stays in view.
  const [kbOpen, setKbOpen] = useState(false);
  // Only let the screen scroll when the content really is taller than it.
  const [viewH, setViewH] = useState(0);
  const [contentH, setContentH] = useState(0);

  const scrollToBottomSoon = (ms = 150) => {
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), ms);
  };

  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setKbOpen(true);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);
    });
    const hide = Keyboard.addListener('keyboardDidHide', () => {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setKbOpen(false);
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

  /* Strength meter: one segment per rule met. It is only feedback;
     passwordProblem() stays the real check on submit. */
  const metCount = PASSWORD_RULES.filter((r) => r.test(newPassword)).length;
  const strength =
    newPassword.length === 0
      ? { label: 'Not set', color: colors.mutedFg }
      : metCount === PASSWORD_RULES.length
        ? { label: 'Strong', color: status.success.fg }
        : metCount >= 3
          ? { label: 'Fair', color: status.warning.fg }
          : { label: 'Weak', color: status.danger.fg };

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

  // The line above the pinned button only shows when the form actually
  // scrolls underneath it.
  const footerRaised = contentH > viewH + 1;
  // Resting: clear of the system navigation. Keyboard open: the form area
  // already ends at the keyboard, so only a small gap is needed.
  const footerBottom = kbOpen ? space.md : insets.bottom + space.lg;

  return (
    <View style={[styles.container, { paddingLeft: sideInset, paddingRight: sideInset }]}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.background} />

      {/* Same back button as the sign-in screen: a plain chevron, no circle.
          The title sits right beside it. */}
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
        <Text
          style={styles.sectionTitle}
          accessibilityRole="header"
          numberOfLines={1}
          adjustsFontSizeToFit
        >
          Change password
        </Text>
      </View>

      <KeyboardAvoidingView style={styles.flex} behavior="padding">
        <ScrollView
          ref={scrollRef}
          style={styles.flex}
          contentContainerStyle={[
            styles.form,
            { paddingBottom: space.xl },
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

                <View>
                  <PasswordField
                    label="Confirm new password"
                    value={confirmPassword}
                    onChangeText={edit(setConfirmPassword)}
                    autoComplete="new-password"
                    textContentType="newPassword"
                    inputRef={confirmRef}
                    returnKeyType="go"
                    invalid={passwordsMismatch}
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

              {/* Strength meter and the rules, in one card. The ticks fill
                  in as the person types. Icon, text weight and colour all
                  change, so it doesn't rely on colour alone. */}
              <View style={[styles.rulesCard, kbOpen && styles.rulesCardCompact]}>
                <View style={styles.strengthRow}>
                  <Text style={styles.strengthTitle}>Password strength</Text>
                  <Text
                    style={[styles.strengthLabel, { color: strength.color }]}
                    accessibilityLiveRegion="polite"
                  >
                    {strength.label}
                  </Text>
                </View>
                <View
                  style={styles.segments}
                  accessible
                  accessibilityLabel={`Password strength: ${strength.label}`}
                >
                  {PASSWORD_RULES.map((rule, i) => (
                    <View
                      key={rule.label}
                      style={[
                        styles.segment,
                        { backgroundColor: i < metCount ? strength.color : colors.border },
                      ]}
                    />
                  ))}
                </View>

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
                        <View style={[styles.ruleDot, met && styles.ruleDotMet]}>
                          {met && <Check size={12} color={colors.primaryFg} strokeWidth={3.2} />}
                        </View>
                        <Text style={[styles.ruleText, met && styles.ruleTextMet]}>
                          {rule.label}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              </View>
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

        {/* Pinned button: always on screen, above the keyboard when it is
            open, so it never scrolls away or hides behind the keys. Shown
            as a placeholder while the account type loads, so nothing jumps. */}
        {usesPassword !== false && (
          <View
            style={[
              styles.footer,
              footerRaised && styles.footerRaised,
              { paddingBottom: footerBottom },
            ]}
          >
            {usesPassword === null ? (
              <Skeleton width="100%" height={BUTTON_H} radius={BUTTON_H / 2} />
            ) : (
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
                  <Text style={[styles.saveBtnText, !canSubmit && common.buttonPrimaryTextDisabled]}>
                    Update password
                  </Text>
                )}
              </TouchableOpacity>
            )}
          </View>
        )}
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { ...common.screen },
  flex: { flex: 1 },

  /* A readable column on tablets: centered and capped in width. */
  form: {
    paddingHorizontal: space.xxl,
    paddingTop: space.lg,
    width: '100%',
    maxWidth: MAX_FORM_WIDTH,
    alignSelf: 'center',
  },
  loader: { marginTop: space.xxxl },

  /* Same title style as "Welcome back" on the sign-in screen. It shares
     the row with the chevron and shrinks rather than wrapping or pushing
     anything off a narrow screen. */
  sectionTitle: {
    flex: 1,
    minWidth: 0,
    fontFamily: fonts.display,
    fontSize: 26,
    lineHeight: 34,
    letterSpacing: -0.5,
    color: colors.foreground,
  },
  sectionSub: {
    ...text.body,
    color: colors.mutedFg,
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
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },

  /* Same as the Pet Essentials search bar: a white pill with a thin
     border, navy when focused. */
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: FIELD_H,
    paddingLeft: space.lg,
    paddingRight: space.xs,
    backgroundColor: colors.card,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  fieldFocused: { borderColor: colors.primary, borderWidth: 1.5 },
  fieldInvalid: { borderColor: colors.destructive, borderWidth: 1.5 },
  fieldInput: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 12,
    fontFamily: fonts.body,
    fontSize: 16,
    color: colors.foreground,
  },

  /* Strength meter + rules card. */
  rulesCard: {
    ...common.card,
    marginTop: space.xl,
    padding: space.lg,
  },
  rulesCardCompact: { marginTop: space.lg, padding: space.md },
  strengthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
  },
  strengthTitle: { ...text.smallBold, color: colors.foreground, flexShrink: 1 },
  strengthLabel: { ...text.caption, fontFamily: text.bodyBold.fontFamily, flexShrink: 0 },
  segments: { flexDirection: 'row', gap: 6, marginTop: space.sm },
  segment: { flex: 1, height: 6, borderRadius: 3 },

  rules: { gap: 10, marginTop: space.lg },
  rulesCompact: { gap: 6, marginTop: space.md },
  ruleRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  ruleDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.mutedFg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ruleDotMet: { backgroundColor: colors.primary, borderColor: colors.primary },
  ruleText: { ...text.small, color: colors.mutedFg, flex: 1 },
  ruleTextMet: { color: colors.foreground, fontFamily: text.bodyBold.fontFamily },

  matchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: space.sm,
  },
  matchText: { ...text.caption, fontFamily: text.bodyBold.fontFamily },

  /* Pinned button area, same width cap as the form. */
  footer: {
    width: '100%',
    maxWidth: MAX_FORM_WIDTH,
    alignSelf: 'center',
    paddingHorizontal: space.xxl,
    paddingTop: space.md,
    backgroundColor: colors.background,
    borderTopWidth: 1,
    borderTopColor: 'transparent',
  },
  footerRaised: { borderTopColor: colors.border },
  saveBtn: {
    height: BUTTON_H,
    borderRadius: BUTTON_H / 2,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.primary,
  },
  saveBtnBusy: { opacity: 0.75 },
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
   Shaped like the real form: subtitle, three fields, then the rules card.
   The button's own placeholder sits in the pinned footer. */
function SecuritySkeleton() {
  return (
    <View accessibilityLabel="Loading" accessibilityLiveRegion="polite">
      <Skeleton width="70%" height={14} style={{ marginBottom: space.xl }} />
      <View style={styles.fields}>
        {[0, 1, 2].map((i) => (
          <View key={i}>
            <Skeleton width="100%" height={FIELD_H} radius={radius.pill} />
          </View>
        ))}
      </View>
      <View style={[styles.rulesCard, { gap: space.md }]}>
        <Skeleton width="45%" height={14} />
        <Skeleton width="100%" height={6} radius={3} />
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} width={i % 2 ? '55%' : '70%'} height={14} />
        ))}
      </View>
    </View>
  );
}
