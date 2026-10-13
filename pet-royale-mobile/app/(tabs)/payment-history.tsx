import { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SectionList,
  ScrollView,
  Pressable,
  RefreshControl,
  StatusBar,
  useWindowDimensions,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Receipt, ChevronRight, AlertCircle } from 'lucide-react-native';
import { supabase } from '../../lib/supabase';
import { fetchPaymentHistory, type PaymentHistoryItem } from '../../lib/invoices';
import { colors, text, space, radius, common, hitSlop, status, shadow, sz } from '../../constants/theme';
import { useTabBarClearance } from './_layout';
import { Skeleton, SkeletonRow } from '../../components/Skeleton';
import { ScreenHeader } from '../../components/ScreenHeader';
import { ReceiptModal } from '../../components/ReceiptModal';
import { peso, fmtPastDate } from '../../lib/format';
import { ServiceIcon } from '../../lib/serviceIcons';

/* The layout was designed around a 360-wide screen at normal text size.
   Past this much extra text-or-narrowness, the amount beside the title
   leaves the title too little room, so the amount moves below it. */
const REFERENCE_WIDTH = 360;
const STACK_ABOVE = 1.15;

type Range = 'all' | 'month' | '3months';

const FILTERS: { key: Range; label: string; summary: string }[] = [
  { key: 'all', label: 'All', summary: 'Total paid' },
  { key: 'month', label: 'This month', summary: 'Paid this month' },
  { key: '3months', label: 'Last 3 months', summary: 'Paid in the last 3 months' },
];

type Group = { key: string; title: string; total: number; data: PaymentHistoryItem[] };

/* The visit's own date, matching the Visits screen. */
const rawDate = (h: PaymentHistoryItem): string | null | undefined =>
  (h.visit_date ?? h.paid_at) as string | null | undefined;

function cutoffFor(range: Range): number | null {
  const now = new Date();
  if (range === 'month') return new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  if (range === '3months') {
    now.setMonth(now.getMonth() - 3);
    return now.getTime();
  }
  return null;
}

function inRange(h: PaymentHistoryItem, cutoff: number | null): boolean {
  if (cutoff === null) return true;
  const raw = rawDate(h);
  if (!raw) return false;
  const t = new Date(raw).getTime();
  return !Number.isNaN(t) && t >= cutoff;
}

/* Keeps the order the list arrives in (newest first) and groups
   neighbours that share a day under one header. */
function groupByDay(items: PaymentHistoryItem[]): Group[] {
  const map = new Map<string, Group>();
  for (const it of items) {
    const raw = rawDate(it);
    const key = raw ? String(raw).slice(0, 10) : 'none';
    let g = map.get(key);
    if (!g) {
      g = { key, title: raw ? fmtPastDate(raw as string) : 'Date unavailable', total: 0, data: [] };
      map.set(key, g);
    }
    g.data.push(it);
    g.total += Number(it.total_amount || 0);
  }
  return Array.from(map.values());
}

/**
 * Payment history.
 *
 * Every row is a paid invoice, and tapping one opens the receipt — the
 * same shared component the Visits and Home screens use, so all three
 * show one document and can't drift apart.
 *
 * Filtering and grouping happen on the phone from the list that
 * fetchPaymentHistory already returns, so there is no extra request.
 */
