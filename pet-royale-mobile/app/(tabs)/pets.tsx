import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';

const NAV = '#1a237e';
const GOLD = '#f5c518';
const BG = '#f0f2f8';

const speciesOptions = ['Dog', 'Cat', 'Bird', 'Rabbit', 'Others'];
const genderOptions = ['Male', 'Female'];
const neuteredOptions = ['Yes', 'No', 'Unknown'];
const breedQuickOptions = ['Unknown', 'Mixed'];

export default function MyPetsScreen() {
  const [pets, setPets] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingPet, setEditingPet] = useState<any>(null);
  const [error, setError] = useState('');

  // Form fields
  const [name, setName] = useState('');
  const [selectedSpecies, setSelectedSpecies] = useState('');
  const [otherSpecies, setOtherSpecies] = useState('');
  const [breedQuick, setBreedQuick] = useState(''); // 'Unknown' | 'Mixed' | ''
  const [breed, setBreed] = useState('');
  const [age, setAge] = useState('');
  const [selectedGender, setSelectedGender] = useState('');
  const [weight, setWeight] = useState('');
  const [color, setColor] = useState('');
  const [neutered, setNeutered] = useState('');

  useEffect(() => { fetchPets(); }, []);

  const fetchPets = async () => {
    setIsLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data, error } = await supabase
      .from('pets').select('*').eq('owner_id', user.id)
      .order('created_at', { ascending: false });
    if (!error) setPets(data || []);
    setIsLoading(false);
  };

  const openAdd = () => {
    setEditingPet(null);
    resetForm();
    setShowModal(true);
  };

  const openEdit = (pet: any) => {
    setEditingPet(pet);
    setName(pet.name || '');
    // Species
    const knownSpecies = speciesOptions.filter(s => s !== 'Others');
    if (knownSpecies.includes(pet.species)) {
      setSelectedSpecies(pet.species);
      setOtherSpecies('');
    } else {
      setSelectedSpecies('Others');
      setOtherSpecies(pet.species || '');
    }
    // Breed
    if (pet.breed === 'Unknown' || pet.breed === 'Mixed') {
      setBreedQuick(pet.breed);
      setBreed('');
    } else {
      setBreedQuick('');
      setBreed(pet.breed || '');
    }
    setAge(pet.age ? String(pet.age) : '');
    setSelectedGender(pet.gender || '');
    setWeight(pet.weight ? String(pet.weight) : '');
    setColor(pet.color || '');
    setNeutered(pet.neutered || '');
    setError('');
    setShowModal(true);
  };

  const resetForm = () => {
    setName(''); setSelectedSpecies(''); setOtherSpecies('');
    setBreedQuick(''); setBreed(''); setAge('');
    setSelectedGender(''); setWeight(''); setColor(''); setNeutered('');
    setError('');
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingPet(null);
    resetForm();
  };

  const getBreedValue = () => {
    if (breedQuick) return breedQuick;
    return breed || null;
  };

  const handleSubmit = async () => {
    if (!name || !selectedSpecies || !selectedGender) {
      setError('Please fill in all required fields.');
      return;
    }
    if (selectedSpecies === 'Others' && !otherSpecies) {
      setError('Please enter the type of pet.');
      return;
    }
    setIsSubmitting(true);
    setError('');

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setError('You must be logged in.'); setIsSubmitting(false); return; }

    const payload = {
      name,
      species: selectedSpecies === 'Others' ? otherSpecies : selectedSpecies,
      breed: getBreedValue(),
      age: age ? parseInt(age) : null,
      gender: selectedGender,
      weight: weight ? parseFloat(weight) : null,
      color: color || null,
      neutered: neutered || null,
    };

    let error;
    if (editingPet) {
      ({ error } = await supabase.from('pets').update(payload).eq('id', editingPet.id));
    } else {
      ({ error } = await supabase.from('pets').insert([{ ...payload, owner_id: user.id }]));
    }

    setIsSubmitting(false);
    if (error) { setError('Failed to save pet. Please try again.'); return; }
    closeModal();
    fetchPets();
  };

  const handleDelete = async (id: string) => {
    await supabase.from('pets').delete().eq('id', id);
    fetchPets();
  };

  const getSpeciesEmoji = (species: string) => {
    const s = species?.toLowerCase().trim();
    if (['dog','puppy','pup','aspin','shih tzu','bulldog','poodle','husky','labrador',
      'golden retriever','beagle','dachshund','chihuahua','rottweiler','doberman',
      'pomeranian','maltese','chow chow','german shepherd','yorkshire','terrier',
      'boxer','dalmatian'].some(k => s.includes(k))) return '🐶';
    if (['cat','kitten','kitty','persian','siamese','bengal','ragdoll','maine coon',
      'sphynx','tabby','angora'].some(k => s.includes(k))) return '🐱';
    if (['bird','parrot','cockatiel','canary','dove','pigeon','macaw','lovebird',
      'budgie','parakeet','mynah','finch'].some(k => s.includes(k))) return '🐦';
    if (['rabbit','bunny','hare'].some(k => s.includes(k))) return '🐰';
    if (['hamster','gerbil','guinea pig','guinea'].some(k => s.includes(k))) return '🐹';
    if (['mouse','rat','mice'].some(k => s.includes(k))) return '🐭';
    if (['turtle','tortoise'].some(k => s.includes(k))) return '🐢';
    if (['lizard','gecko','iguana','chameleon','monitor','skink'].some(k => s.includes(k))) return '🦎';
    if (['snake','python','boa','corn snake','ball python'].some(k => s.includes(k))) return '🐍';
    if (['hedgehog'].some(k => s.includes(k))) return '🦔';
    if (['ferret'].some(k => s.includes(k))) return '🦡';
    return '🐾';
  };

  const getSpeciesColor = (species: string) => {
    const s = species?.toLowerCase().trim();
    if (['dog','puppy','pup','aspin','shih tzu','bulldog','poodle','husky','labrador',
      'golden retriever','beagle','dachshund','chihuahua','rottweiler','doberman',
      'pomeranian','maltese','chow chow','german shepherd','yorkshire','terrier',
      'boxer','dalmatian'].some(k => s.includes(k))) return '#e65100';
    if (['cat','kitten','kitty','persian','siamese','bengal','ragdoll','maine coon',
      'sphynx','tabby','angora'].some(k => s.includes(k))) return '#6a1b9a';
    if (['bird','parrot','cockatiel','canary','dove','pigeon','macaw','lovebird',
      'budgie','parakeet','mynah','finch'].some(k => s.includes(k))) return '#1565c0';
    if (['rabbit','bunny','hare'].some(k => s.includes(k))) return '#2e7d32';
    if (['hamster','gerbil','guinea pig','guinea'].some(k => s.includes(k))) return '#e53935';
    if (['mouse','rat','mice'].some(k => s.includes(k))) return '#546e7a';
    if (['turtle','tortoise'].some(k => s.includes(k))) return '#2e7d32';
    if (['lizard','gecko','iguana','chameleon','monitor','skink'].some(k => s.includes(k))) return '#558b2f';
    if (['snake','python','boa','corn snake','ball python'].some(k => s.includes(k))) return '#c62828';
    if (['hedgehog'].some(k => s.includes(k))) return '#4e342e';
    if (['ferret'].some(k => s.includes(k))) return '#f9a825';
    return '#546e7a';
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
            <Text style={styles.headerTitle}>My Pets</Text>
            <Text style={styles.headerSub}>MANAGE YOUR PET PROFILES</Text>
          </View>
        </View>
      </View>

      {/* ── Pet List ── */}
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {isLoading ? (
          <ActivityIndicator size="large" color={NAV} style={{ marginTop: 48 }} />
        ) : pets.length === 0 ? (
          <View style={styles.empty}>
            <View style={styles.emptyIconWrap}>
              <Text style={{ fontSize: 30 }}>🐾</Text>
            </View>
            <Text style={styles.emptyTitle}>No Pets Yet</Text>
            <Text style={styles.emptyText}>Add your first pet to get started!</Text>
          </View>
        ) : (
          pets.map((pet) => {
            const color = getSpeciesColor(pet.species);
            return (
              <View key={pet.id} style={styles.petCard}>
                <View style={[styles.cardAccent, { backgroundColor: color }]} />
                <View style={[styles.petEmojiWrap, { backgroundColor: color + '18' }]}>
                  <Text style={styles.petEmoji}>{getSpeciesEmoji(pet.species)}</Text>
                </View>
                <View style={styles.petInfo}>
                  <Text style={styles.petName}>{pet.name}</Text>
                  <Text style={styles.petSpecies}>
                    {pet.species}{pet.breed ? ` · ${pet.breed}` : ''}
                  </Text>
                  <View style={styles.petMeta}>
                    {pet.gender ? (
                      <View style={styles.metaChip}>
                        <Ionicons
                          name={pet.gender === 'Male' ? 'male' : 'female'}
                          size={10}
                          color={pet.gender === 'Male' ? '#1565c0' : '#c2185b'}
                        />
                        <Text style={[styles.metaText, { color: pet.gender === 'Male' ? '#1565c0' : '#c2185b' }]}>
                          {pet.gender}
                        </Text>
                      </View>
                    ) : null}
                    {pet.age ? (
                      <View style={styles.metaChip}>
                        <Ionicons name="calendar-outline" size={10} color="#8a97b0" />
                        <Text style={styles.metaText}>{pet.age} yrs</Text>
                      </View>
                    ) : null}
                    {pet.weight ? (
                      <View style={styles.metaChip}>
                        <Ionicons name="scale-outline" size={10} color="#8a97b0" />
                        <Text style={styles.metaText}>{pet.weight} kg</Text>
                      </View>
                    ) : null}
                    {pet.neutered && pet.neutered !== 'Unknown' ? (
                      <View style={styles.metaChip}>
                        <Ionicons name="medkit-outline" size={10} color="#8a97b0" />
                        <Text style={styles.metaText}>
                          {pet.gender === 'Female' ? 'Spayed' : 'Neutered'}: {pet.neutered}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                  {pet.color ? (
                    <Text style={styles.petColor}>🎨 {pet.color}</Text>
                  ) : null}
                </View>
                <View style={styles.cardActions}>
                  <TouchableOpacity style={styles.editBtn} onPress={() => openEdit(pet)}>
                    <Ionicons name="pencil-outline" size={16} color={NAV} />
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.deleteBtn} onPress={() => handleDelete(pet.id)}>
                    <Ionicons name="trash-outline" size={16} color="#c0392b" />
                  </TouchableOpacity>
                </View>
              </View>
            );
          })
        )}
        <View style={{ height: 20 }} />
      </ScrollView>

      {/* ── Add Pet Button ── */}
      <TouchableOpacity style={styles.addBtn} onPress={openAdd} activeOpacity={0.85}>
        <Ionicons name="add" size={20} color={NAV} />
        <Text style={styles.addBtnText}>Add New Pet</Text>
      </TouchableOpacity>

      {/* ── Add / Edit Modal ── */}
      <Modal visible={showModal} animationType="slide" transparent>
        <View style={styles.sheetOverlay}>
          <View style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>{editingPet ? 'Edit Pet' : 'Add New Pet'}</Text>
              <TouchableOpacity onPress={closeModal}>
                <Ionicons name="close" size={22} color="#4a5568" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {error ? (
                <View style={styles.errorBox}>
                  <Ionicons name="alert-circle-outline" size={15} color="#c0392b" />
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              ) : null}

              {/* Name */}
              <Text style={styles.label}>Pet Name <Text style={styles.required}>*</Text></Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. Buddy"
                placeholderTextColor="#bcc5d8"
                value={name}
                onChangeText={setName}
              />

              {/* Species */}
              <Text style={styles.label}>Species <Text style={styles.required}>*</Text></Text>
              <View style={styles.chipsRow}>
                {speciesOptions.map((s) => (
                  <TouchableOpacity
                    key={s}
                    style={[styles.chip, selectedSpecies === s && styles.chipActive]}
                    onPress={() => { setSelectedSpecies(s); setOtherSpecies(''); }}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.chipText, selectedSpecies === s && styles.chipTextActive]}>{s}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {selectedSpecies === 'Others' && (
                <>
                  <TextInput
                    style={styles.input}
                    placeholder="e.g. Hamster, Snake, Turtle…"
                    placeholderTextColor="#bcc5d8"
                    value={otherSpecies}
                    onChangeText={setOtherSpecies}
                  />
                  {otherSpecies ? (
                    <View style={styles.emojiPreview}>
                      <Text style={{ fontSize: 24 }}>{getSpeciesEmoji(otherSpecies)}</Text>
                      <Text style={styles.emojiPreviewText}>
                        {getSpeciesEmoji(otherSpecies) === '🐾' ? 'Unknown pet type' : otherSpecies}
                      </Text>
                    </View>
                  ) : null}
                </>
              )}

              {/* Breed */}
              <Text style={styles.label}>Breed <Text style={styles.optional}>(Optional)</Text></Text>
              <View style={styles.chipsRow}>
                {breedQuickOptions.map((b) => (
                  <TouchableOpacity
                    key={b}
                    style={[styles.chip, breedQuick === b && styles.chipActive]}
                    onPress={() => { setBreedQuick(breedQuick === b ? '' : b); setBreed(''); }}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.chipText, breedQuick === b && styles.chipTextActive]}>{b}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              {!breedQuick && (
                <TextInput
                  style={styles.input}
                  placeholder="Or type breed (e.g. Shih Tzu, Persian…)"
                  placeholderTextColor="#bcc5d8"
                  value={breed}
                  onChangeText={setBreed}
                />
              )}

              {/* Gender */}
              <Text style={styles.label}>Gender <Text style={styles.required}>*</Text></Text>
              <View style={styles.chipsRow}>
                {genderOptions.map((g) => (
                  <TouchableOpacity
                    key={g}
                    style={[styles.chip, selectedGender === g && styles.chipActive]}
                    onPress={() => setSelectedGender(g)}
                    activeOpacity={0.8}
                  >
                    <Ionicons
                      name={g === 'Male' ? 'male' : 'female'}
                      size={13}
                      color={selectedGender === g ? '#fff' : g === 'Male' ? '#1565c0' : '#c2185b'}
                    />
                    <Text style={[styles.chipText, selectedGender === g && styles.chipTextActive]}>{g}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Neutered / Spayed */}
              <Text style={styles.label}>
                {selectedGender === 'Female' ? 'Spayed' : 'Neutered'}{' '}
                <Text style={styles.optional}>(Optional)</Text>
              </Text>
              <View style={styles.chipsRow}>
                {neuteredOptions.map((n) => (
                  <TouchableOpacity
                    key={n}
                    style={[styles.chip, neutered === n && styles.chipActive]}
                    onPress={() => setNeutered(neutered === n ? '' : n)}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.chipText, neutered === n && styles.chipTextActive]}>{n}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Age & Weight row */}
              <View style={styles.twoCol}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>Age (Years) <Text style={styles.optional}>(Opt.)</Text></Text>
                  <TextInput
                    style={styles.input}
                    placeholder="e.g. 2"
                    placeholderTextColor="#bcc5d8"
                    value={age}
                    onChangeText={setAge}
                    keyboardType="numeric"
                  />
                </View>
                <View style={{ width: 10 }} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>Weight (kg) <Text style={styles.optional}>(Opt.)</Text></Text>
                  <TextInput
                    style={styles.input}
                    placeholder="e.g. 4.5"
                    placeholderTextColor="#bcc5d8"
                    value={weight}
                    onChangeText={setWeight}
                    keyboardType="decimal-pad"
                  />
                </View>
              </View>

              {/* Color */}
              <Text style={styles.label}>Color / Markings <Text style={styles.optional}>(Optional)</Text></Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. Brown with white spots"
                placeholderTextColor="#bcc5d8"
                value={color}
                onChangeText={setColor}
              />

              <TouchableOpacity style={styles.submitBtn} onPress={handleSubmit} disabled={isSubmitting} activeOpacity={0.85}>
                {isSubmitting ? (
                  <ActivityIndicator color={NAV} />
                ) : (
                  <Text style={styles.submitBtnText}>{editingPet ? 'Save Changes' : 'Add Pet'}</Text>
                )}
              </TouchableOpacity>

              <View style={{ height: 24 }} />
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },

  header: {
    backgroundColor: NAV,
    paddingHorizontal: 16, paddingTop: 16, paddingBottom: 14,
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

  empty: { alignItems: 'center', paddingTop: 60, gap: 10 },
  emptyIconWrap: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: NAV, alignItems: 'center', justifyContent: 'center', marginBottom: 4,
  },
  emptyTitle: { fontSize: 17, fontWeight: '800', color: NAV, letterSpacing: -0.2 },
  emptyText: { fontSize: 13, color: '#8a97b0' },

  petCard: {
    backgroundColor: '#fff', borderRadius: 12,
    flexDirection: 'row', alignItems: 'center',
    marginBottom: 10, overflow: 'hidden',
    shadowColor: NAV, shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07, shadowRadius: 6, elevation: 3,
  },
  cardAccent: { width: 4, alignSelf: 'stretch' },
  petEmojiWrap: {
    width: 50, height: 50, borderRadius: 25,
    alignItems: 'center', justifyContent: 'center',
    marginHorizontal: 11,
  },
  petEmoji: { fontSize: 24 },
  petInfo: { flex: 1, paddingVertical: 12 },
  petName: { fontSize: 15, fontWeight: '800', color: NAV, letterSpacing: -0.2, marginBottom: 2 },
  petSpecies: { fontSize: 11.5, color: '#6b7a99', marginBottom: 5 },
  petMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
  metaChip: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: BG, borderRadius: 6,
    paddingHorizontal: 6, paddingVertical: 2,
  },
  metaText: { fontSize: 10, fontWeight: '600', color: '#8a97b0' },
  petColor: { fontSize: 10.5, color: '#8a97b0', marginTop: 4 },

  cardActions: { flexDirection: 'column', paddingHorizontal: 10, gap: 8, alignItems: 'center' },
  editBtn: {
    width: 30, height: 30, borderRadius: 8,
    backgroundColor: '#eef1f8', alignItems: 'center', justifyContent: 'center',
  },
  deleteBtn: {
    width: 30, height: 30, borderRadius: 8,
    backgroundColor: '#fdecea', alignItems: 'center', justifyContent: 'center',
  },

  addBtn: {
    backgroundColor: GOLD, marginHorizontal: 14, marginBottom: 14,
    paddingVertical: 14, borderRadius: 10,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
  },
  addBtnText: { color: NAV, fontSize: 14, fontWeight: '800' },

  sheetOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 20, maxHeight: '92%',
  },
  sheetHeader: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', marginBottom: 14,
  },
  sheetTitle: { fontSize: 16, fontWeight: '800', color: NAV },

  errorBox: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    backgroundColor: '#fdecea', borderWidth: 1, borderColor: '#f5c6c0',
    borderRadius: 8, padding: 10, marginBottom: 12,
  },
  errorText: { color: '#c0392b', fontSize: 12.5, flex: 1 },

  label: {
    fontSize: 11, fontWeight: '700', color: '#4a5568',
    letterSpacing: 0.9, textTransform: 'uppercase',
    marginBottom: 7, marginTop: 12,
  },
  required: { color: '#c0392b', fontWeight: '700' },
  optional: { color: '#8a97b0', fontWeight: '400', textTransform: 'none', letterSpacing: 0, fontSize: 10 },

  input: {
    backgroundColor: BG, borderWidth: 1.5, borderColor: '#dde3ef',
    borderRadius: 9, paddingHorizontal: 13, paddingVertical: 11,
    fontSize: 14, color: NAV, marginBottom: 4,
  },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    borderWidth: 1.5, borderColor: '#dde3ef',
    borderRadius: 8, paddingHorizontal: 13, paddingVertical: 8,
    backgroundColor: '#fff',
  },
  chipActive: { backgroundColor: NAV, borderColor: NAV },
  chipText: { fontSize: 13, color: '#4a5568', fontWeight: '500' },
  chipTextActive: { color: '#fff', fontWeight: '700' },

  emojiPreview: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#eef1f8', borderRadius: 9,
    padding: 10, marginTop: 4, marginBottom: 4,
  },
  emojiPreviewText: { fontSize: 13, color: NAV, fontWeight: '600' },

  twoCol: { flexDirection: 'row', alignItems: 'flex-start' },

  submitBtn: {
    backgroundColor: GOLD, borderRadius: 10,
    paddingVertical: 14, alignItems: 'center',
    justifyContent: 'center', marginTop: 16,
  },
  submitBtnText: { color: NAV, fontSize: 14, fontWeight: '800' },
});
