import { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useRouter, useFocusEffect } from 'expo-router';

const NAV = '#1a237e';
const GOLD = '#f5c518';
const BG = '#f0f2f8';

const services = [
  { label: 'Veterinary Check-ups',       icon: 'heart'             as const, color: '#e53935' },
  { label: 'Vaccination & Deworming',    icon: 'medical'           as const, color: '#2e7d32' },
  { label: 'Grooming',                   icon: 'cut'               as const, color: '#6a1b9a' },
  { label: 'Minor & Major Surgeries',    icon: 'bandage'           as const, color: '#e65100' },
  { label: 'Confinement & Emergency Care', icon: 'shield-checkmark' as const, color: '#00838f' },
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

export default function BookAppointmentScreen() {
  const router = useRouter();
  const [pets, setPets] = useState<any[]>([]);
  const [selectedPet, setSelectedPet] = useState<any>(null);
  const [selectedService, setSelectedService] = useState('');
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedTime, setSelectedTime] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isFetchingPets, setIsFetchingPets] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [showPetDropdown, setShowPetDropdown] = useState(false);
  const [showTimeModal, setShowTimeModal] = useState(false);
  const [showDateModal, setShowDateModal] = useState(false);

  const getAvailableDates = () => {
    const dates = [];
    const today = new Date();
    for (let i = 1; i <= 30; i++) {
      const date = new Date(today);
      date.setDate(today.getDate() + i);
      const day = date.getDay();
      const isGrooming = selectedService === 'Grooming';
      if (isGrooming) {
        if (day !== 1) dates.push(date);
      } else {
        if (day !== 0) dates.push(date);
      }
    }
    return dates;
  };

  const formatDate = (date: Date) => {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${days[date.getDay()]}, ${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
  };

  const formatDateValue = (date: Date) => {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  };

  useFocusEffect(
    useCallback(() => {
      fetchUserPets();
    }, [])
  );

  const fetchUserPets = async () => {
    setIsFetchingPets(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setIsFetchingPets(false); return; }
    const { data, error } = await (supabase as any)
      .from('pets')
      .select('*')
      .eq('owner_id', user.id)
      .order('created_at', { ascending: false });
    if (!error && data) setPets(data);
    setIsFetchingPets(false);
  };

  const handleBook = async () => {
    if (!selectedPet)    { setError('Please select a pet.');    return; }
    if (!selectedService) { setError('Please select a service.'); return; }
    if (!selectedDate)   { setError('Please select a date.');   return; }
    if (!selectedTime)   { setError('Please select a time.');   return; }

    setIsLoading(true);
    setError('');

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setError('You must be logged in.'); setIsLoading(false); return; }

    const { error: bookingError } = await (supabase as any)
      .from('appointments')
      .insert([{
        client_name: user.user_metadata?.full_name || user.email,
        pet_name: selectedPet.name,
        pet_species: selectedPet.species,
        service: selectedService,
        requested_date: selectedDate,
        scheduled_time: selectedTime,
        status: 'incoming',
      }]);

    setIsLoading(false);

    if (bookingError) { setError(`Failed to book: ${bookingError.message}`); return; }

    setSuccess(true);
    setSelectedPet(null);
    setSelectedService('');
    setSelectedDate('');
    setSelectedTime('');
  };

  const availableTimeSlots = selectedService === 'Grooming' ? groomingTimeSlots : timeSlots;

  /* ── Success Screen ── */
  if (success) {
    return (
      <View style={styles.successContainer}>
        <View style={styles.successIconWrap}>
          <Ionicons name="checkmark" size={40} color={GOLD} />
        </View>
        <Text style={styles.successTitle}>Appointment Booked!</Text>
        <Text style={styles.successText}>
          Your request has been sent to the clinic.{'\n'}Please wait for confirmation.
        </Text>
        <TouchableOpacity
          style={styles.successBtn}
          onPress={() => { setSuccess(false); router.push('/(tabs)/appointments' as any); }}
          activeOpacity={0.85}
        >
          <Text style={styles.successBtnText}>View My Appointments</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.successBtnOutline}
          onPress={() => setSuccess(false)}
          activeOpacity={0.85}
        >
          <Text style={styles.successBtnOutlineText}>Book Another</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>

      {/* ── Header ── */}
      <View style={styles.header}>
        <View style={styles.headerBrand}>
          <View style={styles.crownBox}>
            <Ionicons name="trophy" size={18} color={GOLD} />
          </View>
          <View>
            <Text style={styles.headerTitle}>Book Appointment</Text>
            <Text style={styles.headerSub}>FILL IN THE DETAILS BELOW</Text>
          </View>
        </View>
      </View>

      <View style={styles.form}>

        {/* Error */}
        {error ? (
          <View style={styles.errorBox}>
            <Ionicons name="alert-circle-outline" size={16} color="#c0392b" />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {/* Hours strip */}
        <View style={styles.hoursStrip}>
          <View style={styles.hoursItem}>
            <Ionicons name="time-outline" size={13} color={GOLD} />
            <Text style={styles.hoursText}>Clinic: Mon–Sat, 8:30 AM–7:00 PM</Text>
          </View>
          <View style={styles.hoursDot} />
          <View style={styles.hoursItem}>
            <Ionicons name="cut-outline" size={13} color={GOLD} />
            <Text style={styles.hoursText}>Grooming: Tue–Sun, 8:30 AM–6:00 PM</Text>
          </View>
        </View>

        {/* ── Select Pet ── */}
        <Text style={styles.label}>Select Pet</Text>
        {isFetchingPets ? (
          <ActivityIndicator color={NAV} style={{ marginVertical: 12 }} />
        ) : pets.length === 0 ? (
          <View style={styles.emptyPets}>
            <Ionicons name="paw-outline" size={28} color="#8a97b0" />
            <Text style={styles.emptyPetsText}>No pets registered yet</Text>
            <TouchableOpacity
              style={styles.addPetBtn}
              onPress={() => router.push('/(tabs)/pets' as any)}
              activeOpacity={0.85}
            >
              <Text style={styles.addPetBtnText}>Add a Pet First</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <TouchableOpacity style={styles.selector} onPress={() => setShowPetDropdown(true)} activeOpacity={0.8}>
              <View style={styles.selectorLeft}>
                <Ionicons name="paw" size={16} color={selectedPet ? NAV : '#8a97b0'} />
                <Text style={selectedPet ? styles.selectorValue : styles.selectorPlaceholder}>
                  {selectedPet ? `${selectedPet.name} · ${selectedPet.species}` : 'Select your pet…'}
                </Text>
              </View>
              <Ionicons name="chevron-down" size={16} color="#8a97b0" />
            </TouchableOpacity>

            {/* Pet Modal */}
            <Modal visible={showPetDropdown} transparent animationType="fade">
              <TouchableOpacity style={styles.modalOverlay} onPress={() => setShowPetDropdown(false)}>
                <View style={styles.pickerModal}>
                  <Text style={styles.pickerTitle}>Select a Pet</Text>
                  {pets.map((pet) => (
                    <TouchableOpacity
                      key={pet.id}
                      style={[styles.pickerItem, selectedPet?.id === pet.id && styles.pickerItemActive]}
                      onPress={() => { setSelectedPet(pet); setShowPetDropdown(false); }}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="paw" size={16} color={selectedPet?.id === pet.id ? '#fff' : NAV} />
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.pickerItemName, selectedPet?.id === pet.id && styles.pickerItemNameActive]}>
                          {pet.name}
                        </Text>
                        <Text style={[styles.pickerItemSub, selectedPet?.id === pet.id && styles.pickerItemSubActive]}>
                          {pet.species}{pet.breed ? ` · ${pet.breed}` : ''}
                        </Text>
                      </View>
                      {selectedPet?.id === pet.id && <Ionicons name="checkmark" size={16} color="#fff" />}
                    </TouchableOpacity>
                  ))}
                </View>
              </TouchableOpacity>
            </Modal>
          </>
        )}

        {/* ── Service ── */}
        <Text style={styles.label}>Service</Text>
        <View style={styles.serviceGrid}>
          {services.map((svc) => (
            <TouchableOpacity
              key={svc.label}
              style={[styles.serviceCard, selectedService === svc.label && styles.serviceCardActive]}
              onPress={() => { setSelectedService(svc.label); setSelectedDate(''); setSelectedTime(''); }}
              activeOpacity={0.8}
            >
              <View style={[styles.serviceIconWrap, { backgroundColor: selectedService === svc.label ? 'rgba(255,255,255,0.15)' : svc.color + '18' }]}>
                <Ionicons name={svc.icon} size={20} color={selectedService === svc.label ? '#fff' : svc.color} />
              </View>
              <Text style={[styles.serviceLabel, selectedService === svc.label && styles.serviceLabelActive]}>
                {svc.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ── Date ── */}
        <Text style={styles.label}>Preferred Date</Text>
        <TouchableOpacity
          style={[styles.selector, !selectedService && styles.selectorDisabled]}
          onPress={() => selectedService && setShowDateModal(true)}
          activeOpacity={0.8}
        >
          <View style={styles.selectorLeft}>
            <Ionicons name="calendar-outline" size={16} color={selectedDate ? NAV : '#8a97b0'} />
            <Text style={selectedDate ? styles.selectorValue : styles.selectorPlaceholder}>
              {selectedDate
                ? (() => { const d = getAvailableDates().find(d => formatDateValue(d) === selectedDate); return d ? formatDate(d) : selectedDate; })()
                : selectedService ? 'Select a date…' : 'Select a service first'}
            </Text>
          </View>
          <Ionicons name="chevron-down" size={16} color="#8a97b0" />
        </TouchableOpacity>

        {/* Date Modal */}
        <Modal visible={showDateModal} transparent animationType="slide">
          <View style={styles.sheetOverlay}>
            <View style={styles.sheet}>
              <View style={styles.sheetHeader}>
                <Text style={styles.sheetTitle}>Select Date</Text>
                <TouchableOpacity onPress={() => setShowDateModal(false)}>
                  <Ionicons name="close" size={22} color="#4a5568" />
                </TouchableOpacity>
              </View>
              <ScrollView showsVerticalScrollIndicator={false}>
                {getAvailableDates().map((date, i) => (
                  <TouchableOpacity
                    key={i}
                    style={[styles.sheetItem, selectedDate === formatDateValue(date) && styles.sheetItemActive]}
                    onPress={() => { setSelectedDate(formatDateValue(date)); setShowDateModal(false); }}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.sheetItemText, selectedDate === formatDateValue(date) && styles.sheetItemTextActive]}>
                      {formatDate(date)}
                    </Text>
                    {selectedDate === formatDateValue(date) && <Ionicons name="checkmark" size={16} color="#fff" />}
                  </TouchableOpacity>
                ))}
                <View style={{ height: 20 }} />
              </ScrollView>
            </View>
          </View>
        </Modal>

        {/* ── Time ── */}
        <Text style={styles.label}>Preferred Time</Text>
        <TouchableOpacity
          style={[styles.selector, !selectedService && styles.selectorDisabled]}
          onPress={() => selectedService && setShowTimeModal(true)}
          activeOpacity={0.8}
        >
          <View style={styles.selectorLeft}>
            <Ionicons name="time-outline" size={16} color={selectedTime ? NAV : '#8a97b0'} />
            <Text style={selectedTime ? styles.selectorValue : styles.selectorPlaceholder}>
              {selectedTime || (selectedService ? 'Select a time…' : 'Select a service first')}
            </Text>
          </View>
          <Ionicons name="chevron-down" size={16} color="#8a97b0" />
        </TouchableOpacity>

        {/* Time Modal */}
        <Modal visible={showTimeModal} transparent animationType="slide">
          <View style={styles.sheetOverlay}>
            <View style={styles.sheet}>
              <View style={styles.sheetHeader}>
                <Text style={styles.sheetTitle}>Select Time</Text>
                <TouchableOpacity onPress={() => setShowTimeModal(false)}>
                  <Ionicons name="close" size={22} color="#4a5568" />
                </TouchableOpacity>
              </View>
              <View style={styles.timeGrid}>
                {availableTimeSlots.map((time) => (
                  <TouchableOpacity
                    key={time}
                    style={[styles.timeChip, selectedTime === time && styles.timeChipActive]}
                    onPress={() => { setSelectedTime(time); setShowTimeModal(false); }}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.timeChipText, selectedTime === time && styles.timeChipTextActive]}>
                      {time}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={{ height: 20 }} />
            </View>
          </View>
        </Modal>

        {/* ── Submit ── */}
        {pets.length > 0 && (
          <TouchableOpacity style={styles.submitBtn} onPress={handleBook} disabled={isLoading} activeOpacity={0.85}>
            {isLoading ? (
              <ActivityIndicator color={NAV} />
            ) : (
              <>
                <Ionicons name="calendar" size={18} color={NAV} />
                <Text style={styles.submitBtnText}>Book Appointment</Text>
              </>
            )}
          </TouchableOpacity>
        )}

        <View style={{ height: 24 }} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },

  /* ── Header ── */
  header: {
    backgroundColor: NAV,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 14,
  },
  headerBrand: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  crownBox: {
    width: 36, height: 36, borderRadius: 9,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { color: '#fff', fontSize: 15, fontWeight: '700', letterSpacing: -0.2, lineHeight: 18 },
  headerSub: { color: 'rgba(255,255,255,0.35)', fontSize: 8.5, fontWeight: '600', letterSpacing: 1.2, marginTop: 1 },

  form: { padding: 14 },

  /* Error */
  errorBox: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    backgroundColor: '#fdecea', borderWidth: 1, borderColor: '#f5c6c0',
    borderRadius: 8, padding: 10, marginBottom: 12,
  },
  errorText: { color: '#c0392b', fontSize: 12.5, flex: 1 },

  /* Hours strip */
  hoursStrip: {
    backgroundColor: NAV, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 10,
    flexDirection: 'row', alignItems: 'center',
    gap: 8, marginBottom: 16, flexWrap: 'wrap',
  },
  hoursItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  hoursText: { color: 'rgba(255,255,255,0.78)', fontSize: 10.5 },
  hoursDot: { width: 3, height: 3, borderRadius: 1.5, backgroundColor: 'rgba(255,255,255,0.2)' },

  /* Label */
  label: { fontSize: 11, fontWeight: '700', color: '#4a5568', letterSpacing: 0.9, textTransform: 'uppercase', marginBottom: 8, marginTop: 4 },

  /* Empty pets */
  emptyPets: {
    alignItems: 'center', gap: 8,
    backgroundColor: '#fff', borderRadius: 12,
    borderWidth: 1.5, borderColor: '#dde3ef',
    padding: 20, marginBottom: 12,
  },
  emptyPetsText: { fontSize: 13, color: '#8a97b0' },
  addPetBtn: { backgroundColor: NAV, paddingHorizontal: 18, paddingVertical: 9, borderRadius: 8, marginTop: 4 },
  addPetBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },

  /* Selector */
  selector: {
    backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#dde3ef',
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 12,
  },
  selectorDisabled: { opacity: 0.55 },
  selectorLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  selectorValue: { fontSize: 14, color: NAV, fontWeight: '600' },
  selectorPlaceholder: { fontSize: 14, color: '#bcc5d8' },

  /* Pet picker modal */
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: 24 },
  pickerModal: { backgroundColor: '#fff', borderRadius: 14, padding: 16, gap: 4 },
  pickerTitle: { fontSize: 15, fontWeight: '800', color: NAV, marginBottom: 8 },
  pickerItem: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    padding: 12, borderRadius: 8,
  },
  pickerItemActive: { backgroundColor: NAV },
  pickerItemName: { fontSize: 14, fontWeight: '700', color: '#1a2368' },
  pickerItemNameActive: { color: '#fff' },
  pickerItemSub: { fontSize: 11, color: '#8a97b0', marginTop: 1 },
  pickerItemSubActive: { color: GOLD },

  /* Services */
  serviceGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 9, marginBottom: 12 },
  serviceCard: {
    backgroundColor: '#fff', borderRadius: 12,
    borderWidth: 1.5, borderColor: '#dde3ef',
    padding: 12, width: '48%', alignItems: 'center',
  },
  serviceCardActive: { backgroundColor: NAV, borderColor: NAV },
  serviceIconWrap: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center', marginBottom: 7,
  },
  serviceLabel: { fontSize: 11, color: NAV, fontWeight: '600', textAlign: 'center', lineHeight: 15 },
  serviceLabelActive: { color: '#fff' },

  /* Bottom sheet */
  sheetOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 20, maxHeight: '70%',
  },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  sheetTitle: { fontSize: 16, fontWeight: '800', color: NAV },
  sheetItem: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 13, borderRadius: 9, marginBottom: 5, backgroundColor: BG,
  },
  sheetItemActive: { backgroundColor: NAV },
  sheetItemText: { fontSize: 13.5, color: '#1a2368', fontWeight: '500' },
  sheetItemTextActive: { color: '#fff', fontWeight: '700' },

  /* Time grid */
  timeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingBottom: 4 },
  timeChip: {
    borderWidth: 1.5, borderColor: '#dde3ef',
    borderRadius: 8, paddingHorizontal: 13, paddingVertical: 8,
    backgroundColor: BG,
  },
  timeChipActive: { backgroundColor: NAV, borderColor: NAV },
  timeChipText: { fontSize: 12.5, color: '#4a5568', fontWeight: '500' },
  timeChipTextActive: { color: '#fff', fontWeight: '700' },

  /* Submit */
  submitBtn: {
    backgroundColor: GOLD, borderRadius: 10,
    paddingVertical: 14, flexDirection: 'row',
    alignItems: 'center', justifyContent: 'center',
    gap: 8, marginTop: 8,
  },
  submitBtnText: { color: NAV, fontSize: 14, fontWeight: '800' },

  /* Success */
  successContainer: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    padding: 32, backgroundColor: BG,
  },
  successIconWrap: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: NAV, alignItems: 'center', justifyContent: 'center',
    marginBottom: 20,
  },
  successTitle: { fontSize: 22, fontWeight: '800', color: NAV, marginBottom: 8, letterSpacing: -0.3 },
  successText: { fontSize: 13, color: '#6b7a99', textAlign: 'center', lineHeight: 20, marginBottom: 28 },
  successBtn: {
    backgroundColor: NAV, borderRadius: 10,
    paddingVertical: 14, width: '100%', alignItems: 'center', marginBottom: 10,
  },
  successBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  successBtnOutline: {
    borderWidth: 1.5, borderColor: NAV, borderRadius: 10,
    paddingVertical: 14, width: '100%', alignItems: 'center',
  },
  successBtnOutlineText: { color: NAV, fontSize: 14, fontWeight: '700' },
});
