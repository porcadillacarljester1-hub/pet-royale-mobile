import SingleFieldEditScreen from '../components/SingleFieldEditScreen';
import { tidy } from '../lib/useClientProfile';

/* Same rule as Create account: required, at least 2 characters. */
const isValidMessenger = (v: string) => v.length >= 2;

export default function AccountMessengerScreen() {
  return (
    <SingleFieldEditScreen
      title="Messenger"
      label="Messenger"
      column="fb_messenger"
      initialOf={(p) => p.messenger}
      normalize={tidy}
      problem={(v) => (isValidMessenger(v) ? null : 'Enter your Messenger name or link.')}
      inputProps={{
        autoCapitalize: 'none',
        autoCorrect: false,
      }}
    />
  );
}
