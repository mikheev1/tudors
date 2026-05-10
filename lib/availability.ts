import { prisma } from "@/lib/prisma";
import {
  ACTIVE_BOOKING_STATUSES,
  getBookingWindow,
  getExistingBookingWindow,
  normalizePlaceLabel,
  parseBookingCommentPlaceLabel,
  windowsOverlap
} from "@/lib/booking-time-policy";
import { collectAllTables, migrateFloorPlan } from "@/lib/floor-plan";
import type { BookingSlot, Venue } from "@/lib/types";

function getBaseCapacity(status?: string, hotspotKind?: string) {
  if (hotspotKind === "table" || hotspotKind === "zone") {
    if (status === "waitlist") {
      return 0;
    }

    return 1;
  }

  if (status === "waitlist") {
    return 0;
  }

  if (status === "limited") {
    return 1;
  }

  if (status === "available") {
    return 3;
  }

  return 2;
}

function getDayBounds(date: string) {
  const start = new Date(`${date}T00:00:00`);
  const end = new Date(`${date}T23:59:59.999`);
  return { start, end };
}

function getLocalDateIso(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isPastSlot(date: string, time: string) {
  const now = new Date();

  if (date !== getLocalDateIso(now)) {
    return false;
  }

  const slotDateTime = new Date(`${date}T${time}:00`);
  return slotDateTime.getTime() <= now.getTime();
}

export async function getVenueAvailabilitySlots(input: {
  venue: Venue;
  date: string;
  hotspotLabel?: string;
  hotspotStatus?: string;
  hotspotKind?: string;
}): Promise<BookingSlot[]> {
  const db = prisma as any;
  const slotTimes = (() => {
    if (input.hotspotKind === "table" && input.hotspotLabel && input.venue.floorPlan) {
      const table = collectAllTables(migrateFloorPlan(input.venue.floorPlan)).find(
        (item) => item.label.trim().toLowerCase() === input.hotspotLabel?.trim().toLowerCase()
      );
      const tableSlots = table?.bookingSlots?.map((slot) => slot.trim()).filter(Boolean) ?? [];
      if (tableSlots.length > 0) {
        return tableSlots;
      }
    }

    return input.venue.bookingSlots
      .map((slot) => slot.trim())
      .filter(Boolean);
  })();
  const baseCapacity = getBaseCapacity(input.hotspotStatus, input.hotspotKind);

  if (slotTimes.length === 0) {
    return [];
  }

  if (!input.date) {
    return slotTimes.map((time) => ({
      time,
      label: time,
      status: baseCapacity === 0 ? "unavailable" : "available",
      remaining: baseCapacity,
      unavailableReason: baseCapacity === 0 ? "blocked" : undefined
    }));
  }

  try {
    const { start, end } = getDayBounds(input.date);
    const rows = await db.bookingRequest.findMany({
      where: {
        venueId: input.venue.id,
        eventDate: {
          gte: start,
          lte: end
        },
        status: {
          in: [...ACTIVE_BOOKING_STATUSES]
        }
      },
      select: {
        comment: true,
        eventDate: true,
        startTime: true
      }
    });

    const activeRows = (rows as Array<{ comment?: string | null; eventDate?: Date | string | null; startTime?: string | null }>)
      .filter((row) => {
        if (!input.hotspotLabel) {
          return true;
        }

        return (
          normalizePlaceLabel(parseBookingCommentPlaceLabel(row.comment)) ===
          normalizePlaceLabel(input.hotspotLabel)
        );
      });

    return slotTimes.map((time) => {
      const candidateWindow = getBookingWindow(input.date, time);
      const occupied = activeRows.reduce((count, row) => {
        if (!row.eventDate || !row.startTime) {
          return count;
        }

        const existingWindow = getExistingBookingWindow(row.eventDate, row.startTime);
        if (!existingWindow) {
          return count;
        }

        return windowsOverlap(candidateWindow, existingWindow) ? count + 1 : count;
      }, 0);
      const remaining = Math.max(baseCapacity - occupied, 0);
      const past = isPastSlot(input.date, time);
      const status = remaining <= 0 || past ? "unavailable" : "available";
      const unavailableReason =
        baseCapacity === 0 ? "blocked" : past ? "past" : remaining <= 0 ? "occupied" : undefined;

      return {
        time,
        label: time,
        status,
        remaining,
        unavailableReason
      };
    });
  } catch {
    return slotTimes.map((time) => ({
      time,
      label: time,
      status: baseCapacity === 0 || isPastSlot(input.date, time) ? "unavailable" : "available",
      remaining: baseCapacity,
      unavailableReason:
        baseCapacity === 0 ? "blocked" : isPastSlot(input.date, time) ? "past" : undefined
    }));
  }
}
