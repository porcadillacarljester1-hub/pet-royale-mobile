import {
  useState, useEffect, useRef, type ReactNode, type ComponentProps,
} from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  ActivityIndicator, Modal, Image, Pressable, Alert, Animated,
  RefreshControl, KeyboardAvoidingView, Platform,
} from 'react-native';
import { supabase } from '@/lib/supabase';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, text, fonts, space, radius, shadow, common, hitSlop } from '../../constants/theme';
import { TAB_BAR_CLEARANCE } from './_layout';
import { Skeleton } from '../../components/Skeleton';
import { PhotoCropper } from '../../components/PhotoCropper';
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

/* One line of facts under the pet's name: "Female · 3 yrs · 12 kg · Spayed".
   Missing values are left out rather than shown as dashes, and so is an
   "Unknown" answer: it isn't a fact worth printing. */
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
  const female = p.gender === 'Female';
  if (p.neutered === 'Yes') parts.push(female ? 'Spayed' : 'Neutered');
  else if (p.neutered === 'No') parts.push(female ? 'Not spayed' : 'Not neutered');
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

/* Floating-label field, laid out like the sign-in fields: empty, the label
   sits inside a grey field; focused or filled, it moves up small and the
   value sits underneath on a card fill. `left` and `right` hold an icon or
   a small action (search uses both).

   TEMPORARY: this stands in for the app's own FloatField, whose code I
   hadn't seen when this was written. Once FloatField is confirmed to take
   a label, a value, change handling and TextInput props, replace this
   component's body (or its three uses) with it. */
function FloatingField({
  label, required, value, onChangeText, left, right, inputProps,
}: {
  label: string;
  required?: boolean;
  value: string;
  onChangeText: (t: string) => void;
  left?: ReactNode;
  right?: ReactNode;
  inputProps?: ComponentProps<typeof TextInput>;
}) {
  const [focused, setFocused] = useState(false);
  const raised = focused || value.length > 0;
  const [lift] = useState(() => new Animated.Value(raised ? 1 : 0));

  useEffect(() => {
    Animated.timing(lift, { toValue: raised ? 1 : 0, duration: 140, useNativeDriver: false }).start();
  }, [raised, lift]);

  const inset = left ? 48 : 16;
  const rightInset = right ? 72 : 16;
  const labelTop = lift.interpolate({ inputRange: [0, 1], outputRange: [18, 8] });
  const labelSize = lift.interpolate({ inputRange: [0, 1], outputRange: [16, 13] });

  return (
    <View style={[styles.ff, raised && styles.ffRaised, focused && styles.ffFocused]}>
      {left ? <View style={styles.ffLeft}>{left}</View> : null}
      <Animated.Text
        pointerEvents="none"
        numberOfLines={1}
        style={[styles.ffLabel, { left: inset, right: rightInset, top: labelTop, fontSize: labelSize }]}
      >
        {label}
        {required ? <Text style={styles.required}> *</Text> : null}
      </Animated.Text>
      <TextInput
        {...inputProps}
        value={value}
        onChangeText={onChangeText}
        onFocus={(e) => { setFocused(true); inputProps?.onFocus?.(e); }}
        onBlur={(e) => { setFocused(false); inputProps?.onBlur?.(e); }}
        style={[styles.ffInput, { paddingLeft: inset, paddingRight: rightInset }]}
        accessibilityLabel={label}
      />
      {right ? <View style={styles.ffRight}>{right}</View> : null}
    </View>
  );
}

/* Same pattern as the sign-in and My visits tabs: one track, a navy pill
   inside it for the chosen option. */
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
            activeOpacity={0.85}
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

/* Same chip as the time slots on the Book screen: 44px, 2px border, card
   fill, full pill, solid navy when chosen. */
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

