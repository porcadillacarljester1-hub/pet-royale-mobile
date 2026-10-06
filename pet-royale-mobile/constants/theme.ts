import { Dimensions } from "react-native";

const { width: WINDOW_WIDTH, height: WINDOW_HEIGHT } = Dimensions.get("window");

/* ── Responsive scale ────────────────────────────────────────────────
   Before: two tiers only — 1.0 on everything under 600 wide, 1.2 above.
   A small 360-wide phone and a large 430-wide phone got identical
   sizes, and nothing between phone and tablet was handled.

   Now: scale follows the screen width continuously, relative to the
   390-wide phone the screens were designed on, and is clamped so
   nothing gets tiny or huge:

     320 wide  → 0.90  (floor)
     360 wide  → 0.92
     390 wide  → 1.00  (design size, unchanged)
     430 wide  → 1.10
     768+ wide → 1.25  (cap, tablets and wide windows)

   Everything that already goes through sz() — the whole `text` scale,
   button and input heights in `common` — follows automatically.

   NOTE: this is read once when the app starts. On a real phone that is
   right (the width doesn't change). When testing in a browser, reload
   the page after switching device size; it won't resize live. */
const BASE_WIDTH = 390;
const MIN_SCALE = 0.9;
const MAX_SCALE = 1.25;

export const SCALE = Math.min(Math.max(WINDOW_WIDTH / BASE_WIDTH, MIN_SCALE), MAX_SCALE);
export const isTablet = WINDOW_WIDTH >= 600;
export const sz = (n: number) => Math.round(n * SCALE * 10) / 10;

/** Screen size at startup, for sizing things as a share of the screen
 *  (a hero image height, say) rather than a fixed number. */
export const screen = { width: WINDOW_WIDTH, height: WINDOW_HEIGHT } as const;

export const colors = {
  // ── Surfaces ── (same cream as the admin dashboard)
  background: "#F3EFE7",   // warm cream canvas
  card: "#FAF8F5",         // panels and cards
  cardBorder: "#E2DCD0",
  border: "#DED7CA",
  input: "#D8D0C0",

  // ── Text ──
  foreground: "#1D2735",   // navy-tinted near-black UI text
  mutedFg: "#5D7976",      // secondary text

  // ── Brand — the crest's navy and gold ──
  primary: "#051F42",      // crest navy — buttons, active states
  primaryDark: "#04162F",  // pressed state
  primaryFg: "#F6F5EE",    // text on navy
  secondary: "#CAE0AE",    // soft sage, same as the admin — icon tiles, selected states
  secondaryFg: "#1D2735",
  accent: "#DDAD31",       // crest gold — the one thing that matters
  accentFg: "#172436",     // text on gold

  muted: "#E7E3D9",        // inert fills, track backgrounds

  destructive: "#D6453D",
  destructiveBg: "#FCE8E6",
  destructiveFg: "#F8F6F2",

  white: "#FFFFFF",
  overlay: "rgba(29, 39, 53, 0.42)", // modal backdrop
} as const;

/**
 * Status tones. Each pairs a background with readable text.
 * Used for appointment status, payment status, stock level.
 * Deliberately NOT recoloured to navy/gold — these carry meaning
 * (completed vs cancelled vs pending) and match the admin's pills.
 */
export const status = {
  success:  { bg: "#D4EDDE", fg: "#286240" },  // completed, paid, in stock
  teal:     { bg: "#D6EBE9", fg: "#296660" },  // confirmed
  warning:  { bg: "#F1E6D0", fg: "#775B22" },  // pending, low stock, partial
  danger:   { bg: "#F8DCD3", fg: "#9B4427" },  // cancelled, overdue, out of stock
  info:     { bg: "#D7E2EA", fg: "#2F5A6F" },  // neutral informational
  neutral:  { bg: "#EBE7E0", fg: "#5D7976" },  // no data, not applicable
} as const;

export type StatusTone = keyof typeof status;

/**
 * DM Sans throughout. `display` and `displayRegular` used to be Fraunces
 * (a serif); they now point at DM Sans so every heading, big number and
 * date uses one typeface. The names are kept so no screen has to change.
 * To bring a serif back later, change just these two lines.
 */
export const fonts = {
  display: "DMSans_700Bold",
  displayRegular: "DMSans_400Regular",
  body: "DMSans_400Regular",
  bodyMedium: "DMSans_500Medium",
  bodyBold: "DMSans_700Bold",
} as const;

/**
 * Type scale. Named `text`, not `type` — `type` is a TypeScript keyword,
 * and importing a binding called `type` shadows it in the consuming file,
 * which resolves to undefined at runtime.
 *
 * Sizes are points, not pixels — RN scales them per device. They are
 * also multiplied by SCALE (see top of file), which follows the screen
 * width.
 */
