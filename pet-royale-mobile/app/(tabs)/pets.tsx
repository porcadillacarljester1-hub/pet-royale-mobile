import { useState, useEffect, useRef, type ReactNode } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  ActivityIndicator, Modal, Image, Pressable, Alert,
  RefreshControl, KeyboardAvoidingView, Platform,
} from 'react-native';
import { supabase } from '@/lib/supabase';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, text, fonts, space, radius, common, hitSlop } from '../../constants/theme';
import { TAB_BAR_CLEARANCE } from './_layout';
import { Skeleton } from '../../components/Skeleton';
import { useRealtimeRefresh } from '@/lib/useRealtimeRefresh';

const genderOptions = ['Male', 'Female'];
const neuteredOptions = ['Yes', 'No', 'Unknown'];

const STEPS = [
  { key: 1, label: 'Identity' },
  { key: 2, label: 'Details' },
  { key: 3, label: 'Review' },
];

interface SpeciesOption { id: string; name: string; }
interface BreedOption { id: string; name: string; }

/* Every species the clinic treats, entirely from the categories table
   (migration 033 seeded Dog/Cat/Bird/Rabbit there as real rows, so
   nothing regresses now that no species is hardcoded here anymore). */
async function fetchClinicSpecies(): Promise<SpeciesOption[]> {
  const { data, error } = await supabase
    .from('categories').select('id, name').eq('type', 'species').order('sort_order').order('name');
  if (error) return [];
  return data || [];
}

/* Breeds for one specific species — a real foreign-key relationship
   (migration 033's breeds table). No free-text fallback: breed is as
   locked-down as species, so the only thing typed by hand in this form
   is the pet's name. */
async function fetchBreedsForSpecies(speciesId: string): Promise<BreedOption[]> {
  const { data, error } = await supabase
    .from('breeds').select('id, name').eq('species_id', speciesId).order('sort_order').order('name');
  if (error) return [];
  return data || [];
}

/* The signed-in owner's pets. Returns the result instead of setting
   state, so the first load can run inside an effect without setting
   state synchronously (which the React Compiler lint rule flags). */
async function loadPets(): Promise<{ pets: any[]; error: string }> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { pets: [], error: 'You must be logged in to view your pets.' };
    const { data, error: fetchError } = await supabase
      .from('pets').select('*').eq('owner_id', user.id)
      .order('created_at', { ascending: false });
    if (fetchError) return { pets: [], error: 'Could not load your pets. Pull down to try again.' };
    return { pets: data || [], error: '' };
  } catch {
    return { pets: [], error: 'Could not load your pets. Pull down to try again.' };
  }
}

/* ── Pure helpers ── */

const hasValue = (v: unknown) => v !== null && v !== undefined && v !== '';

const initialOf = (name?: string | null) => (name?.trim()?.[0] || '?').toUpperCase();

function formatAge(age: unknown): string {
  if (!hasValue(age)) return '';
  const n = Number(age);
  if (Number.isNaN(n)) return '';
  if (n === 0) return 'Under 1 yr';
  return `${n} yr${n === 1 ? '' : 's'}`;
}

/* One line of facts under the pet's name: "Female · 3 yrs · 12 kg · Spayed: Yes".
   Missing values are left out rather than shown as dashes. */
function describePet(p: {
  gender?: string | null;
  age?: unknown;
  weight?: unknown;
  neutered?: string | null;
}): string {
  const parts: string[] = [];
  if (p.gender) parts.push(p.gender);
  const age = formatAge(p.age);
  if (age) parts.push(age);
  if (hasValue(p.weight) && Number(p.weight) > 0) parts.push(`${p.weight} kg`);
  if (p.neutered) parts.push(`${p.gender === 'Female' ? 'Spayed' : 'Neutered'}: ${p.neutered}`);
  return parts.join(' · ');
}

function validateIdentity(f: {
  hasPhoto: boolean; name: string; species: string; breed: string;
}): string {
  if (!f.hasPhoto) return 'Please add a photo of your pet.';
  if (!f.name.trim()) return 'Please enter your pet\'s name.';
  if (!f.species) return 'Please select a species.';
  // Breed is optional: not every owner knows it, especially for mixed or rescue pets.
  return '';
}

function validateDetails(f: { gender: string; age: string }): string {
  if (!f.gender) return 'Please select a gender.';
  if (!f.age.trim()) return 'Please enter age.';
  if (!/^\d+$/.test(f.age.trim())) return 'Age must be a whole number of years.';
  return '';
}

/* ── Shared components ── */

