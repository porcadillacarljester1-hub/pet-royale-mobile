import { useState, useCallback, memo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SectionList,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  RefreshControl,
  StatusBar,
  Linking,
  Alert,
  useWindowDimensions,
} from 'react-native';
import { supabase } from '../../lib/supabase';
import { useFocusEffect, useRouter } from 'expo-router';
import {
  CalendarDays, CalendarPlus, CalendarCheck, Check, Clock, Phone,
  ChevronRight, XCircle, AlertCircle,
} from 'lucide-react-native';
import {
  colors, text, fonts, space, radius, shadow, common, hitSlop, status,
} from '../../constants/theme';
import { useTabBarClearance } from '../../lib/useTabBarClearance';
import { Skeleton } from '../../components/Skeleton';
import { ReceiptModal } from '../../components/ReceiptModal';
import { peso, toLocalISO, dayKey, fmtDate, fmtPastDate, fmtTime } from '../../lib/format';
import { useRealtimeRefresh } from '../../lib/useRealtimeRefresh';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const STATUS_LABEL: Record<string, string> = {
  incoming: 'Pending',
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

/* One icon per state, so the status never relies on colour alone. */
const STATUS_ICON: Record<string, any> = {
  incoming: Clock,
  confirmed: CalendarCheck,
  completed: Check,
  cancelled: XCircle,
};

const MONTHS_SHORT = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const MONTHS_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/* Widest the content gets. Keeps tablets and foldables from stretching
   cards edge to edge; phones never reach it. */
const MAX_CONTENT_WIDTH = 600;

/* Below this width (small and older phones) side padding tightens so
   cards keep room for their text. */
const NARROW_WIDTH = 360;

function dateParts(iso: string): { y: number; m: number; d: number } {
  const [y, m, d] = dayKey(iso).split('-').map(Number);
  return { y: y || 0, m: m || 1, d: d || 1 };
}

/* How many whole days ago a visit's date was. Compares calendar days,
   not hours, so "today" is 0 whatever the time. Tomorrow is -1. */
function daysAgo(iso: string): number {
  const { y, m, d } = dateParts(iso);
  const visit = new Date(y, m - 1, d);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((startOfToday.getTime() - visit.getTime()) / 86400000);
}

/* Label for the date block on an upcoming visit: TODAY, TOMORROW, OCT 15. */
function dayLabel(iso: string): string {
  const n = daysAgo(iso);
  if (n === 0) return 'TODAY';
  if (n === -1) return 'TOMORROW';
  const { m, d } = dateParts(iso);
  return `${MONTHS_SHORT[m - 1]} ${d}`;
}

function monthKey(iso: string): string {
  return dayKey(iso).slice(0, 7);
}

function monthLabel(key: string): string {
  const [y, m] = key.split('-').map(Number);
  return `${MONTHS_LONG[(m || 1) - 1]} ${y}`;
}

/* Plain status: icon plus label, no pill or border. The icon carries the
   meaning as well as the colour. */
function StatusText({ value }: { value: string }) {
  const tone = status[STATUS_TONE[value] || 'neutral'];
  const Icon = STATUS_ICON[value];
  return (
    <View style={styles.statusRow}>
      {Icon ? <Icon size={15} color={tone.fg} strokeWidth={2.2} /> : null}
      <Text style={[styles.statusText, { color: tone.fg }]}>
        {STATUS_LABEL[value] || value}
      </Text>
    </View>
  );
}

/* Two tabs with an underline on the active one. Only Upcoming shows a
   count, and only when there is something to act on. */
function Tabs({
  tabs, value, onChange,
}: {
  tabs: { key: 'upcoming' | 'past'; label: string; count: number }[];
  value: 'upcoming' | 'past';
  onChange: (k: 'upcoming' | 'past') => void;
}) {
  return (
    <View style={styles.tabs} accessibilityRole="tablist">
      {tabs.map((t) => {
        const on = value === t.key;
        return (
          <TouchableOpacity
            key={t.key}
            style={[styles.tab, on && styles.tabOn]}
            onPress={() => onChange(t.key)}
            activeOpacity={0.7}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={t.count > 0 ? `${t.label}, ${t.count}` : t.label}
          >
            <Text style={[styles.tabLabel, on && styles.tabLabelOn]} numberOfLines={1}>
              {t.label}
            </Text>
            {t.count > 0 && (
              <View style={styles.tabBadge}>
                <Text style={styles.tabBadgeText}>{t.count}</Text>
              </View>
            )}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

/* Filter History by pet. Scrolls sideways, so any number of pets fits
   any screen width. */
function PetFilter({
  pets, value, onChange, sidePad,
}: {
  pets: string[];
  value: string;
  onChange: (p: string) => void;
  sidePad: number;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={{ marginHorizontal: -sidePad, marginBottom: space.lg, flexGrow: 0 }}
      contentContainerStyle={{ paddingHorizontal: sidePad, gap: space.sm }}
      accessibilityLabel="Filter by pet"
    >
      {['All', ...pets].map((p) => {
        const on = value === p;
        return (
          <TouchableOpacity
            key={p}
            style={[styles.filterChip, on && styles.filterChipOn]}
            onPress={() => onChange(p)}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            accessibilityLabel={p === 'All' ? 'All pets' : p}
          >
            <Text style={[styles.filterText, on && styles.filterTextOn]} numberOfLines={1}>{p}</Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

function Step({
  done, last, title, note,
}: { done: boolean; last?: boolean; title: string; note?: string }) {
  return (
    <View
      style={styles.stepRow}
      accessible
      accessibilityLabel={`${title}. ${done ? 'Done.' : 'Not yet.'} ${note || ''}`}
    >
      <View style={styles.stepRail}>
        <View style={[styles.dot, done && styles.dotDone]}>
          {done ? <Check size={12} color="#fff" strokeWidth={3} /> : null}
        </View>
        {!last ? <View style={styles.railLine} /> : null}
      </View>
      <View style={[styles.stepBody, !last && styles.stepBodyGap]}>
        <Text style={styles.stepTitle}>{title}</Text>
        {note ? <Text style={styles.stepNote}>{note}</Text> : null}
      </View>
    </View>
  );
}

/* An upcoming booking. Memoised, and fed stable handlers, so it only
   rebuilds when its own visit or cancelling state changes. */
const UpcomingCard = memo(function UpcomingCard({
  visit, cancelling, onCancel, onCall,
}: {
  visit: any;
  cancelling: boolean;
  onCancel: (visit: any) => void;
  onCall: () => void;
}) {
  const time = fmtTime(visit.scheduled_time);
  const label = dayLabel(visit.requested_date);
  const confirmed = visit.status === 'confirmed';
  return (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <View style={styles.dateBlock}>
          {time ? (
            <Text style={styles.dateLabel} numberOfLines={1} maxFontSizeMultiplier={1.15}>
              {label}
            </Text>
          ) : null}
          <Text style={styles.dateBig} numberOfLines={1} maxFontSizeMultiplier={1.15}>
            {time || label}
          </Text>
        </View>
        <View style={styles.titleBlock}>
          <Text style={styles.petName} numberOfLines={1}>{visit.pet_name}</Text>
          <Text style={styles.service} numberOfLines={2}>{visit.service}</Text>
          <View style={styles.statusWrap}>
            <StatusText value={visit.status} />
          </View>
        </View>
      </View>

      <View style={styles.steps}>
        <Step done title="Booked" />
        <Step
          done={confirmed}
          last
          title={confirmed ? 'Confirmed' : 'Confirmed at the clinic'}
          note={
            confirmed
              ? 'The clinic has confirmed your visit.'
              : 'Your slot is booked. Please arrive a few minutes early.'
          }
        />
      </View>

      <View style={styles.cardFoot}>
        {visit.status === 'incoming' ? (
          <TouchableOpacity
            style={styles.cancelRow}
            onPress={() => onCancel(visit)}
            disabled={cancelling}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Cancel booking"
          >
            {cancelling ? (
              <ActivityIndicator size="small" color={status.danger.fg} />
            ) : (
              <Text style={styles.cancelText}>Cancel booking</Text>
            )}
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={styles.callBtn}
            onPress={onCall}
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
    </View>
  );
});

/* One past visit, as a row in a grouped list. Every row shows its own
   date. A row is tappable only when it has a receipt. */
const HistoryRow = memo(function HistoryRow({
  visit, invoice, isFirst, isLast, onReceipt,
}: {
  visit: any;
  invoice?: { id: string; total: number; created_at: string };
  isFirst: boolean;
  isLast: boolean;
  onReceipt: (visit: any) => void;
}) {
  const time = fmtTime(visit.scheduled_time);
  const { m, d } = dateParts(visit.requested_date);
  const sub = [visit.service, time].filter(Boolean).join(' \u00b7 ');
  const rowStyle = [
    styles.row,
    isFirst && styles.rowFirst,
    isLast && styles.rowLast,
  ];

  const content = (
    <>
      <View style={styles.dateCol}>
        <Text style={styles.dateDay} maxFontSizeMultiplier={1.2}>{d}</Text>
        <Text style={styles.dateMon} maxFontSizeMultiplier={1.2}>{MONTHS_SHORT[m - 1]}</Text>
      </View>
      <View style={styles.rowText}>
        <Text style={styles.rowPet} numberOfLines={1}>{visit.pet_name}</Text>
        <Text style={styles.rowSub} numberOfLines={2}>{sub}</Text>
      </View>
      <View style={styles.rowRight}>
        {invoice ? (
          <Text style={styles.rowAmount} numberOfLines={1} maxFontSizeMultiplier={1.2}>
            {peso(invoice.total)}
          </Text>
        ) : null}
        {visit.status !== 'completed' ? <StatusText value={visit.status} /> : null}
        {invoice ? (
          <View style={styles.receiptRow}>
            <Text style={styles.receiptText}>Receipt</Text>
            <ChevronRight size={14} color={colors.primary} strokeWidth={2} />
          </View>
        ) : null}
      </View>
    </>
  );

  if (invoice) {
    return (
      <TouchableOpacity
        style={rowStyle}
        onPress={() => onReceipt(visit)}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={`View receipt, ${visit.pet_name}, ${visit.service}, ${fmtPastDate(visit.requested_date)}, ${peso(invoice.total)}, paid`}
      >
        {content}
      </TouchableOpacity>
    );
  }
  return (
    <View
      style={rowStyle}
      accessible
      accessibilityLabel={`${visit.pet_name}, ${visit.service}, ${fmtPastDate(visit.requested_date)}, ${STATUS_LABEL[visit.status] || visit.status}`}
    >
      {content}
    </View>
  );
});

export default function AppointmentsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const bottomPad = useTabBarClearance();
  const { width } = useWindowDimensions();
  const sidePad = width < NARROW_WIDTH ? space.lg : space.xxl;
  const [tab, setTab] = useState<'upcoming' | 'past'>('upcoming');
  const [petFilter, setPetFilter] = useState('All');
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

  /* Pet filter: only offered when there is more than one pet to choose
     from. If the selected pet no longer has visits (after a refresh),
     fall back to All. */
  const pets = Array.from(new Set(past.map((v) => v.pet_name).filter(Boolean))) as string[];
  const activePet = pets.includes(petFilter) ? petFilter : 'All';
  const filteredPast = activePet === 'All' ? past : past.filter((v) => v.pet_name === activePet);

  const upcomingSections = [{ label: null as string | null, summary: '', data: upcoming }];

  /* History grouped by month, newest first. The header shows how many
     visits were completed that month and what they came to. */
  const pastSections: { label: string; summary: string; data: any[] }[] = [];
  const pastKeys: string[] = [];
  filteredPast.forEach((v) => {
    const key = monthKey(v.requested_date);
    if (pastKeys[pastKeys.length - 1] !== key) {
      pastKeys.push(key);
      pastSections.push({ label: monthLabel(key), summary: '', data: [] });
    }
    pastSections[pastSections.length - 1].data.push(v);
  });
  pastSections.forEach((s) => {
    const completed = s.data.filter((v) => v.status === 'completed').length;
    const total = s.data.reduce((sum, v) => sum + (invoices[v.id]?.total || 0), 0);
    s.summary = [
      completed > 0 ? `${completed} ${completed === 1 ? 'visit' : 'visits'}` : '',
      total > 0 ? peso(total) : '',
    ].filter(Boolean).join(' \u00b7 ');
  });

  /* Two steps: tapping "Cancel booking" asks first, and only
     "Yes, cancel" actually cancels. */
  const cancelBooking = useCallback((visit: any) => {
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
  }, [loadData]);

  const callClinic = useCallback(() => {
    if (!clinicPhone) {
      Alert.alert('Clinic number', 'The clinic hasn\u2019t added a phone number yet.');
      return;
    }
    Linking.openURL(`tel:${clinicPhone}`).catch(() =>
      Alert.alert('Not available', 'Couldn\u2019t open the phone app on this device.')
    );
  }, [clinicPhone]);

  /* Both tabs stay mounted and the inactive one is only hidden, so a tab
     switch is an instant style change: nothing to build and nothing that
     can flash. Each list is virtualised (only the first few rows are
     built), which is what keeps having two of them cheap, and each tab
     keeps its own scroll position. */
  const renderList = (kind: 'upcoming' | 'past') => {
    const isUpcoming = kind === 'upcoming';
    return (
      <View style={[styles.listWrap, tab !== kind && styles.listHidden]}>
        <SectionList
          sections={(isUpcoming ? upcomingSections : pastSections) as any}
          keyExtractor={(v: any) => v.id}
          renderItem={({ item, index, section }: any) =>
            isUpcoming ? (
              <UpcomingCard
                visit={item}
                cancelling={cancelling === item.id}
                onCancel={cancelBooking}
                onCall={callClinic}
              />
            ) : (
              <HistoryRow
                visit={item}
                invoice={invoices[item.id]}
                isFirst={index === 0}
                isLast={index === section.data.length - 1}
                onReceipt={setReceiptFor}
              />
            )
          }
          renderSectionHeader={({ section }: any) =>
            section.label ? (
              <View style={styles.sectionHead} accessibilityRole="header">
                <Text style={styles.sectionTitle} numberOfLines={1}>{section.label}</Text>
                {section.summary ? (
                  <Text style={styles.sectionSummary} numberOfLines={1}>{section.summary}</Text>
                ) : null}
              </View>
            ) : null
          }
          renderSectionFooter={({ section }: any) =>
            section.label ? <View style={styles.sectionGap} /> : null
          }
          stickySectionHeadersEnabled={false}
          initialNumToRender={8}
          maxToRenderPerBatch={8}
          windowSize={7}
          /* Extra room under the last item so its buttons scroll fully
             clear of the tab bar, even at the largest display and font
             sizes. */
          contentContainerStyle={[
            styles.scroll,
            { paddingHorizontal: sidePad, paddingBottom: bottomPad + space.xxxl },
          ]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
          }
          ListHeaderComponent={
            <>
              {loadError ? (
                <View style={styles.loadError} accessibilityLiveRegion="polite">
                  <AlertCircle size={15} color={status.danger.fg} strokeWidth={2} />
                  <Text style={styles.loadErrorText}>Couldn&apos;t load your visits.</Text>
                  <TouchableOpacity onPress={onRefresh} hitSlop={hitSlop} accessibilityRole="button">
                    <Text style={styles.loadErrorRetry}>Retry</Text>
                  </TouchableOpacity>
                </View>
              ) : null}
              {!isUpcoming && !loading && pets.length > 1 ? (
                <PetFilter pets={pets} value={activePet} onChange={setPetFilter} sidePad={sidePad} />
              ) : null}
            </>
          }
          ListEmptyComponent={
            loading ? (
              <VisitsSkeleton kind={kind} />
            ) : loadError ? null : (
              <View style={styles.empty}>
                <View style={styles.emptyIcon}>
                  <CalendarDays size={26} color={colors.primary} strokeWidth={1.9} />
                </View>
                <Text style={styles.emptyTitle}>
                  {isUpcoming ? 'Nothing booked' : 'No past visits'}
                </Text>
                <Text style={styles.emptyBody}>
                  {isUpcoming
                    ? 'Book a visit and it\u2019ll appear here once the clinic confirms it.'
                    : 'Visits appear here once they\u2019ve been completed.'}
                </Text>
                {isUpcoming && (
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
          }
        />
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.background} />
      <View style={{ paddingTop: insets.top }}></View>
      <View style={[styles.header, { paddingHorizontal: sidePad }]}>
        <View style={styles.inner}>
          <Text style={styles.title} accessibilityRole="header">My visits</Text>
          <View style={styles.tabsWrap}>
            <Tabs
              tabs={[
                { key: 'upcoming', label: 'Upcoming', count: upcoming.length },
                { key: 'past', label: 'History', count: 0 },
              ]}
              value={tab}
              onChange={setTab}
            />
          </View>
        </View>
      </View>
      {renderList('upcoming')}
      {renderList('past')}
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

  /* Centred column with a max width, so wide screens don't stretch it. */
  inner: { width: '100%', maxWidth: MAX_CONTENT_WIDTH, alignSelf: 'center' },

  /* Same title as Profile: 24 / bold, just under the status bar. Side
     padding is set in the component from the screen width. */
  header: {
    paddingTop: space.xs,
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
  tabsWrap: { marginTop: space.sm },

  /* Underline tabs. */
  tabs: { flexDirection: 'row' },
  tab: {
    flex: 1,
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderBottomWidth: 3,
    borderBottomColor: 'transparent',
  },
  tabOn: { borderBottomColor: colors.primary },
  tabLabel: { fontFamily: fonts.bodyBold, fontSize: 16, color: colors.mutedFg, flexShrink: 1 },
  tabLabelOn: { color: colors.primary },
  tabBadge: {
    minWidth: 22,
    height: 22,
    paddingHorizontal: 6,
    borderRadius: 11,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabBadgeText: { fontFamily: fonts.bodyBold, fontSize: 12, color: colors.primaryFg },

  listWrap: { flex: 1 },
  listHidden: { display: 'none' },

  /* Side padding is set in the component from the screen width. */
  scroll: {
    width: '100%',
    maxWidth: MAX_CONTENT_WIDTH,
    alignSelf: 'center',
    paddingTop: space.xl,
  },

  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statusText: { fontFamily: fonts.bodyBold, fontSize: 13, lineHeight: 18, flexShrink: 1 },
  statusWrap: { marginTop: space.sm },

  /* Pet filter chips. */
  filterChip: {
    minHeight: 40,
    paddingHorizontal: 16,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterChipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  filterText: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.mutedFg },
  filterTextOn: { color: colors.primaryFg },

  /* History month headers: month on the left, count and total on the right. */
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: space.md,
    marginBottom: space.sm,
    paddingHorizontal: 2,
  },
  sectionTitle: { ...text.bodyBold, fontSize: 15, color: colors.foreground, flexShrink: 1 },
  sectionSummary: {
    ...text.caption,
    color: colors.mutedFg,
    fontVariant: ['tabular-nums'],
    flexShrink: 0,
  },
  sectionGap: { height: space.xl },

  loadError: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    backgroundColor: status.danger.bg,
    borderRadius: radius.md,
    padding: space.md,
    marginBottom: space.md,
  },
  loadErrorText: { ...text.small, color: status.danger.fg, flex: 1 },
  loadErrorRetry: {
    ...text.smallBold,
    color: status.danger.fg,
    textDecorationLine: 'underline',
  },

  /* Upcoming card. */
  card: {
    ...common.card,
    padding: space.lg,
    marginBottom: space.md,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.md,
  },
  /* Navy block with the day and time. Grows with its content, so large
     font sizes never clip it. */
  dateBlock: {
    minWidth: 76,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  dateLabel: {
    fontFamily: fonts.bodyBold,
    fontSize: 11,
    letterSpacing: 0.8,
    color: colors.primaryFg,
    opacity: 0.75,
  },
  dateBig: {
    fontFamily: fonts.bodyBold,
    fontSize: 18,
    lineHeight: 24,
    color: colors.primaryFg,
    fontVariant: ['tabular-nums'],
  },
  titleBlock: { flex: 1, minWidth: 0 },
  petName: { ...text.bodyBold, fontSize: 18, lineHeight: 24, color: colors.foreground },
  service: { ...text.small, color: colors.mutedFg },

  /* Booking steps. */
  steps: {
    marginTop: space.lg,
    paddingTop: space.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  stepRow: { flexDirection: 'row', gap: space.md },
  stepRail: { alignItems: 'center', width: 20 },
  dot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotDone: { backgroundColor: status.success.fg, borderColor: status.success.fg },
  railLine: { flex: 1, width: 2, minHeight: 12, marginVertical: 2, backgroundColor: colors.border },
  stepBody: { flex: 1, minWidth: 0 },
  stepBodyGap: { paddingBottom: space.md },
  stepTitle: { ...text.small, fontFamily: fonts.bodyBold, color: colors.foreground },
  stepNote: { ...text.caption, color: colors.mutedFg },

  cardFoot: {
    marginTop: space.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  /* Cancel is a quiet text action: red text, no fill, no outline. The
     confirm step is where red gets loud. */
  cancelRow: {
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: space.xs,
  },
  cancelText: { ...text.bodyBold, color: status.danger.fg },
  callBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 48,
    paddingTop: space.xs,
  },
  callBtnText: { ...text.caption, fontFamily: fonts.bodyBold, color: colors.primary, flex: 1 },

  /* History rows: one grouped list per month. Every row has a bottom
     border, which is the divider; the first adds a top border and the
     round top corners, the last the round bottom corners. */
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
  dateDay: { fontFamily: fonts.bodyBold, fontSize: 20, lineHeight: 22, color: colors.foreground },
  dateMon: {
    marginTop: 2,
    fontFamily: fonts.bodyBold,
    fontSize: 11,
    letterSpacing: 0.6,
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
  receiptText: { ...text.caption, fontFamily: fonts.bodyBold, color: colors.primary },

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
   Upcoming: one card shaped like a booking (date block, pet and service,
   status). History: rows shaped like the real ones. The header and tabs
   above are real and show at once. */
function VisitsSkeleton({ kind }: { kind: 'upcoming' | 'past' }) {
  if (kind === 'upcoming') {
    return (
      <View style={styles.card}>
        <View style={styles.cardTop}>
          <Skeleton width={76} height={56} radius={12} />
          <View style={styles.titleBlock}>
            <Skeleton width={96} height={18} />
            <Skeleton width={150} height={13} style={{ marginTop: 6 }} />
            <Skeleton width={80} height={13} style={{ marginTop: space.sm }} />
          </View>
        </View>
      </View>
    );
  }
  return (
    <>
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
    </>
  );
}