export const text = {
  display: { fontFamily: fonts.display, fontSize: sz(30), letterSpacing: -0.6, lineHeight: sz(36) },
  /** Regular-weight accent text — used for small quiet lines under
   *  headings (e.g. "We care for you and your pets"). Added because
   *  screens referenced text.displayRegular.fontFamily directly. */
  displayRegular: { fontFamily: fonts.displayRegular, fontSize: sz(15), lineHeight: sz(22) },
  title:   { fontFamily: fonts.display, fontSize: sz(22), letterSpacing: -0.4, lineHeight: sz(28) },
  heading: { fontFamily: fonts.bodyBold, fontSize: sz(16), lineHeight: sz(21) },
  /** Section headings ("Pet Essentials", "Recent visits", "Paid invoices"). One style so every screen matches. */
  section: { fontFamily: fonts.bodyBold, fontSize: sz(18), lineHeight: sz(24) },
  body:    { fontFamily: fonts.body, fontSize: sz(15), lineHeight: sz(23) },
  bodyBold:{ fontFamily: fonts.bodyBold, fontSize: sz(15), lineHeight: sz(23) },
  small:   { fontFamily: fonts.body, fontSize: sz(13.5), lineHeight: sz(19) },
  smallBold:{ fontFamily: fonts.bodyBold, fontSize: sz(13.5), lineHeight: sz(19) },
  caption: { fontFamily: fonts.body, fontSize: sz(12), lineHeight: sz(17) },
  /** The uppercase tracked label above section headings.
   *  Was 10pt, which is hard to read on small phones; 11 is the
   *  practical minimum for tracked caps. */
  eyebrow: {
    fontFamily: fonts.bodyBold,
    fontSize: sz(11),
    letterSpacing: 1.6,
    textTransform: "uppercase" as const,
  },
} as const;

/** 4pt grid. */
export const space = {
  xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32,
} as const;

/**
 * The admin uses large radii — 24 to 28 on cards. Kept here so the two
 * read as the same product.
 */
export const radius = {
  sm: 8, md: 12, lg: 16, xl: 20, card: 18, pill: 999,
} as const;

/**
 * iOS reads shadow*, Android reads elevation — both are needed or the
 * card looks flat on one platform. Values approximate the admin's
 * `workspace-card` box-shadow, tinted navy like the admin's.
 */
export const shadow = {
  card: {
    shadowColor: "#051F42",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.06,
    shadowRadius: 14,
    elevation: 1,
  },
  raised: {
    shadowColor: "#051F42",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.14,
    shadowRadius: 24,
    elevation: 6,
  },
  /** For the navy primary button, so the shadow picks up its colour. */
  primary: {
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.26,
    shadowRadius: 16,
    elevation: 5,
  },
  /** For a gold button sitting on a dark background. */
  accent: {
    shadowColor: colors.accent,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.32,
    shadowRadius: 16,
    elevation: 5,
  },
} as const;

/**
 * Pieces repeated across most screens. Spread into a StyleSheet rather
 * than copied, so a change lands everywhere at once.
 *
 *   const styles = StyleSheet.create({
 *     card: { ...common.card, marginBottom: space.lg },
 *   });
 */
export const common = {
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: space.xl,
    ...shadow.card,
  },
  /** Full-width navy button. */
  buttonPrimary: {
    height: sz(52),
    borderRadius: radius.lg,
    backgroundColor: colors.primary,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    flexDirection: "row" as const,
    gap: space.sm,
  },
  buttonPrimaryText: {
    ...text.bodyBold,
    color: colors.primaryFg,
  },
  /** Add AFTER buttonPrimary (and after any shadow spread) when the
   *  button is disabled. Pale surface with muted text, about 3.7:1,
   *  instead of the cream label on a pale fill (about 1.3:1) that
   *  disappears. Shadow is cleared so it reads as flat and inactive. */
  buttonPrimaryDisabled: {
    backgroundColor: colors.muted,
    borderWidth: 1,
    borderColor: colors.border,
    shadowOpacity: 0,
    elevation: 0,
  },
  /** Label (and icon) colour to pair with buttonPrimaryDisabled. */
  buttonPrimaryTextDisabled: {
    color: colors.mutedFg,
  },
  /** Outlined button, for the secondary action beside a primary one. */
  buttonGhost: {
    height: sz(52),
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "transparent",
    alignItems: "center" as const,
    justifyContent: "center" as const,
    flexDirection: "row" as const,
    gap: space.sm,
  },
  buttonGhostText: {
    ...text.bodyBold,
    color: colors.foreground,
  },
  input: {
    height: sz(52),
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.input,
    backgroundColor: colors.white,
    paddingHorizontal: space.lg,
    ...text.body,
    color: colors.foreground,
  },
  inputError: {
    borderColor: colors.destructive,
  },
  label: {
    ...text.smallBold,
    color: colors.foreground,
    marginBottom: space.sm,
  },
  /** Small rounded status chip. Pair with a tone from `status`. */
  pill: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
    alignSelf: "flex-start" as const,
  },
  pillText: {
    fontFamily: fonts.bodyBold,
    fontSize: sz(11),
  },
  /** The 1px rule between list rows. */
  divider: {
    height: 1,
    backgroundColor: colors.border,
    opacity: 0.55,
  },
} as const;

/** Hit area for icon-only buttons. RN doesn't give these one by default,
 *  and a 16pt icon is well below the 44pt minimum people can reliably tap. */
export const hitSlop = { top: 10, bottom: 10, left: 10, right: 10 };

export default { colors, status, fonts, text, space, radius, shadow, common, hitSlop, sz, SCALE, isTablet, screen };