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
  Bell, CalendarPlus, Check, Clock, ChevronRight, AlertCircle,
} from 'lucide-react-native';
import {
  colors, text, space, radius, shadow, common, hitSlop, status, sz,
} from '../../constants/theme';
import { useTabBarClearance } from './_layout';
import { BrandWordmark } from '../../constants/brand';
import { Skeleton } from '../../components/Skeleton';
import { ReceiptModal } from '../../components/ReceiptModal';
import { ProductCard, ProductCardSkeleton } from '../../components/ProductCard';
import { toLocalISO, dayKey, fmtDate, fmtShortDate, fmtTime } from '../../lib/format';
import { useRealtimeRefresh } from '../../lib/useRealtimeRefresh';

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

const STATUS_LABEL: Record<string, string> = {
  incoming: 'Pending',
  confirmed: 'Confirmed',
};

/* Progress shown on the next-visit card. */
const TRACK_STEPS = ['Requested', 'Confirmed', 'Visit'];
const TRACK_INDEX: Record<string, number> = { incoming: 0, confirmed: 1 };

/* Same wording as the booking steps in Visits. */
const NOTE_PENDING = 'Your slot is booked. Please arrive a few minutes early.';
const NOTE_CONFIRMED = 'The clinic has confirmed your visit.';

/* Text and rules on the navy card: the cream from the theme, softened. */
const ON_NAVY_MUTED = 'rgba(246, 245, 238, 0.72)';
const ON_NAVY_SOFT = 'rgba(246, 245, 238, 0.85)';
const ON_NAVY_FAINT = 'rgba(246, 245, 238, 0.65)';
const ON_NAVY_RULE = 'rgba(255, 255, 255, 0.18)';
const ON_NAVY_TRACK = 'rgba(255, 255, 255, 0.2)';
const ON_NAVY_DOT_RING = 'rgba(255, 255, 255, 0.35)';
const ON_NAVY_BLOCK = 'rgba(255, 255, 255, 0.12)';
const AMBER = '#F4C46B';
const PENDING_ON_NAVY = '#F2E6C8';
const CONFIRMED_ON_NAVY = '#9FE0C8';

const MONTHS_SHORT = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

/* Content never gets wider than this, so on a tablet the page is a
   centred column instead of stretched cards. */
const MAX_CONTENT = 560;

/* Below this width (small and older phones) the side margin tightens so
   cards keep room for their text. */
const NARROW_WIDTH = 360;

/* Same profile-photo ring as the Profile screen, at a smaller size. */
const AVATAR = 36;
const RING_GAP = 2;
const RING_WIDTH = 2;
const AVATAR_OUTER = AVATAR + (RING_GAP + RING_WIDTH) * 2;

/* Widths that depend on the screen. Text and heights already follow the
   screen through sz() in the theme; the side margin and the product strip
   need the real width so two cards fill the row on any phone (capped on
   tablets). */
function useHomeLayout() {
  const { width } = useWindowDimensions();
  const sidePad = width < NARROW_WIDTH ? space.lg : space.xxl;
  const content = Math.min(width, MAX_CONTENT);
  const stripCardWidth = Math.max(
    120,
    Math.min(220, Math.floor((content - sidePad * 2 - space.md) / 2)),
  );
  return { stripCardWidth, sidePad };
}

function dateParts(iso: string): { y: number; m: number; d: number } {
  const [y, m, d] = dayKey(iso).split('-').map(Number);
  return { y: y || 0, m: m || 1, d: d || 1 };
}

/* Label for the date block on the next visit: TODAY, TOMORROW, OCT 15.
   Compares calendar days, not hours. */
function dayLabel(iso: string): string {
  const { y, m, d } = dateParts(iso);
  const visit = new Date(y, m - 1, d);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diff = Math.round((visit.getTime() - startOfToday.getTime()) / 86400000);
  if (diff === 0) return 'TODAY';
  if (diff === 1) return 'TOMORROW';
  return `${MONTHS_SHORT[m - 1]} ${d}`;
}

/* The Requested / Confirmed / Visit progress line. The status line already
   says the same thing, so it's off for a lighter card; set to true to
   bring it back. */
