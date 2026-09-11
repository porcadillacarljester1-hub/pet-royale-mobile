import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, Modal, Image, Pressable, Alert, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';

const TEAL = '#0D9488';
const TEAL_LIGHT = '#CCFBF1';
const ORANGE = '#F97316';
const PURPLE = '#7C3AED';
const RED = '#DC2626';
const BORDER = '#E5E7EB';
const SUB = '#6B7280';
const INK = '#111827';
const BG = '#F4F7FB';

const speciesOptions = [
  { key: 'Dog', icon: 'paw-outline' as const },
  { key: 'Cat', icon: 'paw-outline' as const },
  { key: 'Bird', icon: 'paw-outline' as const },
  { key: 'Rabbit', icon: 'paw-outline' as const },
  { key: 'Others', icon: 'ellipsis-horizontal' as const },
];

const BREEDS_BY_SPECIES: Record<string, string[]> = {
  Dog: [
    'Aspin (Mixed / Local)', 'Labrador Retriever', 'Golden Retriever', 'Shih Tzu', 'Poodle',
    'Chihuahua', 'Pomeranian', 'Siberian Husky', 'German Shepherd', 'Beagle',
    'French Bulldog', 'Bulldog', 'Dachshund', 'Rottweiler', 'Doberman Pinscher',
    'Border Collie', 'Cocker Spaniel', 'Maltese', 'Yorkshire Terrier', 'Pug',
    'Corgi', 'Great Dane', 'Boxer', 'Shiba Inu', 'Japanese Spitz', 'Australian Shepherd',
  ],
  Cat: [
    'Puspin (Mixed / Local)', 'Persian', 'Siamese', 'Maine Coon', 'British Shorthair',
    'Ragdoll', 'Scottish Fold', 'Bengal', 'Sphynx', 'American Shorthair',
    'Russian Blue', 'Himalayan', 'Domestic Shorthair', 'Domestic Longhair', 'Exotic Shorthair',
  ],
  Bird: [
    'Budgerigar (Budgie)', 'Cockatiel', 'Lovebird', 'African Grey Parrot', 'Macaw',
    'Cockatoo', 'Canary', 'Finch', 'Parakeet', 'Mynah',
  ],
  Rabbit: [
    'Holland Lop', 'Netherland Dwarf', 'Rex', 'Angora', 'Lionhead',
    'Dutch', 'Flemish Giant', 'Mixed / Local Breed',
  ],
};

const genderOptions = ['Male', 'Female'];
const neuteredOptions = ['Yes', 'No', 'Unknown'];
type SortKey = 'recent' | 'name' | 'age' | 'weight';

type DueBanner = { kind: 'vaccination' | 'grooming'; label: string; date: string } | null;

