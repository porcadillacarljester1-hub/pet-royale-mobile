import {
  useState, useEffect, useRef, type ReactNode,
} from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  ActivityIndicator, Modal, Image, Pressable, Alert, type TextInputProps,
  RefreshControl, KeyboardAvoidingView, Keyboard, Platform,
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

/* Age is saved in whole years (pets.age) exactly as before. The Months
   stepper only appears, and only saves, once the column below exists:

     alter table pets add column age_months smallint
       not null default 0 check (age_months between 0 and 11);

   Run that, then set this to true. While it is false, nothing new is
   sent to the database, so saving a pet cannot break. */
const AGE_MONTHS_ENABLED = false;

/* Up to this many species (or breeds) are shown as tiles/chips. More
   than that switches to one tappable field that opens a searchable list,
   so a clinic with 15+ species never gets a wall of buttons. */
const INLINE_OPTIONS_MAX = 8;

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

const toInt = (s: string) => parseInt(s, 10) || 0;

/* "2 yrs 3 mos", "8 mos", "Under 1 yr". Months are only shown when the
   months column is switched on. */
function formatAge(age: unknown, months: unknown = null): string {
  const hasYears = hasValue(age) && !Number.isNaN(Number(age));
  const y = hasYears ? Number(age) : 0;
  const m = AGE_MONTHS_ENABLED && hasValue(months) && !Number.isNaN(Number(months)) ? Number(months) : 0;
  if (!hasYears && m === 0) return '';
  const parts: string[] = [];
  if (y > 0) parts.push(`${y} yr${y === 1 ? '' : 's'}`);
  if (m > 0) parts.push(`${m} mo${m === 1 ? '' : 's'}`);
  return parts.length ? parts.join(' ') : 'Under 1 yr';
}

/* The confirmation line under the age steppers: "About 2 years 3 months". */
function ageSummary(years: string, months: string): string {
  const y = toInt(years);
  const m = AGE_MONTHS_ENABLED ? toInt(months) : 0;
  const parts: string[] = [];
  if (y > 0) parts.push(`${y} year${y === 1 ? '' : 's'}`);
  if (m > 0) parts.push(`${m} month${m === 1 ? '' : 's'}`);
  return parts.length ? `About ${parts.join(' ')}` : 'Under 1 year old';
}

/* One line of facts under the pet's name: "Female · 3 yrs · 12 kg".
   Missing values are left out rather than shown as dashes. The
   spayed/neutered answer is its own tag now (see neuteredTag). */
function describePet(p: {
  gender?: string | null;
  age?: unknown;
  ageMonths?: unknown;
  weight?: unknown;
}): string {
  const parts: string[] = [];
  if (p.gender) parts.push(p.gender);
  const age = formatAge(p.age, p.ageMonths);
  if (age) parts.push(age);
  if (hasValue(p.weight) && Number(p.weight) > 0) parts.push(`${p.weight} kg`);
  return parts.join(' · ');
}

/* "Not spayed" in amber, "Spayed" in green. An "Unknown" or missing
   answer shows no tag: it isn't a fact worth printing. */
function neuteredTag(gender?: string | null, neutered?: string | null): { label: string; warn: boolean } | null {
  const female = gender === 'Female';
  if (neutered === 'Yes') return { label: female ? 'Spayed' : 'Neutered', warn: false };
  if (neutered === 'No') return { label: female ? 'Not spayed' : 'Not neutered', warn: true };
  return null;
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

function validateDetails(f: { gender: string; ageYears: string; ageMonths: string }): string {
  if (!f.gender) return 'Please select a gender.';
  const y = f.ageYears.trim();
  const m = AGE_MONTHS_ENABLED ? f.ageMonths.trim() : '';
  if (!y && !m) return 'Please enter age.';
  if (y && !/^\d+$/.test(y)) return 'Years must be a whole number.';
  if (m && (!/^\d+$/.test(m) || parseInt(m, 10) > 11)) return 'Months must be between 0 and 11.';
  return '';
}

/* True while the on-screen keyboard is up. The wizard footer uses it to
   drop the bottom safe-area gap, so the buttons sit right on the keyboard. */
function useKeyboardVisible() {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const ios = Platform.OS === 'ios';
    const show = Keyboard.addListener(ios ? 'keyboardWillShow' : 'keyboardDidShow', () => setVisible(true));
    const hide = Keyboard.addListener(ios ? 'keyboardWillHide' : 'keyboardDidHide', () => setVisible(false));
    return () => { show.remove(); hide.remove(); };
  }, []);
  return visible;
}

/* ── Shared components ── */

/* Plain text field: the label sits above it (like every other field in
   the form), the box has a navy border while typing. No floating label. */
