import { getArchivedBookingIds } from "@/lib/booking-archive";
import { parseBookingComment } from "@/lib/booking-comment";
import {
  ACTIVE_BOOKING_STATUSES,
  getBookingWindow,
  getExistingBookingWindow,
  normalizePlaceLabel,
  windowsOverlap,
} from "@/lib/booking-time-policy";

export type ConflictCheckInput = {
  venueId: string;
  date: string;
  time: string;
  placeLabel: string;
  tableId?: string;
  roomName?: string;
  excludeBookingId?: string;
};

export type ConflictInfo = {
  bookingId: string;
  startTime: string | null;
  eventDate: Date;
  customerName: string | null;
  placeLabel: string;
  windowLabel: string; // "19:00 – 21:30"
};

function formatWindowLabel(window: { start: Date; end: Date }) {
  const fmt = (d: Date) =>
    `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  return `${fmt(window.start)} – ${fmt(window.end)}`;
}

/**
 * Возвращает первую найденную конфликтующую бронь или null.
 * Использует тот же алгоритм, что и backend при создании/подтверждении —
 * single source of truth для всей системы.
 */
export async function findOverlappingBooking(
  db: any,
  input: ConflictCheckInput
): Promise<ConflictInfo | null> {
  const candidateWindow = getBookingWindow(input.date, input.time);
  const archivedBookingIds = await getArchivedBookingIds();

  const rows = await db.bookingRequest.findMany({
    where: {
      venueId: input.venueId,
      eventDate: {
        gte: new Date(`${input.date}T00:00:00`),
        lte: new Date(`${input.date}T23:59:59.999`),
      },
      status: {
        in: [...ACTIVE_BOOKING_STATUSES],
      },
      ...(input.excludeBookingId
        ? { id: { not: input.excludeBookingId } }
        : {}),
    },
    select: {
      id: true,
      comment: true,
      eventDate: true,
      startTime: true,
      customerName: true,
    },
  });

  const conflict = rows.find((row: any) => {
    if (archivedBookingIds.has(row.id)) {
      return false;
    }

    const parsed = parseBookingComment(row.comment);
    const hasExactTableMatch =
      parsed.tableId && input.tableId && parsed.tableId === input.tableId;
    const hasExactRoomMatch =
      !hasExactTableMatch &&
      parsed.roomName &&
      input.roomName &&
      normalizePlaceLabel(parsed.roomName) === normalizePlaceLabel(input.roomName) &&
      normalizePlaceLabel(parsed.placeLabel) === normalizePlaceLabel(input.placeLabel);

    if (!hasExactTableMatch && !hasExactRoomMatch) {
      if (parsed.tableId && input.tableId && parsed.tableId !== input.tableId) {
        return false;
      }
      if (normalizePlaceLabel(parsed.placeLabel) !== normalizePlaceLabel(input.placeLabel)) {
        return false;
      }
    }

    const existingWindow = getExistingBookingWindow(row.eventDate, row.startTime);
    return existingWindow ? windowsOverlap(candidateWindow, existingWindow) : false;
  });

  if (!conflict) return null;

  const existingWindow = getExistingBookingWindow(conflict.eventDate, conflict.startTime);
  return {
    bookingId: conflict.id,
    startTime: conflict.startTime,
    eventDate: conflict.eventDate,
    customerName: conflict.customerName,
    placeLabel: parseBookingComment(conflict.comment).placeLabel,
    windowLabel: existingWindow ? formatWindowLabel(existingWindow) : conflict.startTime || "—",
  };
}