function base64ToArrayBuffer(b64: string): ArrayBuffer {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

/* Round photo inside a navy ring, story-style. Falls back to the pet's initial. */
function PetAvatar({ uri, name, size }: { uri?: string | null; name?: string; size: number }) {
  /* A photo that can't load (missing or broken file) shows the initial instead of
     an empty ring. It remembers WHICH address failed, so a new photo is tried
     again with no reset needed (and no state set inside an effect). */
  const [failedUri, setFailedUri] = useState<string | null>(null);
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
          borderWidth: 3, borderColor: colors.card,
          alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
        }}
      >
        {uri && uri !== failedUri ? (
          <Image
            source={{ uri }}
            style={{ width: size, height: size, borderRadius: size / 2 }}
            accessibilityLabel={`${name || 'Pet'} photo`}
            onError={() => setFailedUri(uri)}
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

/* One pet, one card. The whole card opens the manage sheet; the chevron
   says it can be opened. */
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
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityHint="Opens edit and delete options"
    >
      <PetAvatar uri={photoUri} name={name} size={AVATAR} />

      <View style={styles.rowMain}>
        <Text style={styles.rowName} numberOfLines={1}>{name || 'Unnamed pet'}</Text>
        {subtitle ? <Text style={styles.rowSub} numberOfLines={1}>{subtitle}</Text> : null}
        {meta ? <Text style={styles.rowMeta} numberOfLines={2}>{meta}</Text> : null}
      </View>

      <Ionicons name="chevron-forward" size={22} color={colors.primary} />
    </TouchableOpacity>
  );
}

/* Review step: one card, two groups. Each group has its own Edit that
   jumps back to the step that holds those answers. */
