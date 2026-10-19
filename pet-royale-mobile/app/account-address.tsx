import SingleFieldEditScreen from '../components/SingleFieldEditScreen';
import { tidy } from '../lib/useClientProfile';

/* Same rule as Create account: at least 8 characters including a letter
   (street, barangay, city). */
const isValidAddress = (v: string) => v.length >= 8 && /[A-Za-z]/.test(v);

export default function AccountAddressScreen() {
  return (
    <SingleFieldEditScreen
      title="Address"
      label="Address"
      column="address"
      initialOf={(p) => p.address}
      normalize={tidy}
      problem={(v) => (isValidAddress(v) ? null : 'Include your street, barangay and city.')}
      inputProps={{
        placeholder: 'Street, barangay, city',
        autoCapitalize: 'words',
        autoComplete: 'street-address',
        textContentType: 'fullStreetAddress',
      }}
    />
  );
}
