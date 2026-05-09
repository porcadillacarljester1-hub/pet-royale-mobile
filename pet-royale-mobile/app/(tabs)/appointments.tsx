import { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useFocusEffect } from 'expo-router';

const NAV = '#1a237e';
const GOLD = '#f5c518';
const BG = '#f0f2f8';

export default function MyAppointmentsScreen() {
  const [appointments, setAppointments] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchAppointments = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data, error } = await (supabase as any)
      .from('appointments')
      .select('*')
      .eq('client_name', user.user_metadata?.full_name || user.email)
      .order('created_at', { ascending: false });

    if (!error) setAppointments(data || []);
    setIsLoading(false);
    setRefreshing(false);
  };

  useFocusEffect(
    useCallback(() => {
      fetchAppointments();
    }, [])
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchAppointments();
  };

  const getStatus = (status: string) => {
    switch (status) {
      case 'incoming':  return { color: '#1565c0', bg: '#e3f2fd', label: 'Pending',   icon: 'time'             as const };
      case 'confirmed': return { color: '#2e7d32', bg: '#e8f5e9', label: 'Confirmed', icon: 'checkmark-circle' as const };
      case 'completed': return { color: '#6a1b9a', bg: '#f3e5f5', label: 'Completed', icon: 'ribbon'           as const };
      default:          return { color: '#6b7280', bg: '#f3f4f6', label: status,       icon: 'help-circle'      as const };
    }
  };

  const active    = appointments.filter(a => a.status !== 'completed');
  const completed = appointments.filter(a => a.status === 'completed');

  const AppointmentCard = ({ item }: { item: any }) => {
    const status = getStatus(item.status);
    const isCompleted = item.status === 'completed';
    return (
      <View style={[styles.card, isCompleted && styles.cardCompleted]}>
        {/* Left accent bar */}
        <View style={[styles.cardAccent, { backgroundColor: status.color }]} />

        <View style={styles.cardBody}>
          {/* Top row */}
          <View style={styles.cardTop}>
            <View style={[styles.statusBadge, { backgroundColor: status.bg }]}>
              <Ionicons name={status.icon} size={12} color={status.color} />
              <Text style={[styles.statusText, { color: status.color }]}>{status.label}</Text>
            </View>
            <Text style={styles.dateText}>{item.requested_date}</Text>
          </View>

          {/* Service */}
          <Text style={styles.serviceName}>{item.service}</Text>

          {/* Pet */}
          <View style={styles.petRow}>
            <View style={styles.petIconWrap}>
              <Ionicons name="paw" size={12} color={NAV} />
            </View>
            <Text style={styles.petText}>
              {item.pet_name}
              <Text style={styles.petSpecies}> · {item.pet_species}</Text>
            </Text>
          </View>

          {/* Time */}
          {item.scheduled_time && (
            <View style={styles.timeRow}>
              <Ionicons name="time-outline" size={13} color="#8a97b0" />
              <Text style={styles.timeText}>{item.scheduled_time}</Text>
            </View>
          )}
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>

      {/* ── Header ── */}
      <View style={styles.header}>
        <View style={styles.headerBrand}>
          <View style={styles.crownBox}>
            <Ionicons name="trophy" size={18} color={GOLD} />
          </View>
          <View>
            <Text style={styles.headerTitle}>My Appointments</Text>
            <Text style={styles.headerSub}>TRACK YOUR APPOINTMENT STATUS</Text>
          </View>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={NAV} />}
      >
        {isLoading ? (
          <ActivityIndicator size="large" color={NAV} style={{ marginTop: 48 }} />
        ) : appointments.length === 0 ? (
          <View style={styles.empty}>
            <View style={styles.emptyIconWrap}>
              <Ionicons name="calendar-outline" size={32} color={GOLD} />
            </View>
            <Text style={styles.emptyTitle}>No Appointments Yet</Text>
            <Text style={styles.emptyText}>Book an appointment to get started!</Text>
          </View>
        ) : (
          <>
            {active.length > 0 && (
              <>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>Active</Text>
                  <View style={styles.sectionBadge}>
                    <Text style={styles.sectionBadgeText}>{active.length}</Text>
                  </View>
                  <View style={styles.sectionLine} />
                </View>
                {active.map(item => <AppointmentCard key={item.id} item={item} />)}
              </>
            )}

            {completed.length > 0 && (
              <>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>Completed</Text>
                  <View style={[styles.sectionBadge, styles.sectionBadgeMuted]}>
                    <Text style={[styles.sectionBadgeText, styles.sectionBadgeTextMuted]}>{completed.length}</Text>
                  </View>
                  <View style={styles.sectionLine} />
                </View>
                {completed.map(item => <AppointmentCard key={item.id} item={item} />)}
              </>
            )}
          </>
        )}
        <View style={{ height: 24 }} />
      </ScrollView>
    </View>
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

  scroll: { flex: 1 },
  scrollContent: { padding: 14 },

  /* ── Empty ── */
  empty: {
    alignItems: 'center', paddingTop: 60, gap: 10,
  },
  emptyIconWrap: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: NAV, alignItems: 'center', justifyContent: 'center',
    marginBottom: 4,
  },
  emptyTitle: { fontSize: 17, fontWeight: '800', color: NAV, letterSpacing: -0.2 },
  emptyText: { fontSize: 13, color: '#8a97b0', textAlign: 'center' },

  /* ── Section header ── */
  sectionHeader: {
    flexDirection: 'row', alignItems: 'center',
    gap: 8, marginBottom: 10, marginTop: 6,
  },
  sectionTitle: { fontSize: 14, fontWeight: '800', color: NAV, letterSpacing: -0.1 },
  sectionBadge: {
    backgroundColor: NAV, borderRadius: 10,
    paddingHorizontal: 7, paddingVertical: 2,
  },
  sectionBadgeText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  sectionBadgeMuted: { backgroundColor: '#dde3ef' },
  sectionBadgeTextMuted: { color: '#8a97b0' },
  sectionLine: { flex: 1, height: 1.5, backgroundColor: '#dde3ef', borderRadius: 2 },

  /* ── Card ── */
  card: {
    backgroundColor: '#fff', borderRadius: 12,
    marginBottom: 10, flexDirection: 'row',
    overflow: 'hidden',
    shadowColor: NAV,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07, shadowRadius: 6, elevation: 3,
  },
  cardCompleted: { opacity: 0.75 },
  cardAccent: { width: 4 },
  cardBody: { flex: 1, padding: 14 },

  cardTop: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', marginBottom: 8,
  },
  statusBadge: {
    flexDirection: 'row', alignItems: 'center',
    gap: 4, paddingHorizontal: 9, paddingVertical: 3,
    borderRadius: 20,
  },
  statusText: { fontSize: 11, fontWeight: '700' },
  dateText: { fontSize: 11, color: '#8a97b0', fontWeight: '500' },

  serviceName: {
    fontSize: 15, fontWeight: '800', color: NAV,
    marginBottom: 7, letterSpacing: -0.2,
  },

  petRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 5 },
  petIconWrap: {
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: BG, alignItems: 'center', justifyContent: 'center',
  },
  petText: { fontSize: 12.5, color: '#4a5568', fontWeight: '600' },
  petSpecies: { fontWeight: '400', color: '#8a97b0' },

  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  timeText: { fontSize: 12, color: '#8a97b0' },
});