export default function PaymentHistoryScreen() {
  const router = useRouter();
  const bottomPad = useTabBarClearance();
  const { width, fontScale } = useWindowDimensions();
  const stacked = (fontScale * REFERENCE_WIDTH) / width > STACK_ABOVE;
  const [history, setHistory] = useState<PaymentHistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [range, setRange] = useState<Range>('all');
  const [receiptFor, setReceiptFor] = useState<PaymentHistoryItem | null>(null);

  /* Only the first load shows the skeleton. Coming back to the screen
     refetches quietly, so the list doesn't flash away and lose its
     scroll position. */
  const loadHistory = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setHistory(await fetchPaymentHistory(user.id));
      setLoadError(false);
    } catch {
      // Keep whatever is on screen. An empty list here would read as
      // "No payments yet", which isn't true if the request just failed.
      setLoadError(true);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { loadHistory(); }, [loadHistory]));

  const onRefresh = async () => {
    setRefreshing(true);
    await loadHistory();
    setRefreshing(false);
  };

  const filtered = useMemo(() => {
    const cutoff = cutoffFor(range);
    return history.filter((h) => inRange(h, cutoff));
  }, [history, range]);

  const sections = useMemo(() => groupByDay(filtered), [filtered]);
  const total = useMemo(
    () => filtered.reduce((sum, h) => sum + Number(h.total_amount || 0), 0),
    [filtered],
  );
  const summaryLabel = FILTERS.find((f) => f.key === range)?.summary ?? 'Total paid';

  const handleBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/profile' as any);
  };

  const header = (
    <View>
      {loadError && (
        <View style={styles.loadError} accessibilityLiveRegion="polite">
          <AlertCircle size={15} color={status.danger.fg} strokeWidth={2} />
          <Text style={styles.loadErrorText}>Couldn&apos;t load your payments.</Text>
          <Pressable onPress={onRefresh} hitSlop={hitSlop} accessibilityRole="button">
            <Text style={styles.loadErrorRetry}>Retry</Text>
          </Pressable>
        </View>
      )}

      {history.length > 0 && (
        <>
          <View style={styles.totalCard}>
            <View style={styles.totalTop}>
              <Text style={styles.totalLabel}>{summaryLabel}</Text>
              <View style={styles.totalIcon}>
                <Receipt size={18} color={colors.accent} strokeWidth={1.9} />
              </View>
            </View>
            <Text style={styles.totalAmount} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
              {peso(total)}
            </Text>
            <View style={styles.totalRule} />
            <Text style={styles.totalSub}>
              {filtered.length} paid {filtered.length === 1 ? 'invoice' : 'invoices'}
            </Text>
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.chipScroll}
            contentContainerStyle={styles.chipRow}
          >
            {FILTERS.map((f) => {
              const on = f.key === range;
              return (
                <Pressable
                  key={f.key}
                  onPress={() => setRange(f.key)}
                  style={[styles.chip, on && styles.chipOn]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={`Show ${f.label.toLowerCase()}`}
                >
                  <Text style={[styles.chipText, on && styles.chipTextOn]}>{f.label}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </>
      )}
    </View>
  );

  const empty =
    history.length === 0 ? (
      loadError ? null : (
        <View style={styles.empty}>
          <View style={styles.emptyIconWrap}>
            <Receipt size={26} color={colors.primary} />
          </View>
          <Text style={styles.emptyTitle}>No payments yet</Text>
          <Text style={styles.emptyText}>Your paid invoices will show up here.</Text>
        </View>
      )
    ) : (
      <View style={styles.empty}>
        <Text style={styles.emptyTitle}>No payments in this period</Text>
        <Text style={styles.emptyText}>Try a longer time range to see more.</Text>
        <Pressable
          onPress={() => setRange('all')}
          style={styles.emptyButton}
          accessibilityRole="button"
        >
          <Text style={common.buttonGhostText}>Show all</Text>
        </Pressable>
      </View>
    );

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.background} />

      <ScreenHeader title="Payment History" onBack={handleBack} large />

      {isLoading ? (
        <View style={[styles.content, { paddingBottom: bottomPad }]}>
          <HistorySkeleton />
        </View>
      ) : (
        <SectionList<PaymentHistoryItem, Group>
          sections={sections}
          keyExtractor={(item) => String(item.id)}
          stickySectionHeadersEnabled
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.content, { paddingBottom: bottomPad }]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.primary}
              colors={[colors.primary]}
            />
          }
          ListHeaderComponent={header}
          ListEmptyComponent={empty}
          renderSectionHeader={({ section }) => (
            <View style={styles.groupHeader}>
              <Text style={styles.groupTitle}>{section.title}</Text>
              <Text style={styles.groupTotal}>{peso(section.total)}</Text>
            </View>
          )}
          renderItem={({ item, index, section }) => (
            <InvoiceRow
              item={item}
              stacked={stacked}
              first={index === 0}
              last={index === section.data.length - 1}
              onPress={() => setReceiptFor(item)}
            />
          )}
        />
      )}

      {receiptFor && (
        <ReceiptModal
          visit={{ pet_name: receiptFor.pet_name, service: receiptFor.service }}
          /* Every invoice is created already fully paid, so the date it
             was paid is the date it was raised. */
          invoice={{
            id: receiptFor.id,
            total: Number(receiptFor.total_amount || 0),
            created_at: receiptFor.paid_at ?? '',
          }}
          onClose={() => setReceiptFor(null)}
        />
      )}
    </View>
  );
}

/* One invoice. Rows of the same day join into a single rounded card:
   the first row rounds the top, the last rounds the bottom, and the
   rows between are separated by a thin line. */
function InvoiceRow({
  item,
  stacked,
  first,
  last,
  onPress,
}: {
  item: PaymentHistoryItem;
  stacked: boolean;
  first: boolean;
  last: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      android_ripple={{ color: 'rgba(5, 31, 66, 0.07)' }}
      style={({ pressed }) => [
        styles.row,
        first && styles.rowFirst,
        last ? styles.rowLast : styles.rowDivider,
        pressed && styles.rowPressed,
      ]}
      accessibilityRole="button"
      accessibilityLabel={`${item.service} for ${item.pet_name}, ${peso(item.total_amount)}, view receipt`}
    >
      <View style={styles.rowIconWrap}>
        <ServiceIcon name={item.service} size={20} color={colors.primary} strokeWidth={1.9} />
      </View>
      <View style={styles.rowCopy}>
        {/* Wraps to two lines instead of cutting off
            "Vaccination & Dewor…". */}
        <Text style={styles.rowTitle} numberOfLines={2}>{item.service}</Text>
        <Text style={styles.rowSub} numberOfLines={stacked ? 2 : 1}>{item.pet_name}</Text>
        {stacked && (
          <Text style={[styles.rowAmount, styles.rowAmountStacked]}>{peso(item.total_amount)}</Text>
        )}
      </View>
      {!stacked && <Text style={styles.rowAmount}>{peso(item.total_amount)}</Text>}
      <ChevronRight size={16} color={colors.mutedFg} />
    </Pressable>
  );
}

