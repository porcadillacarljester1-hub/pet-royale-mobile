import { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  Image,
  RefreshControl,
  ScrollView,
  useWindowDimensions,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';
import {
  Bell, CalendarPlus, Check, AlertCircle, Scissors, Activity, Stethoscope,
} from 'lucide-react-native';
import {
  colors, text, space, radius, shadow, common, hitSlop, status, sz,
} from '../../constants/theme';
import { useTabBarClearance } from './_layout';
import { BrandWordmark } from '../../constants/brand';
import { Skeleton, SkeletonRow } from '../../components/Skeleton';
import { ReceiptModal } from '../../components/ReceiptModal';
import { ProductCard, ProductCardSkeleton } from '../../components/ProductCard';
import { pesoWhole, toLocalISO, fmtDate, fmtShortDate, fmtTime } from '../../lib/format';
import { useRealtimeRefresh } from '../../lib/useRealtimeRefresh';

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

const STATUS_LABEL: Record<string, string> = {
  incoming: 'Awaiting confirmation',
  confirmed: 'Confirmed',
};

const STATUS_TONE: Record<string, keyof typeof status> = {
  incoming: 'warning',
  confirmed: 'teal',
};

/* Progress shown on the next-visit card. */
const TRACK_STEPS = ['Requested', 'Confirmed', 'Visit'];
const TRACK_INDEX: Record<string, number> = { incoming: 0, confirmed: 1 };

/* Text and rules on the navy cards: the cream from the theme, softened. */
const ON_NAVY_MUTED = 'rgba(246, 245, 238, 0.72)';
const ON_NAVY_SOFT = 'rgba(246, 245, 238, 0.85)';
const ON_NAVY_FAINT = 'rgba(246, 245, 238, 0.65)';
const ON_NAVY_BTN = 'rgba(255, 255, 255, 0.12)';
const ON_NAVY_TRACK = 'rgba(255, 255, 255, 0.2)';
const ON_NAVY_DOT_RING = 'rgba(255, 255, 255, 0.35)';
const AMBER = '#F4C46B';
const SERVICE_TILE = '#E9A23B';

/* Content never gets wider than this, so on a tablet the page is a
   centred column instead of stretched cards. */
const MAX_CONTENT = 560;

/* Same profile-photo ring as the Profile screen, at a smaller size. */
const AVATAR = 36;
const RING_GAP = 2;
const RING_WIDTH = 2;
const AVATAR_OUTER = AVATAR + (RING_GAP + RING_WIDTH) * 2;

/* Widths that depend on the screen. Text and heights already follow the
   screen through sz() in the theme; the product strip needs the real
   width so two cards fill the row on any phone (capped on tablets). */
function useHomeLayout() {
  const { width } = useWindowDimensions();
  const content = Math.min(width, MAX_CONTENT);
  const stripCardWidth = Math.min(
    220,
    Math.floor((content - space.xxl * 2 - space.md) / 2),
  );
  return { stripCardWidth };
}

/* The Requested / Confirmed / Visit progress line. The status pill already
   says the same thing, so it's off for a lighter card; set to true to
   bring it back. */
const SHOW_TRACK = false;

/* A small icon per kind of service, falling back to a check. */
function visitIcon(service: string) {
  const s = (service || '').toLowerCase();
  if (s.includes('groom')) return Scissors;
  if (s.includes('emergency') || s.includes('confine')) return Activity;
  if (s.includes('check') || s.includes('vet')) return Stethoscope;
  return Check;
}

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const bottomPad = useTabBarClearance();
  const { stripCardWidth } = useHomeLayout();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [firstName, setFirstName] = useState('there');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [nextVisit, setNextVisit] = useState<any>(null);
  const [recentVisits, setRecentVisits] = useState<any[]>([]);
  const [recentInvoices, setRecentInvoices] = useState<Record<string, any>>({});
  const [receiptFor, setReceiptFor] = useState<any | null>(null);
  const [products, setProducts] = useState<any[]>([]);
  const [pets, setPets] = useState<any[]>([]);
  // Unread count for the bell's badge. Same table and filters as the
  // Notifications screen (client_user_id, type = 'appointment'), so the
  // number here never disagrees with what's actually in that list.
  const [unreadCount, setUnreadCount] = useState(0);

  const loadData = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const today = toLocalISO(new Date());
      const [clientRes, nextRes, recentRes, productRes, petRes] = await Promise.all([
        (supabase as any).from('clients').select('name').eq('id', user.id).maybeSingle(),
        (supabase as any).from('appointments').select('*')
          .eq('client_id', user.id)
          .in('status', ['incoming', 'confirmed'])
          .gte('requested_date', today)
          .order('requested_date', { ascending: true })
          .limit(1),
        (supabase as any).from('appointments').select('*')
          .eq('client_id', user.id)
          .eq('status', 'completed')
          .order('requested_date', { ascending: false })
          .limit(3),
        (supabase as any).from('products').select('*').eq('is_available', true).limit(8),
        (supabase as any).from('pets').select('id, name, photo_url').eq('owner_id', user.id),
      ]);
      // The visits are what this screen is for; if they failed, say so.
      // A failed products or name lookup just leaves those parts empty.
      if (nextRes.error || recentRes.error) throw nextRes.error || recentRes.error;

      const name = clientRes.data?.name || user.user_metadata?.full_name || '';
      setFirstName(name.trim().split(/\s+/)[0] || 'there');
      setAvatarUrl(user.user_metadata?.avatar_url || user.user_metadata?.picture || null);
      setNextVisit(nextRes.data?.[0] || null);
      setRecentVisits(recentRes.data || []);
      setProducts(productRes.data || []);
      // Pet photos are cosmetic: if this lookup fails the card falls back to the initial.
      setPets(petRes?.data || []);

      /* What each recent visit was billed. An invoice existing means it
         is paid, so there's no balance to work out; the receipt fetches
         its own line items and payments when it's opened. */
      const recentIds = (recentRes.data || []).map((v: any) => v.id);
      if (recentIds.length > 0) {
        const { data: invs } = await (supabase as any)
          .from('invoices')
          .select('id, appointment_id, total_amount, created_at')
          .in('appointment_id', recentIds);
        const invMap: Record<string, any> = {};
        (invs || []).forEach((i: any) => {
          invMap[i.appointment_id] = {
            id: i.id,
            total: Number(i.total_amount || 0),
            created_at: i.created_at,
          };
        });
        setRecentInvoices(invMap);
      } else {
        setRecentInvoices({});
      }
      setLoadError(false);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchUnreadCount = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { count } = await (supabase as any)
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('client_user_id', user.id)
      .eq('type', 'appointment')
      .eq('is_read', false);

    setUnreadCount(count || 0);
  }, []);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));
  useFocusEffect(useCallback(() => { fetchUnreadCount(); }, [fetchUnreadCount]));

  // Refresh the next visit, recent visits and receipts automatically
  useRealtimeRefresh('appointments', loadData);
  useRealtimeRefresh('invoices', loadData);
  // Pet Essentials strip (stock or availability changes)
  useRealtimeRefresh('products', loadData);

  useEffect(() => {
    let active = true;
    let channel: any;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !active) return;
      channel = (supabase as any)
        .channel(`home-notifications-${user.id}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'notifications', filter: `client_user_id=eq.${user.id}` },
          () => fetchUnreadCount(),
        )
        .subscribe();
    })();
    return () => {
      active = false;
      if (channel) supabase.removeChannel(channel);
    };
  }, [fetchUnreadCount]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    await fetchUnreadCount();
    setRefreshing(false);
  };

  if (loading) return <HomeSkeleton topInset={insets.top} />;

  const nextTone = nextVisit ? status[STATUS_TONE[nextVisit.status] || 'neutral'] : null;
  const nextTime = nextVisit ? fmtTime(nextVisit.scheduled_time) : '';
  const nextDate = nextVisit ? fmtDate(nextVisit.requested_date, 'long') : '';
  const trackOn = nextVisit ? (TRACK_INDEX[nextVisit.status] ?? 0) : 0;
  const nextPet = nextVisit
    ? pets.find((p) => p.id && p.id === nextVisit.pet_id)
      || pets.find((p) => (p.name || '').trim().toLowerCase() === (nextVisit.pet_name || '').trim().toLowerCase())
    : null;
  const nextPetPhoto: string | null = nextPet?.photo_url || null;
  const goVisits = () => router.push('/(tabs)/appointments' as any);

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
            progressViewOffset={insets.top}
          />
        }
      >
        {/* ── Header: photo, greeting, bell ── */}
        <View style={[styles.header, { paddingTop: insets.top + space.md }]}>
          <TouchableOpacity
            onPress={() => router.push('/(tabs)/profile' as any)}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Your profile"
          >
            <View style={styles.avatarRing}>
              {avatarUrl ? (
                <Image source={{ uri: avatarUrl }} style={styles.avatar} />
              ) : (
                <View style={styles.avatarFallback}>
                  <Text style={styles.avatarInitial}>
                    {firstName[0]?.toUpperCase() || '?'}
                  </Text>
                </View>
              )}
            </View>
          </TouchableOpacity>

          <View style={styles.greetingWrap}>
            <Text style={styles.greetingSmall} numberOfLines={1} maxFontSizeMultiplier={1.2}>
              {greeting()}
            </Text>
            <Text style={styles.greetingName} numberOfLines={2} maxFontSizeMultiplier={1.2}>
              {firstName}
            </Text>
          </View>

          <TouchableOpacity
            style={styles.iconBtn}
            onPress={() => router.push('/(tabs)/notifications' as any)}
            activeOpacity={0.7}
            hitSlop={hitSlop}
            accessibilityRole="button"
            accessibilityLabel={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
          >
            <Bell size={20} color={colors.primary} strokeWidth={1.8} />
            {unreadCount > 0 && (
              <View style={styles.notifBadge}>
                <Text style={styles.notifBadgeText} numberOfLines={1}>
                  {unreadCount > 9 ? '9+' : unreadCount}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        {loadError && (
          <View style={styles.loadError} accessibilityLiveRegion="polite">
            <AlertCircle size={15} color={status.danger.fg} strokeWidth={2} />
            <Text style={styles.loadErrorText}>Couldn&apos;t load your visits.</Text>
            <TouchableOpacity onPress={onRefresh} hitSlop={hitSlop} accessibilityRole="button">
              <Text style={styles.loadErrorRetry}>Retry</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── Next visit ── */}
        {nextVisit && nextTone ? (
          <View style={styles.visitCard} accessibilityLabel="Next visit">
            <View style={styles.visitTop}>
              <Text style={styles.visitEyebrow} maxFontSizeMultiplier={1.15}>Next visit</Text>
              <View style={[common.pill, { backgroundColor: nextTone.bg }]}>
                <Text
                  style={[common.pillText, { color: nextTone.fg }]}
                  maxFontSizeMultiplier={1.15}
                >
                  {STATUS_LABEL[nextVisit.status] || nextVisit.status}
                </Text>
              </View>
            </View>

            <View style={styles.visitTimeRow}>
              <Text style={styles.visitTime} maxFontSizeMultiplier={1.2}>
                {nextTime || nextDate}
              </Text>
              {nextTime ? (
                <Text style={styles.visitDay} maxFontSizeMultiplier={1.2}>{nextDate}</Text>
              ) : null}
            </View>

            <View style={styles.svcPanel}>
              <View style={styles.svcTile}>
                {nextPetPhoto ? (
                  <Image
                    source={{ uri: nextPetPhoto }}
                    style={styles.svcPhoto}
                    accessibilityLabel={`Photo of ${nextVisit.pet_name}`}
                  />
                ) : (
                  <Text style={styles.svcTileText}>
                    {nextVisit.pet_name?.[0]?.toUpperCase() || '?'}
                  </Text>
                )}
              </View>
              <View style={styles.svcCopy}>
                <Text style={styles.visitService} numberOfLines={2}>{nextVisit.service}</Text>
                <Text style={styles.visitPet} numberOfLines={1}>{nextVisit.pet_name}</Text>
              </View>
            </View>

            {SHOW_TRACK && (
              <View style={styles.track} accessibilityLabel={`Status: ${TRACK_STEPS[trackOn]}`}>
                <View style={styles.trackLine} />
                {TRACK_STEPS.map((label, i) => {
                  const on = i === trackOn;
                  const align = i === 0 ? 'flex-start' : i === TRACK_STEPS.length - 1 ? 'flex-end' : 'center';
                  return (
                    <View key={label} style={[styles.trackStep, { alignItems: align }]}>
                      <View style={[styles.trackDot, on && styles.trackDotOn]} />
                      <Text
                        style={[styles.trackLabel, on && styles.trackLabelOn]}
                        maxFontSizeMultiplier={1.15}
                      >
                        {label}
                      </Text>
                    </View>
                  );
                })}
              </View>
            )}

            {/* One action. The old Cancel button opened the same Visits
                screen as this one, so it didn't cancel anything. */}
            <View style={styles.visitBtns}>
              <TouchableOpacity
                style={[styles.visitBtn, styles.visitBtnMain]}
                onPress={goVisits}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel="Next visit, view details"
              >
                <Text style={[styles.visitBtnText, styles.visitBtnMainText]} maxFontSizeMultiplier={1.15}>
                  View details
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          /* The card doesn't repeat a headline: just the brand and the action. */
          <TouchableOpacity
            style={styles.bookCard}
            onPress={() => router.push('/(tabs)/book' as any)}
            activeOpacity={0.9}
            accessibilityRole="button"
            accessibilityLabel="Book a visit"
          >
            <BrandWordmark height={20} color={colors.accent} />
            <View style={styles.bookBtn}>
              <CalendarPlus size={17} color={colors.primary} />
              <Text style={styles.bookBtnText}>Book a visit</Text>
            </View>
          </TouchableOpacity>
        )}

        {/* ── Pet Essentials ── */}
        {products.length > 0 && (
          <>
            <View style={styles.sectionHead}>
              <Text style={styles.sectionTitle}>Pet Essentials</Text>
              <TouchableOpacity
                onPress={() => router.push('/(tabs)/products' as any)}
                activeOpacity={0.7}
                hitSlop={hitSlop}
                accessibilityRole="button"
                accessibilityLabel="Shop all products"
              >
                <Text style={styles.sectionLink}>Shop all</Text>
              </TouchableOpacity>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.productScroll}
              contentContainerStyle={styles.productStrip}
            >
              {products.map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  style={{ width: stripCardWidth }}
                  compact
                  hideHealthyStock
                  onPress={() => router.push('/(tabs)/products' as any)}
                />
              ))}
            </ScrollView>
          </>
        )}

        {/* ── Recent visits ── */}
        {recentVisits.length > 0 && (
          <>
            <View style={styles.sectionHead}>
              <Text style={styles.sectionTitle}>Recent visits</Text>
              <TouchableOpacity
                onPress={goVisits}
                activeOpacity={0.7}
                hitSlop={hitSlop}
                accessibilityRole="button"
                accessibilityLabel="See all visits"
              >
                <Text style={styles.sectionLink}>See all</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.visitList}>
              {recentVisits.map((visit, i) => {
                const invoice = recentInvoices[visit.id];
                const Icon = visitIcon(visit.service);
                return (
                  <TouchableOpacity
                    key={visit.id}
                    style={[styles.visitRow, i === recentVisits.length - 1 && styles.visitRowLast]}
                    onPress={() => invoice ? setReceiptFor(visit) : goVisits()}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel={
                      invoice
                        ? `${visit.service} for ${visit.pet_name}, view receipt`
                        : `${visit.service} for ${visit.pet_name}`
                    }
                  >
                    <View style={styles.visitRowIcon}>
                      <Icon size={20} color={colors.primary} strokeWidth={1.9} />
                    </View>
                    <View style={styles.visitRowCopy}>
                      <Text
                        style={styles.visitRowService}
                        numberOfLines={2}
                        maxFontSizeMultiplier={1.15}
                      >
                        {visit.service}
                      </Text>
                      <Text
                        style={styles.visitRowMeta}
                        numberOfLines={1}
                        maxFontSizeMultiplier={1.15}
                      >
                        {visit.pet_name} · {fmtShortDate(visit.requested_date)} · Completed
                      </Text>
                    </View>
                    {invoice && (
                      <Text style={styles.visitRowAmount} maxFontSizeMultiplier={1.15}>
                        {pesoWhole(invoice.total)}
                      </Text>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          </>
        )}
      </ScrollView>

      {receiptFor && (
        <ReceiptModal
          visit={receiptFor}
          invoice={recentInvoices[receiptFor.id]}
          onClose={() => setReceiptFor(null)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { ...common.screen },
  /* Same side margin as Profile (space.xxl). maxWidth + alignSelf keep
     the content a centred column on tablets. */
  scroll: {
    paddingHorizontal: space.xxl,
    width: '100%',
    maxWidth: MAX_CONTENT,
    alignSelf: 'center',
  },

  /* Header scrolls with the page: photo · greeting · bell */
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingBottom: 0,
  },
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
    backgroundColor: colors.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    ...text.title,
    fontSize: 16,
    lineHeight: 20,
    letterSpacing: 0,
    color: colors.secondaryFg,
  },
  greetingWrap: { flex: 1, minWidth: 0 },
  greetingSmall: { ...text.caption, color: colors.mutedFg },
  greetingName: { ...text.title, fontSize: sz(20), lineHeight: sz(24), color: colors.foreground },
  iconBtn: {
    position: 'relative',
    width: AVATAR_OUTER,
    height: AVATAR_OUTER,
    borderRadius: AVATAR_OUTER / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.muted,
  },
  notifBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 17,
    height: 17,
    paddingHorizontal: 3,
    borderRadius: 8.5,
    backgroundColor: status.danger.fg,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.background,
  },
  notifBadgeText: {
    fontSize: 10,
    lineHeight: 12,
    fontFamily: text.bodyBold?.fontFamily,
    fontWeight: '700',
    color: '#fff',
  },

  loadError: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    backgroundColor: status.danger.bg,
    borderRadius: radius.md,
    padding: space.md,
    marginTop: space.md,
  },
  loadErrorText: { ...text.small, color: status.danger.fg, flex: 1 },
  loadErrorRetry: { ...text.smallBold, color: status.danger.fg, textDecorationLine: 'underline' },

  /* ── Next visit card ── */
  visitCard: {
    marginTop: space.md,
    backgroundColor: colors.primary,
    borderRadius: radius.card,
    padding: space.lg,
    overflow: 'hidden',
    ...shadow.primary,
  },
  visitTop: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.sm,
  },
  visitEyebrow: { ...text.caption, color: ON_NAVY_MUTED },
  visitTimeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'baseline',
    columnGap: 8,
    marginTop: 6,
    marginBottom: 0,
  },
  visitTime: { ...text.display, color: colors.primaryFg },
  visitDay: { ...text.small, color: ON_NAVY_SOFT },

  svcPanel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    marginTop: space.md,
  },
  svcTile: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: SERVICE_TILE,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  svcPhoto: { width: '100%', height: '100%' },
  svcTileText: {
    ...text.title,
    fontSize: 15,
    lineHeight: 19,
    letterSpacing: 0,
    color: '#fff',
  },
  svcCopy: { flex: 1, minWidth: 0 },
  visitService: { ...text.bodyBold, color: colors.primaryFg },
  visitPet: { ...text.small, color: ON_NAVY_SOFT },

  track: { flexDirection: 'row', marginTop: 12, marginBottom: 2, marginHorizontal: 2 },
  trackLine: {
    position: 'absolute',
    left: 7,
    right: 7,
    top: 6,
    height: 2,
    backgroundColor: ON_NAVY_TRACK,
  },
  trackStep: { flex: 1, gap: 4 },
  trackDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: colors.primary,
    borderWidth: 2,
    borderColor: ON_NAVY_DOT_RING,
  },
  trackDotOn: { backgroundColor: AMBER, borderColor: AMBER },
  trackLabel: { ...text.caption, fontSize: sz(10.5), lineHeight: sz(14), color: ON_NAVY_FAINT },
  trackLabelOn: { ...text.smallBold, fontSize: sz(10.5), lineHeight: sz(14), color: '#fff' },

  visitBtns: { flexDirection: 'row', gap: 8, marginTop: space.lg },
  visitBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    paddingVertical: 9,
    borderRadius: 12,
    backgroundColor: ON_NAVY_BTN,
  },
  visitBtnMain: { backgroundColor: colors.primaryFg },
  visitBtnText: { ...text.smallBold, color: colors.primaryFg },
  visitBtnMainText: { color: colors.primary },

  bookCard: {
    marginTop: space.lg,
    backgroundColor: colors.primary,
    borderRadius: radius.card,
    padding: space.xl,
    alignItems: 'flex-start',
    ...shadow.primary,
  },
  bookBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    alignSelf: 'flex-start',
    marginTop: space.xl,
    paddingHorizontal: space.xl,
    paddingVertical: space.md,
    borderRadius: radius.pill,
    backgroundColor: colors.primaryFg,
  },
  bookBtnText: { ...text.bodyBold, color: colors.primary },

  /* Same heading style and spacing as Profile's sections. */
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: space.xxl,
    marginBottom: space.md,
  },
  sectionTitle: { ...text.section, color: colors.foreground },
  sectionLink: { ...text.smallBold, color: colors.primary },

  /* ── Recent visits ── */
  visitList: {
    ...common.card,
    padding: 0,
    overflow: 'hidden',
  },
  visitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  visitRowLast: { borderBottomWidth: 0 },
  /* The same round tile Profile uses behind its icons. */
  visitRowIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.muted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  visitRowCopy: { flex: 1, minWidth: 0 },
  visitRowService: { ...text.bodyBold, color: colors.foreground },
  visitRowMeta: { ...text.caption, color: colors.mutedFg, marginTop: 2 },
  visitRowAmount: {
    ...text.bodyBold,
    color: colors.foreground,
    fontVariant: ['tabular-nums'],
    flexShrink: 0,
  },

  /* The strip bleeds to the edge of the content column, like Profile's
     pet row, so the next card peeks in and shows that it scrolls. */
  productScroll: { marginHorizontal: -space.xxl },
  productStrip: { gap: space.md, paddingHorizontal: space.xxl, paddingBottom: space.sm },
});

/* ── Loading state ──
   Everything that depends on the network is a placeholder shaped like
   the loaded page: header, hero card, product strip and visits list. */
function HomeSkeleton({ topInset }: { topInset: number }) {
  const bottomPad = useTabBarClearance();
  const { stripCardWidth } = useHomeLayout();
  return (
    <View
      style={styles.container}
      accessibilityLabel="Loading home"
      accessibilityLiveRegion="polite"
    >
      <StatusBar barStyle="dark-content" backgroundColor={colors.background} />

      <ScrollView
        scrollEnabled={false}
        contentContainerStyle={[styles.scroll, { paddingBottom: bottomPad }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.header, { paddingTop: topInset + space.md }]}>
          <Skeleton width={AVATAR_OUTER} height={AVATAR_OUTER} radius={AVATAR_OUTER / 2} />
          <View style={styles.greetingWrap}>
            <Skeleton width={90} height={12} />
            <View style={{ height: 6 }} />
            <Skeleton width={110} height={20} />
          </View>
          <Skeleton width={AVATAR_OUTER} height={AVATAR_OUTER} radius={AVATAR_OUTER / 2} />
        </View>

        <View style={{ marginTop: space.md }}>
          <Skeleton width="100%" height={218} radius={radius.card} />
        </View>

        <View style={styles.sectionHead}>
          <Skeleton width={120} height={20} />
          <Skeleton width={56} height={14} />
        </View>
        <View style={{ flexDirection: 'row', gap: space.md, overflow: 'hidden' }}>
          {[0, 1, 2].map((i) => (
            <ProductCardSkeleton key={i} compact style={{ width: stripCardWidth }} />
          ))}
        </View>

        <View style={styles.sectionHead}>
          <Skeleton width={110} height={20} />
          <Skeleton width={48} height={14} />
        </View>
        <View style={styles.visitList}>
          {[0, 1, 2].map((i) => (
            <SkeletonRow
              key={i}
              tile={40}
              style={[styles.visitRow, i === 2 && styles.visitRowLast]}
            />
          ))}
        </View>
      </ScrollView>
    </View>
  );
}
