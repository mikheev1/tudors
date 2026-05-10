export const DEFAULT_BOOKING_DURATION_MINUTES = 120;
export const DEFAULT_TURNOVER_BUFFER_MINUTES = 30;
export const ACTIVE_BOOKING_STATUSES = ["NEW", "HOLD_PENDING", "PENDING", "CONFIRMED"] as const;

function toLocalDateIso(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

export function parseBookingCommentPlaceLabel(comment?: string | null) {
  return (comment || "")
    .split("|")
    .map((item) => item.trim())
    .filter(Boolean)[0] || "Без точки";
}

export function normalizePlaceLabel(value?: string | null) {
  return (value || "").trim().toLowerCase();
}

export function buildBookingStart(dateIso: string, time: string) {
  return new Date(`${dateIso}T${time}:00`);
}

export function getBookingWindow(dateIso: string, time: string) {
  const start = buildBookingStart(dateIso, time);
  const end = addMinutes(
    start,
    DEFAULT_BOOKING_DURATION_MINUTES + DEFAULT_TURNOVER_BUFFER_MINUTES
  );

  return { start, end };
}

export function getExistingBookingWindow(eventDate: Date | string, time?: string | null) {
  if (!time) {
    return null;
  }

  const date = typeof eventDate === "string" ? new Date(eventDate) : eventDate;
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return getBookingWindow(toLocalDateIso(date), time);
}

export function windowsOverlap(
  left: { start: Date; end: Date },
  right: { start: Date; end: Date }
) {
  return left.start < right.end && right.start < left.end;
}
