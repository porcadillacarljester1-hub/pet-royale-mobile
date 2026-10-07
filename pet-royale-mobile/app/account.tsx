import { type ElementType, type ReactNode } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, StatusBar, ScrollView, Image } from 'react-native';
import { router } from 'expo-router';
import { Camera, ChevronRight, Lock } from 'lucide-react-native';
import { colors, fonts, text, space, radius, common, hitSlop } from '../constants/theme';
import { Skeleton } from '../components/Skeleton';
import { ScreenHeader } from '../components/ScreenHeader';
import { getCountry, toE164 } from '../lib/phone';
import { useClientProfile } from '../lib/useClientProfile';

/**
 * Personal information, list version: each detail is a row that opens its
 * own small edit screen, so there is no Save button here. Email is shown
 * but locked, because it's tied to how the person signs in.
 */
function InfoRow({
  label,
  value,
  placeholder,
  onPress,
  trailing,
  last,
}: {
  label: string;
  value?: string;
  placeholder?: string;
  onPress?: () => void;
  trailing?: ReactNode;
  last?: boolean;
}) {
  const content = (
    <>
      <View style={styles.rowCopy}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text
          style={[styles.rowValue, !value && styles.rowPlaceholder]}
          numberOfLines={1}
          ellipsizeMode="middle"
          maxFontSizeMultiplier={1.25}
        >
          {value || placeholder}
        </Text>
      </View>
      {trailing}
    </>
  );

  return (
    <>
      {onPress ? (
        <TouchableOpacity
          style={styles.row}
          onPress={onPress}
          activeOpacity={0.75}
          accessibilityRole="button"
          accessibilityLabel={`${label}, ${value || placeholder}. Edit`}
        >
          {content}
        </TouchableOpacity>
      ) : (
        <View style={styles.row} accessibilityLabel={`${label}, ${value}`}>{content}</View>
      )}
      {!last && <View style={common.divider} />}
    </>
  );
}

export default function AccountScreen() {
  const {
    user, isLoading, firstName, lastName, countryIso, national, avatarUrl,
  } = useClientProfile();

  if (isLoading) return <AccountSkeleton />;

  const fullName = [firstName, lastName].filter(Boolean).join(' ');
  const phone = national ? toE164(getCountry(countryIso), national) : '';
  const initials = firstName?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase() || '?';

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.background} />
      <ScreenHeader title="Personal Info" onBack={() => router.back()} large />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.avatarBlock}>
          <View style={styles.avatarWrap}>
            <View style={styles.avatarRing}>
              {avatarUrl ? (
                <Image source={{ uri: avatarUrl }} style={styles.avatar} />
              ) : (
                <View style={styles.avatarFallback}>
                  <Text style={styles.avatarInitials}>{initials}</Text>
                </View>
              )}
            </View>
            <TouchableOpacity
              style={styles.cameraBadge}
              onPress={() => router.push('/profile-photo' as any)}
              activeOpacity={0.85}
              hitSlop={hitSlop}
              accessibilityLabel="Change profile photo"
            >
              <Camera size={16} color={colors.primaryFg} />
            </TouchableOpacity>
          </View>
          <TouchableOpacity
            onPress={() => router.push('/profile-photo' as any)}
            activeOpacity={0.7}
            hitSlop={hitSlop}
            accessibilityRole="button"
          >
            <Text style={styles.changePhoto}>Change photo</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.card}>
          <InfoRow
            label="Name"
            value={fullName}
            placeholder="e.g., John Doe"
            onPress={() => router.push('/account-name' as any)}
            trailing={<ChevronRight size={18} color={colors.mutedFg} />}
          />
          <InfoRow
            label="Mobile number"
            value={phone}
            placeholder="Add a mobile number"
            onPress={() => router.push('/account-mobile' as any)}
            trailing={<ChevronRight size={18} color={colors.mutedFg} />}
          />
          <InfoRow
            label="Email address"
            value={user?.email}
            last
            trailing={<Lock size={18} color={colors.mutedFg} />}
          />
        </View>

        <Text style={styles.note}>
          The clinic uses your name and mobile number for appointments and reminders. Your
          email is tied to how you sign in, so it can&apos;t be changed here.
        </Text>
      </ScrollView>
    </View>
  );
}

const AVATAR = 86;
const RING_GAP = 3;
const RING_WIDTH = 2;
const AVATAR_OUTER = AVATAR + (RING_GAP + RING_WIDTH) * 2;

const styles = StyleSheet.create({
  container: { ...common.screen },
  scroll: { paddingBottom: space.xxxl },

  avatarBlock: { alignItems: 'center', paddingTop: space.xl, paddingBottom: space.xxl },
  avatarWrap: { marginBottom: space.sm },
  avatarRing: {
    width: AVATAR_OUTER,
    height: AVATAR_OUTER,
    borderRadius: AVATAR_OUTER / 2,
    borderWidth: RING_WIDTH,
    borderColor: colors.accent,
    padding: RING_GAP,
  },
  avatar: { width: AVATAR, height: AVATAR, borderRadius: AVATAR / 2, backgroundColor: colors.muted },
  avatarFallback: {
    width: AVATAR,
    height: AVATAR,
    borderRadius: AVATAR / 2,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitials: { fontFamily: fonts.display, fontSize: 32, color: colors.primaryFg },
  cameraBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: colors.background,
  },
  changePhoto: { ...text.bodyBold, color: colors.primary },

  card: {
    ...common.card,
    padding: 0,
    marginHorizontal: space.xxl,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: 64,
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
  },
  rowCopy: { flex: 1, minWidth: 0 },
  rowLabel: { ...text.small, color: colors.mutedFg },
  rowValue: { ...text.bodyBold, color: colors.foreground, marginTop: 2 },
  rowPlaceholder: { color: colors.mutedFg },

  note: {
    ...text.small,
    color: colors.mutedFg,
    marginHorizontal: space.xxl + space.xs,
    marginTop: space.lg,
  },
});

function AccountSkeleton() {
  return (
    <View style={styles.container} accessibilityLabel="Loading personal information" accessibilityLiveRegion="polite">
      <StatusBar barStyle="dark-content" backgroundColor={colors.background} />
      <ScreenHeader title="Personal info" onBack={() => router.back()} large />
      <View style={styles.avatarBlock}>
        <Skeleton width={AVATAR_OUTER} height={AVATAR_OUTER} radius={AVATAR_OUTER / 2} />
        <Skeleton width={96} height={16} style={{ marginTop: space.md }} />
      </View>
      <View style={{ marginHorizontal: space.xxl, gap: space.md }}>
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} width="100%" height={64} radius={radius.md} />
        ))}
      </View>
    </View>
  );
}
