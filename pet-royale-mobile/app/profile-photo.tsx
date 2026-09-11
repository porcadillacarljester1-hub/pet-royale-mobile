import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fetchAvatarHistory, addAvatarHistoryEntry, type AvatarHistoryItem } from '@/lib/avatarHistory';

const TEAL = '#0D9488';
const TEAL_LIGHT = '#CCFBF1';
const BLUE_LIGHT = '#DBEAFE';
const BLUE = '#2563EB';
const BORDER = '#E5E7EB';
const SUB = '#6B7280';
const INK = '#111827';
const BG = '#F4F7FB';

const tips = [
  'Use a clear, well-lit photo',
  'Your face should be visible',
  'Square photo works best',
];

export default function ProfilePhotoScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [currentUrl, setCurrentUrl] = useState<string | null>(null);
  const [selectedUri, setSelectedUri] = useState<string | null>(null);
  const [selectedIsExisting, setSelectedIsExisting] = useState(false);
  const [history, setHistory] = useState<AvatarHistoryItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);
      const url = user.user_metadata?.avatar_url || null;
      setCurrentUrl(url);
      try {
        const hist = await fetchAvatarHistory(user.id, 5);
        setHistory(hist);
      } catch {
        // history table might be empty / first run — non-fatal
      }
    })();
  }, []);

  const pickFromLibrary = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Required', 'Please allow access to your photo library.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'] as any,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });
    if (!result.canceled) {
      setSelectedUri(result.assets[0].uri);
      setSelectedIsExisting(false);
    }
  };

  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Required', 'Please allow camera access.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });
    if (!result.canceled) {
      setSelectedUri(result.assets[0].uri);
      setSelectedIsExisting(false);
    }
  };

  const selectFromHistory = (item: AvatarHistoryItem) => {
    setSelectedUri(item.photo_url);
    setSelectedIsExisting(true);
  };

  const previewUri = selectedUri || currentUrl;
  const hasChange = !!selectedUri && selectedUri !== currentUrl;

  const handleSave = async () => {
    if (!hasChange || !userId) return;
    setSaving(true);
    try {
      let finalUrl = selectedUri!;

      // Only upload if this is a brand-new local photo (not one picked from history, which is already a real URL)
      if (!selectedIsExisting) {
        const fileExt = selectedUri!.split('.').pop() || 'jpg';
        const fileName = `${userId}_${Date.now()}.${fileExt}`;
        const response = await fetch(selectedUri!);
        const arrayBuffer = await response.arrayBuffer();
        const { error: uploadError } = await supabase.storage
          .from('avatars')
          .upload(fileName, arrayBuffer, { contentType: `image/${fileExt}`, upsert: false });
        if (uploadError) throw uploadError;
        const { data } = supabase.storage.from('avatars').getPublicUrl(fileName);
        finalUrl = data.publicUrl;

        await addAvatarHistoryEntry(userId, finalUrl);
      }

      await supabase.auth.updateUser({ data: { avatar_url: finalUrl } });
      router.back();
    } catch {
      Alert.alert('Error', 'Failed to save photo. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} activeOpacity={0.7}>
          <Ionicons name="arrow-back" size={22} color={INK} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Profile Photo</Text>
          <Text style={styles.headerSub}>This will be your profile picture visible across the app.</Text>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {/* ── Preview ── */}
        <View style={styles.previewSection}>
          <View style={styles.previewRing}>
            {previewUri ? (
              <Image source={{ uri: previewUri }} style={styles.previewImage} />
            ) : (
              <View style={styles.previewFallback}>
                <Ionicons name="person" size={40} color={TEAL} />
              </View>
            )}
            <View style={styles.previewCameraBadge}>
              <Ionicons name="camera" size={18} color="#fff" />
            </View>
          </View>
          <Text style={styles.previewCaption}>JPG, PNG · Max size 5MB</Text>
        </View>

        {/* ── Photo tips ── */}
        <View style={styles.tipsCard}>
          <View style={styles.tipsHeader}>
            <View style={styles.tipsIconWrap}>
              <Ionicons name="bulb-outline" size={16} color={TEAL} />
            </View>
            <Text style={styles.tipsTitle}>Photo tips</Text>
          </View>
          <View style={styles.tipsRow}>
            {tips.map((tip, i) => (
              <View key={i} style={[styles.tipItem, i > 0 && styles.tipItemBorder]}>
                <Ionicons name="checkmark" size={13} color={TEAL} />
                <Text style={styles.tipText}>{tip}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* ── Take Photo / Choose from Library ── */}
        <View style={styles.sourceRow}>
          <TouchableOpacity style={styles.sourceCard} onPress={takePhoto} activeOpacity={0.85}>
            <View style={[styles.sourceIconWrap, { backgroundColor: TEAL_LIGHT }]}>
              <Ionicons name="camera-outline" size={22} color={TEAL} />
            </View>
            <Text style={styles.sourceTitle}>Take Photo</Text>
            <Text style={styles.sourceSub}>Use your camera</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.sourceCard} onPress={pickFromLibrary} activeOpacity={0.85}>
            <View style={[styles.sourceIconWrap, { backgroundColor: BLUE_LIGHT }]}>
              <Ionicons name="image-outline" size={22} color={BLUE} />
            </View>
            <Text style={styles.sourceTitle}>Choose from Gallery</Text>
            <Text style={styles.sourceSub}>Select from your photos</Text>
          </TouchableOpacity>
        </View>

        {/* ── Recent Photos ── */}
        {history.length > 0 && (
          <View style={styles.recentSection}>
            <View style={styles.recentHeader}>
              <Text style={styles.recentTitle}>Recent Photos</Text>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.recentRow}>
              {history.map((item) => {
                const isSelected = selectedUri === item.photo_url;
                return (
                  <TouchableOpacity
                    key={item.id}
                    onPress={() => selectFromHistory(item)}
                    activeOpacity={0.85}
                    style={[styles.recentThumbWrap, isSelected && styles.recentThumbWrapSelected]}
                  >
                    <Image source={{ uri: item.photo_url }} style={styles.recentThumb} />
                    {isSelected && (
                      <View style={styles.recentCheckBadge}>
                        <Ionicons name="checkmark" size={12} color="#fff" />
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        )}

        <TouchableOpacity
          style={[styles.saveBtn, !hasChange && styles.saveBtnDisabled]}
          onPress={handleSave}
          disabled={!hasChange || saving}
          activeOpacity={0.85}
        >
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>Save Photo</Text>}
        </TouchableOpacity>

        <View style={{ height: 24 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },

  header: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 14,
    backgroundColor: BG, paddingHorizontal: 18, paddingBottom: 16,
  },
  backBtn: {
    width: 38, height: 38, borderRadius: 19,
    alignItems: 'center', justifyContent: 'center', marginTop: 2,
  },
  headerTitle: { fontSize: 22, fontWeight: '800', color: INK, letterSpacing: -0.3, marginBottom: 4 },
  headerSub: { fontSize: 12.5, color: SUB, lineHeight: 18 },

  scrollContent: { paddingHorizontal: 18 },

  previewSection: { alignItems: 'center', marginBottom: 20 },
  previewRing: {
    width: 168, height: 168, borderRadius: 84,
    borderWidth: 3, borderColor: '#fff',
    backgroundColor: '#fff',
    alignItems: 'center', justifyContent: 'center',
    position: 'relative',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 10, elevation: 3,
    marginBottom: 10,
  },
  previewImage: { width: 160, height: 160, borderRadius: 80 },
  previewFallback: { width: 160, height: 160, borderRadius: 80, backgroundColor: TEAL_LIGHT, alignItems: 'center', justifyContent: 'center' },
  previewCameraBadge: {
    position: 'absolute', bottom: 4, right: 4,
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: TEAL, alignItems: 'center', justifyContent: 'center',
    borderWidth: 3, borderColor: BG,
  },
  previewCaption: { fontSize: 12.5, color: SUB },

  tipsCard: {
    backgroundColor: TEAL_LIGHT, borderRadius: 14, padding: 14, marginBottom: 16,
  },
  tipsHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  tipsIconWrap: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  tipsTitle: { fontSize: 13.5, fontWeight: '800', color: INK },
  tipsRow: { flexDirection: 'row' },
  tipItem: { flex: 1, flexDirection: 'row', alignItems: 'flex-start', gap: 5, paddingHorizontal: 6 },
  tipItemBorder: { borderLeftWidth: 1, borderLeftColor: 'rgba(13,148,136,0.25)' },
  tipText: { fontSize: 10.5, color: '#0F766E', fontWeight: '600', flex: 1, lineHeight: 14 },

  sourceRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  sourceCard: {
    flex: 1, backgroundColor: '#fff', borderRadius: 16,
    alignItems: 'center', paddingVertical: 20, paddingHorizontal: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 5, elevation: 1,
  },
  sourceIconWrap: {
    width: 52, height: 52, borderRadius: 26,
    alignItems: 'center', justifyContent: 'center', marginBottom: 10,
  },
  sourceTitle: { fontSize: 13.5, fontWeight: '800', color: INK, marginBottom: 3, textAlign: 'center' },
  sourceSub: { fontSize: 11, color: SUB, textAlign: 'center' },

  recentSection: { marginBottom: 20 },
  recentHeader: { marginBottom: 10 },
  recentTitle: { fontSize: 14, fontWeight: '800', color: INK },
  recentRow: { gap: 10 },
  recentThumbWrap: {
    width: 64, height: 64, borderRadius: 14,
    borderWidth: 2, borderColor: 'transparent', overflow: 'hidden', position: 'relative',
  },
  recentThumbWrapSelected: { borderColor: TEAL },
  recentThumb: { width: '100%', height: '100%' },
  recentCheckBadge: {
    position: 'absolute', top: 3, right: 3,
    width: 18, height: 18, borderRadius: 9,
    backgroundColor: TEAL, alignItems: 'center', justifyContent: 'center',
  },

  saveBtn: {
    backgroundColor: TEAL, borderRadius: 14, paddingVertical: 16,
    alignItems: 'center', justifyContent: 'center',
  },
  saveBtnDisabled: { backgroundColor: '#D1D5DB' },
  saveBtnText: { color: '#fff', fontSize: 15, fontWeight: '800' },
});