import { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  RefreshControl,
  StatusBar,
  Linking,
  Alert,
} from 'react-native';
import { supabase } from '../../lib/supabase';
import { useFocusEffect, useRouter } from 'expo-router';
import {
  CalendarDays, CalendarPlus, Clock, Phone,
  Receipt, X, ChevronRight, XCircle, AlertCircle,
} from 'lucide-react-native';
import {
  colors, text, fonts, space, radius, shadow, common, hitSlop, status,
} from '../../constants/theme';
import { useTabBarClearance } from '../../lib/useTabBarClearance';
import { Skeleton } from '../../components/Skeleton';
import { PillTabs } from '../../components/PillTabs';
import { ReceiptModal } from '../../components/ReceiptModal';
import { peso, toLocalISO, dayKey, fmtDate, fmtPastDate, fmtTime } from '../../lib/format';
import { useRealtimeRefresh } from '../../lib/useRealtimeRefresh';

const STATUS_LABEL: Record<string, string> = {
  incoming: 'Awaiting confirmation',
  confirmed: 'Confirmed',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

const STATUS_TONE: Record<string, keyof typeof status> = {
  incoming: 'warning',
  confirmed: 'teal',
  completed: 'success',
  cancelled: 'danger',
};

/* How many whole days ago a visit's date was. Compares calendar days,
   not hours, so "today" is 0 whatever the time. */
function daysAgo(iso: string): number {
  const [y, m, d] = dayKey(iso).split('-').map(Number);
  const visit = new Date(y, (m || 1) - 1, d || 1);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((startOfToday.getTime() - visit.getTime()) / 86400000);
}

/* History is labelled by how recent a visit is, so the top of the list
   reads as "what just happened" and the rest falls away from there. */
function historyGroup(iso: string): 'New' | 'Previous' | 'Older' {
  const days = daysAgo(iso);
  if (days <= 7) return 'New';
  if (days <= 30) return 'Previous';
  return 'Older';
}

const HISTORY_GROUPS = ['New', 'Previous', 'Older'] as const;

export default function AppointmentsScreen() {
  const router = useRouter();
  const bottomPad = useTabBarClearance();
  const [tab, setTab] = useState<'upcoming' | 'past'>('upcoming');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [visits, setVisits] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<Record<string, any>>({});
  /* Read from clinic_settings rather than hardcoded — the number
     already lives in the database where the About screen reads it. */
  const [clinicPhone, setClinicPhone] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [receiptFor, setReceiptFor] = useState<any | null>(null);

  const loadData = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const [visitRes, settingsRes] = await Promise.all([
        (supabase as any)
          .from('appointments')
          .select('*')
          .eq('client_id', user.id)
          .order('requested_date', { ascending: false }),
        (supabase as any)
          .from('clinic_settings')
          .select('phone_number')
          .limit(1).maybeSingle(),
      ]);
      if (visitRes.error) throw visitRes.error;

      setClinicPhone(settingsRes.data?.phone_number || null);
      const rows = visitRes.data || [];
      setVisits(rows);

      /* What each visit was billed. Every invoice is created already
         fully paid (billing, collecting payment and completing a visit
         happen as one action), so there's no balance to compute — just
         the total, and the invoice's own id and date for the receipt. */
      const ids = rows.map((v: any) => v.id);
      if (ids.length > 0) {
        const { data: invs, error: invError } = await (supabase as any)
          .from('invoices')
          .select('id, appointment_id, total_amount, created_at')
          .in('appointment_id', ids);
        if (invError) throw invError;
        const map: Record<string, any> = {};
        (invs || []).forEach((i: any) => {
          map[i.appointment_id] = {
            id: i.id,
            total: Number(i.total_amount || 0),
            created_at: i.created_at,
          };
        });
        setInvoices(map);
      } else {
        setInvoices({});
      }
      setLoadError(false);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  useRealtimeRefresh('appointments', loadData);
  useRealtimeRefresh('invoices', loadData);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const today = toLocalISO(new Date());

  const upcoming = visits
    .filter((v) =>
      ['incoming', 'confirmed'].includes(v.status) && dayKey(v.requested_date) >= today
    )
    .sort((a, b) =>
      dayKey(a.requested_date).localeCompare(dayKey(b.requested_date)) ||
      (a.scheduled_time || '').localeCompare(b.scheduled_time || '')
    );
  const upcomingIds = new Set(upcoming.map((v) => v.id));

  const past = visits
    .filter((v) => !upcomingIds.has(v.id))
    .sort((a, b) =>
      dayKey(b.requested_date).localeCompare(dayKey(a.requested_date)) ||
      (b.scheduled_time || '').localeCompare(a.scheduled_time || '')
    );

  const sections: { label: string | null; items: any[] }[] =
    tab === 'upcoming'
      ? [{ label: null, items: upcoming }]
      : HISTORY_GROUPS
          .map((label) => ({
            label,
            items: past.filter((v) => historyGroup(v.requested_date) === label),
          }))
          .filter((s) => s.items.length > 0);
  const isEmpty = (tab === 'upcoming' ? upcoming : past).length === 0;

  /* Two steps, like the mockup: tapping "Cancel booking" asks first, and
     only "Yes, cancel" actually cancels. Red is kept for that step. */
  const cancelBooking = (visit: any) => {
    Alert.alert(
      'Cancel this booking?',
      `${visit.pet_name}'s ${visit.service} on ${fmtDate(visit.requested_date)}. The slot goes back to the clinic.`,
      [
        { text: 'Keep booking', style: 'cancel' },
        {
          text: 'Yes, cancel',
          style: 'destructive',
          onPress: async () => {
            setCancelling(visit.id);
            const { error } = await (supabase as any)
              .rpc('cancel_my_appointment', { appointment_id: visit.id });
            setCancelling(null);
            if (error) {
              Alert.alert('Couldn\u2019t cancel', error.message);
              return;
            }
            loadData();
          },
        },
      ]
    );
  };

  const callClinic = () => {
    if (!clinicPhone) {
      Alert.alert('Clinic number', 'The clinic hasn\u2019t added a phone number yet.');
      return;
    }
    Linking.openURL(`tel:${clinicPhone}`).catch(() =>
      Alert.alert('Not available', 'Couldn\u2019t open the phone app on this device.')
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.background} />
      <View style={styles.header}>
        <Text style={styles.title} accessibilityRole="header">My visits</Text>
        <View style={styles.tabsWrap}>
          <PillTabs
            tabs={[
              { key: 'upcoming', label: 'Upcoming', count: upcoming.length },
              { key: 'past', label: 'History', count: past.length },
            ]}
            value={tab}
            onChange={setTab}
          />
        </View>
      </View>
      <ScrollView
        /* Extra room under the last card so its buttons (Cancel booking,
           View receipt) scroll fully clear of the tab bar, even at the
           largest display and font sizes. */
        contentContainerStyle={[
          styles.scroll,
          { paddingBottom: bottomPad + space.xxxl },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
      >
        {loading ? (
          <VisitsSkeleton />
        ) : (
          <>
            {loadError && (
              <View style={styles.loadError} accessibilityLiveRegion="polite">
                <AlertCircle size={15} color={status.danger.fg} strokeWidth={2} />
                <Text style={styles.loadErrorText}>Couldn&apos;t load your visits.</Text>
                <TouchableOpacity onPress={onRefresh} hitSlop={hitSlop} accessibilityRole="button">
                  <Text style={styles.loadErrorRetry}>Retry</Text>
                </TouchableOpacity>
              </View>
            )}

            {isEmpty ? (
              !loadError && (
                <View style={styles.empty}>
                  <View style={styles.emptyIcon}>
                    <CalendarDays size={26} color={colors.primary} strokeWidth={1.9} />
                  </View>
                  <Text style={styles.emptyTitle}>
                    {tab === 'upcoming' ? 'Nothing booked' : 'No past visits'}
                  </Text>
                  <Text style={styles.emptyBody}>
                    {tab === 'upcoming'
                      ? 'Book a visit and it\u2019ll appear here once the clinic confirms it.'
                      : 'Visits appear here once they\u2019ve been completed.'}
                  </Text>
                  {tab === 'upcoming' && (
                    <TouchableOpacity
                      style={styles.emptyBtn}
                      onPress={() => router.push('/(tabs)/book' as any)}
                      activeOpacity={0.85}
                      accessibilityRole="button"
                    >
                      <CalendarPlus size={17} color={colors.primaryFg} />
                      <Text style={styles.emptyBtnText}>Book a visit</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )
            ) : (
              sections.map(({ label, items }) => (
                <View key={label ?? 'all'} style={styles.section}>
                  {label && (
                    <View style={styles.sectionHead} accessibilityRole="header">
                      <Text style={styles.sectionTitle}>{label}</Text>
                      <View style={styles.sectionCount}>
                        <Text style={styles.sectionCountText}>{items.length}</Text>
                      </View>
                    </View>
                  )}

                  {items.map((visit) => {
                    const invoice = invoices[visit.id];
                    const tone = status[STATUS_TONE[visit.status] || 'neutral'];
                    const isUpcoming = tab === 'upcoming';
                    const time = fmtTime(visit.scheduled_time);
                    return (
                      <View key={visit.id} style={styles.card}>
                        <View style={styles.cardTop}>
                          <View style={styles.dateBlock}>
                            <Text style={styles.dateText} maxFontSizeMultiplier={1.15}>
                              {isUpcoming ? fmtDate(visit.requested_date) : fmtPastDate(visit.requested_date)}
                            </Text>
                            {time ? (
                              <View style={styles.timeRow}>
                                <Clock size={14} color={colors.mutedFg} />
                                <Text style={styles.timeText}>{time}</Text>
                              </View>
                            ) : null}
                          </View>
                          <View style={[common.pill, { backgroundColor: tone.bg, flexShrink: 0 }]}>
                            <Text style={[common.pillText, { color: tone.fg }]}>
                              {STATUS_LABEL[visit.status] || visit.status}
                            </Text>
                          </View>
                        </View>

                        <View style={styles.cardBody}>
                          <Text style={styles.petName} numberOfLines={1}>{visit.pet_name}</Text>
                          <Text style={styles.service} numberOfLines={2}>{visit.service}</Text>
                        </View>

                        {isUpcoming && (
                          <View style={styles.cardFoot}>
                            {visit.status === 'incoming' ? (
                              <Text style={styles.footNote}>
                                The clinic will confirm your slot shortly.
                              </Text>
                            ) : (
                              <Text style={styles.footNote}>
                                Your slot is booked. Please arrive a few minutes early.
                              </Text>
                            )}

                            {visit.status === 'incoming' ? (
                              <TouchableOpacity
                                style={styles.cancelBtn}
                                onPress={() => cancelBooking(visit)}
                                disabled={cancelling === visit.id}
                                activeOpacity={0.8}
                                accessibilityRole="button"
                                accessibilityLabel="Cancel booking"
                              >
                                {cancelling === visit.id ? (
                                  <ActivityIndicator size="small" color={status.danger.fg} />
                                ) : (
                                  <>
                                    <XCircle size={20} color={status.danger.fg} strokeWidth={2} />
                                    <Text style={styles.cancelBtnText}>Cancel booking</Text>
                                  </>
                                )}
                              </TouchableOpacity>
                            ) : (
                              <TouchableOpacity
                                style={styles.callBtn}
                                onPress={callClinic}
                                activeOpacity={0.8}
                                hitSlop={hitSlop}
                                accessibilityRole="button"
                              >
                                <Phone size={14} color={colors.primary} />
                                <Text style={styles.callBtnText}>
                                  Need to change this? Call the clinic
                                </Text>
                                <ChevronRight size={14} color={colors.primary} />
                              </TouchableOpacity>
                            )}
                          </View>
                        )}

                        {!isUpcoming && invoice && (
                          <TouchableOpacity
                            style={styles.cardFoot}
                            onPress={() => setReceiptFor(visit)}
                            activeOpacity={0.7}
                            accessibilityRole="button"
                            accessibilityLabel={`View receipt, ${peso(invoice.total)}, paid`}
                          >
                            <View style={styles.billRow}>
                              <View style={styles.metaRow}>
                                <View style={styles.billIcon}>
                                  <Receipt size={16} color={colors.primary} strokeWidth={1.9} />
                                </View>
                                <Text style={styles.billTotal}>{peso(invoice.total)}</Text>
                              </View>
                              <View style={styles.viewReceiptRow}>
                                <Text style={styles.viewReceiptText}>View receipt</Text>
                                <ChevronRight size={16} color={colors.primary} strokeWidth={2} />
                              </View>
                            </View>
                          </TouchableOpacity>
                        )}

                        {!isUpcoming && !invoice && visit.status === 'cancelled' && (
                          <View style={styles.cardFoot}>
                            <View style={styles.metaRow}>
                              <X size={13} color={colors.mutedFg} />
                              <Text style={styles.footNote}>This visit didn&apos;t go ahead.</Text>
                            </View>
                          </View>
                        )}
                      </View>
                    );
                  })}
                </View>
              ))
            )}
          </>
        )}
      </ScrollView>
      {receiptFor && (
        <ReceiptModal
          visit={receiptFor}
          invoice={invoices[receiptFor.id]}
          onClose={() => setReceiptFor(null)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { ...common.screen },
  center: { alignItems: 'center', justifyContent: 'center' },

  /* Same title and side padding as Profile: 24 / bold, 24dp from the
     edge, sitting just under the status bar. */
  header: {
    paddingHorizontal: space.xxl,
    paddingTop: space.xs,
    paddingBottom: space.md,
    backgroundColor: colors.background,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  title: {
    fontFamily: fonts.bodyBold,
    fontSize: 24,
    lineHeight: 28,
    letterSpacing: 0,
    color: colors.foreground,
  },
  tabsWrap: { marginTop: space.lg },

  scroll: { paddingHorizontal: space.xxl, paddingTop: space.xl, gap: space.md },

  /* History group headers: New / Previous / Older, with a count. */
  section: { gap: space.md },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  sectionTitle: { ...text.bodyBold, fontSize: 16, color: colors.mutedFg },
  sectionCount: {
    minWidth: 24,
    height: 24,
    paddingHorizontal: 6,
    borderRadius: 12,
    backgroundColor: colors.muted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionCountText: { ...text.caption, fontSize: 12, color: colors.foreground },

  loadError: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    backgroundColor: status.danger.bg,
    borderRadius: radius.md,
    padding: space.md,
  },
  loadErrorText: { ...text.small, color: status.danger.fg, flex: 1 },
  loadErrorRetry: {
    ...text.smallBold,
    color: status.danger.fg,
    textDecorationLine: 'underline',
  },

  card: {
    ...common.card,
    padding: space.lg,
  },
  cardTop: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: space.md,
  },
  dateBlock: { flexGrow: 1, flexShrink: 1, minWidth: 150 },
  dateText: {
    ...text.title,
    fontSize: 18,
    lineHeight: 24,
    color: colors.foreground,
  },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  timeText: { ...text.small, color: colors.mutedFg },

  cardBody: { marginTop: space.md, gap: 2 },
  petName: { ...text.bodyBold, color: colors.foreground },
  service: { ...text.small, color: colors.mutedFg },

  metaRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  cardFoot: {
    marginTop: space.lg,
    paddingTop: space.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: space.sm,
  },
  footNote: { ...text.caption, color: colors.mutedFg, flexShrink: 1 },

  /* Wraps so "View receipt" drops below the price at large font sizes
     instead of colliding with it. */
  billRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    columnGap: space.md,
    rowGap: space.xs,
  },
  /* Neutral icon circle, the same one the Profile tiles use. */
  billIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.muted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  billTotal: {
    ...text.bodyBold,
    color: colors.foreground,
    fontVariant: ['tabular-nums'],
    flexShrink: 1,
  },
  viewReceiptRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  viewReceiptText: { ...text.small, fontFamily: fonts.bodyBold, color: colors.primary },

  /* Destructive: red outline, no fill. 48px like every other button,
     with the border and text in the same red so they match the mockup. */
  cancelBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: space.sm,
    height: 48,
    borderRadius: 24,
    borderWidth: 1.5,
    borderColor: status.danger.fg,
    backgroundColor: 'transparent',
  },
  cancelBtnText: { ...text.bodyBold, color: status.danger.fg },
  callBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  callBtnText: { ...text.caption, fontFamily: fonts.bodyBold, color: colors.primary, flex: 1 },

  empty: {
    alignItems: 'center',
    paddingVertical: space.xxxl * 1.5,
    paddingHorizontal: space.xl,
  },
  emptyIcon: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: colors.muted,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.xl,
  },
  emptyTitle: { ...text.title, color: colors.foreground },
  emptyBody: {
    ...text.small,
    color: colors.mutedFg,
    textAlign: 'center',
    marginTop: space.sm,
    maxWidth: 260,
  },
  emptyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    marginTop: space.xl,
    paddingHorizontal: space.xxl,
    height: 48,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    ...shadow.primary,
  },
  emptyBtnText: { ...text.bodyBold, color: colors.primaryFg },
});

/* ── Loading state ──
   Three cards shaped like a visit: a date and time on the left, a
   status pill on the right, then the pet and the service. The header
   and tabs above are real and show at once. */
function VisitsSkeleton() {
  return (
    <>
      {[0, 1, 2].map((i) => (
        <View key={i} style={styles.card}>
          <View style={styles.cardTop}>
            <View style={styles.dateBlock}>
              <Skeleton width={120} height={20} />
              <Skeleton width={72} height={12} style={{ marginTop: space.sm }} />
            </View>
            <Skeleton width={110} height={24} radius={radius.pill} />
          </View>
          <View style={styles.cardBody}>
            <Skeleton width={96} height={16} />
            <Skeleton width={150} height={13} style={{ marginTop: 6 }} />
          </View>
        </View>
      ))}
    </>
  );
}
