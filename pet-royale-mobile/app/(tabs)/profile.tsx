import { useState, useCallback, type ElementType } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  ScrollView,
  Image,
  Alert,
  Platform,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import Constants from 'expo-constants';
import { supabase } from '../../lib/supabase';
import {
  User,
  Receipt,
  Bell,
  ShieldCheck,
  Info,
  ChevronRight,
  Phone,
  PawPrint,
  Plus,
} from 'lucide-react-native';
import {
  colors,
  text,
  space,
  radius,
  common,
  hitSlop,
} from '../../constants/theme';
import { useTabBarClearance } from './_layout';
import { Skeleton } from '../../components/Skeleton';
import * as Notifications from 'expo-notifications';

const ACCOUNT_MENU = [
  {
    label: 'Personal Information',
    sub: 'Name, phone and contact details',
    Icon: User,
    route: '/account',
  },
  {
    label: 'Payment History',
    sub: 'Past invoices and receipts',
    Icon: Receipt,
    route: '/(tabs)/payment-history',
  },
  {
    label: 'Notifications',
    sub: 'Reminders and clinic updates',
    Icon: Bell,
    route: '/(tabs)/notifications',
  },
  {
    label: 'Security',
    sub: 'Password and account access',
    Icon: ShieldCheck,
    route: '/(tabs)/security',
  },
] as const;

/* Account items are two-column tiles. flexBasis + flexGrow + wrap keeps
   exactly two per row on any width: each tile wants 45%, two fit, three
   never do, and grow fills the leftover so there's no dead space on the
   right. Heights match within a row because wrapped rows stretch. */
