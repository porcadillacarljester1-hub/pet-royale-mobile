import { useState, useCallback, useRef, useEffect, type ElementType } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  StatusBar,
  ScrollView,
  Image,
  Alert,
  RefreshControl,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import Constants, { ExecutionEnvironment } from 'expo-constants';
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
  LogOut,
  AlertCircle,
} from 'lucide-react-native';
import { colors, text, space, radius, common, hitSlop, status, sz } from '../../constants/theme';
import { useTabBarClearance } from './_layout';
import { Skeleton } from '../../components/Skeleton';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const ACCOUNT_MENU = [
  { label: 'Personal Information', sub: 'Name, phone and contact details', Icon: User, route: '/account' },
  { label: 'Payment History', sub: 'Past invoices and receipts', Icon: Receipt, route: '/(tabs)/payment-history' },
  { label: 'Notifications', sub: 'Reminders and clinic updates', Icon: Bell, route: '/(tabs)/notifications' },
  { label: 'Security', sub: 'Password and account access', Icon: ShieldCheck, route: '/(tabs)/security' },
] as const;

/* One row of a settings list. Rows of a group share a single rounded
   card and are separated by a thin line, so the list stays compact and
   the text has the full row width on a narrow phone or a large font. */
function MenuRow({
  label,
  sub,
  Icon,
  route,
  last,
}: {
  label: string;
  sub?: string;
  Icon: ElementType;
  route: string;
  last?: boolean;
}) {
  return (
    <Pressable
      onPress={() => router.push(route as any)}
      android_ripple={{ color: 'rgba(5, 31, 66, 0.07)' }}
      style={({ pressed }) => [styles.menuRow, !last && styles.menuDivider, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={sub ? `${label}. ${sub}` : label}
    >
      <View style={styles.menuIcon}>
        <Icon size={20} color={colors.primary} strokeWidth={1.9} />
      </View>
      <View style={styles.menuCopy}>
        <Text style={styles.menuLabel} numberOfLines={2} maxFontSizeMultiplier={1.25}>{label}</Text>
        {!!sub && (
          <Text style={styles.menuSub} numberOfLines={2} maxFontSizeMultiplier={1.25}>{sub}</Text>
        )}
      </View>
      <ChevronRight size={17} color={colors.mutedFg} />
    </Pressable>
  );
}

function MenuGroup({ children }: { children: React.ReactNode }) {
  /* Two layers: the outer one carries the shadow, the inner one clips
     the rows to the rounded corners (clipping and a shadow on the same
     view would cut the shadow off on iOS). */
  return (
    <View style={styles.group}>
      <View style={styles.groupClip}>{children}</View>
    </View>
  );
}

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const bottomPad = useTabBarClearance();
  const alive = useRef(true);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarFailed, setAvatarFailed] = useState(false);
  const [pets, setPets] = useState<any[]>([]);

  useEffect(() => () => { alive.current = false; }, []);

  const loadProfile = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !alive.current) return;

      setUser(user);
      setAvatarUrl(user.user_metadata?.avatar_url || user.user_metadata?.picture || null);
      setAvatarFailed(false);

      const [clientRes, petsRes] = await Promise.all([
        (supabase as any).from('clients').select('name, phone').eq('id', user.id).maybeSingle(),
        (supabase as any).from('pets').select('*').eq('owner_id', user.id).order('created_at', { ascending: false }),
      ]);
      if (!alive.current) return;

      if (clientRes.error) console.warn('Profile: clients query failed', clientRes.error);
      if (petsRes.error) console.warn('Profile: pets query failed', petsRes.error);

      /* If a request failed, keep what's on screen and say so. An empty
         pet list here would read as "Register your first pet", which
         isn't true when the request just failed. */
      if (clientRes.error || petsRes.error) {
        setLoadError(true);
        return;
      }
      setLoadError(false);

      // The clients row is what the clinic sees, so it wins. Auth
      // metadata is the fallback for an account that predates it.
      const client = clientRes.data;
      setFullName(client?.name || user.user_metadata?.full_name || '');
      setPhone(client?.phone || '');
      setPets(petsRes.data || []);
    } catch (err) {
      console.warn('Profile: failed to load', err);
      if (alive.current) setLoadError(true);
    } finally {
      if (alive.current) setIsLoading(false);
    }
  }, []);

  /* useFocusEffect rather than useEffect: editing your details on
     /account and coming back should show the change. Only the first
     load shows the skeleton; later ones refresh quietly. */
  useFocusEffect(useCallback(() => { loadProfile(); }, [loadProfile]));

  const onRefresh = async () => {
    setRefreshing(true);
    await loadProfile();
    if (alive.current) setRefreshing(false);
  };

  /* The actual sign-out, kept separate from the confirmation dialog. */
  const doSignOut = async () => {
    setSigningOut(true);
    try {
      // Remove this phone's token first, so the next person to use it
      // (or nobody) doesn't receive this account's pushes. It must run
      // before signOut(), while the session still exists.
      // Skipped in Expo Go, where remote push isn't available and merely
      // importing expo-notifications would crash on Android.
      if (Constants.executionEnvironment !== ExecutionEnvironment.StoreClient) {
        try {
          const Notifications = await import('expo-notifications');
          const projectId =
            Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
          const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
          await supabase.from('push_tokens').delete().eq('token', token);
        } catch (err) {
          // Never block signing out because of this.
          console.log('Push token cleanup failed:', err);
        }
      }
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      router.replace('/');
    } catch {
      Alert.alert("Couldn't sign out", 'Check your connection and try again.');
    } finally {
      if (alive.current) setSigningOut(false);
    }
  };

  /* Not 'destructive': signing out loses nothing, so the dialog
     shouldn't turn red on iOS. */
  const handleSignOut = () => {
    Alert.alert('Sign out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', onPress: doSignOut },
    ]);
  };

  const initials =
    fullName?.trim()?.[0]?.toUpperCase() ||
    user?.email?.[0]?.toUpperCase() ||
    '?';
  const version = Constants.expoConfig?.version;

  if (isLoading) return <ProfileSkeleton />;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.background} />

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: bottomPad }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
            progressViewOffset={insets.top}
          />
        }
      >
        <View style={{ paddingTop: insets.top }} />

        {/* Capped width keeps the screen a readable column on tablets;
            on a phone it simply fills the width. */}
        <View style={styles.page}>
          <Text style={styles.title} accessibilityRole="header">Profile</Text>

          {loadError && (
            <View style={styles.loadError} accessibilityLiveRegion="polite">
              <AlertCircle size={15} color={status.danger.fg} strokeWidth={2} />
              <Text style={styles.loadErrorText}>Couldn&apos;t refresh your profile.</Text>
              <Pressable onPress={onRefresh} hitSlop={hitSlop} accessibilityRole="button">
                <Text style={styles.loadErrorRetry}>Retry</Text>
              </Pressable>
            </View>
          )}

          {/* ── Identity ── Tapping it edits your details. */}
          <Pressable
            style={({ pressed }) => [styles.identity, pressed && styles.pressed]}
            onPress={() => router.push('/account' as any)}
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
              <Text style={styles.name} numberOfLines={2}>{fullName || 'Add your name'}</Text>
              <Text style={styles.accountType}>Pet owner account</Text>
            </View>
            <ChevronRight size={20} color={colors.mutedFg} />
          </Pressable>

          {/* ── Missing phone ── Gold is the one thing that matters: the
              clinic can't send reminders without a number. Gone once
              there is one. */}
          {!phone && (
            <Pressable
              style={({ pressed }) => [styles.promptCard, pressed && styles.pressed]}
              onPress={() => router.push('/account' as any)}
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
            </Pressable>
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
                <Pressable
                  style={styles.seeAllBtn}
                  onPress={() => router.push('/(tabs)/pets' as any)}
                  hitSlop={hitSlop}
                  accessibilityRole="button"
                  accessibilityLabel="See all pets"
                >
                  <Text style={styles.seeAll}>See all</Text>
                </Pressable>
              )}
            </View>

            {pets.length === 0 ? (
              <Pressable
                style={({ pressed }) => [styles.emptyCard, pressed && styles.pressed]}
                onPress={() => router.push('/(tabs)/pets' as any)}
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
              </Pressable>
            ) : (
              /* Bleeds to the page edges so the next avatar peeks in,
                 the cue that the row scrolls. Add pet comes first so it
                 stays reachable with any number of pets. */
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.petScroll}
                contentContainerStyle={styles.petStrip}
              >
                <Pressable
                  style={styles.petItem}
                  onPress={() => router.push('/(tabs)/pets' as any)}
                  accessibilityRole="button"
                  accessibilityLabel="Add pet"
                >
                  <View style={styles.petAddCircle}>
                    <Plus size={26} color={colors.primary} strokeWidth={2.2} />
                  </View>
                  <Text style={styles.petName} numberOfLines={1} maxFontSizeMultiplier={1.25}>Add pet</Text>
                </Pressable>

                {pets.map((pet) => (
                  <Pressable
                    key={pet.id}
                    style={styles.petItem}
                    onPress={() => router.push('/(tabs)/pets' as any)}
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
                      <Text style={styles.petName} numberOfLines={1} maxFontSizeMultiplier={1.25}>{pet.name}</Text>
                      <Text style={styles.petMeta} numberOfLines={1} maxFontSizeMultiplier={1.25}>
                        {pet.species}{pet.age != null ? ` · ${pet.age} yr` : ''}
                      </Text>
                    </View>
                  </Pressable>
                ))}
              </ScrollView>
            )}
          </View>

          {/* ── Account ── */}
          <View style={styles.section}>
            <Text style={[styles.sectionLabel, styles.sectionLabelSolo]}>Account</Text>
            <MenuGroup>
              {ACCOUNT_MENU.map((item, i) => (
                <MenuRow key={item.label} {...item} last={i === ACCOUNT_MENU.length - 1} />
              ))}
            </MenuGroup>
          </View>

          {/* ── Clinic ── */}
          <View style={styles.section}>
            <Text style={[styles.sectionLabel, styles.sectionLabelSolo]}>Clinic</Text>
            <MenuGroup>
              <MenuRow label="About Pet Royale" Icon={Info} route="/(tabs)/about" last />
            </MenuGroup>
          </View>

          {/* Navy, not red: signing out is easy to undo, so it
              shouldn't look as dangerous as cancelling or deleting. */}
          <Pressable
            style={({ pressed }) => [styles.signOut, (pressed || signingOut) && styles.signOutPressed]}
            onPress={handleSignOut}
            disabled={signingOut}
            hitSlop={hitSlop}
            accessibilityRole="button"
            accessibilityState={{ disabled: signingOut, busy: signingOut }}
          >
            <LogOut size={20} color={colors.primary} strokeWidth={2} />
            <Text style={styles.signOutLabel}>{signingOut ? 'Signing out…' : 'Sign out'}</Text>
          </Pressable>

          {!!version && <Text style={styles.version}>Pet Royale {version}</Text>}
        </View>
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
  scroll: { flexGrow: 1 },
  page: {
    width: '100%',
    maxWidth: 640,
    alignSelf: 'center',
    paddingHorizontal: space.xxl,
  },
  pressed: { opacity: 0.75 },

  title: { ...text.screenTitle, color: colors.foreground, paddingTop: space.xs, paddingBottom: space.lg },

  loadError: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    backgroundColor: status.danger.bg,
    borderRadius: radius.md,
    padding: space.md,
    marginBottom: space.lg,
  },
  loadErrorText: { ...text.small, color: status.danger.fg, flex: 1 },
  loadErrorRetry: { ...text.smallBold, color: status.danger.fg, textDecorationLine: 'underline' },

  /* Identity is now a card, so it reads as the account's front door. */
  identity: {
    ...common.card,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.lg,
    padding: space.lg,
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
  avatar: { width: AVATAR, height: AVATAR, borderRadius: AVATAR / 2, backgroundColor: colors.muted },
  avatarFallback: {
    width: AVATAR,
    height: AVATAR,
    borderRadius: AVATAR / 2,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: { ...text.title, color: colors.primaryFg },
  name: { ...text.title, color: colors.foreground },
  accountType: { ...text.small, color: colors.mutedFg, marginTop: space.xs },

  promptCard: {
    ...common.card,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.lg,
    padding: space.lg,
    marginTop: space.md,
  },
  promptIcon: {
    width: 42,
    height: 42,
    borderRadius: radius.md,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  promptCopy: { flex: 1, minWidth: 0 },
  promptTitle: { ...text.bodyBold, color: colors.foreground },
  promptSub: { ...text.caption, color: colors.mutedFg, marginTop: 1 },

  section: { marginTop: space.xxl },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: space.md,
  },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  sectionLabel: { ...text.section, color: colors.foreground },
  sectionLabelSolo: { marginBottom: space.md },
  countBadge: {
    minWidth: 22,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    alignItems: 'center',
  },
  countText: { fontFamily: 'DMSans_700Bold', fontSize: 12, lineHeight: 16, color: colors.primaryFg },
  seeAll: { ...text.smallBold, color: colors.primary },
  seeAllBtn: { minHeight: 44, justifyContent: 'center', paddingHorizontal: space.xs },

  /* Pets: avatar row, no cards. */
  petScroll: { marginHorizontal: -space.xxl },
  petStrip: { gap: space.sm, paddingHorizontal: space.xxl, paddingBottom: space.sm },
  petItem: { width: PET_ITEM_WIDTH, alignItems: 'center', gap: space.sm },
  petRing: {
    width: PET_OUTER,
    height: PET_OUTER,
    borderRadius: PET_OUTER / 2,
    borderWidth: 2,
    borderColor: colors.primary,
    padding: 2,
  },
  petPhoto: { width: PET_AVATAR, height: PET_AVATAR, borderRadius: PET_AVATAR / 2, backgroundColor: colors.muted },
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
  emptyCopy: { flex: 1, minWidth: 0 },
  emptyTitle: { ...text.bodyBold, color: colors.foreground },
  emptySub: { ...text.caption, color: colors.mutedFg, marginTop: 1 },

  /* Settings lists: one card per group, thin lines between rows. */
  group: { ...common.card, padding: 0 },
  groupClip: { borderRadius: radius.card - 1, overflow: 'hidden' },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
    minHeight: sz(64),
  },
  menuDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  menuIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: colors.muted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuCopy: { flex: 1, minWidth: 0 },
  menuLabel: { ...text.bodyBold, color: colors.foreground, lineHeight: 20 },
  menuSub: { ...text.caption, color: colors.mutedFg, marginTop: 2 },

  /* Account action: navy outline with a light navy tint. */
  signOut: {
    marginTop: space.xxl,
    minHeight: 52,
    borderRadius: radius.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    borderWidth: 1.5,
    borderColor: colors.primary,
    backgroundColor: 'rgba(5, 31, 66, 0.06)',
  },
  signOutPressed: { backgroundColor: 'rgba(5, 31, 66, 0.14)' },
  signOutLabel: { ...text.bodyBold, color: colors.primary },
  version: { ...text.caption, color: colors.mutedFg, textAlign: 'center', marginTop: space.lg },
});

/* ── Loading state ──
   The title is static, so it shows at once; only what depends on the
   network is a placeholder. The shapes follow the loaded layout so
   nothing jumps when the data lands. */
function ProfileSkeleton() {
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.container} accessibilityLabel="Loading profile" accessibilityLiveRegion="polite">
      <StatusBar barStyle="dark-content" backgroundColor={colors.background} />
      <ScrollView scrollEnabled={false} contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={{ paddingTop: insets.top }} />
        <View style={styles.page}>
          <Text style={styles.title}>Profile</Text>

          <Skeleton width="100%" height={AVATAR_OUTER + space.lg * 2} radius={radius.card} />

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
            <Skeleton width="100%" height={sz(64) * 4} radius={radius.card} />
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
