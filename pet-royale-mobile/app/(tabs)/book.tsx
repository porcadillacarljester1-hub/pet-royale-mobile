import { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  StatusBar,
  ScrollView,
  Image,
  useWindowDimensions,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { supabase } from '../../lib/supabase';
import {
  ChevronLeft, ChevronRight, Check, Plus, CalendarCheck,
  Clock, AlertCircle,
} from 'lucide-react-native';
import { colors, text, space, radius, shadow, common, hitSlop, status, sz } from '../../constants/theme';
import { useTabBarClearance } from '../../lib/useTabBarClearance';
import { Skeleton } from '../../components/Skeleton';
import { ServiceIcon } from '../../lib/serviceIcons';
import { toLocalISO, fmtTime, openDays, closingTime } from '../../lib/format';
import { useRealtimeRefresh } from '../../lib/useRealtimeRefresh';


const TIME_SLOTS = [
  '08:30 AM', '09:00 AM', '09:30 AM', '10:00 AM', '10:30 AM', '11:00 AM',
  '11:30 AM', '01:00 PM', '01:30 PM', '02:00 PM',
  '02:30 PM', '03:00 PM', '03:30 PM', '04:00 PM', '04:30 PM', '05:00 PM',
  '05:30 PM', '06:00 PM', '06:30 PM',
];

function isClosedOn(date: Date, category: any) {
  if (!category) return false;
  return date.getDay() === Number(category.closed_day ?? 0);
}

/* Accepts "08:30 AM" (what the app writes) AND "08:30:00" / "14:30"
   (what Postgres returns if `scheduled_time` is a `time` column, or what
   an admin-created row may contain). Everything is compared as minutes,
   never as raw strings — otherwise "08:30 AM" !== "08:30:00" and a taken
   slot looks free. */
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
  // A malformed value would give NaN, and every comparison against NaN is
  // false — which silently hides every slot. Fall back instead.
  if (!Number.isFinite(h) || !Number.isFinite(m)) return fallback;
  return h * 60 + m;
}

function firstSlotMinutes(category: any) {
  return timeColumnToMinutes(category?.opening_time, 0);
}

function lastSlotMinutes(category: any) {
  return timeColumnToMinutes(
    category?.last_slot,
    slotToMinutes(TIME_SLOTS[TIME_SLOTS.length - 1])
  );
}

/* Taken times for one date, straight from the database.
   IMPORTANT: this uses the `get_taken_times` RPC (SECURITY DEFINER), not a
   direct SELECT on `appointments`. A direct SELECT is filtered by Row Level
   Security to the signed-in owner's OWN rows, so other owners' bookings were
   invisible and every slot looked free to them. See migration 027. */
async function fetchTakenTimes(date: string): Promise<{ times: string[]; failed: boolean }> {
  const { data, error } = await (supabase as any).rpc('get_taken_times', { p_date: date });
  if (error) return { times: [], failed: true };
  const times = (data || [])
    .map((r: any) => (typeof r === 'string' ? r : r?.scheduled_time))
    .filter(Boolean) as string[];
  return { times, failed: false };
}

/* Four even columns rather than however many chips happen to fit — a
   wrap-based grid gives 3 on some devices and 4 on others, which looks
   unintentional. The width is derived from the screen (floored, so
   rounding can never push the fourth chip onto a new line). */
const SLOT_COLUMNS = 4;

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/* What the footer says is still to do, by step. */
const NEXT_HINT: Record<number, string> = {
  2: 'Next: choose a service',
  3: 'Next: choose a day',
  4: 'Next: choose a time',
};

/* Monday-first grid. getDay() returns 0 on Sunday, so the offset shifts
   it — otherwise every month starts on the wrong column. */
function getCalendarGrid(month: Date) {
  const year = month.getFullYear();
  const m = month.getMonth();
  const first = new Date(year, m, 1);
  const daysInMonth = new Date(year, m + 1, 0).getDate();
  const offset = (first.getDay() + 6) % 7;

  const cells: (Date | null)[] = Array(offset).fill(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, m, d));
  while (cells.length % 7 !== 0) cells.push(null);

  const weeks: (Date | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

const longDate = (iso: string) =>
  new Date(iso + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  });

const shortDate = (iso: string) =>
  new Date(iso + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
  });

