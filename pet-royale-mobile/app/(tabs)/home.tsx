import { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const TEAL = '#0D9488';
const TEAL_LIGHT = '#CCFBF1';
const ORANGE = '#F97316';
const ORANGE_LIGHT = '#FFEDD5';
const PURPLE = '#7C3AED';
const PURPLE_LIGHT = '#EDE9FE';
const BG = '#F4F7FB';
const INK = '#111827';
const SUB = '#6B7280';

const PET_CARD_COLORS = [
  { bg: TEAL, badgeBg: 'rgba(255,255,255,0.22)' },
  { bg: ORANGE, badgeBg: 'rgba(255,255,255,0.22)' },
];

const quickActions = [
  { key: 'book', image: require('../../assets/quick_actions/book_appointment.png'), label: 'Book Appointment', route: '/(tabs)/appointments', params: { openBooking: '1'} },
  { key: 'appointments', image: require('../../assets/quick_actions/my_appointments.png'), label: 'My Appointments', route: '/(tabs)/appointments', params: {} },
  { key: 'pets', image: require('../../assets/quick_actions/my_pets.png'), label: 'My Pets', route: '/(tabs)/pets', params: {} },
  { key: 'grooming', image: require('../../assets/quick_actions/grooming.png'), label: 'Grooming', route: '/(tabs)/appointments', params: { openBooking: '1', service: 'Grooming' } },
  { key: 'essentials', image: require('../../assets/quick_actions/pet_essentials.png'), label: 'Pet Essentials', route: '/(tabs)/products', params: {} },
  { key: 'reminders', image: require('../../assets/quick_actions/reminders.png'), label: 'Reminders', route: '/(tabs)/notifications', params: {} },
];

type HealthItem = {
  id: string;
  kind: 'vaccination' | 'note' | 'medication';
  petId: string;
  petName: string;
  petPhoto: string | null;
  title: string;
  subtitle: string;
  date: string;
};

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [firstName, setFirstName] = useState('there');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [pets, setPets] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [healthItems, setHealthItems] = useState<HealthItem[]>([]);

  const loadData = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const fullName = user.user_metadata?.full_name;
    if (fullName) {
      setFirstName(fullName.split(' ')[0]);
    } else if (user.email) {
      setFirstName(user.email.split('@')[0]);
    }
    setAvatarUrl(user.user_metadata?.avatar_url || null);

    const { data: petData } = await (supabase as any)
      .from('pets')
      .select('*')
      .eq('owner_id', user.id)
      .order('created_at', { ascending: false })
      .limit(2);
    setPets(petData || []);

    const { data: apptData } = await (supabase as any)
      .from('appointments')
      .select('*')
      .eq('client_id', user.id.toString())
      .neq('status', 'completed')
      .order('requested_date', { ascending: true })
      .limit(2);
    setTasks(apptData || []);

    // ── Pet Health Updates: vaccinations, health notes, medications across ALL pets ──
    const { data: allPets } = await (supabase as any)
      .from('pets')
      .select('id, name, photo_url')
      .eq('owner_id', user.id);

    const petMap = new Map((allPets || []).map((p: any) => [p.id, p]));
    const petIds = (allPets || []).map((p: any) => p.id);

    if (petIds.length > 0) {
      const [vaxRes, notesRes, medsRes] = await Promise.all([
        (supabase as any)
          .from('pet_vaccinations')
          .select('*')
          .in('pet_id', petIds)
          .order('date_administered', { ascending: false })
          .limit(3),
        (supabase as any)
          .from('pet_health_notes')
          .select('*')
          .in('pet_id', petIds)
          .order('created_at', { ascending: false })
          .limit(3),
        (supabase as any)
          .from('pet_medications')
          .select('*')
          .in('pet_id', petIds)
          .eq('is_active', true)
          .order('created_at', { ascending: false })
          .limit(3),
      ]);

      const items: HealthItem[] = [];

      (vaxRes.data || []).forEach((v: any) => {
        const pet = petMap.get(v.pet_id) as any;
        items.push({
          id: `vax-${v.id}`,
          kind: 'vaccination',
          petId: v.pet_id,
          petName: pet?.name || 'Pet',
          petPhoto: pet?.photo_url || null,
          title: v.vaccine_name,
          subtitle: v.next_due_date
            ? `Next due ${new Date(v.next_due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
            : 'Vaccination record',
          date: v.date_administered,
        });
      });

      (notesRes.data || []).forEach((n: any) => {
        const pet = petMap.get(n.pet_id) as any;
        items.push({
          id: `note-${n.id}`,
          kind: 'note',
          petId: n.pet_id,
          petName: pet?.name || 'Pet',
          petPhoto: pet?.photo_url || null,
          title: 'Health Note',
          subtitle: n.note,
          date: n.created_at,
        });
      });

      (medsRes.data || []).forEach((m: any) => {
        const pet = petMap.get(m.pet_id) as any;
        items.push({
          id: `med-${m.id}`,
          kind: 'medication',
          petId: m.pet_id,
          petName: pet?.name || 'Pet',
          petPhoto: pet?.photo_url || null,
          title: m.name,
          subtitle: m.scheduled_time ? `${m.dosage ? m.dosage + ' · ' : ''}${m.scheduled_time} daily` : (m.dosage || 'Active medication'),
          date: m.created_at,
        });
      });

      items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setHealthItems(items.slice(0, 4));
    } else {
      setHealthItems([]);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [])
  );

  const formatTaskDate = (dateStr: string) => {
    if (!dateStr) return { month: '—', day: '--' };
    const d = new Date(dateStr);
    return {
      month: d.toLocaleDateString('en-US', { month: 'short' }).toUpperCase(),
      day: d.getDate().toString(),
    };
  };

  const getHealthIconStyle = (kind: HealthItem['kind']) => {
    switch (kind) {
      case 'vaccination': return { icon: 'shield-checkmark' as const, color: TEAL, bg: TEAL_LIGHT };
      case 'note': return { icon: 'document-text' as const, color: ORANGE, bg: ORANGE_LIGHT };
      case 'medication': return { icon: 'medical' as const, color: PURPLE, bg: PURPLE_LIGHT };
    }
  };

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* ── Header ── */}
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <View style={{ flex: 1 }}>
          <Text style={styles.greeting}>Hello, {firstName}!</Text>
          <Text style={styles.headline}>How can we care{'\n'}for your pet today?</Text>
        </View>
        <View style={styles.headerIcons}>
          <TouchableOpacity
            style={styles.bellBtn}
            onPress={() => router.push('/(tabs)/notifications' as any)}
            activeOpacity={0.8}
          >
            <Ionicons name="notifications-outline" size={20} color={INK} />
            <View style={styles.bellDot} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.avatarBtn}
            onPress={() => router.push('/(tabs)/profile' as any)}
            activeOpacity={0.8}
          >
            {avatarUrl ? (
              <Image source={{ uri: avatarUrl }} style={styles.avatarImage} />
            ) : (
              <Ionicons name="person" size={18} color="#fff" />
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* ── My Pets ── */}
      <View style={styles.section}>
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>My Pets</Text>
          <TouchableOpacity onPress={() => router.push('/(tabs)/pets' as any)} style={styles.viewAllRow}>
            <Text style={styles.viewAll}>View all</Text>
            <Ionicons name="chevron-forward" size={14} color={TEAL} />
          </TouchableOpacity>
        </View>

        {pets.length === 0 ? (
          <TouchableOpacity
            style={styles.emptyPetsCard}
            onPress={() => router.push('/(tabs)/pets' as any)}
            activeOpacity={0.85}
          >
            <MaterialCommunityIcons name="dog" size={22} color={TEAL} />
            <Text style={styles.emptyPetsText}>Add your first pet</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.petsRow}>
            {pets.map((pet, idx) => {
              const c = PET_CARD_COLORS[idx % 2];
              return (
                <TouchableOpacity
                  key={pet.id}
                  style={[styles.petCard, { backgroundColor: c.bg }]}
                  onPress={() => router.push({ pathname: '/pet-detail', params: { id: pet.id } } as any)}
                  activeOpacity={0.85}
                >
                  <View style={styles.petCardTop}>
                    {pet.photo_url ? (
                      <Image source={{ uri: pet.photo_url }} style={styles.petPhoto} />
                    ) : (
                      <View style={styles.petAvatarWrap}>
                        <MaterialCommunityIcons name="dog" size={22} color="#fff" />
                      </View>
                    )}
                    <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.85)" />
                  </View>
                  <Text style={styles.petName}>{pet.name}</Text>
                  <Text style={styles.petMeta}>
                    {pet.species}{pet.age ? ` · ${pet.age} yrs` : ''}
                  </Text>
                  <View style={[styles.healthyBadge, { backgroundColor: c.badgeBg }]}>
                    <Ionicons name="heart" size={10} color="#fff" />
                    <Text style={styles.healthyBadgeText}>Healthy</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </View>

      {/* ── Quick Actions ── */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Quick Actions</Text>
        <View style={styles.quickGrid}>
          {quickActions.map((action) => (
            <TouchableOpacity
              key={action.key}
              style={styles.quickCard}
              onPress={() => router.push({ pathname: action.route, params: action.params } as any)}
              activeOpacity={0.85}
            >
              <Image source={action.image} style={styles.quickImage} />
              <Text style={styles.quickLabel}>{action.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* ── Pet Health Updates ── */}
      <View style={styles.section}>
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>Pet Health Updates</Text>
        </View>

        {healthItems.length === 0 ? (
          <View style={styles.emptyTasksCard}>
            <Ionicons name="medkit-outline" size={20} color={SUB} />
            <Text style={styles.emptyTasksText}>No health records yet</Text>
          </View>
        ) : (
          healthItems.map((item) => {
            const iconStyle = getHealthIconStyle(item.kind);
            return (
              <TouchableOpacity
                key={item.id}
                style={styles.healthRow}
                onPress={() => router.push({ pathname: '/pet-detail', params: { id: item.petId } } as any)}
                activeOpacity={0.85}
              >
                <View style={[styles.healthIconWrap, { backgroundColor: iconStyle!.bg }]}>
                  <Ionicons name={iconStyle!.icon} size={18} color={iconStyle!.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <View style={styles.healthTitleRow}>
                    <Text style={styles.healthTitle}>{item.title}</Text>
                    <Text style={styles.healthPetName}>{item.petName}</Text>
                  </View>
                  <Text style={styles.healthSub} numberOfLines={1}>{item.subtitle}</Text>
                </View>
                {item.petPhoto ? (
                  <Image source={{ uri: item.petPhoto }} style={styles.healthPetThumb} />
                ) : (
                  <View style={[styles.healthPetThumb, styles.healthPetThumbFallback]}>
                    <MaterialCommunityIcons name="dog" size={14} color={TEAL} />
                  </View>
                )}
              </TouchableOpacity>
            );
          })
        )}
      </View>

      {/* ── Upcoming Tasks ── */}
      <View style={[styles.section, { marginBottom: 24 }]}>
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>Upcoming Tasks</Text>
          <TouchableOpacity onPress={() => router.push('/(tabs)/appointments' as any)} style={styles.viewAllRow}>
            <Text style={styles.viewAll}>View all</Text>
            <Ionicons name="chevron-forward" size={14} color={TEAL} />
          </TouchableOpacity>
        </View>

        {tasks.length === 0 ? (
          <View style={styles.emptyTasksCard}>
            <Ionicons name="calendar-outline" size={20} color={SUB} />
            <Text style={styles.emptyTasksText}>No upcoming tasks</Text>
          </View>
        ) : (
          tasks.map((task, idx) => {
            const { month, day } = formatTaskDate(task.requested_date);
            const badgeColor = idx % 2 === 0 ? ORANGE : TEAL;
            return (
              <TouchableOpacity
                key={task.id}
                style={styles.taskRow}
                onPress={() => router.push('/(tabs)/appointments' as any)}
                activeOpacity={0.85}
              >
                <View style={[styles.taskDateBadge, { backgroundColor: badgeColor }]}>
                  <Text style={styles.taskDateMonth}>{month}</Text>
                  <Text style={styles.taskDateDay}>{day}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.taskTitle}>{task.service}</Text>
                  <Text style={styles.taskSub}>
                    {task.pet_name}
                    {task.scheduled_time ? ` · ${task.scheduled_time}` : ''}
                  </Text>
                </View>
                <View style={styles.taskPetThumb}>
                  <MaterialCommunityIcons name="shopping-outline" size={16} color={TEAL} />
                </View>
                <Ionicons name="chevron-forward" size={16} color="#D1D5DB" />
              </TouchableOpacity>
            );
          })
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },

  /* ── Header ── */
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingBottom: 10,
  },
  greeting: { fontSize: 13, color: SUB, marginBottom: 4, fontWeight: '500' },
  headline: { fontSize: 22, fontWeight: '800', color: INK, lineHeight: 28, letterSpacing: -0.4 },
  headerIcons: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  bellBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: '#fff',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
  },
  bellDot: {
    position: 'absolute', top: 8, right: 9,
    width: 7, height: 7, borderRadius: 3.5,
    backgroundColor: ORANGE, borderWidth: 1.5, borderColor: '#fff',
  },
  avatarBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: TEAL,
    alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImage: { width: 40, height: 40, borderRadius: 20 },

  /* ── Section shell ── */
  section: { paddingHorizontal: 18, marginTop: 20 },
  sectionHeaderRow: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', marginBottom: 12,
  },
  sectionTitle: { fontSize: 17, fontWeight: '800', color: INK, letterSpacing: -0.2, marginBottom: 12 },
  viewAllRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  viewAll: { fontSize: 12.5, fontWeight: '700', color: TEAL },

  /* ── My Pets ── */
  petsRow: { flexDirection: 'row', gap: 10 },
  petCard: {
    flex: 1, borderRadius: 18, padding: 14, minHeight: 150,
    justifyContent: 'flex-end',
  },
  petCardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  petAvatarWrap: {
    width: 46, height: 46, borderRadius: 23,
    backgroundColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center', justifyContent: 'center',
  },
  petPhoto: { width: 46, height: 46, borderRadius: 23, borderWidth: 2, borderColor: 'rgba(255,255,255,0.6)' },
  petName: { fontSize: 17, fontWeight: '800', color: '#fff', marginBottom: 2 },
  petMeta: { fontSize: 12, color: 'rgba(255,255,255,0.85)', marginBottom: 10 },
  healthyBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    alignSelf: 'flex-start',
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 20,
  },
  healthyBadgeText: { fontSize: 11, fontWeight: '700', color: '#fff' },

  emptyPetsCard: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#fff', borderRadius: 14,
    borderWidth: 1.5, borderColor: '#dde3ef', borderStyle: 'dashed',
    padding: 16, justifyContent: 'center',
  },
  emptyPetsText: { fontSize: 13, fontWeight: '600', color: TEAL },

  /* ── Quick Actions ── */
  quickGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  quickCard: {
    width: '31%',
    backgroundColor: '#fff',
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 5, elevation: 2,
  },
  quickImage: {
    width: '100%',
    height: 90,
  },
  quickLabel: {
    fontSize: 11.5, fontWeight: '700', color: INK,
    textAlign: 'center', lineHeight: 14,
    paddingVertical: 10, paddingHorizontal: 4,
  },

  /* ── Pet Health Updates ── */
  healthRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#fff', borderRadius: 16,
    padding: 13, marginBottom: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 5, elevation: 2,
  },
  healthIconWrap: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
  },
  healthTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 3 },
  healthTitle: { fontSize: 13.5, fontWeight: '800', color: INK },
  healthPetName: { fontSize: 11, color: SUB, fontWeight: '600' },
  healthSub: { fontSize: 12, color: SUB },
  healthPetThumb: { width: 30, height: 30, borderRadius: 15 },
  healthPetThumbFallback: { backgroundColor: TEAL_LIGHT, alignItems: 'center', justifyContent: 'center' },

  /* ── Upcoming Tasks ── */
  taskRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#fff', borderRadius: 16,
    padding: 13, marginBottom: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 5, elevation: 2,
  },
  taskDateBadge: {
    width: 50, height: 50, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  taskDateMonth: { fontSize: 9, fontWeight: '700', color: '#fff', letterSpacing: 0.5 },
  taskDateDay: { fontSize: 18, fontWeight: '800', color: '#fff', marginTop: 1 },
  taskTitle: { fontSize: 14.5, fontWeight: '800', color: INK, marginBottom: 3 },
  taskSub: { fontSize: 12, color: SUB },
  taskPetThumb: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: TEAL_LIGHT,
    alignItems: 'center', justifyContent: 'center',
  },

  emptyTasksCard: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#fff', borderRadius: 14,
    padding: 16, justifyContent: 'center',
  },
  emptyTasksText: { fontSize: 13, color: SUB, fontWeight: '500' },
});