import { sz } from '../constants/theme';
import { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, ActivityIndicator, Modal, TextInput, Alert, KeyboardAvoidingView, Platform, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { fetchPetVaccinations, fetchPetHealthNotes, fetchPetReminders, addClientReminder, toggleReminderDone } from '@/lib/petDetails';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const TEAL = '#0D9488';
const TEAL_LIGHT = '#CCFBF1';
const ORANGE = '#F97316';
const ORANGE_LIGHT = '#FFEDD5';
const BORDER = '#E5E7EB';
const SUB = '#6B7280';
const INK = '#111827';
const BG = '#F4F7FB';

const DAY_MS = 86400000;

/* Date helpers live outside the component: they use the current time,
   which React's purity rule doesn't allow inside render. */
const isVaccineDue = (nextDue: string | null) => {
  if (!nextDue) return false;
  return new Date(nextDue) <= new Date();
};

const daysUntil = (dateStr: string) => {
  const diff = new Date(dateStr).getTime() - Date.now();
  return Math.ceil(diff / DAY_MS);
};

export default function PetDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [pet, setPet] = useState<any>(null);
  const [vaccinations, setVaccinations] = useState<any[]>([]);
  const [healthNotes, setHealthNotes] = useState<any[]>([]);
  const [reminders, setReminders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [showMenu, setShowMenu] = useState(false);

  const [showAddReminder, setShowAddReminder] = useState(false);
  const [reminderTitle, setReminderTitle] = useState('');
  const [reminderDate, setReminderDate] = useState('');
  const [saving, setSaving] = useState(false);

  const loadData = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    const { data: petData } = await supabase.from('pets').select('*').eq('id', id).single();
    setPet(petData);

    const [vax, notes, rem] = await Promise.all([
      fetchPetVaccinations(id),
      fetchPetHealthNotes(id),
      fetchPetReminders(id),
    ]);
    setVaccinations(vax);
    setHealthNotes(notes);
    setReminders(rem);
    setLoading(false);
  }, [id]);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  const handleAddReminder = async () => {
    if (!reminderTitle.trim() || !reminderDate) {
      Alert.alert('Missing Info', 'Please enter a title and date.');
      return;
    }
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      await addClientReminder(id!, user.id, reminderTitle.trim(), reminderDate);
      setReminderTitle('');
      setReminderDate('');
      setShowAddReminder(false);
      loadData();
    } catch {
      Alert.alert('Error', 'Failed to add reminder.');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleReminder = async (reminderId: string, current: boolean) => {
    await toggleReminderDone(reminderId, !current);
    loadData();
  };

  const handleEdit = () => {
    setShowMenu(false);
    router.push({ pathname: '/(tabs)/pets', params: { editId: pet.id } } as any);
  };

  const handleDelete = () => {
    setShowMenu(false);
    Alert.alert('Delete Pet', `Are you sure you want to remove ${pet.name}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.from('pets').delete().eq('id', pet.id);
          if (error) {
            Alert.alert('Error', 'Failed to delete pet. Please try again.');
            return;
          }
          router.back();
        },
      },
    ]);
  };

  if (loading || !pet) {
    return <View style={styles.loadingWrap}><ActivityIndicator size="large" color={TEAL} /></View>;
  }

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity style={styles.headerBtn} onPress={() => router.back()} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={sz(22)} color={INK} />
        </TouchableOpacity>
        <View style={{ alignItems: 'center' }}>
          <Text style={styles.headerTitle}>{pet.name}</Text>
          <Text style={styles.headerSub}>{pet.species}{pet.age ? ` · ${pet.age} Yrs` : ''}</Text>
        </View>
        <TouchableOpacity
          style={styles.headerBtn}
          onPress={() => setShowMenu(true)}
          activeOpacity={0.7}
        >
          <Ionicons name="ellipsis-vertical" size={sz(18)} color={INK} />
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* ── Photo ── */}
        <View style={styles.photoSection}>
          {pet.photo_url ? (
            <Image source={{ uri: pet.photo_url }} style={styles.photo} />
          ) : (
            <View style={styles.photoFallback}>
              <Ionicons name="paw" size={sz(40)} color={TEAL} />
            </View>
          )}
        </View>

        {/* ── Quick stats ── */}
        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Ionicons name="paw-outline" size={sz(15)} color={TEAL} />
            <Text style={styles.statLabel}>Breed</Text>
            <Text style={styles.statValue} numberOfLines={1}>{pet.breed || '—'}</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Ionicons name="calendar-outline" size={sz(15)} color={TEAL} />
            <Text style={styles.statLabel}>Age</Text>
            <Text style={styles.statValue}>{pet.age ? `${pet.age} Years` : '—'}</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Ionicons name="scale-outline" size={sz(15)} color={TEAL} />
            <Text style={styles.statLabel}>Weight</Text>
            <Text style={styles.statValue}>{pet.weight ? `${pet.weight} kg` : '—'}</Text>
          </View>
        </View>

        {/* ── Vaccination Records ── */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Vaccination Records</Text>
            {vaccinations.length > 0 && <Text style={styles.seeAllLink}>See all</Text>}
          </View>
          {vaccinations.length === 0 ? (
            <View style={styles.emptyCard}>
              <Ionicons name="shield-outline" size={sz(20)} color={SUB} />
              <Text style={styles.emptyCardText}>No vaccination records yet. Your clinic will add these after a visit.</Text>
            </View>
          ) : (
            vaccinations.map((v) => (
              <View key={v.id} style={styles.recordCard}>
                <View style={styles.recordIconWrap}><Ionicons name="shield-checkmark" size={sz(16)} color={TEAL} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.recordTitle}>{v.vaccine_name}</Text>
                  <Text style={styles.recordSub}>
                    {new Date(v.date_administered).toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </Text>
                </View>
                {v.next_due_date && (
                  <View style={[styles.statusPill, isVaccineDue(v.next_due_date) ? styles.statusPillDue : styles.statusPillOk]}>
                    <Text style={[styles.statusPillText, isVaccineDue(v.next_due_date) ? { color: '#DC2626' } : { color: TEAL }]}>
                      {isVaccineDue(v.next_due_date) ? 'Due' : 'Up to date'}
                    </Text>
                  </View>
                )}
              </View>
            ))
          )}
        </View>

        {/* ── Health Notes ── */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Health Notes</Text>
            {healthNotes.length > 0 && <Text style={styles.seeAllLink}>See all</Text>}
          </View>
          {healthNotes.length === 0 ? (
            <View style={styles.emptyCard}>
              <Ionicons name="document-text-outline" size={sz(20)} color={SUB} />
              <Text style={styles.emptyCardText}>No health notes yet.</Text>
            </View>
          ) : (
            healthNotes.map((n) => (
              <View key={n.id} style={styles.recordCard}>
                <View style={[styles.recordIconWrap, { backgroundColor: ORANGE_LIGHT }]}>
                  <Ionicons name="clipboard-outline" size={sz(16)} color={ORANGE} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.recordTitle}>{n.note}</Text>
                  <Text style={styles.recordSub}>
                    {new Date(n.created_at).toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </Text>
                </View>
              </View>
            ))
          )}
        </View>

        {/* ── Reminders ── */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Reminders</Text>
            <TouchableOpacity onPress={() => setShowAddReminder(true)}>
              <Text style={styles.addLink}>+ Add</Text>
            </TouchableOpacity>
          </View>
          {reminders.length === 0 ? (
            <View style={styles.emptyCard}>
              <Ionicons name="alarm-outline" size={sz(20)} color={SUB} />
              <Text style={styles.emptyCardText}>No reminders set.</Text>
            </View>
          ) : (
            reminders.map((r) => {
              const days = r.due_date ? daysUntil(r.due_date) : null;
              return (
                <TouchableOpacity
                  key={r.id}
                  style={styles.recordCard}
                  onPress={() => handleToggleReminder(r.id, r.is_done)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.recordIconWrap, r.is_done && { backgroundColor: '#F3F4F6' }]}>
                    <Ionicons
                      name={r.is_done ? 'checkmark-circle' : 'notifications-outline'}
                      size={sz(16)}
                      color={r.is_done ? '#9CA3AF' : ORANGE}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.recordTitle, r.is_done && styles.recordTitleDone]}>{r.title}</Text>
                    <Text style={styles.recordSub}>
                      {r.source === 'system' ? 'From clinic · ' : ''}
                      {r.due_date ? new Date(r.due_date).toLocaleDateString('en-US', { day: '2-digit', month: 'short' }) : ''}
                      {days !== null && days >= 0 && !r.is_done ? ` · In ${days}d` : ''}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })
          )}
        </View>

        <View style={{ height: sz(32) }} />
      </ScrollView>

      {/* ── Header menu: Edit Pet / Delete Pet ── */}
      <Modal visible={showMenu} transparent animationType="fade" onRequestClose={() => setShowMenu(false)}>
        <Pressable style={styles.menuOverlay} onPress={() => setShowMenu(false)}>
          <View style={[styles.dropdownMenu, { top: insets.top + 52, right: 12 }]}>
            <TouchableOpacity style={styles.dropdownItem} onPress={handleEdit}>
              <Ionicons name="pencil-outline" size={sz(16)} color={INK} />
              <Text style={styles.dropdownItemText}>Edit Pet</Text>
            </TouchableOpacity>
            <View style={styles.dropdownDivider} />
            <TouchableOpacity style={styles.dropdownItem} onPress={handleDelete}>
              <Ionicons name="trash-outline" size={sz(16)} color="#DC2626" />
              <Text style={[styles.dropdownItemText, { color: '#DC2626' }]}>Delete Pet</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>

      {/* ── Add Reminder modal ── */}
      <Modal visible={showAddReminder} transparent animationType="slide">
        <KeyboardAvoidingView
          style={styles.sheetOverlay}
          behavior="padding"
          keyboardVerticalOffset={Platform.OS === 'android' ? 20 : 0}
        >
          <View style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Add Reminder</Text>
              <TouchableOpacity onPress={() => setShowAddReminder(false)}><Ionicons name="close" size={sz(22)} color={SUB} /></TouchableOpacity>
            </View>
            <Text style={styles.label}>Title</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Buy flea medicine"
              placeholderTextColor="#9CA3AF"
              value={reminderTitle}
              onChangeText={setReminderTitle}
            />
            <Text style={styles.label}>Date (YYYY-MM-DD)</Text>
            <TextInput
              style={styles.input}
              placeholder="2026-09-15"
              placeholderTextColor="#9CA3AF"
              value={reminderDate}
              onChangeText={setReminderDate}
            />
            <TouchableOpacity style={styles.saveBtn} onPress={handleAddReminder} disabled={saving} activeOpacity={0.85}>
              {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>Add Reminder</Text>}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: BG },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#fff', paddingHorizontal: 12, paddingBottom: 14,
    borderBottomWidth: 1, borderBottomColor: BORDER,
  },
  headerBtn: { width: sz(38), height: sz(38), borderRadius: 19, backgroundColor: BG, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: sz(16), fontWeight: '800', color: INK },
  headerSub: { fontSize: sz(11.5), color: SUB, marginTop: 1 },

  menuOverlay: { flex: 1 },
  dropdownMenu: {
    position: 'absolute',
    backgroundColor: '#fff', borderRadius: 12, paddingVertical: 6, width: sz(160),
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 14, elevation: 12,
  },
  dropdownItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 12 },
  dropdownItemText: { fontSize: sz(13.5), fontWeight: '600', color: INK },
  dropdownDivider: { height: 1, backgroundColor: BORDER, marginHorizontal: 8 },

  photoSection: { alignItems: 'center', paddingVertical: 24 },
  photo: { width: sz(130), height: sz(130), borderRadius: 65 },
  photoFallback: { width: sz(130), height: sz(130), borderRadius: 65, backgroundColor: TEAL_LIGHT, alignItems: 'center', justifyContent: 'center' },

  statsRow: {
    flexDirection: 'row', backgroundColor: '#fff', marginHorizontal: 16,
    borderRadius: 14, paddingVertical: 14,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 5, elevation: 1,
  },
  statItem: { flex: 1, alignItems: 'center', gap: 3, paddingHorizontal: 4 },
  statDivider: { width: 1, backgroundColor: BORDER },
  statLabel: { fontSize: sz(10), color: SUB, fontWeight: '600', textTransform: 'uppercase' },
  statValue: { fontSize: sz(12.5), color: INK, fontWeight: '700' },

  section: { paddingHorizontal: 16, marginTop: 22 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  sectionTitle: { fontSize: sz(14.5), fontWeight: '800', color: INK },
  seeAllLink: { fontSize: sz(12.5), fontWeight: '700', color: TEAL },
  addLink: { fontSize: sz(12.5), fontWeight: '700', color: TEAL },

  emptyCard: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#fff', borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: BORDER, borderStyle: 'dashed',
  },
  emptyCardText: { flex: 1, fontSize: sz(12), color: SUB, lineHeight: sz(17) },

  recordCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#fff', borderRadius: 12, padding: 12, marginBottom: 8,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.03, shadowRadius: 4, elevation: 1,
  },
  recordIconWrap: { width: sz(34), height: sz(34), borderRadius: 10, backgroundColor: TEAL_LIGHT, alignItems: 'center', justifyContent: 'center' },
  recordTitle: { fontSize: sz(13), fontWeight: '700', color: INK },
  recordTitleDone: { textDecorationLine: 'line-through', color: SUB },
  recordSub: { fontSize: sz(11), color: SUB, marginTop: 2 },

  statusPill: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 20 },
  statusPillOk: { backgroundColor: TEAL_LIGHT },
  statusPillDue: { backgroundColor: '#FEE2E2' },
  statusPillText: { fontSize: sz(10.5), fontWeight: '700' },

  sheetOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 36 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  sheetTitle: { fontSize: sz(16), fontWeight: '800', color: INK },
  label: { fontSize: sz(11), fontWeight: '700', color: SUB, letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 7, marginTop: 12 },
  input: { backgroundColor: BG, borderWidth: 1.5, borderColor: BORDER, borderRadius: 10, paddingHorizontal: 13, paddingVertical: 12, fontSize: sz(14), color: INK },
  saveBtn: { backgroundColor: TEAL, borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginTop: 20 },
  saveBtnText: { color: '#fff', fontSize: sz(14), fontWeight: '800' },
});
