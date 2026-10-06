import { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  StatusBar,
  useWindowDimensions,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Receipt, ChevronRight, AlertCircle } from 'lucide-react-native';
import { supabase } from '../../lib/supabase';
import { fetchPaymentHistory, type PaymentHistoryItem } from '../../lib/invoices';
import { colors, text, space, radius, common, hitSlop, status } from '../../constants/theme';
import { useTabBarClearance } from './_layout';
import { Skeleton, SkeletonRow } from '../../components/Skeleton';
import { ScreenHeader } from '../../components/ScreenHeader';
import { ReceiptModal } from '../../components/ReceiptModal';
import { peso, fmtPastDate } from '../../lib/format';
import { ServiceIcon } from '../../lib/serviceIcons';

/* The layout was designed around a 360-wide screen at normal text size.
   Past this much extra text-or-narrowness, the amount beside the title
   leaves the title and date too little room, so the amount moves below. */
const REFERENCE_WIDTH = 360;
const STACK_ABOVE = 1.15;

/**
 * Payment history.
 *
 * Every row is a paid invoice, and tapping one opens the receipt — the
 * same shared component the Visits and Home screens use, so all three
 * show one document and can't drift apart.
 *
 * PaymentHistoryItem carries only what a list row needs (service, pet
 * name, total, paid date). The receipt fetches its own line items,
 * payments and clinic details from the invoice id.
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

  const total = history.reduce((sum, h) => sum + Number(h.total_amount || 0), 0);

  const handleBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/profile' as any);
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.background} />

      <ScreenHeader title="Payment History" onBack={handleBack} />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: bottomPad }]}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
      >
        {loadError && (
          <View style={styles.loadError} accessibilityLiveRegion="polite">
            <AlertCircle size={15} color={status.danger.fg} strokeWidth={2} />
            <Text style={styles.loadErrorText}>Couldn&apos;t load your payments.</Text>
            <TouchableOpacity onPress={onRefresh} hitSlop={hitSlop} accessibilityRole="button">
              <Text style={styles.loadErrorRetry}>Retry</Text>
            </TouchableOpacity>
          </View>
        )}

        {isLoading ? (
          <HistorySkeleton />
        ) : history.length === 0 ? (
          !loadError && (
            <View style={styles.empty}>
              <View style={styles.emptyIconWrap}>
                <Receipt size={26} color={colors.primary} />
              </View>
              <Text style={styles.emptyTitle}>No payments yet</Text>
              <Text style={styles.emptyText}>Your paid invoices will show up here.</Text>
            </View>
          )
        ) : (
          <>
            <View style={styles.totalCard}>
              <Text style={styles.totalLabel}>Total paid</Text>
              <Text style={styles.totalAmount}>{peso(total)}</Text>
              <Text style={styles.totalSub}>
                {history.length} paid {history.length === 1 ? 'invoice' : 'invoices'}
              </Text>
            </View>

            <Text style={styles.sectionTitle}>Paid invoices</Text>
            {/* Every row opens its receipt — the total alone doesn't say
                what it was for. */}
            {history.map((item) => (
              <TouchableOpacity
                key={item.id}
                style={styles.row}
                onPress={() => setReceiptFor(item)}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={`${item.service} for ${item.pet_name}, ${peso(item.total_amount)}, view receipt`}
              >
                <ServiceTile service={item.service} />
                <View style={styles.rowCopy}>
                  {/* Wraps to two lines instead of cutting off
                      "Vaccination & Dewor…". */}
                  <Text style={styles.rowTitle} numberOfLines={2}>{item.service}</Text>
                  <Text style={styles.rowSub} numberOfLines={stacked ? 2 : 1}>
                    {item.pet_name}
                    {/* The visit's own date, matching the Visits screen. */}
                    {(item.visit_date ?? item.paid_at)
                      ? ` · ${fmtPastDate(item.visit_date ?? item.paid_at)}`
                      : ''}
                  </Text>
                  {stacked && (
                    <Text style={[styles.rowAmount, styles.rowAmountStacked]}>
                      {peso(item.total_amount)}
                    </Text>
                  )}
                </View>
                {!stacked && <Text style={styles.rowAmount}>{peso(item.total_amount)}</Text>}
                <ChevronRight size={16} color={colors.mutedFg} />
              </TouchableOpacity>
            ))}
          </>
        )}
      </ScrollView>

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

const styles = StyleSheet.create({
  container: { ...common.screen },

  scrollContent: { padding: space.xl },

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
    borderRadius: 22,
    backgroundColor: colors.secondary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.sm,
  },
  emptyTitle: { ...text.title, color: colors.foreground },
  emptyText: { ...text.small, color: colors.mutedFg, textAlign: 'center' },

  totalCard: {
    backgroundColor: colors.secondary,
    borderRadius: radius.card,
    padding: space.xl,
    marginBottom: space.xl,
  },
  totalLabel: { ...text.eyebrow, color: colors.primary },
  totalAmount: {
    ...text.display,
    color: colors.foreground,
    marginTop: space.xs,
    fontVariant: ['tabular-nums'],
  },
  totalSub: { ...text.caption, color: colors.mutedFg, marginTop: space.xs },

  sectionTitle: { ...text.section, color: colors.foreground, marginBottom: space.md },

  row: {
    ...common.card,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.md,
    marginBottom: space.sm,
  },
  rowIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowCopy: { flex: 1, minWidth: 0 },
  rowTitle: { ...text.smallBold, color: colors.foreground },
  rowSub: { ...text.caption, color: colors.mutedFg, marginTop: 2 },
  rowAmount: { ...text.smallBold, color: colors.foreground, fontVariant: ['tabular-nums'] },
  rowAmountStacked: { marginTop: space.xs },
});

/* ── Loading state ──
   The total card and a few rows, shaped like the loaded page so
   nothing jumps when the data arrives. */
function HistorySkeleton() {
  return (
    <View accessibilityLabel="Loading payment history" accessibilityLiveRegion="polite">
      <Skeleton width="100%" height={112} radius={radius.card} style={{ marginBottom: space.xl }} />
      <Skeleton width={110} height={16} style={{ marginBottom: space.md }} />
      {[0, 1, 2, 3].map((i) => (
        <SkeletonRow key={i} tile={40} style={styles.row} />
      ))}
    </View>
  );
}

/* The service this payment was for, instead of a green check that every
   row shared (every row here is paid, so it said nothing). */
function ServiceTile({ service }: { service: string }) {
  return (
    <View style={styles.rowIconWrap}>
      <ServiceIcon name={service} size={18} color={colors.primary} strokeWidth={1.9} />
    </View>
  );
}