export default function MyPetsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { editId } = useLocalSearchParams<{ editId?: string }>();

  const [pets, setPets] = useState<any[]>([]);
  const [dueBanners, setDueBanners] = useState<Record<string, DueBanner>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('recent');
  const [showSort, setShowSort] = useState(false);

  const [menuPet, setMenuPet] = useState<any>(null);
  const [menuPos, setMenuPos] = useState({ top: 0, right: 0 });

  const [showModal, setShowModal] = useState(false);
  const [wizardStep, setWizardStep] = useState(1); // 1=Identity, 2=Profile & Details, 3=Review
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingPet, setEditingPet] = useState<any>(null);
  const [error, setError] = useState('');

  const [name, setName] = useState('');
  const [selectedSpecies, setSelectedSpecies] = useState('');
  const [otherSpecies, setOtherSpecies] = useState('');
  const [breed, setBreed] = useState('');
  const [showBreedPicker, setShowBreedPicker] = useState(false);
  const [breedSearch, setBreedSearch] = useState('');
  const [age, setAge] = useState('');
  const [selectedGender, setSelectedGender] = useState('');
  const [weight, setWeight] = useState('');
  const [color, setColor] = useState('');
  const [neutered, setNeutered] = useState('');
  const [notes, setNotes] = useState('');

  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [pendingPhotoUri, setPendingPhotoUri] = useState<string | null>(null);
  const [showPhotoSheet, setShowPhotoSheet] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  useEffect(() => { fetchPets(); }, []);

  useEffect(() => {
    if (editId && pets.length > 0) {
      const target = pets.find((p) => p.id === editId);
      if (target) openEdit(target);
    }
  }, [editId, pets]);

  const fetchPets = async () => {
    setIsLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data, error } = await supabase
      .from('pets').select('*').eq('owner_id', user.id)
      .order('created_at', { ascending: false });
    if (!error) {
      setPets(data || []);
      fetchDueBanners(data || []);
    }
    setIsLoading(false);
  };

  const fetchDueBanners = async (petList: any[]) => {
    const banners: Record<string, DueBanner> = {};
    const today = new Date().toISOString().split('T')[0];

    await Promise.all(petList.map(async (pet) => {
      const [vaxRes, groomRes] = await Promise.all([
        (supabase as any)
          .from('pet_vaccinations')
          .select('vaccine_name, next_due_date')
          .eq('pet_id', pet.id)
          .gte('next_due_date', today)
          .order('next_due_date', { ascending: true })
          .limit(1)
          .maybeSingle(),
        (supabase as any)
          .from('appointments')
          .select('requested_date')
          .eq('pet_id', pet.id)
          .eq('service', 'Grooming')
          .neq('status', 'completed')
          .gte('requested_date', today)
          .order('requested_date', { ascending: true })
          .limit(1)
          .maybeSingle(),
      ]);
      const vax = vaxRes.data;
      const groom = groomRes.data;
      if (vax && groom) {
        banners[pet.id] = vax.next_due_date <= groom.requested_date
          ? { kind: 'vaccination', label: 'Vaccination due', date: vax.next_due_date }
          : { kind: 'grooming', label: 'Grooming on', date: groom.requested_date };
      } else if (vax) {
        banners[pet.id] = { kind: 'vaccination', label: 'Vaccination due', date: vax.next_due_date };
      } else if (groom) {
        banners[pet.id] = { kind: 'grooming', label: 'Grooming on', date: groom.requested_date };
      } else {
        banners[pet.id] = null;
      }
    }));
    setDueBanners(banners);
  };

  const formatDueDate = (dateStr: string) => new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  const handleViewDue = (pet: any, banner: DueBanner) => {
    if (!banner) return;
    if (banner.kind === 'vaccination') router.push({ pathname: '/pet-detail', params: { id: pet.id } } as any);
    else router.push('/(tabs)/appointments' as any);
  };

  const toggleFavorite = async (pet: any) => {
    const next = !pet.is_favorite;
    setPets((prev) => prev.map((p) => (p.id === pet.id ? { ...p, is_favorite: next } : p)));
    await supabase.from('pets').update({ is_favorite: next }).eq('id', pet.id);
  };

  const openMenu = (e: any, pet: any) => {
    const { pageX, pageY } = e.nativeEvent;
    const screenWidth = Dimensions.get('window').width;
    setMenuPos({ top: pageY + 10, right: screenWidth - pageX - 10 });
    setMenuPet(pet);
  };
  const closeMenu = () => setMenuPet(null);

  const openAdd = () => { setEditingPet(null); resetForm(); setWizardStep(1); setShowModal(true); };

  const openEdit = (pet: any) => {
    closeMenu();
    setEditingPet(pet);
    setName(pet.name || '');
    const knownSpecies = speciesOptions.map(s => s.key).filter(s => s !== 'Others');
    if (knownSpecies.includes(pet.species)) { setSelectedSpecies(pet.species); setOtherSpecies(''); }
    else { setSelectedSpecies('Others'); setOtherSpecies(pet.species || ''); }
    setBreed(pet.breed || '');
    setAge(pet.age ? String(pet.age) : '');
    setSelectedGender(pet.gender || '');
    setWeight(pet.weight ? String(pet.weight) : '');
    setColor(pet.color || '');
    setNeutered(pet.neutered || '');
    setNotes(pet.notes || '');
    setPhotoUrl(pet.photo_url || null);
    setError('');
    setWizardStep(1);
    setShowModal(true);
  };

  const resetForm = () => {
    setName(''); setSelectedSpecies(''); setOtherSpecies(''); setBreed('');
    setAge(''); setSelectedGender(''); setWeight(''); setColor(''); setNeutered(''); setNotes('');
    setPhotoUrl(null); setPendingPhotoUri(null); setError('');
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingPet(null);
    resetForm();
    if (editId) router.setParams({ editId: undefined } as any);
  };

  const pickPhoto = async () => {
    setShowPhotoSheet(false);
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Permission Required', 'Please allow access to your photo library.'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'] as any, allowsEditing: true, aspect: [1, 1], quality: 0.7 });
    if (!result.canceled) setPendingPhotoUri(result.assets[0].uri);
  };

  const takePhoto = async () => {
    setShowPhotoSheet(false);
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Permission Required', 'Please allow camera access.'); return; }
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

  const validateStep1 = () => {
    if (!name.trim()) return 'Please enter your pet\'s name.';
    if (!selectedSpecies) return 'Please select a species.';
    if (selectedSpecies === 'Others' && !otherSpecies.trim()) return 'Please specify the species.';
    if (!breed.trim()) return 'Please select or enter a breed.';
    return '';
  };
  const validateStep2 = () => {
    if (!selectedGender) return 'Please select a gender.';
    if (!age.trim()) return 'Please enter age.';
    if (!weight.trim()) return 'Please enter weight.';
    return '';
  };

  const goNextStep = () => {
    const err = wizardStep === 1 ? validateStep1() : wizardStep === 2 ? validateStep2() : '';
    if (err) { setError(err); return; }
    setError('');
    setWizardStep((s) => Math.min(3, s + 1));
  };
  const goPrevStep = () => {
    setError('');
    if (wizardStep === 1) { closeModal(); return; }
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
      name,
      species: selectedSpecies === 'Others' ? otherSpecies : selectedSpecies,
      breed: breed || null,
      age: age ? parseInt(age) : null,
      gender: selectedGender,
      weight: weight ? parseFloat(weight) : null,
      color: color || null,
      neutered: neutered || null,
      notes: notes.trim() || null,
      photo_url: finalPhotoUrl,
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

  const handleDelete = (id: string) => {
    closeMenu();
    Alert.alert('Delete Pet', 'Are you sure you want to remove this pet?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => { await supabase.from('pets').delete().eq('id', id); fetchPets(); } },
    ]);
  };

  const getSpeciesColor = (species: string) => {
    const s = species?.toLowerCase().trim() || '';
    if (s.includes('dog')) return ORANGE;
    if (s.includes('cat')) return PURPLE;
    if (s.includes('bird')) return '#2563EB';
    if (s.includes('rabbit')) return TEAL;
    return TEAL;
  };

  const filtered = pets.filter((p) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return p.name?.toLowerCase().includes(q) || p.species?.toLowerCase().includes(q) || p.breed?.toLowerCase().includes(q);
  });

  const sorted = [...filtered].sort((a, b) => {
    switch (sortKey) {
      case 'name': return (a.name || '').localeCompare(b.name || '');
      case 'age': return (b.age || 0) - (a.age || 0);
      case 'weight': return (b.weight || 0) - (a.weight || 0);
      default: return 0;
    }
  });

  const sortLabels: Record<SortKey, string> = { recent: 'Recent', name: 'Name', age: 'Age', weight: 'Weight' };

  const availableBreeds = BREEDS_BY_SPECIES[selectedSpecies] || [];
  const filteredBreeds = availableBreeds.filter(b => b.toLowerCase().includes(breedSearch.toLowerCase()));

  const stepProgress = wizardStep === 1 ? 33 : wizardStep === 2 ? 67 : 100;
  const stepTitles = ['Identity', 'Profile & Details', 'Review'];

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* ── Header ── */}
        <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>My Pets</Text>
            <Text style={styles.headerSub}>Your furry friends, all in one place</Text>
          </View>
          <TouchableOpacity style={styles.addBtn} onPress={openAdd} activeOpacity={0.85}>
            <Ionicons name="add" size={18} color="#fff" />
            <Text style={styles.addBtnText}>Add Pet</Text>
          </TouchableOpacity>
        </View>

        {/* ── Search + Sort ── */}
        <View style={styles.toolRow}>
          <View style={styles.searchWrap}>
            <Ionicons name="search" size={16} color={SUB} />
            <TextInput style={styles.searchInput} placeholder="Search pets..." placeholderTextColor="#9CA3AF" value={search} onChangeText={setSearch} />
          </View>
          <TouchableOpacity style={styles.sortBtn} onPress={() => setShowSort(true)} activeOpacity={0.8}>
            <Ionicons name="swap-vertical" size={15} color={INK} />
            <Text style={styles.sortBtnText}>{sortLabels[sortKey]}</Text>
          </TouchableOpacity>
        </View>

        {/* ── Pet cards ── */}
        {isLoading ? (
          <ActivityIndicator size="large" color={TEAL} style={{ marginTop: 48 }} />
        ) : sorted.length === 0 ? (
          <View style={styles.empty}>
            <View style={styles.emptyIconWrap}><Ionicons name="paw" size={30} color="#fff" /></View>
            <Text style={styles.emptyTitle}>{search ? 'No pets found' : 'No Pets Yet'}</Text>
            <Text style={styles.emptyText}>{search ? 'Try a different search' : 'Add your first pet to get started!'}</Text>
          </View>
        ) : (
          sorted.map((pet) => {
            const color = getSpeciesColor(pet.species);
            const banner = dueBanners[pet.id];
            return (
              <TouchableOpacity
                key={pet.id}
                style={styles.petCard}
                onPress={() => router.push({ pathname: '/pet-detail', params: { id: pet.id } } as any)}
                activeOpacity={0.9}
              >
                <View style={styles.cardTop}>
                  <View style={styles.photoWrapLarge}>
                    {pet.photo_url ? (
                      <Image source={{ uri: pet.photo_url }} style={styles.petPhotoLarge} />
                    ) : (
                      <View style={[styles.petPhotoFallback, { backgroundColor: color + '18' }]}>
                        <Ionicons name="paw" size={24} color={color} />
                      </View>
                    )}
                  </View>

                  <View style={styles.cardInfo}>
                    <View style={styles.nameRow}>
                      <Text style={styles.petName} numberOfLines={1}>{pet.name}</Text>
                      <View style={[styles.speciesDot, { backgroundColor: color + '20' }]}>
                        <Ionicons name="paw" size={9} color={color} />
                      </View>
                    </View>
                    <Text style={styles.petSpecies}>{pet.breed || pet.species}</Text>
                  </View>

                  <View style={styles.cardTopActions}>
                    <TouchableOpacity
                      style={[styles.favoriteBtn, pet.is_favorite && styles.favoriteBtnActive]}
                      onPress={(e) => { e.stopPropagation(); toggleFavorite(pet); }}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Ionicons name={pet.is_favorite ? 'heart' : 'heart-outline'} size={15} color={pet.is_favorite ? RED : SUB} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.menuBtn}
                      onPress={(e) => { e.stopPropagation(); openMenu(e, pet); }}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Ionicons name="ellipsis-vertical" size={16} color={SUB} />
                    </TouchableOpacity>
                  </View>
                </View>

                <View style={styles.statsRow}>
                  <View style={styles.statBox}>
                    <Text style={styles.statLabel}>SEX</Text>
                    <Text style={styles.statValue}>{pet.gender || '—'}</Text>
                  </View>
                  <View style={styles.statBox}>
                    <Text style={styles.statLabel}>AGE</Text>
                    <Text style={styles.statValue}>{pet.age ? `${pet.age} yrs` : '—'}</Text>
                  </View>
                  <View style={styles.statBox}>
                    <Text style={styles.statLabel}>WEIGHT</Text>
                    <Text style={styles.statValue}>{pet.weight ? `${pet.weight} kg` : '—'}</Text>
                  </View>
                </View>

                {pet.notes ? (
                  <View style={styles.noteBubble}>
                    <Ionicons name="heart-outline" size={11} color={TEAL} />
                    <Text style={styles.noteText} numberOfLines={1}>{pet.notes}</Text>
                  </View>
                ) : null}

                {banner && (
                  <TouchableOpacity style={styles.dueBanner} onPress={(e) => { e.stopPropagation(); handleViewDue(pet, banner); }} activeOpacity={0.8}>
                    <View style={styles.dueBannerLeft}>
                      <Ionicons name={banner.kind === 'vaccination' ? 'medical' : 'cut'} size={14} color={TEAL} />
                      <Text style={styles.dueBannerText}>{banner.label} {formatDueDate(banner.date)}</Text>
                    </View>
                    <Text style={styles.dueBannerLink}>View</Text>
                  </TouchableOpacity>
                )}
              </TouchableOpacity>
            );
          })
        )}

        {sorted.length > 0 && (
          <View style={styles.motivBanner}>
            <Ionicons name="heart" size={16} color={RED} style={styles.bannerHeart1} />
            <Ionicons name="heart" size={12} color={RED} style={styles.bannerHeart2} />
            <View style={styles.bannerContent}>
              <Text style={styles.bannerTitle}>Happy pets, happy life!</Text>
              <Text style={styles.bannerText}>Keep your pet's info up to date for better care and happier moments together.</Text>
            </View>
          </View>
        )}
        <View style={{ height: 20 }} />
      </ScrollView>

      {/* ── Dropdown menu ── */}
      <Modal visible={!!menuPet} transparent animationType="none" onRequestClose={closeMenu}>
        <Pressable style={styles.menuOverlay} onPress={closeMenu}>
          <View style={[styles.dropdownMenu, { top: menuPos.top, right: menuPos.right }]}>
            <TouchableOpacity style={styles.dropdownItem} onPress={() => openEdit(menuPet)}>
              <Ionicons name="pencil-outline" size={15} color={INK} />
              <Text style={styles.dropdownItemText}>Edit Pet</Text>
            </TouchableOpacity>
            <View style={styles.dropdownDivider} />
            <TouchableOpacity style={styles.dropdownItem} onPress={() => { const id = menuPet.id; closeMenu(); router.push({ pathname: '/pet-detail', params: { id } } as any); }}>
              <Ionicons name="person-outline" size={15} color={INK} />
              <Text style={styles.dropdownItemText}>View Profile</Text>
            </TouchableOpacity>
            <View style={styles.dropdownDivider} />
            <TouchableOpacity style={styles.dropdownItem} onPress={() => handleDelete(menuPet.id)}>
              <Ionicons name="trash-outline" size={15} color={RED} />
              <Text style={[styles.dropdownItemText, { color: RED }]}>Delete Pet</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>

      {/* ── Sort sheet ── */}
      <Modal visible={showSort} transparent animationType="fade">
        <Pressable style={styles.modalOverlay} onPress={() => setShowSort(false)}>
          <View style={styles.sortSheet}>
            <Text style={styles.pickerTitle}>Sort By</Text>
            {(['recent', 'name', 'age', 'weight'] as SortKey[]).map((k) => (
              <TouchableOpacity key={k} style={[styles.sortOption, sortKey === k && styles.sortOptionActive]} onPress={() => { setSortKey(k); setShowSort(false); }} activeOpacity={0.8}>
                <Text style={[styles.sortOptionText, sortKey === k && styles.sortOptionTextActive]}>{sortLabels[k]}</Text>
                {sortKey === k && <Ionicons name="checkmark" size={16} color="#fff" />}
              </TouchableOpacity>
            ))}
          </View>
        </Pressable>
      </Modal>

      {/* ══════════════════════ Add/Edit Pet — 3-Step Wizard ══════════════════════ */}
      <Modal visible={showModal} animationType="slide" onRequestClose={closeModal}>
        <View style={styles.wizardContainer}>
          <View style={[styles.wizardHeader, { paddingTop: insets.top + 8 }]}>
            <TouchableOpacity onPress={goPrevStep} style={styles.wizardBackBtn}>
              <Ionicons name="chevron-back" size={22} color={INK} />
            </TouchableOpacity>
            <Text style={styles.wizardHeaderTitle}>{editingPet ? 'Edit Pet' : 'Add a New Pet'}</Text>
            <TouchableOpacity onPress={closeModal} style={styles.wizardCloseBtn}>
              <Ionicons name="close" size={20} color={SUB} />
            </TouchableOpacity>
          </View>

          <View style={styles.progressWrap}>
            <View style={styles.progressTopRow}>
              <Text style={styles.progressStepLabel}>STEP {wizardStep} OF 3</Text>
              <Text style={styles.progressPercent}>{stepProgress}% Complete</Text>
            </View>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${stepProgress}%` }]} />
            </View>
            <Text style={styles.progressHint}>Fields marked with <Text style={{ color: RED }}>*</Text> are needed to build the health record</Text>
          </View>

          <ScrollView style={styles.wizardScroll} showsVerticalScrollIndicator={false}>
            <View style={styles.wizardForm}>
              {error ? (
                <View style={styles.errorBox}>
                  <Ionicons name="alert-circle-outline" size={15} color={RED} />
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              ) : null}

              {/* ── Step 1: Identity ── */}
              {wizardStep === 1 && (
                <>
                  <TouchableOpacity style={styles.photoCircleWrap} onPress={() => setShowPhotoSheet(true)} activeOpacity={0.85}>
                    <View style={styles.photoCircle}>
                      {pendingPhotoUri || photoUrl ? (
                        <Image source={{ uri: pendingPhotoUri || photoUrl! }} style={styles.photoCircleImage} />
                      ) : (
                        <Ionicons name="image-outline" size={28} color={TEAL} />
                      )}
                      {uploadingPhoto && (
                        <View style={styles.photoUploadOverlay}><ActivityIndicator color="#fff" size="small" /></View>
                      )}
                    </View>
                    <View style={styles.photoAddBadge}><Ionicons name="add" size={14} color="#fff" /></View>
                  </TouchableOpacity>
                  <Text style={styles.photoCircleLabel}>Add a photo (optional)</Text>
                  <Text style={styles.photoCircleSub}>A clear photo helps us personalize care</Text>

                  <View style={styles.wizardCard}>
                    <View style={styles.wizardCardHeader}>
                      <Ionicons name="person-outline" size={16} color={TEAL} />
                      <Text style={styles.wizardCardTitle}>Identity</Text>
                    </View>

                    <Text style={styles.fieldLabel}>Pet Name <Text style={styles.required}>*</Text></Text>
                    <TextInput style={styles.input} placeholder="e.g. Buddy" placeholderTextColor="#9CA3AF" value={name} onChangeText={setName} />
                    <Text style={styles.fieldHint}>This is how you'll see them across the app.</Text>

                    <Text style={styles.fieldLabel}>Species <Text style={styles.required}>*</Text></Text>
                    <View style={styles.chipsRow}>
                      {speciesOptions.map((s) => (
                        <TouchableOpacity
                          key={s.key}
                          style={[styles.speciesChip, selectedSpecies === s.key && styles.speciesChipActive]}
                          onPress={() => { setSelectedSpecies(s.key); setOtherSpecies(''); setBreed(''); }}
                          activeOpacity={0.8}
                        >
                          <Ionicons name={s.icon} size={13} color={selectedSpecies === s.key ? '#fff' : TEAL} />
                          <Text style={[styles.chipText, selectedSpecies === s.key && styles.chipTextActive]}>{s.key}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                    <Text style={styles.speciesNote}>
                      We treat dogs, cats, birds, and rabbits. For other species, select "Others" — our team will confirm availability.
                    </Text>
                    {selectedSpecies === 'Others' && (
                      <TextInput style={styles.input} placeholder="e.g. Hamster, Guinea Pig, Turtle…" placeholderTextColor="#9CA3AF" value={otherSpecies} onChangeText={setOtherSpecies} />
                    )}

                    <Text style={styles.fieldLabel}>Breed <Text style={styles.required}>*</Text></Text>
                    {selectedSpecies && selectedSpecies !== 'Others' ? (
                      <TouchableOpacity style={styles.breedSelector} onPress={() => { setBreedSearch(''); setShowBreedPicker(true); }} activeOpacity={0.8}>
                        <Text style={breed ? styles.breedSelectorValue : styles.breedSelectorPlaceholder}>
                          {breed || `Select ${selectedSpecies.toLowerCase()} breed…`}
                        </Text>
                        <Ionicons name="chevron-down" size={16} color={SUB} />
                      </TouchableOpacity>
                    ) : (
                      <TextInput style={styles.input} placeholder="Enter breed" placeholderTextColor="#9CA3AF" value={breed} onChangeText={setBreed} />
                    )}
                  </View>
                </>
              )}

              {/* ── Step 2: Profile & Details ── */}
              {wizardStep === 2 && (
                <>
                  <View style={styles.wizardCard}>
                    <View style={styles.wizardCardHeader}>
                      <Ionicons name="body-outline" size={16} color={TEAL} />
                      <Text style={styles.wizardCardTitle}>Profile</Text>
                    </View>

                    <Text style={styles.fieldLabel}>Gender <Text style={styles.required}>*</Text></Text>
                    <View style={styles.chipsRow}>
                      {genderOptions.map((g) => (
                        <TouchableOpacity key={g} style={[styles.genderChip, selectedGender === g && styles.genderChipActive]} onPress={() => setSelectedGender(g)} activeOpacity={0.8}>
                          <Ionicons name={g === 'Male' ? 'male' : 'female'} size={14} color={selectedGender === g ? '#fff' : g === 'Male' ? '#2563EB' : '#DB2777'} />
                          <Text style={[styles.chipText, selectedGender === g && styles.chipTextActive]}>{g}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>

                    <Text style={styles.fieldLabel}>{selectedGender === 'Female' ? 'Spayed' : 'Neutered'} <Text style={styles.optionalText}>Optional</Text></Text>
                    <View style={styles.chipsRow}>
                      {neuteredOptions.map((n) => (
                        <TouchableOpacity key={n} style={[styles.chip, neutered === n && styles.chipActive]} onPress={() => setNeutered(neutered === n ? '' : n)} activeOpacity={0.8}>
                          <Text style={[styles.chipText, neutered === n && styles.chipTextActive]}>{n}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>

                    <View style={styles.twoCol}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.fieldLabel}>Age <Text style={styles.required}>*</Text></Text>
                        <View style={styles.stepperRow}>
                          <TouchableOpacity style={styles.stepperBtn} onPress={() => setAge(String(Math.max(0, (parseInt(age) || 0) - 1)))}>
                            <Ionicons name="remove" size={16} color={TEAL} />
                          </TouchableOpacity>
                          <TextInput style={styles.stepperInput} value={age} onChangeText={setAge} keyboardType="numeric" textAlign="center" />
                          <Text style={styles.stepperUnit}>yrs</Text>
                          <TouchableOpacity style={styles.stepperBtn} onPress={() => setAge(String((parseInt(age) || 0) + 1))}>
                            <Ionicons name="add" size={16} color={TEAL} />
                          </TouchableOpacity>
                        </View>
                      </View>
                      <View style={{ width: 10 }} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.fieldLabel}>Weight <Text style={styles.required}>*</Text></Text>
                        <View style={styles.stepperRow}>
                          <TouchableOpacity style={styles.stepperBtn} onPress={() => setWeight((Math.max(0, (parseFloat(weight) || 0) - 0.5)).toString())}>
                            <Ionicons name="remove" size={16} color={TEAL} />
                          </TouchableOpacity>
                          <TextInput style={styles.stepperInput} value={weight} onChangeText={setWeight} keyboardType="decimal-pad" textAlign="center" />
                          <Text style={styles.stepperUnit}>kg</Text>
                          <TouchableOpacity style={styles.stepperBtn} onPress={() => setWeight(((parseFloat(weight) || 0) + 0.5).toString())}>
                            <Ionicons name="add" size={16} color={TEAL} />
                          </TouchableOpacity>
                        </View>
                      </View>
                    </View>
                  </View>

                  <View style={styles.wizardCard}>
                    <View style={styles.wizardCardHeader}>
                      <Ionicons name="document-text-outline" size={16} color={TEAL} />
                      <Text style={styles.wizardCardTitle}>Details</Text>
                    </View>

                    <Text style={styles.fieldLabel}>Color / Markings <Text style={styles.optionalText}>Optional</Text></Text>
                    <TextInput style={styles.input} placeholder="e.g. Brown with white spots" placeholderTextColor="#9CA3AF" value={color} onChangeText={setColor} />

                    <Text style={styles.fieldLabel}>Note <Text style={styles.optionalText}>Optional</Text></Text>
                    <TextInput
                      style={[styles.input, { height: 70 }]}
                      placeholder="e.g. Loves to play fetch and go for long walks"
                      placeholderTextColor="#9CA3AF"
                      value={notes}
                      onChangeText={setNotes}
                      multiline
                    />
                  </View>
                </>
              )}

              {/* ── Step 3: Review ── */}
              {wizardStep === 3 && (
                <>
                  <View style={styles.reviewHeader}>
                    {pendingPhotoUri || photoUrl ? (
                      <Image source={{ uri: pendingPhotoUri || photoUrl! }} style={styles.reviewPhoto} />
                    ) : (
                      <View style={styles.reviewPhotoFallback}><Ionicons name="image-outline" size={26} color={TEAL} /></View>
                    )}
                    <Text style={styles.reviewName}>{name || 'Unnamed Pet'}</Text>
                    <Text style={styles.reviewSpecies}>{breed ? `${breed} · ` : ''}{selectedSpecies === 'Others' ? otherSpecies : selectedSpecies}</Text>
                  </View>

                  <View style={styles.wizardCard}>
                    <ReviewRow label="Gender" value={selectedGender || '—'} />
                    <ReviewRow label={selectedGender === 'Female' ? 'Spayed' : 'Neutered'} value={neutered || 'Unknown'} />
                    <ReviewRow label="Age" value={age ? `${age} yrs` : '—'} />
                    <ReviewRow label="Weight" value={weight ? `${weight} kg` : '—'} last />
                  </View>

                  {(color || notes) && (
                    <View style={styles.wizardCard}>
                      {color ? <ReviewRow label="Color / Markings" value={color} /> : null}
                      {notes ? <ReviewRow label="Note" value={notes} last /> : null}
                    </View>
                  )}

                  <Text style={styles.reviewFooterNote}>You can edit every detail later.</Text>
                </>
              )}
            </View>
          </ScrollView>

          <View style={[styles.wizardFooter, { paddingBottom: insets.bottom + 14 }]}>
            {wizardStep < 3 ? (
              <TouchableOpacity style={styles.continueBtn} onPress={goNextStep} activeOpacity={0.85}>
                <Text style={styles.continueBtnText}>Continue</Text>
                <Ionicons name="arrow-forward" size={18} color="#fff" />
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={styles.continueBtn} onPress={handleSubmit} disabled={isSubmitting} activeOpacity={0.85}>
                {isSubmitting ? <ActivityIndicator color="#fff" /> : (
                  <>
                    <Ionicons name="checkmark-circle-outline" size={18} color="#fff" />
                    <Text style={styles.continueBtnText}>{editingPet ? 'Save Changes' : 'Add Pet'}</Text>
                  </>
                )}
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Modal>

      {/* ── Breed picker modal ── */}
      <Modal visible={showBreedPicker} animationType="slide" transparent onRequestClose={() => setShowBreedPicker(false)}>
        <View style={styles.sheetOverlay}>
          <View style={styles.breedSheet}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Select {selectedSpecies} Breed</Text>
              <TouchableOpacity onPress={() => setShowBreedPicker(false)}><Ionicons name="close" size={22} color={SUB} /></TouchableOpacity>
            </View>
            <View style={styles.breedSearchWrap}>
              <Ionicons name="search" size={15} color={SUB} />
              <TextInput
                style={styles.breedSearchInput}
                placeholder="Search breeds..."
                placeholderTextColor="#9CA3AF"
                value={breedSearch}
                onChangeText={setBreedSearch}
              />
            </View>
            <ScrollView style={{ maxHeight: 360 }} showsVerticalScrollIndicator={false}>
              {filteredBreeds.map((b) => (
                <TouchableOpacity
                  key={b}
                  style={[styles.breedItem, breed === b && styles.breedItemActive]}
                  onPress={() => { setBreed(b); setShowBreedPicker(false); }}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.breedItemText, breed === b && styles.breedItemTextActive]}>{b}</Text>
                  {breed === b && <Ionicons name="checkmark" size={16} color={TEAL} />}
                </TouchableOpacity>
              ))}
              {breedSearch && filteredBreeds.length === 0 && (
                <TouchableOpacity
                  style={styles.breedItem}
                  onPress={() => { setBreed(breedSearch); setShowBreedPicker(false); }}
                  activeOpacity={0.7}
                >
                  <Text style={styles.breedItemText}>Use "{breedSearch}"</Text>
                  <Ionicons name="add-circle-outline" size={16} color={TEAL} />
                </TouchableOpacity>
              )}
              <View style={{ height: 16 }} />
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ── Photo Action Sheet ── */}
      <Modal visible={showPhotoSheet} transparent animationType="slide">
        <Pressable style={styles.photoSheetOverlay} onPress={() => setShowPhotoSheet(false)}>
          <Pressable style={styles.photoActionSheet}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Pet Photo</Text>

            <TouchableOpacity style={styles.actionItem} onPress={pickPhoto} activeOpacity={0.7}>
              <View style={[styles.actionItemIcon, { backgroundColor: TEAL_LIGHT }]}><Ionicons name="images-outline" size={16} color={TEAL} /></View>
              <Text style={styles.actionItemText}>Choose from Library</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.actionItem} onPress={takePhoto} activeOpacity={0.7}>
              <View style={[styles.actionItemIcon, { backgroundColor: TEAL_LIGHT }]}><Ionicons name="camera-outline" size={16} color={TEAL} /></View>
              <Text style={styles.actionItemText}>Take a Photo</Text>
            </TouchableOpacity>

            {(photoUrl || pendingPhotoUri) && (
              <TouchableOpacity style={styles.actionItem} onPress={removePhoto} activeOpacity={0.7}>
                <View style={[styles.actionItemIcon, { backgroundColor: '#FEE2E2' }]}><Ionicons name="trash-outline" size={16} color={RED} /></View>
                <Text style={[styles.actionItemText, { color: RED }]}>Remove Photo</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowPhotoSheet(false)}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function ReviewRow({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <>
      <View style={styles.reviewRow}>
        <Text style={styles.reviewRowLabel}>{label}</Text>
        <Text style={styles.reviewRowValue} numberOfLines={2}>{value}</Text>
      </View>
      {!last && <View style={styles.reviewRowDivider} />}
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  scroll: { flex: 1 },
  scrollContent: { padding: 14 },

  header: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 },
  headerTitle: { fontSize: 24, fontWeight: '800', color: INK, letterSpacing: -0.4 },
  headerSub: { fontSize: 12.5, color: SUB, marginTop: 3 },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: TEAL, borderRadius: 22, paddingHorizontal: 15, paddingVertical: 10 },
  addBtnText: { color: '#fff', fontWeight: '700', fontSize: 13.5 },

  toolRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  searchWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#fff', borderRadius: 24, paddingHorizontal: 14, paddingVertical: 11, borderWidth: 1, borderColor: BORDER },
  searchInput: { flex: 1, fontSize: 13.5, color: INK },
  sortBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#fff', borderRadius: 24, paddingHorizontal: 14, borderWidth: 1, borderColor: BORDER },
  sortBtnText: { fontSize: 12.5, fontWeight: '700', color: INK },

  empty: { alignItems: 'center', paddingTop: 40, gap: 10 },
  emptyIconWrap: { width: 72, height: 72, borderRadius: 36, backgroundColor: TEAL, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  emptyTitle: { fontSize: 17, fontWeight: '800', color: INK },
  emptyText: { fontSize: 13, color: SUB },

  petCard: { backgroundColor: '#fff', borderRadius: 18, marginBottom: 14, padding: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  photoWrapLarge: {},
  petPhotoLarge: { width: 52, height: 52, borderRadius: 26 },
  petPhotoFallback: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  cardInfo: { flex: 1, minWidth: 0 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  petName: { fontSize: 16.5, fontWeight: '800', color: INK, letterSpacing: -0.2, flexShrink: 1 },
  speciesDot: { width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  petSpecies: { fontSize: 12.5, color: SUB, marginTop: 2 },
  cardTopActions: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  favoriteBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: BG, alignItems: 'center', justifyContent: 'center' },
  favoriteBtnActive: { backgroundColor: '#FEE2E2' },
  menuBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: BG, alignItems: 'center', justifyContent: 'center' },

  statsRow: { flexDirection: 'row', gap: 8, marginTop: 14 },
  statBox: { flex: 1, backgroundColor: BG, borderRadius: 10, paddingVertical: 8, alignItems: 'center' },
  statLabel: { fontSize: 9, fontWeight: '700', color: SUB, letterSpacing: 0.5, marginBottom: 3 },
  statValue: { fontSize: 13, fontWeight: '800', color: INK },

  noteBubble: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: TEAL_LIGHT, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 6, alignSelf: 'flex-start', maxWidth: '100%', marginTop: 10 },
  noteText: { fontSize: 11.5, color: '#0F766E', fontWeight: '600', flexShrink: 1 },

  dueBanner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: TEAL_LIGHT, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, marginTop: 10 },
  dueBannerLeft: { flexDirection: 'row', alignItems: 'center', gap: 7, flex: 1 },
  dueBannerText: { fontSize: 12, fontWeight: '700', color: '#0F766E', flexShrink: 1 },
  dueBannerLink: { fontSize: 12, fontWeight: '800', color: TEAL },

  menuOverlay: { flex: 1 },
  dropdownMenu: { position: 'absolute', backgroundColor: '#fff', borderRadius: 12, paddingVertical: 6, width: 170, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 14, elevation: 12 },
  dropdownItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 12 },
  dropdownItemText: { fontSize: 13.5, fontWeight: '600', color: INK },
  dropdownDivider: { height: 1, backgroundColor: BORDER, marginHorizontal: 8 },

  motivBanner: { backgroundColor: TEAL_LIGHT, borderRadius: 18, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 14, position: 'relative', overflow: 'hidden', marginTop: 4 },
  bannerHeart1: { position: 'absolute', top: 10, left: 10, opacity: 0.4 },
  bannerHeart2: { position: 'absolute', top: 26, left: 22, opacity: 0.3 },
  bannerContent: { flex: 1 },
  bannerTitle: { fontSize: 15, fontWeight: '800', color: INK, marginBottom: 4 },
  bannerText: { fontSize: 12, color: '#0F766E', lineHeight: 17 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: 24 },
  sortSheet: { backgroundColor: '#fff', borderRadius: 14, padding: 16 },
  pickerTitle: { fontSize: 15, fontWeight: '800', color: INK, marginBottom: 10 },
  sortOption: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 12, borderRadius: 9 },
  sortOptionActive: { backgroundColor: TEAL },
  sortOptionText: { fontSize: 14, color: INK, fontWeight: '600' },
  sortOptionTextActive: { color: '#fff' },

  /* ── Wizard ── */
  wizardContainer: { flex: 1, backgroundColor: BG },
  wizardHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingBottom: 12, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: BORDER,
  },
  wizardBackBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: BG, alignItems: 'center', justifyContent: 'center' },
  wizardHeaderTitle: { fontSize: 16, fontWeight: '800', color: INK },
  wizardCloseBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },

  progressWrap: { backgroundColor: '#fff', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: BORDER },
  progressTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  progressStepLabel: { fontSize: 11, fontWeight: '800', color: TEAL, letterSpacing: 0.6 },
  progressPercent: { fontSize: 11, fontWeight: '700', color: SUB },
  progressTrack: { height: 5, borderRadius: 3, backgroundColor: BORDER, overflow: 'hidden', marginBottom: 10 },
  progressFill: { height: '100%', backgroundColor: TEAL, borderRadius: 3 },
  progressHint: { fontSize: 11, color: SUB, lineHeight: 15 },

  wizardScroll: { flex: 1 },
  wizardForm: { padding: 16 },

  errorBox: { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FECACA', borderRadius: 8, padding: 10, marginBottom: 14 },
  errorText: { color: RED, fontSize: 12.5, flex: 1 },

  photoCircleWrap: { alignSelf: 'center', position: 'relative', marginBottom: 8 },
  photoCircle: {
    width: 96, height: 96, borderRadius: 48, backgroundColor: TEAL_LIGHT,
    alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: TEAL, borderStyle: 'dashed',
  },
  photoCircleImage: { width: 96, height: 96, borderRadius: 48 },
  photoUploadOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 48, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' },
  photoAddBadge: { position: 'absolute', bottom: 2, right: 2, width: 26, height: 26, borderRadius: 13, backgroundColor: TEAL, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#fff' },
  photoCircleLabel: { fontSize: 13, fontWeight: '700', color: TEAL, textAlign: 'center', marginTop: 4 },
  photoCircleSub: { fontSize: 11, color: SUB, textAlign: 'center', marginTop: 2, marginBottom: 20 },

  wizardCard: { backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: BORDER },
  wizardCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 14 },
  wizardCardTitle: { fontSize: 13.5, fontWeight: '800', color: INK },

  fieldLabel: { fontSize: 12.5, fontWeight: '700', color: INK, marginBottom: 7, marginTop: 12 },
  required: { color: RED },
  optionalText: { color: SUB, fontWeight: '500', fontSize: 10.5 },

  input: { backgroundColor: BG, borderWidth: 1.5, borderColor: BORDER, borderRadius: 10, paddingHorizontal: 13, paddingVertical: 12, fontSize: 14, color: INK, textAlignVertical: 'top' },
  fieldHint: { fontSize: 10.5, color: SUB, marginTop: 5 },

  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  speciesChip: { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1.5, borderColor: BORDER, borderRadius: 20, paddingHorizontal: 13, paddingVertical: 8, backgroundColor: '#fff' },
  speciesChipActive: { backgroundColor: TEAL, borderColor: TEAL },
  genderChip: { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1.5, borderColor: BORDER, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: '#fff', flex: 1, justifyContent: 'center' },
  genderChipActive: { backgroundColor: TEAL, borderColor: TEAL },
  chip: { borderWidth: 1.5, borderColor: BORDER, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 9, backgroundColor: '#fff' },
  chipActive: { backgroundColor: TEAL, borderColor: TEAL },
  chipText: { fontSize: 13, color: INK, fontWeight: '600' },
  chipTextActive: { color: '#fff', fontWeight: '700' },

  speciesNote: { fontSize: 10.5, color: SUB, marginTop: 8, lineHeight: 15 },

  breedSelector: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: BG, borderWidth: 1.5, borderColor: BORDER, borderRadius: 10, paddingHorizontal: 13, paddingVertical: 12,
  },
  breedSelectorValue: { fontSize: 14, color: INK, fontWeight: '600' },
  breedSelectorPlaceholder: { fontSize: 14, color: '#9CA3AF' },

  twoCol: { flexDirection: 'row', alignItems: 'flex-start', marginTop: 12 },
  stepperRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: BG, borderWidth: 1.5, borderColor: BORDER, borderRadius: 10, paddingHorizontal: 4, paddingVertical: 4 },
  stepperBtn: { width: 30, height: 30, borderRadius: 8, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  stepperInput: { flex: 1, fontSize: 14, fontWeight: '700', color: INK, paddingVertical: 0 },
  stepperUnit: { fontSize: 11, color: SUB, marginRight: 4 },

  reviewHeader: { alignItems: 'center', marginBottom: 16 },
  reviewPhoto: { width: 76, height: 76, borderRadius: 38, marginBottom: 10 },
  reviewPhotoFallback: { width: 76, height: 76, borderRadius: 38, backgroundColor: TEAL_LIGHT, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  reviewName: { fontSize: 18, fontWeight: '800', color: INK },
  reviewSpecies: { fontSize: 12.5, color: SUB, marginTop: 2 },

  reviewRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 11 },
  reviewRowLabel: { fontSize: 12.5, color: SUB, fontWeight: '600' },
  reviewRowValue: { fontSize: 13.5, color: INK, fontWeight: '700', flexShrink: 1, textAlign: 'right', marginLeft: 12 },
  reviewRowDivider: { height: 1, backgroundColor: BORDER },
  reviewFooterNote: { fontSize: 11.5, color: SUB, textAlign: 'center', marginTop: 4, marginBottom: 8 },

  wizardFooter: { backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: BORDER, paddingHorizontal: 16, paddingTop: 12 },
  continueBtn: { backgroundColor: TEAL, borderRadius: 12, paddingVertical: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  continueBtnText: { color: '#fff', fontSize: 14.5, fontWeight: '800' },

  emptyPets: { alignItems: 'center', gap: 8, backgroundColor: '#fff', borderRadius: 12, borderWidth: 1.5, borderColor: BORDER, padding: 20, marginBottom: 12 },
  emptyPetsText: { fontSize: 13, color: SUB },
  addPetBtn: { backgroundColor: TEAL, paddingHorizontal: 18, paddingVertical: 9, borderRadius: 8, marginTop: 4 },
  addPetBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },

  sheetOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  sheetTitle: { fontSize: 16, fontWeight: '800', color: INK },
  sheetHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: BORDER, alignSelf: 'center', marginBottom: 16 },

  breedSheet: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: '80%' },
  breedSearchWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: BG, borderRadius: 10, paddingHorizontal: 13, paddingVertical: 11, marginBottom: 10, borderWidth: 1, borderColor: BORDER },
  breedSearchInput: { flex: 1, fontSize: 14, color: INK },
  breedItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 13, paddingHorizontal: 4, borderBottomWidth: 1, borderBottomColor: BG },
  breedItemActive: { backgroundColor: TEAL_LIGHT, borderRadius: 8, paddingHorizontal: 10 },
  breedItemText: { fontSize: 14, color: INK, fontWeight: '500' },
  breedItemTextActive: { fontWeight: '700', color: TEAL },

  photoSheetOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  photoActionSheet: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 32 },
  actionItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11 },
  actionItemIcon: { width: 36, height: 36, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  actionItemText: { fontSize: 14, fontWeight: '600', color: INK },
  cancelBtn: { marginTop: 8, backgroundColor: BG, borderRadius: 10, paddingVertical: 13, alignItems: 'center', borderWidth: 1, borderColor: BORDER },
  cancelBtnText: { fontSize: 14, fontWeight: '700', color: SUB },
});