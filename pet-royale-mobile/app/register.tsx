import { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  StatusBar,
  KeyboardAvoidingView,
  ScrollView,
  Platform,
  Animated,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { supabase } from '../lib/supabase';
import {
  User,
  Mail,
  Lock,
  Eye,
  EyeOff,
  MailCheck,
  ArrowRight,
  ArrowLeft,
  Check,
} from 'lucide-react-native';
import {
  colors,
  status,
  text,
  fonts,
  space,
  radius,
  shadow,
  hitSlop,
} from '../constants/theme';
import { PhoneInput } from '../components/PhoneInput';
import { DEFAULT_ISO, getCountry, isValidMobile, toE164 } from '../lib/phone';

const TOTAL_STEPS = 4;
const PASSWORD_MAX = 72;
const RESEND_COOLDOWN = 60;

/* The clinic's own lettering, the same vector paths the admin's top bar
   draws — gold on navy. It's the whole brand presence on this screen:
   a form that asks for a name, email and phone number should read as
   calm and trustworthy, not decorative, so there's no crest circle and
   no second "Pet Royale" in the title. Needs react-native-svg, which
   lucide-react-native already depends on. */
const WORDMARK_PATH =
  "M801.2 67.4 L779.6 67.4 L765.2 67.0 L753.8 66.0 L749.6 66.2 L741.2 71.4 L731.8 78.2 L724.4 84.4 L720.0 88.8 L713.6 97.0 L708.2 106.4 L706.0 116.4 L706.2 126.8 L708.2 133.0 L712.6 139.8 L717.2 144.6 L721.6 148.0 L727.8 151.8 L740.4 157.4 L749.4 160.0 L758.2 161.6 L767.4 162.0 L770.2 161.4 L780.2 155.2 L784.8 153.0 L786.8 152.6 L795.4 147.8 L802.8 143.0 L806.2 139.8 L809.8 134.8 L815.4 123.8 L817.6 114.6 L818.0 105.2 L817.6 101.4 L816.2 95.8 L813.4 89.4 L807.8 82.6 L800.0 77.8 L798.6 76.4 L798.6 74.8 L802.0 68.8 L801.8 67.8Z M751.8 85.0 L754.6 84.8 L756.8 85.4 L766.4 89.6 L771.0 92.8 L775.6 97.8 L778.0 102.2 L779.8 107.4 L780.4 113.8 L780.0 128.0 L778.0 137.0 L776.8 138.2 L773.6 138.4 L770.8 137.2 L767.8 136.8 L763.4 135.0 L758.2 132.0 L752.0 126.4 L747.8 120.2 L745.0 111.4 L745.0 99.8 L747.8 90.2 L750.4 86.0Z M829.8 72.0 L828.6 73.4 L829.0 114.6 L830.4 136.0 L832.6 152.8 L833.4 153.8 L836.6 155.6 L846.0 157.8 L848.6 158.0 L850.2 157.6 L851.4 156.4 L852.4 153.2 L856.4 148.2 L867.8 135.8 L879.4 122.0 L881.8 119.6 L883.0 119.4 L883.6 120.0 L884.0 123.4 L883.4 130.8 L883.4 144.0 L884.0 159.0 L884.6 162.0 L885.4 175.4 L884.2 177.4 L882.0 177.8 L869.4 176.0 L857.4 173.6 L848.0 171.0 L842.8 168.6 L838.0 165.0 L835.6 164.4 L833.4 166.0 L825.8 175.2 L822.0 181.2 L822.0 183.6 L823.2 186.8 L827.6 195.8 L829.0 197.2 L840.8 203.4 L856.8 208.4 L861.6 209.0 L866.6 210.4 L879.0 212.2 L887.0 212.4 L890.6 209.8 L907.6 192.0 L915.4 181.2 L918.8 175.4 L920.8 170.2 L923.6 156.6 L926.8 128.0 L927.8 114.6 L928.6 111.0 L928.8 105.8 L930.4 96.8 L930.8 91.0 L931.8 87.6 L932.0 82.2 L933.4 76.2 L933.6 71.2 L932.8 70.2 L930.6 69.4 L917.8 69.0 L915.2 68.4 L901.2 67.8 L898.2 67.2 L893.0 67.4 L892.0 68.8 L887.4 87.2 L883.8 95.4 L875.0 110.2 L871.6 114.0 L870.8 114.0 L870.2 113.2 L870.0 108.2 L870.6 103.8 L871.0 90.2 L871.8 83.8 L872.0 74.2 L872.6 71.2 L872.2 66.6 L870.4 65.8 L862.2 68.0 L852.0 69.8Z M944.0 94.6 L940.4 102.6 L939.2 107.0 L938.2 114.8 L938.2 121.4 L939.0 135.4 L939.8 138.0 L940.0 143.2 L941.0 146.8 L941.4 151.8 L942.4 155.4 L944.2 157.0 L955.0 160.6 L961.6 162.2 L964.8 161.8 L983.2 145.2 L1003.0 126.0 L1004.2 126.2 L1005.0 127.8 L1005.0 141.2 L1003.6 161.8 L1004.4 163.2 L1007.0 163.4 L1014.0 161.2 L1018.8 160.6 L1033.0 156.8 L1041.2 155.6 L1043.4 154.4 L1043.8 153.0 L1043.2 144.0 L1043.8 120.0 L1043.4 99.2 L1042.2 93.2 L1040.0 87.0 L1036.2 81.0 L1030.8 76.6 L1025.2 73.6 L1011.6 70.2 L995.6 68.0 L981.6 65.2 L976.2 65.0 L974.2 65.8 L964.6 73.0 L955.8 80.6 L948.6 87.8Z M977.6 91.0 L988.2 93.4 L994.2 95.8 L1000.0 99.6 L1002.2 102.6 L1002.0 104.2 L1000.6 107.0 L994.6 115.4 L983.8 128.2 L980.0 131.4 L978.6 130.6 L978.0 129.2 L977.0 117.6 L976.8 105.6 L975.8 93.6 L976.6 91.6Z M1156.6 64.4 L1152.8 66.0 L1132.0 81.6 L1128.2 85.4 L1127.4 92.2 L1127.0 105.4 L1127.0 122.8 L1128.2 136.2 L1130.8 144.0 L1135.2 150.4 L1140.8 155.2 L1145.6 157.6 L1153.4 159.6 L1162.8 160.4 L1171.6 160.4 L1179.0 159.4 L1187.4 156.6 L1195.2 152.2 L1203.6 143.8 L1209.0 135.0 L1210.6 130.8 L1210.6 129.6 L1209.4 129.0 L1203.2 132.2 L1195.4 134.8 L1190.2 135.6 L1185.6 135.6 L1179.4 134.0 L1173.6 131.0 L1167.6 126.0 L1166.6 123.8 L1167.2 123.0 L1168.8 122.4 L1178.2 122.4 L1187.0 121.6 L1189.0 120.8 L1192.0 120.6 L1199.2 118.4 L1212.4 112.8 L1213.8 110.8 L1214.6 108.2 L1215.8 98.0 L1216.8 94.8 L1217.4 90.0 L1217.0 82.2 L1215.2 78.4 L1211.2 73.2 L1203.8 69.2 L1195.4 67.0 L1187.4 66.0Z M1165.6 86.6 L1169.8 86.2 L1174.8 88.0 L1178.4 90.0 L1182.2 94.0 L1183.8 96.8 L1184.8 101.6 L1184.8 110.0 L1183.8 111.6 L1180.8 112.4 L1163.6 112.6 L1162.2 111.4 L1162.0 107.0 L1163.8 95.6 L1164.0 89.4 L1164.6 87.6Z M265.4 64.4 L262.8 65.0 L261.0 66.0 L240.2 82.0 L236.4 85.6 L236.0 87.2 L235.2 110.2 L235.2 120.8 L236.2 134.8 L239.0 143.6 L241.0 147.2 L244.8 152.0 L250.8 156.2 L261.4 159.6 L270.4 160.4 L282.8 160.2 L292.6 157.8 L297.8 155.8 L307.0 149.0 L311.2 144.6 L315.0 139.2 L318.6 132.2 L319.0 129.2 L317.0 129.2 L309.0 133.4 L303.4 135.0 L297.8 135.6 L293.0 135.4 L288.6 134.4 L283.2 131.8 L278.6 128.6 L275.4 125.2 L275.0 123.6 L277.0 122.4 L291.6 122.0 L300.8 120.6 L315.0 115.6 L321.4 112.4 L322.6 110.4 L323.8 104.0 L324.0 98.8 L325.4 94.2 L326.0 88.4 L325.6 82.2 L323.2 77.6 L318.8 73.0 L315.2 70.4 L310.2 68.4 L299.0 66.2Z M273.8 86.8 L275.4 86.0 L276.8 86.0 L283.4 88.0 L286.0 89.4 L290.8 94.4 L292.4 97.6 L293.4 103.2 L293.2 109.8 L292.0 111.8 L290.8 112.2 L272.8 112.8 L271.0 111.8 L270.6 107.2 L271.4 103.4 L272.6 89.4Z M345.4 53.8 L343.6 55.0 L343.0 57.0 L342.6 71.8 L332.2 88.6 L332.2 89.8 L332.8 90.6 L340.0 90.6 L341.8 92.4 L341.2 103.2 L340.2 106.0 L340.0 112.8 L338.8 121.0 L338.8 129.2 L340.0 135.8 L345.4 145.0 L353.4 152.2 L364.6 158.0 L373.2 161.0 L378.0 161.8 L380.2 160.4 L384.8 153.8 L386.8 151.8 L398.0 135.6 L398.0 134.6 L397.0 133.4 L393.0 132.0 L385.8 128.2 L382.4 125.0 L379.4 120.6 L377.8 114.0 L378.2 90.4 L379.6 88.4 L381.0 87.8 L395.6 86.8 L400.2 85.6 L401.2 84.6 L403.6 75.8 L404.6 67.6 L403.8 66.2 L402.0 65.8 L383.8 66.0 L381.0 65.6 L379.8 63.8 L379.8 52.6 L379.4 51.6 L378.0 50.8Z M1104.4 16.4 L1098.4 17.2 L1089.8 19.6 L1068.8 24.2 L1065.6 25.2 L1064.4 27.4 L1063.0 104.0 L1062.0 119.6 L1062.0 127.6 L1063.4 136.6 L1064.6 141.2 L1066.2 144.6 L1069.0 149.2 L1073.6 154.4 L1076.8 157.0 L1082.4 160.0 L1092.8 163.6 L1094.8 163.6 L1098.0 161.2 L1108.8 149.8 L1115.8 143.8 L1118.6 140.4 L1118.6 139.6 L1117.6 138.2 L1106.2 132.2 L1101.2 129.0 L1099.8 127.2 L1099.8 115.2 L1100.8 107.2 L1101.4 90.0 L1103.4 64.0 L1103.8 50.0 L1105.0 39.4 L1105.4 26.0 L1106.0 21.6 L1105.8 17.8Z M1286.2 15.6 L1282.2 15.2 L1274.4 15.8 L1271.8 16.4 L1269.4 18.2 L1267.0 23.0 L1260.4 33.4 L1255.6 42.4 L1244.6 60.8 L1242.8 64.6 L1243.2 66.2 L1249.4 66.2 L1251.2 65.6 L1259.4 55.0 L1268.0 42.2 L1281.6 24.4 L1286.4 16.8Z M715.4 42.2 L710.6 35.8 L706.4 31.4 L698.8 25.6 L692.2 22.0 L682.4 17.6 L670.8 14.2 L659.0 12.2 L640.8 12.2 L629.6 13.2 L613.8 15.6 L610.2 16.8 L605.0 17.4 L593.2 20.4 L576.4 25.6 L565.0 30.2 L549.2 38.2 L545.8 40.6 L542.8 41.8 L532.0 48.6 L528.8 52.0 L515.2 73.4 L513.6 76.6 L513.8 78.0 L517.6 76.8 L524.4 73.0 L542.0 65.0 L564.6 57.0 L567.8 56.6 L577.4 53.8 L596.8 50.2 L613.2 49.2 L621.0 49.6 L622.0 50.4 L622.2 51.8 L619.8 56.2 L612.4 65.6 L605.4 76.2 L579.2 112.2 L547.4 151.8 L535.4 164.6 L533.2 165.6 L531.6 165.2 L513.2 156.8 L506.8 153.4 L502.4 151.8 L501.0 151.8 L498.6 154.0 L488.0 171.4 L485.6 176.2 L485.8 178.4 L497.2 188.6 L503.8 192.8 L510.0 194.8 L515.8 194.8 L518.8 194.2 L523.2 192.6 L530.8 187.8 L533.2 185.4 L535.4 184.0 L542.4 177.4 L552.6 166.6 L556.0 161.8 L558.8 159.2 L560.6 158.8 L567.6 163.2 L580.6 173.0 L587.0 177.2 L607.0 192.6 L614.4 197.6 L637.0 215.4 L638.4 215.4 L639.2 214.6 L642.2 208.4 L644.0 202.6 L645.8 199.6 L654.2 178.8 L654.4 174.8 L651.4 170.8 L645.4 165.0 L632.0 154.2 L619.0 145.0 L602.2 135.2 L601.0 133.4 L602.0 132.4 L623.6 128.4 L642.4 123.8 L663.0 116.4 L678.2 109.2 L692.4 100.8 L699.2 96.0 L707.8 87.8 L711.4 82.8 L715.4 76.0 L718.8 67.6 L720.0 63.2 L720.4 55.2 L718.6 48.8Z M672.2 70.6 L673.0 72.6 L672.8 74.2 L666.6 80.6 L651.8 93.2 L634.8 105.2 L627.6 109.4 L612.8 116.0 L596.2 120.6 L593.4 120.8 L592.2 120.0 L592.6 118.0 L596.0 113.6 L605.6 103.4 L612.6 95.0 L632.0 74.0 L644.8 61.0 L651.0 55.4 L652.2 54.8 L654.2 55.0 L661.4 59.0 L668.0 64.8Z M218.2 20.2 L215.0 17.4 L207.2 13.4 L203.4 12.0 L200.0 11.8 L197.6 12.0 L192.8 13.6 L176.8 21.0 L156.6 33.4 L139.0 47.2 L128.0 57.4 L116.8 69.8 L106.6 83.0 L102.2 87.8 L101.6 87.4 L101.4 86.4 L103.4 78.8 L123.0 20.6 L124.2 16.0 L123.8 14.0 L121.8 13.6 L117.6 14.4 L93.4 22.0 L90.6 23.4 L84.4 25.2 L78.8 27.8 L74.0 29.2 L32.0 45.4 L28.6 47.2 L27.0 49.8 L23.0 63.0 L21.6 66.2 L21.4 68.6 L22.2 69.6 L26.6 69.2 L39.4 65.2 L42.8 64.6 L50.0 62.0 L59.6 59.6 L66.4 57.2 L70.4 56.8 L71.4 57.6 L71.6 58.6 L65.0 71.0 L52.4 98.6 L51.4 102.2 L49.4 105.6 L39.4 131.8 L36.4 138.0 L31.6 152.8 L25.2 169.2 L17.4 194.0 L14.2 206.4 L13.4 210.8 L13.4 215.6 L14.4 216.4 L16.2 216.2 L67.4 198.4 L69.4 195.8 L76.0 178.6 L84.0 161.6 L88.0 154.8 L92.2 146.2 L99.0 136.0 L100.2 133.0 L105.4 124.4 L117.8 105.4 L128.6 89.8 L131.2 87.0 L132.0 85.2 L140.4 73.2 L156.4 52.4 L161.4 46.6 L162.4 46.6 L163.8 47.8 L169.6 56.8 L175.6 70.0 L179.4 82.0 L180.0 87.4 L181.2 90.6 L183.2 105.2 L183.6 124.4 L183.0 127.2 L181.6 128.4 L180.4 128.4 L171.4 126.2 L144.0 121.2 L137.0 121.2 L133.2 125.6 L116.4 148.4 L114.8 151.2 L114.8 152.4 L116.6 154.0 L126.4 157.6 L140.0 168.2 L148.6 172.0 L152.2 172.8 L162.2 173.0 L165.8 171.4 L179.0 160.4 L189.6 150.6 L204.0 136.0 L211.0 127.6 L216.2 120.2 L222.4 107.8 L227.6 91.6 L229.6 80.0 L229.8 74.4 L230.6 69.4 L230.8 57.4 L230.0 49.8 L227.4 38.6 L223.6 29.4Z";

function BrandWordmark({ height, color }: { height: number; color: string }) {
  return (
    <Svg
      width={(height * 1300) / 230}
      height={height}
      viewBox="0 0 1300 230"
      accessibilityRole="image"
      accessibilityLabel="Pet Royale"
    >
      <Path d={WORDMARK_PATH} fill={color} fillRule="evenodd" />
    </Svg>
  );
}

/* Primary at 12% opacity would be invisible on the navy header, so the
   back button uses the cream text colour instead. */
const HEADER_CHIP = 'rgba(246, 245, 238, 0.12)';

/* A symbol is an ASCII punctuation character. The old test (anything
   that isn't a letter, digit or space) counted accented letters like é
   and ñ as symbols, so "Pañuelo1234" passed without a real symbol. */
const SYMBOL_RE = /[!-\/:-@\[-`{-~]/;

/* Checked live as the person types, and again at submit. 12 to 72
   characters with an uppercase letter, a lowercase letter, a number and
   a symbol. A space is not a symbol, and the 72 limit is the most the
   auth system actually uses — anything past it is silently ignored. */
const PASSWORD_RULES: { id: string; label: string; test: (v: string) => boolean }[] = [
  { id: 'length', label: 'At least 12 characters', test: (v) => v.length >= 12 && v.length <= PASSWORD_MAX },
  { id: 'upper', label: 'One uppercase letter', test: (v) => /[A-Z]/.test(v) },
  { id: 'lower', label: 'One lowercase letter', test: (v) => /[a-z]/.test(v) },
  { id: 'number', label: 'One number', test: (v) => /[0-9]/.test(v) },
  { id: 'special', label: 'One symbol, like ! or @', test: (v) => SYMBOL_RE.test(v) },
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/* A name: at least 2 characters, at least one of them a letter, and no
   digits or symbols. Hyphens, apostrophes, periods and spaces are fine
   (Anne-Marie, O'Brien, Jr.). Letters of any script pass. */
const NAME_BAD_RE = /[0-9_!@#$%^&*()+=\[\]{}<>\/\\|~`?,;:"]/;
const NAME_HAS_LETTER_RE = /[^\s0-9.'\u2019-]/;

function isValidName(value: string): boolean {
  const v = value.trim();
  return v.length >= 2 && !NAME_BAD_RE.test(v) && NAME_HAS_LETTER_RE.test(v);
}

const tidy = (value: string) => value.trim().replace(/\s+/g, ' ');

const STEP_HELP = [
  'The name you\u2019d like the clinic to see on your appointments.',
  'We\u2019ll send a confirmation link here, and you\u2019ll sign in with this address.',
  'A mobile number, so the clinic can reach you about your appointments.',
  'You\u2019ll sign in with this. Use one you don\u2019t use anywhere else.',
];

function ProgressBar({ step }: { step: number }) {
  return (
    <View
      style={styles.progressRow}
      accessibilityRole="progressbar"
      accessibilityLabel={`Step ${step + 1} of ${TOTAL_STEPS}`}
    >
      {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
        <View
          key={i}
          style={[
            styles.progressSegment,
            i < step && styles.progressDone,
            i === step && styles.progressCurrent,
          ]}
        />
      ))}
    </View>
  );
}

export default function RegisterScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState(0);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [countryIso, setCountryIso] = useState(DEFAULT_ISO);
  const [national, setNational] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [checkEmail, setCheckEmail] = useState(false);
  const [fieldFocused, setFieldFocused] = useState(false);

  /* Check-your-email screen: resend with a cooldown, so the button can't
     be hammered (Supabase also rate-limits auth emails). */
  const [cooldown, setCooldown] = useState(0);
  const [isResending, setIsResending] = useState(false);
  const [resendNote, setResendNote] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  /* Only one step is ever on screen at a time, so a single ref covers
     whichever field is currently the main one. The last-name field
     has its own, so Enter on first name can move to it. */
  const inputRef = useRef<TextInput>(null);
  const lastNameRef = useRef<TextInput>(null);

  const country = getCountry(countryIso);

  /* ── Entrance, replayed on every step change ──
     useState with a lazy initializer keeps each Animated.Value stable
     across renders without reading a ref during render (which the
     React Compiler lint rule flags). */
  const [fadeIn] = useState(() => new Animated.Value(0));
  const [slideIn] = useState(() => new Animated.Value(16));
  const [errorShake] = useState(() => new Animated.Value(0));
  const [btnScale] = useState(() => new Animated.Value(1));

  useEffect(() => {
    fadeIn.setValue(0);
    slideIn.setValue(16);
    Animated.parallel([
      Animated.timing(fadeIn, { toValue: 1, duration: 300, useNativeDriver: true }),
      Animated.timing(slideIn, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start();
  }, [step, fadeIn, slideIn]);

  /* Focus the field on every step. The delay roughly clears the step's
     own entrance animation so focus doesn't fight it. */
  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), step === 0 ? 500 : 260);
    return () => clearTimeout(t);
  }, [step]);

  /* Counts the resend cooldown down one second at a time. */
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const shake = () => {
    errorShake.setValue(0);
    Animated.sequence([
      Animated.timing(errorShake, { toValue: 1, duration: 55, useNativeDriver: true }),
      Animated.timing(errorShake, { toValue: -1, duration: 55, useNativeDriver: true }),
      Animated.timing(errorShake, { toValue: 1, duration: 55, useNativeDriver: true }),
      Animated.timing(errorShake, { toValue: 0, duration: 55, useNativeDriver: true }),
    ]).start();
  };

  const pressIn = () =>
    Animated.spring(btnScale, { toValue: 0.97, useNativeDriver: true, speed: 40 }).start();
  const pressOut = () =>
    Animated.spring(btnScale, { toValue: 1, useNativeDriver: true, speed: 20 }).start();

  const clear =
    (setter: (value: string) => void) =>
    (value: string) => {
      setter(value);
      if (error) setError('');
    };

  /* Last name is optional, but if it's filled in it must look like a name. */
  const namesOk = isValidName(firstName) && (lastName.trim() === '' || isValidName(lastName));
  const phoneOk = isValidMobile(country, national);

  /* Whether the field on the CURRENT step is fillable — gates the
     Next / Create account button. */
  const stepValid = [
    namesOk,
    EMAIL_RE.test(email.trim()),
    phoneOk,
    PASSWORD_RULES.every((rule) => rule.test(password)),
  ][step];

  /* Said only once the person has typed something and left the field —
     nagging while they're still typing is worse than saying nothing. */
  let hint = '';
  if (!fieldFocused) {
    if (step === 0 && (firstName.trim() !== '' || lastName.trim() !== '') && !namesOk) {
      hint = 'Use at least 2 letters, with no numbers or symbols.';
    } else if (step === 1 && email.length > 0 && !EMAIL_RE.test(email.trim())) {
      hint = 'Enter a valid email address.';
    } else if (step === 2 && national.length > 0 && !phoneOk) {
      hint = `Enter a valid mobile number for ${country.name}.`;
    }
  }

  const goBack = () => {
    if (step === 0) {
      if (router.canGoBack()) router.back();
      else router.replace('/' as any);
      return;
    }
    setError('');
    setStep((s) => s - 1);
  };

  const goNext = () => {
    if (!stepValid || isLoading) return;
    if (step < TOTAL_STEPS - 1) {
      setError('');
      setStep((s) => s + 1);
    } else {
      handleRegister();
    }
  };

  /* ─────────────────────────────────────────────
     Registration
  ───────────────────────────────────────────── */
  const handleRegister = async () => {
    const first = tidy(firstName);
    const last = tidy(lastName);
    // Defense in depth — stepValid already blocks reaching this with
    // anything missing, but a real signup shouldn't rely solely on a
    // button's disabled state having stayed in sync.
    if (!isValidName(first) || (last && !isValidName(last)) || !email.trim() || !phoneOk || !password) {
      setError('Please fill in all fields.');
      shake();
      return;
    }
    if (!PASSWORD_RULES.every((rule) => rule.test(password))) {
      setError('Password does not meet the requirements below.');
      shake();
      return;
    }
    setIsLoading(true);
    setError('');
    const { data, error: signUpError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: {
          full_name: [first, last].filter(Boolean).join(' '),
          first_name: first,
          last_name: last,
          phone: toE164(country, national),
        },
      },
    });
    setIsLoading(false);
    if (signUpError) {
      setError(
        signUpError.message.toLowerCase().includes('already registered')
          ? 'An account already exists for that email. Try signing in instead.'
          : signUpError.message
      );
      shake();
      return;
    }
    /* With email confirmation on, Supabase does not return an error for
       an address that is already registered (that would reveal which
       emails have accounts). It returns a user with no identities and
       no session. Without this check that case fell through to "Check
       your email" for a message that was never sent. */
    if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
      setError('An account already exists for that email. Try signing in instead.');
      shake();
      return;
    }
    if (data.session) {
      // signUp() hands back an active session immediately whenever this
      // Supabase project has email confirmation turned off — left as
      // it was, that sent every new account straight into Home instead
      // of sign-in. Signing back out here is what makes registration
      // land on sign-in either way, matching the checkEmail path below
      // for projects where confirmation IS required.
      await supabase.auth.signOut();
      router.replace('/signin' as any);
    } else {
      setResendNote(null);
      setCooldown(RESEND_COOLDOWN);
      setCheckEmail(true);
    }
  };

  /* ─────────────────────────────────────────────
     Check-your-email actions
  ───────────────────────────────────────────── */
  const handleResend = async () => {
    if (cooldown > 0 || isResending) return;
    setIsResending(true);
    setResendNote(null);
    const { error: resendError } = await supabase.auth.resend({
      type: 'signup',
      email: email.trim(),
    });
    setIsResending(false);
    if (resendError) {
      setResendNote({ tone: 'error', text: resendError.message });
      return;
    }
    setCooldown(RESEND_COOLDOWN);
    setResendNote({
      tone: 'ok',
      text: 'Sent again. It can take a minute to arrive, so check your spam folder too.',
    });
  };

  /* Wrong address? Back to the email step with everything else kept, so
     it's one edit and Create account. The mistyped address's account
     stays unconfirmed and unused. */
  const handleChangeEmail = () => {
    setResendNote(null);
    setError('');
    setCheckEmail(false);
    setStep(1);
  };

  /* ─────────────────────────────────────────────
     Confirmation screen
  ───────────────────────────────────────────── */
  if (checkEmail) {
    return (
      <View style={styles.confirmContainer}>
        <StatusBar barStyle="dark-content" backgroundColor={colors.background} />
        <View style={styles.confirmWrap}>
          <View style={styles.confirmIcon}>
            <MailCheck size={30} color={colors.primary} />
          </View>
          <Text style={styles.confirmTitle}>Check your email</Text>
          <Text style={styles.confirmBody}>
            We&apos;ve sent a confirmation link to{' '}
            <Text style={styles.confirmEmail}>{email.trim()}</Text>
            . Open it to activate your account, then come back and sign in.
          </Text>
          <TouchableOpacity
            style={styles.confirmBtn}
            onPress={() => router.replace('/signin' as any)}
            activeOpacity={0.9}
            accessibilityRole="button"
            accessibilityLabel="Go to sign in"
          >
            <Text style={styles.confirmBtnLabel}>Go to sign in</Text>
            <ArrowRight size={18} color={colors.primaryFg} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.confirmLink}
            onPress={handleResend}
            disabled={cooldown > 0 || isResending}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityState={{ disabled: cooldown > 0 || isResending }}
          >
            {isResending ? (
              <ActivityIndicator color={colors.primary} />
            ) : (
              <Text style={[styles.confirmLinkLabel, cooldown > 0 && styles.confirmLinkLabelOff]}>
                {cooldown > 0 ? `Resend email in ${cooldown}s` : 'Resend email'}
              </Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.confirmLink}
            onPress={handleChangeEmail}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Use a different email address"
          >
            <Text style={styles.confirmLinkLabel}>Use a different email</Text>
          </TouchableOpacity>

          {resendNote ? (
            <Text
              style={[styles.confirmNote, resendNote.tone === 'error' && styles.confirmNoteError]}
              accessibilityLiveRegion="polite"
            >
              {resendNote.text}
            </Text>
          ) : null}
        </View>
      </View>
    );
  }

  const prompts = [
    'What should we call you?',
    'What\u2019s your email?',
    'Best number to reach you?',
    'Set a password',
  ];

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
      {/* 'padding' on iOS, 'height' on Android. With 'undefined' on
          Android the keyboard could cover the button. If the screen
          jumps too high on a device where the window already resizes
          for the keyboard, set the Android value back to undefined. */}
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          bounces={false}
          overScrollMode="never"
        >
          {/* ── Header: the same navy bar and gold wordmark as the admin ── */}
          <View style={[styles.header, { paddingTop: insets.top + space.md }]}>
            <View style={styles.headerRow}>
              <TouchableOpacity
                style={styles.backBtn}
                onPress={goBack}
                activeOpacity={0.75}
                hitSlop={hitSlop}
                accessibilityRole="button"
                accessibilityLabel="Go back"
              >
                <ArrowLeft size={20} color={colors.primaryFg} />
              </TouchableOpacity>
              <BrandWordmark height={26} color={colors.accent} />
              <View style={styles.headerSpacer} />
            </View>
          </View>

          {/* ── Sheet ── */}
          <View style={styles.sheet}>
            <Text style={styles.stepLabel}>{`Step ${step + 1} of ${TOTAL_STEPS}`}</Text>
            <ProgressBar step={step} />

            <Animated.View
              style={[
                styles.stepContent,
                { opacity: fadeIn, transform: [{ translateY: slideIn }] },
              ]}
            >
              <Text style={styles.stepPrompt}>{prompts[step]}</Text>
              <Text style={styles.stepHelp}>{STEP_HELP[step]}</Text>

              {step === 0 && (
                <>
                  <View style={[styles.inputRow, fieldFocused && styles.inputRowFocused]}>
                    <User size={18} color={colors.mutedFg} strokeWidth={2} />
                    <TextInput
                      ref={inputRef}
                      style={styles.input}
                      placeholder="First name"
                      placeholderTextColor={colors.mutedFg}
                      value={firstName}
                      onChangeText={clear(setFirstName)}
                      onFocus={() => setFieldFocused(true)}
                      onBlur={() => setFieldFocused(false)}
                      autoCapitalize="words"
                      autoComplete="name-given"
                      textContentType="givenName"
                      returnKeyType="next"
                      onSubmitEditing={() => lastNameRef.current?.focus()}
                      blurOnSubmit={false}
                    />
                  </View>
                  <View style={[styles.inputRow, styles.inputRowSpaced, fieldFocused && styles.inputRowFocused]}>
                    <User size={18} color={colors.mutedFg} strokeWidth={2} />
                    <TextInput
                      ref={lastNameRef}
                      style={styles.input}
                      placeholder="Last name (optional)"
                      placeholderTextColor={colors.mutedFg}
                      value={lastName}
                      onChangeText={clear(setLastName)}
                      onFocus={() => setFieldFocused(true)}
                      onBlur={() => setFieldFocused(false)}
                      autoCapitalize="words"
                      autoComplete="name-family"
                      textContentType="familyName"
                      returnKeyType="next"
                      onSubmitEditing={goNext}
                    />
                  </View>
                </>
              )}

              {step === 1 && (
                <View style={[styles.inputRow, fieldFocused && styles.inputRowFocused]}>
                  <Mail size={18} color={colors.mutedFg} strokeWidth={2} />
                  <TextInput
                    ref={inputRef}
                    style={styles.input}
                    placeholder="you@example.com"
                    placeholderTextColor={colors.mutedFg}
                    value={email}
                    onChangeText={clear(setEmail)}
                    onFocus={() => setFieldFocused(true)}
                    onBlur={() => setFieldFocused(false)}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoComplete="email"
                    textContentType="emailAddress"
                    returnKeyType="next"
                    onSubmitEditing={goNext}
                  />
                </View>
              )}

              {step === 2 && (
                <PhoneInput
                  iso={countryIso}
                  national={national}
                  onChangeIso={(iso) => {
                    setCountryIso(iso);
                    if (error) setError('');
                  }}
                  onChangeNational={(digits) => {
                    setNational(digits);
                    if (error) setError('');
                  }}
                  inputRef={inputRef}
                  onFocus={() => setFieldFocused(true)}
                  onBlur={() => setFieldFocused(false)}
                  onSubmitEditing={goNext}
                />
              )}

              {step === 3 && (
                <>
                  <View style={[styles.inputRow, fieldFocused && styles.inputRowFocused]}>
                    <Lock size={18} color={colors.mutedFg} strokeWidth={2} />
                    <TextInput
                      ref={inputRef}
                      style={styles.input}
                      placeholder="At least 12 characters"
                      placeholderTextColor={colors.mutedFg}
                      value={password}
                      onChangeText={clear(setPassword)}
                      onFocus={() => setFieldFocused(true)}
                      onBlur={() => setFieldFocused(false)}
                      secureTextEntry={!showPassword}
                      maxLength={PASSWORD_MAX}
                      autoComplete="new-password"
                      textContentType="newPassword"
                      returnKeyType="go"
                      onSubmitEditing={goNext}
                    />
                    <TouchableOpacity
                      onPress={() => setShowPassword((value) => !value)}
                      activeOpacity={0.7}
                      hitSlop={hitSlop}
                      accessibilityRole="button"
                      accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? (
                        <EyeOff size={18} color={colors.mutedFg} />
                      ) : (
                        <Eye size={18} color={colors.mutedFg} />
                      )}
                    </TouchableOpacity>
                  </View>
                  <View style={styles.passwordRules}>
                    {PASSWORD_RULES.map((rule) => {
                      const met = rule.test(password);
                      return (
                        <View key={rule.id} style={styles.passwordRuleRow}>
                          {met ? (
                            <Check size={13} color={status.success.fg} strokeWidth={3} />
                          ) : (
                            <View style={styles.passwordRuleDot} />
                          )}
                          <Text style={[styles.passwordRuleText, met && styles.passwordRuleTextOn]}>
                            {rule.label}
                          </Text>
                        </View>
                      );
                    })}
                  </View>
                </>
              )}

              {/* A fixed-height slot, so a hint appearing doesn't push the
                  button down under someone's thumb. */}
              <View style={styles.hintSlot}>
                {hint ? (
                  <Text style={styles.hintText} accessibilityLiveRegion="polite">
                    {hint}
                  </Text>
                ) : null}
              </View>
            </Animated.View>

            {error ? (
              <Animated.View
                accessibilityRole="alert"
                accessibilityLiveRegion="polite"
                style={[
                  styles.errorBox,
                  {
                    transform: [
                      {
                        translateX: errorShake.interpolate({
                          inputRange: [-1, 1],
                          outputRange: [-6, 6],
                        }),
                      },
                    ],
                  },
                ]}
              >
                <Text style={styles.errorText}>{error}</Text>
              </Animated.View>
            ) : null}

            <Animated.View style={{ transform: [{ scale: btnScale }] }}>
              <TouchableOpacity
                style={[
                  styles.btnPrimary,
                  !stepValid && styles.btnPrimaryDisabled,
                  isLoading && styles.btnPrimaryLoading,
                ]}
                onPress={goNext}
                onPressIn={pressIn}
                onPressOut={pressOut}
                disabled={!stepValid || isLoading}
                activeOpacity={0.9}
                accessibilityRole="button"
                accessibilityLabel={step < TOTAL_STEPS - 1 ? 'Next' : 'Create account'}
              >
                {isLoading ? (
                  <ActivityIndicator color={colors.primaryFg} />
                ) : (
                  <Text style={[styles.btnPrimaryLabel, !stepValid && styles.btnPrimaryLabelDisabled]}>
                    {step < TOTAL_STEPS - 1 ? 'Next' : 'Create account'}
                  </Text>
                )}
              </TouchableOpacity>
            </Animated.View>

            {step === 0 && (
              <TouchableOpacity
                style={styles.linkRow}
                onPress={() => router.replace('/signin' as any)}
                activeOpacity={0.7}
                accessibilityRole="link"
                accessibilityLabel="Already have an account? Sign in"
              >
                <Text style={styles.linkText}>Already have an account? </Text>
                <Text style={styles.linkHighlight}>Sign in</Text>
              </TouchableOpacity>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.primary },
  flex: { flex: 1 },
  scrollContent: { flexGrow: 1 },

  header: {
    backgroundColor: colors.primary,
    paddingHorizontal: space.xl,
    // The sheet slides up over the bottom radius.card of this, so the
    // padding is that plus the space actually left showing.
    paddingBottom: space.xl + radius.card,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: HEADER_CHIP,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Same width as the back button, so the wordmark sits truly centred.
  headerSpacer: { width: 36 },

  sheet: {
    flex: 1,
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.card,
    borderTopRightRadius: radius.card,
    marginTop: -radius.card,
    paddingTop: space.xxl,
    paddingBottom: space.xxxl,
    paddingHorizontal: space.xxl,
  },

  stepLabel: {
    ...text.eyebrow,
    color: colors.mutedFg,
    marginBottom: space.sm,
  },
  progressRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: space.xxl,
  },
  progressSegment: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.muted,
  },
  // Steps behind you are navy; the one you're on is gold — the same
  // "you are here" the admin's active tab underline uses.
  progressDone: { backgroundColor: colors.primary },
  progressCurrent: { backgroundColor: colors.accent },

  // No flex: 1 here. The sheet fills the screen, so a flexing step
  // would stretch to fill it and push the button to the very bottom,
  // far from the field and against the keyboard.
  stepContent: {},
  stepPrompt: {
    fontFamily: fonts.display,
    fontSize: 22,
    letterSpacing: -0.5,
    color: colors.foreground,
  },
  stepHelp: {
    ...text.small,
    color: colors.mutedFg,
    marginTop: space.sm,
    marginBottom: space.xl,
  },

  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: 54,
    backgroundColor: colors.muted,
    borderRadius: radius.pill,
    paddingHorizontal: space.lg,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  inputRowSpaced: { marginTop: space.md },
  inputRowFocused: {
    borderColor: colors.primary,
    backgroundColor: colors.card,
  },
  input: {
    flex: 1,
    ...text.body,
    color: colors.foreground,
    padding: 0,
  },

  hintSlot: {
    minHeight: 22,
    marginTop: space.sm,
    paddingHorizontal: space.sm,
  },
  hintText: { ...text.small, color: colors.destructive },

  passwordRules: {
    marginTop: space.xl,
    paddingHorizontal: space.sm,
    gap: 7,
  },
  passwordRuleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  passwordRuleDot: {
    width: 13,
    height: 13,
    borderRadius: 7,
    borderWidth: 1.5,
    borderColor: colors.mutedFg,
  },
  passwordRuleText: {
    ...text.caption,
    color: colors.mutedFg,
  },
  passwordRuleTextOn: {
    color: colors.foreground,
  },

  errorBox: {
    marginTop: space.lg,
    borderWidth: 1,
    borderColor: colors.destructive,
    backgroundColor: colors.destructiveBg,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderRadius: radius.md,
  },
  errorText: {
    ...text.small,
    color: colors.destructive,
  },

  btnPrimary: {
    minHeight: 54,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: space.lg,
    ...shadow.primary,
  },
  btnPrimaryDisabled: {
    backgroundColor: colors.muted,
    shadowOpacity: 0,
    elevation: 0,
  },
  btnPrimaryLoading: {
    backgroundColor: colors.primaryDark,
  },
  btnPrimaryLabel: {
    ...text.bodyBold,
    color: colors.primaryFg,
  },
  // Cream on the muted fill is 1.17:1 — the label vanished. This is the
  // muted-foreground colour instead.
  btnPrimaryLabelDisabled: {
    color: colors.mutedFg,
  },

  linkRow: {
  flexDirection: 'row',
  flexWrap: 'wrap',
  alignItems: 'center',
  justifyContent: 'center',
  paddingHorizontal: space.lg,
  marginTop: space.xl,
  },
  linkText: { ...text.body, color: colors.mutedFg },
  linkHighlight: { ...text.bodyBold, color: colors.primary },

  /* Confirmation screen */
  confirmContainer: {
    flex: 1,
    backgroundColor: colors.background,
  },
  confirmWrap: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: space.xxl,
  },
  confirmIcon: {
    width: 64,
    height: 64,
    borderRadius: 22,
    backgroundColor: colors.secondary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.xxl,
  },
  confirmTitle: {
    fontFamily: fonts.display,
    fontSize: 34,
    lineHeight: 38,
    letterSpacing: -1.3,
    color: colors.foreground,
  },
  confirmBody: {
    ...text.body,
    color: colors.mutedFg,
    marginTop: space.lg,
  },
  confirmEmail: {
    ...text.bodyBold,
    color: colors.foreground,
  },
  confirmBtn: {
    minHeight: 54,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    marginTop: space.xxxl,
    ...shadow.primary,
  },
  confirmBtnLabel: {
    ...text.bodyBold,
    color: colors.primaryFg,
  },
  confirmLink: {
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: space.sm,
  },
  confirmLinkLabel: {
    ...text.bodyBold,
    color: colors.primary,
  },
  confirmLinkLabelOff: {
    color: colors.mutedFg,
  },
  confirmNote: {
    ...text.small,
    color: colors.mutedFg,
    textAlign: 'center',
    marginTop: space.sm,
  },
  confirmNoteError: {
    color: colors.destructive,
  },
});