const STEP_LABELS = ['Pet', 'Service', 'Date', 'Time'];

/* Story-style progress: one bar per step, with the step name underneath. */
function StepBars({ step }: { step: number }) {
  return (
    <View>
      <View style={styles.stepBars}>
        {STEP_LABELS.map((label, i) => (
          <View key={label} style={[styles.stepBar, step >= i + 1 && styles.stepBarOn]} />
        ))}
      </View>
      <View style={styles.stepMeta}>
        <Text style={styles.stepMetaText}>Step {step} of {STEP_LABELS.length}</Text>
        <Text style={styles.stepMetaLabel}>{STEP_LABELS[step - 1]}</Text>
      </View>
    </View>
  );
}

export default function BookScreen() {
  const router = useRouter();
  const bottomPad = useTabBarClearance();
  const { width: screenWidth } = useWindowDimensions();
  const slotWidth = Math.floor(
    (screenWidth - space.xxl * 2 - space.sm * (SLOT_COLUMNS - 1)) / SLOT_COLUMNS
  );
  const [footerH, setFooterH] = useState(150);
  const [pets, setPets] = useState<any[]>([]);
  const [fetchingPets, setFetchingPets] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const [selectedPet, setSelectedPet] = useState<any>(null);
  const [selectedService, setSelectedService] = useState('');
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedTime, setSelectedTime] = useState('');

  const [calendarMonth, setCalendarMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });

  /* Where each step's section starts, so "Continue" can scroll to it.
     A ref, because it is only read when the button is pressed. */
  const scrollRef = useRef<ScrollView>(null);
  const sectionY = useRef<Record<number, number>>({});
  const scrollToSection = (n: number) => {
    const y = sectionY.current[n];
    if (y != null) scrollRef.current?.scrollTo({ y: Math.max(0, y - space.sm), animated: true });
  };

  /* The taken times for one date, stored with the date they belong to.
     Everything the screen reads is derived from this, so there is no
     state to reset when the date changes and nothing to get stuck:
     a result for another date simply isn't used. */
  const [taken, setTaken] = useState<{ date: string; times: string[]; failed: boolean } | null>(null);
  const [retry, setRetry] = useState(0);
  const takenTimes = taken?.date === selectedDate ? taken.times : [];
  const loadingTimes = !!selectedDate && taken?.date !== selectedDate;
  const timesFailed = taken?.date === selectedDate && taken.failed;

  /* Compared as minutes so "08:30 AM" and "08:30:00" are the same slot. */
  const takenMinutes = new Set(takenTimes.map(slotToMinutes));
  const isSlotTaken = (slot: string) => takenMinutes.has(slotToMinutes(slot));

  const [isBooking, setIsBooking] = useState(false);
  /* A ref, not just state: state updates are async, so a fast double-tap
     could enter submitBooking twice before `isBooking` is true. */
  const bookingLock = useRef(false);
  const [bookError, setBookError] = useState('');
  const [bookSuccess, setBookSuccess] = useState(false);
  /* Snapshot of what was booked, so the success screen never depends on
     live selection state that other logic may have cleared. */
  const [confirmation, setConfirmation] = useState<{
    pet: string; service: string; date: string; time: string;
  } | null>(null);

  const [services, setServices] = useState<any[]>([]);

  const loadData = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const [petsRes, categoryRes] = await Promise.all([
        (supabase as any)
          .from('pets').select('*').eq('owner_id', user.id)
          .order('created_at', { ascending: false }),
        (supabase as any)
          .from('booking_categories')
          .select('name, description, opening_time, closed_day, last_slot')
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
  }, []);

  /* Coming back to this screen also refreshes availability: someone else
     may have booked while this one sat in the background. */
  useFocusEffect(useCallback(() => {
    loadData();
    setRetry((r) => r + 1);
  }, [loadData]));

    // Slots taken or freed by anyone (including the clinic's walk-ins) show up straight away
  useRealtimeRefresh('appointments', () => setRetry((r) => r + 1));

  // Clinic changes to hours, closed days or services reach the screen without reopening it
  useRealtimeRefresh('booking_categories', () => loadData());

  // A pet added or edited elsewhere appears in the list
  useRealtimeRefresh('pets', () => loadData());

  /* Slots already booked on the chosen day, so someone can't pick a
     time the clinic has filled — including times booked by OTHER owners.
     Cancelled bookings free their slot again. `retry` re-runs it. */
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

  const activeCategory = services.find((s: any) => s.name === selectedService) || null;

  /* Slots are filtered to the category's own opening and closing times,
     so a change in the admin reaches the app without a release. */
  const slots = activeCategory
    ? TIME_SLOTS.filter((t) => {
        const m = slotToMinutes(t);
        return m >= firstSlotMinutes(activeCategory) && m <= lastSlotMinutes(activeCategory);
      })
    : TIME_SLOTS;
  const weeks = getCalendarGrid(calendarMonth);

  /* The hours shown under the calendar come from the same rows the slots
     above are filtered by, so the note can never disagree with what is
     actually bookable. (They were hardcoded strings before.) */
  const hoursNote =
    activeCategory?.opening_time && activeCategory?.last_slot
      ? `Open ${openDays(Number(activeCategory.closed_day ?? 0))}, ` +
        `${fmtTime(activeCategory.opening_time)} – ${closingTime(activeCategory.last_slot)}`
      : '';
  const latestClose = services.reduce((max, s) => Math.max(max, lastSlotMinutes(s)), 0);
  const closesEarly =
    !!activeCategory?.last_slot &&
    services.length > 1 &&
    lastSlotMinutes(activeCategory) < latestClose;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayISO = toLocalISO(new Date());

  /* Today stops being bookable once its final slot has passed, so the
     calendar doesn't offer a day with nothing left on it. Closed days
     are handled separately — a Sunday isn't "full", it's shut. */
  const todayIsFull =
    !!selectedService &&
    !isClosedOn(new Date(), activeCategory) &&
    minutesNow() + LEAD_TIME_MINUTES > lastSlotMinutes(activeCategory);

  const isCurrentMonth =
    calendarMonth.getFullYear() === today.getFullYear() &&
    calendarMonth.getMonth() === today.getMonth();

  /* A chosen time that has since been taken is no longer chosen, so a
     taken slot can never reach the submit. */
  const chosenTime = selectedTime && isSlotTaken(selectedTime) ? '' : selectedTime;

  const step = !selectedPet ? 1 : !selectedService ? 2 : !selectedDate ? 3 : 4;
  const canBook = !!(selectedPet && selectedService && selectedDate && chosenTime);

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

      /* Re-check availability at the moment of booking. The list on screen
         may be minutes old; another owner could have taken this time since.
         This is a friendly early exit — the unique index in the database
         (migration 027) is what actually guarantees no double booking. */
      const fresh = await fetchTakenTimes(selectedDate);
      if (fresh.failed) {
        setBookError('Couldn\u2019t check availability. Please try again.');
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
        service: selectedService,
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
        } else {
          setBookError('Something went wrong on our end. Please try again.');
        }
        return;
      }

      setConfirmation({
        pet: selectedPet.name,
        service: selectedService,
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
      setBookError('Couldn\u2019t reach the server. Check your connection and try again.');
    } finally {
      bookingLock.current = false;
      setIsBooking(false);
    }
  };

  const reset = () => {
    setBookSuccess(false);
    setConfirmation(null);
    setSelectedPet(null);
    setSelectedService('');
    setSelectedDate('');
    setSelectedTime('');
    setBookError('');
    setTaken(null);
  };

  const bookErrorNode = bookError ? (
    <View style={[styles.errorBox, canBook && styles.errorBoxInFooter]} accessibilityLiveRegion="polite">
      <Text style={styles.errorText}>{bookError}</Text>
    </View>
  ) : null;

  /* ── Footer ──
     Always there, so there is always a button to press. Until every
     choice is made it reads "Continue" and takes you to the next
     question (the next section appears below the one you're on, often
     out of sight). Greyed out until a pet is chosen. Once everything is
     chosen it becomes the real action. No footer when there are no pets
     to choose from: the card above already says what to do. */
  const showFooter = fetchingPets || pets.length > 0;
  const continueDisabled = isBooking || (!canBook && step === 1);
  const footerLine1 = canBook
    ? `${selectedPet.name} · ${selectedService}`
    : [selectedPet?.name, selectedService, selectedDate ? shortDate(selectedDate) : '']
        .filter(Boolean)
        .join(' · ') || 'Choose a pet to continue';
  const footerLine2 = canBook
    ? `${shortDate(selectedDate)} · ${chosenTime}`
    : NEXT_HINT[step];

  /* ── Success ── */
  if (bookSuccess && confirmation) {
    const summaryRows: [string, string][] = [
      ['Pet', confirmation.pet],
      ['Service', confirmation.service],
      ['Date', longDate(confirmation.date)],
      ['Time', confirmation.time],
    ];

    return (
      <View style={styles.container}>
        <StatusBar barStyle="dark-content" backgroundColor={colors.background} />
        <ScrollView
          contentContainerStyle={[styles.successWrap, { paddingBottom: bottomPad }]}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.successIcon}>
            <CalendarCheck size={sz(26)} color={colors.primary} strokeWidth={1.9} />
          </View>
          <Text style={styles.successTitle} accessibilityRole="header">Request sent</Text>
          <Text style={styles.successBody}>
            The clinic will confirm your slot shortly. You&apos;ll get a
            notification as soon as they do. Payment is collected in cash
            at the clinic.
          </Text>

          <View style={styles.summaryCard}>
            {summaryRows.map(([label, value], i) => (
              <View
                key={label}
                style={[
                  styles.summaryRow,
                  i < summaryRows.length - 1 && styles.summaryRowDivider,
                ]}
              >
                <Text style={styles.summaryLabel}>{label}</Text>
                <Text style={styles.summaryValue}>{value}</Text>
              </View>
            ))}
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
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.background} />

      <View style={styles.header}>
        <Text style={styles.title} accessibilityRole="header">Book a visit</Text>

        <StepBars step={step} />
      </View>

      <ScrollView
        ref={scrollRef}
        contentContainerStyle={[styles.scroll, { paddingBottom: bottomPad + footerH }]}
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

        {/* ── 1. Pet ── */}
        <View onLayout={(e) => { sectionY.current[1] = e.nativeEvent.layout.y; }}>
        <View style={styles.sectionHead}>
          <Text style={styles.sectionTitleInline}>Which pet?</Text>
          {pets.length > 0 && (
            <View style={styles.countBadge}>
              <Text style={styles.countBadgeText}>{pets.length}</Text>
            </View>
          )}
        </View>

        {fetchingPets ? (
          <View style={styles.petStrip} accessibilityLabel="Loading your pets">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} width={sz(76)} height={sz(76)} radius={sz(38)} />
            ))}
          </View>
        ) : pets.length === 0 ? (
          <TouchableOpacity
            style={styles.emptyCard}
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
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.petStrip}
            keyboardShouldPersistTaps="handled"
          >
            <TouchableOpacity
              style={styles.petStory}
              onPress={() => router.push('/(tabs)/pets' as any)}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="Add another pet"
            >
              <View style={styles.petAddCircle}>
                <Plus size={sz(26)} color={colors.primary} />
              </View>
              <Text style={styles.petStoryName} numberOfLines={1}>Add pet</Text>
            </TouchableOpacity>

            {pets.map((pet) => {
              const on = selectedPet?.id === pet.id;
              const metaParts = [pet.species, pet.breed, pet.age != null ? `${pet.age} yr` : null]
                .filter(Boolean);
              const storyMeta = [pet.species, pet.age != null ? `${pet.age} yr` : null]
                .filter(Boolean)
                .join(' · ');
              return (
                <TouchableOpacity
                  key={pet.id}
                  style={styles.petStory}
                  onPress={() => { setSelectedPet(pet); setBookError(''); }}
                  activeOpacity={0.8}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={`${pet.name}, ${metaParts.join(', ')}`}
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
                    {on && (
                      <View style={styles.petCheck}>
                        <Check size={sz(12)} color={colors.primaryFg} strokeWidth={3} />
                      </View>
                    )}
                  </View>
                  <Text style={[styles.petStoryName, on && styles.petStoryNameOn]} numberOfLines={1}>
                    {pet.name}
                  </Text>
                  {storyMeta ? (
                    <Text style={styles.petStoryMeta} numberOfLines={1}>{storyMeta}</Text>
                  ) : null}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}
        </View>

        {/* ── 2. Service ── */}
        {selectedPet && (
          <View style={styles.section} onLayout={(e) => { sectionY.current[2] = e.nativeEvent.layout.y; }}>
            <Text style={styles.sectionTitle}>What for?</Text>
            {services.length === 0 && !loadError ? (
              <Text style={styles.emptyNote}>No services are available to book right now.</Text>
            ) : (
              <View style={styles.serviceList}>
                {services.map((category: any) => {
                  const label = category.name;
                  const desc = category.description;
                  const on = selectedService === label;
                  return (
                    <TouchableOpacity
                      key={label}
                      style={[styles.serviceRow, on && styles.serviceRowOn]}
                      onPress={() => {
                        setSelectedService(label);
                        setSelectedTime('');
                        setBookError('');

                        if (selectedDate) {
                          const picked = new Date(selectedDate + 'T00:00:00');
                          // Also drop a "today" that this service has
                          // already closed for — the calendar would grey
                          // it out but it would stay selected.
                          const tooLateToday =
                            selectedDate === todayISO &&
                            minutesNow() + LEAD_TIME_MINUTES > lastSlotMinutes(category);
                          if (isClosedOn(picked, category) || tooLateToday) setSelectedDate('');
                        }
                      }}
                      activeOpacity={0.8}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: on }}
                      accessibilityLabel={desc ? `${label}. ${desc}` : label}
                    >
                      <View style={[styles.serviceIcon, on && styles.serviceIconOn]}>
                        <ServiceIcon name={label} size={sz(19)} color={on ? colors.primaryFg : colors.primary} strokeWidth={1.9} />
                      </View>
                      <View style={styles.serviceCopy}>
                        <Text style={[styles.serviceLabel, on && styles.serviceLabelOn]}>{label}</Text>
                        {desc ? <Text style={styles.serviceDesc}>{desc}</Text> : null}
                      </View>
                      {on && <Check size={sz(17)} color={colors.primary} strokeWidth={2.6} />}
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </View>
        )}

        {/* ── 3. Date ── */}
        {!!selectedService && (
          <View style={styles.section} onLayout={(e) => { sectionY.current[3] = e.nativeEvent.layout.y; }}>
            <Text style={styles.sectionTitle}>Which day?</Text>
            <View style={styles.calendar}>
              <View style={styles.calHead}>
                <TouchableOpacity
                  onPress={() => setCalendarMonth(new Date(
                    calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1))}
                  disabled={isCurrentMonth}
                  hitSlop={hitSlop}
                  style={[styles.calNav, isCurrentMonth && styles.calNavOff]}
                  accessibilityRole="button"
                  accessibilityLabel="Previous month"
                >
                  <ChevronLeft size={sz(17)} color={isCurrentMonth ? colors.border : colors.foreground} />
                </TouchableOpacity>

                <Text style={styles.calMonth}>
                  {MONTHS[calendarMonth.getMonth()]} {calendarMonth.getFullYear()}
                </Text>

                <TouchableOpacity
                  onPress={() => setCalendarMonth(new Date(
                    calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1))}
                  hitSlop={hitSlop}
                  style={styles.calNav}
                  accessibilityRole="button"
                  accessibilityLabel="Next month"
                >
                  <ChevronRight size={sz(17)} color={colors.foreground} />
                </TouchableOpacity>
              </View>

              <View style={styles.calWeekdays}>
                {WEEKDAYS.map((d) => (
                  <Text key={d} style={styles.calWeekday}>{d}</Text>
                ))}
              </View>

              {weeks.map((week, wi) => (
                <View key={wi} style={styles.calWeek}>
                  {week.map((date, di) => {
                    if (!date) return <View key={di} style={styles.calCell} />;

                    const iso = toLocalISO(date);
                    const past = date < today;
                    // Sunday for the clinic, Monday for grooming.
                    const closed = isClosedOn(date, activeCategory);
                    // Today, but every slot on it has already gone.
                    const tooLate = iso === todayISO && todayIsFull;
                    const on = selectedDate === iso;
                    const disabled = past || closed || tooLate;

                    return (
                      <TouchableOpacity
                        key={di}
                        style={styles.calCell}
                        disabled={disabled}
                        onPress={() => {
                          setSelectedDate(iso);
                          setSelectedTime('');
                          setBookError('');
                        }}
                        activeOpacity={0.7}
                        accessibilityRole="button"
                        accessibilityLabel={longDate(iso)}
                        accessibilityState={{ disabled, selected: on }}
                      >
                        <View style={[styles.calDay, on && styles.calDayOn]}>
                          <Text style={[
                            styles.calDayText,
                            disabled && styles.calDayTextOff,
                            on && styles.calDayTextOn,
                          ]}>
                            {date.getDate()}
                          </Text>
                          {iso === todayISO && !on && <View style={styles.calToday} />}
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ))}

              {(hoursNote || todayIsFull) ? (
                <View style={styles.calNote}>
                  <AlertCircle size={sz(12)} color={colors.mutedFg} />
                  <Text style={styles.calNoteText}>
                    {hoursNote}
                    {todayIsFull ? `${hoursNote ? ' · ' : ''}today is fully booked out` : ''}
                  </Text>
                </View>
              ) : null}
            </View>
          </View>
        )}

        {/* ── 4. Time ── */}
        {!!selectedDate && (
          <View style={styles.section} onLayout={(e) => { sectionY.current[4] = e.nativeEvent.layout.y; }}>
            <Text style={styles.sectionTitle}>What time?</Text>

            {loadingTimes ? (
              <View style={styles.slotGrid} accessibilityLabel="Checking availability">
                {Array.from({ length: 8 }).map((_, i) => (
                  <Skeleton key={i} width={slotWidth} height={46} radius={radius.md} />
                ))}
              </View>
            ) : timesFailed ? (
              /* A failed check must not look like a free day — that would
                 let someone pick a slot that's already taken. The times
                 stay hidden until the check succeeds. */
              <View style={styles.inlineError} accessibilityLiveRegion="polite">
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
                <View style={styles.slotGrid}>
                  {slots.map((slot) => {
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
                        onPress={() => { setSelectedTime(slot); setBookError(''); }}
                        activeOpacity={0.8}
                        accessibilityRole="button"
                        accessibilityLabel={unavailable ? `${slot}, unavailable` : slot}
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
                        >
                          {slot}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* A grid of struck-through times with no explanation
                    reads as broken. Say why. */}
                {selectedDate === todayISO && (
                  <View style={styles.calNote}>
                    <Clock size={sz(12)} color={colors.mutedFg} />
                    <Text style={styles.calNoteText}>
                      Times that have passed today aren&apos;t available.
                      Bookings need {LEAD_TIME_MINUTES} minutes&apos; notice.
                    </Text>
                  </View>
                )}

                {closesEarly && (
                  <View style={styles.calNote}>
                    <Clock size={sz(12)} color={colors.mutedFg} />
                    <Text style={styles.calNoteText}>
                      {activeCategory.name} closes at {closingTime(activeCategory.last_slot)},
                      earlier than the rest of the clinic.
                    </Text>
                  </View>
                )}
              </>
            )}
          </View>
        )}

        {!canBook && bookErrorNode}
      </ScrollView>

      {/* ── Footer ── */}
      {showFooter && (
         <View
            style={[styles.footer, { bottom: bottomPad - 24, paddingBottom: space.lg }]}
            onLayout={(e) => setFooterH(e.nativeEvent.layout.height)}
          >
            {bookErrorNode}
            <View style={styles.footerSummary}>
            <Text style={styles.footerPet} numberOfLines={2}>{footerLine1}</Text>
            {footerLine2 ? <Text style={styles.footerWhen} numberOfLines={2}>{footerLine2}</Text> : null}
          </View>

          <TouchableOpacity
            style={[
              styles.primaryBtn,
              styles.footerBtn,
              isBooking && styles.primaryBtnLoading,
              continueDisabled && !isBooking && common.buttonPrimaryDisabled,
            ]}
            onPress={canBook ? handleContinue : () => scrollToSection(step)}
            disabled={continueDisabled}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={canBook ? 'Request this slot' : 'Continue'}
            accessibilityState={{ disabled: continueDisabled, busy: isBooking }}
          >
            {isBooking ? (
              <ActivityIndicator color={colors.primaryFg} />
            ) : (
              <Text
                style={[
                  styles.primaryLabel,
                  continueDisabled && common.buttonPrimaryTextDisabled,
                ]}
              >
                {canBook ? 'Request this slot' : 'Continue'}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { ...common.screen },

  /* Same title and top spacing as Profile: just under the status bar. */
  header: {
    paddingHorizontal: space.xxl,
    paddingTop: space.xs,
    paddingBottom: space.md,
    backgroundColor: colors.background,
  },
  title: {
    fontFamily: text.bodyBold.fontFamily,
    fontSize: 24,
    lineHeight: 28,
    letterSpacing: 0,
    color: colors.foreground,
  },

  /* Story-style progress: four bars across the top. Navy once a step is
     done or in progress, soft green-gray until then. */
  stepBars: { flexDirection: 'row', gap: 6, marginTop: space.lg },
  stepBar: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(93, 121, 118, 0.22)',
  },
  stepBarOn: { backgroundColor: colors.primary },
  stepMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: space.sm,
  },
  stepMetaText: { ...text.caption, color: colors.mutedFg },
  stepMetaLabel: { ...text.caption, fontFamily: text.bodyBold.fontFamily, color: colors.primary },

  scroll: { paddingHorizontal: space.xxl, paddingTop: space.xl },
  section: { marginTop: space.xl },

  inlineError: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    backgroundColor: status.danger.bg,
    borderRadius: radius.md,
    padding: space.md,
    marginBottom: space.md,
  },
  inlineErrorText: { ...text.small, color: status.danger.fg, flex: 1 },
  inlineErrorRetry: { ...text.smallBold, color: status.danger.fg, textDecorationLine: 'underline' },

  /* Same heading style as Profile ("My Pets", "Account"). */
  sectionTitle: {
    ...text.section,
    color: colors.foreground,
    marginBottom: space.lg,
  },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    marginBottom: space.lg,
  },
  sectionTitleInline: { ...text.section, color: colors.foreground },
  /* Navy count bubble beside a heading, as on Profile. */
  countBadge: {
    minWidth: sz(26),
    height: sz(26),
    borderRadius: sz(13),
    paddingHorizontal: 7,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countBadgeText: { ...text.smallBold, color: colors.primaryFg },

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

  /* Pets are a row of round photos, the same strip as "My Pets" on
     Profile. Pick one: the ring turns gold and a check appears. Scrolls
     sideways when there are more pets than fit. */
  petStrip: { gap: space.md, paddingRight: space.xxl },
  petStory: { width: sz(84), alignItems: 'center' },
  petRing: {
    width: sz(76),
    height: sz(76),
    borderRadius: sz(38),
    borderWidth: 2,
    borderColor: colors.primary,
    padding: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  petRingOn: { borderColor: colors.accent, borderWidth: 3.5, padding: 2 },
  petPhoto: { width: sz(64), height: sz(64), borderRadius: sz(32), backgroundColor: colors.muted },
  petPhotoFallback: {
    width: sz(64),
    height: sz(64),
    borderRadius: sz(32),
    backgroundColor: colors.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  petInitial: {
    ...text.title,
    color: colors.primary,
  },
  petCheck: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: sz(24),
    height: sz(24),
    borderRadius: sz(12),
    backgroundColor: colors.primary,
    borderWidth: 2,
    borderColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  petAddCircle: {
    width: sz(76),
    height: sz(76),
    borderRadius: sz(38),
    backgroundColor: colors.muted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  petStoryName: { ...text.bodyBold, color: colors.foreground, marginTop: space.sm, maxWidth: sz(84) },
  petStoryNameOn: { color: colors.primary },
  petStoryMeta: { ...text.small, color: colors.mutedFg, maxWidth: sz(84) },

  serviceList: { gap: space.sm },
  serviceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.lg,
    padding: space.lg,
    borderRadius: radius.xl,
    borderWidth: 1.5,
    borderColor: colors.cardBorder,
    backgroundColor: colors.card,
  },
  serviceRowOn: { borderColor: colors.primary, backgroundColor: colors.secondary },
  serviceIcon: {
    width: sz(42),
    height: sz(42),
    borderRadius: radius.md,
    backgroundColor: colors.muted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  serviceIconOn: { backgroundColor: colors.primary },
  serviceCopy: { flex: 1 },
  serviceLabel: { ...text.bodyBold, color: colors.foreground },
  serviceLabelOn: { color: colors.primary },
  serviceDesc: { ...text.caption, color: colors.mutedFg, marginTop: 1 },

  calendar: { ...common.card, padding: space.lg },
  calHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: space.lg,
  },
  calNav: {
    width: sz(34),
    height: sz(34),
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.muted,
  },
  calNavOff: { backgroundColor: 'transparent' },
  calMonth: { ...text.bodyBold, color: colors.foreground },
  calWeekdays: { flexDirection: 'row', marginBottom: space.sm },
  calWeekday: {
    flex: 1,
    textAlign: 'center',
    ...text.caption,
    fontSize: sz(10),
    color: colors.mutedFg,
  },
  calWeek: { flexDirection: 'row' },
  calCell: { flex: 1, aspectRatio: 1, alignItems: 'center', justifyContent: 'center' },
  calDay: {
    width: sz(36),
    height: sz(36),
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  calDayOn: { backgroundColor: colors.primary },
  calDayText: { ...text.small, color: colors.foreground },
  calDayTextOff: { color: colors.border },
  calDayTextOn: { color: colors.primaryFg, fontFamily: text.bodyBold.fontFamily },
  /* Small navy dot under today's number. */
  calToday: {
    position: 'absolute',
    bottom: 3,
    width: sz(5),
    height: sz(5),
    borderRadius: 3,
    backgroundColor: colors.primary,
  },
  calNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: space.md,
  },
  calNoteText: { ...text.caption, color: colors.mutedFg, flex: 1 },

  slotGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  slot: {
    paddingHorizontal: 4,
    paddingVertical: space.md,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.cardBorder,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  slotOn: { borderColor: colors.primary, backgroundColor: colors.primary, ...shadow.primary },
  slotTaken: { backgroundColor: colors.muted, borderColor: 'transparent' },
  slotText: { ...text.small, fontSize: sz(12.5), color: colors.foreground },
  slotTextOn: { color: colors.primaryFg, fontFamily: text.bodyBold.fontFamily },
  /* Struck through rather than merely greyed — grey alone reads as
     "unselected", not "unavailable". */
  slotTextTaken: { color: colors.mutedFg, textDecorationLine: 'line-through' },

  errorBox: {
    marginTop: space.xl,
    borderWidth: 1,
    borderColor: colors.destructive,
    backgroundColor: colors.destructiveBg,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderRadius: radius.md,
  },
  errorBoxInFooter: { marginTop: 0, marginBottom: space.md },
  errorText: { ...text.small, color: status.danger.fg },

  /* `bottom` is set where the footer renders, from useTabBarClearance(),
     so it follows the device's navigation bar. */
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    marginHorizontal: space.xxl,
    padding: space.lg,
    borderRadius: radius.card,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    ...shadow.raised,
  },
  footerSummary: { marginBottom: space.md },
  footerPet: { ...text.smallBold, color: colors.foreground },
  footerWhen: { ...text.caption, color: colors.mutedFg, marginTop: 1 },
  footerBtn: { marginTop: 0 },

  primaryBtn: { ...common.buttonPrimary, ...shadow.primary },
  primaryBtnLoading: { backgroundColor: colors.primaryDark },
  primaryLabel: { ...common.buttonPrimaryText },
  ghostBtn: { ...common.buttonGhost },
  ghostLabel: { ...common.buttonGhostText },

  /* ── "Request sent" ──
     Starts at the top like Profile instead of sitting in the middle of
     the screen. Icon circle, summary rows and buttons all use the same
     tokens as the Profile tiles. */
  successWrap: {
    flexGrow: 1,
    paddingHorizontal: space.xxl,
    paddingTop: space.xxl,
  },
  successIcon: {
    width: sz(56),
    height: sz(56),
    borderRadius: sz(28),
    backgroundColor: colors.muted,
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
  },
  successBody: { ...text.body, color: colors.mutedFg, marginTop: space.md },
  summaryCard: {
    ...common.card,
    marginTop: space.xxl,
    paddingHorizontal: space.xl,
    paddingVertical: space.xs,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: space.lg,
    paddingVertical: 15,
  },
  summaryRowDivider: { borderBottomWidth: 1, borderBottomColor: colors.border },
  summaryLabel: { ...text.small, color: colors.mutedFg, flexShrink: 0 },
  summaryValue: { ...text.smallBold, color: colors.foreground, flexShrink: 1, textAlign: 'right' },
  successActions: { marginTop: space.xxl, gap: space.md },
});
