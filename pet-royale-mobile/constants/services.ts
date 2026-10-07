import {
  Stethoscope,
  Syringe,
  HeartPulse,
  ShieldAlert,
  Scissors,
} from 'lucide-react-native';

/* What each service is, in a sentence or two, plus a few practical
   things worth knowing before you come in. No prices: they vary by
   weight and by what the vet finds on the day, and a number here that
   doesn't match the invoice is worse than no number.

   `points` and `note` are optional. Only claims that hold for any vet
   clinic are kept here. Add specifics (which vaccines, whether surgery
   is by appointment, grooming prices) once the clinic confirms them.

   One list, used by both the Services screen and the first-launch intro,
   so editing it here updates both. */
export type Service = {
  id: string;
  title: string;
  Icon: typeof Stethoscope;
  blurb: string;
  points?: string[];
  note?: string;
};

export const SERVICES: Service[] = [
  {
    id: '01',
    title: 'Veterinary Check-ups',
    Icon: Stethoscope,
    blurb:
      'For routine visits, and for the times something just seems off. The vet examines your pet, tells you what they found, and what to do next.',
    points: ['Tell us what you\u2019ve noticed at home: appetite, energy, stool'],
  },
  {
    id: '02',
    title: 'Vaccination & Deworming',
    Icon: Syringe,
    blurb:
      'Vaccines and deworming on schedule, so nothing gets missed. Puppies and kittens start young and need a few rounds, a few weeks apart.',
    points: ['Bring your pet\u2019s vaccine card so we can pick up where you left off'],
  },
  {
    id: '03',
    title: 'Minor & Major Surgeries',
    Icon: HeartPulse,
    blurb:
      'Minor and major procedures. Your pet is seen first, so you know what\u2019s involved before the day.',
  },
  {
    id: '04',
    title: 'Confinement & Emergency Care',
    Icon: ShieldAlert,
    blurb:
      'For pets that need to stay with us to be watched and treated, and for emergencies.',
    note: 'If it\u2019s urgent, call the clinic. Don\u2019t wait for an appointment.',
  },
  {
    id: '05',
    title: 'Grooming',
    Icon: Scissors,
    blurb:
      'Bath, blow-dry and haircut. Tell the groomer how you like it, or bring a photo.',
  },
];
