import { Stethoscope, Syringe, Scissors, Bandage, ShieldAlert } from 'lucide-react-native';

/* One icon per clinic service, keyed by the service name the booking
   screen stores on an appointment. Used by Book a visit and Payment
   History, so a service looks the same in both.

   A real component with the choice made inside it, rather than a
   function that hands back a component to render: picking a component
   during render makes React treat it as a new one every time. A name
   that isn't listed (a newly added service) gets the stethoscope. */
export function ServiceIcon({
  name,
  size,
  color,
  strokeWidth,
}: {
  name?: string | null;
  size: number;
  color: string;
  strokeWidth?: number;
}) {
  const props = { size, color, strokeWidth };
  switch (name) {
    case 'Vaccination & Deworming':
      return <Syringe {...props} />;
    case 'Grooming':
      return <Scissors {...props} />;
    case 'Minor & Major Surgeries':
      return <Bandage {...props} />;
    case 'Confinement & Emergency Care':
      return <ShieldAlert {...props} />;
    case 'Veterinary Check-ups':
    default:
      return <Stethoscope {...props} />;
  }
}
