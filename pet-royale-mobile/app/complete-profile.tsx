import { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  StatusBar,
  Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  KeyboardAwareScrollView,
  KeyboardStickyView,
  useKeyboardState,
} from 'react-native-keyboard-controller';
import { supabase } from '../lib/supabase';
import { PawPrint, Check, User, ChevronLeft } from 'lucide-react-native';
import { colors, text, space, radius, shadow, common, sz } from '../constants/theme';
import { PhoneInput } from '../components/PhoneInput';
import { getCountry, isValidMobile, toE164 } from '../lib/phone';

/* Says exactly what is wrong with the number and what to fix, or returns
   null if it's fine. `national` is what's typed after the country code. */
function checkPhone(iso: string, national: string): string | null {
  const country = getCountry(iso);

  if (!national) return 'Enter your mobile number.';

  // Friendlier hints for the likeliest mistakes, before the full check.
  if (iso === 'PH') {
    if (!national.startsWith('9')) {
      return 'Philippine mobile numbers start with 9, like 917 123 4567.';
    }
    if (national.length !== 10) {
      return `That number has ${national.length} digits. It needs 10 digits, like 917 123 4567.`;
    }
  }

  // The real check: valid for this country's numbering plan, and a
  // mobile number (the clinic sends reminders by SMS, so landlines won't do).
  if (!isValidMobile(country, national)) {
    return `That isn't a valid ${country.name} mobile number. Check the digits, and use a mobile number rather than a landline.`;
  }
  return null;
}

function explainSaveError(err: {
  message?: string;
  details?: string | null;
  code?: string;
  status?: number;
}): { phone?: string; general?: string } {
  const code = err.code ?? '';
  const detail = `${err.message ?? ''} ${err.details ?? ''}`.toLowerCase();
  const aboutPhone = detail.includes('phone');

  if (code === '23505') {
    if (aboutPhone) {
      return { phone: 'That mobile number is already registered to another account. Use a different number, or sign in with the original account.' };
    }
    if (detail.includes('email')) {
      return { general: 'An account with this email already exists. Try signing in instead.' };
    }
    return { general: 'These details are already registered to another account.' };
  }
  if (code === '23514' || code === '22001' || code === '22P02') {
    if (aboutPhone) {
      return { phone: "The server didn't accept that number's format. Check the digits and try again." };
    }
    return { general: `Some of the details weren't accepted: ${err.message}` };
  }
  if (code === '23502') {
    return { general: 'A required detail is missing. Check your name and number, then try again.' };
  }
  if (code === '42501' || detail.includes('row-level security')) {
    return { general: "We couldn't save your details because of an account permissions problem on our side. Please try again later or contact the clinic." };
  }
  if (!err.status && !code) {
    return { general: "Couldn't reach the server. Check your internet connection and try again." };
  }
  if ((err.status ?? 0) >= 500) {
    return { general: 'Something went wrong on our side. Please try again in a moment.' };
  }
  return { general: `Couldn't save your details: ${err.message || 'unknown error'}` };
}

