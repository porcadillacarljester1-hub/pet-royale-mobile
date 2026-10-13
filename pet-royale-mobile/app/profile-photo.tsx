import { useState, useEffect, type ElementType } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Camera, Check, ChevronRight, ImageIcon, Trash2, User } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import {
  fetchAvatarHistory,
  addAvatarHistoryEntry,
  deleteAvatarHistoryEntry,
  type AvatarHistoryItem,
} from '@/lib/avatarHistory';
import { colors, status, text, space, radius, hitSlop, common } from '@/constants/theme';
import { ScreenHeader } from '@/components/ScreenHeader';
import { PhotoCropper } from '@/components/PhotoCropper';

const MAX_SIDE = 1600;

/* Bakes in the camera's rotation and shrinks the photo, so the width and
   height handed to the cropper are the real ones. Camera originals can be
   huge and carry an EXIF rotation that makes the picker's numbers wrong. */
async function prepare(a: ImagePicker.ImagePickerAsset) {
  const longest = Math.max(a.width, a.height);
  const actions: ImageManipulator.Action[] =
    longest > MAX_SIDE
      ? [{ resize: a.width >= a.height ? { width: MAX_SIDE } : { height: MAX_SIDE } }]
      : [];
  const r = await ImageManipulator.manipulateAsync(a.uri, actions, {
    compress: 0.9,
    format: ImageManipulator.SaveFormat.JPEG,
  });
  return { uri: r.uri, width: r.width, height: r.height };
}

