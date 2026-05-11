import { getArchivedBookingIds } from "@/lib/booking-archive";
import { parseBookingComment } from "@/lib/booking-comment";
import { prisma } from "@/lib/prisma";

/** Нормализуем телефон к каноничному виду — только цифры, ведущий + если есть. */
export function normalizePhone(input: string | null | undefined): string {
  if (!input) return "";
  const trimmed = input.trim();
  const hasPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/\D+/g, "");
  if (!digits) return "";
  return (hasPlus ? "+" : "") + digits;
}

/** Поверхностное совпадение телефонов — последние 9 цифр совпадают. */
export function phoneDigitsTail(input: string | null | undefined, length = 9): string {
  const digits = (input || "").replace(/\D+/g, "");
  return digits.slice(-length);
}

export type GuestStatusFlag = "first-visit" | "regular" | "vip" | "risk";

export type GuestRecentBooking = {
  id: string;
  dateLabel: string;
  venueName: string;
  placeLabel: string;
  guestCount: number;
  status: string;
  archived: boolean;
  managerNote: string | null;
  startTime: string | null;
  eventDateIso: string;
};

export type GuestProfile = {
  phone: string;
  primaryName: string;
  totalBookings: number;
  confirmedBookings: number;
  noShowCount: number;
  cancelledByCustomer: number;
  lastVisitLabel: string | null;
  averageGuests: number;
  favoriteVenueName: string | null;
  favoritePlaceLabel: string | null;
  flags: GuestStatusFlag[];
  recent: GuestRecentBooking[];
};

type LookupInput = {
  phone: string;
  companyId?: string;
  managerId?: string;
  role: "superadmin" | "admin" | "manager";
};

function isNoShow(note: string | null | undefined, status: string) {
  const text = (note || "").toLowerCase();
  if (text.includes("не пришёл") || text.includes("не пришел") || text.includes("no-show") || text.includes("no show")) {
    return true;
  }
  // CANCELLED после CONFIRMED трактуем как «отменили после подтверждения»
  return false;
}

function isCustomerCancel(note: string | null | undefined) {
  const text = (note || "").toLowerCase();
  return text.includes("отменил клиент") || text.includes("отмена клиента") || text.includes("клиент отказался");
}

function isArrivedMarker(note: string | null | undefined) {
  return (note || "").includes("[ARRIVED]");
}

function mostCommon<T>(values: T[]): T | null {
  if (values.length === 0) return null;
  const counter = new Map<T, number>();
  for (const v of values) counter.set(v, (counter.get(v) || 0) + 1);
  let best: T | null = null;
  let bestCount = 0;
  for (const [k, c] of counter) {
    if (c > bestCount) { best = k; bestCount = c; }
  }
  return best;
}

