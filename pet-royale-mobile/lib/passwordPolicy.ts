/* One password rule for every place a password is set, so the screens
   can't drift apart. Put this at lib/passwordPolicy.ts in the customer app.

   This is a copy of the admin app's src/lib/passwordPolicy.ts. The two
   apps are separate repos and can't import from each other, so change
   both together.

   The rule:
   - 12 to 72 characters. 72 is the most the auth system actually uses;
     anything past it is silently ignored, so a longer one would look
     stronger than it is.
   - at least one uppercase letter, one lowercase letter, one number and
     one symbol (anything that isn't a letter, a number or a space).

   Checking in the app alone stops nobody who calls the API directly.
   For passwords people set themselves, the enforcement that covers every
   path is Supabase Auth's own setting: Authentication → Sign In /
   Providers → Password requirements. */

export const PASSWORD_MIN = 12;
export const PASSWORD_MAX = 72;

export const PASSWORD_HINT =
  "At least 12 characters, with an uppercase letter, a lowercase letter, a number and a symbol.";

const list = (items: string[]) =>
  items.length <= 1
    ? items.join("")
    : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;

/* null means the password is acceptable; otherwise a sentence that says
   what's missing. */
export function passwordProblem(pw: string): string | null {
  if (pw.length < PASSWORD_MIN) return `Password must be at least ${PASSWORD_MIN} characters.`;
  if (pw.length > PASSWORD_MAX) return `Password can't be longer than ${PASSWORD_MAX} characters.`;

  const missing: string[] = [];
  if (!/[A-Z]/.test(pw)) missing.push("an uppercase letter");
  if (!/[a-z]/.test(pw)) missing.push("a lowercase letter");
  if (!/[0-9]/.test(pw)) missing.push("a number");
  if (!/[^A-Za-z0-9\s]/.test(pw)) missing.push("a symbol (like ! or @)");

  return missing.length ? `Password needs ${list(missing)}.` : null;
}
