import { useState, useEffect, useRef, type ReactNode } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  ActivityIndicator, Modal, Image, Pressable, Alert,
  RefreshControl, KeyboardAvoidingView, Platform,
} from 'react-native';
import { supabase } from '@/lib/supabase';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, text, fonts, space, radius, common, hitSlop } from '../../constants/theme';
import { TAB_BAR_CLEARANCE } from './_layout';
import { Skeleton } from '../../components/Skeleton';
import { ScreenHeader } from '../../components/ScreenHeader';
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
   nothing regresses now that no species is hardcoded here anymore).
   No more "four common chips plus a free-text Others" — one real,
   clinic-managed list, full stop. */
async function fetchClinicSpecies(): Promise<SpeciesOption[]> {
  const { data, error } = await supabase
    .from('categories').select('id, name').eq('type', 'species').order('sort_order').order('name');
  if (error) return [];
  return data || [];
}

/* Breeds for one specific species — a real foreign-key relationship
   (migration 033's breeds table), not a hardcoded JS object keyed by
   species name. No free-text fallback: breed is now exactly as
   locked-down as species is, so the only thing left to type by hand
   anywhere in this form is the pet's name. */
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
  // Breed is optional now — not every owner knows it, especially for
  // mixed or rescue pets, and there was no honest "not sure" option
  // for every species anyway. Nothing to validate here.
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
      {options.map((o, i) => {
        const active = value === o.key;
        return (
          <TouchableOpacity
            key={o.key}
            style={[styles.segment, i > 0 && styles.segmentDivider, active && styles.segmentActive]}
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

/* One pet, one row. Used in the live list and as the Review step, so the
   review is a literal preview of what will be saved. With onPress the whole
   row is the button; without it the row is a static preview. */
function PetRow({
  photoUri, name, species, breed, gender, age, weight, neutered, note, onPress,
}: {
  photoUri?: string | null;
  name?: string;
  species?: string;
  breed?: string | null;
  gender?: string | null;
  age?: unknown;
  weight?: unknown;
  neutered?: string | null;
  note?: string | null;
  onPress?: () => void;
}) {
  const subtitle = breed ? `${breed} · ${species}` : species || '';
  const meta = describePet({ gender, age, weight, neutered });

  const content = (
    <>
      {photoUri ? (
        <Image source={{ uri: photoUri }} style={styles.avatar} accessibilityLabel={`${name || 'Pet'} photo`} />
      ) : (
        <View style={styles.avatarFallback}>
          <Text style={styles.avatarInitial}>{initialOf(name)}</Text>
        </View>
      )}

      <View style={styles.rowMain}>
        <View style={styles.rowTitleLine}>
          <Text style={styles.rowName} numberOfLines={1}>{name || 'Unnamed pet'}</Text>
          {onPress ? <Text style={styles.manageText}>Manage</Text> : null}
        </View>

        {subtitle ? <Text style={styles.rowSub} numberOfLines={1}>{subtitle}</Text> : null}
        {meta ? <Text style={styles.rowMeta}>{meta}</Text> : null}
        {note ? <Text style={styles.rowNote} numberOfLines={2}>{note}</Text> : null}
      </View>
    </>
  );

  if (onPress) {
    return (
      <TouchableOpacity
        style={styles.row}
        onPress={onPress}
        activeOpacity={0.72}
        accessibilityRole="button"
        accessibilityHint="Opens edit and delete options"
      >
        {content}
      </TouchableOpacity>
    );
  }
  return <View style={styles.row}>{content}</View>;
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
  const [showSpeciesPicker, setShowSpeciesPicker] = useState(false);
  const [speciesPickerSearch, setSpeciesPickerSearch] = useState('');
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
  const [showBreedPicker, setShowBreedPicker] = useState(false);
  const [breedSearch, setBreedSearch] = useState('');
  const [age, setAge] = useState('');
  const [selectedGender, setSelectedGender] = useState('');
  const [color, setColor] = useState('');
  const [neutered, setNeutered] = useState('');
  const [notes, setNotes] = useState('');
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

  // Fetched whenever the picked species changes — breed is scoped
  // to one specific species now, not a static, always-loaded object
  // keyed by every species at once.
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
    // recover its id — needed to fetch that species' breeds — rather
    // than the old fixed/"Others" branch, which no longer exists.
    const match = clinicSpecies.find((s) => s.name === pet.species);
    setSelectedSpecies(pet.species || '');
    setSelectedSpeciesId(match?.id || '');
    setBreed(pet.breed || '');
    setAge(pet.age !== null && pet.age !== undefined ? String(pet.age) : '');
    setSelectedGender(pet.gender || '');
    setColor(pet.color || '');
    setNeutered(pet.neutered || '');
    setNotes(pet.notes || '');
    setPhotoUrl(pet.photo_url || null);
    setError('');
    setWizardStep(1);
    setShowModal(true);
  };

  const resetForm = () => {
    setName(''); setSelectedSpecies(''); setSelectedSpeciesId(''); setBreed('');
    setAge(''); setSelectedGender(''); setColor(''); setNeutered(''); setNotes('');
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
      name || selectedSpecies || breed || age || selectedGender ||
      color || neutered || notes || pendingPhotoUri
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

    const payload = {
      name: name.trim(),
      species: selectedSpecies,
      breed: breed.trim() || null,
      age: age ? parseInt(age, 10) : null,
      gender: selectedGender,
      // weight is deliberately absent — it's no longer something the
      // owner enters here at all. Real weight comes from the clinic
      // actually putting the pet on a scale, since grooming pricing
      // depends on it and a guessed number was producing wrong
      // prices. Omitting the key (not setting it to null) matters on
      // an update specifically: it leaves whatever weight the clinic
      // already recorded untouched, rather than wiping it out every
      // time an owner edits some other detail.
      color: color.trim() || null,
      neutered: neutered || null,
      notes: notes.trim() || null,
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

  const filteredBreeds = availableBreeds.filter((b) => b.name.toLowerCase().includes(breedSearch.toLowerCase()));

  return (
    <View style={styles.container}>
      {/* ── Header ── Same back-button header as the other sub-screens.
          This screen opens from Profile and from Book, and used to have
          no way back except the tab bar. */}
      <ScreenHeader title="My Pets" onBack={handleBack} />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => fetchPets(true)} tintColor={colors.primary} colors={[colors.primary]} />
        }
      >
        {/* ── Count and add ── */}
        <View style={styles.summaryRow}>
          <View style={styles.headerCopy}>
            {countLabel ? <Text style={styles.subtitle}>{countLabel}</Text> : null}
          </View>
          <TouchableOpacity style={styles.addBtn} onPress={openAdd} activeOpacity={0.85} accessibilityRole="button">
            <Text style={styles.addBtnText}>Add pet</Text>
          </TouchableOpacity>
        </View>

        {/* ── Search ── */}
        {pets.length > 0 && (
          <View style={styles.toolbar}>
            <View style={styles.searchWrap}>
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
                note={pet.notes}
              />
            ))}
          </View>
        )}
      </ScrollView>

      {/* ── Manage sheet. No slide animation: Edit opens the wizard Modal straight
           after this one closes, and iOS can drop a Modal presented mid-dismissal. ── */}
      <BottomSheet visible={!!menuPet} onClose={closeMenu} bottomInset={insets.bottom} animationType="none">
        {/* Rendered only while a pet is selected. Once the sheet closes,
            menuPet is null, and a leftover tap (a double tap, or one landing
            as the sheet goes away) would read menuPet.id off null and crash. */}
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
            <TouchableOpacity onPress={requestClose} hitSlop={hitSlop} style={styles.wizardHeaderSide} accessibilityRole="button">
              <Text style={styles.wizardHeaderAction}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.wizardHeaderTitle} numberOfLines={1}>
              {editingPet ? 'Edit pet' : 'Add a new pet'}
            </Text>
            <View style={styles.wizardHeaderSide} />
          </View>

          <View style={styles.progress}>
            <View style={styles.progressBars}>
              {STEPS.map((s) => (
                <View key={s.key} style={[styles.progressBar, s.key <= wizardStep && styles.progressBarOn]} />
              ))}
            </View>
            <Text style={styles.progressText}>
              Step {wizardStep} of {STEPS.length}: {STEPS[wizardStep - 1].label}
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
                  <Text style={styles.fieldLabel}>Photo <Text style={styles.required}>*</Text></Text>
                  <View style={styles.photoRow}>
                    <View style={styles.photoCircle}>
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
                    <View style={styles.photoCopy}>
                      <TouchableOpacity
                        style={[styles.btn, styles.btnSecondary, styles.photoBtn]}
                        onPress={() => setShowPhotoSheet(true)}
                        activeOpacity={0.85}
                        accessibilityRole="button"
                      >
                        <Text style={styles.btnSecondaryText}>{hasPhoto ? 'Change photo' : 'Add photo'}</Text>
                      </TouchableOpacity>
                      <Text style={styles.photoHint}>A clear photo helps our staff recognize your pet.</Text>
                    </View>
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
                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={() => { setSpeciesPickerSearch(''); setShowSpeciesPicker(true); }}
                    accessibilityRole="button"
                    accessibilityLabel={selectedSpecies ? `Species: ${selectedSpecies}. Change species` : 'Select species'}
                  >
                    <View pointerEvents="none">
                      <TextInput
                        style={[styles.input, styles.inputWithTrailing]}
                        value={selectedSpecies}
                        placeholder="Select a species"
                        placeholderTextColor={colors.mutedFg}
                        editable={false}
                      />
                      <View style={styles.inputTrailingWrap}>
                        <Text style={styles.inputTrailing}>{selectedSpecies ? 'Change' : 'Select'}</Text>
                      </View>
                    </View>
                  </TouchableOpacity>
                  <Text style={styles.fieldHint}>
                    Only species the clinic actually treats are listed here.
                  </Text>

                  <Text style={styles.fieldLabel}>Breed <Text style={styles.optionalText}>Optional</Text></Text>
                  <TouchableOpacity
                    activeOpacity={0.8}
                    disabled={!selectedSpeciesId}
                    onPress={() => { setBreedSearch(''); setShowBreedPicker(true); }}
                    accessibilityRole="button"
                    accessibilityLabel={breed ? `Breed: ${breed}. Change breed` : 'Select breed'}
                  >
                    <View pointerEvents="none">
                      <TextInput
                        style={[styles.input, styles.inputWithTrailing]}
                        value={breed}
                        placeholder={selectedSpeciesId ? `Select ${selectedSpecies.toLowerCase()} breed` : 'Select species first'}
                        placeholderTextColor={colors.mutedFg}
                        editable={false}
                      />
                      <View style={styles.inputTrailingWrap}>
                        <Text style={styles.inputTrailing}>{breed ? 'Change' : 'Select'}</Text>
                      </View>
                    </View>
                  </TouchableOpacity>
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
                  {/* Weight used to live here, owner-entered — removed
                      entirely, not just made optional. Grooming
                      pricing depends on actual weight, and a number an
                      owner guesses at home isn't real, usable data the
                      same way a scale reading at the clinic is. This
                      is now the clinic's own value to record, not the
                      owner's to estimate. */}

                  <Text style={styles.fieldLabel}>Color / markings <Text style={styles.optionalText}>Optional</Text></Text>
                  <TextInput
                    style={styles.input}
                    placeholder="e.g. Brown with white spots"
                    placeholderTextColor={colors.mutedFg}
                    value={color}
                    onChangeText={setColor}
                  />

                  <Text style={styles.fieldLabel}>Note <Text style={styles.optionalText}>Optional</Text></Text>
                  <TextInput
                    style={[styles.input, styles.noteInput]}
                    placeholder="e.g. Loves to play fetch and go for long walks"
                    placeholderTextColor={colors.mutedFg}
                    value={notes}
                    onChangeText={setNotes}
                    multiline
                  />
                </>
              )}

              {/* ── Step 3: Review (the same row the list uses) ── */}
              {wizardStep === 3 && (
                <>
                  <Text style={styles.reviewIntro}>Here&apos;s how {name || 'your pet'} will appear in My Pets:</Text>
                  <View style={styles.reviewList} pointerEvents="none">
                    <PetRow
                      photoUri={pendingPhotoUri || photoUrl}
                      name={name}
                      species={selectedSpecies}
                      breed={breed}
                      gender={selectedGender}
                      age={age}
                      weight={editingPet?.weight}
                      neutered={neutered}
                      note={notes}
                    />
                  </View>
                  {color ? (
                    <View style={styles.reviewRow}>
                      <Text style={styles.reviewRowLabel}>Color / markings</Text>
                      <Text style={styles.reviewRowValue}>{color}</Text>
                    </View>
                  ) : null}
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
              style={[styles.btn, styles.btnPrimary, styles.footerPrimary, isSubmitting && styles.btnDisabled]}
              onPress={wizardStep < 3 ? goNextStep : handleSubmit}
              disabled={isSubmitting}
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

      {/* ── Breed picker ── */}
      <Modal visible={showBreedPicker} animationType="slide" transparent onRequestClose={() => setShowBreedPicker(false)}>
        <View style={styles.sheetOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowBreedPicker(false)} accessibilityLabel="Close" />
          <View style={[styles.sheet, styles.sheetTall, { paddingBottom: insets.bottom + space.lg }]}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitleInline} numberOfLines={1}>Select {selectedSpecies.toLowerCase()} breed</Text>
              <TouchableOpacity onPress={() => setShowBreedPicker(false)} hitSlop={hitSlop} accessibilityRole="button">
                <Text style={styles.sheetHeaderAction}>Close</Text>
              </TouchableOpacity>
            </View>

            <TextInput
              style={styles.input}
              placeholder="Search breeds"
              placeholderTextColor={colors.mutedFg}
              value={breedSearch}
              onChangeText={setBreedSearch}
              autoCorrect={false}
            />

            <ScrollView style={styles.breedList} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {availableBreeds.length === 0 ? (
                <Text style={styles.fieldHint}>
                  The clinic hasn&apos;t listed any breeds for {selectedSpecies.toLowerCase()} yet — please contact them directly.
                </Text>
              ) : filteredBreeds.length === 0 ? (
                <Text style={styles.fieldHint}>Nothing matches that search.</Text>
              ) : (
                filteredBreeds.map((b) => (
                  <SheetRow
                    key={b.id}
                    label={b.name}
                    selected={breed === b.name}
                    onPress={() => { setBreed(b.name); setShowBreedPicker(false); }}
                  />
                ))
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ── Species picker — real clinic-managed list, not free text ── */}
      <Modal visible={showSpeciesPicker} animationType="slide" transparent onRequestClose={() => setShowSpeciesPicker(false)}>
        <View style={styles.sheetOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowSpeciesPicker(false)} accessibilityLabel="Close" />
          <View style={[styles.sheet, styles.sheetTall, { paddingBottom: insets.bottom + space.lg }]}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitleInline} numberOfLines={1}>Select species</Text>
              <TouchableOpacity onPress={() => setShowSpeciesPicker(false)} hitSlop={hitSlop} accessibilityRole="button">
                <Text style={styles.sheetHeaderAction}>Close</Text>
              </TouchableOpacity>
            </View>

            <TextInput
              style={styles.input}
              placeholder="Search species"
              placeholderTextColor={colors.mutedFg}
              value={speciesPickerSearch}
              onChangeText={setSpeciesPickerSearch}
              autoCorrect={false}
            />

            <ScrollView style={styles.breedList} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {clinicSpecies.length === 0 ? (
                <Text style={styles.fieldHint}>
                  The clinic hasn&apos;t listed any species yet — please contact them directly.
                </Text>
              ) : (
                clinicSpecies
                  .filter((sp) => sp.name.toLowerCase().includes(speciesPickerSearch.toLowerCase()))
                  .map((sp) => (
                    <SheetRow
                      key={sp.id}
                      label={sp.name}
                      selected={selectedSpeciesId === sp.id}
                      onPress={() => {
                        setSelectedSpecies(sp.name);
                        setSelectedSpeciesId(sp.id);
                        setBreed('');
                        setShowSpeciesPicker(false);
                      }}
                    />
                  ))
              )}
            </ScrollView>
          </View>
        </View>
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
const PHOTO = 80;
const CONTROL_H = 44;

const styles = StyleSheet.create({
  container: { ...common.screen },
  scroll: { flex: 1 },
  // Clears the floating tab bar, which this screen shows.
  scrollContent: { paddingBottom: TAB_BAR_CLEARANCE },

  /* ── Count and add (under the shared header) ── */
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.lg,
    paddingHorizontal: space.xxl,
    paddingTop: space.lg,
    paddingBottom: space.sm,
  },
  headerCopy: { flex: 1, minWidth: 0 },
  subtitle: { ...text.small, color: colors.mutedFg },

  /* ── Buttons: one set, same as the rest of the app ── */
  btn: {
    minHeight: 48,
    borderRadius: radius.md,
    paddingHorizontal: space.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnPrimary: { backgroundColor: colors.primary },
  btnPrimaryText: { ...text.smallBold, color: colors.primaryFg },
  btnSecondary: { borderWidth: 1, borderColor: colors.border, backgroundColor: 'transparent' },
  btnSecondaryText: { ...text.smallBold, color: colors.foreground },
  btnDisabled: { opacity: 0.6 },
  addBtn: {
    minHeight: CONTROL_H,
    borderRadius: radius.md,
    paddingHorizontal: space.xl,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBtnText: { ...text.smallBold, color: colors.primaryFg },

  /* ── Search and sort ── */
  toolbar: { paddingHorizontal: space.xxl, marginTop: space.sm },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: CONTROL_H,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    paddingHorizontal: space.md,
  },
  searchInput: { flex: 1, fontSize: 14, color: colors.foreground, fontFamily: fonts.body, paddingVertical: 0 },
  clearText: { ...text.smallBold, color: colors.primary, marginLeft: space.sm },

  segmented: {
    flexDirection: 'row',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    overflow: 'hidden',
  },
  segment: { flex: 1, minHeight: CONTROL_H, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.sm },
  segmentDivider: { borderLeftWidth: 1, borderLeftColor: colors.border },
  segmentActive: { backgroundColor: colors.primary },
  segmentText: { fontSize: 13, fontFamily: fonts.bodyMedium, color: colors.foreground },
  segmentTextActive: { color: colors.primaryFg, fontFamily: fonts.bodyBold },

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

  /* ── Pet list: flat rows between hairlines, like the profile screen ── */
  list: {
    marginHorizontal: space.xxl,
    marginTop: space.xl,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.lg,
    paddingVertical: space.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  avatar: {
    width: AVATAR,
    height: AVATAR,
    borderRadius: AVATAR / 2,
    borderWidth: 2,
    borderColor: colors.secondary,
  },
  avatarFallback: {
    width: AVATAR,
    height: AVATAR,
    borderRadius: AVATAR / 2,
    backgroundColor: colors.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: { fontFamily: text.display.fontFamily, fontSize: 22, color: colors.primary },
  rowMain: { flex: 1, minWidth: 0 },
  rowTitleLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rowName: { ...text.bodyBold, fontSize: 16, color: colors.foreground, flexShrink: 1, marginRight: space.md },
  manageText: { ...text.smallBold, color: colors.primary },
  rowSub: { ...text.small, color: colors.mutedFg, marginTop: 2 },
  rowMeta: { ...text.caption, color: colors.mutedFg, marginTop: 2 },
  rowNote: { ...text.caption, color: colors.mutedFg, marginTop: space.sm },

  /* ── Sheets ── */
  sheetOverlay: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.card,
    borderTopRightRadius: radius.card,
    paddingHorizontal: space.xxl,
    paddingTop: space.lg,
  },
  sheetTall: { maxHeight: '80%' },
  sheetHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginBottom: space.lg },
  sheetTitle: { fontFamily: fonts.bodyBold, fontSize: 16, color: colors.foreground, marginBottom: space.sm },
  sheetTitleInline: { fontFamily: fonts.bodyBold, fontSize: 16, color: colors.foreground, flexShrink: 1, marginRight: space.md },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space.md },
  sheetHeaderAction: { ...text.smallBold, color: colors.primary },
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
  breedList: { marginTop: space.sm },

  /* ── Wizard ── */
  wizardContainer: { ...common.screen },
  wizardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.xxl,
    paddingBottom: space.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  wizardHeaderSide: { minWidth: 88, minHeight: CONTROL_H - 8, justifyContent: 'center' },
  wizardHeaderAction: { ...text.smallBold, color: colors.foreground },
  wizardHeaderTitle: { flex: 1, textAlign: 'center', fontFamily: fonts.bodyBold, fontSize: 16, color: colors.foreground },

  progress: { paddingHorizontal: space.xxl, paddingTop: space.lg, paddingBottom: space.sm },
  progressBars: { flexDirection: 'row', gap: 6 },
  progressBar: { flex: 1, height: 4, borderRadius: 2, backgroundColor: colors.border },
  progressBarOn: { backgroundColor: colors.primary },
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

  input: { ...common.input, height: undefined, minHeight: 52, paddingVertical: 10 },
  inputWithTrailing: { paddingRight: 84 },
  inputTrailingWrap: { position: 'absolute', right: space.md, top: 0, bottom: 0, justifyContent: 'center' },
  inputTrailing: { ...text.smallBold, color: colors.primary },
  noteInput: { height: 96, textAlignVertical: 'top' },

  photoRow: { flexDirection: 'row', alignItems: 'center', gap: space.lg },
  photoCircle: {
    width: PHOTO,
    height: PHOTO,
    borderRadius: PHOTO / 2,
    backgroundColor: colors.secondary,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
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
  photoCopy: { flex: 1, minWidth: 0 },
  photoBtn: { minHeight: CONTROL_H, alignSelf: 'flex-start' },
  photoHint: { ...text.caption, color: colors.mutedFg, marginTop: space.sm },

  reviewIntro: { ...text.small, color: colors.mutedFg, marginTop: space.lg, marginBottom: space.md },
  reviewList: { borderTopWidth: 1, borderTopColor: colors.border },
  reviewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: space.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  reviewRowLabel: { ...text.small, color: colors.mutedFg },
  reviewRowValue: { ...text.smallBold, color: colors.foreground, flexShrink: 1, textAlign: 'right', marginLeft: space.md },
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
          <Skeleton width={AVATAR} height={AVATAR} radius={AVATAR / 2} />
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
