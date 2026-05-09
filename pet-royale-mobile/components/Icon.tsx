import { Platform, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface IconProps {
  name: string;
  size?: number;
  color?: string;
  emoji?: string;
}

export default function Icon({ name, size = 24, color = '#000', emoji }: IconProps) {
  if (Platform.OS === 'web') {
    return (
      <Text style={{ fontSize: size * 0.8, lineHeight: size }}>
        {emoji || '•'}
      </Text>
    );
  }

  return <Ionicons name={name as any} size={size} color={color} />;
}