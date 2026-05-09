import { TextInput, StyleSheet, TextInputProps } from 'react-native';

interface CustomInputProps extends TextInputProps {
  placeholder?: string;
}

export default function CustomInput({ placeholder, ...props }: CustomInputProps) {
  return (
    <TextInput
      placeholder={placeholder}
      placeholderTextColor="#999999"
      style={styles.input}
      {...props}
    />
  );
}

const styles = StyleSheet.create({
  input: {
    color: '#000000',
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
  },
});