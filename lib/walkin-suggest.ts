import { findOverlappingBooking } from "@/lib/booking-conflict";
import {
  DEFAULT_BOOKING_DURATION_MINUTES,
  DEFAULT_TURNOVER_BUFFER_MINUTES,
  buildBookingStart,
  getExistingBookingWindow,
} from "@/lib/booking-time-policy";
import { collectAllTables, migrateFloorPlan } from "@/lib/floor-plan";
import { parseBookingComment } from "@/lib/booking-comment";
import { getArchivedBookingIds } from "@/lib/booking-archive";
import { getVenueEditorData } from "@/lib/venue-repository";
import type { FloorPlanRoom, FloorPlanTable } from "@/lib/types";

export type WalkinSuggestion = {
  tableId: string;
  tableLabel: string;
  roomName: string;
  roomId: string;
  capacity: number;
  /** Время ближайшей предстоящей брони на этот стол, если есть — например «21:30». */
  nextBookingTime: string | null;
  /** Сколько минут гость сможет тут сидеть до ближайшей брони (или null если ограничений нет). */
  availableMinutes: number | null;
  /** Скоринг — чем ниже, тем лучше. Используется для сортировки. */
  score: number;
};

function formatHM(d: Date) {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function roundUpToFive(d: Date) {
  const next = new Date(d);
  const minutes = next.getMinutes();
  const add = (5 - (minutes % 5)) % 5;
  next.setMinutes(minutes + add, 0, 0);
  return next;
}

function diffMinutes(later: Date, earlier: Date) {
  return Math.max(0, Math.round((later.getTime() - earlier.getTime()) / 60000));
}

type WalkinInput = {
  venueId: string;
  guests: number;
  durationMinutes?: number;
  now?: Date;
  preferredRoomId?: string;
  limit?: number;
};

/**
 * Подбирает топ свободных столов для гостя без брони.
 * Алгоритм:
 *   1. Берём floor plan, собираем все столы.
 *   2. Фильтруем по capacity ≥ guests.
 *   3. Для каждого — проверяем overlap для окна [now, now + duration]
 *      через тот же findOverlappingBooking, что и в основном flow.
 *   4. Ранжируем: ближе capacity к guests, потом больше availableMinutes,
 *      потом приоритетная комната.
 */
export async function suggestWalkinTables(db: any, input: WalkinInput): Promise<WalkinSuggestion[]> {
  const venue = await getVenueEditorData(input.venueId);
  if (!venue) return [];

  const floorPlan = migrateFloorPlan(venue.floorPlan as unknown);
  const rooms = floorPlan.rooms;
  const allTables = rooms.flatMap((room) =>
    room.tables.map((table) => ({ table, room }))
  );
  if (allTables.length === 0) return [];

  const now = input.now ?? new Date();
  const startDate = roundUpToFive(now);
  const duration = input.durationMinutes ?? DEFAULT_BOOKING_DURATION_MINUTES;
  const candidateStart = startDate;
  const candidateEnd = new Date(candidateStart.getTime() + duration * 60 * 1000);
  const dateIso = `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, "0")}-${String(startDate.getDate()).padStart(2, "0")}`;
  const timeStr = formatHM(startDate);

  const archivedIds = await getArchivedBookingIds();

  // Получаем все брони на текущий день — лучше один запрос, чем N
  const todayBookings = await db.bookingRequest.findMany({
    where: {
      venueId: input.venueId,
      eventDate: {
        gte: new Date(`${dateIso}T00:00:00`),
        lte: new Date(`${dateIso}T23:59:59.999`),
      },
      status: { in: ["NEW", "HOLD_PENDING", "PENDING", "CONFIRMED"] },
    },
    select: { id: true, comment: true, eventDate: true, startTime: true, customerName: true },
  });

  function tableBookings(table: FloorPlanTable, room: FloorPlanRoom) {
    return todayBookings.filter((row: any) => {
      if (archivedIds.has(row.id)) return false;
      const parsed = parseBookingComment(row.comment);
      if (parsed.tableId && parsed.tableId === table.id) return true;
      if (
        parsed.roomName &&
        parsed.roomName.trim().toLowerCase() === room.name.trim().toLowerCase() &&
        parsed.placeLabel.trim().toLowerCase() === table.label.trim().toLowerCase()
      ) {
        return true;
      }
      // совпадение только по placeLabel (старые брони без table/room id)
      if (!parsed.tableId && parsed.placeLabel.trim().toLowerCase() === table.label.trim().toLowerCase()) {
        return true;
      }
      return false;
    });
  }

  const candidates: WalkinSuggestion[] = [];

  for (const { table, room } of allTables) {
    if ((table.capacity || 0) < input.guests) continue;

    // Конфликт с уже идущей или начинающейся в окне бронью
    const conflict = await findOverlappingBooking(db, {
      venueId: input.venueId,
      date: dateIso,
      time: timeStr,
      placeLabel: table.label,
      tableId: table.id,
      roomName: room.name,
    });

    if (conflict) {
      continue; // занят прямо сейчас или скоро в перехлёст
    }

    // Найдём ближайшую следующую бронь после candidateEnd на этом столе
    const upcoming = tableBookings(table, room)
      .map((row: any) => ({
        window: getExistingBookingWindow(row.eventDate, row.startTime),
        startTime: row.startTime as string | null,
      }))
      .filter((b: { window: ReturnType<typeof getExistingBookingWindow>; startTime: string | null }) => b.window && b.window.start.getTime() >= candidateEnd.getTime())
      .sort(
        (a: { window: NonNullable<ReturnType<typeof getExistingBookingWindow>> }, b: { window: NonNullable<ReturnType<typeof getExistingBookingWindow>> }) =>
          a.window.start.getTime() - b.window.start.getTime()
      )[0];

    let availableMinutes: number | null = null;
    let nextBookingTime: string | null = null;
    if (upcoming?.window) {
      // полное доступное окно от старта до начала следующей брони минус turnover буфер
      const usableEnd = new Date(upcoming.window.start.getTime() - DEFAULT_TURNOVER_BUFFER_MINUTES * 60 * 1000);
      availableMinutes = Math.max(0, diffMinutes(usableEnd, candidateStart));
      nextBookingTime = upcoming.startTime || formatHM(upcoming.window.start);
    }

    // Скоринг: маленький capacity-mismatch лучше; больше availableMinutes — лучше; приоритетная комната — бонус.
    const capacityGap = (table.capacity || 0) - input.guests;
    const room_bonus = input.preferredRoomId && room.id === input.preferredRoomId ? -10 : 0;
    const tightnessPenalty =
      availableMinutes !== null && availableMinutes < duration + 15 ? 5 : 0;
    const score =
      capacityGap * 2 +
      tightnessPenalty +
      (availableMinutes === null ? -2 : 0) +
      room_bonus;

    candidates.push({
      tableId: table.id,
      tableLabel: table.label,
      roomName: room.name,
      roomId: room.id,
      capacity: table.capacity || 0,
      nextBookingTime,
      availableMinutes,
      score,
    });
  }

  candidates.sort((a, b) => a.score - b.score);
  return candidates.slice(0, input.limit ?? 5);
}

// re-export helper used in API to keep imports tidy
export { buildBookingStart, collectAllTables };
