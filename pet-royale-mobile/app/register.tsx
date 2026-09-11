import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  StatusBar,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '../lib/supabase';
import {
  ArrowLeft, ArrowRight, Eye, EyeOff, PawPrint, Check, X, MailCheck,
} from 'lucide-react-native';
import { colors, text, space, radius, shadow, common, hitSlop } from '../constants/theme';

function BrandMark({ size = 38 }: { size?: number }) {
  return (
    <View style={[styles.markTile, { width: size, height: size, borderRadius: size * 0.32 }]}>
      <PawPrint size={size * 0.52} color={colors.primary} strokeWidth={2.2} />
      <View style={styles.markBadge}>
        <Check size={9} color={colors.foreground} strokeWidth={3.5} />
      </View>
    </View>
  );
}

export default function RegisterScreen() {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  /* Supabase either signs the user straight in or sends a confirmation
     email, depending on the project setting. The old screen redirected
     to sign-in either way — so with confirmation on, people tried to
     sign in immediately, failed, and had no idea an email was waiting. */
  const [checkEmail, setCheckEmail] = useState(false);
  const router = useRouter();

  const passwordsMatch = confirmPassword.length > 0 && password === confirmPassword;
  const passwordsMismatch = confirmPassword.length > 0 && password !== confirmPassword;

  const clear = (setter: (v: string) => void) => (v: string) => {
    setter(v);
    if (error) setError('');
  };

  const handleRegister = async () => {
    if (!fullName || !email || !password || !confirmPassword) {
      setError('Please fill in all fields.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Those passwords don\u2019t match.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }

    setIsLoading(true);
    setError('');

    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { full_name: fullName.trim() } },
    });

    setIsLoading(false);

    if (error) {
      // Supabase returns "User already registered" — readable, but the
      // useful thing is telling them what to do about it.
      setError(
        error.message.toLowerCase().includes('already registered')
          ? 'An account already exists for that email. Try signing in instead.'
          : error.message
      );
      return;
    }

    // A session means confirmation is off and they're already signed in.
    if (data.session) {
      router.replace('/home');
    } else {
      setCheckEmail(true);
    }
  };

  /* ── Confirmation screen ── */
  if (checkEmail) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="dark-content" backgroundColor={colors.background} />
        <View style={styles.confirmWrap}>
          <View style={styles.confirmIcon}>
            <MailCheck size={30} color={colors.primary} />
          </View>
          <Text style={styles.confirmTitle}>Check your email</Text>
          <Text style={styles.confirmBody}>
            We&apos;ve sent a confirmation link to{' '}
            <Text style={styles.confirmEmail}>{email.trim()}</Text>. Open it to
            activate your account, then come back and sign in.
          </Text>
          <TouchableOpacity
            style={[styles.btnPrimary, styles.confirmBtn]}
            onPress={() => router.replace('/signin')}
            activeOpacity={0.85}
          >
            <Text style={styles.btnPrimaryLabel}>Go to sign in</Text>
            <ArrowRight size={18} color={colors.primaryFg} />
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <StatusBar barStyle="dark-content" backgroundColor={colors.background} />

      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => router.back()}
            activeOpacity={0.7}
            hitSlop={hitSlop}
          >
            <ArrowLeft size={16} color={colors.mutedFg} />
            <Text style={styles.backLabel}>Back</Text>
          </TouchableOpacity>
          <BrandMark />
        </View>

        <View style={styles.titleBlock}>
          <Text style={styles.eyebrow}>Join Pet Royale</Text>
          <Text style={styles.title}>Create account</Text>
          <Text style={styles.titleSub}>
            Book visits, keep your pets&apos; records, and shop Pet Essentials.
          </Text>
        </View>

        <View style={styles.errorSlot}>
          {error ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.form}>
          <View>
            <Text style={styles.label}>Full name</Text>
            <TextInput
              style={styles.input}
              placeholder="Enter your name"
              placeholderTextColor={colors.mutedFg}
              value={fullName}
              onChangeText={clear(setFullName)}
              autoCapitalize="words"
              autoComplete="name"
            />
          </View>

          <View>
            <Text style={styles.label}>Email address</Text>
            <TextInput
              style={styles.input}
              placeholder="you@gmail.com"
              placeholderTextColor={colors.mutedFg}
              value={email}
              onChangeText={clear(setEmail)}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
            />
          </View>

          <View>
            <Text style={styles.label}>Password</Text>
            <View style={styles.inputWrap}>
              <TextInput
                style={[styles.input, styles.inputWithToggle]}
                placeholder="At least 8 characters"
                placeholderTextColor={colors.mutedFg}
                value={password}
                onChangeText={clear(setPassword)}
                secureTextEntry={!showPassword}
                autoComplete="new-password"
              />
              <TouchableOpacity
                style={styles.eyeBtn}
                onPress={() => setShowPassword((v) => !v)}
                activeOpacity={0.7}
                hitSlop={hitSlop}
                accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword
                  ? <EyeOff size={18} color={colors.mutedFg} />
                  : <Eye size={18} color={colors.mutedFg} />}
              </TouchableOpacity>
            </View>
          </View>

          <View>
            <Text style={styles.label}>Confirm password</Text>
            <View style={styles.inputWrap}>
              <TextInput
                style={[
                  styles.input,
                  styles.inputWithToggle,
                  passwordsMatch && styles.inputMatch,
                  passwordsMismatch && styles.inputMismatch,
                ]}
                placeholder="Re-enter your password"
                placeholderTextColor={colors.mutedFg}
                value={confirmPassword}
                onChangeText={clear(setConfirmPassword)}
                secureTextEntry={!showConfirm}
                autoComplete="new-password"
                returnKeyType="go"
                onSubmitEditing={handleRegister}
              />
              <TouchableOpacity
                style={styles.eyeBtn}
                onPress={() => setShowConfirm((v) => !v)}
                activeOpacity={0.7}
                hitSlop={hitSlop}
                accessibilityLabel={showConfirm ? 'Hide password' : 'Show password'}
              >
                {showConfirm
                  ? <EyeOff size={18} color={colors.mutedFg} />
                  : <Eye size={18} color={colors.mutedFg} />}
              </TouchableOpacity>
            </View>

            {/* Fixed height, so the row appearing doesn't push the button
                out from under a thumb already reaching for it. */}
            <View style={styles.hintSlot}>
              {passwordsMatch && (
                <View style={styles.hintRow}>
                  <Check size={13} color={colors.primary} strokeWidth={3} />
                  <Text style={styles.hintOk}>Passwords match</Text>
                </View>
              )}
              {passwordsMismatch && (
                <View style={styles.hintRow}>
                  <X size={13} color={colors.destructive} strokeWidth={3} />
                  <Text style={styles.hintNo}>Passwords don&apos;t match</Text>
                </View>
              )}
            </View>
          </View>
        </View>

        <TouchableOpacity
          style={[styles.btnPrimary, isLoading && styles.btnPrimaryLoading]}
          onPress={handleRegister}
          disabled={isLoading}
          activeOpacity={0.85}
        >
          {isLoading ? (
            <ActivityIndicator color={colors.primaryFg} />
          ) : (
            <>
              <Text style={styles.btnPrimaryLabel}>Create account</Text>
              <ArrowRight size={18} color={colors.primaryFg} />
            </>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.linkRow}
          onPress={() => router.push('/signin')}
          activeOpacity={0.7}
        >
          <Text style={styles.linkText}>Already have an account? </Text>
          <Text style={styles.linkHighlight}>Sign in</Text>
        </TouchableOpacity>

        <View style={styles.bottomMark}>
          <View style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <PawPrint size={14} color={colors.border} />
            <View style={styles.dividerLine} />
          </View>
          <Text style={styles.bottomSub}>We care for you and your pets</Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { ...common.screen },

  markTile: {
    backgroundColor: colors.secondary,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.card,
  },
  markBadge: {
    position: 'absolute',
    top: -3,
    right: -3,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },

  scroll: {
    flexGrow: 1,
    paddingBottom: space.xxxl,
  },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: space.xxl,
    paddingTop: space.xxl,
  },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  backLabel: { ...text.smallBold, color: colors.mutedFg },

  titleBlock: {
    paddingHorizontal: space.xxl,
    paddingTop: space.xxxl,
  },
  eyebrow: { ...text.eyebrow, color: colors.primary, marginBottom: space.md },
  title: {
    fontFamily: text.display.fontFamily,
    fontSize: 40,
    lineHeight: 44,
    letterSpacing: -1.6,
    color: colors.foreground,
  },
  titleSub: { ...text.body, color: colors.mutedFg, marginTop: space.md },

  errorSlot: {
    minHeight: 52,
    justifyContent: 'center',
    paddingHorizontal: space.xxl,
  },
  errorBox: {
    borderWidth: 1,
    borderColor: colors.destructive,
    backgroundColor: '#FCE9E7',
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderRadius: radius.md,
  },
  errorText: { ...text.small, color: colors.destructive },

  form: {
    paddingHorizontal: space.xxl,
    gap: space.lg,
  },
  label: { ...common.label },
  input: { ...common.input },
  inputWrap: { position: 'relative', justifyContent: 'center' },
  inputWithToggle: { paddingRight: 50 },
  inputMatch: { borderColor: colors.primary },
  inputMismatch: { borderColor: colors.destructive },
  eyeBtn: { position: 'absolute', right: space.lg },

  hintSlot: { minHeight: 22, justifyContent: 'center' },
  hintRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 5 },
  hintOk: { ...text.caption, color: colors.primary },
  hintNo: { ...text.caption, color: colors.destructive },

  btnPrimary: {
    ...common.buttonPrimary,
    marginHorizontal: space.xxl,
    marginTop: space.lg,
    ...shadow.primary,
  },
  btnPrimaryLoading: { backgroundColor: colors.primaryDark },
  btnPrimaryLabel: { ...common.buttonPrimaryText },

  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: space.xl,
  },
  linkText: { ...text.body, color: colors.mutedFg },
  linkHighlight: { ...text.bodyBold, color: colors.primary },

  bottomMark: {
    marginTop: 44,
    paddingHorizontal: space.xxl,
    alignItems: 'center',
    gap: space.md,
  },
  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, width: '100%' },
  dividerLine: { flex: 1, height: 1, backgroundColor: colors.border },
  bottomSub: {
    fontFamily: text.displayRegular.fontFamily,
    fontSize: 14,
    color: colors.mutedFg,
  },

  confirmWrap: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: space.xxl,
  },
  confirmIcon: {
    width: 64,
    height: 64,
    borderRadius: 22,
    backgroundColor: colors.secondary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.xxl,
  },
  confirmTitle: {
    fontFamily: text.display.fontFamily,
    fontSize: 34,
    lineHeight: 38,
    letterSpacing: -1.3,
    color: colors.foreground,
  },
  confirmBody: {
    ...text.body,
    color: colors.mutedFg,
    marginTop: space.lg,
  },
  confirmEmail: {
    ...text.bodyBold,
    color: colors.foreground,
  },
  confirmBtn: {
    marginHorizontal: 0,
    marginTop: space.xxxl,
  },
});
