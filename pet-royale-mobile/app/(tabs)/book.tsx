import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  StatusBar,
  ScrollView,
  FlatList,
  Image,
  BackHandler,
  Alert,
  useWindowDimensions,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { supabase } from '../../lib/supabase';
import {
  ChevronLeft, ChevronRight, Check, Plus, CalendarCheck,
  Clock, AlertCircle, Pencil, Banknote,
} from 'lucide-react-native';
import { colors, text, fonts, space, radius, shadow, common, hitSlop, status, sz } from '../../constants/theme';
import { useTabBarClearance } from '../../lib/useTabBarClearance';
import { Skeleton } from '../../components/Skeleton';
import { ServiceIcon } from '../../lib/serviceIcons';
import { toLocalISO, fmtTime, openDays } from '../../lib/format';
import { useRealtimeRefresh } from '../../lib/useRealtimeRefresh';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const FALLBACK_LAST_SLOT_MINUTES = 18 * 60 + 30;

function slotToMinutes(slot: unknown) {
  const s = String(slot ?? '').trim();

  const ampm = s.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)$/i);
  if (ampm) {
    let h = parseInt(ampm[1], 10);
    const min = parseInt(ampm[2], 10);
    const period = ampm[3].toUpperCase();
    if (period === 'PM' && h !== 12) h += 12;
    if (period === 'AM' && h === 12) h = 0;
    return h * 60 + min;
  }

  const h24 = s.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (h24) return parseInt(h24[1], 10) * 60 + parseInt(h24[2], 10);

  return -1;
}

const LEAD_TIME_MINUTES = 30;

function minutesNow() {
  const n = new Date();
  return n.getHours() * 60 + n.getMinutes();
}

function timeColumnToMinutes(value: unknown, fallback: number) {
  if (!value) return fallback;
  const [h, m] = String(value).split(':').map(Number);

  if (!Number.isFinite(h) || !Number.isFinite(m)) return fallback;
  return h * 60 + m;
}

function firstSlotMinutes(category: any) {
  return timeColumnToMinutes(category?.opening_time, 0);
}

function lastSlotMinutes(category: any) {
  return timeColumnToMinutes(
    category?.last_slot,
    FALLBACK_LAST_SLOT_MINUTES
  );
}

function slotLabel(min: number) {
  const h24 = Math.floor(min / 60) % 24;
  const m = min % 60;
  const h = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')} ${h24 >= 12 ? 'PM' : 'AM'}`;
}

const disp = (slot: string) => slot.replace(/^0(\d)/, '$1');

function minutesToTimeColumn(min: number) {
  return `${String(Math.floor(min / 60) % 24).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}:00`;
}

const durationMinutes = (c: any) => (Number(c?.duration_minutes) >= 5 ? Number(c.duration_minutes) : 30);
const stepMinutes = (c: any) => (Number(c?.slot_minutes) >= 5 ? Number(c.slot_minutes) : 30);

function breakRange(c: any): [number, number] | null {
  if (!c || !('break_start' in c)) return [12 * 60, 13 * 60];
  if (!c.break_start || !c.break_end) return null;
  const bs = timeColumnToMinutes(c.break_start, -1);
  const be = timeColumnToMinutes(c.break_end, -1);
  return bs >= 0 && be > bs ? [bs, be] : null;
}

type Visit = {
  opening: number;
  last: number;
  duration: number;
  step: number;
  closedDays: Set<number>;
  breaks: [number, number][];
};

/* A visit can cover several services. It must fit inside every chosen
   service's hours and closed days, and it lasts as long as all of them. */
function combineServices(list: any[]): Visit | null {
  if (list.length === 0) return null;
  return {
    opening: Math.max(...list.map(firstSlotMinutes)),
    last: Math.min(...list.map(lastSlotMinutes)),
    duration: list.reduce((sum, c) => sum + durationMinutes(c), 0),
    step: Math.max(...list.map(stepMinutes)),
    closedDays: new Set(list.map((c) => Number(c.closed_day ?? 0))),
    breaks: list.map(breakRange).filter((r): r is [number, number] => r !== null),
  };
}

function isClosedOn(date: Date, v: Visit | null) {
  return !!v && v.closedDays.has(date.getDay());
}

function buildSlots(v: Visit | null): string[] {
  if (!v) return [];
  const out: string[] = [];
  for (let t = v.opening; t <= v.last; t += v.step) {
    if (v.breaks.some(([bs, be]) => t < be && t + v.duration > bs)) continue;
    out.push(slotLabel(t));
  }
  return out;
}

const closesAt = (v: Visit) => fmtTime(minutesToTimeColumn(v.last + v.duration));

async function fetchTakenTimes(date: string): Promise<{ times: string[]; failed: boolean }> {
  const { data, error } = await (supabase as any).rpc('get_taken_times', { p_date: date });
  if (error) return { times: [], failed: true };
  const times = (data || [])
    .map((r: any) => (typeof r === 'string' ? r : r?.scheduled_time))
    .filter(Boolean) as string[];
  return { times, failed: false };
}

const MAX_CONTENT = 560;

const NARROW_WIDTH = 360;
const SLOT_GAP = 8;

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const MONTHS_SHORT = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

const DAYS_AHEAD = 365;
const PILL_W = 56;
const PILL_GAP = 8;
const PILL_STEP = PILL_W + PILL_GAP;

const longDate = (iso: string) =>
  new Date(iso + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  });

const shortDate = (iso: string) =>
  new Date(iso + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
  });

function dayLabel(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const visit = new Date(y, (m || 1) - 1, d || 1);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diff = Math.round((visit.getTime() - startOfToday.getTime()) / 86400000);
  if (diff === 0) return 'TODAY';
  if (diff === 1) return 'TOMORROW';
  return `${MONTHS_SHORT[(m || 1) - 1]} ${d}`;
}

const DONE = (status as any).success ?? status.teal;

const STEP_LABELS = ['Pet', 'Service', 'Date and time', 'Confirm'];

function StepBars({ step }: { step: number }) {
  return (
    <View>
      <View style={styles.stepBars}>
        {STEP_LABELS.map((label, i) => (
          <View key={label} style={[styles.stepBar, step >= i + 1 && styles.stepBarOn]} />
        ))}
      </View>
      <View style={styles.stepMeta}>
        <Text style={styles.stepMetaText} maxFontSizeMultiplier={1.2}>
          Step {step} of {STEP_LABELS.length}
        </Text>
        <Text style={styles.stepMetaLabel} numberOfLines={1} maxFontSizeMultiplier={1.2}>
          {STEP_LABELS[step - 1]}
        </Text>
      </View>
    </View>
  );
}

function MiniPet({ pet, size, ring = 2, pad = 2 }: { pet: any; size: number; ring?: number; pad?: number }) {
  const inner = size - (ring + pad) * 2;
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        borderWidth: ring,
        borderColor: colors.accent,
        padding: pad,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {pet?.photo_url ? (
        <Image
          source={{ uri: pet.photo_url }}
          style={{ width: inner, height: inner, borderRadius: inner / 2, backgroundColor: colors.muted }}
        />
      ) : (
        <View
          style={{
            width: inner,
            height: inner,
            borderRadius: inner / 2,
            backgroundColor: colors.primary,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ fontFamily: text.bodyBold.fontFamily, fontSize: Math.max(12, inner * 0.4), color: colors.accent }}>
            {pet?.name?.[0]?.toUpperCase() || '?'}
          </Text>
        </View>
      )}
    </View>
  );
}

