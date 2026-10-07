import { useState } from 'react';
import {
  Modal,
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  StatusBar,
  Alert,
  useWindowDimensions,
} from 'react-native';
import { GestureDetector, Gesture, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { useSharedValue, useAnimatedStyle } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImageManipulator from 'expo-image-manipulator';
import { colors, text, space, fonts, sz } from '../constants/theme';

const MAX_ZOOM = 4;
const OUTPUT_SIZE = 800;


type Source = { uri: string; width: number; height: number };

export function PhotoCropper({
  source,
  onCancel,
  onDone,
}: {
  source: Source | null;
  onCancel: () => void;
  onDone: (uri: string, base64: string) => void;
}) {
  return (
    <Modal
      visible={!!source}
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onCancel}
    >
      <GestureHandlerRootView style={styles.root}>
        {source && <CropperBody source={source} onCancel={onCancel} onDone={onDone} />}
      </GestureHandlerRootView>
    </Modal>
  );
}

function CropperBody({
  source,
  onCancel,
  onDone,
}: {
  source: Source;
  onCancel: () => void;
  onDone: (uri: string, base64: string) => void;
}) {
  const insets = useSafeAreaInsets();
  const { width: screenW } = useWindowDimensions();
  const [busy, setBusy] = useState(false);

  const STAGE = screenW;
  const CROP = Math.min(screenW - 48, 340);
  const { width: W, height: H } = source;

  // Scale at which the photo exactly covers the circle.
  const base = CROP / Math.min(W, H);
  const imgW = W * base;
  const imgH = H * base;

  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const savedTx = useSharedValue(0);
  const savedTy = useSharedValue(0);

  const limitX = (s: number) => {
    'worklet';
    return Math.max(0, (imgW * s - CROP) / 2);
  };
  const limitY = (s: number) => {
    'worklet';
    return Math.max(0, (imgH * s - CROP) / 2);
  };
  const clamp = (v: number, lim: number) => {
    'worklet';
    return Math.min(lim, Math.max(-lim, v));
  };

  const pan = Gesture.Pan()
    .onStart(() => {
      savedTx.value = tx.value;
      savedTy.value = ty.value;
    })
    .onUpdate((e) => {
      tx.value = clamp(savedTx.value + e.translationX, limitX(scale.value));
      ty.value = clamp(savedTy.value + e.translationY, limitY(scale.value));
    });

  const pinch = Gesture.Pinch()
    .onStart(() => {
      savedScale.value = scale.value;
    })
    .onUpdate((e) => {
      const next = Math.min(MAX_ZOOM, Math.max(1, savedScale.value * e.scale));
      scale.value = next;
      tx.value = clamp(tx.value, limitX(next));
      ty.value = clamp(ty.value, limitY(next));
    });

  const gesture = Gesture.Simultaneous(pan, pinch);

  const imageStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }, { translateY: ty.value }, { scale: scale.value }],
  }));

  const handleDone = async () => {
    setBusy(true);
    try {
      // Map the circle's bounding square back onto the original pixels.
      // Whole numbers, clamped to the image: Android rejects a crop that
      // overshoots the photo by even a fraction of a pixel.
      const s = base * scale.value;
      const size = Math.floor(Math.min(CROP / s, W, H));
      const originX = Math.floor(
        Math.max(0, Math.min(W - size, (imgW * scale.value / 2 - CROP / 2 - tx.value) / s))
      );
      const originY = Math.floor(
        Math.max(0, Math.min(H - size, (imgH * scale.value / 2 - CROP / 2 - ty.value) / s))
      );

      const result = await ImageManipulator.manipulateAsync(
        source.uri,
        [
          { crop: { originX, originY, width: size, height: size } },
          { resize: { width: OUTPUT_SIZE, height: OUTPUT_SIZE } },
        ],
        { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG, base64: true }
      );
      if (!result.base64) throw new Error('Cropped photo has no data');
      onDone(result.uri, result.base64);
    } catch (e) {
      console.warn('crop failed', e);
      Alert.alert('Error', 'Couldn\u2019t crop that photo. Please try again.');
      setBusy(false);
    }
  };

  const HOLE_BORDER = STAGE;

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={colors.primaryDark} />

      <View style={[styles.bar, { paddingTop: insets.top + space.sm }]}>
        <TouchableOpacity
          style={styles.barBtn}
          onPress={onCancel}
          disabled={busy}
          accessibilityRole="button"
        >
          <Text style={styles.cancel}>Cancel</Text>
        </TouchableOpacity>
        <Text style={styles.title} accessibilityRole="header">Move and scale</Text>
        <TouchableOpacity
          style={[styles.barBtn, styles.barBtnEnd]}
          onPress={handleDone}
          disabled={busy}
          accessibilityRole="button"
        >
          {busy ? <ActivityIndicator color={colors.accent} /> : <Text style={styles.done}>Done</Text>}
        </TouchableOpacity>
      </View>

      <View style={[styles.stage, { width: STAGE, height: STAGE }]}>
        <GestureDetector gesture={gesture}>
          <View style={styles.stageTouch}>
            <Animated.View style={imageStyle}>
              <Image source={{ uri: source.uri }} style={{ width: imgW, height: imgH }} />
            </Animated.View>
          </View>
        </GestureDetector>

        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            width: CROP + HOLE_BORDER * 2,
            height: CROP + HOLE_BORDER * 2,
            borderRadius: (CROP + HOLE_BORDER * 2) / 2,
            borderWidth: HOLE_BORDER,
            borderColor: 'rgba(4, 22, 47, 0.72)',
          }}
        />
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            width: CROP,
            height: CROP,
            borderRadius: CROP / 2,
            borderWidth: 2,
            borderColor: colors.primaryFg,
          }}
        />
      </View>

      <Text style={styles.hint}>Drag to reposition. Pinch to zoom.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.primaryDark },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.sm,
    paddingBottom: space.md,
  },
  barBtn: { minWidth: sz(76), height: sz(44), justifyContent: 'center', paddingHorizontal: space.sm },
  barBtnEnd: { alignItems: 'flex-end' },
  title: { ...text.heading, color: colors.primaryFg },
  cancel: { fontFamily: fonts.bodyMedium, fontSize: sz(16), color: colors.primaryFg },
  done: { fontFamily: fonts.bodyBold, fontSize: sz(16), color: colors.accent },
  stage: {
    marginTop: space.xxl,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stageTouch: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  hint: {
    ...text.small,
    color: 'rgba(246, 245, 238, 0.72)',
    textAlign: 'center',
    marginTop: space.xxl,
  },
});
