import { archiveBooking, getArchivedBookingIds, restoreBooking } from "@/lib/booking-archive";
import {
  ACTIVE_BOOKING_STATUSES,
  getBookingWindow,
  getExistingBookingWindow,
  normalizePlaceLabel,
  windowsOverlap
} from "@/lib/booking-time-policy";
import { buildBookingComment, parseBookingComment } from "@/lib/booking-comment";
import { getCompanyThemes, getManagersByCompany } from "@/lib/company-config";
import { venues } from "@/lib/data";
import {
  offerWaitlistEntry,
  scheduleBookingNotifications,
  sendWaitlistPromotedNotification,
  sendWalkinNotification
} from "@/lib/operations";
import { getDatabaseUnavailableError, prisma } from "@/lib/prisma";
import type {
  BookingRequestPayload,
  ManagerAction,
  ManagerBooking,
  ManagerListing,
  Venue
} from "@/lib/types";

function combineDateTime(date: string, time: string) {
  return new Date(`${date}T${time}:00`);
}

function formatLocalDateIso(date: Date | string) {
  const value = typeof date === "string" ? new Date(date) : date;
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

function formatDateLabel(date: Date | string, time?: string | null) {
  const dateValue = typeof date === "string" ? new Date(date) : date;
  const formattedDate = new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long"
  }).format(dateValue);

  return time ? `${formattedDate}, ${time}` : formattedDate;
}

function mapDbStatus(status?: string | null): ManagerBooking["status"] {
  switch (status) {
    case "CONFIRMED":
      return "confirmed";
    case "HOLD_PENDING":
    case "PENDING":
      return "hold_pending";
    case "WAITLIST":
      return "waitlist";
    case "REJECTED":
    case "CANCELLED":
      return "declined";
    default:
      return "new";
  }
}

function getNextStatus(action: ManagerAction) {
  switch (action) {
    case "confirm":
      return "CONFIRMED";
    case "cancel":
    case "decline":
      return action === "cancel" ? "CANCELLED" : "REJECTED";
    case "hold":
      return "HOLD_PENDING";
    case "waitlist":
      return "WAITLIST";
    case "arrived":
    case "complete_visit":
    case "archive":
    case "restore":
      return undefined;
  }
}

const OPERATIONAL_NOTE_ARRIVED = "[ARRIVED]";

function isBookingMarkedArrived(note?: string | null) {
  return (note || "").includes(OPERATIONAL_NOTE_ARRIVED);
}

function appendManagerNoteTag(note: string | null | undefined, tag: string, message: string) {
  const base = (note || "").replace(tag, "").trim();
  return `${tag} ${message}${base ? ` · ${base}` : ""}`.trim();
}