const SHOW_TRACK = false;

const peso = (n: number) =>
  `₱${Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const bottomPad = useTabBarClearance();
  const { stripCardWidth, sidePad } = useHomeLayout();
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
  // Unread count for the bell's badge. Same table and filters as the
  // Notifications screen (client_user_id, type = 'appointment'), so the
  // number here never disagrees with what's actually in that list.
  const [unreadCount, setUnreadCount] = useState(0);

  const loadData = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const today = toLocalISO(new Date());
      const [clientRes, nextRes, recentRes, productRes] = await Promise.all([
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
          .order('scheduled_time', { ascending: false })
          .limit(3),
        (supabase as any).from('products').select('*').eq('is_available', true).limit(8),
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

  const isPending = nextVisit?.status === 'incoming';
  const statusColor = isPending ? PENDING_ON_NAVY : CONFIRMED_ON_NAVY;
  const nextTime = nextVisit ? fmtTime(nextVisit.scheduled_time) : '';
  const nextDay = nextVisit ? dayLabel(nextVisit.requested_date) : '';
  const nextDateLong = nextVisit ? fmtDate(nextVisit.requested_date, 'long') : '';
  const trackOn = nextVisit ? (TRACK_INDEX[nextVisit.status] ?? 0) : 0;
  const goVisits = () => router.push('/(tabs)/appointments' as any);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.background} />

      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingHorizontal: sidePad, paddingBottom: bottomPad },
        ]}
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

          {/* Bare icon, no circle behind it. */}
          <TouchableOpacity
            style={styles.iconBtn}
            onPress={() => router.push('/(tabs)/notifications' as any)}
            activeOpacity={0.7}
            hitSlop={hitSlop}
            accessibilityRole="button"
            accessibilityLabel={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
          >
            <Bell size={24} color={colors.primary} strokeWidth={1.8} />
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

        {/* ── Next visit ── same layout as an upcoming booking in Visits:
            date block on the left, pet and service beside it, plain status
            line under the service. */}
        {nextVisit ? (
          <View
            style={styles.visitCard}
            accessibilityLabel={`Next visit, ${nextVisit.pet_name}, ${nextVisit.service}, ${nextDateLong}${nextTime ? ` at ${nextTime}` : ''}, ${STATUS_LABEL[nextVisit.status] || nextVisit.status}`}
          >
            <Text style={styles.visitEyebrow} maxFontSizeMultiplier={1.15}>Next visit</Text>

            <View style={styles.cardTop}>
              <View style={styles.dateBlock}>
                {nextTime ? (
                  <Text style={styles.dateLabel} numberOfLines={1} maxFontSizeMultiplier={1.15}>
                    {nextDay}
                  </Text>
                ) : null}
                <Text style={styles.dateBig} numberOfLines={1} maxFontSizeMultiplier={1.15}>
                  {nextTime || nextDay}
                </Text>
              </View>
              <View style={styles.cardTitleWrap}>
                <Text style={styles.visitName} numberOfLines={1} maxFontSizeMultiplier={1.2}>
                  {nextVisit.pet_name}
                </Text>
                <Text style={styles.visitService} numberOfLines={2} maxFontSizeMultiplier={1.2}>
                  {nextVisit.service}
                </Text>
                {/* Icon plus label, so the status never relies on colour alone. */}
                <View style={styles.statusRow}>
                  {isPending
                    ? <Clock size={15} color={statusColor} strokeWidth={2.2} />
                    : <Check size={15} color={statusColor} strokeWidth={2.4} />}
                  <Text style={[styles.statusText, { color: statusColor }]} maxFontSizeMultiplier={1.15}>
                    {STATUS_LABEL[nextVisit.status] || nextVisit.status}
                  </Text>
                </View>
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

            {/* Footer: the note, and View details as a text link (not a
                button), like "Receipt" in the rows below. */}
            <View style={[styles.cardFoot, { borderTopColor: ON_NAVY_RULE }]}>
              <Text style={styles.footNote} numberOfLines={3} maxFontSizeMultiplier={1.15}>
                {isPending ? NOTE_PENDING : NOTE_CONFIRMED}
              </Text>
              <TouchableOpacity
                style={styles.linkRow}
                onPress={goVisits}
                activeOpacity={0.7}
                hitSlop={hitSlop}
                accessibilityRole="link"
                accessibilityLabel="Next visit, view details"
              >
                <Text style={[styles.linkText, { color: colors.primaryFg }]} maxFontSizeMultiplier={1.15}>
                  View details
                </Text>
                <ChevronRight size={16} color={colors.primaryFg} strokeWidth={2.2} />
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
              style={[styles.productScroll, { marginHorizontal: -sidePad }]}
              contentContainerStyle={[styles.productStrip, { paddingHorizontal: sidePad }]}
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

        {/* ── Recent visits ── same rows as History in Visits: date,
            pet, service and time, then amount and Receipt. */}
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
            {recentVisits.map((visit, i) => {
              const invoice = recentInvoices[visit.id];
              const { m, d } = dateParts(visit.requested_date);
              const sub = [visit.service, fmtTime(visit.scheduled_time)].filter(Boolean).join(' \u00b7 ');
              const shortDate = fmtShortDate(visit.requested_date);
              return (
                <TouchableOpacity
                  key={visit.id}
                  style={[
                    styles.row,
                    i === 0 && styles.rowFirst,
                    i === recentVisits.length - 1 && styles.rowLast,
                  ]}
                  onPress={() => (invoice ? setReceiptFor(visit) : goVisits())}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel={
                    invoice
                      ? `View receipt, ${visit.pet_name}, ${visit.service}, ${shortDate}, ${peso(invoice.total)}, paid`
                      : `${visit.pet_name}, ${visit.service}, ${shortDate}`
                  }
                >
                  <View style={styles.dateCol}>
                    <Text style={styles.dateDay} maxFontSizeMultiplier={1.2}>{d}</Text>
                    <Text style={styles.dateMon} maxFontSizeMultiplier={1.2}>{MONTHS_SHORT[m - 1]}</Text>
                  </View>
                  <View style={styles.rowText}>
                    <Text style={styles.rowPet} numberOfLines={1} maxFontSizeMultiplier={1.2}>
                      {visit.pet_name}
                    </Text>
                    <Text style={styles.rowSub} numberOfLines={2} maxFontSizeMultiplier={1.2}>
                      {sub}
                    </Text>
                  </View>
                  <View style={styles.rowRight}>
                    {invoice ? (
                      <>
                        <Text style={styles.rowAmount} numberOfLines={1} maxFontSizeMultiplier={1.2}>
                          {peso(invoice.total)}
                        </Text>
                        <View style={styles.receiptRow}>
                          <Text style={styles.receiptText} maxFontSizeMultiplier={1.15}>Receipt</Text>
                          <ChevronRight size={14} color={colors.primary} strokeWidth={2} />
                        </View>
                      </>
                    ) : (
                      <ChevronRight size={16} color={colors.mutedFg} strokeWidth={2} />
                    )}
                  </View>
                </TouchableOpacity>
              );
            })}
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
  /* Side margin is set in the component from the screen width (space.xxl,
     like Profile, or space.lg on narrow phones). maxWidth + alignSelf
     keep the content a centred column on tablets. */
  scroll: {
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
  /* No background: just the icon, with a 44pt touch area. */
  iconBtn: {
    position: 'relative',
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notifBadge: {
    position: 'absolute',
    top: 2,
    right: 0,
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
  visitEyebrow: { ...text.caption, color: ON_NAVY_MUTED, marginBottom: space.sm },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.md,
  },
  /* Block with the day and time. Grows with its content, so large font
     sizes never clip it, and never shrinks below its text. */
  dateBlock: {
    minWidth: 76,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: ON_NAVY_BLOCK,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  dateLabel: {
    ...text.caption,
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 0.8,
    fontFamily: text.bodyBold?.fontFamily,
    color: ON_NAVY_MUTED,
  },
  dateBig: {
    ...text.bodyBold,
    fontSize: sz(18),
    lineHeight: sz(24),
    color: colors.primaryFg,
    fontVariant: ['tabular-nums'],
  },
  cardTitleWrap: { flex: 1, minWidth: 0 },
  visitName: { ...text.bodyBold, fontSize: sz(22), lineHeight: sz(27), color: colors.primaryFg },
  visitService: { ...text.small, color: ON_NAVY_SOFT, marginTop: 2 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: space.sm },
  statusText: { ...text.smallBold, flexShrink: 1 },
  cardFoot: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.sm,
    borderTopWidth: 1,
    marginTop: space.md,
    paddingTop: space.md,
  },
  footNote: { ...text.caption, color: ON_NAVY_MUTED, flex: 1 },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 2, flexShrink: 0 },
  linkText: { ...text.smallBold },

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

  /* ── Recent visits: one grouped list, same rows as History. Every row
     has a bottom border, which is the divider; the first adds a top
     border and the round top corners, the last the round bottom corners. */
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: 68,
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
    backgroundColor: colors.card,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.border,
  },
  rowFirst: {
    borderTopWidth: 1,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  rowLast: {
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
  },
  dateCol: { width: 36, alignItems: 'center', flexShrink: 0 },
  dateDay: { ...text.bodyBold, fontSize: 20, lineHeight: 22, color: colors.foreground },
  dateMon: {
    ...text.caption,
    marginTop: 2,
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 0.6,
    fontFamily: text.bodyBold?.fontFamily,
    color: colors.mutedFg,
  },
  rowText: { flex: 1, minWidth: 0 },
  rowPet: { ...text.bodyBold, fontSize: 16, color: colors.foreground },
  rowSub: { ...text.caption, color: colors.mutedFg, marginTop: 2 },
  rowRight: { alignItems: 'flex-end', gap: 4, flexShrink: 0, maxWidth: '45%' },
  rowAmount: {
    ...text.bodyBold,
    fontSize: 16,
    color: colors.foreground,
    fontVariant: ['tabular-nums'],
  },
  receiptRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  receiptText: { ...text.caption, fontFamily: text.bodyBold?.fontFamily, color: colors.primary },

  /* The strip bleeds to the edge of the content column, like Profile's
     pet row, so the next card peeks in and shows that it scrolls. The
     side margin is set in the component. */
  productScroll: {},
  productStrip: { gap: space.md, paddingBottom: space.sm },
});

/* ── Loading state ──
   Everything that depends on the network is a placeholder shaped like
   the loaded page: header, hero card, product strip and visit rows. */
function HomeSkeleton({ topInset }: { topInset: number }) {
  const bottomPad = useTabBarClearance();
  const { stripCardWidth, sidePad } = useHomeLayout();
  return (
    <View
      style={styles.container}
      accessibilityLabel="Loading home"
      accessibilityLiveRegion="polite"
    >
      <StatusBar barStyle="dark-content" backgroundColor={colors.background} />

      <ScrollView
        scrollEnabled={false}
        contentContainerStyle={[
          styles.scroll,
          { paddingHorizontal: sidePad, paddingBottom: bottomPad },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.header, { paddingTop: topInset + space.md }]}>
          <Skeleton width={AVATAR_OUTER} height={AVATAR_OUTER} radius={AVATAR_OUTER / 2} />
          <View style={styles.greetingWrap}>
            <Skeleton width={90} height={12} />
            <View style={{ height: 6 }} />
            <Skeleton width={110} height={20} />
          </View>
          <Skeleton width={24} height={24} radius={12} />
        </View>

        <View style={{ marginTop: space.md }}>
          <Skeleton width="100%" height={176} radius={radius.card} />
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
        {[0, 1, 2].map((i) => (
          <View
            key={i}
            style={[styles.row, i === 0 && styles.rowFirst, i === 2 && styles.rowLast]}
          >
            <View style={styles.dateCol}>
              <Skeleton width={28} height={32} />
            </View>
            <View style={styles.rowText}>
              <Skeleton width={80} height={16} />
              <Skeleton width={130} height={12} style={{ marginTop: 6 }} />
            </View>
            <Skeleton width={64} height={16} />
          </View>
        ))}
      </ScrollView>
    </View>
  );
}
