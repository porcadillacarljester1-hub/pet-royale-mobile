import { useState, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity, RefreshControl, Alert, Linking, Modal, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { fetchInvoiceForAppointment, type MobileInvoice } from '@/lib/invoices';
import { rescheduleAppointment, fetchAppointmentById } from '@/lib/notificationActions';
import { useFocusEffect, useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const TEAL = '#0D9488';
const TEAL_LIGHT = '#CCFBF1';
const ORANGE = '#F97316';
const ORANGE_LIGHT = '#FFEDD5';
const PURPLE = '#7C3AED';
const PURPLE_LIGHT = '#EDE9FE';
const BORDER = '#E5E7EB';
const SUB = '#6B7280';
const INK = '#111827';
const BG = '#F4F7FB';

const services = [
  { label: 'Veterinary Check-ups',         desc: 'General health exam',        icon: 'heart'             as const, color: '#DC2626' },
  { label: 'Vaccination & Deworming',      desc: 'Core vaccines & deworming',  icon: 'medical'           as const, color: TEAL },
  { label: 'Grooming',                     desc: 'Bath, cut & nails',          icon: 'cut'               as const, color: PURPLE },
  { label: 'Minor & Major Surgeries',      desc: 'By assessment',              icon: 'bandage'           as const, color: ORANGE },
  { label: 'Confinement & Emergency Care', desc: 'Priority triage · 24/7',     icon: 'shield-checkmark'  as const, color: '#0891B2' },
];

const timeSlots = [
  '08:30 AM', '09:00 AM', '09:30 AM', '10:00 AM',
  '10:30 AM', '11:00 AM', '11:30 AM', '12:00 PM',
  '12:30 PM', '01:00 PM', '01:30 PM', '02:00 PM',
  '02:30 PM', '03:00 PM', '03:30 PM', '04:00 PM',
  '04:30 PM', '05:00 PM', '05:30 PM', '06:00 PM',
  '06:30 PM',
];

const groomingTimeSlots = [
  '08:30 AM', '09:00 AM', '09:30 AM', '10:00 AM',
  '10:30 AM', '11:00 AM', '11:30 AM', '12:00 PM',
  '12:30 PM', '01:00 PM', '01:30 PM', '02:00 PM',
  '02:30 PM', '03:00 PM', '03:30 PM', '04:00 PM',
  '04:30 PM', '05:00 PM', '05:30 PM',
];

const WEEKDAY_LABELS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export default function AppointmentsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { openBooking: openBookingParam, service: serviceParam, reschedule: rescheduleParam, appointmentId: appointmentIdParam } =
    useLocalSearchParams<{ openBooking?: string; service?: string; reschedule?: string; appointmentId?: string }>();

  const [appointments, setAppointments] = useState<any[]>([]);
  const [petPhotos, setPetPhotos] = useState<Record<string, string | null>>({});
  const [invoices, setInvoices] = useState<Record<string, MobileInvoice | null>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [payingId, setPayingId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'upcoming' | 'past'>('upcoming');

  // ── Booking form state ──
  const [showBooking, setShowBooking] = useState(false);
  const [pets, setPets] = useState<any[]>([]);
  const [selectedPet, setSelectedPet] = useState<any>(null);
  const [selectedService, setSelectedService] = useState('');
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedTime, setSelectedTime] = useState('');
  const [isBooking, setIsBooking] = useState(false);
  const [isFetchingPets, setIsFetchingPets] = useState(true);
  const [bookError, setBookError] = useState('');
  const [bookSuccess, setBookSuccess] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [takenTimes, setTakenTimes] = useState<string[]>([]);
  const [loadingTimes, setLoadingTimes] = useState(false);

  const [showReschedule, setShowReschedule] = useState(false);
  const [rescheduleTarget, setRescheduleTarget] = useState<any>(null);
  const [rescheduleDate, setRescheduleDate] = useState('');
  const [rescheduleTime, setRescheduleTime] = useState('');
  const [rescheduleMonth, setRescheduleMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [isRescheduling, setIsRescheduling] = useState(false);
  const [rescheduleError, setRescheduleError] = useState('');
  const [rescheduleSuccess, setRescheduleSuccess] = useState(false);

  const [summaryTarget, setSummaryTarget] = useState<any>(null);

  const fetchAppointments = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data, error } = await (supabase as any)
      .from('appointments')
      .select('*')
      .eq('client_id', user.id.toString())
      .order('created_at', { ascending: false });

    if (!error) {
      const list = data || [];
      setAppointments(list);

      const petIds = [...new Set(list.map((a: any) => a.pet_id).filter(Boolean))];
      if (petIds.length > 0) {
        const { data: petsData } = await (supabase as any)
          .from('pets')
          .select('id, photo_url')
          .in('id', petIds);
        const photoMap: Record<string, string | null> = {};
        (petsData || []).forEach((p: any) => { photoMap[p.id] = p.photo_url; });
        setPetPhotos(photoMap);
      }

      const relevantIds = list.filter((a: any) => a.status !== 'incoming').map((a: any) => a.id);
      const invoiceEntries = await Promise.all(
        relevantIds.map(async (id: string) => [id, await fetchInvoiceForAppointment(id)] as const)
      );
      setInvoices(Object.fromEntries(invoiceEntries));
    }
    setIsLoading(false);
    setRefreshing(false);
  };

  const fetchUserPets = async () => {
    setIsFetchingPets(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setIsFetchingPets(false); return; }
    const { data, error } = await (supabase as any)
      .from('pets').select('*').eq('owner_id', user.id)
      .order('created_at', { ascending: false });
    if (!error && data) setPets(data);
    setIsFetchingPets(false);
  };

  // Real conflict check: same date + same service already booked (scoped this way since
  // there's no staff/resource field to check true clinic-wide availability across services)
  const fetchTakenTimes = async (date: string, service: string) => {
    setLoadingTimes(true);
    const { data, error } = await (supabase as any)
      .from('appointments')
      .select('scheduled_time')
      .eq('requested_date', date)
      .eq('service', service)
      .in('status', ['incoming', 'confirmed']);
    if (!error) {
      setTakenTimes((data || []).map((a: any) => a.scheduled_time).filter(Boolean));
    }
    setLoadingTimes(false);
  };

  useEffect(() => {
    if (selectedDate && selectedService) {
      fetchTakenTimes(selectedDate, selectedService);
    } else {
      setTakenTimes([]);
    }
  }, [selectedDate, selectedService]);

  useFocusEffect(useCallback(() => { fetchAppointments(); }, []));

  useFocusEffect(
    useCallback(() => {
      if (rescheduleParam === '1' && appointmentIdParam) {
        (async () => {
          try {
            const appt = await fetchAppointmentById(appointmentIdParam);
            openReschedule(appt);
          } catch {
            Alert.alert('Error', 'Could not load that appointment.');
          }
          router.setParams({ reschedule: undefined, appointmentId: undefined } as any);
        })();
      }
    }, [rescheduleParam, appointmentIdParam])
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchAppointments();
  };

  const openBooking = (presetService?: string) => {
    setBookError('');
    setBookSuccess(false);
    setSelectedPet(null);
    setSelectedService(presetService || '');
    setSelectedDate('');
    setSelectedTime('');
    setTakenTimes([]);
    const today = new Date();
    setCalendarMonth(new Date(today.getFullYear(), today.getMonth(), 1));
    fetchUserPets();
    setShowBooking(true);
  };

  useFocusEffect(
    useCallback(() => {
      if (openBookingParam === '1') {
        openBooking(serviceParam);
        router.setParams({ openBooking: undefined, service: undefined } as any);
      }
    }, [openBookingParam, serviceParam])
  );

  const handleCancelAppointment = (appointmentId: string) => {
    Alert.alert('Cancel Appointment', 'Are you sure you want to cancel this appointment?', [
      { text: 'Keep It', style: 'cancel' },
      {
        text: 'Cancel Appointment',
        style: 'destructive',
        onPress: async () => {
          const { error } = await (supabase as any)
            .from('appointments')
            .delete()
            .eq('id', appointmentId);

          if (!error) {
            Alert.alert('Cancelled', 'Appointment has been deleted.');
            fetchAppointments();
          } else {
            Alert.alert('Error', 'Failed to cancel appointment.');
          }
        },
      },
    ]);
  };

  const handlePayNow = async (appointmentId: string) => {
    const invoice = invoices[appointmentId];
    if (!invoice?.checkout_url) return;

    setPayingId(appointmentId);
    try {
      const canOpen = await Linking.canOpenURL(invoice.checkout_url);
      if (canOpen) {
        await Linking.openURL(invoice.checkout_url);
      } else {
        Alert.alert('Error', 'Unable to open payment page.');
      }
    } finally {
      setPayingId(null);
    }
  };

  const formatDateValue = (date: Date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

  const isDayClosed = (date: Date, serviceLabel: string) => {
    const day = date.getDay();
    const isGrooming = serviceLabel === 'Grooming';
    return isGrooming ? day === 1 : day === 0;
  };

  const isPastDate = (date: Date) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return date < today;
  };

  const isBeyondBookingWindow = (date: Date) => {
    const today = new Date();
    const maxDate = new Date(today);
    maxDate.setDate(today.getDate() + 30);
    return date > maxDate;
  };

  const getCalendarGrid = (monthDate: Date) => {
    const year = monthDate.getFullYear();
    const month = monthDate.getMonth();
    const firstOfMonth = new Date(year, month, 1);
    const firstWeekday = (firstOfMonth.getDay() + 6) % 7;
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const cells: (Date | null)[] = [];
    for (let i = 0; i < firstWeekday; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
    while (cells.length % 7 !== 0) cells.push(null);

    const weeks: (Date | null)[][] = [];
    for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
    return weeks;
  };

  const goToPrevMonth = () => {
    const prev = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1);
    const today = new Date();
    const minMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    if (prev >= minMonth) setCalendarMonth(prev);
  };
  const goToNextMonth = () => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1));
  const goToPrevRescheduleMonth = () => {
    const prev = new Date(rescheduleMonth.getFullYear(), rescheduleMonth.getMonth() - 1, 1);
    const today = new Date();
    const minMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    if (prev >= minMonth) setRescheduleMonth(prev);
  };
  const goToNextRescheduleMonth = () => setRescheduleMonth(new Date(rescheduleMonth.getFullYear(), rescheduleMonth.getMonth() + 1, 1));

  const handleBook = async () => {
    setIsBooking(true);
    setBookError('');

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setBookError('You must be logged in.'); setIsBooking(false); return; }

    const { error: bookingError } = await (supabase as any)
      .from('appointments')
      .insert([{
        client_id: user.id,
        client_name: user.user_metadata?.full_name || user.email,
        pet_id: selectedPet.id,
        pet_name: selectedPet.name,
        pet_species: selectedPet.species,
        service: selectedService,
        requested_date: selectedDate,
        scheduled_time: selectedTime,
        status: 'incoming',
      }]);

    setIsBooking(false);
    if (bookingError) { setBookError(`Failed to book: ${bookingError.message}`); return; }

    setBookSuccess(true);
    fetchAppointments();
  };

  const openReschedule = (appt: any) => {
    setRescheduleTarget(appt);
    setRescheduleDate('');
    setRescheduleTime('');
    setRescheduleError('');
    setRescheduleSuccess(false);
    const today = new Date();
    setRescheduleMonth(new Date(today.getFullYear(), today.getMonth(), 1));
    setShowReschedule(true);
  };
  const closeReschedule = () => { setShowReschedule(false); setRescheduleTarget(null); };

  const handleReschedule = async () => {
    if (!rescheduleDate) { setRescheduleError('Please select a date.'); return; }
    if (!rescheduleTime) { setRescheduleError('Please select a time.'); return; }
    setIsRescheduling(true);
    setRescheduleError('');
    try {
      await rescheduleAppointment(rescheduleTarget.id, rescheduleDate, rescheduleTime);
      setRescheduleSuccess(true);
      fetchAppointments();
    } catch (err: any) {
      setRescheduleError(err?.message || 'Failed to reschedule. Please try again.');
    } finally {
      setIsRescheduling(false);
    }
  };

  const rescheduleAvailableSlots = rescheduleTarget?.service === 'Grooming' ? groomingTimeSlots : timeSlots;
  const availableTimeSlots = selectedService === 'Grooming' ? groomingTimeSlots : timeSlots;

  const getStatus = (status: string) => {
    switch (status) {
      case 'incoming':  return { color: ORANGE, bg: ORANGE_LIGHT, label: 'Awaiting confirmation' };
      case 'confirmed': return { color: TEAL,   bg: TEAL_LIGHT,   label: 'Confirmed' };
      case 'completed': return { color: PURPLE, bg: PURPLE_LIGHT, label: 'Completed' };
      default:          return { color: SUB,    bg: '#F3F4F6',    label: status };
    }
  };

  const getSpeciesColor = (species: string) => {
    const s = species?.toLowerCase().trim() || '';
    if (s.includes('dog')) return ORANGE;
    if (s.includes('cat')) return PURPLE;
    if (s.includes('bird')) return '#2563EB';
    if (s.includes('rabbit')) return TEAL;
    return TEAL;
  };

  const upcoming = appointments.filter(a => a.status !== 'completed');
  const past = appointments.filter(a => a.status === 'completed');
  const displayed = activeTab === 'upcoming' ? upcoming : past;

  const pendingPayments = upcoming
    .map(a => ({ appt: a, invoice: invoices[a.id] }))
    .filter(x => x.invoice?.status === 'pending_payment');
  const outstandingTotal = pendingPayments.reduce((sum, x) => sum + (x.invoice?.total_amount || 0), 0);

  const petNames = [...new Set(appointments.map(a => a.pet_name).filter(Boolean))];
  const subtitlePets = petNames.length > 0 ? petNames.join(' and ') : 'your pets';

  const AppointmentCard = ({ item }: { item: any }) => {
    const status = getStatus(item.status);
    const isCompleted = item.status === 'completed';
    const invoice = invoices[item.id];
    const isPaid = invoice?.status === 'paid';
    const canPay = invoice?.status === 'pending_payment' && !!invoice.checkout_url;
    const canCancel = item.status === 'incoming';
    const canReschedule = !isCompleted && invoice?.status !== 'pending_payment';
    const photoUrl = item.pet_id ? petPhotos[item.pet_id] : null;
    const speciesColor = getSpeciesColor(item.pet_species);

    const formattedDate = item.requested_date
      ? new Date(item.requested_date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
      : '';

    return (
      <View style={styles.card}>
        <View style={styles.cardTop}>
          <View style={[styles.statusBadge, { backgroundColor: status.bg }]}>
            <View style={[styles.statusDot, { backgroundColor: status.color }]} />
            <Text style={[styles.statusText, { color: status.color }]}>{status.label}</Text>
          </View>
          {photoUrl ? (
            <Image source={{ uri: photoUrl }} style={styles.petPhoto} />
          ) : (
            <View style={[styles.petPhotoFallback, { backgroundColor: speciesColor + '18' }]}>
              <Ionicons name="paw" size={16} color={speciesColor} />
            </View>
          )}
        </View>

        <Text style={styles.serviceName}>{item.service}</Text>
        <Text style={styles.petLine}>{item.pet_name} · {item.pet_species}</Text>

        <View style={styles.metaRow}>
          <View style={styles.metaItem}>
            <Ionicons name="calendar-outline" size={13} color={SUB} />
            <Text style={styles.metaText}>{formattedDate}</Text>
          </View>
          <View style={styles.metaItem}>
            <Ionicons name="time-outline" size={13} color={SUB} />
            <Text style={styles.metaText}>{item.scheduled_time || '—'}</Text>
          </View>
        </View>

        {isCompleted ? (
          <TouchableOpacity style={styles.summaryLink} onPress={() => setSummaryTarget({ ...item, invoice })}>
            <View style={styles.summaryDivider} />
            <Text style={styles.summaryLinkText}>View summary & receipt</Text>
          </TouchableOpacity>
        ) : (
          <>
            {canPay && (
              <>
                <View style={styles.balanceRow}>
                  <Text style={styles.balanceLabel}>Balance due</Text>
                  <Text style={styles.balanceAmount}>₱{invoice!.total_amount.toLocaleString()}</Text>
                </View>
                <TouchableOpacity style={styles.payBtn} onPress={() => handlePayNow(item.id)} disabled={payingId === item.id}>
                  <Ionicons name="card-outline" size={15} color="#fff" />
                  <Text style={styles.payBtnText}>{payingId === item.id ? 'Opening...' : 'Pay Now'}</Text>
                </TouchableOpacity>
              </>
            )}

            {isPaid && (
              <View style={styles.paidBanner}>
                <Ionicons name="checkmark-circle" size={14} color={TEAL} />
                <Text style={styles.paidBannerText}>Paid — ₱{invoice!.total_amount.toLocaleString()}</Text>
              </View>
            )}

            {(canReschedule || canCancel) && (
              <View style={styles.actionsRow}>
                {canReschedule && (
                  <TouchableOpacity style={[styles.rescheduleBtn, !canCancel && { flex: 1 }]} onPress={() => openReschedule(item)}>
                    <Text style={styles.rescheduleBtnText}>Reschedule</Text>
                  </TouchableOpacity>
                )}
                {canCancel && (
                  <TouchableOpacity style={[styles.cancelBtn, !canReschedule && { flex: 1 }]} onPress={() => handleCancelAppointment(item.id)}>
                    <Ionicons name="close" size={13} color="#DC2626" />
                    <Text style={styles.cancelBtnText}>Cancel</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </>
        )}
      </View>
    );
  };

  const calendarWeeks = getCalendarGrid(calendarMonth);
  const rescheduleWeeks = getCalendarGrid(rescheduleMonth);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const isCurrentMonth = calendarMonth.getFullYear() === today.getFullYear() && calendarMonth.getMonth() === today.getMonth();
  const isCurrentRescheduleMonth = rescheduleMonth.getFullYear() === today.getFullYear() && rescheduleMonth.getMonth() === today.getMonth();

  return (
    <View style={styles.container}>
      {/* ── Header ── */}
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Appointments</Text>
          <Text style={styles.headerSub}>Manage visits for {subtitlePets}</Text>
        </View>
        <TouchableOpacity style={styles.bookBtn} onPress={() => openBooking()} activeOpacity={0.85}>
          <Ionicons name="add" size={16} color="#fff" />
          <Text style={styles.bookBtnText}>Book</Text>
        </TouchableOpacity>
      </View>

      {/* ── Tabs ── */}
      <View style={styles.tabsWrap}>
        <TouchableOpacity style={[styles.tab, activeTab === 'upcoming' && styles.tabActive]} onPress={() => setActiveTab('upcoming')}>
          <Text style={[styles.tabText, activeTab === 'upcoming' && styles.tabTextActive]}>Upcoming</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tab, activeTab === 'past' && styles.tabActive]} onPress={() => setActiveTab('past')}>
          <Text style={[styles.tabText, activeTab === 'past' && styles.tabTextActive]}>Past</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={TEAL} />}
      >
        {isLoading ? (
          <ActivityIndicator size="large" color={TEAL} style={{ marginTop: 48 }} />
        ) : (
          <>
            {activeTab === 'upcoming' && pendingPayments.length > 0 && (
              <View style={styles.balanceBanner}>
                <View>
                  <Text style={styles.balanceBannerTitle}>Outstanding balance</Text>
                  <Text style={styles.balanceBannerSub}>
                    {pendingPayments.length} appointment{pendingPayments.length !== 1 ? 's' : ''} awaiting payment
                  </Text>
                </View>
                <Text style={styles.balanceBannerAmount}>₱{outstandingTotal.toLocaleString()}</Text>
              </View>
            )}

            {displayed.length === 0 ? (
              <View style={styles.empty}>
                <View style={styles.emptyIconWrap}>
                  <Ionicons name={activeTab === 'upcoming' ? 'calendar-outline' : 'checkmark-done-outline'} size={30} color="#fff" />
                </View>
                <Text style={styles.emptyTitle}>
                  {activeTab === 'upcoming' ? 'No Upcoming Appointments' : 'No Past Appointments'}
                </Text>
                <Text style={styles.emptyText}>
                  {activeTab === 'upcoming' ? 'Book an appointment to get started!' : 'Completed visits will show up here.'}
                </Text>
                {activeTab === 'upcoming' && (
                  <TouchableOpacity style={styles.emptyBtn} onPress={() => openBooking()} activeOpacity={0.85}>
                    <Text style={styles.emptyBtnText}>Book Appointment</Text>
                  </TouchableOpacity>
                )}
              </View>
            ) : (
              displayed.map(item => <AppointmentCard key={item.id} item={item} />)
            )}
          </>
        )}
        <View style={{ height: 24 }} />
      </ScrollView>

      {/* ══════════════════════════ Booking (single scroll) ══════════════════════════ */}
      <Modal visible={showBooking} animationType="slide" onRequestClose={() => setShowBooking(false)}>
        <View style={styles.bookContainer}>
          <View style={[styles.bookHeader, { paddingTop: insets.top + 8 }]}>
            <TouchableOpacity onPress={() => setShowBooking(false)} style={styles.bookCloseBtn}>
              <Ionicons name="chevron-back" size={22} color={INK} />
            </TouchableOpacity>
            <Text style={styles.bookHeaderTitle}>Book Appointment</Text>
            <View style={{ width: 36 }} />
          </View>

          {bookSuccess ? (
            <View style={styles.successContainer}>
              <View style={styles.successIconWrap}><Ionicons name="checkmark" size={40} color="#fff" /></View>
              <Text style={styles.successTitle}>Appointment Requested!</Text>
              <Text style={styles.successText}>
                We've sent your request to the clinic.{'\n'}You'll be notified once it's confirmed, and staff will finalize pricing based on your pet's visit.
              </Text>
              <TouchableOpacity style={styles.successBtn} onPress={() => setShowBooking(false)} activeOpacity={0.85}>
                <Text style={styles.successBtnText}>Done</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.successBtnOutline} onPress={() => openBooking()} activeOpacity={0.85}>
                <Text style={styles.successBtnOutlineText}>Book Another</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <ScrollView style={styles.bookScroll} showsVerticalScrollIndicator={false}>
                <View style={styles.form}>
                  {bookError ? (
                    <View style={styles.errorBox}>
                      <Ionicons name="alert-circle-outline" size={16} color="#DC2626" />
                      <Text style={styles.errorText}>{bookError}</Text>
                    </View>
                  ) : null}

                  {/* ── Select Pet ── */}
                  <Text style={styles.label}>Select Pet</Text>
                  {isFetchingPets ? (
                    <ActivityIndicator color={TEAL} style={{ marginVertical: 12 }} />
                  ) : pets.length === 0 ? (
                    <View style={styles.emptyPets}>
                      <Ionicons name="paw-outline" size={28} color={SUB} />
                      <Text style={styles.emptyPetsText}>No pets registered yet</Text>
                      <TouchableOpacity style={styles.addPetBtn} onPress={() => { setShowBooking(false); router.push('/(tabs)/pets' as any); }} activeOpacity={0.85}>
                        <Text style={styles.addPetBtnText}>Add a Pet First</Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <View style={styles.petPillRow}>
                      {pets.map((pet) => (
                        <TouchableOpacity
                          key={pet.id}
                          style={[styles.petPillCard, selectedPet?.id === pet.id && styles.petPillCardActive]}
                          onPress={() => setSelectedPet(pet)}
                          activeOpacity={0.85}
                        >
                          {pet.photo_url ? (
                            <Image source={{ uri: pet.photo_url }} style={styles.petPillPhoto} />
                          ) : (
                            <View style={styles.petPillPhotoFallback}><Ionicons name="paw" size={20} color={TEAL} /></View>
                          )}
                          <Text style={styles.petPillName} numberOfLines={1}>{pet.name}</Text>
                          <Text style={styles.petPillBreed} numberOfLines={1}>{pet.breed || pet.species}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}

                  {/* ── Appointment Type ── */}
                  <Text style={[styles.label, { marginTop: 24 }]}>Appointment Type</Text>
                  <View style={{ gap: 10 }}>
                    {services.map((svc) => (
                      <TouchableOpacity
                        key={svc.label}
                        style={[styles.serviceRow, selectedService === svc.label && { borderColor: svc.color, backgroundColor: svc.color + '0D' }]}
                        onPress={() => { setSelectedService(svc.label); setSelectedDate(''); setSelectedTime(''); }}
                        activeOpacity={0.8}
                      >
                        <View style={[styles.serviceRowIcon, { backgroundColor: svc.color + '18' }]}>
                          <Ionicons name={svc.icon} size={20} color={svc.color} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.serviceRowLabel}>{svc.label}</Text>
                          <Text style={styles.serviceRowDesc}>{svc.desc}</Text>
                        </View>
                        {selectedService === svc.label && <Ionicons name="checkmark-circle" size={20} color={svc.color} />}
                      </TouchableOpacity>
                    ))}
                  </View>

                  {/* ── Select Date ── */}
                  <Text style={[styles.label, { marginTop: 24 }]}>Select Date</Text>
                  <View style={styles.calendarCard}>
                    <View style={styles.calendarHeader}>
                      <TouchableOpacity onPress={goToPrevMonth} disabled={isCurrentMonth} style={styles.calendarNavBtn}>
                        <Ionicons name="chevron-back" size={18} color={isCurrentMonth ? '#D1D5DB' : INK} />
                      </TouchableOpacity>
                      <Text style={styles.calendarMonthLabel}>{MONTH_NAMES[calendarMonth.getMonth()]} {calendarMonth.getFullYear()}</Text>
                      <TouchableOpacity onPress={goToNextMonth} style={styles.calendarNavBtn}>
                        <Ionicons name="chevron-forward" size={18} color={INK} />
                      </TouchableOpacity>
                    </View>
                    <View style={styles.weekdayRow}>{WEEKDAY_LABELS.map((w) => <Text key={w} style={styles.weekdayLabel}>{w}</Text>)}</View>
                    {calendarWeeks.map((week, wi) => (
                      <View key={wi} style={styles.calendarRow}>
                        {week.map((date, di) => {
                          if (!date) return <View key={di} style={styles.calendarCell} />;
                          const dateValue = formatDateValue(date);
                          const disabled = isPastDate(date) || isBeyondBookingWindow(date) || (selectedService ? isDayClosed(date, selectedService) : false);
                          const isSelected = selectedDate === dateValue;
                          return (
                            <TouchableOpacity key={di} style={styles.calendarCell} disabled={disabled} onPress={() => { setSelectedDate(dateValue); setSelectedTime(''); }} activeOpacity={0.7}>
                              <View style={[styles.calendarDayCircle, isSelected && styles.calendarDayCircleSelected]}>
                                <Text style={[styles.calendarDayText, disabled && styles.calendarDayTextDisabled, isSelected && styles.calendarDayTextSelected]}>
                                  {date.getDate()}
                                </Text>
                              </View>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    ))}
                    <Text style={styles.calendarHint}>
                      {selectedService
                        ? `${selectedService === 'Grooming' ? 'Mondays' : 'Sundays'} closed · pick any open day`
                        : 'Select a service above to see available days'}
                    </Text>
                  </View>

                  {/* ── Select Time ── */}
                  <Text style={[styles.label, { marginTop: 24 }]}>Select Time</Text>
                  {loadingTimes ? (
                    <ActivityIndicator color={TEAL} style={{ marginVertical: 12 }} />
                  ) : (
                    <View style={styles.timeGrid}>
                      {availableTimeSlots.map((time) => {
                        const isTaken = takenTimes.includes(time);
                        return (
                          <TouchableOpacity
                            key={time}
                            style={[styles.timeChipBtn, selectedTime === time && styles.timeChipBtnActive, isTaken && styles.timeChipBtnTaken]}
                            onPress={() => !isTaken && setSelectedTime(time)}
                            disabled={isTaken}
                            activeOpacity={0.8}
                          >
                            <Text style={[
                              styles.timeChipBtnText,
                              selectedTime === time && styles.timeChipBtnTextActive,
                              isTaken && styles.timeChipBtnTextTaken,
                            ]}>
                              {time}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  )}
                  {selectedDate && (
                    <Text style={styles.calendarHint}>
                      Showing availability for {new Date(selectedDate).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} · struck-through slots are taken
                    </Text>
                  )}

                  <View style={{ height: 140 }} />
                </View>
              </ScrollView>

              {/* ── Fixed bottom summary + confirm bar ── */}
              <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 14 }]}>
                {selectedPet && selectedService ? (
                  <View style={styles.bottomBarSummary}>
                    <Text style={styles.bottomBarService} numberOfLines={1}>
                      {selectedService} · {selectedPet.name}
                    </Text>
                    <Text style={styles.bottomBarDate}>
                      {selectedDate
                        ? new Date(selectedDate).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
                        : 'Select a date'}
                      {selectedTime ? ` at ${selectedTime}` : ''}
                    </Text>
                  </View>
                ) : null}

                <TouchableOpacity
                  style={[styles.submitBtn, (!selectedPet || !selectedService || !selectedDate || !selectedTime) && styles.submitBtnDisabled]}
                  onPress={handleBook}
                  disabled={!selectedPet || !selectedService || !selectedDate || !selectedTime || isBooking}
                  activeOpacity={0.85}
                >
                  {isBooking ? <ActivityIndicator color="#fff" /> : (
                    <>
                      <Ionicons name="checkmark-circle-outline" size={18} color="#fff" />
                      <Text style={styles.submitBtnText}>Confirm Appointment Request</Text>
                    </>
                  )}
                </TouchableOpacity>

                <View style={styles.secureRow}>
                  <Ionicons name="lock-closed" size={11} color={SUB} />
                  <Text style={styles.secureText}>Your information is encrypted and protected</Text>
                </View>
              </View>
            </>
          )}
        </View>
      </Modal>

      {/* ── Reschedule modal ── */}
      <Modal visible={showReschedule} animationType="slide" onRequestClose={closeReschedule}>
        <View style={styles.bookContainer}>
          <View style={[styles.bookHeader, { paddingTop: insets.top + 8 }]}>
            <TouchableOpacity onPress={closeReschedule} style={styles.bookCloseBtn}>
              <Ionicons name="chevron-back" size={22} color={INK} />
            </TouchableOpacity>
            <Text style={styles.bookHeaderTitle}>Reschedule Appointment</Text>
            <View style={{ width: 36 }} />
          </View>

          {rescheduleSuccess ? (
            <View style={styles.successContainer}>
              <View style={styles.successIconWrap}><Ionicons name="checkmark" size={40} color="#fff" /></View>
              <Text style={styles.successTitle}>Reschedule Requested!</Text>
              <Text style={styles.successText}>We've sent your new preferred time to the clinic.{'\n'}Please wait for confirmation.</Text>
              <TouchableOpacity style={styles.successBtn} onPress={closeReschedule} activeOpacity={0.85}>
                <Text style={styles.successBtnText}>Done</Text>
              </TouchableOpacity>
            </View>
          ) : rescheduleTarget ? (
            <ScrollView style={styles.bookScroll} showsVerticalScrollIndicator={false}>
              <View style={styles.form}>
                {rescheduleError ? (
                  <View style={styles.errorBox}>
                    <Ionicons name="alert-circle-outline" size={16} color="#DC2626" />
                    <Text style={styles.errorText}>{rescheduleError}</Text>
                  </View>
                ) : null}

                <View style={styles.rescheduleSummary}>
                  <Ionicons name="paw" size={16} color={TEAL} />
                  <Text style={styles.rescheduleSummaryText}>{rescheduleTarget.service} — {rescheduleTarget.pet_name}</Text>
                </View>
                <Text style={styles.rescheduleNote}>
                  Current: {rescheduleTarget.requested_date} {rescheduleTarget.scheduled_time ? `at ${rescheduleTarget.scheduled_time}` : ''}
                </Text>

                <Text style={styles.label}>New Date</Text>
                <View style={styles.calendarCard}>
                  <View style={styles.calendarHeader}>
                    <TouchableOpacity onPress={goToPrevRescheduleMonth} disabled={isCurrentRescheduleMonth} style={styles.calendarNavBtn}>
                      <Ionicons name="chevron-back" size={18} color={isCurrentRescheduleMonth ? '#D1D5DB' : INK} />
                    </TouchableOpacity>
                    <Text style={styles.calendarMonthLabel}>{MONTH_NAMES[rescheduleMonth.getMonth()]} {rescheduleMonth.getFullYear()}</Text>
                    <TouchableOpacity onPress={goToNextRescheduleMonth} style={styles.calendarNavBtn}>
                      <Ionicons name="chevron-forward" size={18} color={INK} />
                    </TouchableOpacity>
                  </View>
                  <View style={styles.weekdayRow}>{WEEKDAY_LABELS.map((w) => <Text key={w} style={styles.weekdayLabel}>{w}</Text>)}</View>
                  {rescheduleWeeks.map((week, wi) => (
                    <View key={wi} style={styles.calendarRow}>
                      {week.map((date, di) => {
                        if (!date) return <View key={di} style={styles.calendarCell} />;
                        const dateValue = formatDateValue(date);
                        const disabled = isPastDate(date) || isBeyondBookingWindow(date) || isDayClosed(date, rescheduleTarget.service);
                        const isSelected = rescheduleDate === dateValue;
                        return (
                          <TouchableOpacity key={di} style={styles.calendarCell} disabled={disabled} onPress={() => setRescheduleDate(dateValue)} activeOpacity={0.7}>
                            <View style={[styles.calendarDayCircle, isSelected && styles.calendarDayCircleSelected]}>
                              <Text style={[styles.calendarDayText, disabled && styles.calendarDayTextDisabled, isSelected && styles.calendarDayTextSelected]}>
                                {date.getDate()}
                              </Text>
                            </View>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  ))}
                </View>

                <Text style={styles.label}>New Time</Text>
                <View style={styles.timeGrid}>
                  {rescheduleAvailableSlots.map((time) => (
                    <TouchableOpacity key={time} style={[styles.timeChipBtn, rescheduleTime === time && styles.timeChipBtnActive]} onPress={() => setRescheduleTime(time)} activeOpacity={0.8}>
                      <Text style={[styles.timeChipBtnText, rescheduleTime === time && styles.timeChipBtnTextActive]}>{time}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <TouchableOpacity style={styles.submitBtn} onPress={handleReschedule} disabled={isRescheduling} activeOpacity={0.85}>
                  {isRescheduling ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitBtnText}>Confirm New Time</Text>}
                </TouchableOpacity>

                <View style={styles.secureRow}>
                  <Ionicons name="information-circle-outline" size={13} color={SUB} />
                  <Text style={styles.secureText}>Rescheduled appointments need to be re-confirmed by the clinic</Text>
                </View>
                <View style={{ height: 24 }} />
              </View>
            </ScrollView>
          ) : (
            <ActivityIndicator color={TEAL} style={{ marginTop: 48 }} />
          )}
        </View>
      </Modal>

      {/* ── Summary & receipt modal ── */}
      <Modal visible={!!summaryTarget} transparent animationType="slide" onRequestClose={() => setSummaryTarget(null)}>
        <View style={styles.sheetOverlay}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setSummaryTarget(null)} />
          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />
            {summaryTarget && (
              <>
                <Text style={styles.sheetTitle}>Visit Summary</Text>
                <View style={styles.summaryCard}>
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>Service</Text>
                    <Text style={styles.summaryValue}>{summaryTarget.service}</Text>
                  </View>
                  <View style={styles.summaryDivider2} />
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>Pet</Text>
                    <Text style={styles.summaryValue}>{summaryTarget.pet_name} ({summaryTarget.pet_species})</Text>
                  </View>
                  <View style={styles.summaryDivider2} />
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>Date</Text>
                    <Text style={styles.summaryValue}>{summaryTarget.requested_date}</Text>
                  </View>
                  {summaryTarget.scheduled_time && (
                    <>
                      <View style={styles.summaryDivider2} />
                      <View style={styles.summaryRow}>
                        <Text style={styles.summaryLabel}>Time</Text>
                        <Text style={styles.summaryValue}>{summaryTarget.scheduled_time}</Text>
                      </View>
                    </>
                  )}
                  {summaryTarget.invoice?.status === 'paid' && (
                    <>
                      <View style={styles.summaryDivider2} />
                      <View style={styles.summaryRow}>
                        <Text style={styles.summaryLabel}>Amount Paid</Text>
                        <Text style={[styles.summaryValue, { color: TEAL, fontWeight: '800' }]}>
                          ₱{summaryTarget.invoice.total_amount.toLocaleString()}
                        </Text>
                      </View>
                    </>
                  )}
                </View>
                {!summaryTarget.invoice?.status && (
                  <Text style={styles.summaryNote}>No billing record was created for this visit.</Text>
                )}
                <TouchableOpacity style={styles.summaryCloseBtn} onPress={() => setSummaryTarget(null)} activeOpacity={0.85}>
                  <Text style={styles.summaryCloseBtnText}>Close</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },

  header: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', paddingHorizontal: 18, paddingBottom: 12 },
  headerTitle: { fontSize: 24, fontWeight: '800', color: INK, letterSpacing: -0.4 },
  headerSub: { fontSize: 12.5, color: SUB, marginTop: 3 },
  bookBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: TEAL, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 9 },
  bookBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },

  tabsWrap: { flexDirection: 'row', backgroundColor: '#fff', borderRadius: 24, padding: 4, marginHorizontal: 18, marginBottom: 14, borderWidth: 1, borderColor: BORDER },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: 20 },
  tabActive: { backgroundColor: INK },
  tabText: { fontSize: 13, fontWeight: '700', color: SUB },
  tabTextActive: { color: '#fff' },

  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 18 },

  balanceBanner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: TEAL_LIGHT, borderRadius: 14, padding: 14, marginBottom: 14 },
  balanceBannerTitle: { fontSize: 13, fontWeight: '800', color: '#0F766E' },
  balanceBannerSub: { fontSize: 11.5, color: '#0F766E', marginTop: 2 },
  balanceBannerAmount: { fontSize: 18, fontWeight: '800', color: TEAL },

  empty: { alignItems: 'center', paddingTop: 60, gap: 10 },
  emptyIconWrap: { width: 72, height: 72, borderRadius: 36, backgroundColor: TEAL, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  emptyTitle: { fontSize: 17, fontWeight: '800', color: INK, letterSpacing: -0.2 },
  emptyText: { fontSize: 13, color: SUB, textAlign: 'center' },
  emptyBtn: { backgroundColor: TEAL, borderRadius: 10, paddingHorizontal: 20, paddingVertical: 11, marginTop: 8 },
  emptyBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },

  card: { backgroundColor: '#fff', borderRadius: 16, padding: 15, marginBottom: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 8, elevation: 2 },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 11, fontWeight: '700' },
  petPhoto: { width: 32, height: 32, borderRadius: 16 },
  petPhotoFallback: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },

  serviceName: { fontSize: 16, fontWeight: '800', color: INK, marginBottom: 3, letterSpacing: -0.2 },
  petLine: { fontSize: 12.5, color: SUB, marginBottom: 10 },

  metaRow: { flexDirection: 'row', gap: 16, marginBottom: 4 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  metaText: { fontSize: 12, color: SUB, fontWeight: '500' },

  balanceRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12, marginBottom: 8 },
  balanceLabel: { fontSize: 12.5, color: SUB, fontWeight: '600' },
  balanceAmount: { fontSize: 15, color: INK, fontWeight: '800' },
  payBtn: { backgroundColor: TEAL, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingVertical: 12, borderRadius: 10 },
  payBtnText: { color: '#fff', fontSize: 13.5, fontWeight: '700' },

  paidBanner: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: TEAL_LIGHT, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 9, marginTop: 12 },
  paidBannerText: { color: TEAL, fontSize: 12.5, fontWeight: '700' },

  actionsRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  rescheduleBtn: { flex: 1, borderWidth: 1.5, borderColor: BORDER, borderRadius: 10, paddingVertical: 10, alignItems: 'center', justifyContent: 'center' },
  rescheduleBtnText: { fontSize: 12.5, fontWeight: '700', color: INK },
  cancelBtn: { flex: 1, flexDirection: 'row', gap: 5, borderWidth: 1.5, borderColor: '#FECACA', borderRadius: 10, paddingVertical: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FEF2F2' },
  cancelBtnText: { fontSize: 12.5, fontWeight: '700', color: '#DC2626' },

  summaryLink: { marginTop: 10 },
  summaryDivider: { height: 1, backgroundColor: BORDER, marginBottom: 10 },
  summaryLinkText: { fontSize: 12.5, fontWeight: '700', color: TEAL },

  /* ── Booking ── */
  bookContainer: { flex: 1, backgroundColor: BG },
  bookHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingBottom: 14, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: BORDER },
  bookCloseBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: BG, alignItems: 'center', justifyContent: 'center' },
  bookHeaderTitle: { fontSize: 16, fontWeight: '800', color: INK },
  bookScroll: { flex: 1 },
  form: { padding: 14 },

  errorBox: { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FECACA', borderRadius: 8, padding: 10, marginBottom: 12 },
  errorText: { color: '#DC2626', fontSize: 12.5, flex: 1 },

  label: { fontSize: 11, fontWeight: '700', color: SUB, letterSpacing: 0.9, textTransform: 'uppercase', marginBottom: 8 },

  petPillRow: { flexDirection: 'row', gap: 10 },
  petPillCard: {
    flex: 1, backgroundColor: '#fff', borderWidth: 1.5, borderColor: BORDER, borderRadius: 14,
    padding: 12, alignItems: 'center',
  },
  petPillCardActive: { borderColor: TEAL, backgroundColor: TEAL_LIGHT },
  petPillPhoto: { width: 44, height: 44, borderRadius: 22, marginBottom: 6 },
  petPillPhotoFallback: { width: 44, height: 44, borderRadius: 22, backgroundColor: TEAL_LIGHT, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  petPillName: { fontSize: 13, fontWeight: '700', color: INK },
  petPillBreed: { fontSize: 10.5, color: SUB, marginTop: 1 },

  serviceRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#fff', borderWidth: 1.5, borderColor: BORDER, borderRadius: 14, padding: 13,
  },
  serviceRowIcon: { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  serviceRowLabel: { fontSize: 14, fontWeight: '700', color: INK },
  serviceRowDesc: { fontSize: 11.5, color: SUB, marginTop: 1 },

  emptyPets: { alignItems: 'center', gap: 8, backgroundColor: '#fff', borderRadius: 12, borderWidth: 1.5, borderColor: BORDER, padding: 20, marginBottom: 12 },
  emptyPetsText: { fontSize: 13, color: SUB },
  addPetBtn: { backgroundColor: TEAL, paddingHorizontal: 18, paddingVertical: 9, borderRadius: 8, marginTop: 4 },
  addPetBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },

  calendarCard: { backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: BORDER, padding: 14 },
  calendarHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  calendarNavBtn: { width: 30, height: 30, borderRadius: 15, backgroundColor: BG, alignItems: 'center', justifyContent: 'center' },
  calendarMonthLabel: { fontSize: 14.5, fontWeight: '800', color: INK },
  weekdayRow: { flexDirection: 'row', marginBottom: 4 },
  weekdayLabel: { flex: 1, textAlign: 'center', fontSize: 10, fontWeight: '700', color: SUB },
  calendarRow: { flexDirection: 'row' },
  calendarCell: { flex: 1, aspectRatio: 1, alignItems: 'center', justifyContent: 'center' },
  calendarDayCircle: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  calendarDayCircleSelected: { backgroundColor: TEAL },
  calendarDayText: { fontSize: 13, color: INK, fontWeight: '500' },
  calendarDayTextDisabled: { color: '#D1D5DB' },
  calendarDayTextSelected: { color: '#fff', fontWeight: '700' },
  calendarHint: { fontSize: 11, color: SUB, textAlign: 'center', marginTop: 8, fontStyle: 'italic' },

  timeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  timeChipBtn: { borderWidth: 1.5, borderColor: BORDER, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: '#fff', minWidth: '30%', alignItems: 'center' },
  timeChipBtnActive: { backgroundColor: TEAL, borderColor: TEAL },
  timeChipBtnTaken: { backgroundColor: '#F3F4F6', borderColor: '#F3F4F6' },
  timeChipBtnText: { fontSize: 12.5, color: INK, fontWeight: '600' },
  timeChipBtnTextActive: { color: '#fff', fontWeight: '700' },
  timeChipBtnTextTaken: { color: '#D1D5DB', textDecorationLine: 'line-through' },

  bottomBar: { backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: BORDER, paddingHorizontal: 14, paddingTop: 12 },
  bottomBarSummary: { marginBottom: 10 },
  bottomBarService: { fontSize: 14, fontWeight: '800', color: INK },
  bottomBarDate: { fontSize: 12, color: SUB, marginTop: 2 },

  submitBtn: { backgroundColor: TEAL, borderRadius: 12, paddingVertical: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 20 },
  submitBtnDisabled: { backgroundColor: '#D1D5DB' },
  submitBtnText: { color: '#fff', fontSize: 14.5, fontWeight: '800' },

  secureRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, marginTop: 12 },
  secureText: { fontSize: 11, color: SUB, textAlign: 'center', flexShrink: 1 },

  rescheduleSummary: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: TEAL_LIGHT, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, marginTop: 4 },
  rescheduleSummaryText: { fontSize: 13, fontWeight: '700', color: '#0F766E' },
  rescheduleNote: { fontSize: 11.5, color: SUB, marginTop: 6, marginBottom: 4 },

  successContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, backgroundColor: BG },
  successIconWrap: { width: 80, height: 80, borderRadius: 40, backgroundColor: TEAL, alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  successTitle: { fontSize: 22, fontWeight: '800', color: INK, marginBottom: 8, letterSpacing: -0.3 },
  successText: { fontSize: 13, color: SUB, textAlign: 'center', lineHeight: 20, marginBottom: 28 },
  successBtn: { backgroundColor: TEAL, borderRadius: 10, paddingVertical: 14, width: '100%', alignItems: 'center', marginBottom: 10 },
  successBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  successBtnOutline: { borderWidth: 1.5, borderColor: TEAL, borderRadius: 10, paddingVertical: 14, width: '100%', alignItems: 'center' },
  successBtnOutlineText: { color: TEAL, fontSize: 14, fontWeight: '700' },

  sheetOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 36 },
  sheetHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: BORDER, alignSelf: 'center', marginBottom: 16 },
  sheetTitle: { fontSize: 17, fontWeight: '800', color: INK, marginBottom: 14 },
  summaryCard: { backgroundColor: BG, borderRadius: 14, padding: 4, marginBottom: 12 },
  summaryRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 11 },
  summaryLabel: { fontSize: 12.5, color: SUB, fontWeight: '600' },
  summaryValue: { fontSize: 13.5, color: INK, fontWeight: '700' },
  summaryDivider2: { height: 1, backgroundColor: BORDER, marginHorizontal: 14 },
  summaryNote: { fontSize: 11.5, color: SUB, fontStyle: 'italic', marginBottom: 12 },
  summaryCloseBtn: { backgroundColor: TEAL, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  summaryCloseBtnText: { color: '#fff', fontSize: 14, fontWeight: '800' },
});