function SummaryChip({
  pet, label, onPress, a11y,
}: { pet?: any; label: string; onPress: () => void; a11y: string }) {
  return (
    <TouchableOpacity
      style={[styles.chip, !pet && styles.chipNoPhoto]}
      onPress={onPress}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel={a11y}
    >
      {pet ? <MiniPet pet={pet} size={30} /> : null}
      <Text style={styles.chipText} numberOfLines={1} maxFontSizeMultiplier={1.2}>{label}</Text>
      <Pencil size={14} color={colors.mutedFg} strokeWidth={2} />
    </TouchableOpacity>
  );
}

export default function BookScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const bottomPad = useTabBarClearance();
  const { width: screenWidth } = useWindowDimensions();

  const narrow = screenWidth < NARROW_WIDTH;
  const sidePad = narrow ? 16 : 24;
  const slotColumns = narrow ? 3 : 4;
  const contentWidth = Math.min(screenWidth, MAX_CONTENT) - sidePad * 2;
  const slotWidth = Math.floor((contentWidth - SLOT_GAP * (slotColumns - 1)) / slotColumns);

  const [footerH, setFooterH] = useState(130);
  const [pets, setPets] = useState<any[]>([]);
  const [fetchingPets, setFetchingPets] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const [selectedPet, setSelectedPet] = useState<any>(null);
  const [selectedServices, setSelectedServices] = useState<string[]>([]);
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedTime, setSelectedTime] = useState('');

  const [page, setPage] = useState(1);

  const scrollRef = useRef<ScrollView>(null);
  const sectionY = useRef<Record<number, number>>({});
  const scrollToSection = (n: number) => {
    const y = sectionY.current[n];
    if (y != null) scrollRef.current?.scrollTo({ y: Math.max(0, y - 8), animated: true });
  };

  const goToPage = useCallback((n: number) => {
    setPage(n);
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, []);

  const [taken, setTaken] = useState<{ date: string; times: string[]; failed: boolean } | null>(null);
  const [retry, setRetry] = useState(0);
  const takenTimes = taken?.date === selectedDate ? taken.times : [];
  const loadingTimes = !!selectedDate && taken?.date !== selectedDate;
  const timesFailed = taken?.date === selectedDate && taken.failed;

  const takenMinutes = new Set(takenTimes.map(slotToMinutes));
  const isSlotTaken = (slot: string) => takenMinutes.has(slotToMinutes(slot));

  const [isBooking, setIsBooking] = useState(false);

  const bookingLock = useRef(false);
  const [bookError, setBookError] = useState('');
  const [bookSuccess, setBookSuccess] = useState(false);

  const [confirmation, setConfirmation] = useState<{
    pet: string; service: string; date: string; time: string;
  } | null>(null);

  const [services, setServices] = useState<any[]>([]);

  const signOutRemoved = useCallback(async () => {
    await supabase.auth.signOut();
    Alert.alert(
      'Account removed',
      'This account was removed by the clinic, so it can no longer book. Please contact the clinic if this is a mistake.'
    );
  }, []);

  const loadData = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: me } = await (supabase as any)
        .from('clients').select('deleted_at').eq('id', user.id).maybeSingle();
      if (me?.deleted_at) {
        await signOutRemoved();
        return;
      }
      const [petsRes, categoryRes] = await Promise.all([
        (supabase as any)
          .from('pets').select('*').eq('owner_id', user.id)
          .is('deleted_at', null)
          .order('created_at', { ascending: false }),
        (supabase as any)
          .from('booking_categories')
          .select('*')
          .eq('is_active', true)
          .order('sort_order', { ascending: true }),
      ]);
      if (petsRes.error || categoryRes.error) throw petsRes.error || categoryRes.error;

      setPets(petsRes.data || []);
      setServices(categoryRes.data || []);
      setLoadError(false);
    } catch {
      setLoadError(true);
    } finally {
      setFetchingPets(false);
    }
  }, [signOutRemoved]);

  useFocusEffect(useCallback(() => {
    loadData();
    setRetry((r) => r + 1);
  }, [loadData]));

  useFocusEffect(useCallback(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (page > 1 && !bookSuccess) {
        goToPage(page - 1);
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [page, bookSuccess, goToPage]));

  useRealtimeRefresh('appointments', () => setRetry((r) => r + 1));

  useRealtimeRefresh('booking_categories', () => loadData());

  useRealtimeRefresh('pets', () => loadData());

  useEffect(() => {
    if (!selectedDate) return;
    let active = true;
    (async () => {
      const result = await fetchTakenTimes(selectedDate);
      if (!active) return;
      setTaken({ date: selectedDate, times: result.times, failed: result.failed });
    })();
    return () => { active = false; };
  }, [selectedDate, retry]);

  const activeCategory = combineServices(
    services.filter((s: any) => selectedServices.includes(s.name))
  );

  const slots = buildSlots(activeCategory);
  const morningSlots = slots.filter((s) => slotToMinutes(s) < 12 * 60);
  const afternoonSlots = slots.filter((s) => slotToMinutes(s) >= 12 * 60);

  const hoursNote = activeCategory
    ? [
        activeCategory.closedDays.size === 1
          ? `Open ${openDays(Array.from(activeCategory.closedDays)[0])}`
          : '',
        `${fmtTime(minutesToTimeColumn(activeCategory.opening))} – ${closesAt(activeCategory)}`,
      ].filter(Boolean).join(', ')
    : '';
  const latestClose = services.reduce((max, s) => Math.max(max, lastSlotMinutes(s)), 0);
  const closesEarly =
    !!activeCategory && services.length > 1 && activeCategory.last < latestClose;

  const todayISO = toLocalISO(new Date());

  const days = useMemo(() => {
    const base = new Date();
    base.setHours(0, 0, 0, 0);
    return Array.from({ length: DAYS_AHEAD }, (_, i) => {
      const d = new Date(base);
      d.setDate(base.getDate() + i);
      return d;
    });
  }, [todayISO]);

  const todayIsFull =
    !!activeCategory &&
    !isClosedOn(new Date(), activeCategory) &&
    minutesNow() + LEAD_TIME_MINUTES > activeCategory.last;

  const stripRef = useRef<FlatList<Date>>(null);
  const [stripIndex, setStripIndex] = useState(0);
  const scrollStrip = (toIndex: number) => {
    const idx = Math.max(0, Math.min(DAYS_AHEAD - 1, toIndex));
    stripRef.current?.scrollToOffset({ offset: idx * PILL_STEP, animated: true });
  };
  const monthDay = days[stripIndex] ?? days[0];

  useEffect(() => {
    if (page !== 3) return;
    const idx = selectedDate ? Math.max(0, days.findIndex((d) => toLocalISO(d) === selectedDate)) : 0;
    const t = setTimeout(() => {
      setStripIndex(idx);
      stripRef.current?.scrollToOffset({ offset: idx * PILL_STEP, animated: false });
    }, 50);
    return () => clearTimeout(t);

  }, [page]);

  const chosenTime = selectedTime && isSlotTaken(selectedTime) ? '' : selectedTime;

  const canBook = !!(selectedPet && selectedServices.length > 0 && selectedDate && chosenTime);

  /* Whether the current page has what it needs for Continue. */
  const canAdvance =
    page === 1 ? !!selectedPet
    : page === 2 ? selectedServices.length > 0
    : page === 3 ? !!(selectedDate && chosenTime)
    : canBook;

  /* If the review page loses something it needs (a time someone else just
     took, say), drop back to the page where it can be fixed rather than
     showing a half-empty summary. */
  if (page === 4 && !canBook) setPage(3);

  /* Slot chosen — booking goes straight in. Payment is collected in
     cash at the clinic, so there's no payment step here. */
  const handleContinue = () => {
    if (!canBook || isBooking || bookingLock.current) return;

    // A slot picked a while ago may have passed while the screen sat open.
    if (selectedDate === todayISO && slotToMinutes(chosenTime) <= minutesNow() + LEAD_TIME_MINUTES) {
      setSelectedTime('');
      setBookError('That time has just passed. Please choose another.');
      return;
    }
    void submitBooking();
  };

  const submitBooking = async () => {
    if (bookingLock.current) return;
    bookingLock.current = true;
    setIsBooking(true);
    setBookError('');

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setBookError('You need to be signed in to book.');
        return;
      }

      const fresh = await fetchTakenTimes(selectedDate);
      if (fresh.failed) {
        setBookError('Couldn’t check availability. Please try again.');
        return;
      }
      setTaken({ date: selectedDate, times: fresh.times, failed: false });
      if (fresh.times.some((t) => slotToMinutes(t) === slotToMinutes(chosenTime))) {
        setSelectedTime('');
        setBookError('That time was just taken by someone else. Please choose another.');
        return;
      }

      const { data: client } = await (supabase as any)
        .from('clients').select('name').eq('id', user.id).maybeSingle();

      const { error } = await (supabase as any).from('appointments').insert([{
        client_id: user.id,
        client_name: client?.name || user.user_metadata?.full_name || user.email,
        pet_id: selectedPet.id,
        pet_name: selectedPet.name,
        pet_species: selectedPet.species,
        service: selectedServices.join(', '),
        requested_date: selectedDate,
        scheduled_time: chosenTime,
        status: 'incoming',
      }]);

      if (error) {
        // 23505 is Postgres's real unique-violation code — the database
        // enforces one active appointment per date and time (migration
        // 027), so this is the one case where "it was just taken" is
        // genuinely true. Anything else is a different failure, and
        // calling it a slot conflict would hide it.
        if (error.code === '23505') {
          setBookError('That time was just taken by someone else. Please choose another.');
          // Refresh the day so the taken slot shows as taken.
          setTaken(null);
          setRetry((r) => r + 1);
          setSelectedTime('');
        } else if (String(error.message || '').includes('ACCOUNT_REMOVED')) {
          await signOutRemoved();
        } else if (String(error.message || '').includes('PET_REMOVED')) {
          setBookError('That pet is no longer on record. Please choose another pet, or contact the clinic.');
          loadData();
        } else {
          setBookError('Something went wrong on our end. Please try again.');
        }
        return;
      }

      setConfirmation({
        pet: selectedPet.name,
        service: selectedServices.join(', '),
        date: selectedDate,
        time: chosenTime,
      });

      // Marks the just-booked time unavailable in this session
      // immediately, rather than waiting for the next fetch — so
      // "Book another" for the same date doesn't show the slot that was
      // just taken as if it were still open.
      setTaken((prev) => ({
        date: selectedDate,
        times: [...(prev?.date === selectedDate ? prev.times : []), chosenTime],
        failed: false,
      }));
      setBookSuccess(true);
    } catch {
      setBookError('Couldn’t reach the server. Check your connection and try again.');
    } finally {
      bookingLock.current = false;
      setIsBooking(false);
    }
  };

  const reset = () => {
    setBookSuccess(false);
    setConfirmation(null);
    setSelectedPet(null);
    setSelectedServices([]);
    setSelectedDate('');
    setSelectedTime('');
    setBookError('');
    setTaken(null);
    setPage(1);
  };

  const toggleService = (name: string) => {
    setBookError('');
    const next = selectedServices.includes(name)
      ? selectedServices.filter((n) => n !== name)
      : [...selectedServices, name];
    setSelectedServices(next);
    setSelectedTime('');

    // Drop the chosen day if the new combination closes on it, or if it has
    // already closed for today.
    if (selectedDate) {
      const nextVisit = combineServices(services.filter((s: any) => next.includes(s.name)));
      const picked = new Date(selectedDate + 'T00:00:00');
      const tooLateToday =
        selectedDate === todayISO && !!nextVisit && minutesNow() + LEAD_TIME_MINUTES > nextVisit.last;
      if (isClosedOn(picked, nextVisit) || tooLateToday) setSelectedDate('');
    }
  };

  /* The chevron steps back through the flow; on the first page it leaves
     the screen. Nothing already picked is lost when going back. */
  const goBack = () => {
    if (page > 1) {
      goToPage(page - 1);
      return;
    }
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/home' as any);
  };

  /* Errors live in the footer only. The footer is always on screen, right
     above the button, so a message like "that time was just taken" can't
     be missed below the fold, and it clears as soon as something new is
     picked. */
  const bookErrorNode = bookError ? (
    <View style={styles.errorBox} accessibilityRole="alert" accessibilityLiveRegion="polite">
      <Text style={styles.errorText}>{bookError}</Text>
    </View>
  ) : null;

  /* ── Footer ──
     Always there, so there is always a button to press. On the first
     three pages it reads "Continue" and moves to the next page once this
     page has what it needs (greyed out until then). On the last page it
     becomes the real action. One line above the button: what is missing,
     or, once the page is complete, what was picked. No footer when there
     are no pets to choose from: the card above already says what to do. */
  const showFooter = fetchingPets || pets.length > 0;
  const continueDisabled = isBooking || !canAdvance;

  const footerLine =
    page === 1 ? (selectedPet ? selectedPet.name : 'Choose a pet to continue')
    : page === 2 ? (selectedServices.length > 0 ? `${selectedServices.join(', ')} for ${selectedPet?.name ?? ''}` : 'Choose a service to continue')
    : page === 3 ? (selectedDate && chosenTime ? `${shortDate(selectedDate)} · ${disp(chosenTime)}`
        : selectedDate ? 'Pick a time to continue' : 'Pick a day to continue')
    : '';
  const actionLabel =
    page === 4 ? (bookError && canBook ? 'Try again' : 'Request this slot') : 'Continue';
  const onFooterPress = () => {
    if (page === 4) {
      handleContinue();
      return;
    }
    if (canAdvance) goToPage(page + 1);
  };

  /* ── Success ── */
  if (bookSuccess && confirmation) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="dark-content" backgroundColor={colors.background} />
        <ScrollView
          contentContainerStyle={[
            styles.successWrap,
            { paddingHorizontal: sidePad, paddingTop: insets.top + space.xxl, paddingBottom: bottomPad + space.xl },
          ]}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.inner}>
            <View style={[styles.successIcon, { backgroundColor: DONE.bg ?? colors.muted }]}>
              <Check size={sz(28)} color={DONE.fg} strokeWidth={2.6} />
            </View>
            <Text style={styles.successTitle} accessibilityRole="header">Request sent</Text>
            <Text style={styles.successBody}>
              Your slot is booked. Please arrive a few minutes early. Payment
              is collected in cash at the clinic.
            </Text>

            {/* Same layout as an upcoming booking in Visits. */}
            <View
              style={styles.confCard}
              accessible
              accessibilityLabel={`${confirmation.pet}, ${confirmation.service}, ${longDate(confirmation.date)} at ${disp(confirmation.time)}, pending`}
            >
              <View style={styles.confDate}>
                <Text style={styles.confDateLabel} numberOfLines={1} maxFontSizeMultiplier={1.15}>
                  {dayLabel(confirmation.date)}
                </Text>
                <Text style={styles.confDateTime} numberOfLines={1} maxFontSizeMultiplier={1.15}>
                  {disp(confirmation.time)}
                </Text>
              </View>
              <View style={styles.confCopy}>
                <Text style={styles.confPet} numberOfLines={1} maxFontSizeMultiplier={1.2}>{confirmation.pet}</Text>
                <Text style={styles.confService} numberOfLines={2} maxFontSizeMultiplier={1.2}>{confirmation.service}</Text>
                <Text style={styles.confDay} numberOfLines={1} maxFontSizeMultiplier={1.2}>{longDate(confirmation.date)}</Text>
                <View style={styles.confStatus}>
                  <Clock size={15} color={status.warning.fg} strokeWidth={2.2} />
                  <Text style={[styles.confStatusText, { color: status.warning.fg }]} maxFontSizeMultiplier={1.15}>
                    Pending
                  </Text>
                </View>
              </View>
            </View>

            <View style={styles.successActions}>
              <TouchableOpacity
                style={styles.primaryBtn}
                onPress={() => router.push('/(tabs)/appointments' as any)}
                activeOpacity={0.85}
                accessibilityRole="button"
              >
                <Text style={styles.primaryLabel}>View my visits</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.ghostBtn}
                onPress={reset}
                activeOpacity={0.7}
                accessibilityRole="button"
              >
                <Text style={styles.ghostLabel}>Book another</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </View>
    );
  }

  const petMeta = (pet: any) =>
    [pet?.species, pet?.breed, pet?.age != null ? `${pet.age} yr` : null].filter(Boolean).join(' · ');

  const renderDay = ({ item: date }: { item: Date }) => {
    const iso = toLocalISO(date);
    // Sunday for the clinic, Monday for grooming.
    const closed = isClosedOn(date, activeCategory);
    // Today, but every slot on it has already gone.
    const tooLate = iso === todayISO && todayIsFull;
    const on = selectedDate === iso;
    const disabled = closed || tooLate;

    return (
      <TouchableOpacity
        style={[styles.dayPill, on && styles.dayPillOn, disabled && styles.dayPillOff]}
        disabled={disabled}
        /* Tap the chosen day again to unselect it (the time goes with
           it). Picking a day scrolls down to its times. */
        onPress={() => {
          setSelectedTime('');
          setBookError('');
          if (on) {
            setSelectedDate('');
            return;
          }
          setSelectedDate(iso);
          setTimeout(() => scrollToSection(4), 250);
        }}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel={`${longDate(iso)}${closed ? ', closed' : tooLate ? ', fully booked' : ''}`}
        accessibilityHint={on ? 'Tap again to unselect' : undefined}
        accessibilityState={{ disabled, selected: on }}
      >
        <Text style={[styles.dayName, on && styles.dayNameOn, disabled && styles.dayTextOff]} maxFontSizeMultiplier={1.15}>
          {DAY_NAMES[date.getDay()]}
        </Text>
        <Text style={[styles.dayNum, on && styles.dayNumOn, disabled && styles.dayTextOff]} maxFontSizeMultiplier={1.15}>
          {date.getDate()}
        </Text>
        <View style={[styles.dayDot, iso === todayISO && !on && styles.dayDotToday]} />
      </TouchableOpacity>
    );
  };

  const renderSlot = (slot: string) => {
    const isTaken = isSlotTaken(slot);
    /* Only today's slots can be in the past — a future
       date's 8:30 AM is fine at 7 PM tonight. */
    const passed =
      selectedDate === todayISO &&
      slotToMinutes(slot) <= minutesNow() + LEAD_TIME_MINUTES;
    const unavailable = isTaken || passed;
    const on = selectedTime === slot;

    return (
      <TouchableOpacity
        key={slot}
        style={[
          styles.slot,
          { width: slotWidth },
          on && styles.slotOn,
          unavailable && styles.slotTaken,
        ]}
        disabled={unavailable}
        /* Tap the chosen time again to unselect it. */
        onPress={() => {
          setSelectedTime(on ? '' : slot);
          setBookError('');
        }}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel={unavailable ? `${disp(slot)}, unavailable` : disp(slot)}
        accessibilityHint={on ? 'Tap again to unselect' : undefined}
        accessibilityState={{ disabled: unavailable, selected: on }}
      >
        <Text
          style={[
            styles.slotText,
            on && styles.slotTextOn,
            unavailable && styles.slotTextTaken,
          ]}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.8}
          maxFontSizeMultiplier={1.2}
        >
          {disp(slot)}
        </Text>
      </TouchableOpacity>
    );
  };

  const checkbox = (on: boolean) =>
    on ? (
      <View style={styles.checkOn}>
        <Check size={14} color={colors.primaryFg} strokeWidth={3.2} />
      </View>
    ) : (
      <View style={styles.checkOff} />
    );

  const radio = (on: boolean) =>
    on ? (
      <View style={styles.radioOn}>
        <Check size={14} color={colors.primaryFg} strokeWidth={3.2} />
      </View>
    ) : (
      <View style={styles.radioOff} />
    );

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.background} />

      <View style={{ paddingTop: insets.top }}></View>
      <View style={styles.inner}>
        <View style={styles.headerRow}>
          {/* A plain chevron, no circle, same as the sign-in screens. */}
          <TouchableOpacity
            style={styles.backBtn}
            onPress={goBack}
            activeOpacity={0.7}
            hitSlop={hitSlop}
            accessibilityRole="button"
            accessibilityLabel={page > 1 ? `Back to ${STEP_LABELS[page - 2].toLowerCase()}` : 'Go back'}
          >
            <ChevronLeft size={28} color={colors.primary} strokeWidth={2.2} />
          </TouchableOpacity>
          <Text style={styles.title} accessibilityRole="header" numberOfLines={1} maxFontSizeMultiplier={1.2}>
            Book a visit
          </Text>
        </View>
        <View style={[styles.header, { paddingHorizontal: sidePad }]}>
          <StepBars step={page} />
        </View>
      </View>

      <ScrollView
        ref={scrollRef}
        contentContainerStyle={[
          styles.scroll,
          { paddingHorizontal: sidePad, paddingBottom: bottomPad + footerH },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {loadError && (
          <View style={styles.inlineError} accessibilityLiveRegion="polite">
            <AlertCircle size={sz(15)} color={status.danger.fg} strokeWidth={2} />
            <Text style={styles.inlineErrorText}>Couldn&apos;t load your pets and services.</Text>
            <TouchableOpacity
              onPress={() => { setFetchingPets(true); loadData(); }}
              hitSlop={hitSlop}
              accessibilityRole="button"
            >
              <Text style={styles.inlineErrorRetry}>Retry</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── 1. Pet ── a list, so every pet is visible and tappable on any
            screen width, however many there are. */}
        {page === 1 && (
          <View style={styles.pageTop}>
            <Text style={styles.h2}>Which pet is this visit for?</Text>
            <Text style={styles.sub}>Pick one to continue. Services come next.</Text>

            {fetchingPets ? (
              <View style={styles.optList} accessibilityLabel="Loading your pets">
                {[0, 1, 2].map((i) => (
                  <View key={i} style={styles.optRow}>
                    <Skeleton width={56} height={56} radius={28} />
                    <View style={styles.optCopy}>
                      <Skeleton width={90} height={16} />
                      <Skeleton width={120} height={13} style={{ marginTop: 6 }} />
                    </View>
                  </View>
                ))}
              </View>
            ) : pets.length === 0 ? (
              <TouchableOpacity
                style={[styles.emptyCard, { marginTop: 24 }]}
                onPress={() => router.push('/(tabs)/pets' as any)}
                activeOpacity={0.85}
                accessibilityRole="button"
              >
                <View style={styles.emptyIcon}>
                  <Plus size={sz(18)} color={colors.primary} />
                </View>
                <View style={styles.emptyCopy}>
                  <Text style={styles.emptyTitle}>Register a pet first</Text>
                  <Text style={styles.emptySub}>
                    The clinic needs their details before you can book.
                  </Text>
                </View>
              </TouchableOpacity>
            ) : (
              <View style={styles.optList} accessibilityRole="radiogroup">
                {pets.map((pet) => {
                  const on = selectedPet?.id === pet.id;
                  const meta = petMeta(pet);
                  return (
                    <TouchableOpacity
                      key={pet.id}
                      style={[styles.optRow, on && styles.optRowOn]}
                      /* Tap the chosen pet again to unselect it. */
                      onPress={() => {
                        setSelectedPet(on ? null : pet);
                        setBookError('');
                      }}
                      activeOpacity={0.8}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: on }}
                      accessibilityLabel={meta ? `${pet.name}, ${meta}` : pet.name}
                      accessibilityHint={on ? 'Tap again to unselect' : undefined}
                    >
                      <View style={[styles.petRing, on && styles.petRingOn]}>
                        {pet.photo_url ? (
                          <Image source={{ uri: pet.photo_url }} style={styles.petPhoto} />
                        ) : (
                          <View style={styles.petPhotoFallback}>
                            <Text style={styles.petInitial}>
                              {pet.name?.[0]?.toUpperCase() || '?'}
                            </Text>
                          </View>
                        )}
                      </View>
                      <View style={styles.optCopy}>
                        <Text style={styles.optTitle} numberOfLines={1} maxFontSizeMultiplier={1.2}>
                          {pet.name}
                        </Text>
                        {meta ? (
                          <Text style={styles.optMeta} numberOfLines={1} maxFontSizeMultiplier={1.2}>
                            {meta}
                          </Text>
                        ) : null}
                      </View>
                      {radio(on)}
                    </TouchableOpacity>
                  );
                })}

                <TouchableOpacity
                  style={[styles.optRow, styles.optRowAdd]}
                  onPress={() => router.push('/(tabs)/pets' as any)}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  accessibilityLabel="Add a new pet"
                >
                  <View style={styles.addIcon}>
                    <Plus size={22} color={colors.primary} strokeWidth={2} />
                  </View>
                  <View style={styles.optCopy}>
                    <Text style={styles.optTitle} numberOfLines={1} maxFontSizeMultiplier={1.2}>Add a new pet</Text>
                    <Text style={styles.optMeta} numberOfLines={1} maxFontSizeMultiplier={1.2}>Create a profile</Text>
                  </View>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}

        {/* ── 2. Service (appears after Continue on the pet page) ── */}
        {page === 2 && selectedPet && (
          <View style={styles.pageTopChip}>
            <View style={styles.chipRow}>
              <SummaryChip
                pet={selectedPet}
                label={selectedPet.name}
                onPress={() => goToPage(1)}
                a11y={`Change pet, currently ${selectedPet.name}`}
              />
            </View>

            <Text style={[styles.h2, { marginTop: 20 }]}>What does {selectedPet.name} need?</Text>
            <Text style={styles.sub}>Choose one or more services.</Text>

            {services.length === 0 && !loadError ? (
              <Text style={[styles.emptyNote, { marginTop: 16 }]}>
                No services are available to book right now.
              </Text>
            ) : (
              <View style={styles.optList}>
                {services.map((category: any) => {
                  const label = category.name;
                  const desc = category.description;
                  const on = selectedServices.includes(label);
                  return (
                    <TouchableOpacity
                      key={label}
                      style={[styles.optRow, on && styles.optRowOn]}
                      onPress={() => toggleService(label)}
                      activeOpacity={0.8}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: on }}
                      accessibilityLabel={desc ? `${label}. ${desc}` : label}
                    >
                      <View style={styles.serviceIcon}>
                        <ServiceIcon name={label} size={24} color={colors.primary} strokeWidth={1.9} />
                      </View>
                      <View style={styles.optCopy}>
                        <Text style={styles.optTitle} maxFontSizeMultiplier={1.2}>{label}</Text>
                        {desc ? <Text style={styles.optMeta} maxFontSizeMultiplier={1.2}>{desc}</Text> : null}
                      </View>
                      {checkbox(on)}
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </View>
        )}

        {/* ── 3. Date and time ── */}
        {page === 3 && selectedPet && selectedServices.length > 0 && (
          <View style={styles.pageTopChip}>
            <View style={styles.chipRow}>
              <SummaryChip
                pet={selectedPet}
                label={selectedPet.name}
                onPress={() => goToPage(1)}
                a11y={`Change pet, currently ${selectedPet.name}`}
              />
              <SummaryChip
                label={selectedServices.length > 1 ? `${selectedServices.length} services` : selectedServices[0]}
                onPress={() => goToPage(2)}
                a11y={`Change services, currently ${selectedServices.join(', ')}`}
              />
            </View>

            <Text style={[styles.h2, { marginTop: 20 }]}>When works for you?</Text>
            <Text style={styles.sub}>Pick a day, then a time.</Text>

            <View style={styles.monthRow}>
              <Text style={styles.monthText} maxFontSizeMultiplier={1.2}>
                {MONTHS[monthDay.getMonth()]} {monthDay.getFullYear()}
              </Text>
              <View style={styles.monthNav}>
                <TouchableOpacity
                  style={styles.monthBtn}
                  onPress={() => scrollStrip(stripIndex - 7)}
                  disabled={stripIndex === 0}
                  accessibilityRole="button"
                  accessibilityLabel="Previous week"
                  accessibilityState={{ disabled: stripIndex === 0 }}
                >
                  <ChevronLeft size={22} color={stripIndex === 0 ? colors.border : colors.mutedFg} strokeWidth={2.2} />
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.monthBtn}
                  onPress={() => scrollStrip(stripIndex + 7)}
                  accessibilityRole="button"
                  accessibilityLabel="Next week"
                >
                  <ChevronRight size={22} color={colors.primary} strokeWidth={2.2} />
                </TouchableOpacity>
              </View>
            </View>

            <FlatList
              ref={stripRef}
              horizontal
              data={days}
              keyExtractor={(d) => toLocalISO(d)}
              renderItem={renderDay}
              extraData={[selectedDate, activeCategory, todayIsFull]}
              getItemLayout={(_, index) => ({ length: PILL_W, offset: PILL_STEP * index, index })}
              showsHorizontalScrollIndicator={false}
              ItemSeparatorComponent={() => <View style={{ width: PILL_GAP }} />}
              contentContainerStyle={{ paddingHorizontal: sidePad }}
              style={[styles.dayStrip, { marginHorizontal: -sidePad }]}
              onScroll={(e) => {
                const idx = Math.max(0, Math.round(e.nativeEvent.contentOffset.x / PILL_STEP));
                if (idx !== stripIndex) setStripIndex(idx);
              }}
              scrollEventThrottle={32}
              initialNumToRender={10}
              windowSize={5}
              keyboardShouldPersistTaps="handled"
            />

            {(hoursNote || todayIsFull) ? (
              <View style={styles.note}>
                <AlertCircle size={sz(12)} color={colors.mutedFg} />
                <Text style={styles.noteText}>
                  {hoursNote}
                  {todayIsFull ? `${hoursNote ? ' · ' : ''}today is fully booked out` : ''}
                </Text>
              </View>
            ) : null}

            {/* Times appear once a day is chosen. */}
            {!!selectedDate && (
              <View onLayout={(e) => { sectionY.current[4] = e.nativeEvent.layout.y; }}>
                {loadingTimes ? (
                  /* Same shape as the real slots. */
                  <View style={[styles.slotGrid, { marginTop: 20 }]} accessibilityLabel="Checking availability">
                    {Array.from({ length: 8 }).map((_, i) => (
                      <Skeleton key={i} width={slotWidth} height={48} radius={12} />
                    ))}
                  </View>
                ) : timesFailed ? (
                  /* A failed check must not look like a free day — that would
                     let someone pick a slot that's already taken. The times
                     stay hidden until the check succeeds. */
                  <View style={[styles.inlineError, { marginTop: 20 }]} accessibilityLiveRegion="polite">
                    <AlertCircle size={sz(15)} color={status.danger.fg} strokeWidth={2} />
                    <Text style={styles.inlineErrorText}>Couldn&apos;t check availability.</Text>
                    <TouchableOpacity
                      onPress={() => { setTaken(null); setRetry((r) => r + 1); }}
                      hitSlop={hitSlop}
                      accessibilityRole="button"
                    >
                      <Text style={styles.inlineErrorRetry}>Retry</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <>
                    {morningSlots.length > 0 && (
                      <>
                        <Text style={[styles.groupLabel, { marginTop: 20 }]}>Morning</Text>
                        <View style={styles.slotGrid}>{morningSlots.map(renderSlot)}</View>
                      </>
                    )}
                    {afternoonSlots.length > 0 && (
                      <>
                        <Text style={[styles.groupLabel, { marginTop: morningSlots.length > 0 ? 18 : 20 }]}>
                          Afternoon
                        </Text>
                        <View style={styles.slotGrid}>{afternoonSlots.map(renderSlot)}</View>
                      </>
                    )}

                    {/* A grid of struck-through times with no explanation
                        reads as broken. Say why. */}
                    {selectedDate === todayISO && (
                      <View style={styles.note}>
                        <Clock size={sz(12)} color={colors.mutedFg} />
                        <Text style={styles.noteText}>
                          Times that have passed today aren&apos;t available.
                          Bookings need {LEAD_TIME_MINUTES} minutes&apos; notice.
                        </Text>
                      </View>
                    )}

                    {closesEarly && (
                      <View style={styles.note}>
                        <Clock size={sz(12)} color={colors.mutedFg} />
                        <Text style={styles.noteText}>
                          This visit closes at {closesAt(activeCategory)},
                          earlier than the rest of the clinic.
                        </Text>
                      </View>
                    )}
                  </>
                )}
              </View>
            )}
          </View>
        )}

        {/* ── 4. Review ── */}
        {page === 4 && selectedPet && selectedServices.length > 0 && !!selectedDate && !!chosenTime && (
          <View style={styles.pageTop}>
            <Text style={styles.h2}>Review your visit</Text>
            <Text style={styles.sub}>Check the details, then confirm.</Text>

            <View style={styles.reviewCard}>
              <View style={[styles.reviewRow, styles.reviewRowDivider]}>
                <MiniPet pet={selectedPet} size={48} ring={3} pad={3} />
                <View style={styles.reviewCopy}>
                  <Text style={styles.reviewLabel} maxFontSizeMultiplier={1.2}>Pet</Text>
                  <Text style={styles.reviewValue} maxFontSizeMultiplier={1.2}>
                    {[selectedPet.name, selectedPet.species].filter(Boolean).join(' · ')}
                    {selectedPet.age != null ? `, ${selectedPet.age} yr` : ''}
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.reviewEdit}
                  onPress={() => goToPage(1)}
                  accessibilityRole="button"
                  accessibilityLabel="Edit pet"
                >
                  <Text style={styles.reviewEditText}>Edit</Text>
                </TouchableOpacity>
              </View>

              <View style={[styles.reviewRow, styles.reviewRowDivider]}>
                <View style={styles.reviewIcon}>
                  <ServiceIcon name={selectedServices[0]} size={24} color={colors.primary} strokeWidth={1.9} />
                </View>
                <View style={styles.reviewCopy}>
                  <Text style={styles.reviewLabel} maxFontSizeMultiplier={1.2}>{selectedServices.length > 1 ? 'Services' : 'Service'}</Text>
                  <Text style={styles.reviewValue} maxFontSizeMultiplier={1.2}>{selectedServices.join(', ')}</Text>
                </View>
                <TouchableOpacity
                  style={styles.reviewEdit}
                  onPress={() => goToPage(2)}
                  accessibilityRole="button"
                  accessibilityLabel="Edit service"
                >
                  <Text style={styles.reviewEditText}>Edit</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.reviewRow}>
                <View style={styles.reviewIcon}>
                  <CalendarCheck size={24} color={colors.primary} strokeWidth={1.9} />
                </View>
                <View style={styles.reviewCopy}>
                  <Text style={styles.reviewLabel} maxFontSizeMultiplier={1.2}>Date and time</Text>
                  <Text style={styles.reviewValue} maxFontSizeMultiplier={1.2}>
                    {new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-US', {
                      weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
                    })}
                  </Text>
                  <Text style={styles.reviewSub} maxFontSizeMultiplier={1.2}>{disp(chosenTime)}</Text>
                </View>
                <TouchableOpacity
                  style={styles.reviewEdit}
                  onPress={() => goToPage(3)}
                  accessibilityRole="button"
                  accessibilityLabel="Edit date and time"
                >
                  <Text style={styles.reviewEditText}>Edit</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* What to expect, before the request is sent rather than after. */}
            <View style={styles.reviewNotes}>
              <View style={styles.reviewNote}>
                <Clock size={18} color={colors.mutedFg} strokeWidth={1.9} />
                <Text style={styles.reviewNoteText} maxFontSizeMultiplier={1.2}>
                  Your booking is confirmed once you arrive at the clinic.
                </Text>
              </View>
              <View style={styles.reviewNote}>
                <Banknote size={18} color={colors.mutedFg} strokeWidth={1.9} />
                <Text style={styles.reviewNoteText} maxFontSizeMultiplier={1.2}>
                  Payment is collected in cash at the clinic.
                </Text>
              </View>
            </View>
          </View>
        )}
      </ScrollView>

      {/* ── Footer: a flat bar with one line of status and the main button ── */}
      {showFooter && (
        <View
          style={[styles.footer, { bottom: bottomPad - 24, paddingHorizontal: sidePad }]}
          onLayout={(e) => setFooterH(e.nativeEvent.layout.height)}
        >
          <View style={styles.inner}>
            {bookErrorNode}
            {footerLine ? (
              <Text
                style={[styles.footerHint, canAdvance && styles.footerHintReady]}
                numberOfLines={2}
                maxFontSizeMultiplier={1.2}
                accessibilityLiveRegion="polite"
              >
                {footerLine}
              </Text>
            ) : null}

            <TouchableOpacity
              style={[
                styles.primaryBtn,
                styles.footerBtn,
                isBooking && styles.primaryBtnLoading,
                continueDisabled && !isBooking && styles.primaryBtnDisabled,
              ]}
              onPress={onFooterPress}
              disabled={continueDisabled}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={actionLabel}
              accessibilityState={{ disabled: continueDisabled, busy: isBooking }}
            >
              {isBooking ? (
                <ActivityIndicator color={colors.primaryFg} />
              ) : (
                <Text
                  style={[
                    styles.primaryLabel,
                    continueDisabled && styles.primaryLabelDisabled,
                  ]}
                  maxFontSizeMultiplier={1.2}
                >
                  {actionLabel}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

const BOLD = text.bodyBold.fontFamily;
const REGULAR = text.body.fontFamily;

const styles = StyleSheet.create({
  container: { ...common.screen },

  /* A centred column with a max width, so wide screens don't stretch it.
     Phones never reach the cap. */
  inner: { width: '100%', maxWidth: MAX_CONTENT, alignSelf: 'center' },

  /* Chevron and title on one row, just under the status bar. */
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 16,
  },
  backBtn: {
    width: 48,
    height: 48,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  title: {
    flexShrink: 1,
    fontFamily: fonts.display,
    fontSize: 28,
    lineHeight: 34,
    letterSpacing: -0.5,
    color: colors.foreground,
  },

  /* Story-style progress: four bars across the top. Navy once a step is
     done or in progress, soft grey until then. Side padding is set in the
     component. */
  header: { paddingTop: 8 },
  stepBars: { flexDirection: 'row', gap: 8 },
  stepBar: { flex: 1, height: 5, borderRadius: 3, backgroundColor: '#D9D6C8' },
  stepBarOn: { backgroundColor: colors.primary },
  stepMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 10,
  },
  stepMetaText: { fontFamily: REGULAR, fontSize: 14, lineHeight: 20, color: colors.mutedFg },
  stepMetaLabel: { fontFamily: BOLD, fontSize: 14, lineHeight: 20, color: colors.primary, flexShrink: 1, textAlign: 'right' },

  /* Side padding is set in the component. */
  scroll: { width: '100%', maxWidth: MAX_CONTENT, alignSelf: 'center' },
  pageTop: { paddingTop: 24 },
  pageTopChip: { paddingTop: 16 },

  h2: { fontFamily: BOLD, fontSize: 22, lineHeight: 28, color: colors.foreground },
  sub: { fontFamily: REGULAR, fontSize: 15, lineHeight: 22, color: colors.mutedFg, marginTop: 4 },

  inlineError: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    backgroundColor: status.danger.bg,
    borderRadius: radius.md,
    padding: space.md,
    marginTop: 16,
    marginBottom: space.md,
  },
  inlineErrorText: { ...text.small, color: status.danger.fg, flex: 1 },
  inlineErrorRetry: { ...text.smallBold, color: status.danger.fg, textDecorationLine: 'underline' },

  emptyCard: {
    ...common.card,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.lg,
    padding: space.lg,
  },
  /* Neutral circle, like the empty-state icon on Profile. */
  emptyIcon: {
    width: sz(42),
    height: sz(42),
    borderRadius: sz(21),
    backgroundColor: colors.muted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyCopy: { flex: 1 },
  emptyTitle: { ...text.bodyBold, color: colors.foreground },
  emptySub: { ...text.caption, color: colors.mutedFg, marginTop: 1 },
  emptyNote: { ...text.small, color: colors.mutedFg },

  /* What was picked on earlier pages: one chip each, wrapping onto a new
     line when the names are long, so nothing is cut off. */
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 44,
    paddingLeft: 6,
    paddingRight: 14,
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: colors.cardBorder,
    backgroundColor: colors.card,
    maxWidth: '100%',
    flexShrink: 1,
  },
  chipNoPhoto: { paddingLeft: 14 },
  chipText: { fontFamily: BOLD, fontSize: 14, lineHeight: 20, color: colors.foreground, flexShrink: 1 },

  /* Pets and services share one row: a picture on the left, the name and
     a line of detail, then the radio. */
  optList: { gap: 10, marginTop: 16 },
  optRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    minHeight: 68,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: colors.cardBorder,
    backgroundColor: colors.card,
  },
  optRowOn: { borderColor: colors.primary },
  optRowAdd: { borderStyle: 'dashed', backgroundColor: 'transparent' },
  optCopy: { flex: 1, minWidth: 0 },
  optTitle: { fontFamily: BOLD, fontSize: 16, lineHeight: 22, color: colors.foreground },
  optMeta: { fontFamily: REGULAR, fontSize: 14, lineHeight: 20, color: colors.mutedFg },

  petRing: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 2.5,
    borderColor: colors.primary,
    padding: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  petRingOn: { borderColor: colors.accent },
  petPhoto: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.muted },
  petPhotoFallback: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  petInitial: { fontFamily: BOLD, fontSize: 18, color: colors.accent },
  addIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: '#B9B5A2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  serviceIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: colors.muted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkOn: {
    width: 26,
    height: 26,
    borderRadius: 8,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkOff: {
    width: 26,
    height: 26,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#B9B5A2',
  },
  radioOn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOff: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    borderColor: '#B9B5A2',
  },

  /* ── Date and time ── */
  monthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 18,
  },
  monthText: { fontFamily: BOLD, fontSize: 16, lineHeight: 24, color: colors.foreground, flexShrink: 1 },
  monthNav: { flexDirection: 'row', gap: 4 },
  monthBtn: {
    width: 44,
    height: 44,
    marginVertical: -6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  /* Side margin is set in the component, so the strip runs to the screen
     edge and the next day peeks in, showing that it scrolls. */
  dayStrip: { marginTop: 8 },
  dayPill: {
    width: PILL_W,
    minHeight: 80,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: colors.cardBorder,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  dayPillOn: { backgroundColor: colors.primary, borderColor: colors.primary, ...shadow.primary },
  dayPillOff: { backgroundColor: colors.muted, borderColor: 'transparent' },
  dayName: { fontFamily: REGULAR, fontSize: 12, lineHeight: 16, color: colors.mutedFg },
  dayNameOn: { color: '#E7EAF0' },
  dayNum: { fontFamily: BOLD, fontSize: 20, lineHeight: 26, color: colors.foreground },
  dayNumOn: { color: colors.primaryFg },
  dayTextOff: { color: colors.mutedFg, opacity: 0.6 },
  dayDot: { width: 5, height: 5, borderRadius: 3 },
  dayDotToday: { backgroundColor: colors.accent },

  groupLabel: { fontFamily: BOLD, fontSize: 14, lineHeight: 20, color: colors.mutedFg },
  slotGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SLOT_GAP, marginTop: 8 },
  slot: {
    height: 48,
    paddingHorizontal: 4,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.cardBorder,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  slotOn: { borderColor: colors.primary, backgroundColor: colors.primary },
  slotTaken: { backgroundColor: colors.muted },
  slotText: { fontFamily: BOLD, fontSize: 14, color: colors.foreground, fontVariant: ['tabular-nums'] },
  slotTextOn: { color: colors.primaryFg },
  /* Struck through rather than merely greyed — grey alone reads as
     "unselected", not "unavailable". */
  slotTextTaken: { color: colors.mutedFg, opacity: 0.7, textDecorationLine: 'line-through' },

  note: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
  },
  noteText: { ...text.caption, color: colors.mutedFg, flex: 1 },

  /* ── Review page ── */
  reviewCard: {
    marginTop: 20,
    backgroundColor: colors.card,
    borderWidth: 2,
    borderColor: colors.cardBorder,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 4,
  },
  reviewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 14,
  },
  reviewRowDivider: { borderBottomWidth: 1, borderBottomColor: colors.cardBorder },
  reviewIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: colors.muted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reviewCopy: { flex: 1, minWidth: 0 },
  reviewLabel: { fontFamily: REGULAR, fontSize: 13, lineHeight: 18, color: colors.mutedFg },
  reviewValue: { fontFamily: BOLD, fontSize: 16, lineHeight: 22, color: colors.foreground },
  reviewSub: { fontFamily: REGULAR, fontSize: 14, lineHeight: 20, color: colors.foreground },
  reviewEdit: { minWidth: 44, height: 44, alignItems: 'flex-end', justifyContent: 'center' },
  reviewEditText: { fontFamily: BOLD, fontSize: 14, color: colors.primary },
  reviewNotes: { marginTop: 16, marginHorizontal: 2, gap: 10 },
  reviewNote: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  reviewNoteText: { fontFamily: REGULAR, fontSize: 14, lineHeight: 20, color: colors.mutedFg, flex: 1 },

  errorBox: {
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.destructive,
    backgroundColor: colors.destructiveBg,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderRadius: radius.md,
  },
  errorText: { ...text.small, color: status.danger.fg },

  /* A flat bar: one line of status on top, the button below. `bottom` is
     set where it renders, from useTabBarClearance(), so it follows the
     device's navigation bar. */
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
    backgroundColor: colors.background,
  },
  footerBtn: {
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0,
  },
  footerHint: { fontFamily: REGULAR, fontSize: 14, lineHeight: 20, color: colors.mutedFg, marginBottom: 10 },
  footerHintReady: { fontFamily: BOLD, color: colors.foreground },

  /* Fully rounded, solid navy: the same button as sign-in. A minimum
     height rather than a fixed one, so large text never clips. */
  primaryBtn: {
    minHeight: 52,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 999,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.primary,
  },
  primaryBtnLoading: { backgroundColor: colors.primaryDark },
  /* Disabled: flat. No border, no shadow/elevation, so no box shows up
     around the pill. */
  primaryBtnDisabled: {
    backgroundColor: colors.muted,
    borderWidth: 0,
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0,
  },
  primaryLabelDisabled: { color: colors.mutedFg },
  primaryLabel: { fontFamily: BOLD, fontSize: 16, color: colors.primaryFg, textAlign: 'center' },
  ghostBtn: {
    ...common.buttonGhost,
    minHeight: 52,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ghostLabel: {
    ...common.buttonGhostText,
    fontFamily: BOLD,
    fontSize: 16,
    textAlign: 'center',
  },

  /* ── "Request sent" ──
     Side padding and top inset are set in the component. */
  successWrap: { flexGrow: 1 },
  successIcon: {
    width: sz(56),
    height: sz(56),
    borderRadius: sz(28),
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.xl,
  },
  successTitle: {
    fontFamily: text.bodyBold.fontFamily,
    fontSize: 24,
    lineHeight: 28,
    letterSpacing: 0,
    color: colors.foreground,
    textAlign: 'center',
  },
  successBody: { ...text.body, color: colors.mutedFg, marginTop: space.md, textAlign: 'center' },

  /* The same layout as an upcoming booking in Visits. */
  confCard: {
    ...common.card,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.md,
    padding: space.lg,
    marginTop: space.xl,
  },
  confDate: {
    minWidth: 76,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  confDateLabel: { fontFamily: BOLD, fontSize: 11, lineHeight: 14, letterSpacing: 0.8, color: colors.primaryFg, opacity: 0.75 },
  confDateTime: { fontFamily: BOLD, fontSize: 18, lineHeight: 24, color: colors.primaryFg, fontVariant: ['tabular-nums'] },
  confCopy: { flex: 1, minWidth: 0 },
  confPet: { fontFamily: BOLD, fontSize: 18, lineHeight: 24, color: colors.foreground },
  confService: { ...text.small, color: colors.mutedFg, marginTop: 2 },
  confDay: { ...text.caption, color: colors.mutedFg, marginTop: 2 },
  confStatus: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: space.sm },
  confStatusText: { ...text.smallBold },
  successActions: { marginTop: space.xxl, gap: space.md },
});