function Segmented({
  options, value, onChange,
}: {
  options: { key: string; label: string }[];
  value: string;
  onChange: (key: string) => void;
}) {
  return (
    <View style={styles.segmented} accessibilityRole="radiogroup">
      {options.map((o) => {
        const active = value === o.key;
        return (
          <TouchableOpacity
            key={o.key}
            style={[styles.segment, active && styles.segmentActive]}
            onPress={() => onChange(o.key)}
            activeOpacity={0.8}
            accessibilityRole="radio"
            accessibilityState={{ selected: active }}
          >
            <Text style={[styles.segmentText, active && styles.segmentTextActive]} numberOfLines={1}>
              {o.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function BottomSheet({
  visible, onClose, bottomInset, children, animationType = 'slide',
}: {
  visible: boolean; onClose: () => void; bottomInset: number; children: ReactNode;
  animationType?: 'none' | 'slide';
}) {
  return (
    <Modal visible={visible} transparent animationType={animationType} onRequestClose={onClose}>
      <View style={styles.sheetOverlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
        <View style={[styles.sheet, { paddingBottom: bottomInset + space.lg }]}>
          <View style={styles.sheetHandle} />
          {children}
        </View>
      </View>
    </Modal>
  );
}

function SheetRow({
  label, onPress, destructive, selected,
}: {
  label: string; onPress: () => void; destructive?: boolean; selected?: boolean;
}) {
  return (
    <TouchableOpacity
      style={styles.sheetRow}
      onPress={onPress}
      activeOpacity={0.72}
      accessibilityRole="button"
      accessibilityState={selected === undefined ? undefined : { selected }}
    >
      <Text
        style={[
          styles.sheetRowText,
          destructive && styles.destructiveText,
          selected && styles.sheetRowTextSelected,
        ]}
      >
        {label}
      </Text>
      {selected ? <Text style={styles.sheetRowTag}>Selected</Text> : null}
    </TouchableOpacity>
  );
}

function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity
      style={[styles.chip, selected && styles.chipOn]}
      onPress={onPress}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityState={{ selected }}
    >
      <Text style={[styles.chipText, selected && styles.chipTextOn]}>{label}</Text>
    </TouchableOpacity>
  );
}

/* Round photo inside a navy ring, story-style. Falls back to the pet's initial. */
function PetAvatar({ uri, name, size }: { uri?: string | null; name?: string; size: number }) {
  const inner = size + 6;   // photo + the page-coloured gap
  const outer = size + 12;  // + the navy ring
  return (
    <View
      style={{
        width: outer, height: outer, borderRadius: outer / 2,
        borderWidth: 3, borderColor: colors.primary,
        alignItems: 'center', justifyContent: 'center',
      }}
    >
      <View
        style={{
          width: inner, height: inner, borderRadius: inner / 2,
          borderWidth: 3, borderColor: colors.background,
          alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
        }}
      >
        {uri ? (
          <Image
            source={{ uri }}
            style={{ width: size, height: size, borderRadius: size / 2 }}
            accessibilityLabel={`${name || 'Pet'} photo`}
          />
        ) : (
          <View style={[styles.avatarFallback, { width: size, height: size, borderRadius: size / 2 }]}>
            <Text style={[styles.avatarInitial, { fontSize: size * 0.4 }]}>{initialOf(name)}</Text>
          </View>
        )}
      </View>
    </View>
  );
}

/* One pet, one row in the list. The whole row opens the manage sheet;
   "Manage" is a navy outlined button that says so. */
function PetRow({
  photoUri, name, species, breed, gender, age, weight, neutered, onPress,
}: {
  photoUri?: string | null;
  name?: string;
  species?: string;
  breed?: string | null;
  gender?: string | null;
  age?: unknown;
  weight?: unknown;
  neutered?: string | null;
  onPress: () => void;
}) {
  const subtitle = breed ? `${breed} · ${species}` : species || '';
  const meta = describePet({ gender, age, weight, neutered });

  return (
    <TouchableOpacity
      style={styles.row}
      onPress={onPress}
      activeOpacity={0.72}
      accessibilityRole="button"
      accessibilityHint="Opens edit and delete options"
    >
      <PetAvatar uri={photoUri} name={name} size={AVATAR} />

      <View style={styles.rowMain}>
        <Text style={styles.rowName} numberOfLines={1}>{name || 'Unnamed pet'}</Text>
        {subtitle ? <Text style={styles.rowSub} numberOfLines={1}>{subtitle}</Text> : null}
        {meta ? <Text style={styles.rowMeta}>{meta}</Text> : null}
      </View>

      <View style={styles.manageBtn}>
        <Text style={styles.manageText}>Manage</Text>
        <Ionicons name="chevron-forward" size={16} color={colors.primary} />
      </View>
    </TouchableOpacity>
  );
}

/* Review step: the pet as a small profile (photo, name, then three facts). */
function ReviewProfile({
  photoUri, name, species, breed, gender, age, neutered,
}: {
  photoUri?: string | null;
  name?: string;
  species?: string;
  breed?: string | null;
  gender?: string | null;
  age?: unknown;
  neutered?: string | null;
}) {
  const subtitle = breed ? `${breed} · ${species}` : species || '';
  const stats = [
    { value: gender || '—', label: 'Gender' },
    { value: formatAge(age) || '—', label: 'Age' },
    { value: neutered || '—', label: gender === 'Female' ? 'Spayed' : 'Neutered' },
  ];

  return (
    <View style={styles.profile}>
      <PetAvatar uri={photoUri} name={name} size={104} />
      <Text style={styles.profileName} numberOfLines={1}>{name || 'Unnamed pet'}</Text>
      {subtitle ? <Text style={styles.profileSub}>{subtitle}</Text> : null}

      <View style={styles.stats}>
        {stats.map((s) => (
          <View key={s.label} style={styles.stat}>
            <Text style={styles.statValue} numberOfLines={1}>{s.value}</Text>
            <Text style={styles.statLabel}>{s.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function EmptyState({
  isSearch, query, onAdd, onClearSearch,
}: {
  isSearch: boolean; query: string; onAdd: () => void; onClearSearch: () => void;
}) {
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyTitle}>{isSearch ? 'No matching pets' : 'No pets yet'}</Text>
      <Text style={styles.emptyText}>
        {isSearch ? `Nothing matches "${query.trim()}".` : 'Add a pet to book visits for them.'}
      </Text>
      <TouchableOpacity
        style={[styles.btn, isSearch ? styles.btnSecondary : styles.btnPrimary, styles.emptyBtn]}
        onPress={isSearch ? onClearSearch : onAdd}
        activeOpacity={0.85}
        accessibilityRole="button"
      >
        <Text style={isSearch ? styles.btnSecondaryText : styles.btnPrimaryText}>
          {isSearch ? 'Clear search' : 'Add your first pet'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

export default function MyPetsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [pets, setPets] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');
  const [menuPet, setMenuPet] = useState<any>(null);

  const [showModal, setShowModal] = useState(false);
  const [wizardStep, setWizardStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingPet, setEditingPet] = useState<any>(null);
  const [error, setError] = useState('');

  const [name, setName] = useState('');
  const [selectedSpecies, setSelectedSpecies] = useState('');
  const [selectedSpeciesId, setSelectedSpeciesId] = useState('');
  const [clinicSpecies, setClinicSpecies] = useState<SpeciesOption[]>([]);
  const [breed, setBreed] = useState('');
  /* The breeds list remembers which species it was fetched for, and is
     only used while that species is still the selected one. That way
     picking a different species (or clearing it) never shows the old
     species' breeds, and nothing has to reset state inside an effect. */
  const [breedsFor, setBreedsFor] = useState<{ speciesId: string; list: BreedOption[] }>({
    speciesId: '',
    list: [],
  });
  const availableBreeds: BreedOption[] =
    selectedSpeciesId && breedsFor.speciesId === selectedSpeciesId ? breedsFor.list : [];
  const [age, setAge] = useState('');
  const [selectedGender, setSelectedGender] = useState('');
  const [neutered, setNeutered] = useState('No');
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [pendingPhotoUri, setPendingPhotoUri] = useState<string | null>(null);
  const [showPhotoSheet, setShowPhotoSheet] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  const wizardScrollRef = useRef<ScrollView>(null);

  /* First load. State is only set after the fetch finishes, never
     synchronously inside the effect. `isLoading` already starts as
     true, so nothing needs to switch it on here. */
  useEffect(() => {
    let active = true;
    loadPets().then((result) => {
      if (!active) return;
      if (result.error) setLoadError(result.error);
      else setPets(result.pets);
      setIsLoading(false);
    });
    return () => { active = false; };
  }, []);

  useEffect(() => { fetchClinicSpecies().then(setClinicSpecies); }, []);

  // Fetched whenever the picked species changes — breed is scoped to one species.
  useEffect(() => {
    if (!selectedSpeciesId) return;
    let active = true;
    fetchBreedsForSpecies(selectedSpeciesId).then((list) => {
      if (active) setBreedsFor({ speciesId: selectedSpeciesId, list });
    });
    return () => { active = false; };
  }, [selectedSpeciesId]);

  // Each step starts at the top instead of wherever the last one was scrolled to.
  useEffect(() => {
    wizardScrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [wizardStep]);

  /* Refetch after a save or delete, pull-to-refresh, and Retry. Only the
     very first load shows the skeleton; later fetches are quiet, so the
     list doesn't flash back to a skeleton after every change. */
  const fetchPets = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    setLoadError('');
    const result = await loadPets();
    if (result.error) setLoadError(result.error);
    else setPets(result.pets);
    setIsLoading(false);
    setRefreshing(false);
  };

  useRealtimeRefresh('pets', () => fetchPets());

  const handleBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/profile' as any);
  };

  const closeMenu = () => setMenuPet(null);

  const openAdd = () => { setEditingPet(null); resetForm(); setWizardStep(1); setShowModal(true); };

  const openEdit = (pet: any) => {
    closeMenu();
    setEditingPet(pet);
    setName(pet.name || '');
    // Species is looked up by name against the clinic's real list to
    // recover its id, which is needed to fetch that species' breeds.
    const match = clinicSpecies.find((s) => s.name === pet.species);
    setSelectedSpecies(pet.species || '');
    setSelectedSpeciesId(match?.id || '');
    setBreed(pet.breed || '');
    setAge(pet.age !== null && pet.age !== undefined ? String(pet.age) : '');
    setSelectedGender(pet.gender || '');
    setNeutered(pet.neutered || '');
    setPhotoUrl(pet.photo_url || null);
    setError('');
    setWizardStep(1);
    setShowModal(true);
  };

  const resetForm = () => {
    setName(''); setSelectedSpecies(''); setSelectedSpeciesId(''); setBreed('');
    setAge(''); setSelectedGender(''); setNeutered('No');
    setPhotoUrl(null); setPendingPhotoUri(null); setError('');
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingPet(null);
    resetForm();
  };

  // Closing a half-filled new pet asks first; a stray tap shouldn't wipe three steps of input.
  const requestClose = () => {
    if (isSubmitting) return;
    const dirty = !editingPet && !!(
      name || selectedSpecies || breed || age || selectedGender || pendingPhotoUri
    );
    if (!dirty) { closeModal(); return; }
    Alert.alert('Discard this pet?', 'The details you entered will be lost.', [
      { text: 'Keep editing', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: closeModal },
    ]);
  };

  const pickPhoto = async () => {
    setShowPhotoSheet(false);
    const { status: permStatus } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (permStatus !== 'granted') { Alert.alert('Permission Required', 'Please allow access to your photo library.'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'] as any, allowsEditing: true, aspect: [1, 1], quality: 0.7 });
    if (!result.canceled) setPendingPhotoUri(result.assets[0].uri);
  };

  const takePhoto = async () => {
    setShowPhotoSheet(false);
    const { status: permStatus } = await ImagePicker.requestCameraPermissionsAsync();
    if (permStatus !== 'granted') { Alert.alert('Permission Required', 'Please allow camera access.'); return; }
    const result = await ImagePicker.launchCameraAsync({ allowsEditing: true, aspect: [1, 1], quality: 0.7 });
    if (!result.canceled) setPendingPhotoUri(result.assets[0].uri);
  };

  const removePhoto = () => { setShowPhotoSheet(false); setPhotoUrl(null); setPendingPhotoUri(null); };

  const uploadPetPhoto = async (uri: string, ownerId: string): Promise<string> => {
    const fileExt = uri.split('.').pop() || 'jpg';
    const fileName = `${ownerId}_${Date.now()}.${fileExt}`;
    const response = await fetch(uri);
    const arrayBuffer = await response.arrayBuffer();
    const { error: uploadError } = await supabase.storage.from('pet-photos').upload(fileName, arrayBuffer, { contentType: `image/${fileExt}`, upsert: true });
    if (uploadError) throw uploadError;
    const { data } = supabase.storage.from('pet-photos').getPublicUrl(fileName);
    return data.publicUrl;
  };

  const hasPhoto = !!(pendingPhotoUri || photoUrl);

  const goNextStep = () => {
    const err =
      wizardStep === 1
        ? validateIdentity({ hasPhoto, name, species: selectedSpecies, breed })
        : wizardStep === 2
          ? validateDetails({ gender: selectedGender, age })
          : '';
    if (err) { setError(err); return; }
    setError('');
    setWizardStep((s) => Math.min(3, s + 1));
  };

  const goPrevStep = () => {
    setError('');
    setWizardStep((s) => Math.max(1, s - 1));
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    setError('');
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setError('You must be logged in.'); setIsSubmitting(false); return; }

    let finalPhotoUrl = photoUrl;
    if (pendingPhotoUri) {
      try {
        setUploadingPhoto(true);
        finalPhotoUrl = await uploadPetPhoto(pendingPhotoUri, user.id);
      } catch {
        setError('Failed to upload photo. Please try again.');
        setIsSubmitting(false); setUploadingPhoto(false);
        return;
      }
      setUploadingPhoto(false);
    }

    /* weight, color and notes are deliberately absent. Weight is the
       clinic's own scale reading (grooming pricing depends on it); color
       and notes are no longer asked for here. Leaving a key out of an
       update (rather than setting it to null) keeps whatever value is
       already stored, so editing a pet never wipes them. */
    const payload = {
      name: name.trim(),
      species: selectedSpecies,
      breed: breed.trim() || null,
      age: age ? parseInt(age, 10) : null,
      gender: selectedGender,
      neutered: neutered || null,
      photo_url: finalPhotoUrl,
    };

    let submitError;
    if (editingPet) {
      ({ error: submitError } = await supabase.from('pets').update(payload).eq('id', editingPet.id));
    } else {
      ({ error: submitError } = await supabase.from('pets').insert([{ ...payload, owner_id: user.id }]));
    }

    setIsSubmitting(false);
    if (submitError) { setError('Failed to save pet. Please try again.'); return; }
    closeModal();
    fetchPets();
  };

  const handleDelete = (id: string) => {
    closeMenu();
    Alert.alert('Delete pet', 'Are you sure you want to remove this pet?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          const { error: deleteError } = await supabase.from('pets').delete().eq('id', id);
          if (deleteError) {
            Alert.alert('Could not delete', 'This pet could not be deleted. Please try again.');
            return;
          }
          fetchPets();
        },
      },
    ]);
  };

  const filtered = pets.filter((p) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return p.name?.toLowerCase().includes(q) || p.species?.toLowerCase().includes(q) || p.breed?.toLowerCase().includes(q);
  });

  const petWord = pets.length === 1 ? 'pet' : 'pets';
  const countLabel =
    pets.length === 0
      ? ''
      : search.trim()
        ? `${filtered.length} of ${pets.length} ${petWord}`
        : `${pets.length} ${petWord}`;

  // Continue stays greyed out until the step's required fields are filled.
  const stepValid =
    wizardStep === 1 ? !validateIdentity({ hasPhoto, name, species: selectedSpecies, breed })
    : wizardStep === 2 ? !validateDetails({ gender: selectedGender, age })
    : true;

  return (
    <View style={styles.container}>
      {/* Header: back, title on the left, Add pet on the right, as in the mockup. */}
      <View style={[styles.header, { paddingTop: insets.top + space.sm }]}>
        <TouchableOpacity onPress={handleBack} hitSlop={hitSlop} style={styles.headerBack} accessibilityRole="button" accessibilityLabel="Back">
          <Ionicons name="chevron-back" size={28} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>My Pets</Text>
        <TouchableOpacity style={styles.addBtn} onPress={openAdd} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel="Add pet">
          <Ionicons name="add" size={20} color={colors.primaryFg} />
          <Text style={styles.addBtnText}>Add pet</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => fetchPets(true)} tintColor={colors.primary} colors={[colors.primary]} />
        }
      >
        {/* ── Search ── */}
        {pets.length > 0 && (
          <View style={styles.toolbar}>
            <View style={styles.searchWrap}>
              <Ionicons name="search" size={18} color={colors.mutedFg} style={{ marginRight: space.sm }} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search by name, species or breed"
                placeholderTextColor={colors.mutedFg}
                value={search}
                onChangeText={setSearch}
                returnKeyType="search"
                autoCorrect={false}
                accessibilityLabel="Search pets"
              />
              {search.length > 0 && (
                <TouchableOpacity onPress={() => setSearch('')} hitSlop={hitSlop} accessibilityRole="button">
                  <Text style={styles.clearText}>Clear</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}

        {/* ── Count (under the search) ── */}
        {countLabel ? <Text style={styles.count}>{countLabel}</Text> : null}

        {/* ── Load error ── */}
        {loadError ? (
          <View style={styles.loadErrorBox}>
            <Text style={styles.loadErrorText}>{loadError}</Text>
            <TouchableOpacity onPress={() => fetchPets(true)} hitSlop={hitSlop} accessibilityRole="button">
              <Text style={styles.loadErrorRetry}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {/* ── Pets ── */}
        {isLoading ? (
          <PetListSkeleton />
        ) : filtered.length === 0 ? (
          !loadError && (
            <EmptyState
              isSearch={pets.length > 0 && !!search.trim()}
              query={search}
              onAdd={openAdd}
              onClearSearch={() => setSearch('')}
            />
          )
        ) : (
          <View style={styles.list}>
            {filtered.map((pet) => (
              <PetRow
                key={pet.id}
                onPress={() => setMenuPet(pet)}
                photoUri={pet.photo_url}
                name={pet.name}
                species={pet.species}
                breed={pet.breed}
                gender={pet.gender}
                age={pet.age}
                weight={pet.weight}
                neutered={pet.neutered}
              />
            ))}
          </View>
        )}
      </ScrollView>

      {/* ── Manage sheet. No slide animation: Edit opens the wizard Modal straight
           after this one closes, and iOS can drop a Modal presented mid-dismissal. ── */}
      <BottomSheet visible={!!menuPet} onClose={closeMenu} bottomInset={insets.bottom} animationType="none">
        {/* Rendered only while a pet is selected, so a leftover tap after the
            sheet closes can't read menuPet.id off null. */}
        {menuPet ? (
          <>
            <Text style={styles.sheetTitle} numberOfLines={1}>{menuPet.name || 'Pet'}</Text>
            <SheetRow label="Edit details" onPress={() => openEdit(menuPet)} />
            <SheetRow label="Delete pet" destructive onPress={() => handleDelete(menuPet.id)} />
            <TouchableOpacity style={[styles.btn, styles.btnSecondary, styles.sheetCancel]} onPress={closeMenu} accessibilityRole="button">
              <Text style={styles.btnSecondaryText}>Cancel</Text>
            </TouchableOpacity>
          </>
        ) : null}
      </BottomSheet>

      {/* ══════════════════ Add / edit pet: 3-step wizard ══════════════════ */}
      <Modal visible={showModal} animationType="slide" onRequestClose={requestClose}>
        <KeyboardAvoidingView style={styles.wizardContainer} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={[styles.wizardHeader, { paddingTop: insets.top + space.sm }]}>
            <TouchableOpacity onPress={requestClose} hitSlop={hitSlop} style={styles.wizardClose} accessibilityRole="button" accessibilityLabel="Cancel">
              <Ionicons name="close" size={26} color={colors.foreground} />
            </TouchableOpacity>
            <Text style={styles.wizardHeaderTitle} numberOfLines={1}>
              {editingPet ? 'Edit pet' : 'New pet'}
            </Text>
          </View>

          <View style={styles.progress}>
            <View style={styles.progressBars}>
              {STEPS.map((s) => (
                <View key={s.key} style={[styles.progressBar, s.key <= wizardStep && styles.progressBarOn]} />
              ))}
            </View>
            <Text style={styles.progressText}>
              Step {wizardStep} of {STEPS.length} · {STEPS[wizardStep - 1].label}
            </Text>
          </View>

          <ScrollView
            ref={wizardScrollRef}
            style={styles.wizardScroll}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.wizardForm}>
              {error ? (
                <View style={styles.errorBox} accessibilityRole="alert">
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              ) : null}

              {/* ── Step 1: Identity ── */}
              {wizardStep === 1 && (
                <>
                  <View style={styles.photoCenter}>
                    <TouchableOpacity
                      onPress={() => setShowPhotoSheet(true)}
                      activeOpacity={0.85}
                      accessibilityRole="button"
                      accessibilityLabel={hasPhoto ? 'Change photo' : 'Add photo'}
                    >
                      <View style={[styles.photoCircle, !hasPhoto && styles.photoCircleEmpty]}>
                        {hasPhoto ? (
                          <Image source={{ uri: pendingPhotoUri || photoUrl! }} style={styles.photoImage} accessibilityLabel="Pet photo" />
                        ) : (
                          <Text style={styles.photoPlaceholder} numberOfLines={2} maxFontSizeMultiplier={1}>No photo</Text>
                        )}
                        {uploadingPhoto && (
                          <View style={styles.photoUploadOverlay}>
                            <ActivityIndicator color={colors.white} size="small" />
                          </View>
                        )}
                      </View>
                      <View style={styles.photoPlus}>
                        <Text style={styles.photoPlusText}>+</Text>
                      </View>
                    </TouchableOpacity>

                    <TouchableOpacity onPress={() => setShowPhotoSheet(true)} hitSlop={hitSlop} accessibilityRole="button">
                      <Text style={styles.photoLink}>{hasPhoto ? 'Change photo' : 'Add photo'} <Text style={styles.required}>*</Text></Text>
                    </TouchableOpacity>
                    <Text style={styles.photoHint}>A clear photo helps our staff recognize your pet.</Text>
                  </View>

                  <Text style={styles.fieldLabel}>Pet name <Text style={styles.required}>*</Text></Text>
                  <TextInput
                    style={styles.input}
                    placeholder="e.g. Buddy"
                    placeholderTextColor={colors.mutedFg}
                    value={name}
                    onChangeText={setName}
                  />
                  <Text style={styles.fieldHint}>This is how you&apos;ll see them across the app.</Text>

                  <Text style={styles.fieldLabel}>Species <Text style={styles.required}>*</Text></Text>
                  {clinicSpecies.length === 0 ? (
                    <Text style={styles.fieldHint}>
                      The clinic hasn&apos;t listed any species yet — please contact them directly.
                    </Text>
                  ) : (
                    <View style={styles.chips}>
                      {clinicSpecies.map((sp) => (
                        <Chip
                          key={sp.id}
                          label={sp.name}
                          selected={selectedSpeciesId === sp.id}
                          onPress={() => {
                            const same = selectedSpeciesId === sp.id;
                            setSelectedSpecies(same ? '' : sp.name);
                            setSelectedSpeciesId(same ? '' : sp.id);
                            setBreed('');
                          }}
                        />
                      ))}
                    </View>
                  )}
                  <Text style={styles.fieldHint}>Only species the clinic actually treats are listed here.</Text>

                  <Text style={styles.fieldLabel}>Breed <Text style={styles.optionalText}>Optional</Text></Text>
                  {!selectedSpeciesId ? (
                    <Text style={styles.fieldHint}>Select a species first.</Text>
                  ) : availableBreeds.length === 0 ? (
                    <Text style={styles.fieldHint}>
                      The clinic hasn&apos;t listed any breeds for {selectedSpecies.toLowerCase()} yet.
                    </Text>
                  ) : (
                    <View style={styles.chips}>
                      {availableBreeds.map((b) => (
                        <Chip
                          key={b.id}
                          label={b.name}
                          selected={breed === b.name}
                          onPress={() => setBreed(breed === b.name ? '' : b.name)}
                        />
                      ))}
                    </View>
                  )}
                </>
              )}

              {/* ── Step 2: Details ── */}
              {wizardStep === 2 && (
                <>
                  <Text style={styles.fieldLabel}>Gender <Text style={styles.required}>*</Text></Text>
                  <Segmented
                    options={genderOptions.map((g) => ({ key: g, label: g }))}
                    value={selectedGender}
                    onChange={setSelectedGender}
                  />

                  <Text style={styles.fieldLabel}>
                    {selectedGender === 'Female' ? 'Spayed' : 'Neutered'} <Text style={styles.optionalText}>Optional</Text>
                  </Text>
                  <Segmented
                    options={neuteredOptions.map((n) => ({ key: n, label: n }))}
                    value={neutered}
                    onChange={(n) => setNeutered(neutered === n ? '' : n)}
                  />

                  <Text style={styles.fieldLabel}>Age (years) <Text style={styles.required}>*</Text></Text>
                  <TextInput
                    style={styles.input}
                    value={age}
                    onChangeText={setAge}
                    keyboardType="number-pad"
                    placeholder="e.g. 3"
                    placeholderTextColor={colors.mutedFg}
                  />
                </>
              )}

              {/* ── Step 3: Review ── */}
              {wizardStep === 3 && (
                <>
                  <ReviewProfile
                    photoUri={pendingPhotoUri || photoUrl}
                    name={name}
                    species={selectedSpecies}
                    breed={breed}
                    gender={selectedGender}
                    age={age}
                    neutered={neutered}
                  />
                  <Text style={styles.reviewFooterNote}>You can edit every detail later.</Text>
                </>
              )}
            </View>
          </ScrollView>

          <View style={[styles.wizardFooter, { paddingBottom: insets.bottom + space.md }]}>
            {wizardStep > 1 && (
              <TouchableOpacity
                style={[styles.btn, styles.btnSecondary, styles.footerBack]}
                onPress={goPrevStep}
                disabled={isSubmitting}
                activeOpacity={0.85}
                accessibilityRole="button"
              >
                <Text style={styles.btnSecondaryText}>Back</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[styles.btn, styles.btnPrimary, styles.footerPrimary, isSubmitting && styles.btnDisabled, !stepValid && styles.btnBlocked]}
              onPress={wizardStep < 3 ? goNextStep : handleSubmit}
              disabled={isSubmitting || !stepValid}
              activeOpacity={0.85}
              accessibilityRole="button"
            >
              {isSubmitting ? (
                <ActivityIndicator color={colors.primaryFg} />
              ) : (
                <Text style={styles.btnPrimaryText}>
                  {wizardStep < 3 ? 'Continue' : editingPet ? 'Save changes' : 'Add pet'}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Photo sheet ── */}
      <BottomSheet visible={showPhotoSheet} onClose={() => setShowPhotoSheet(false)} bottomInset={insets.bottom}>
        <Text style={styles.sheetTitle}>Pet photo</Text>
        <SheetRow label="Choose from library" onPress={pickPhoto} />
        <SheetRow label="Take a photo" onPress={takePhoto} />
        {hasPhoto && <SheetRow label="Remove photo" destructive onPress={removePhoto} />}
        <TouchableOpacity
          style={[styles.btn, styles.btnSecondary, styles.sheetCancel]}
          onPress={() => setShowPhotoSheet(false)}
          accessibilityRole="button"
        >
          <Text style={styles.btnSecondaryText}>Cancel</Text>
        </TouchableOpacity>
      </BottomSheet>
    </View>
  );
}

const AVATAR = 56;
const PHOTO = 112;
const CONTROL_H = 44;
const BUTTON_H = 48;
const FIELD_RADIUS = 10;

const styles = StyleSheet.create({
  container: { ...common.screen },
  scroll: { flex: 1 },
  // Clears the floating tab bar, which this screen shows.
  scrollContent: { paddingBottom: TAB_BAR_CLEARANCE },

  /* ── Header ── */
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.xl,
    paddingBottom: space.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.background,
  },
  headerBack: { minHeight: CONTROL_H, justifyContent: 'center' },
  headerTitle: { flex: 1, fontFamily: fonts.bodyBold, fontSize: 22, color: colors.foreground },
  count: { ...text.small, color: colors.mutedFg, paddingHorizontal: space.xxl, paddingTop: space.md },

  /* ── Buttons ── */
  /* Every full-width button: 48px, fully rounded. Primary is solid navy
     (Continue, Save changes, Add pet, Add your first pet). Secondary is a
     navy outline (Back, Cancel, Clear search). Red is only for deleting. */
  btn: {
    height: BUTTON_H,
    borderRadius: BUTTON_H / 2,
    paddingHorizontal: space.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnPrimary: { backgroundColor: colors.primary },
  btnPrimaryText: { ...text.bodyBold, color: colors.primaryFg },
  btnSecondary: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: colors.primary,
  },
  btnSecondaryText: { ...text.bodyBold, color: colors.primary },
  btnDisabled: { opacity: 0.6 },
  btnBlocked: { opacity: 0.4 },

  /* Add pet: the one solid navy button, a 48px pill with a plus. */
  addBtn: {
    height: BUTTON_H,
    borderRadius: BUTTON_H / 2,
    paddingLeft: space.md,
    paddingRight: space.lg,
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  addBtnText: { ...text.smallBold, color: colors.primaryFg },

  /* ── Search: a filled field, no outline ── */
  toolbar: { paddingHorizontal: space.xxl, marginTop: space.lg },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: CONTROL_H,
    borderRadius: FIELD_RADIUS,
    backgroundColor: colors.muted,
    paddingHorizontal: space.md,
  },
  searchInput: { flex: 1, fontSize: 14, color: colors.foreground, fontFamily: fonts.body, paddingVertical: 0 },
  clearText: { ...text.smallBold, color: colors.primary, marginLeft: space.sm },

  /* ── Segmented control: grey track, the chosen option is a raised pill ── */
  segmented: {
    flexDirection: 'row',
    borderRadius: FIELD_RADIUS,
    backgroundColor: colors.muted,
    padding: 3,
  },
  segment: {
    flex: 1,
    minHeight: CONTROL_H - 6,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.sm,
    borderRadius: FIELD_RADIUS - 2,
  },
  segmentActive: {
    backgroundColor: colors.card,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  segmentText: { fontSize: 13, fontFamily: fonts.bodyMedium, color: colors.mutedFg },
  segmentTextActive: { color: colors.foreground, fontFamily: fonts.bodyBold },

  /* ── States ── */
  loadErrorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    marginHorizontal: space.xxl,
    marginTop: space.lg,
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: colors.destructiveBg,
  },
  loadErrorText: { ...text.small, flex: 1, color: colors.destructive },
  loadErrorRetry: { ...text.smallBold, color: colors.destructive, textDecorationLine: 'underline' },
  empty: { alignItems: 'center', paddingHorizontal: space.xxl, paddingTop: space.xxxl },
  emptyTitle: { fontFamily: fonts.bodyBold, fontSize: 17, color: colors.foreground },
  emptyText: { ...text.small, color: colors.mutedFg, textAlign: 'center', marginTop: space.sm },
  emptyBtn: { alignSelf: 'stretch', marginTop: space.xl },

  /* ── Pet list: flat rows ── */
  list: { marginTop: space.lg },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.lg,
    paddingHorizontal: space.xxl,
    paddingVertical: space.md,
  },
  avatarFallback: {
    backgroundColor: colors.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: { fontFamily: text.display.fontFamily, color: colors.primary },
  rowMain: { flex: 1, minWidth: 0 },
  rowName: { ...text.bodyBold, fontSize: 16, color: colors.foreground },
  rowSub: { ...text.small, color: colors.mutedFg, marginTop: 2 },
  rowMeta: { ...text.caption, color: colors.mutedFg, marginTop: 2 },

  /* Manage: secondary style, a 48px navy outlined pill with a chevron. */
  manageBtn: {
    height: BUTTON_H,
    borderRadius: BUTTON_H / 2,
    paddingHorizontal: space.md,
    borderWidth: 1.5,
    borderColor: colors.primary,
    backgroundColor: 'transparent',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  manageText: { ...text.smallBold, color: colors.primary },

  /* ── Sheets ── */
  sheetOverlay: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.card,
    borderTopRightRadius: radius.card,
    paddingHorizontal: space.xxl,
    paddingTop: space.lg,
  },
  sheetHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginBottom: space.lg },
  sheetTitle: { fontFamily: fonts.bodyBold, fontSize: 16, color: colors.foreground, marginBottom: space.sm },
  sheetRow: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  sheetRowText: { fontSize: 15, fontFamily: fonts.bodyMedium, color: colors.foreground, flexShrink: 1 },
  sheetRowTextSelected: { fontFamily: fonts.bodyBold, color: colors.primary },
  sheetRowTag: { ...text.caption, color: colors.primary, marginLeft: space.md },
  destructiveText: { color: colors.destructive },
  sheetCancel: { marginTop: space.lg },

  /* ── Wizard ── */
  wizardContainer: { ...common.screen },
  wizardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.xxl,
    paddingBottom: space.sm,
  },
  wizardClose: { minHeight: CONTROL_H - 8, justifyContent: 'center' },
  wizardHeaderTitle: { flex: 1, fontFamily: fonts.bodyBold, fontSize: 22, color: colors.foreground },

  progress: { paddingHorizontal: space.xxl, paddingTop: space.lg, paddingBottom: space.sm },
  progressBars: { flexDirection: 'row', gap: 6 },
  progressBar: { flex: 1, height: 3, borderRadius: 2, backgroundColor: colors.border },
  progressBarOn: { backgroundColor: colors.foreground },
  progressText: { ...text.caption, color: colors.mutedFg, marginTop: space.sm },

  wizardScroll: { flex: 1 },
  wizardForm: { paddingHorizontal: space.xxl, paddingBottom: space.xl },
  errorBox: {
    backgroundColor: colors.destructiveBg,
    borderRadius: radius.md,
    padding: space.md,
    marginTop: space.md,
  },
  errorText: { ...text.small, color: colors.destructive },

  fieldLabel: { fontSize: 13, fontFamily: fonts.bodyBold, color: colors.foreground, marginBottom: space.sm, marginTop: space.xl },
  required: { color: colors.destructive },
  optionalText: { color: colors.mutedFg, fontFamily: fonts.body, fontSize: 11 },
  fieldHint: { ...text.caption, color: colors.mutedFg, marginTop: space.sm },

  /* Filled fields, no outline */
  input: {
    ...common.input,
    height: undefined,
    minHeight: 52,
    paddingVertical: 10,
    backgroundColor: colors.muted,
    borderWidth: 0,
    borderRadius: FIELD_RADIUS,
  },

  /* Species and breed chips */
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  chip: { backgroundColor: colors.muted, borderRadius: 999, paddingHorizontal: space.lg, paddingVertical: space.sm + 1 },
  chipOn: { backgroundColor: colors.foreground },
  chipText: { fontSize: 14, fontFamily: fonts.bodyMedium, color: colors.foreground },
  chipTextOn: { color: colors.background },

  /* Photo: one big round picture, centred, with a + badge */
  photoCenter: { alignItems: 'center', paddingTop: space.lg, gap: space.sm },
  photoCircle: {
    width: PHOTO,
    height: PHOTO,
    borderRadius: PHOTO / 2,
    backgroundColor: colors.muted,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  photoCircleEmpty: { borderWidth: 2, borderStyle: 'dashed', borderColor: colors.border },
  photoImage: { width: PHOTO, height: PHOTO },
  photoPlaceholder: { ...text.caption, color: colors.mutedFg, textAlign: 'center', paddingHorizontal: 6 },
  photoUploadOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoPlus: {
    position: 'absolute',
    right: 2,
    bottom: 2,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.primary,
    borderWidth: 3,
    borderColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoPlusText: { color: colors.primaryFg, fontSize: 18, lineHeight: 20, fontFamily: fonts.bodyBold },
  photoLink: { ...text.smallBold, color: colors.primary },
  photoHint: { ...text.caption, color: colors.mutedFg, textAlign: 'center' },

  /* Review: a small profile */
  profile: { alignItems: 'center', paddingTop: space.xl },
  profileName: { fontFamily: fonts.bodyBold, fontSize: 22, color: colors.foreground, marginTop: space.lg },
  profileSub: { ...text.small, color: colors.mutedFg, marginTop: 2 },
  stats: {
    flexDirection: 'row',
    alignSelf: 'stretch',
    marginTop: space.xl,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.border,
  },
  stat: { flex: 1, alignItems: 'center', paddingVertical: space.lg, paddingHorizontal: 4 },
  statValue: { fontFamily: fonts.bodyBold, fontSize: 16, color: colors.foreground },
  statLabel: { ...text.caption, color: colors.mutedFg, marginTop: 2 },
  reviewFooterNote: { ...text.caption, color: colors.mutedFg, textAlign: 'center', marginTop: space.xl },

  wizardFooter: {
    flexDirection: 'row',
    gap: space.md,
    paddingHorizontal: space.xxl,
    paddingTop: space.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
  },
  footerBack: { flex: 1 },
  footerPrimary: { flex: 2 },
});

/* ── Loading state ──
   Same rows as the real list (round photo, a name line, a breed and
   species line, a details line), so nothing jumps when the pets arrive. */
function PetListSkeleton() {
  return (
    <View style={styles.list} accessibilityLabel="Loading your pets" accessibilityLiveRegion="polite">
      {[0, 1, 2, 3].map((i) => (
        <View key={i} style={styles.row}>
          <Skeleton width={AVATAR + 12} height={AVATAR + 12} radius={(AVATAR + 12) / 2} />
          <View style={styles.rowMain}>
            <Skeleton width="45%" height={16} />
            <Skeleton width="60%" height={13} style={{ marginTop: 8 }} />
            <Skeleton width="75%" height={12} style={{ marginTop: 6 }} />
          </View>
        </View>
      ))}
    </View>
  );
}