function ReviewCard({
  photoUri, name, species, breed, gender, age, neutered, onEditIdentity, onEditDetails,
}: {
  photoUri?: string | null;
  name?: string;
  species?: string;
  breed?: string | null;
  gender?: string | null;
  age?: unknown;
  neutered?: string | null;
  onEditIdentity: () => void;
  onEditDetails: () => void;
}) {
  const subtitle = breed ? `${breed} · ${species}` : species || '';
  const rows = [
    { label: 'Gender', value: gender || '—' },
    { label: 'Age', value: formatAge(age) || '—' },
    { label: gender === 'Female' ? 'Spayed' : 'Neutered', value: neutered || '—' },
  ];

  return (
    <View style={styles.reviewCard}>
      <View style={[styles.reviewGroup, styles.reviewGroupDivider]}>
        <PetAvatar uri={photoUri} name={name} size={44} />
        <View style={styles.reviewCopy}>
          <Text style={styles.reviewLabel}>Pet</Text>
          <Text style={styles.reviewName} numberOfLines={1}>{name || 'Unnamed pet'}</Text>
          {subtitle ? <Text style={styles.reviewSubtitle} numberOfLines={2}>{subtitle}</Text> : null}
        </View>
        <TouchableOpacity
          style={styles.reviewEdit}
          onPress={onEditIdentity}
          hitSlop={hitSlop}
          accessibilityRole="button"
          accessibilityLabel="Edit pet details"
        >
          <Text style={styles.reviewEditText}>Edit</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.reviewGroup}>
        <View style={styles.reviewCopy}>
          {rows.map((r) => (
            <View key={r.label} style={styles.reviewRow}>
              <Text style={styles.reviewRowLabel}>{r.label}</Text>
              <Text style={styles.reviewRowValue} numberOfLines={1}>{r.value}</Text>
            </View>
          ))}
        </View>
        <TouchableOpacity
          style={[styles.reviewEdit, { alignSelf: 'flex-start' }]}
          onPress={onEditDetails}
          hitSlop={hitSlop}
          accessibilityRole="button"
          accessibilityLabel="Edit gender, age and neutered"
        >
          <Text style={styles.reviewEditText}>Edit</Text>
        </TouchableOpacity>
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
  // The cropped photo's data, used for the upload (see uploadPetPhoto).
  const [pendingPhotoBase64, setPendingPhotoBase64] = useState<string | null>(null);
  /* The photo just picked from the library or camera, waiting to be
     cropped. While this is set, the shared PhotoCropper is open. */
  const [cropSource, setCropSource] = useState<{ uri: string; width: number; height: number } | null>(null);
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

  // Species the clinic adds, renames or removes show up without reopening the app
  useRealtimeRefresh('categories', () => {
    fetchClinicSpecies().then((list) => {
      // fetchClinicSpecies returns [] on a network error, so an empty
      // result is ignored rather than blanking the picker.
      if (list.length > 0) setClinicSpecies(list);
    });
  });

  // Same for breeds, for whichever species is currently selected
  useRealtimeRefresh('breeds', () => {
    if (!selectedSpeciesId) return;
    const id = selectedSpeciesId;
    fetchBreedsForSpecies(id).then((list) => setBreedsFor({ speciesId: id, list }));
  });

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
    setPhotoUrl(null); setPendingPhotoUri(null); setPendingPhotoBase64(null); setError('');
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

  /* Both pickers hand the raw photo to the shared PhotoCropper instead of
     using the system crop screen (allowsEditing), so the crop looks and
     behaves the same as on the profile photo screen. Quality is 1 here
     because the cropper does the one and only compression. */
  const pickPhoto = async () => {
    setShowPhotoSheet(false);
    const { status: permStatus } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (permStatus !== 'granted') { Alert.alert('Permission Required', 'Please allow access to your photo library.'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'] as any, allowsEditing: false, quality: 1 });
    if (!result.canceled) {
      const asset = result.assets[0];
      setCropSource({ uri: asset.uri, width: asset.width, height: asset.height });
    }
  };

  const takePhoto = async () => {
    setShowPhotoSheet(false);
    const { status: permStatus } = await ImagePicker.requestCameraPermissionsAsync();
    if (permStatus !== 'granted') { Alert.alert('Permission Required', 'Please allow camera access.'); return; }
    const result = await ImagePicker.launchCameraAsync({ allowsEditing: false, quality: 1 });
    if (!result.canceled) {
      const asset = result.assets[0];
      setCropSource({ uri: asset.uri, width: asset.width, height: asset.height });
    }
  };

  const removePhoto = () => { setShowPhotoSheet(false); setPhotoUrl(null); setPendingPhotoUri(null); setPendingPhotoBase64(null); };

  /* Uploads the cropper's own image data. Re-reading the file with
     fetch(file://) returns a ~14-byte stub on Android, which uploads as a
     photo that never displays. The cropper always returns a JPEG. */
  const uploadPetPhoto = async (base64: string | null, ownerId: string): Promise<string> => {
    if (!base64) throw new Error('No photo data');
    const arrayBuffer = base64ToArrayBuffer(base64);
    // Never store a stub: it would show up as a blank photo.
    if (arrayBuffer.byteLength < 1000) throw new Error('Photo file is too small');
    const fileName = `${ownerId}_${Date.now()}.jpg`;
    const { error: uploadError } = await supabase.storage.from('pet-photos').upload(fileName, arrayBuffer, { contentType: 'image/jpeg', upsert: true });
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
        finalPhotoUrl = await uploadPetPhoto(pendingPhotoBase64, user.id);
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
  const blocked = !stepValid && !isSubmitting;

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
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => fetchPets(true)} tintColor={colors.primary} colors={[colors.primary]} />
        }
      >
        {/* ── Search ── */}
        {pets.length > 0 && (
          <View style={styles.toolbar}>
            <FloatingField
              label="Search by name, species or breed"
              value={search}
              onChangeText={setSearch}
              left={<Ionicons name="search" size={20} color={colors.mutedFg} />}
              right={
                search.length > 0 ? (
                  <TouchableOpacity onPress={() => setSearch('')} hitSlop={hitSlop} accessibilityRole="button" accessibilityLabel="Clear search">
                    <Text style={styles.clearText}>Clear</Text>
                  </TouchableOpacity>
                ) : null
              }
              inputProps={{ returnKeyType: 'search', autoCorrect: false }}
            />
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
              <Ionicons name="close" size={28} color={colors.foreground} />
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
            <View style={styles.progressMeta}>
              <Text style={styles.progressText}>Step {wizardStep} of {STEPS.length}</Text>
              <Text style={styles.progressLabel}>{STEPS[wizardStep - 1].label}</Text>
            </View>
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
                      <View
                        key={pendingPhotoUri || photoUrl || 'empty'}
                        style={[styles.photoCircle, !hasPhoto && styles.photoCircleEmpty]}
                      >
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
                        <Ionicons name="camera" size={16} color={colors.primaryFg} />
                      </View>
                    </TouchableOpacity>

                    <TouchableOpacity onPress={() => setShowPhotoSheet(true)} hitSlop={hitSlop} accessibilityRole="button">
                      <Text style={styles.photoLink}>{hasPhoto ? 'Change photo' : 'Add photo'} <Text style={styles.required}>*</Text></Text>
                    </TouchableOpacity>
                    <Text style={styles.photoHint}>A clear photo helps our staff recognize your pet.</Text>
                  </View>

                  <View style={styles.fieldTop}>
                    <FloatingField label="Pet name" required value={name} onChangeText={setName} />
                  </View>
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

                  <View style={styles.fieldTop}>
                    <FloatingField
                      label="Age (years)"
                      required
                      value={age}
                      onChangeText={setAge}
                      inputProps={{ keyboardType: 'number-pad' }}
                    />
                  </View>
                </>
              )}

              {/* ── Step 3: Review ── */}
              {wizardStep === 3 && (
                <>
                  <Text style={styles.reviewTitle}>Check the details</Text>
                  <Text style={styles.reviewIntro}>You can edit every detail later.</Text>
                  <ReviewCard
                    photoUri={pendingPhotoUri || photoUrl}
                    name={name}
                    species={selectedSpecies}
                    breed={breed}
                    gender={selectedGender}
                    age={age}
                    neutered={neutered}
                    onEditIdentity={() => { setError(''); setWizardStep(1); }}
                    onEditDetails={() => { setError(''); setWizardStep(2); }}
                  />
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
              style={[styles.btn, styles.btnPrimary, styles.footerPrimary, isSubmitting && styles.btnDisabled, blocked && styles.btnBlocked]}
              onPress={wizardStep < 3 ? goNextStep : handleSubmit}
              disabled={isSubmitting || !stepValid}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityState={{ disabled: isSubmitting || !stepValid, busy: isSubmitting }}
            >
              {isSubmitting ? (
                <ActivityIndicator color={colors.primaryFg} />
              ) : (
                <Text style={[styles.btnPrimaryText, blocked && styles.btnBlockedText]}>
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

      {/* Shared circle cropper, at screen level beside the photo sheet (not
          inside the wizard Modal), the same way the profile photo screen
          uses it. */}
      <PhotoCropper
        source={cropSource}
        onCancel={() => setCropSource(null)}
        onDone={(uri, base64) => {
          setPendingPhotoUri(uri);
          setPendingPhotoBase64(base64);
          setCropSource(null);
        }}
      />
    </View>
  );
}

const AVATAR = 56;
const PHOTO = 96;
const CONTROL_H = 44;
const BUTTON_H = 48;

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
  headerTitle: {
    flex: 1,
    fontFamily: fonts.bodyBold,
    fontSize: 28,
    lineHeight: 34,
    letterSpacing: -0.5,
    color: colors.foreground,
  },
  count: { ...text.small, color: colors.mutedFg, paddingHorizontal: space.xxl, paddingTop: space.md },

  /* ── Buttons ── */
  /* Every full-width button: 48px, fully rounded. Primary is solid navy
     (Continue, Save changes, Add pet, Add your first pet). Secondary is a
     navy outline (Back, Cancel, Clear search). Red is only for deleting.
     A blocked Continue is flat and muted, like the Book screen's, instead
     of a faded copy of the navy button. */
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
    borderWidth: 2,
    borderColor: colors.primary,
  },
  btnSecondaryText: { ...text.bodyBold, color: colors.primary },
  btnDisabled: { opacity: 0.6 },
  btnBlocked: { backgroundColor: colors.muted },
  btnBlockedText: { color: colors.mutedFg },

  /* Add pet: the one solid navy button in the header, a 44px pill. */
  addBtn: {
    height: CONTROL_H,
    borderRadius: CONTROL_H / 2,
    paddingLeft: space.md,
    paddingRight: space.lg,
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  addBtnText: { ...text.smallBold, color: colors.primaryFg },

  /* ── Floating-label field ── */
  ff: {
    height: 60,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: 'transparent',
    backgroundColor: colors.muted,
    justifyContent: 'center',
  },
  ffRaised: { backgroundColor: colors.card, borderColor: colors.cardBorder },
  ffFocused: { borderColor: colors.primary },
  ffLabel: {
    position: 'absolute',
    lineHeight: 20,
    fontFamily: fonts.body,
    color: colors.mutedFg,
  },
  ffInput: {
    height: '100%',
    paddingTop: 22,
    paddingBottom: 6,
    fontSize: 17,
    fontFamily: fonts.bodyMedium,
    color: colors.foreground,
    includeFontPadding: false,
  },
  ffLeft: { position: 'absolute', left: 16, top: 0, bottom: 0, justifyContent: 'center' },
  ffRight: { position: 'absolute', right: 16, top: 0, bottom: 0, justifyContent: 'center' },

  /* ── Search ── */
  toolbar: { paddingHorizontal: space.xxl, marginTop: space.lg },
  clearText: { ...text.smallBold, color: colors.primary },

  /* ── Segmented control: one track, a navy pill for the chosen option ── */
  segmented: {
    flexDirection: 'row',
    padding: 4,
    borderRadius: 28,
    backgroundColor: colors.card,
    ...shadow.primary, // use a softer shadow token if this reads heavy
  },
  segment: {
    flex: 1,
    height: BUTTON_H,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.sm,
    borderRadius: BUTTON_H / 2,
  },
  segmentActive: { backgroundColor: colors.primary },
  segmentText: { fontFamily: fonts.bodyBold, fontSize: 16, color: colors.mutedFg },
  segmentTextActive: { color: colors.primaryFg },

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

  /* ── Pet list: one card per pet, the whole card is the tap target ── */
  list: { marginTop: space.lg, paddingHorizontal: space.xxl, gap: space.md },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: 14,
    paddingLeft: space.lg,
    paddingRight: space.md,
    backgroundColor: colors.card,
    borderWidth: 2,
    borderColor: colors.cardBorder,
    borderRadius: 24,
  },
  avatarFallback: {
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: { fontFamily: text.display.fontFamily, color: colors.accent },
  rowMain: { flex: 1, minWidth: 0 },
  rowName: { ...text.bodyBold, fontSize: 18, lineHeight: 24, color: colors.foreground },
  rowSub: { ...text.small, color: colors.mutedFg, marginTop: 2 },
  rowMeta: { ...text.caption, color: colors.mutedFg, marginTop: 2 },

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
  wizardClose: { minHeight: CONTROL_H, justifyContent: 'center' },
  wizardHeaderTitle: {
    flex: 1,
    fontFamily: fonts.bodyBold,
    fontSize: 28,
    lineHeight: 34,
    letterSpacing: -0.5,
    color: colors.foreground,
  },

  /* Same progress bars as the Book flow. */
  progress: { paddingHorizontal: space.xxl, paddingTop: space.md, paddingBottom: space.sm },
  progressBars: { flexDirection: 'row', gap: 8 },
  progressBar: { flex: 1, height: 5, borderRadius: 3, backgroundColor: '#D9D6C8' },
  progressBarOn: { backgroundColor: colors.primary },
  progressMeta: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 },
  progressText: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: colors.mutedFg },
  progressLabel: { fontFamily: fonts.bodyBold, fontSize: 14, lineHeight: 20, color: colors.primary },

  wizardScroll: { flex: 1 },
  wizardForm: { paddingHorizontal: space.xxl, paddingBottom: space.xl },
  errorBox: {
    backgroundColor: colors.destructiveBg,
    borderRadius: radius.md,
    padding: space.md,
    marginTop: space.md,
  },
  errorText: { ...text.small, color: colors.destructive },

  fieldTop: { marginTop: space.xl },
  fieldLabel: { fontSize: 15, fontFamily: fonts.bodyBold, color: colors.foreground, marginBottom: space.sm, marginTop: space.xl },
  required: { color: colors.destructive },
  optionalText: { color: colors.mutedFg, fontFamily: fonts.body, fontSize: 13 },
  fieldHint: { ...text.caption, color: colors.mutedFg, marginTop: space.sm },

  /* Species and breed chips: same as the time slots on the Book screen. */
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  chip: {
    height: CONTROL_H,
    paddingHorizontal: space.lg,
    borderRadius: CONTROL_H / 2,
    borderWidth: 2,
    borderColor: colors.cardBorder,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.foreground },
  chipTextOn: { color: colors.primaryFg },

  /* Photo: one big round picture, centred, with a + badge */
  photoCenter: { alignItems: 'center', paddingTop: space.lg, gap: space.sm },
  photoCircle: {
    width: PHOTO,
    height: PHOTO,
    borderRadius: PHOTO / 2,
    backgroundColor: colors.muted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoCircleEmpty: { borderWidth: 2, borderStyle: 'dashed', borderColor: colors.border },
  photoImage: { width: PHOTO, height: PHOTO, borderRadius: PHOTO / 2, backgroundColor: colors.muted },
  photoPlaceholder: { ...text.caption, color: colors.mutedFg, textAlign: 'center', paddingHorizontal: 6 },
  photoUploadOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: PHOTO / 2,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoPlus: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.primary,
    borderWidth: 3,
    borderColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoLink: { ...text.smallBold, color: colors.foreground },
  photoHint: { ...text.caption, color: colors.mutedFg, textAlign: 'center' },

  /* Review: one card, two groups */
  reviewTitle: { fontFamily: fonts.bodyBold, fontSize: 22, lineHeight: 28, color: colors.foreground, marginTop: space.xl },
  reviewIntro: { ...text.small, color: colors.mutedFg, marginTop: 4 },
  reviewCard: {
    marginTop: space.xl,
    backgroundColor: colors.card,
    borderWidth: 2,
    borderColor: colors.cardBorder,
    borderRadius: 24,
    paddingHorizontal: space.lg,
    paddingVertical: 4,
  },
  reviewGroup: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: 14 },
  reviewGroupDivider: { borderBottomWidth: 1, borderBottomColor: colors.cardBorder },
  reviewCopy: { flex: 1, minWidth: 0 },
  reviewLabel: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18, color: colors.mutedFg },
  reviewName: { fontFamily: fonts.bodyBold, fontSize: 18, lineHeight: 24, color: colors.foreground },
  reviewSubtitle: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: colors.mutedFg },
  reviewRow: { flexDirection: 'row', justifyContent: 'space-between', gap: space.md, paddingVertical: 6 },
  reviewRowLabel: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22, color: colors.mutedFg },
  reviewRowValue: { fontFamily: fonts.bodyBold, fontSize: 15, lineHeight: 22, color: colors.foreground, flexShrink: 1, textAlign: 'right' },
  reviewEdit: { minWidth: CONTROL_H, height: CONTROL_H, alignItems: 'flex-end', justifyContent: 'center' },
  reviewEditText: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.primary },

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
   Same cards as the real list (round photo, a name line, a breed and
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
