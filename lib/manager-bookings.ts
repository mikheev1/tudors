import { archiveBooking, getArchivedBookingIds, restoreBooking } from "@/lib/booking-archive";
import { getCompanyThemes, getManagersByCompany } from "@/lib/company-config";
import { venues } from "@/lib/data";
import { offerWaitlistEntry, scheduleBookingNotifications } from "@/lib/operations";
import { prisma } from "@/lib/prisma";
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
  }
}

function parseBookingComment(comment?: string | null) {
  const parts = (comment || "")
    .split("|")
    .map((item) => item.trim())
    .filter(Boolean);

  const placeLabel = parts[0] || "Без точки";
  const slotLabel = parts[1] || undefined;
  const telegram = parts.find((item) => item.startsWith("TG:"))?.replace("TG:", "").trim() || undefined;

  return {
    placeLabel,
    slotLabel,
    telegram
  };
}

async function ensureCompanyAndManagers(companyId: string) {
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
      eventDateIso: row.eventDate ? new Date(row.eventDate).toISOString().slice(0, 10) : undefined,
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

  const parsedComment = parseBookingComment(existing.comment);

  if ((input.action === "confirm" || input.action === "hold") && existing.venueId && existing.eventDate && existing.startTime) {
    const conflictingBooking = await db.bookingRequest.findFirst({
      where: {
        id: {
          not: existing.id
        },
        venueId: existing.venueId,
        eventDate: existing.eventDate,
        startTime: existing.startTime,
        status: {
          in: ["HOLD_PENDING", "PENDING", "CONFIRMED", "NEW"]
        },
        ...(parsedComment.placeLabel && parsedComment.placeLabel !== "Без точки"
          ? {
              comment: {
                contains: parsedComment.placeLabel
              }
            }
          : {})
      }
    });

    if (conflictingBooking) {
      throw new Error("Этот слот уже занят другой заявкой.");
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
    const requestedDateIso = existing.eventDate
      ? new Date(existing.eventDate).toISOString().slice(0, 10)
      : undefined;
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