function AccountTile({
  label,
  sub,
  Icon,
  route,
}: {
  label: string;
  sub: string;
  Icon: ElementType;
  route: string;
}) {
  return (
    <TouchableOpacity
      style={styles.tile}
      onPress={() => router.push(route as any)}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel={`${label}. ${sub}`}
    >
      <View style={styles.tileIcon}>
        <Icon size={20} color={colors.primary} strokeWidth={1.9} />
      </View>
      <View>
        <Text style={styles.tileLabel} numberOfLines={2} maxFontSizeMultiplier={1.25}>
          {label}
        </Text>
        <Text style={styles.tileSub} numberOfLines={2} maxFontSizeMultiplier={1.25}>
          {sub}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

export default function ProfileScreen() {
  const bottomPad = useTabBarClearance();
  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarFailed, setAvatarFailed] = useState(false);
  const [pets, setPets] = useState<any[]>([]);

  /* useFocusEffect rather than useEffect: editing your details on
     /account and coming back should show the change, and a mount-only
     effect wouldn't re-run. */
  useFocusEffect(
    useCallback(() => {
      let active = true;

      (async () => {
        try {
          const { data: { user } } = await supabase.auth.getUser();
          if (!user || !active) return;

          setUser(user);
          setAvatarUrl(user.user_metadata?.avatar_url || user.user_metadata?.picture || null);
          setAvatarFailed(false);

          const [clientRes, petsRes] = await Promise.all([
            (supabase as any)
              .from('clients')
              .select('name, phone')
              .eq('id', user.id)
              .maybeSingle(),
            (supabase as any)
              .from('pets')
              .select('*')
              .eq('owner_id', user.id)
              .order('created_at', { ascending: false }),
          ]);

          if (!active) return;

          if (clientRes.error) console.warn('Profile: clients query failed', clientRes.error);
          if (petsRes.error) console.warn('Profile: pets query failed', petsRes.error);

          // The clients row is what the clinic sees, so it wins. Auth
          // metadata is the fallback for an account that predates it.
          const client = clientRes.data;
          setFullName(client?.name || user.user_metadata?.full_name || '');
          setPhone(client?.phone || '');
          setPets(petsRes.data || []);
        } catch (err) {
          console.warn('Profile: failed to load', err);
        } finally {
          if (active) setIsLoading(false);
        }
      })();

      return () => { active = false; };
    }, [])
  );

  /* The actual sign-out, kept separate from the confirmation so the same
     work runs from the phone's Alert and from the browser's confirm(). */
  const doSignOut = async () => {
    // Remove this phone's token first, so the next person to use it
    // (or nobody) doesn't receive this account's pushes. It must run
    // before signOut(), while the session still exists.
    try {
      const projectId =
        Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
      const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
      await supabase.from('push_tokens').delete().eq('token', token);
    } catch (err) {
      // Never block signing out because of this.
      console.log('Push token cleanup failed:', err);
    }
    await supabase.auth.signOut();
    router.replace('/');
  };

  /* Alert.alert does nothing on web, so the browser's confirm() is used
     there. Phones keep the native dialog. */
  const handleSignOut = () => {
    if (Platform.OS === 'web') {
      if (window.confirm('Are you sure you want to sign out?')) doSignOut();
      return;
    }
    Alert.alert('Sign out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: doSignOut },
    ]);
  };

  const initials =
    fullName?.trim()?.[0]?.toUpperCase() ||
    user?.email?.[0]?.toUpperCase() ||
    '?';

  if (isLoading) return <ProfileSkeleton />;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.background} />

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: bottomPad }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={styles.title} accessibilityRole="header">Profile</Text>
        </View>

        {/* ── Identity ── No card: sits straight on the background. Tapping
            it edits your details, so there's no separate "Edit profile"
            button beside the "Personal Information" tile. */}
        <TouchableOpacity
          style={styles.identity}
          onPress={() => router.push('/account' as any)}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="Edit profile"
        >
          <View style={styles.avatarRing}>
            {avatarUrl && !avatarFailed ? (
              <Image
                source={{ uri: avatarUrl }}
                style={styles.avatar}
                onError={() => setAvatarFailed(true)}
                accessibilityLabel="Profile photo"
              />
            ) : (
              <View style={styles.avatarFallback}>
                <Text style={styles.avatarInitial}>{initials}</Text>
              </View>
            )}
          </View>

          <View style={styles.identityCopy}>
            <Text style={styles.name} numberOfLines={2}>
              {fullName || 'Add your name'}
            </Text>
            <Text style={styles.accountType}>Pet owner account</Text>
          </View>
          <ChevronRight size={20} color={colors.mutedFg} />
        </TouchableOpacity>

        {/* ── Missing phone ──
            Gold is the one thing that matters: the clinic can't send
            reminders without a number, so this is the only thing on the
            screen that asks for attention. Gone once there's a number. */}
        {!phone && (
          <TouchableOpacity
            style={styles.promptCard}
            onPress={() => router.push('/account' as any)}
            activeOpacity={0.85}
            accessibilityRole="button"
          >
            <View style={styles.promptIcon}>
              <Phone size={18} color={colors.accentFg} strokeWidth={2} />
            </View>
            <View style={styles.promptCopy}>
              <Text style={styles.promptTitle}>Add a mobile number</Text>
              <Text style={styles.promptSub}>
                The clinic uses it for appointment and vaccine reminders.
              </Text>
            </View>
            <ChevronRight size={17} color={colors.mutedFg} />
          </TouchableOpacity>
        )}

        {/* ── My Pets ── */}
        <View style={styles.section}>
          <View style={styles.sectionHead}>
            <View style={styles.sectionTitleRow}>
              <Text style={styles.sectionLabel}>My Pets</Text>
              {pets.length > 0 && (
                <View style={styles.countBadge}>
                  <Text style={styles.countText}>{pets.length}</Text>
                </View>
              )}
            </View>
            {pets.length > 0 && (
              <TouchableOpacity
                onPress={() => router.push('/(tabs)/pets' as any)}
                hitSlop={hitSlop}
                accessibilityRole="button"
                accessibilityLabel="See all pets"
              >
                <Text style={styles.seeAll}>See all</Text>
              </TouchableOpacity>
            )}
          </View>

          {pets.length === 0 ? (
            <TouchableOpacity
              style={styles.emptyCard}
              onPress={() => router.push('/(tabs)/pets' as any)}
              activeOpacity={0.85}
              accessibilityRole="button"
            >
              <View style={styles.emptyIcon}>
                <Plus size={18} color={colors.primary} />
              </View>
              <View style={styles.emptyCopy}>
                <Text style={styles.emptyTitle}>Register your first pet</Text>
                <Text style={styles.emptySub}>
                  You&apos;ll need one on file before you can book a visit.
                </Text>
              </View>
              <ChevronRight size={17} color={colors.mutedFg} />
            </TouchableOpacity>
          ) : (
            /* Bleeds to the screen edges so the next avatar peeks in,
               which is the cue that the row scrolls. Add pet comes first
               so it stays reachable with any number of pets. */
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.petScroll}
              contentContainerStyle={styles.petStrip}
            >
              <TouchableOpacity
                style={styles.petItem}
                onPress={() => router.push('/(tabs)/pets' as any)}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel="Add pet"
              >
                <View style={styles.petAddCircle}>
                  <Plus size={26} color={colors.primary} strokeWidth={2.2} />
                </View>
                <Text style={styles.petName} numberOfLines={1} maxFontSizeMultiplier={1.25}>
                  Add pet
                </Text>
              </TouchableOpacity>

              {pets.map((pet) => (
                <TouchableOpacity
                  key={pet.id}
                  style={styles.petItem}
                  onPress={() => router.push('/(tabs)/pets' as any)}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  accessibilityLabel={`${pet.name}, ${pet.species}`}
                >
                  <View style={styles.petRing}>
                    {pet.photo_url ? (
                      <Image source={{ uri: pet.photo_url }} style={styles.petPhoto} />
                    ) : (
                      <View style={styles.petPhotoFallback}>
                        <PawPrint size={28} color={colors.primary} />
                      </View>
                    )}
                  </View>
                  <View style={styles.petCopy}>
                    <Text style={styles.petName} numberOfLines={1} maxFontSizeMultiplier={1.25}>
                      {pet.name}
                    </Text>
                    <Text style={styles.petMeta} numberOfLines={1} maxFontSizeMultiplier={1.25}>
                      {pet.species}{pet.age != null ? ` · ${pet.age} yr` : ''}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
        </View>

        {/* ── Account ── */}
        <View style={styles.section}>
          <Text style={[styles.sectionLabel, styles.sectionLabelSolo]}>Account</Text>
          <View style={styles.grid}>
            {ACCOUNT_MENU.map((item) => (
              <AccountTile key={item.label} {...item} />
            ))}
          </View>
        </View>

        {/* ── About ── */}
        <TouchableOpacity
          style={styles.aboutRow}
          onPress={() => router.push('/(tabs)/about' as any)}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="About Pet Royale. Clinic details and app version"
        >
          <View style={styles.aboutIcon}>
            <Info size={19} color={colors.primary} strokeWidth={1.9} />
          </View>
          <Text style={styles.aboutLabel} numberOfLines={1}>About Pet Royale</Text>
          <ChevronRight size={17} color={colors.mutedFg} />
        </TouchableOpacity>

        {/* Neutral on purpose: signing out is easy to undo, so it
            shouldn't look as dangerous as deleting something. */}
        <TouchableOpacity
          style={styles.signOut}
          onPress={handleSignOut}
          activeOpacity={0.8}
          hitSlop={hitSlop}
          accessibilityRole="button"
        >
          <Text style={styles.signOutLabel}>Sign out</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const AVATAR = 66;
const RING_GAP = 3;
const RING_WIDTH = 2;
const AVATAR_OUTER = AVATAR + (RING_GAP + RING_WIDTH) * 2;

const PET_AVATAR = 60;
const PET_OUTER = PET_AVATAR + (2 + 2) * 2;
const PET_ITEM_WIDTH = 84;

const styles = StyleSheet.create({
  container: { ...common.screen },
  scroll: {
    paddingBottom: space.xxxl * 2,
  },

  header: {
    paddingHorizontal: space.xxl,
    paddingTop: space.xxxl,
    paddingBottom: space.lg,
  },
  /* 24 / bold / no tracking, the weight and size of a Facebook screen
     title, in the app's own typeface. */
  title: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 24,
    lineHeight: 28,
    letterSpacing: 0,
    color: colors.foreground,
  },

  identity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.lg,
    marginHorizontal: space.xxl,
    marginTop: space.md,
    minHeight: 44,
  },
  identityCopy: { flex: 1, minWidth: 0 },
  avatarRing: {
    width: AVATAR_OUTER,
    height: AVATAR_OUTER,
    borderRadius: AVATAR_OUTER / 2,
    borderWidth: RING_WIDTH,
    borderColor: colors.accent,
    padding: RING_GAP,
  },
  avatar: {
    width: AVATAR,
    height: AVATAR,
    borderRadius: AVATAR / 2,
    backgroundColor: colors.muted,
  },
  avatarFallback: {
    width: AVATAR,
    height: AVATAR,
    borderRadius: AVATAR / 2,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    ...text.title,
    color: colors.primaryFg,
  },
  name: { ...text.title, color: colors.foreground },
  accountType: { ...text.small, color: colors.mutedFg, marginTop: space.xs },

  promptCard: {
    ...common.card,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.lg,
    padding: space.lg,
    marginHorizontal: space.xxl,
    marginTop: space.xl,
  },
  promptIcon: {
    width: 42,
    height: 42,
    borderRadius: radius.md,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  promptCopy: { flex: 1 },
  promptTitle: { ...text.bodyBold, color: colors.foreground },
  promptSub: { ...text.caption, color: colors.mutedFg, marginTop: 1 },

  section: {
    marginHorizontal: space.xxl,
    marginTop: space.xxl,
  },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: space.md,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  /* Same heading style as Home, Shop and Payment History. */
  sectionLabel: {
    ...text.section,
    color: colors.foreground,
  },
  sectionLabelSolo: { marginBottom: space.md },
  countBadge: {
    minWidth: 22,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    alignItems: 'center',
  },
  countText: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 12,
    lineHeight: 16,
    color: colors.primaryFg,
  },
  seeAll: { ...text.smallBold, color: colors.primary },

  /* Pets: avatar row, no cards. */
  petScroll: { marginHorizontal: -space.xxl },
  petStrip: {
    gap: space.sm,
    paddingHorizontal: space.xxl,
    paddingBottom: space.sm,
  },
  petItem: {
    width: PET_ITEM_WIDTH,
    alignItems: 'center',
    gap: space.sm,
  },
  petRing: {
    width: PET_OUTER,
    height: PET_OUTER,
    borderRadius: PET_OUTER / 2,
    borderWidth: 2,
    borderColor: colors.primary,
    padding: 2,
  },
  petPhoto: {
    width: PET_AVATAR,
    height: PET_AVATAR,
    borderRadius: PET_AVATAR / 2,
    backgroundColor: colors.muted,
  },
  petPhotoFallback: {
    width: PET_AVATAR,
    height: PET_AVATAR,
    borderRadius: PET_AVATAR / 2,
    backgroundColor: colors.muted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  petAddCircle: {
    width: PET_OUTER,
    height: PET_OUTER,
    borderRadius: PET_OUTER / 2,
    backgroundColor: colors.muted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  petCopy: { alignItems: 'center', alignSelf: 'stretch' },
  petName: { ...text.bodyBold, color: colors.foreground, textAlign: 'center' },
  petMeta: { ...text.caption, color: colors.mutedFg, marginTop: 2, textAlign: 'center' },

  emptyCard: {
    ...common.card,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.lg,
    padding: space.lg,
  },
  emptyIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.muted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyCopy: { flex: 1 },
  emptyTitle: { ...text.bodyBold, color: colors.foreground },
  emptySub: { ...text.caption, color: colors.mutedFg, marginTop: 1 },

  /* Account tiles. */
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.md,
  },
  tile: {
    ...common.card,
    flexBasis: '45%',
    flexGrow: 1,
    minHeight: 112,
    padding: space.lg,
    justifyContent: 'space-between',
    gap: space.md,
  },
  tileIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.muted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileLabel: { ...text.bodyBold, color: colors.foreground, lineHeight: 20 },
  tileSub: { ...text.caption, color: colors.mutedFg, marginTop: 2 },

  aboutRow: {
    ...common.card,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
    marginHorizontal: space.xxl,
    marginTop: space.md,
    minHeight: 56,
  },
  aboutIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.muted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  aboutLabel: { ...text.bodyBold, color: colors.foreground, flex: 1 },

  signOut: {
    marginHorizontal: space.xxl,
    marginTop: space.md,
    height: 48,
    borderRadius: radius.md,
    backgroundColor: colors.muted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  signOutLabel: { ...text.bodyBold, color: colors.foreground },
});

/* ── Loading state ──
   The title is static, so it shows at once; only what depends on the
   network is a placeholder. The shapes follow the loaded layout
   (identity, pet avatars, account tiles) so nothing jumps when the data
   lands. */
function ProfileSkeleton() {
  return (
    <View
      style={styles.container}
      accessibilityLabel="Loading profile"
      accessibilityLiveRegion="polite"
    >
      <StatusBar barStyle="dark-content" backgroundColor={colors.background} />

      <ScrollView
        scrollEnabled={false}
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={styles.title}>Profile</Text>
        </View>

        <View style={styles.identity}>
          <Skeleton width={AVATAR_OUTER} height={AVATAR_OUTER} radius={AVATAR_OUTER / 2} />
          <View style={styles.identityCopy}>
            <Skeleton width="60%" height={22} />
            <Skeleton width="38%" height={14} style={{ marginTop: space.sm }} />
          </View>
        </View>

        <View style={styles.section}>
          <Skeleton width={80} height={18} style={{ marginBottom: space.md }} />
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            {[0, 1, 2].map((i) => (
              <View key={i} style={{ width: PET_ITEM_WIDTH, alignItems: 'center', gap: space.sm }}>
                <Skeleton width={PET_OUTER} height={PET_OUTER} radius={PET_OUTER / 2} />
                <Skeleton width="70%" height={14} />
              </View>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Skeleton width={72} height={18} style={{ marginBottom: space.md }} />
          <View style={styles.grid}>
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} width="47.5%" height={112} radius={radius.card} />
            ))}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