function formatLocalDateIso(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function formatVisitLabel(date: Date) {
  return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" }).format(date);
}

/**
 * Собирает карточку гостя из истории BookingRequest по совпадению последних
 * 9 цифр телефона. Скоупится по компании/менеджеру согласно роли.
 *
 * Не требует новой таблицы — работает на текущих данных.
 */
export async function getGuestProfile(input: LookupInput): Promise<GuestProfile | null> {
  if (!prisma) return null;

  const phone = normalizePhone(input.phone);
  if (!phone) return null;
  const tail = phoneDigitsTail(phone);
  if (tail.length < 7) return null;

  const db = prisma as any;

  const rows = await db.bookingRequest.findMany({
    where: {
      // Скоуп по компании
      ...(input.role === "superadmin"
        ? {}
        : {
            venue: { companyId: input.companyId }
          }),
      // Менеджеру — только его брони
      ...(input.role === "manager" && input.managerId ? { managerId: input.managerId } : {}),
      // Дешёвый предфильтр — endsWith по customerPhone. Postgres вытянет с index scan по короткой выборке.
      customerPhone: { contains: tail }
    },
    include: { venue: true },
    orderBy: { eventDate: "desc" },
    take: 100
  });

  // Точная фильтрация по хвосту цифр (на случай шумных данных)
  const matched = rows.filter((row: any) => phoneDigitsTail(row.customerPhone) === tail);
  if (matched.length === 0) return null;

  const archivedIds = await getArchivedBookingIds();
  const now = Date.now();

  let confirmedBookings = 0;
  let noShowCount = 0;
  let cancelledByCustomer = 0;
  let guestSum = 0;
  const venueNames: string[] = [];
  const placeLabels: string[] = [];
  let lastVisitDate: Date | null = null;
  const names = new Map<string, number>();

  for (const row of matched) {
    const status: string = row.status || "NEW";
    const note: string = row.managerNote || "";
    const parsedComment = parseBookingComment(row.comment);
    const eventDate: Date = row.eventDate ? new Date(row.eventDate) : new Date(row.createdAt);
    const inPast = eventDate.getTime() < now;

    guestSum += row.guestCount || 0;
    names.set(row.customerName, (names.get(row.customerName) || 0) + 1);
    if (row.venue?.name) venueNames.push(row.venue.name);
    if (parsedComment.placeLabel && parsedComment.placeLabel !== "Без точки") {
      placeLabels.push(parsedComment.placeLabel);
    }

    // Состоявшийся визит
    if (status === "CONFIRMED" && (inPast || isArrivedMarker(note))) {
      confirmedBookings += 1;
      if (!lastVisitDate || eventDate > lastVisitDate) lastVisitDate = eventDate;
    }

    // No-show: бронь была подтверждена/новая, дата в прошлом, не отмечен ARRIVED
    if (inPast && !isArrivedMarker(note)) {
      if (status === "CANCELLED" && isNoShow(note, status)) {
        noShowCount += 1;
      } else if ((status === "NEW" || status === "PENDING" || status === "HOLD_PENDING") && !archivedIds.has(row.id)) {
        // Просрочка без подтверждения и без отметки прихода — fishy, но не считаем no-show на 100%
      }
    }

    if (status === "CANCELLED" && isCustomerCancel(note)) {
      cancelledByCustomer += 1;
    }
  }

  const totalBookings = matched.length;
  const averageGuests = totalBookings > 0 ? Math.round((guestSum / totalBookings) * 10) / 10 : 0;
  const favoriteVenueName = mostCommon(venueNames);
  const favoritePlaceLabel = mostCommon(placeLabels);

  // Имя — самое часто встречающееся
  let primaryName = "";
  let topCount = 0;
  for (const [name, count] of names) {
    if (count > topCount) { primaryName = name; topCount = count; }
  }

  const flags: GuestStatusFlag[] = [];
  if (totalBookings === 1) flags.push("first-visit");
  if (confirmedBookings >= 5) flags.push("regular");
  if (confirmedBookings >= 15) flags.push("vip");
  if (noShowCount >= 2 || (noShowCount > 0 && totalBookings > 0 && noShowCount / totalBookings >= 0.3)) flags.push("risk");

  const recent: GuestRecentBooking[] = matched.slice(0, 5).map((row: any) => {
    const parsedComment = parseBookingComment(row.comment);
    const eventDate: Date = row.eventDate ? new Date(row.eventDate) : new Date(row.createdAt);
    return {
      id: row.id,
      dateLabel: new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long" }).format(eventDate),
      venueName: row.venue?.name || "Площадка",
      placeLabel: parsedComment.placeLabel,
      guestCount: row.guestCount || 0,
      status: row.status || "NEW",
      archived: archivedIds.has(row.id),
      managerNote: row.managerNote || null,
      startTime: row.startTime || null,
      eventDateIso: formatLocalDateIso(eventDate)
    };
  });

  return {
    phone,
    primaryName,
    totalBookings,
    confirmedBookings,
    noShowCount,
    cancelledByCustomer,
    lastVisitLabel: lastVisitDate ? formatVisitLabel(lastVisitDate) : null,
    averageGuests,
    favoriteVenueName,
    favoritePlaceLabel,
    flags,
    recent
  };
}
