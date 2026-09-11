/**
 * Pet Royale — theme
 *
 * The same design as the admin system, expressed for React Native.
 *
 * The admin uses CSS variables (`hsl(var(--primary))`), which don't
 * exist here — these are the identical colours converted to hex. If a
 * colour changes on one side, change it on the other or the two drift.
 *
 * Fonts need installing:
 *   npx expo install @expo-google-fonts/fraunces @expo-google-fonts/dm-sans
 */
export const colors = {
  // ── Surfaces ──
  background: "#F3EFE7",   // warm cream page background
  card: "#FAF8F5",         // panels and cards
  cardBorder: "#E2DCD0",
  border: "#DED7CA",
  input: "#D8D0C0",

  // ── Text ──
  foreground: "#1D3937",   // near-black with a green cast
  mutedFg: "#5D7976",      // secondary text

  // ── Brand ──
  primary: "#2D716A",      // deep teal — buttons, active states
  primaryDark: "#245B57",  // pressed state
  primaryFg: "#F8F6F2",    // text on teal
  secondary: "#CAE0AE",    // sage — tints, avatars, soft buttons
  secondaryFg: "#1D3937",
  accent: "#E89073",       // coral — sparingly, for the one thing that matters
  accentFg: "#1D3937",

  muted: "#E7E3D9",        // inert fills, track backgrounds

  destructive: "#D6453D",
  destructiveFg: "#F8F6F2",

  white: "#FFFFFF",
  overlay: "rgba(29, 57, 55, 0.42)", // modal backdrop
} as const;

/**
 * Status tones. Each pairs a background with readable text.
 * Used for appointment status, payment status, stock level.
 */
export const status = {
  success:  { bg: "#D4EDDE", fg: "#286240" },  // completed, paid, in stock
  teal:     { bg: "#D6EBE9", fg: "#296660" },  // confirmed
  warning:  { bg: "#F1E6D0", fg: "#775B22" },  // pending, low stock, partial
  danger:   { bg: "#F8DCD3", fg: "#9B4427" },  // cancelled, overdue, out of stock
  info:     { bg: "#D7E3EA", fg: "#2F5A6F" },  // neutral informational
  neutral:  { bg: "#E7E3D9", fg: "#5D7976" },  // no data, not applicable
} as const;

export type StatusTone = keyof typeof status;

/**
 * Fraunces on headings, DM Sans on everything else. The serif against
 * the sans is what gives the design its character — losing it makes the
 * app look like a different product from the admin system.
 */
export const fonts = {
  display: "Fraunces_600SemiBold",
  displayRegular: "Fraunces_400Regular",
  body: "DMSans_400Regular",
  bodyMedium: "DMSans_500Medium",
  bodyBold: "DMSans_700Bold",
} as const;

/**
 * Type scale. Named `text`, not `type` — `type` is a TypeScript keyword,
 * and importing a binding called `type` shadows it in the consuming file,
 * which resolves to undefined at runtime.
 *
 * Sizes are points, not pixels — RN scales them per device.
 */
export const text = {
  display: { fontFamily: fonts.display, fontSize: 30, letterSpacing: -1.1, lineHeight: 34 },
  /** Regular-weight serif — used for small italic/quiet accents under
   *  headings (e.g. "We care for you and your pets"). Added because
   *  screens referenced text.displayRegular.fontFamily directly. */
  displayRegular: { fontFamily: fonts.displayRegular, fontSize: 15, lineHeight: 22 },
  title:   { fontFamily: fonts.display, fontSize: 22, letterSpacing: -0.8, lineHeight: 27 },
  heading: { fontFamily: fonts.bodyBold, fontSize: 16, lineHeight: 21 },
  body:    { fontFamily: fonts.body, fontSize: 15, lineHeight: 22 },
  bodyBold:{ fontFamily: fonts.bodyBold, fontSize: 15, lineHeight: 22 },
  small:   { fontFamily: fonts.body, fontSize: 13, lineHeight: 18 },
  smallBold:{ fontFamily: fonts.bodyBold, fontSize: 13, lineHeight: 18 },
  caption: { fontFamily: fonts.body, fontSize: 11.5, lineHeight: 16 },
  /** The uppercase tracked label above section headings. */
  eyebrow: {
    fontFamily: fonts.bodyBold,
    fontSize: 10,
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
  sm: 8, md: 12, lg: 16, xl: 20, card: 24, pill: 999,
} as const;

/**
 * iOS reads shadow*, Android reads elevation — both are needed or the
 * card looks flat on one platform. Values approximate the admin's
 * `workspace-card` box-shadow.
 */
export const shadow = {
  card: {
    shadowColor: "#1D3937",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.07,
    shadowRadius: 16,
    elevation: 2,
  },
  raised: {
    shadowColor: "#1D3937",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.13,
    shadowRadius: 24,
    elevation: 6,
  },
  /** For the teal primary button, so the shadow picks up its colour. */
  primary: {
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.26,
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
  /** Full-width teal button. */
  buttonPrimary: {
    height: 52,
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
  /** Outlined button, for the secondary action beside a primary one. */
  buttonGhost: {
    height: 52,
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
    height: 52,
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
    fontSize: 11,
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

export default { colors, status, fonts, text, space, radius, shadow, common, hitSlop };