function PlainField({
  label, value, onChangeText, ...inputProps
}: { label: string; value: string; onChangeText: (t: string) => void } & TextInputProps) {
  const [focused, setFocused] = useState(false);
  return (
    <TextInput
      {...inputProps}
      style={[styles.plainInput, focused && styles.plainInputFocused]}
      value={value}
      onChangeText={onChangeText}
      placeholderTextColor={colors.mutedFg}
      onFocus={(e) => { setFocused(true); inputProps.onFocus?.(e); }}
      onBlur={(e) => { setFocused(false); inputProps.onBlur?.(e); }}
      accessibilityLabel={label}
    />
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

/* The sheet lifts with the keyboard, so a search box inside it (the
   species and breed lists) is never covered. */
function BottomSheet({
  visible, onClose, bottomInset, children, animationType = 'slide',
}: {
  visible: boolean; onClose: () => void; bottomInset: number; children: ReactNode;
  animationType?: 'none' | 'slide';
}) {
  return (
    <Modal visible={visible} transparent animationType={animationType} onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.sheetOverlay} behavior="padding">
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
        <View style={[styles.sheet, { paddingBottom: bottomInset + space.lg }]}>
          <View style={styles.sheetHandle} />
          {children}
        </View>
      </KeyboardAvoidingView>
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

/* Species / breed picker. Few options: tiles (species) or chips (breed).
   Many options: one field that opens the searchable list, which lives at
   screen level beside the photo sheet (see MyPetsScreen). */
function OptionPicker({
  options, selectedId, onSelect, onOpenList, placeholder, tiles,
}: {
  options: { id: string; name: string }[];
  selectedId: string;
  onSelect: (o: { id: string; name: string }) => void;
  onOpenList: () => void;
  placeholder: string;
  tiles?: boolean;
}) {
  if (options.length > INLINE_OPTIONS_MAX) {
    const selected = options.find((o) => o.id === selectedId);
    return (
      <TouchableOpacity
        style={styles.pickerField}
        onPress={onOpenList}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel={selected ? `${placeholder}: ${selected.name}` : placeholder}
      >
        <Text style={[styles.pickerValue, !selected && styles.pickerPlaceholder]} numberOfLines={1}>
          {selected ? selected.name : placeholder}
        </Text>
        <Ionicons name="chevron-down" size={20} color={colors.mutedFg} />
      </TouchableOpacity>
    );
  }

  if (tiles) {
    return (
      <View style={styles.tiles}>
        {options.map((o) => {
          const on = selectedId === o.id;
          return (
            <TouchableOpacity
              key={o.id}
              style={[styles.tile, on && styles.tileOn]}
              onPress={() => onSelect(o)}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
            >
              <Text style={[styles.tileText, on && styles.tileTextOn]} numberOfLines={2}>{o.name}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    );
  }

  return (
    <View style={styles.chips}>
      {options.map((o) => (
        <Chip key={o.id} label={o.name} selected={selectedId === o.id} onPress={() => onSelect(o)} />
      ))}
    </View>
  );
}

/* One half of the age picker: − [ number ] +. The number is also a real
   field, so it can be typed with the number keypad. Digits only, and it is
   clamped to `max` as you type. The "0" placeholder is hidden while the
   field is focused, so the caret never sits on top of it. */
function AgeStepper({
  label, unit, value, onChange, max,
}: {
  label: string; unit: string; value: string; onChange: (v: string) => void; max: number;
}) {
  const [focused, setFocused] = useState(false);
  const n = toInt(value);
  const step = (d: number) => onChange(String(Math.min(max, Math.max(0, n + d))));
  const canDown = n > 0;
  const canUp = n < max;

  return (
    <View style={styles.stepper}>
      <Text style={styles.stepperLabel}>{label}</Text>
      <View style={styles.stepperRow}>
        <TouchableOpacity
          style={[styles.stepBtn, !canDown && styles.stepBtnOff]}
          onPress={() => step(-1)}
          disabled={!canDown}
          hitSlop={hitSlop}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel={`Decrease ${unit}`}
        >
          <Ionicons name="remove" size={22} color={canDown ? colors.primary : colors.mutedFg} />
        </TouchableOpacity>

        <TextInput
          style={styles.stepInput}
          value={value}
          onChangeText={(t) => {
            const digits = t.replace(/\D/g, '').slice(0, 2);
            onChange(digits === '' ? '' : String(Math.min(max, parseInt(digits, 10))));
          }}
          placeholder={focused ? '' : '0'}
          placeholderTextColor={colors.mutedFg}
          keyboardType="number-pad"
          maxLength={2}
          selectTextOnFocus
          returnKeyType="done"
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onSubmitEditing={() => Keyboard.dismiss()}
          accessibilityLabel={`${label} (${unit})`}
        />

        <TouchableOpacity
          style={[styles.stepBtn, styles.stepBtnPlus, !canUp && styles.stepBtnOff]}
          onPress={() => step(1)}
          disabled={!canUp}
          hitSlop={hitSlop}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel={`Increase ${unit}`}
        >
          <Ionicons name="add" size={22} color={canUp ? colors.primaryFg : colors.mutedFg} />
        </TouchableOpacity>
      </View>
    </View>
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

/* The list's search bar: a slim 48px pill with the magnifier inside and a
   clear (x) button once something is typed. It is its own component on
   purpose: the floating-label field is also used for the pet name and the
   species / breed search in the add-pet form, and that must not change. */
function SearchBar({
  value, onChangeText, placeholder = 'Search pets',
}: { value: string; onChangeText: (t: string) => void; placeholder?: string }) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={[styles.search, focused && styles.searchFocused]}>
      <Ionicons name="search" size={20} color={colors.mutedFg} />
      <TextInput
        style={styles.searchInput}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.mutedFg}
        returnKeyType="search"
        autoCorrect={false}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        accessibilityLabel={placeholder}
      />
      {value.length > 0 ? (
        <TouchableOpacity
          onPress={() => onChangeText('')}
          hitSlop={hitSlop}
          style={styles.searchClear}
          accessibilityRole="button"
          accessibilityLabel="Clear search"
        >
          <Ionicons name="close-circle" size={20} color={colors.mutedFg} />
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

/* One pet per row inside the list card. The whole row opens the manage
   sheet, and so does the "…" button: it is the visible hint that there
   is a menu (Edit, Delete). The spayed / neutered line takes the colour
   of the pet's gender (rose for female, blue for male); "Not spayed" is
   bold because it is the one an owner may act on, "Spayed" is lighter. */
function PetRow({
  first, photoUri, name, species, breed, gender, age, ageMonths, weight, neutered, onPress,
}: {
  first: boolean;
  photoUri?: string | null;
  name?: string;
  species?: string;
  breed?: string | null;
  gender?: string | null;
  age?: unknown;
  ageMonths?: unknown;
  weight?: unknown;
  neutered?: string | null;
  onPress: () => void;
}) {
  const subtitle = breed ? `${breed} · ${species}` : species || '';
  const meta = describePet({ gender, age, ageMonths, weight });
  const details = [subtitle, meta].filter(Boolean).join(' · ');
  const tag = neuteredTag(gender, neutered);
  const genderStyle = gender === 'Female' ? styles.statusFemale : gender === 'Male' ? styles.statusMale : null;

  return (
    <TouchableOpacity
      style={[styles.row, !first && styles.rowDivider]}
      onPress={onPress}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityHint="Opens edit and delete options"
    >
      <PetAvatar uri={photoUri} name={name} size={AVATAR - 12} />

      <View style={styles.rowMain}>
        <Text style={styles.rowName}>{name || 'Unnamed pet'}</Text>
        {details ? <Text style={styles.rowMeta}>{details}</Text> : null}
        {tag ? (
          <Text style={[styles.rowStatus, genderStyle, tag.warn ? styles.statusWarn : styles.statusDone]}>
            {tag.label}
          </Text>
        ) : null}
      </View>

      <TouchableOpacity
        onPress={onPress}
        hitSlop={hitSlop}
        style={styles.moreBtn}
        accessibilityRole="button"
        accessibilityLabel={`More options for ${name || 'pet'}`}
      >
        <Ionicons name="ellipsis-horizontal" size={20} color={colors.mutedFg} />
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

/* Review step: one card, two groups. Each group has its own Edit that
   jumps back to the step that holds those answers. */
function ReviewCard({
  photoUri, name, species, breed, gender, age, ageMonths, neutered, onEditIdentity, onEditDetails,
}: {
  photoUri?: string | null;
  name?: string;
  species?: string;
  breed?: string | null;
  gender?: string | null;
  age?: unknown;
  ageMonths?: unknown;
  neutered?: string | null;
  onEditIdentity: () => void;
  onEditDetails: () => void;
}) {
  const subtitle = breed ? `${breed} · ${species}` : species || '';
  const rows = [
    { label: 'Gender', value: gender || '—' },
    { label: 'Age', value: formatAge(age, ageMonths) || '—' },
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
          {isSearch ? 'Clear filters' : 'Add your first pet'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

export default function MyPetsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const keyboardVisible = useKeyboardVisible();

  const [pets, setPets] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');
  const [speciesFilter, setSpeciesFilter] = useState('');
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
  // Age is typed or stepped as text, then checked in validateDetails.
  const [ageYears, setAgeYears] = useState('');
  const [ageMonths, setAgeMonths] = useState('');
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

  /* The searchable species / breed list. Like the photo sheet it sits at
     screen level, not inside the wizard Modal. */
  const [pickerSheet, setPickerSheet] = useState<null | 'species' | 'breed'>(null);
  const [pickerQuery, setPickerQuery] = useState('');

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

  /* Each step starts at the top instead of wherever the last one was
     scrolled to. The keyboard is also closed on every step change: when
     the focused input unmounts, Android hands focus to the next TextInput
     (the Age field on step 2) and pops the keyboard up by itself. */
  useEffect(() => {
    wizardScrollRef.current?.scrollTo({ y: 0, animated: false });
    if (!showModal) return;
    const t = setTimeout(() => Keyboard.dismiss(), 60);
    return () => clearTimeout(t);
  }, [wizardStep, showModal]);

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
    setAgeYears(pet.age !== null && pet.age !== undefined ? String(pet.age) : '');
    setAgeMonths(
      AGE_MONTHS_ENABLED && pet.age_months !== null && pet.age_months !== undefined
        ? String(pet.age_months)
        : '',
    );
    setSelectedGender(pet.gender || '');
    setNeutered(pet.neutered || '');
    setPhotoUrl(pet.photo_url || null);
    setError('');
    setWizardStep(1);
    setShowModal(true);
  };

  const resetForm = () => {
    setName(''); setSelectedSpecies(''); setSelectedSpeciesId(''); setBreed('');
    setAgeYears(''); setAgeMonths(''); setSelectedGender(''); setNeutered('No');
    setPhotoUrl(null); setPendingPhotoUri(null); setPendingPhotoBase64(null); setError('');
  };

  const closeModal = () => {
    Keyboard.dismiss();
    setShowModal(false);
    setEditingPet(null);
    resetForm();
  };

  // Closing a half-filled new pet asks first; a stray tap shouldn't wipe three steps of input.
  const requestClose = () => {
    if (isSubmitting) return;
    const dirty = !editingPet && !!(
      name || selectedSpecies || breed || ageYears || ageMonths || selectedGender || pendingPhotoUri
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

  /* Picking a species clears the breed (a breed belongs to one species);
     tapping the chosen one again un-picks it. Used by the tiles and by
     the searchable list. The keyboard is closed first so the rest of the
     tiles (and the Continue button) are not left half hidden. */
  const chooseSpecies = (sp: SpeciesOption) => {
    Keyboard.dismiss();
    const same = selectedSpeciesId === sp.id;
    setSelectedSpecies(same ? '' : sp.name);
    setSelectedSpeciesId(same ? '' : sp.id);
    setBreed('');
  };

  const chooseBreed = (b: BreedOption) => setBreed(breed === b.name ? '' : b.name);

  const openPicker = (which: 'species' | 'breed') => {
    setPickerQuery('');
    setPickerSheet(which);
  };
  const closePicker = () => { setPickerSheet(null); setPickerQuery(''); };

  const goNextStep = () => {
    const err =
      wizardStep === 1
        ? validateIdentity({ hasPhoto, name, species: selectedSpecies, breed })
        : wizardStep === 2
          ? validateDetails({ gender: selectedGender, ageYears, ageMonths })
          : '';
    if (err) { setError(err); return; }
    Keyboard.dismiss();
    setError('');
    setWizardStep((s) => Math.min(3, s + 1));
  };

  const goPrevStep = () => {
    Keyboard.dismiss();
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
       already stored, so editing a pet never wipes them.

       age stays whole years. A pet entered as "0 years 8 months" saves
       age 0 plus age_months 8 (once AGE_MONTHS_ENABLED is on). */
    const payload: Record<string, unknown> = {
      name: name.trim(),
      species: selectedSpecies,
      breed: breed.trim() || null,
      age: toInt(ageYears),
      gender: selectedGender,
      neutered: neutered || null,
      photo_url: finalPhotoUrl,
    };
    if (AGE_MONTHS_ENABLED) payload.age_months = Math.min(11, toInt(ageMonths));

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

  /* Species filter chips are built from the owner's own pets, with counts.
     A filter whose pets are all gone (deleted, or renamed) quietly drops
     back to "All" instead of showing an empty list. */
  const speciesCounts = pets.reduce<Record<string, number>>((acc, p) => {
    if (p.species) acc[p.species] = (acc[p.species] || 0) + 1;
    return acc;
  }, {});
  const speciesNames = Object.keys(speciesCounts);
  const activeFilter = speciesFilter && speciesCounts[speciesFilter] ? speciesFilter : '';

  const filtered = pets.filter((p) => {
    if (activeFilter && p.species !== activeFilter) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return p.name?.toLowerCase().includes(q) || p.species?.toLowerCase().includes(q) || p.breed?.toLowerCase().includes(q);
  });

  const isFiltering = !!search.trim() || !!activeFilter;
  const petWord = pets.length === 1 ? 'pet' : 'pets';
  const countLabel =
    pets.length === 0
      ? ''
      : isFiltering
        ? `${filtered.length} of ${pets.length} ${petWord}`
        : `${pets.length} ${petWord}`;

  const clearFilters = () => { setSearch(''); setSpeciesFilter(''); };

  // Continue stays greyed out until the step's required fields are filled.
  const stepValid =
    wizardStep === 1 ? !validateIdentity({ hasPhoto, name, species: selectedSpecies, breed })
    : wizardStep === 2 ? !validateDetails({ gender: selectedGender, ageYears, ageMonths })
    : true;
  const blocked = !stepValid && !isSubmitting;
  const ageReady = !!ageYears.trim() || (AGE_MONTHS_ENABLED && !!ageMonths.trim());

  // The searchable list's contents (species or breeds), filtered by what's typed.
  const pickerOptions: { id: string; name: string }[] = pickerSheet === 'breed' ? availableBreeds : clinicSpecies;
  const pickerShown = pickerOptions.filter((o) => o.name.toLowerCase().includes(pickerQuery.trim().toLowerCase()));

  return (
    <View style={styles.container}>
      {/* Header: back, title with the pet count under it, Add pet on the right. */}
      <View style={[styles.header, { paddingTop: insets.top + space.sm }]}>
        <TouchableOpacity onPress={handleBack} hitSlop={hitSlop} style={styles.headerBack} accessibilityRole="button" accessibilityLabel="Back">
          <Ionicons name="chevron-back" size={28} color={colors.foreground} />
        </TouchableOpacity>
        <View style={styles.headerCopy}>
          <Text style={styles.headerTitle} numberOfLines={1}>My Pets</Text>
          {countLabel ? <Text style={styles.count}>{countLabel}</Text> : null}
        </View>
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
            <SearchBar value={search} onChangeText={setSearch} />
          </View>
        )}

        {/* ── Species filter (only when there is more than one species to filter by) ── */}
        {speciesNames.length > 1 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            style={styles.filterScroll}
            contentContainerStyle={styles.filterRow}
          >
            <Chip label={`All ${pets.length}`} selected={!activeFilter} onPress={() => setSpeciesFilter('')} />
            {speciesNames.map((s) => (
              <Chip
                key={s}
                label={`${s} ${speciesCounts[s]}`}
                selected={activeFilter === s}
                onPress={() => setSpeciesFilter(activeFilter === s ? '' : s)}
              />
            ))}
          </ScrollView>
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
              isSearch={pets.length > 0 && isFiltering}
              query={search.trim() || activeFilter}
              onAdd={openAdd}
              onClearSearch={clearFilters}
            />
          )
        ) : (
          <View style={styles.list}>
            {filtered.map((pet, i) => (
              <PetRow
                key={pet.id}
                first={i === 0}
                onPress={() => setMenuPet(pet)}
                photoUri={pet.photo_url}
                name={pet.name}
                species={pet.species}
                breed={pet.breed}
                gender={pet.gender}
                age={pet.age}
                ageMonths={pet.age_months}
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

      {/* ══════════════════ Add / edit pet: 3-step wizard ══════════════════
          KeyboardAvoidingView uses "padding" on both platforms so the footer
          buttons ride up on the keyboard.

          statusBarTranslucent: on Android a Modal otherwise starts below the
          status bar, so KeyboardAvoidingView under-measures the keyboard by
          one status-bar height and the footer ends up clipped behind it. The
          header already adds insets.top, so nothing else needs to change.

          If Android ever shows a double gap above the keyboard, change
          Android's behavior here to undefined. */}
      <Modal visible={showModal} animationType="slide" statusBarTranslucent onRequestClose={requestClose}>
        <KeyboardAvoidingView style={styles.wizardContainer} behavior="padding">
          <View style={[styles.wizardHeader, { paddingTop: insets.top + space.sm }]}>
            <TouchableOpacity onPress={requestClose} hitSlop={hitSlop} style={styles.wizardClose} accessibilityRole="button" accessibilityLabel="Cancel">
              <Ionicons name="close" size={24} color={colors.foreground} />
            </TouchableOpacity>
            <Text style={styles.wizardHeaderTitle} numberOfLines={1}>
              {editingPet ? 'Edit pet' : 'New pet'}
            </Text>
            <Text style={styles.progressText}>Step {wizardStep} of {STEPS.length}</Text>
          </View>

          <View style={styles.progress}>
            <View style={styles.progressBars}>
              {STEPS.map((s) => (
                <View key={s.key} style={[styles.progressBar, s.key <= wizardStep && styles.progressBarOn]} />
              ))}
            </View>
            <View style={styles.progressLabels}>
              {STEPS.map((s) => (
                <Text
                  key={s.key}
                  style={[styles.progressLabel, s.key === wizardStep && styles.progressLabelOn]}
                >
                  {s.label}
                </Text>
              ))}
            </View>
          </View>

          <ScrollView
            ref={wizardScrollRef}
            style={styles.wizardScroll}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
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
                  <View style={styles.photoRow}>
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

                    <View style={styles.photoCopy}>
                      <Text style={styles.photoTitle}>Pet photo <Text style={styles.required}>*</Text></Text>
                      <Text style={styles.photoHint}>A clear photo helps our staff recognize your pet.</Text>
                      <TouchableOpacity
                        style={styles.photoBtn}
                        onPress={() => setShowPhotoSheet(true)}
                        hitSlop={hitSlop}
                        activeOpacity={0.85}
                        accessibilityRole="button"
                      >
                        <Text style={styles.photoBtnText}>{hasPhoto ? 'Change photo' : 'Add photo'}</Text>
                      </TouchableOpacity>
                    </View>
                  </View>

                  <Text style={styles.fieldLabel}>Pet name <Text style={styles.required}>*</Text></Text>
                  <PlainField
                    label="Pet name"
                    placeholder="Enter your pet's name"
                    value={name}
                    onChangeText={setName}
                    returnKeyType="done"
                    autoCapitalize="words"
                    onSubmitEditing={() => Keyboard.dismiss()}
                  />
                  <Text style={styles.fieldHint}>This is how you&apos;ll see them across the app.</Text>

                  <Text style={styles.fieldLabel}>Species <Text style={styles.required}>*</Text></Text>
                  {clinicSpecies.length === 0 ? (
                    <Text style={styles.fieldHint}>
                      The clinic hasn&apos;t listed any species yet — please contact them directly.
                    </Text>
                  ) : (
                    <OptionPicker
                      tiles
                      options={clinicSpecies}
                      selectedId={selectedSpeciesId}
                      onSelect={chooseSpecies}
                      onOpenList={() => openPicker('species')}
                      placeholder="Choose species"
                    />
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
                    <OptionPicker
                      options={availableBreeds}
                      selectedId={availableBreeds.find((b) => b.name === breed)?.id || ''}
                      onSelect={chooseBreed}
                      onOpenList={() => openPicker('breed')}
                      placeholder="Choose breed"
                    />
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

                  <Text style={styles.fieldLabel}>Age <Text style={styles.required}>*</Text></Text>
                  <View style={styles.stepperRowWrap}>
                    <AgeStepper label="Years" unit="years" value={ageYears} onChange={setAgeYears} max={99} />
                    {AGE_MONTHS_ENABLED && (
                      <AgeStepper label="Months" unit="months" value={ageMonths} onChange={setAgeMonths} max={11} />
                    )}
                  </View>
                  {ageReady ? (
                    <View style={styles.ageSummary}>
                      <Text style={styles.ageSummaryText}>{ageSummary(ageYears, ageMonths)}</Text>
                    </View>
                  ) : null}
                  <Text style={styles.fieldHint}>
                    {AGE_MONTHS_ENABLED
                      ? 'An estimate is fine. Under a year old? Use 0 years and the months.'
                      : 'An estimate is fine. Under a year old? Enter 0.'}
                  </Text>
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
                    age={ageYears.trim() ? ageYears : AGE_MONTHS_ENABLED && ageMonths.trim() ? 0 : null}
                    ageMonths={ageMonths}
                    neutered={neutered}
                    onEditIdentity={() => { setError(''); setWizardStep(1); }}
                    onEditDetails={() => { setError(''); setWizardStep(2); }}
                  />
                </>
              )}
            </View>
          </ScrollView>

          {/* With the keyboard open the home-bar gap is dropped, so the
              buttons sit directly on top of the keyboard. */}
          <View
            style={[
              styles.wizardFooter,
              { paddingBottom: keyboardVisible ? space.md : insets.bottom + space.md },
            ]}
          >
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

      {/* ── Searchable species / breed list (used when there are many) ── */}
      <BottomSheet visible={!!pickerSheet} onClose={closePicker} bottomInset={insets.bottom}>
        <Text style={styles.sheetTitle}>
          {pickerSheet === 'breed' ? `Choose ${selectedSpecies.toLowerCase()} breed` : 'Choose species'}
        </Text>
        <View style={styles.pickerSearch}>
          <SearchBar value={pickerQuery} onChangeText={setPickerQuery} placeholder="Search" />
        </View>
        <ScrollView style={styles.pickerList} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {pickerShown.map((o) => (
            <SheetRow
              key={o.id}
              label={o.name}
              selected={pickerSheet === 'breed' ? breed === o.name : selectedSpeciesId === o.id}
              onPress={() => {
                if (pickerSheet === 'breed') chooseBreed(o);
                else chooseSpecies(o);
                closePicker();
              }}
            />
          ))}
          {pickerShown.length === 0 ? <Text style={styles.fieldHint}>Nothing matches. Check the spelling or call the clinic.</Text> : null}
        </ScrollView>
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
const PHOTO = 88;
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
  headerCopy: { flex: 1, minWidth: 0 },
  headerTitle: {
    fontFamily: fonts.bodyBold,
    fontSize: 28,
    lineHeight: 34,
    letterSpacing: -0.5,
    color: colors.foreground,
  },
  count: { ...text.small, color: colors.mutedFg },

  /* ── Buttons ── */
  /* Every full-width button: 48px, fully rounded. Primary is solid navy
     (Continue, Save changes, Add pet, Add your first pet). Secondary is a
     navy outline (Back, Cancel, Clear filters). Red is only for deleting.
     A blocked Continue is a flat, clearly visible grey (same tone as the
     progress bars) instead of a faded copy of the navy button or a fill
     that disappears into the page. */
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
  btnBlocked: { backgroundColor: '#D9D6C8' },
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

  /* ── Search + species filter ── */
  toolbar: { paddingHorizontal: space.xxl, marginTop: space.lg },
  search: {
    height: 48,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: colors.cardBorder,
    backgroundColor: colors.card,
    paddingLeft: space.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  searchFocused: { borderColor: colors.primary },
  searchInput: {
    flex: 1,
    minWidth: 0,
    height: '100%',
    paddingVertical: 0,
    fontSize: 16,
    fontFamily: fonts.bodyMedium,
    color: colors.foreground,
    includeFontPadding: false,
  },
  searchClear: { width: CONTROL_H, height: CONTROL_H, alignItems: 'center', justifyContent: 'center' },
  filterScroll: { flexGrow: 0, marginTop: space.md },
  filterRow: { paddingHorizontal: space.xxl, gap: space.sm },

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

  /* ── Pet list: one rounded card, a row per pet, hairlines between ── */
  list: {
    marginTop: space.lg,
    marginHorizontal: space.lg,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 24,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.md,
    paddingLeft: space.md + 2,
    paddingRight: space.xs,
    backgroundColor: colors.card,
  },
  rowDivider: { borderTopWidth: 1, borderTopColor: colors.cardBorder },
  avatarFallback: {
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: { fontFamily: text.display.fontFamily, color: colors.accent },
  rowMain: { flex: 1, minWidth: 0 },
  rowName: { ...text.bodyBold, fontSize: 18, lineHeight: 24, color: colors.foreground },
  rowMeta: { ...text.small, color: colors.mutedFg, marginTop: 1 },
  moreBtn: { width: CONTROL_H, height: CONTROL_H, alignItems: 'center', justifyContent: 'center' },

  /* Spayed / neutered line, coloured by gender. The two colours are
     literal because the theme has no tokens for them. */
  rowStatus: { fontSize: 13, lineHeight: 18, marginTop: 3 },
  statusFemale: { color: '#A12D62' },
  statusMale: { color: '#1F5A99' },
  statusWarn: { fontFamily: fonts.bodyBold },
  statusDone: { fontFamily: fonts.bodyMedium },

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

  /* Searchable species / breed list */
  pickerSearch: { marginBottom: space.sm },
  pickerList: { maxHeight: 320 },
  pickerField: {
    height: 56,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: colors.cardBorder,
    backgroundColor: colors.card,
    paddingHorizontal: space.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
  },
  pickerValue: { flex: 1, fontFamily: fonts.bodyBold, fontSize: 16, color: colors.foreground },
  pickerPlaceholder: { fontFamily: fonts.body, color: colors.mutedFg },

  /* ── Wizard ── */
  wizardContainer: { ...common.screen },
  wizardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.xxl,
    paddingBottom: space.sm,
  },
  wizardClose: {
    width: CONTROL_H,
    height: CONTROL_H,
    borderRadius: CONTROL_H / 2,
    backgroundColor: colors.muted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wizardHeaderTitle: {
    flex: 1,
    fontFamily: fonts.bodyBold,
    fontSize: 26,
    lineHeight: 32,
    letterSpacing: -0.5,
    color: colors.foreground,
  },

  /* Same progress bars as the Book flow, with the three step names under them. */
  progress: { paddingHorizontal: space.xxl, paddingTop: space.md, paddingBottom: space.sm },
  progressBars: { flexDirection: 'row', gap: 8 },
  progressBar: { flex: 1, height: 6, borderRadius: 3, backgroundColor: '#D9D6C8' },
  progressBarOn: { backgroundColor: colors.primary },
  progressLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  progressText: { fontFamily: fonts.bodyBold, fontSize: 14, lineHeight: 20, color: colors.mutedFg },
  progressLabel: { fontFamily: fonts.bodyBold, fontSize: 13, lineHeight: 18, color: colors.mutedFg },
  progressLabelOn: { color: colors.primary },

  wizardScroll: { flex: 1 },
  wizardForm: { paddingHorizontal: space.xxl, paddingBottom: space.xl },
  errorBox: {
    backgroundColor: colors.destructiveBg,
    borderRadius: radius.md,
    padding: space.md,
    marginTop: space.md,
  },
  errorText: { ...text.small, color: colors.destructive },

  plainInput: {
    height: 56,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: colors.cardBorder,
    backgroundColor: colors.card,
    paddingHorizontal: space.lg,
    paddingVertical: 0,
    fontSize: 17,
    fontFamily: fonts.bodyMedium,
    color: colors.foreground,
    includeFontPadding: false,
  },
  plainInputFocused: { borderColor: colors.primary },
  fieldLabel: { fontSize: 15, fontFamily: fonts.bodyBold, color: colors.foreground, marginBottom: space.sm, marginTop: space.xl },
  required: { color: colors.destructive },
  optionalText: { color: colors.mutedFg, fontFamily: fonts.body, fontSize: 13 },
  fieldHint: { ...text.caption, color: colors.mutedFg, marginTop: space.sm },

  /* Species tiles: three to a row, text only. */
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile: {
    width: '31%',
    flexGrow: 1,
    minHeight: 56,
    paddingHorizontal: space.sm,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: colors.cardBorder,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  tileText: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.foreground, textAlign: 'center' },
  tileTextOn: { color: colors.primaryFg },

  /* Breed chips: same as the time slots on the Book screen. */
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

  /* Photo: picture with a camera badge on the left, words and button on the right */
  photoRow: { flexDirection: 'row', alignItems: 'center', gap: space.lg, paddingTop: space.lg },
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
  photoCopy: { flex: 1, minWidth: 0 },
  photoTitle: { fontFamily: fonts.bodyBold, fontSize: 17, lineHeight: 24, color: colors.foreground },
  photoHint: { ...text.caption, color: colors.mutedFg, marginTop: 2 },
  photoBtn: {
    alignSelf: 'flex-start',
    height: CONTROL_H,
    marginTop: space.sm,
    paddingHorizontal: space.lg,
    borderRadius: CONTROL_H / 2,
    borderWidth: 2,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoBtnText: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.primary },

  /* Age: Years (and Months) steppers side by side */
  stepperRowWrap: { flexDirection: 'row', gap: space.md },
  stepper: {
    flex: 1,
    paddingVertical: space.md,
    paddingHorizontal: space.sm,
    backgroundColor: colors.card,
    borderWidth: 2,
    borderColor: colors.cardBorder,
    borderRadius: 24,
  },
  stepperLabel: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.mutedFg, textAlign: 'center' },
  stepperRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: space.sm },
  stepBtn: {
    width: CONTROL_H,
    height: CONTROL_H,
    borderRadius: CONTROL_H / 2,
    backgroundColor: colors.muted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBtnPlus: { backgroundColor: colors.primary },
  stepBtnOff: { backgroundColor: colors.muted, opacity: 0.6 },
  stepInput: {
    flex: 1,
    minWidth: 0,
    height: 52,
    textAlign: 'center',
    fontFamily: fonts.bodyBold,
    fontSize: 34,
    color: colors.foreground,
    paddingVertical: 0,
    includeFontPadding: false,
  },
  ageSummary: {
    marginTop: space.md,
    paddingVertical: 12,
    paddingHorizontal: space.lg,
    borderRadius: 16,
    backgroundColor: '#E4EFEA',
    alignItems: 'center',
  },
  ageSummaryText: { fontFamily: fonts.bodyBold, fontSize: 15, color: '#17564D' },

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
   Same rows as the real list, so nothing jumps when the pets arrive. */
function PetListSkeleton() {
  return (
    <View style={styles.list} accessibilityLabel="Loading your pets" accessibilityLiveRegion="polite">
      {[0, 1, 2, 3].map((i) => (
        <View key={i} style={[styles.row, i > 0 && styles.rowDivider]}>
          <Skeleton width={AVATAR} height={AVATAR} radius={AVATAR / 2} />
          <View style={styles.rowMain}>
            <Skeleton width="45%" height={16} />
            <Skeleton width="70%" height={13} style={{ marginTop: 8 }} />
            <Skeleton width="35%" height={12} style={{ marginTop: 6 }} />
          </View>
        </View>
      ))}
    </View>
  );
}
