import { configureReanimatedLogger, ReanimatedLogLevel } from 'react-native-reanimated';

// Silences the dev-only "Reading from value during component render" warning.
configureReanimatedLogger({
  level: ReanimatedLogLevel.warn,
  strict: false,
});
