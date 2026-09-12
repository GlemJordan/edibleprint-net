// Single source of truth for turning an order's committedDate into an
// urgency bucket — read by both the admin order list/detail UI and the
// daily delivery-alerts cron (app/api/cron/delivery-alerts/route.js), so
// the two can never disagree about what counts as "overdue" or "today".
import { isOrderResolved } from './production-status.js';

const BUSINESS_TIMEZONE = 'America/Toronto';

// Today's calendar date in the business's own timezone, as YYYY-MM-DD — the
// same format committedDate is stored in, so every comparison below is a
// plain string compare (lexicographic order matches chronological order for
// zero-padded ISO dates, no Date-object timezone pitfalls). Recomputed on
// every call rather than cached, since it's cheap and must never leak
// across a real day boundary.
export function todayInBusinessTimezone() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: BUSINESS_TIMEZONE }).format(new Date());
}

// Pure calendar-date arithmetic on a YYYY-MM-DD string, done via a UTC
// Date internally purely as a calculator (not a real moment in time) — this
// sidesteps DST entirely, unlike doing the arithmetic in BUSINESS_TIMEZONE.
function addDays(dateStr, days) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

// 'overdue' | 'today' | 'tomorrow' | 'upcoming' | 'none'. 'none' covers both
// "no committedDate set" and "order already resolved" (see
// lib/production-status.js's isOrderResolved) — callers don't need to check
// either case separately.
export function computeUrgency(record) {
  const date = record?.committedDate;
  if (!date) return 'none';
  if (isOrderResolved(record)) return 'none';

  const today = todayInBusinessTimezone();
  if (date < today) return 'overdue';
  if (date === today) return 'today';
  if (date === addDays(today, 1)) return 'tomorrow';
  return 'upcoming';
}

export const URGENCY_LABELS = {
  overdue: 'Overdue',
  today: 'Today',
  tomorrow: 'Tomorrow',
  upcoming: 'Upcoming',
  none: 'No date',
};

export const URGENCY_COLORS = {
  overdue: '#DC2626',
  today: '#EA580C',
  tomorrow: '#CA8A04',
  upcoming: '#6B7280',
  none: '#9CA3AF',
};

// The buckets worth interrupting the owner about in the daily digest — see
// app/api/cron/delivery-alerts/route.js. 'upcoming' (anything further out)
// is intentionally excluded: the point of the email is "act now or you'll
// miss it," not a full forecast.
export const DIGEST_URGENCY_BUCKETS = ['overdue', 'today', 'tomorrow'];

export function needsDigestMention(urgency) {
  return DIGEST_URGENCY_BUCKETS.includes(urgency);
}
