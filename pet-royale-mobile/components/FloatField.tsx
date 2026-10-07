import { useEffect, useState, type ReactNode, type Ref } from 'react';
import { View, TextInput, StyleSheet, Animated, type TextInputProps } from 'react-native';
import { colors, fonts, space, text } from '../constants/theme';

export const FIELD_H = 56;
/* Room for the show/hide password button on the right. Matches BUTTON_H
   in AuthShell. */
const RIGHT_SLOT = 48;

/* A filled field whose label sits inside and floats to the top once
   the field is focused or has text. This was copied into both the sign in
   and register screens; it is the same code, moved here once. */
export default function FloatField({
  label,
  value,
  focused,
  right,
  inputRef,
  ...inputProps
}: {
  label: string;
  value: string;
  focused: boolean;
  right?: ReactNode;
  inputRef?: Ref<TextInput>;
} & TextInputProps) {
  const lifted = focused || value.length > 0;
  const [anim] = useState(() => new Animated.Value(lifted ? 1 : 0));

  useEffect(() => {
    Animated.timing(anim, {
      toValue: lifted ? 1 : 0,
      duration: 150,
      useNativeDriver: false,
    }).start();
  }, [lifted, anim]);

  return (
    <View style={[styles.field, focused && styles.fieldFocused]}>
      <Animated.Text
        pointerEvents="none"
        style={[
          styles.floatLabel,
          {
            top: anim.interpolate({ inputRange: [0, 1], outputRange: [17, 8] }),
            fontSize: anim.interpolate({ inputRange: [0, 1], outputRange: [16, 12] }),
          },
        ]}
      >
        {label}
      </Animated.Text>
      <TextInput
        ref={inputRef}
        style={[styles.fieldInput, right ? styles.fieldInputWithRight : null]}
        value={value}
        placeholderTextColor={colors.mutedFg}
        accessibilityLabel={label}
        {...inputProps}
      />
      {right ? <View style={styles.fieldRight}>{right}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    height: FIELD_H,
    borderRadius: 16,
    backgroundColor: colors.muted,
    borderWidth: 1.5,
    borderColor: 'transparent',
    justifyContent: 'center',
  },
  fieldFocused: {
    borderColor: colors.primary,
    backgroundColor: colors.card,
  },
  floatLabel: {
    position: 'absolute',
    left: space.lg,
    color: colors.mutedFg,
    fontFamily: fonts.bodyMedium,
  },
  fieldInput: {
    ...text.body,
    color: colors.foreground,
    height: '100%',
    paddingTop: 20,
    paddingBottom: 0,
    paddingHorizontal: space.lg,
  },
  fieldInputWithRight: { paddingRight: RIGHT_SLOT + space.xs },
  fieldRight: { position: 'absolute', right: 4, top: 0, bottom: 0, justifyContent: 'center' },
});
