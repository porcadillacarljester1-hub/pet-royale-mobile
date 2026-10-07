import { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, StatusBar } from 'react-native';
import { MailCheck, ArrowRight } from 'lucide-react-native';
import { supabase } from '../lib/supabase';
import { colors, text, fonts, space, radius, shadow } from '../constants/theme';

const RESEND_COOLDOWN = 60;

/* The "Check your email" screen shown after sign-up. It was a branch inside
   the register screen; it is its own component now so the auth shell can
   stay mounted underneath it and keep what the person already typed.

   The sign-up email has just been sent when this appears, so the resend
   cooldown starts running as soon as it mounts. */
export default function ConfirmEmail({
  email,
  onGoToSignIn,
  onChangeEmail,
}: {
  email: string;
  onGoToSignIn: () => void;
  onChangeEmail: () => void;
}) {
  /* Resend with a cooldown, so the button can't be hammered (Supabase
     also rate-limits auth emails). */
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN);
  const [isResending, setIsResending] = useState(false);
  const [resendNote, setResendNote] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  /* Counts the resend cooldown down one second at a time. */
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const handleResend = async () => {
    if (cooldown > 0 || isResending) return;
    setIsResending(true);
    setResendNote(null);
    const { error: resendError } = await supabase.auth.resend({
      type: 'signup',
      email,
    });
    setIsResending(false);
    if (resendError) {
      setResendNote({ tone: 'error', text: resendError.message });
      return;
    }
    setCooldown(RESEND_COOLDOWN);
    setResendNote({
      tone: 'ok',
      text: 'Sent again. It can take a minute to arrive, so check your spam folder too.',
    });
  };

  return (
    <View style={styles.confirmContainer}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.background} />
      <View style={styles.confirmWrap}>
        <View style={styles.confirmIcon}>
          <MailCheck size={30} color={colors.primary} />
        </View>
        <Text style={styles.confirmTitle}>Check your email</Text>
        <Text style={styles.confirmBody}>
          We&apos;ve sent a confirmation link to{' '}
          <Text style={styles.confirmEmail}>{email}</Text>
          . Open it to activate your account, then come back and sign in.
        </Text>
        <TouchableOpacity
          style={styles.confirmBtn}
          onPress={onGoToSignIn}
          activeOpacity={0.9}
          accessibilityRole="button"
          accessibilityLabel="Go to sign in"
        >
          <Text style={styles.confirmBtnLabel}>Go to sign in</Text>
          <ArrowRight size={18} color={colors.primaryFg} />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.confirmLink}
          onPress={handleResend}
          disabled={cooldown > 0 || isResending}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityState={{ disabled: cooldown > 0 || isResending }}
        >
          {isResending ? (
            <ActivityIndicator color={colors.primary} />
          ) : (
            <Text style={[styles.confirmLinkLabel, cooldown > 0 && styles.confirmLinkLabelOff]}>
              {cooldown > 0 ? `Resend email in ${cooldown}s` : 'Resend email'}
            </Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.confirmLink}
          onPress={onChangeEmail}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Use a different email address"
        >
          <Text style={styles.confirmLinkLabel}>Use a different email</Text>
        </TouchableOpacity>

        {resendNote ? (
          <Text
            style={[styles.confirmNote, resendNote.tone === 'error' && styles.confirmNoteError]}
            accessibilityLiveRegion="polite"
          >
            {resendNote.text}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Covers the whole screen, including the auth shell mounted underneath.
  confirmContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.background,
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
    fontFamily: fonts.display,
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
    minHeight: 54,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    marginTop: space.xxxl,
    ...shadow.primary,
  },
  confirmBtnLabel: {
    ...text.bodyBold,
    color: colors.primaryFg,
  },
  confirmLink: {
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: space.sm,
  },
  confirmLinkLabel: {
    ...text.bodyBold,
    color: colors.primary,
  },
  confirmLinkLabelOff: {
    color: colors.mutedFg,
  },
  confirmNote: {
    ...text.small,
    color: colors.mutedFg,
    textAlign: 'center',
    marginTop: space.sm,
  },
  confirmNoteError: {
    color: colors.destructive,
  },
});