function base64ToArrayBuffer(b64: string): ArrayBuffer {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

/* One option row: neutral icon circle, bold label, optional chevron.
   Plain rows between hairlines, the same way Instagram and Facebook
   list "Take photo" and "Choose from library". */
function OptionRow({
  Icon,
  label,
  onPress,
  danger,
  last,
}: {
  Icon: ElementType;
  label: string;
  onPress: () => void;
  danger?: boolean;
  last?: boolean;
}) {
  return (
    <>
      <TouchableOpacity
        style={styles.optionRow}
        onPress={onPress}
        activeOpacity={0.75}
        accessibilityRole="button"
        accessibilityLabel={label}
      >
        <View style={[styles.optionIcon, danger && styles.optionIconDanger]}>
          <Icon size={22} color={danger ? status.danger.fg : colors.primary} strokeWidth={1.9} />
        </View>
        <Text style={[styles.optionLabel, danger && styles.optionLabelDanger]}>{label}</Text>
        {!danger && <ChevronRight size={18} color={colors.mutedFg} />}
      </TouchableOpacity>
      {!last && <View style={common.divider} />}
    </>
  );
}

export default function ProfilePhotoScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [currentUrl, setCurrentUrl] = useState<string | null>(null);
  const [selectedUri, setSelectedUri] = useState<string | null>(null);
  const [selectedIsExisting, setSelectedIsExisting] = useState(false);
  // The cropped photo's data, used for the upload (see handleSave).
  const [selectedBase64, setSelectedBase64] = useState<string | null>(null);
  const [history, setHistory] = useState<AvatarHistoryItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  // The photo just picked or taken, waiting in the move-and-scale step.
  const [cropSource, setCropSource] = useState<{ uri: string; width: number; height: number } | null>(null);
  // The preview URI that failed to load, so the fallback shows instead of
  // a blank circle. Comparing against the current URI means no reset is needed.
  const [failedUri, setFailedUri] = useState<string | null>(null);

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

  /* allowsEditing is off on purpose: the system crop screen can't be
     styled or show a circle, so PhotoCropper handles that step. */
  const openCropper = async (asset: ImagePicker.ImagePickerAsset) => {
    try {
      setCropSource(await prepare(asset));
    } catch {
      Alert.alert('Error', 'Couldn\u2019t open that photo. Please try again.');
    }
  };

  const pickFromLibrary = async () => {
    const { status: permStatus } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (permStatus !== 'granted') {
      Alert.alert('Permission Required', 'Please allow access to your photo library.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'] as any,
      allowsEditing: false,
      quality: 1,
    });
    if (!result.canceled) await openCropper(result.assets[0]);
  };

  const takePhoto = async () => {
    const { status: permStatus } = await ImagePicker.requestCameraPermissionsAsync();
    if (permStatus !== 'granted') {
      Alert.alert('Permission Required', 'Please allow camera access.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: false,
      quality: 0.8,
    });
    if (!result.canceled) await openCropper(result.assets[0]);
  };

  const selectFromHistory = (item: AvatarHistoryItem) => {
    setSelectedUri(item.photo_url);
    setSelectedIsExisting(true);
  };

  /* The recent photo that's currently selected, if one is. A freshly
     picked or cropped photo isn't in the history yet, so it has no
     delete option. */
  const selectedHistoryItem = selectedIsExisting
    ? history.find((h) => h.photo_url === selectedUri)
    : undefined;

  /* Deletes the selected photo from Recent photos only. Every history row
     with that URL goes (re-selecting a photo inserts a duplicate row), but
     the account's current photo and the stored file are left alone. */
  const deleteSelectedHistory = () => {
    const item = selectedHistoryItem;
    if (!item || !userId) return;
    Alert.alert('Delete photo', 'Delete this photo from your recent photos?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteAvatarHistoryEntry(userId, item.photo_url);
            setHistory((prev) => prev.filter((h) => h.photo_url !== item.photo_url));
            setSelectedUri(null);
            setSelectedIsExisting(false);
          } catch {
            Alert.alert('Error', 'Couldn\u2019t delete the photo. Please try again.');
          }
        },
      },
    ]);
  };

  /* Removing clears the photo on the account. It does not delete the
     history rows, so an old photo can still be chosen again. */
  const removePhoto = () => {
    Alert.alert('Remove photo', 'Remove your current profile photo?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          setSaving(true);
          try {
            await supabase.auth.updateUser({ data: { avatar_url: null } });
            setCurrentUrl(null);
            setSelectedUri(null);
          } catch {
            Alert.alert('Error', 'Couldn\u2019t remove the photo. Please try again.');
          } finally {
            setSaving(false);
          }
        },
      },
    ]);
  };

  const previewUri = selectedUri || currentUrl;
  const hasChange = !!selectedUri && selectedUri !== currentUrl;
  const showPreviewImage = !!previewUri && previewUri !== failedUri;

  const handleSave = async () => {
    if (!hasChange || !userId) return;
    setSaving(true);
    try {
      let finalUrl = selectedUri!;

      // Only upload if this is a brand-new local photo (not one picked from history, which is already a real URL)
      if (!selectedIsExisting) {
        const isPng = /\.png($|\?)/i.test(selectedUri!);
        const ext = isPng ? 'png' : 'jpg';
        const fileName = `${userId}_${Date.now()}.${ext}`;

        /* Don't re-read the file with fetch(file://...).arrayBuffer(): on
           Android it returns a ~14-byte stub, which uploads as a broken
           photo. The cropper already hands back the image data as base64. */
        if (!selectedBase64) throw new Error('No photo data');
        const buffer = base64ToArrayBuffer(selectedBase64);
        // Never store a stub: it would show up as a blank photo.
        if (buffer.byteLength < 1000) throw new Error('Photo file is too small');

        const { error: uploadError } = await supabase.storage
          .from('avatars')
          .upload(fileName, buffer, {
            contentType: isPng ? 'image/png' : 'image/jpeg',
            upsert: false,
          });
        if (uploadError) throw uploadError;
        const { data } = supabase.storage.from('avatars').getPublicUrl(fileName);
        finalUrl = data.publicUrl;
      }

      // Always record the save so the newest history row matches the active photo.
      // The clinic dashboard reads from this table.
      await addAvatarHistoryEntry(userId, finalUrl);
      await supabase.auth.updateUser({ data: { avatar_url: finalUrl } });
      router.back();
    } catch (e) {
      console.warn('save photo failed', e);
      Alert.alert('Error', 'Failed to save photo. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  // Same behaviour as Personal information: warn before discarding a change.
  const handleBack = () => {
    if (!hasChange || saving) {
      router.back();
      return;
    }
    Alert.alert('Unsaved changes', 'Discard your changes?', [
      { text: 'Keep editing', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: () => router.back() },
    ]);
  };

  const saveDisabled = !hasChange || saving;

  return (
    <View style={common.screen}>
      <ScreenHeader title="Profile photo" onBack={handleBack} large />

      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Preview ── No card, just the photo with the gold ring. */}
        <View style={styles.previewSection}>
          <View style={styles.previewRing}>
            {showPreviewImage ? (
              <Image
                source={{ uri: previewUri! }}
                style={styles.previewImage}
                onError={() => setFailedUri(previewUri)}
              />
            ) : (
              <View style={styles.previewFallback}>
                <User size={64} color={colors.primaryFg} strokeWidth={1.6} />
              </View>
            )}
          </View>
          <Text style={styles.previewCaption}>JPG or PNG · Max 5 MB</Text>
        </View>

        {/* ── Options ── */}
        <View>
          <OptionRow Icon={Camera} label="Take photo" onPress={takePhoto} last={false} />
          <OptionRow
            Icon={ImageIcon}
            label="Choose from gallery"
            onPress={pickFromLibrary}
            last={!currentUrl}
          />
          {!!currentUrl && (
            <OptionRow Icon={Trash2} label="Remove current photo" onPress={removePhoto} danger last />
          )}
        </View>

        <Text style={styles.tip}>
          Pick a clear, well-lit photo with your face visible. You can move and zoom it before it&apos;s saved.
        </Text>

        {/* ── Recent photos ── */}
        {history.length > 0 && (
          <View style={styles.recentSection}>
            {/* The delete action sits beside the heading, so it's on screen
                the moment a photo is selected, with no scrolling to find it. */}
            <View style={styles.recentHead}>
              <Text style={styles.recentTitle}>Recent photos</Text>
              {!!selectedHistoryItem && (
                <TouchableOpacity
                  style={styles.deleteBtn}
                  onPress={deleteSelectedHistory}
                  activeOpacity={0.7}
                  hitSlop={hitSlop}
                  accessibilityRole="button"
                  accessibilityLabel="Delete selected photo"
                >
                  <Trash2 size={18} color={status.danger.fg} strokeWidth={1.9} />
                  <Text style={styles.deleteText}>Delete</Text>
                </TouchableOpacity>
              )}
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.recentScroll}
              contentContainerStyle={styles.recentRow}
            >
              {history.map((item) => {
                const isSelected = selectedUri === item.photo_url;
                return (
                  <TouchableOpacity
                    key={item.id}
                    onPress={() => selectFromHistory(item)}
                    activeOpacity={0.85}
                    style={[styles.recentThumbWrap, isSelected && styles.recentThumbWrapSelected]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isSelected }}
                    accessibilityLabel="Use this previous photo"
                  >
                    <Image source={{ uri: item.photo_url }} style={styles.recentThumb} />
                    {isSelected && (
                      <View style={styles.recentCheckBadge}>
                        <Check size={12} color={colors.accentFg} strokeWidth={3} />
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        )}
      </ScrollView>

      {/* Pinned, so it's always reachable however many recent photos
          there are. Clears the system navigation bar (3-button or
          gesture). */}
      <PhotoCropper
        source={cropSource}
        onCancel={() => setCropSource(null)}
        onDone={(uri, base64) => {
          setSelectedUri(uri);
          setSelectedBase64(base64);
          setSelectedIsExisting(false);
          setCropSource(null);
        }}
      />

      <View style={[styles.footer, { paddingBottom: space.xxl + insets.bottom }]}>
        <TouchableOpacity
          style={[common.buttonPrimary, saveDisabled && common.buttonPrimaryDisabled]}
          onPress={handleSave}
          disabled={saveDisabled}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityState={{ disabled: saveDisabled, busy: saving }}
        >
          {saving ? (
            <ActivityIndicator color={saveDisabled ? colors.mutedFg : colors.primaryFg} />
          ) : (
            <Text style={[common.buttonPrimaryText, saveDisabled && common.buttonPrimaryTextDisabled]}>
              Save photo
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const PREVIEW = 120;
const RING_GAP = 5;
const RING_WIDTH = 2;
const PREVIEW_OUTER = PREVIEW + (RING_GAP + RING_WIDTH) * 2;

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scrollContent: { paddingHorizontal: space.xl, paddingTop: space.md, paddingBottom: space.lg },

  previewSection: { alignItems: 'center', marginBottom: space.md },
  previewRing: {
    width: PREVIEW_OUTER,
    height: PREVIEW_OUTER,
    borderRadius: PREVIEW_OUTER / 2,
    borderWidth: RING_WIDTH,
    borderColor: colors.accent,
    padding: RING_GAP,
    marginBottom: space.sm,
  },
  previewImage: {
    width: PREVIEW,
    height: PREVIEW,
    borderRadius: PREVIEW / 2,
    backgroundColor: colors.muted,
  },
  previewFallback: {
    width: PREVIEW,
    height: PREVIEW,
    borderRadius: PREVIEW / 2,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewCaption: { ...text.small, color: colors.mutedFg },

  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.lg,
    minHeight: 54,
    paddingVertical: space.sm,
    paddingHorizontal: space.xs,
  },
  optionIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.muted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionIconDanger: { backgroundColor: status.danger.bg },
  optionLabel: { ...text.bodyBold, color: colors.foreground, flex: 1 },
  optionLabelDanger: { color: status.danger.fg },

  tip: { ...text.small, color: colors.mutedFg, marginTop: space.sm, paddingHorizontal: space.xs },

  recentSection: { marginTop: space.lg },
  recentHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 44,
    marginBottom: space.sm,
  },
  recentTitle: { ...text.section, color: colors.foreground },
  recentScroll: { marginHorizontal: -space.xl },
  recentRow: { gap: space.md, paddingHorizontal: space.xl },
  recentThumbWrap: {
    width: 68,
    height: 68,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: 'transparent',
    backgroundColor: colors.muted,
    overflow: 'hidden',
    position: 'relative',
  },
  recentThumbWrapSelected: { borderColor: colors.primary },
  recentThumb: { width: '100%', height: '100%' },
  recentCheckBadge: {
    position: 'absolute',
    top: 3,
    right: 3,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44 },
  deleteText: { ...text.bodyBold, color: status.danger.fg },

  footer: {
    paddingHorizontal: space.xl,
    paddingTop: space.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
  },
});
