import { prisma } from "@/lib/prisma";
import type { BookingSlot, Venue, VenueVertical } from "@/lib/types";

const SLOT_TEMPLATES: Record<VenueVertical, string[]> = {
  restaurant: ["12:00", "14:00", "16:00", "18:00", "20:00", "22:00"],
  apartment: ["09:00", "12:00", "15:00", "18:00"],
  "event-space": ["10:00", "13:00", "16:00", "19:00"],
  office: ["09:00", "11:00", "13:00", "15:00", "17:00"],
  villa: ["11:00", "14:00", "17:00", "20:00"]
};

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
  const slotTimes =
    input.venue.bookingSlots.length > 0
      ? input.venue.bookingSlots
      : SLOT_TEMPLATES[input.venue.vertical] || SLOT_TEMPLATES["event-space"];
  const baseCapacity = getBaseCapacity(input.hotspotStatus, input.hotspotKind);

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
          in: ["NEW", "HOLD_PENDING", "PENDING", "CONFIRMED"]
        },
        ...(input.hotspotLabel
          ? {
              comment: {
                contains: input.hotspotLabel
              }
            }
          : {})
      },
      select: {
        startTime: true
      }
    });

    const counts = (rows as Array<{ startTime?: string | null }>).reduce((accumulator, row) => {
      const key = row.startTime || "";
      if (!key) {
        return accumulator;
      }

      accumulator[key] = (accumulator[key] || 0) + 1;
      return accumulator;
    }, {} as Record<string, number>);

    return slotTimes.map((time) => {
      const occupied = counts[time] || 0;
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