export default function CompleteProfileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const statusBarHeight = Math.max(insets.top, StatusBar.currentHeight ?? 0);
  // True while the keyboard is up. Used to collapse the header so the
  // whole form fits above the sticky button without scrolling.
  const keyboardVisible = useKeyboardState((s) => s.isVisible);

  const [fullName, setFullName] = useState('');
  const [iso, setIso] = useState('PH');
  const [national, setNational] = useState('');
  const [email, setEmail] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  // General problems (name, session, server) show in the red box;
  // phone problems show right under the phone field.
  const [error, setError] = useState('');
  const [phoneError, setPhoneError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        router.replace('/signin');
        return;
      }

      setUserId(user.id);
      setEmail(user.email ?? '');

      const meta = user.user_metadata ?? {};
      setFullName(meta.full_name || meta.name || '');
      setAvatarUrl(meta.avatar_url || meta.picture || null);

      const { data: existing } = await supabase
        .from('clients')
        .select('name, phone')
        .eq('id', user.id)
        .maybeSingle();

      if (existing?.phone) {
        router.replace('/(tabs)/home' as any);
        return;
      }
      if (existing?.name) setFullName(existing.name);

      setLoading(false);
    })();
  }, [router]);

  const handleSave = async () => {
    if (saving) return;
    setError('');
    setPhoneError(null);

    if (!fullName.trim()) {
      setError('Please enter your full name.');
      return;
    }

    const phoneProblem = checkPhone(iso, national);
    if (phoneProblem) {
      setPhoneError(phoneProblem);
      return;
    }
    if (!userId) {
      setError('Your session has expired. Please sign in again.');
      return;
    }

    setSaving(true);

    const { error: saveError } = await supabase
      .from('clients')
      .upsert(
        {
          id: userId,
          name: fullName.trim(),
          email,
          phone: toE164(getCountry(iso), national),
        },
        { onConflict: 'id' }
      );

    if (saveError) {
      setSaving(false);
      const reason = explainSaveError(saveError as any);
      if (reason.phone) setPhoneError(reason.phone);
      if (reason.general) setError(reason.general);
      return;
    }

    // Keep the auth metadata in step, so the name shows correctly
    // anywhere that reads from the session rather than the table.
    await supabase.auth.updateUser({ data: { full_name: fullName.trim() } });

    setSaving(false);
    router.replace('/(tabs)/home' as any);
  };

  // This screen is a required step after signing in, so "back" means
  // leaving the account: sign out and return to the sign-in screen.
  const handleBack = async () => {
    if (saving) return;
    await supabase.auth.signOut().catch(() => undefined);
    router.replace('/signin');
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.center]}>
        <StatusBar barStyle="dark-content" backgroundColor={colors.background} />
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.background} />

      <KeyboardAwareScrollView
        bottomOffset={24}
        scrollEnabled={!keyboardVisible}
        contentContainerStyle={[
          styles.scroll,
          { paddingBottom: space.xl },
          keyboardVisible && {
            justifyContent: 'flex-start',
            paddingTop: statusBarHeight + space.sm,
          },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.head}>
          {avatarUrl ? (
            <Image
              source={{ uri: avatarUrl }}
              style={[styles.avatar, keyboardVisible && styles.avatarCompact]}
            />
          ) : (
            <View style={[styles.badge, keyboardVisible && styles.avatarCompact]}>
              <PawPrint
                size={keyboardVisible ? 22 : 30}
                color={colors.primary}
                strokeWidth={2.1}
              />
              <View style={styles.badgeCheck}>
                <Check size={sz(10)} color={colors.foreground} strokeWidth={3.5} />
              </View>
            </View>
          )}

          <Text style={[styles.eyebrow, keyboardVisible && styles.eyebrowCompact]}>
            Almost there
          </Text>

          <Text style={[styles.title, keyboardVisible && styles.titleCompact]}>
            A couple of details
          </Text>

          <Text style={[styles.subtitle, keyboardVisible && styles.subtitleCompact]}>
            The clinic needs a number to reach you about appointments.
          </Text>
        </View>

        <View style={[styles.errorSlot, keyboardVisible && styles.errorSlotCompact]}>
          {error ? (
            <View style={styles.errorBox} accessibilityLiveRegion="polite">
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}
        </View>

        <View style={[styles.form, keyboardVisible && styles.formCompact]}>
          <View>
            <Text style={styles.label}>Full name</Text>
            <View style={styles.inputWrap}>
              <User size={sz(17)} color={colors.mutedFg} style={styles.leadIcon} />
              <TextInput
                style={styles.input}
                placeholder="Enter your name"
                placeholderTextColor={colors.mutedFg}
                value={fullName}
                onChangeText={(v) => { setFullName(v); if (error) setError(''); }}
                autoCapitalize="words"
                autoComplete="name"
                editable={!saving}
              />
            </View>
          </View>

          <View>
            <Text style={styles.label}>Mobile number</Text>
            <PhoneInput
              variant="field"
              iso={iso}
              national={national}
              onChangeIso={(next) => { setIso(next); setPhoneError(null); }}
              onChangeNational={(v) => { setNational(v); if (phoneError) setPhoneError(null); }}
              error={!!phoneError}
              onSubmitEditing={handleSave}
              editable={!saving}
            />
            {phoneError ? (
              <Text style={styles.fieldError} accessibilityLiveRegion="polite">
                {phoneError}
              </Text>
            ) : null}
          </View>

          <View style={styles.emailRow}>
            <Text style={styles.emailLabel}>Signed in as</Text>
            <Text style={styles.emailValue}>{email}</Text>
          </View>
        </View>
      </KeyboardAwareScrollView>

      <KeyboardStickyView offset={{ closed: 0, opened: insets.bottom }}>
        <View style={[styles.footer, { paddingBottom: insets.bottom + space.md }]}>
          <TouchableOpacity
            style={[styles.btnPrimary, saving && styles.btnPrimaryLoading]}
            onPress={handleSave}
            disabled={saving}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Continue"
          >
            {saving ? (
              <ActivityIndicator color={colors.primaryFg} />
            ) : (
              <Text style={styles.btnPrimaryLabel}>Continue</Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardStickyView>

      <View
        pointerEvents="none"
        style={[styles.statusBarBackdrop, { height: statusBarHeight }]}
      />

      <TouchableOpacity
        style={[styles.backBtn, { top: statusBarHeight + space.sm }]}
        onPress={handleBack}
        disabled={saving}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel="Back to sign in"
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <ChevronLeft size={sz(22)} color={colors.foreground} strokeWidth={2.4} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { ...common.screen },
  center: { alignItems: 'center', justifyContent: 'center' },

  statusBarBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.background,
    zIndex: 20,
  },

  backBtn: {
    position: 'absolute',
    left: space.lg,
    width: sz(40),
    height: sz(40),
    borderRadius: 20,
    backgroundColor: colors.muted,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 30,
  },

  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: space.xxl,
    paddingTop: space.xxxl,
    paddingBottom: space.xxxl,
  },

  head: { alignItems: 'center' },
  avatar: {
    width: sz(72),
    height: sz(72),
    borderRadius: 36,
    borderWidth: 3,
    borderColor: colors.secondary,
  },
  badge: {
    width: sz(72),
    height: sz(72),
    borderRadius: 36,
    backgroundColor: colors.secondary,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.card,
  },
  badgeCheck: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: sz(18),
    height: sz(18),
    borderRadius: 9,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },

  eyebrow: {
    ...text.eyebrow,
    color: colors.primary,
    marginTop: space.xl,
  },
  title: {
    fontFamily: text.display.fontFamily,
    fontSize: sz(32),
    lineHeight: sz(36),
    letterSpacing: -1.3,
    color: colors.foreground,
    textAlign: 'center',
    marginTop: space.md,
  },
  avatarCompact: {
    width: sz(48),
    height: sz(48),
    borderRadius: 24,
  },
  eyebrowCompact: { marginTop: space.sm },
  subtitleCompact: { marginTop: space.xs },
  errorSlotCompact: { marginVertical: space.sm },
  formCompact: { gap: space.md },
  titleCompact: {
    fontSize: sz(24),
    lineHeight: sz(28),
    letterSpacing: -0.8,
    marginTop: space.md,
  },
  subtitle: {
    ...text.small,
    color: colors.mutedFg,
    textAlign: 'center',
    marginTop: space.md,
  },

  errorSlot: { marginVertical: space.lg },
  errorBox: {
    borderWidth: 1,
    borderColor: colors.destructive,
    backgroundColor: colors.destructiveBg,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderRadius: radius.md,
  },
  errorText: { ...text.small, color: colors.destructive },

  form: { gap: space.lg },
  label: { ...common.label },
  inputWrap: { position: 'relative', justifyContent: 'center' },
  leadIcon: { position: 'absolute', left: space.lg, zIndex: 1 },
  input: { ...common.input, paddingLeft: 46 },

  fieldError: {
    ...text.caption,
    color: colors.destructive,
    marginTop: space.sm,
    paddingHorizontal: space.xs,
  },

  emailRow: {
    gap: 2,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderRadius: radius.md,
    backgroundColor: colors.muted,
  },
  emailLabel: { ...text.caption, color: colors.mutedFg },
  emailValue: { ...text.smallBold, color: colors.foreground },

  footer: {
    paddingHorizontal: space.xxl,
    paddingTop: space.md,
    backgroundColor: colors.background,
  },

  btnPrimary: {
    ...common.buttonPrimary,
    ...shadow.primary,
  },
  btnPrimaryLoading: { backgroundColor: colors.primaryDark },
  btnPrimaryLabel: { ...common.buttonPrimaryText },
});
