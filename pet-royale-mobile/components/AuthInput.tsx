import type { ComponentProps, ReactNode, RefObject } from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import { colors, text } from '../constants/theme';

/* The label-above field Create account uses (RegisterForm's own Input),
   shared so Sign in and Forgot password look the same. The only addition
   is `right`, a slot inside the box for the show/hide password button. */
type Props = ComponentProps<typeof TextInput> & {
  inputRef?: RefObject<TextInput | null>;
  focused: boolean;
  /** Title shown above the box. The placeholder is the hint inside it. */
  label?: string;
  /** Sits inside the box at the right edge, e.g. the eye toggle. */
  right?: ReactNode;
};

export default function AuthInput({ inputRef, focused, label, right, style, ...rest }: Props) {
  return (
    <View>
      {label ? <Text style={styles.fieldLabel}>{label}</Text> : null}
      <View style={styles.box}>
        <TextInput
          ref={inputRef}
          placeholderTextColor={colors.mutedFg}
          style={[styles.input, focused && styles.inputFocused, right ? styles.inputWithRight : null, style]}
          {...rest}
        />
        {right ? <View style={styles.right}>{right}</View> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fieldLabel: {
    ...text.small,
    fontWeight: '600',
    color: colors.foreground,
    marginBottom: 8,
  },
  box: { position: 'relative' },
  input: {
    ...text.body,
    height: 58,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: 'transparent',
    backgroundColor: colors.muted,
    paddingHorizontal: 20,
    color: colors.foreground,
  },
  inputFocused: {
    borderColor: colors.primary,
    backgroundColor: '#ffffff',
  },
  inputWithRight: { paddingRight: 60 },
  right: {
    position: 'absolute',
    right: 10,
    top: 0,
    height: 58,
    justifyContent: 'center',
  },
});