async function findOverlappingBooking(
  db: any,
  input: {
    venueId: string;
    date: string;
    time: string;
    placeLabel: string;
    tableId?: string;
    roomName?: string;
    excludeBookingId?: string;
  }
) {
  const candidateWindow = getBookingWindow(input.date, input.time);
  const archivedBookingIds = await getArchivedBookingIds();
  const rows = await db.bookingRequest.findMany({
    where: {
      venueId: input.venueId,
      eventDate: {
        gte: new Date(`${input.date}T00:00:00`),
        lte: new Date(`${input.date}T23:59:59.999`)
      },
      status: {
        in: [...ACTIVE_BOOKING_STATUSES]
      },
      ...(input.excludeBookingId
        ? {
            id: {
              not: input.excludeBookingId
            }
          }
        : {})
    },
    select: {
      id: true,
      comment: true,
      eventDate: true,
      startTime: true
    }
  });

  return rows.find((row: any) => {
    if (archivedBookingIds.has(row.id)) {
      return false;
    }

    const parsed = parseBookingComment(row.comment);
    const hasExactTableMatch = parsed.tableId && input.tableId && parsed.tableId === input.tableId;
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
}

async function ensureCompanyAndManagers(companyId: string) {
  if (!prisma) {
    return;
  }

  const db = prisma as any;
  const companyThemes = await getCompanyThemes();
  const company = companyThemes.find((item) => item.id === companyId);

  if (!company) {
    return;
  }

  const baseCompanyPayload = {
    name: company.name,
    logoText: company.logoText,
    accent: company.accent,
    accentDark: company.accentDark,
    surfaceTint: company.surfaceTint
  };

  const extendedCompanyPayload = {
    ...baseCompanyPayload,
    logoImageUrl: company.logoImageUrl,
    panelSurface: company.panelSurface,
    dashboardBackgroundUrl: company.dashboardBackgroundUrl,
    telegramBotName: company.telegramBotName,
    telegramAdminChatId: company.telegramAdminChatId,
    managerReminderLeadMinutes: company.managerReminderLeadMinutes,
    customerReminderLeadMinutes: company.customerReminderLeadMinutes
  };

  try {
    await db.company.upsert({
      where: {
        id: company.id
      },
      update: extendedCompanyPayload,
      create: {
        id: company.id,
        slug: company.id,
        ...extendedCompanyPayload
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const isLegacyClient =
      message.includes("Unknown argument") ||
      message.includes("PrismaClientValidationError");

    if (!isLegacyClient) {
      throw error;
    }

    await db.company.upsert({
      where: {
        id: company.id
      },
      update: baseCompanyPayload,
      create: {
        id: company.id,
        slug: company.id,
        ...baseCompanyPayload
      }
    });
  }

  const managers = await getManagersByCompany(companyId);

  await Promise.all(
    managers.map((manager) =>
      db.manager.upsert({
        where: {
          id: manager.id
        },
        update: {
          companyId: manager.companyId,
          fullName: manager.fullName,
          email: `${manager.username}@local.tudors`,
          role: manager.role
        },
        create: {
          id: manager.id,
          companyId: manager.companyId,
          fullName: manager.fullName,
          email: `${manager.username}@local.tudors`,
          role: manager.role
        }
      })
    )
  );
}

async function ensureVenueGraph(venueName: string) {
  if (!prisma) {
    return null;
  }

  const db = prisma as any;
  const matchedVenue = venues.find((item) => item.name === venueName);

  if (!matchedVenue) {
    return null;
  }

  await ensureCompanyAndManagers(matchedVenue.companyId);

  await db.venue.upsert({
    where: {
      id: matchedVenue.id
    },
    update: {
      name: matchedVenue.name,
      companyId: matchedVenue.companyId,
      ownerManagerId: matchedVenue.ownerManagerId,
      city: matchedVenue.city,
      description: matchedVenue.summary,
      vertical: matchedVenue.vertical,
      capacityMax: matchedVenue.capacity,
      status: "ACTIVE"
    },
    create: {
      id: matchedVenue.id,
      companyId: matchedVenue.companyId,
      ownerManagerId: matchedVenue.ownerManagerId,
      slug: matchedVenue.id,
      name: matchedVenue.name,
      vertical: matchedVenue.vertical,
      city: matchedVenue.city,
      description: matchedVenue.summary,
      capacityMax: matchedVenue.capacity,
      status: "ACTIVE"
    }
  });

  return matchedVenue;
}

function toManagerListing(item: Venue): ManagerListing {
  return {
    id: item.id,
    companyId: item.companyId,
    ownerManagerId: item.ownerManagerId,
    name: item.name,
    vertical: item.vertical,
    city: item.city,
    type: item.type,
    price: item.price,
    availability: item.availability
  };
}

export async function createRealBooking(payload: BookingRequestPayload) {
  if (!prisma) {
    throw getDatabaseUnavailableError();
  }

  const db = prisma as any;
  const localVenue = venues.find((item) => item.name === payload.venue) || null;
  let matchedVenue = localVenue;

  try {
    const syncedVenue = await ensureVenueGraph(payload.venue);
    if (syncedVenue) {
      matchedVenue = syncedVenue;
    }
  } catch (error) {
    console.error("Failed to sync venue graph before booking", error);
  }

  const bookingDate = combineDateTime(payload.date, payload.time);
  const holdExpiresAt = new Date(Date.now() + 30 * 60 * 1000);
  const extraComment = payload.telegram ? ` | TG: ${payload.telegram.startsWith("@") ? payload.telegram : `@${payload.telegram}`}` : "";
  const baseData = {
    eventType: matchedVenue?.vertical ?? "restaurant",
    guestCount: payload.guests,
    eventDate: bookingDate,
    startTime: payload.time,
    customerName: payload.name,
    customerPhone: payload.phone,
    comment: `${payload.comment ?? ""}${extraComment}`,
    sourceLabel: "360 booking",
    holdExpiresAt,
    status: "NEW"
  } as const;

  if (matchedVenue?.id && payload.time && payload.hotspotLabel) {
    const conflictingBooking = await findOverlappingBooking(db, {
      venueId: matchedVenue.id,
      date: payload.date,
      time: payload.time,
      placeLabel: payload.hotspotLabel
    });

    if (conflictingBooking) {
      throw new Error("Этот стол уже занят или слишком близок по времени к другой брони.");
    }
  }

  try {
    const booking = await db.bookingRequest.create({
      data: {
        ...baseData,
        venueId: matchedVenue?.id ?? null,
        managerId: matchedVenue?.ownerManagerId ?? null
      }
    });

    await scheduleBookingNotifications({
      bookingId: booking.id,
      companyId: matchedVenue?.companyId,
      venueId: matchedVenue?.id,
      venueName: payload.venue,
      customerName: payload.name,
      customerPhone: payload.phone,
      guestCount: payload.guests,
      customerTelegram: payload.telegram,
      placeLabel: payload.hotspotLabel || "Без точки",
      eventDate: booking.eventDate,
      startTime: booking.startTime,
      status: booking.status
    });

    return booking;
  } catch (error) {
    console.error("Primary booking create failed, retrying without manager relation", error);
  }

  try {
    const booking = await db.bookingRequest.create({
      data: {
        ...baseData,
        venueId: matchedVenue?.id ?? null,
        managerId: null
      }
    });

    await scheduleBookingNotifications({
      bookingId: booking.id,
      companyId: matchedVenue?.companyId,
      venueId: matchedVenue?.id,
      venueName: payload.venue,
      customerName: payload.name,
      customerPhone: payload.phone,
      guestCount: payload.guests,
      customerTelegram: payload.telegram,
      placeLabel: payload.hotspotLabel || "Без точки",
      eventDate: booking.eventDate,
      startTime: booking.startTime,
      status: booking.status
    });

    return booking;
  } catch (error) {
    console.error("Secondary booking create failed, retrying without venue relation", error);
  }

  return db.bookingRequest.create({
    data: {
      ...baseData,
      venueId: null,
      managerId: null,
      sourceLabel: "360 booking (fallback)"
    }
  });
}

export async function listManagerListings(input: {
  companyId: string;
  managerId: string;
  role: "superadmin" | "admin" | "manager";
}) {
  const companyListings =
    input.role === "superadmin"
      ? venues
      : venues.filter((item) => item.companyId === input.companyId);
  const visibleListings =
    input.role === "superadmin" || input.role === "admin"
      ? companyListings
      : companyListings.filter((item) => item.ownerManagerId === input.managerId);

  return visibleListings.map(toManagerListing);
}

export async function listRealManagerBookings(input: {
  companyId: string;
  managerId: string;
  role: "superadmin" | "admin" | "manager";
}): Promise<ManagerBooking[]> {
  if (!prisma) {
    return [];
  }

  // Background cleanup on every board load
  await autoConfirmExpiredHolds().catch(() => {});
  await archiveExpiredWaitlistBookings().catch(() => {});

  const db = prisma as any;

  if (input.role === "superadmin") {
    for (const venue of venues) {
      await ensureCompanyAndManagers(venue.companyId);
    }
  } else {
    await ensureCompanyAndManagers(input.companyId);
  }

  const rows = await db.bookingRequest.findMany({
    where: {
      ...(input.role === "superadmin"
        ? {}
        : {
            venue: {
              companyId: input.companyId
            }
          }),
      ...(input.role === "manager" ? { managerId: input.managerId } : {})
    },
    include: {
      venue: true
    },
    orderBy: {
      createdAt: "desc"
    }
  });
  const archivedBookingIds = await getArchivedBookingIds();

  return rows.map((row: any) => {
    const parsedComment = parseBookingComment(row.comment);

    return {
      id: row.id,
      companyId: row.venue?.companyId ?? input.companyId,
      ownerManagerId: row.venue?.ownerManagerId ?? row.managerId ?? undefined,
      customerName: row.customerName,
      phone: row.customerPhone,
      telegram: parsedComment.telegram,
      venueName: row.venue?.name ?? "Без площадки",
      vertical: (row.venue?.vertical ?? "event-space") as ManagerBooking["vertical"],
      placeLabel: parsedComment.placeLabel,
      tableId: parsedComment.tableId,
      roomName: parsedComment.roomName,
      slotLabel: parsedComment.slotLabel,
      dateLabel: formatDateLabel(row.eventDate, row.startTime),
      guestsLabel: `${row.guestCount} гостей`,
      amountLabel:
        venues.find((item) => item.id === row.venue?.id)?.price ||
        (row.venue?.basePrice ? `${row.venue.basePrice} ${row.venue.currency}` : "По запросу"),
      sourceLabel: row.sourceLabel || "Site booking",
      managerNote: row.managerNote || "Без заметки",
      status: mapDbStatus(row.status),
      archived: archivedBookingIds.has(row.id),
      eventDateIso: row.eventDate ? formatLocalDateIso(row.eventDate) : undefined,
      startTimeRaw: row.startTime || undefined
    };
  });
}

export async function updateRealBookingStatus(input: {
  bookingId: string;
  managerId: string;
  action: ManagerAction;
  role: "superadmin" | "admin" | "manager";
}) {
  if (!prisma) {
    throw getDatabaseUnavailableError();
  }

  const db = prisma as any;
  const nextStatus = getNextStatus(input.action);
  const existing = await db.bookingRequest.findUnique({
    where: {
      id: input.bookingId
    },
    include: {
      venue: true
    }
  });

  if (!existing) {
    throw new Error("Booking not found");
  }

  if (input.role === "manager" && existing.managerId !== input.managerId) {
    throw new Error("Forbidden booking access");
  }

  if (input.action === "archive") {
    await archiveBooking(existing.id);
    return existing;
  }

  if (input.action === "restore") {
    await restoreBooking(existing.id);
    return existing;
  }

  if (input.action === "arrived") {
    const updated = await db.bookingRequest.update({
      where: {
        id: input.bookingId
      },
      data: {
        managerId: existing.managerId ?? input.managerId,
        managerNote: appendManagerNoteTag(existing.managerNote, OPERATIONAL_NOTE_ARRIVED, "Гость пришёл и посажен")
      }
    });

    await db.notificationJob.updateMany({
      where: {
        bookingRequestId: existing.id,
        status: "PENDING",
        kind: {
          in: ["manager-reminder", "arrival-check", "customer-reminder"]
        }
      },
      data: {
        status: "CANCELLED",
        failedAt: new Date(),
        errorMessage: "Гость уже пришёл"
      }
    });

    return updated;
  }

  if (input.action === "complete_visit") {
    await db.bookingRequest.update({
      where: {
        id: input.bookingId
      },
      data: {
        managerId: existing.managerId ?? input.managerId,
        status: existing.sourceLabel === "Walk-in" ? "CANCELLED" : existing.status,
        managerNote: "Визит завершён — стол освобождён"
      }
    });

    await db.notificationJob.updateMany({
      where: {
        bookingRequestId: existing.id,
        status: "PENDING"
      },
      data: {
        status: "CANCELLED",
        failedAt: new Date(),
        errorMessage: "Визит завершён раньше запланированных уведомлений"
      }
    });

    if (existing.sourceLabel === "Walk-in") {
      const parsedPlace = parseBookingComment(existing.comment);
      await sendWalkinNotification({
        companyId: existing.venue?.companyId ?? null,
        venueId: existing.venueId ?? null,
        venueName: existing.venue?.name ?? "Площадка",
        placeLabel: parsedPlace.placeLabel,
        kind: "released"
      }).catch(() => {});
    }

    await archiveBooking(existing.id);
    return existing;
  }

  const parsedComment = parseBookingComment(existing.comment);

  if (
    (input.action === "confirm" || input.action === "hold") &&
    existing.venueId &&
    existing.eventDate &&
    existing.startTime &&
    parsedComment.placeLabel &&
    parsedComment.placeLabel !== "Без точки"
  ) {
    const eventDateIso = formatLocalDateIso(existing.eventDate);
    const conflictingBooking = await findOverlappingBooking(db, {
      venueId: existing.venueId,
      date: eventDateIso,
      time: existing.startTime,
      placeLabel: parsedComment.placeLabel,
      tableId: parsedComment.tableId,
      roomName: parsedComment.roomName,
      excludeBookingId: existing.id
    });

    if (conflictingBooking) {
      throw new Error("Этот стол уже занят или слишком близок по времени к другой брони.");
    }
  }

  const updated = await db.bookingRequest.update({
    where: {
      id: input.bookingId
    },
    data: {
      managerId: existing.managerId ?? input.managerId,
      status: nextStatus,
      confirmedAt: input.action === "confirm" ? new Date() : null,
      holdExpiresAt:
        input.action === "hold" ? new Date(Date.now() + 30 * 60 * 1000) : existing.holdExpiresAt,
      managerNote:
        input.action === "confirm"
          ? `Подтверждено менеджером${parsedComment.slotLabel ? ` · ${parsedComment.slotLabel}` : ""}`
          : input.action === "cancel"
            ? "Отменено менеджером"
            : input.action === "decline"
            ? "Отклонено менеджером"
            : input.action === "waitlist"
              ? "Переведено в waitlist"
              : "Hold продлен менеджером"
    }
  });

  await scheduleBookingNotifications({
    bookingId: updated.id,
    companyId: existing.venue?.companyId,
    venueId: updated.venueId,
    venueName: existing.venue?.name || "Площадка",
    customerName: updated.customerName,
    customerPhone: existing.customerPhone,
    guestCount: existing.guestCount,
    customerTelegram: parsedComment.telegram,
    placeLabel: parsedComment.placeLabel,
    eventDate: updated.eventDate,
    startTime: updated.startTime,
    status: updated.status
  });

  if (
    (input.action === "cancel" || input.action === "decline") &&
    existing.venueId &&
    parsedComment.placeLabel &&
    parsedComment.placeLabel !== "Без точки"
  ) {
    // Walk-in release notification
    if (existing.sourceLabel === "Walk-in") {
      const parsedPlace = parseBookingComment(existing.comment);
      await db.notificationJob.updateMany({
        where: {
          bookingRequestId: existing.id,
          status: "PENDING",
          kind: "walkin-upcoming-warning"
        },
        data: {
          status: "CANCELLED",
          failedAt: new Date(),
          errorMessage: "Walk-in завершён раньше предупреждения"
        }
      });
      await sendWalkinNotification({
        companyId: existing.venue?.companyId ?? null,
        venueId: existing.venueId ?? null,
        venueName: existing.venue?.name ?? "Площадка",
        placeLabel: parsedPlace.placeLabel,
        kind: "released"
      }).catch(() => {});
    }

    // Promote next WAITLIST booking in queue for this slot
    await promoteNextWaitlistBooking(db, {
      venueId: existing.venueId,
      placeLabel: parsedComment.placeLabel,
      eventDate: existing.eventDate,
      startTime: existing.startTime
    });

    const requestedDateIso = existing.eventDate ? formatLocalDateIso(existing.eventDate) : undefined;
    const waitlistConditions = [];

    if (requestedDateIso) {
      waitlistConditions.push({
        OR: [
          { requestedDate: null },
          {
            requestedDate: {
              gte: new Date(`${requestedDateIso}T00:00:00`),
              lt: new Date(`${requestedDateIso}T23:59:59`)
            }
          }
        ]
      });
    }

    if (existing.startTime) {
      waitlistConditions.push({
        OR: [{ requestedTime: null }, { requestedTime: existing.startTime }]
      });
    }

    const waitlistCandidate = await db.waitlistEntry.findFirst({
      where: {
        venueId: existing.venueId,
        status: "ACTIVE",
        hotspotLabel: parsedComment.placeLabel,
        ...(waitlistConditions.length ? { AND: waitlistConditions } : {})
      },
      orderBy: {
        createdAt: "asc"
      }
    });

    if (waitlistCandidate) {
      await offerWaitlistEntry(waitlistCandidate.id, input.managerId);
    }
  }

  return updated;
}

// Promote the next WAITLIST booking in queue when a slot opens up
async function promoteNextWaitlistBooking(
  db: any,
  input: {
    venueId: string;
    placeLabel: string;
    eventDate: Date;
    startTime: string | null;
  }
) {
  const dateIso = formatLocalDateIso(input.eventDate);

  const candidates = await db.bookingRequest.findMany({
    where: {
      venueId: input.venueId,
      status: "WAITLIST",
      eventDate: {
        gte: new Date(`${dateIso}T00:00:00`),
        lte: new Date(`${dateIso}T23:59:59.999`)
      }
    },
    orderBy: { createdAt: "asc" },
    include: { venue: true }
  });

  const candidateWindow = input.startTime
    ? getBookingWindow(dateIso, input.startTime)
    : null;

  const next = candidates.find((row: any) => {
    const parsedRowComment = parseBookingComment(row.comment);
    if (normalizePlaceLabel(parsedRowComment.placeLabel) !== normalizePlaceLabel(input.placeLabel)) {
      return false;
    }
    if (!candidateWindow || !row.startTime) return true;
    const rowWindow = getExistingBookingWindow(row.eventDate, row.startTime);
    return rowWindow ? windowsOverlap(candidateWindow, rowWindow) : true;
  });

  if (!next) return null;

  await db.bookingRequest.update({
    where: { id: next.id },
    data: {
      status: "NEW",
      managerNote: "Переведено из листа ожидания — слот освободился"
    }
  });

  // Notify admin group about promotion
  await sendWaitlistPromotedNotification({
    companyId: next.venue?.companyId ?? null,
    venueId: next.venueId ?? null,
    bookingId: next.id,
    venueName: next.venue?.name ?? input.placeLabel,
    placeLabel: input.placeLabel,
    customerName: next.customerName,
    customerPhone: next.customerPhone,
    eventDate: next.eventDate,
    startTime: next.startTime
  }).catch(() => {});

  return next;
}

// Auto-confirm HOLD_PENDING bookings whose holdExpiresAt has passed
export async function autoConfirmExpiredHolds() {
  if (!prisma) return;
  const db = prisma as any;

  const expired = await db.bookingRequest.findMany({
    where: {
      status: "HOLD_PENDING",
      holdExpiresAt: { lte: new Date() }
    },
    select: { id: true, eventDate: true, startTime: true, venueId: true, comment: true }
  });

  if (!expired.length) return;

  await db.bookingRequest.updateMany({
    where: { id: { in: expired.map((r: any) => r.id) } },
    data: {
      status: "CONFIRMED",
      confirmedAt: new Date(),
      managerNote: "Автоподтверждение — резерв истёк"
    }
  });
}

// Archive WAITLIST bookings whose event time has already passed
export async function archiveExpiredWaitlistBookings(venueId?: string) {
  if (!prisma) return;
  const db = prisma as any;

  const now = new Date();

  const expired = await db.bookingRequest.findMany({
    where: {
      status: "WAITLIST",
      ...(venueId ? { venueId } : {}),
      eventDate: { lt: now }
    },
    select: { id: true }
  });

  if (!expired.length) return;

  await db.bookingRequest.updateMany({
    where: { id: { in: expired.map((r: any) => r.id) } },
    data: {
      status: "CANCELLED",
      managerNote: "Время ожидания истекло — заявка архивирована автоматически"
    }
  });

  // Also add to archive set
  const { archiveBooking } = await import("@/lib/booking-archive");
  await Promise.all(expired.map((r: any) => archiveBooking(r.id)));
}

export async function assignBookingTime(input: {
  bookingId: string;
  managerId: string;
  time: string;
  role: "superadmin" | "admin" | "manager";
}) {
  if (!prisma) throw getDatabaseUnavailableError();
  const db = prisma as any;

  const existing = await db.bookingRequest.findUnique({
    where: { id: input.bookingId },
    include: { venue: true }
  });

  if (!existing) throw new Error("Booking not found");
  if (input.role === "manager" && existing.managerId !== input.managerId) {
    throw new Error("Forbidden booking access");
  }

  const parsedComment = parseBookingComment(existing.comment);
  // eventDate was stored as UTC noon when no time — derive ISO date from it
  const eventDateIso = formatLocalDateIso(existing.eventDate);

  // Conflict check — same logic as confirm/hold
  if (existing.venueId && parsedComment.placeLabel && parsedComment.placeLabel !== "Без точки") {
    const conflict = await findOverlappingBooking(db, {
      venueId: existing.venueId,
      date: eventDateIso,
      time: input.time,
      placeLabel: parsedComment.placeLabel,
      tableId: parsedComment.tableId,
      roomName: parsedComment.roomName,
      excludeBookingId: existing.id
    });
    if (conflict) {
      throw new Error(`Слот ${input.time} уже занят другой бронью на этот стол. Выберите другое время.`);
    }
  }

  const newComment = buildBookingComment({
    placeLabel: parsedComment.placeLabel,
    slotLabel: input.time,
    note: parsedComment.note,
    telegram: parsedComment.telegram,
    tableId: parsedComment.tableId,
    roomName: parsedComment.roomName
  });
  const newEventDate = combineDateTime(eventDateIso, input.time);

  await db.bookingRequest.update({
    where: { id: input.bookingId },
    data: {
      startTime: input.time,
      eventDate: newEventDate,
      comment: newComment,
      managerNote: `Время назначено менеджером: ${input.time}`
    }
  });
}