/* ── Loading state ──
   The summary card, the chips and a few rows, shaped like the loaded
   page so nothing jumps when the data arrives. */
function HistorySkeleton() {
  return (
    <View accessibilityLabel="Loading payment history" accessibilityLiveRegion="polite">
      <Skeleton width="100%" height={sz(138)} radius={radius.card} style={{ marginBottom: space.lg }} />
      <View style={{ flexDirection: 'row', gap: space.sm, marginBottom: space.lg }}>
        <Skeleton width={60} height={44} radius={22} />
        <Skeleton width={110} height={44} radius={22} />
        <Skeleton width={130} height={44} radius={22} />
      </View>
      <Skeleton width={110} height={16} style={{ marginBottom: space.md }} />
      {[0, 1, 2, 3].map((i) => (
        <SkeletonRow key={i} tile={44} style={styles.skelRow} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { ...common.screen },

  /* Capped width keeps the list readable on tablets and wide windows;
     on phones it simply fills the screen. */
  content: {
    padding: space.xl,
    paddingTop: space.sm,
    width: '100%',
    maxWidth: 680,
    alignSelf: 'center',
  },

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

  empty: { alignItems: 'center', paddingTop: space.xxxl * 2, gap: space.sm },
  emptyIconWrap: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: colors.muted,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.sm,
  },
  emptyTitle: { ...text.title, color: colors.foreground, textAlign: 'center' },
  emptyText: { ...text.small, color: colors.mutedFg, textAlign: 'center' },
  emptyButton: { ...common.buttonGhost, paddingHorizontal: space.xxl, marginTop: space.lg },

  /* Summary: the one dark block on the page. Gold only on the icon. */
  totalCard: {
    backgroundColor: colors.primary,
    borderRadius: radius.card,
    padding: space.xl,
    ...shadow.card,
  },
  totalTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md },
  totalLabel: { ...text.small, color: 'rgba(246, 245, 238, 0.72)', flex: 1 },
  totalIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(246, 245, 238, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  totalAmount: {
    fontFamily: text.display.fontFamily,
    fontSize: sz(34),
    lineHeight: sz(40),
    letterSpacing: -0.6,
    color: colors.primaryFg,
    marginTop: space.xs,
    fontVariant: ['tabular-nums'],
  },
  totalRule: { height: 1, backgroundColor: 'rgba(246, 245, 238, 0.16)', marginTop: space.lg, marginBottom: space.md },
  totalSub: { ...text.small, color: 'rgba(246, 245, 238, 0.72)' },

  /* Filter chips scroll sideways, so they never wrap or clip on a
     narrow screen. */
  chipScroll: { flexGrow: 0, marginTop: space.lg },
  chipRow: { gap: space.sm, paddingRight: space.xl },
  chip: {
    minHeight: 44,
    paddingHorizontal: space.lg,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { ...text.smallBold, color: colors.foreground },
  chipTextOn: { color: colors.primaryFg },

  /* Sticky day header. The solid background hides rows scrolling
     underneath it. */
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: space.md,
    backgroundColor: colors.background,
    paddingTop: space.lg,
    paddingBottom: space.sm,
    paddingHorizontal: space.xs,
  },
  groupTitle: { ...text.smallBold, color: colors.mutedFg, flexShrink: 1 },
  groupTotal: { ...text.smallBold, color: colors.mutedFg, fontVariant: ['tabular-nums'] },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
    minHeight: sz(68),
    backgroundColor: colors.card,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: colors.cardBorder,
    overflow: 'hidden',
  },
  rowFirst: {
    borderTopWidth: 1,
    borderTopLeftRadius: radius.card,
    borderTopRightRadius: radius.card,
  },
  rowLast: {
    borderBottomWidth: 1,
    borderBottomLeftRadius: radius.card,
    borderBottomRightRadius: radius.card,
  },
  rowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  rowPressed: { backgroundColor: colors.muted },
  rowIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: colors.muted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowCopy: { flex: 1, minWidth: 0 },
  rowTitle: { ...text.smallBold, color: colors.foreground },
  rowSub: { ...text.caption, color: colors.mutedFg, marginTop: 2 },
  rowAmount: { ...text.smallBold, color: colors.primary, fontVariant: ['tabular-nums'] },
  rowAmountStacked: { marginTop: space.xs },

  skelRow: { ...common.card, flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, marginBottom: space.sm },
});
