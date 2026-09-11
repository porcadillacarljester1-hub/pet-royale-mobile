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
import { ArrowLeft, ArrowRight, Eye, EyeOff, PawPrint, Check } from 'lucide-react-native';
import { colors, text, space, radius, shadow, common, hitSlop } from '../constants/theme';

/* The brand mark from the admin system — a rounded paw tile with a
   small check badge. Replaces the ♛ character, which rendered
   differently on every device and wasn't the clinic's mark. */
function BrandMark({ size = 44 }: { size?: number }) {
  return (
    <View style={[styles.markTile, { width: size, height: size, borderRadius: size * 0.32 }]}>
      <PawPrint size={size * 0.52} color={colors.primary} strokeWidth={2.2} />
      <View style={styles.markBadge}>
        <Check size={9} color={colors.foreground} strokeWidth={3.5} />
      </View>
    </View>
  );
}

export default function SignInScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();

  const handleLogin = async () => {
    if (!email || !password) {
      setError('Please fill in both fields.');
      return;
    }
    setIsLoading(true);
    setError('');
    const { error } = await supabase.auth.signInWithPassword({
      // Trimmed: a trailing space from autocomplete or a paste is the
      // most common reason a correct password is rejected.
      email: email.trim(),
      password,
    });
    setIsLoading(false);
    if (error) {
      setError('Those details didn\u2019t match an account.');
      return;
    }
    router.replace('/(tabs)/home' as any);
  };

  return (
    <View style={styles.container}>
      {/* dark-content: the background is now light cream, so light-content
          would render the clock and battery invisible. */}
      <StatusBar barStyle="dark-content" backgroundColor={colors.background} />

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

        <BrandMark size={38} />
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.titleBlock}>
            <Text style={styles.eyebrow}>Welcome back</Text>
            <Text style={styles.title}>Sign in</Text>
            <Text style={styles.titleSub}>
              Pet Royale&apos; Clinic and Veterinary Services
            </Text>
          </View>

          {/* Fixed-height slot, so showing or clearing the error doesn't
              shift the fields under the user's thumb. */}
          <View style={styles.errorSlot}>
            {error ? (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}
          </View>

          <View style={styles.form}>
            <View>
              <Text style={styles.label}>Email address</Text>
              <TextInput
                style={styles.input}
                placeholder="you@example.com"
                placeholderTextColor={colors.mutedFg}
                value={email}
                onChangeText={(v) => { setEmail(v); if (error) setError(''); }}
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                returnKeyType="next"
              />
            </View>

            <View>
              <Text style={styles.label}>Password</Text>
              <View style={styles.inputWrap}>
                <TextInput
                  style={[styles.input, styles.inputWithToggle]}
                  placeholder="Your password"
                  placeholderTextColor={colors.mutedFg}
                  value={password}
                  onChangeText={(v) => { setPassword(v); if (error) setError(''); }}
                  secureTextEntry={!showPassword}
                  autoComplete="password"
                  returnKeyType="go"
                  onSubmitEditing={handleLogin}
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
          </View>

          <TouchableOpacity
            style={[styles.btnPrimary, isLoading && styles.btnPrimaryLoading]}
            onPress={handleLogin}
            disabled={isLoading}
            activeOpacity={0.85}
          >
            {isLoading ? (
              <ActivityIndicator color={colors.primaryFg} />
            ) : (
              <>
                <Text style={styles.btnPrimaryLabel}>Sign in</Text>
                <ArrowRight size={18} color={colors.primaryFg} />
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.linkRow}
            onPress={() => router.push('/register')}
            activeOpacity={0.7}
          >
            <Text style={styles.linkText}>Don&apos;t have an account? </Text>
            <Text style={styles.linkHighlight}>Register</Text>
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: { ...common.screen },
  flex: { flex: 1 },

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

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: space.xxl,
    paddingTop: space.xxl,
    paddingBottom: space.md,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  backLabel: {
    ...text.smallBold,
    color: colors.mutedFg,
  },

  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingBottom: space.xxxl,
  },

  titleBlock: {
    paddingHorizontal: space.xxl,
  },
  eyebrow: {
    ...text.eyebrow,
    color: colors.primary,
    marginBottom: space.md,
  },
  /* Fraunces at 44pt. The old screen used fontFamily:'serif', which
     resolves to a different face on iOS and Android. */
  title: {
    fontFamily: text.display.fontFamily,
    fontSize: 44,
    lineHeight: 48,
    letterSpacing: -1.8,
    color: colors.foreground,
  },
  titleSub: {
    ...text.body,
    color: colors.mutedFg,
    marginTop: space.md,
  },

  errorSlot: {
    minHeight: 56,
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
  errorText: {
    ...text.small,
    color: colors.destructive,
  },

  form: {
    paddingHorizontal: space.xxl,
    gap: space.xl,
  },
  label: { ...common.label },
  input: { ...common.input },
  inputWrap: {
    position: 'relative',
    justifyContent: 'center',
  },
  inputWithToggle: {
    paddingRight: 50,
  },
  eyeBtn: {
    position: 'absolute',
    right: space.lg,
  },

  btnPrimary: {
    ...common.buttonPrimary,
    marginHorizontal: space.xxl,
    marginTop: space.xxl,
    ...shadow.primary,
  },
  btnPrimaryLoading: {
    backgroundColor: colors.primaryDark,
  },
  btnPrimaryLabel: { ...common.buttonPrimaryText },

  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: space.xl,
  },
  linkText: {
    ...text.body,
    color: colors.mutedFg,
  },
  linkHighlight: {
    ...text.bodyBold,
    color: colors.primary,
  },

  bottomMark: {
    marginTop: 48,
    paddingHorizontal: space.xxl,
    alignItems: 'center',
    gap: space.md,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    width: '100%',
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.border,
  },
  bottomSub: {
    fontFamily: text.displayRegular.fontFamily,
    fontSize: 14,
    color: colors.mutedFg,
  },
});
