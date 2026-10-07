/**
 * Shared formatting for money, dates and times.
 *
 * Home, Visits and the receipt each carried their own copy of these, and
 * the copies had already drifted (one cut timestamps to the UTC date and
 * showed the wrong day for anything paid early in the morning in Manila).
 * One version, used everywhere.
 */

/** Money that was actually charged or paid: always two decimals.
 *  Service prices, invoices, receipts, payment history. */
export const peso = (n: number) =>
  `₱${Number(n).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Shelf prices for products: whole pesos, so "₱1,603.33" reads "₱1,603".
 *  Display only. The receipt still shows what was actually charged. */
export const pesoWhole = (n: number) =>
  `₱${Math.round(Number(n)).toLocaleString('en-PH', { maximumFractionDigits: 0 })}`;

export function toLocalISO(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/* One place that turns a date column into a real Date. Columns are
   either a plain "2026-10-01" or a full timestamp, and null on older
   rows. `new Date(null + "T00:00:00")` renders as "Invalid Date" rather
   than failing, so it ends up on screen — this returns null instead.

   A timestamp is read as an instant and shown in the phone's own day.
   Slicing its first ten characters gives the UTC date, which is the day
   before for anything paid early in the morning in Manila. */
export function parseDay(iso?: string | null): { d: Date; key: string } | null {
  if (!iso) return null;
  const d = iso.length > 10 ? new Date(iso) : new Date(iso + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return null;
  return { d, key: toLocalISO(d) };
}

/** "2026-10-01", or '' when there's no usable date. For comparing days. */
export const dayKey = (iso?: string | null) => parseDay(iso)?.key ?? '';

/** "Today", "Tomorrow", or "Wed, Oct 1" (weekday spelled out with 'long'). */
export function fmtDate(iso?: string | null, weekday: 'short' | 'long' = 'short') {
  const day = parseDay(iso);
  if (!day) return 'No date';
  const today = toLocalISO(new Date());
  const tomorrow = toLocalISO(new Date(Date.now() + 86_400_000));
  if (day.key === today) return 'Today';
  if (day.key === tomorrow) return 'Tomorrow';
  return day.d.toLocaleDateString('en-US', { weekday, month: 'short', day: 'numeric' });
}

/** "Oct 1" */
export function fmtShortDate(iso?: string | null) {
  const day = parseDay(iso);
  return day ? day.d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'No date';
}

/** "Oct 1, 2026" */
export function fmtPastDate(iso?: string | null) {
  const day = parseDay(iso);
  return day
    ? day.d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : 'No date';
}

/** "08:30:00" -> "8:30 AM". Anything that isn't a clock time is returned as it came. */
/** "08:30:00" -> "8:30 AM", "03:30 PM" -> "3:30 PM". Anything that isn't a clock time is returned as it came. */
export function fmtTime(t?: string | null) {
  if (!t) return '';
  const s = String(t).trim();

  // Already has AM/PM (what the app and the system write): keep the period
  const ampm = /^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)$/i.exec(s);
  if (ampm) return `${Number(ampm[1])}:${ampm[2]} ${ampm[3].toUpperCase()}`;

  // 24-hour time ("08:30:00", "15:30")
  const m = /^(\d{1,2}):(\d{2})/.exec(s);
  if (!m) return t;
  const h = Number(m[1]);
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${m[2]} ${h >= 12 ? 'PM' : 'AM'}`;
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/* One closed day means six open ones in a run, so naming the ends beats
   listing all six: "Mon – Sat". */
export function openDays(closedDay: number) {
  const order = [1, 2, 3, 4, 5, 6, 0].filter((d) => d !== closedDay);
  return `${DAY_NAMES[order[0]].slice(0, 3)} – ${DAY_NAMES[order[order.length - 1]].slice(0, 3)}`;
}

/* The last bookable slot isn't closing time — a 6:30 PM appointment
   runs past 6:30. Closing is the slot plus its length (30 minutes). */
export function closingTime(lastSlot?: string | null) {
  if (!lastSlot) return '';
  const [h, m] = lastSlot.split(':').map(Number);
  const end = h * 60 + m + 30;
  return fmtTime(
    `${String(Math.floor(end / 60) % 24).padStart(2, '0')}:${String(end % 60).padStart(2, '0')}`
  );
}