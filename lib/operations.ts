import {
  ACTIVE_BOOKING_STATUSES,
  getBookingWindow,
  getExistingBookingWindow,
  normalizePlaceLabel,
  windowsOverlap
} from "@/lib/booking-time-policy";
import { getArchivedBookingIds } from "@/lib/booking-archive";
import { buildBookingComment, parseBookingComment } from "@/lib/booking-comment";
import { getDatabaseUnavailableError, prisma } from "@/lib/prisma";
import { getCompanyTheme } from "@/lib/company-config";
import { getVenueEditorData } from "@/lib/venue-repository";
import type {
  CompanyThemeConfig,
  ManagerReminderItem,
  ManagerWaitlistEntry,
  ManualBookingPayload
} from "@/lib/types";

function combineDateTime(date: string, time?: string | null) {
  // When no time is provided we use UTC noon ("12:00:00Z") so that
  // toISOString().slice(0, 10) always returns the correct local date
  // regardless of the server's timezone offset (e.g. UTC+5 Tashkent).
  // Using local midnight "00:00:00" would shift the UTC date back one day.
  if (!time) {
    return new Date(`${date}T12:00:00Z`);
  }
  return new Date(`${date}T${time}:00`);
}

function formatLocalDateIso(date: Date | string) {
  const value = typeof date === "string" ? new Date(date) : date;
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

function formatDateTimeLabel(date: Date | string, time?: string | null) {
  const dateValue = typeof date === "string" ? new Date(date) : date;
  const formattedDate = new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit"
  }).format(dateValue);

  return time ? `${formattedDate} · ${time}` : formattedDate;
}

function normalizeTelegram(value?: string | null) {
  if (!value) {
    return undefined;
  }

  return value.startsWith("@") ? value : `@${value}`;
}

async function findOverlappingManualBooking(
  db: any,
  input: {
    venueId: string;
    date: string;
    time: string;
    placeLabel: string;
    tableId?: string;
    roomName?: string;
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
      }
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

function fmtNotifDate(date: Date, time?: string | null) {
  const d = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long" }).format(date);
  return time ? `${d} · ${time}` : d;
}

function buildNewBookingMessage(p: {
  venueName: string; placeLabel: string; name: string;
  phone?: string | null; date: Date; time?: string | null; guests?: number | null;
}) {
  return [
    `🆕 Новая заявка — ${p.venueName}`,
    ``,
    `📍 ${p.placeLabel}`,
    `👤 ${p.name}`,
    p.phone ? `📞 ${p.phone}` : null,
    `📅 ${fmtNotifDate(p.date, p.time)}`,
    p.guests ? `👥 ${p.guests} чел.` : null,
    ``,
    `→ Свяжитесь с клиентом для подтверждения`
  ].filter((l) => l !== null).join("\n");
}

function buildConfirmedMessage(p: {
  venueName: string; placeLabel: string; name: string;
  phone?: string | null; date: Date; time?: string | null; guests?: number | null;
}) {
  return [
    `✅ Бронь подтверждена — ${p.venueName}`,
    ``,
    `📍 ${p.placeLabel}`,
    `👤 ${p.name}`,
    p.phone ? `📞 ${p.phone}` : null,
    `📅 ${fmtNotifDate(p.date, p.time)}`,
    p.guests ? `👥 ${p.guests} чел.` : null
  ].filter((l) => l !== null).join("\n");
}

function buildManagerReminderMessage(p: {
  venueName: string; placeLabel: string; name: string;
  phone?: string | null; minutes: number;
}) {
  return [
    `⏰ Через ${p.minutes} мин — ${p.venueName}`,
    ``,
    `📍 ${p.placeLabel}`,
    `👤 ${p.name}`,
    p.phone ? `📞 ${p.phone}` : null,
    ``,
    `→ Уточните приезд клиента`
  ].filter((l) => l !== null).join("\n");
}

function buildArrivalCheckMessage(p: {
  venueName: string; placeLabel: string; name: string; phone?: string | null;
}) {
  return [
    `🕐 Время брони — прямо сейчас!`,
    ``,
    `📍 ${p.venueName} · ${p.placeLabel}`,
    `👤 ${p.name}`,
    p.phone ? `📞 ${p.phone}` : null,
    ``,
    `→ Пришёл? Задерживается → переведите в резерв. Не придёт → отмените`
  ].filter((l) => l !== null).join("\n");
}

function buildWaitlistPromotedMessage(p: {
  venueName: string; placeLabel: string; name: string;
  phone?: string | null; date: Date; time?: string | null;
}) {
  return [
    `🔔 Слот освободился — клиент в ожидании`,
    ``,
    `📍 ${p.venueName} · ${p.placeLabel}`,
    `👤 ${p.name}`,
    p.phone ? `📞 ${p.phone}` : null,
    `📅 ${fmtNotifDate(p.date, p.time)}`,
    ``,
    `→ Позвоните и подтвердите бронь`
  ].filter((l) => l !== null).join("\n");
}

function buildWalkinOccupiedMessage(p: {
  venueName: string; placeLabel: string; time: string;
}) {
  return `🪑 Стол занят — ${p.venueName}\n\n📍 ${p.placeLabel}\n🕐 ${p.time} (Walk-in)`;
}

function buildWalkinReleasedMessage(p: {
  venueName: string; placeLabel: string;
}) {
  return `✔️ Стол освобождён — ${p.venueName}\n\n📍 ${p.placeLabel}\n→ Стол снова свободен`;
}

function buildWalkinUpcomingWarningMessage(p: {
  venueName: string;
  placeLabel: string;
  time: string;
}) {
  return [
    `⚠️ Walk-in нужно завершить заранее`,
    ``,
    `📍 ${p.venueName} · ${p.placeLabel}`,
    `🕐 Ближайшая бронь: ${p.time}`,
    ``,
    `→ Предупредите гостя и подготовьте стол к следующей посадке`
  ].join("\n");
}

function buildCustomerReminderMessage(
  brandName: string,
  venueName: string,
  placeLabel: string,
  minutes: number
) {
  return `${brandName}: напоминаем, что через ${minutes} мин. у вас бронь ${placeLabel} в ${venueName}. Если планы изменились, ответьте на сообщение или свяжитесь с менеджером.`;
}

async function queueNotificationJob(input: {
  bookingRequestId?: string;
  companyId?: string;
  venueId?: string;
  kind: string;
  channel: string;
  recipient: string;
  recipientLabel?: string;
  message: string;
  scheduledAt: Date;
}) {
  const db = prisma as any;

  return db.notificationJob.create({
    data: {
      bookingRequestId: input.bookingRequestId ?? null,
      companyId: input.companyId ?? null,
      venueId: input.venueId ?? null,
      kind: input.kind,
      channel: input.channel,
      recipient: input.recipient,
      recipientLabel: input.recipientLabel ?? null,
      message: input.message,
      scheduledAt: input.scheduledAt,
      status: "PENDING"
    }
  });
}

async function clearPendingNotificationJobs(bookingId: string, kinds?: string[]) {
  const db = prisma as any;

  await db.notificationJob.updateMany({
    where: {
      bookingRequestId: bookingId,
      status: "PENDING",
      ...(kinds?.length ? { kind: { in: kinds } } : {})
    },
    data: {
      status: "CANCELLED",
      failedAt: new Date(),
      errorMessage: "Заменено новым состоянием брони"
    }
  });
}

export async function scheduleBookingNotifications(input: {
  bookingId: string;
  companyId?: string | null;
  venueId?: string | null;
  venueName: string;
  customerName: string;
  customerPhone?: string | null;
  customerTelegram?: string | null;
  guestCount?: number | null;
  placeLabel: string;
  eventDate: Date;
  startTime?: string | null;
  status: string;
}) {
  const companyTheme =
    input.companyId ? await getCompanyTheme(input.companyId) : null;
  const managerLead = companyTheme?.managerReminderLeadMinutes ?? 60;
  const customerLead = companyTheme?.customerReminderLeadMinutes ?? 30;
  const botName = companyTheme?.telegramBotName || companyTheme?.name || "Tudors Studio";
  const managerChatId = companyTheme?.telegramAdminChatId;
  const eventDateTime = input.startTime
    ? combineDateTime(input.eventDate.toISOString().slice(0, 10), input.startTime)
    : input.eventDate;
  const now = new Date();

  // Clear all existing pending notifications for this booking
  await clearPendingNotificationJobs(input.bookingId, [
    "new-booking",
    "booking-confirmed",
    "manager-reminder",
    "customer-reminder",
    "arrival-check",
    "waitlist-offer"
  ]);

  if (!["CONFIRMED", "HOLD_PENDING", "NEW"].includes(input.status)) {
    return;
  }

  const msgParams = {
    venueName: input.venueName,
    placeLabel: input.placeLabel,
    name: input.customerName,
    phone: input.customerPhone,
    date: input.eventDate,
    time: input.startTime,
    guests: input.guestCount
  };

  // ── 1. Immediate notification to admin group ──────────────────────────────
  if (managerChatId) {
    const isNew = input.status === "NEW";
    const isConfirmed = input.status === "CONFIRMED";

    if (isNew || isConfirmed) {
      await queueNotificationJob({
        bookingRequestId: input.bookingId,
        companyId: input.companyId ?? undefined,
        venueId: input.venueId ?? undefined,
        kind: isNew ? "new-booking" : "booking-confirmed",
        channel: "telegram-admin",
        recipient: managerChatId,
        recipientLabel: companyTheme?.telegramBotName || "Telegram admin",
        message: isNew ? buildNewBookingMessage(msgParams) : buildConfirmedMessage(msgParams),
        scheduledAt: now
      });
    }

    // ── 2. Reminder N minutes before event (CONFIRMED only) ────────────────
    if (isConfirmed && eventDateTime > now) {
      const reminderAt = new Date(eventDateTime.getTime() - managerLead * 60 * 1000);
      if (reminderAt > now) {
        await queueNotificationJob({
          bookingRequestId: input.bookingId,
          companyId: input.companyId ?? undefined,
          venueId: input.venueId ?? undefined,
          kind: "manager-reminder",
          channel: "telegram-admin",
          recipient: managerChatId,
          recipientLabel: companyTheme?.telegramBotName || "Telegram admin",
          message: buildManagerReminderMessage({
            venueName: input.venueName,
            placeLabel: input.placeLabel,
            name: input.customerName,
            phone: input.customerPhone,
            minutes: managerLead
          }),
          scheduledAt: reminderAt
        });
      }

      // ── 3. Arrival check AT event time ──────────────────────────────────
      if (input.startTime && eventDateTime > now) {
        await queueNotificationJob({
          bookingRequestId: input.bookingId,
          companyId: input.companyId ?? undefined,
          venueId: input.venueId ?? undefined,
          kind: "arrival-check",
          channel: "telegram-admin",
          recipient: managerChatId,
          recipientLabel: companyTheme?.telegramBotName || "Telegram admin",
          message: buildArrivalCheckMessage({
            venueName: input.venueName,
            placeLabel: input.placeLabel,
            name: input.customerName,
            phone: input.customerPhone
          }),
          scheduledAt: eventDateTime
        });
      }
    }
  }

  // ── 4. Customer reminder via Telegram ─────────────────────────────────────
  if (input.customerTelegram && input.status === "CONFIRMED" && eventDateTime > now) {
    const customerReminderAt = new Date(eventDateTime.getTime() - customerLead * 60 * 1000);
    if (customerReminderAt > now) {
      await queueNotificationJob({
        bookingRequestId: input.bookingId,
        companyId: input.companyId ?? undefined,
        venueId: input.venueId ?? undefined,
        kind: "customer-reminder",
        channel: "telegram-customer",
        recipient: input.customerTelegram,
        recipientLabel: input.customerTelegram,
        message: buildCustomerReminderMessage(
          botName,
          input.venueName,
          input.placeLabel,
          customerLead
        ),
        scheduledAt: customerReminderAt
      });
    }
  }
}

// Send walk-in notification (occupied or released) directly to admin group
export async function sendWalkinNotification(input: {
  companyId?: string | null;
  venueId?: string | null;
  venueName: string;
  placeLabel: string;
  time?: string;
  kind: "occupied" | "released";
}) {
  if (!prisma) return;
  const companyTheme = input.companyId ? await getCompanyTheme(input.companyId) : null;
  const managerChatId = companyTheme?.telegramAdminChatId;
  if (!managerChatId) return;

  await queueNotificationJob({
    companyId: input.companyId ?? undefined,
    venueId: input.venueId ?? undefined,
    kind: input.kind === "occupied" ? "walkin-occupied" : "walkin-released",
    channel: "telegram-admin",
    recipient: managerChatId,
    recipientLabel: companyTheme?.telegramBotName || "Telegram admin",
    message:
      input.kind === "occupied"
        ? buildWalkinOccupiedMessage({
            venueName: input.venueName,
            placeLabel: input.placeLabel,
            time: input.time || "—"
          })
        : buildWalkinReleasedMessage({
            venueName: input.venueName,
            placeLabel: input.placeLabel
          }),
    scheduledAt: new Date()
  });
}

export async function queueWalkinUpcomingWarning(input: {
  bookingId: string;
  companyId?: string | null;
  venueId?: string | null;
  venueName: string;
  placeLabel: string;
  bookingTime: string;
  scheduledAt: Date;
}) {
  if (!prisma) return;
  const companyTheme = input.companyId ? await getCompanyTheme(input.companyId) : null;
  const managerChatId = companyTheme?.telegramAdminChatId;
  if (!managerChatId) return;

  await queueNotificationJob({
    bookingRequestId: input.bookingId,
    companyId: input.companyId ?? undefined,
    venueId: input.venueId ?? undefined,
    kind: "walkin-upcoming-warning",
    channel: "telegram-admin",
    recipient: managerChatId,
    recipientLabel: companyTheme?.telegramBotName || "Telegram admin",
    message: buildWalkinUpcomingWarningMessage({
      venueName: input.venueName,
      placeLabel: input.placeLabel,
      time: input.bookingTime
    }),
    scheduledAt: input.scheduledAt
  });
}

// Send notification when a waitlist booking is promoted to NEW
export async function sendWaitlistPromotedNotification(input: {
  companyId?: string | null;
  venueId?: string | null;
  bookingId: string;
  venueName: string;
  placeLabel: string;
  customerName: string;
  customerPhone?: string | null;
  eventDate: Date;
  startTime?: string | null;
}) {
  if (!prisma) return;
  const companyTheme = input.companyId ? await getCompanyTheme(input.companyId) : null;
  const managerChatId = companyTheme?.telegramAdminChatId;
  if (!managerChatId) return;

  await queueNotificationJob({
    bookingRequestId: input.bookingId,
    companyId: input.companyId ?? undefined,
    venueId: input.venueId ?? undefined,
    kind: "waitlist-promoted",
    channel: "telegram-admin",
    recipient: managerChatId,
    recipientLabel: companyTheme?.telegramBotName || "Telegram admin",
    message: buildWaitlistPromotedMessage({
      venueName: input.venueName,
      placeLabel: input.placeLabel,
      name: input.customerName,
      phone: input.customerPhone,
      date: input.eventDate,
      time: input.startTime
    }),
    scheduledAt: new Date()
  });
}

export async function createWaitlistEntry(payload: {
  venueId: string;
  venueName: string;
  sceneId: string;
  sceneTitle: string;
  hotspotId?: string;
  hotspotLabel?: string;
  name: string;
  phone: string;
  telegram?: string;
  date?: string;
  time?: string;
}) {
  if (!prisma) {
    throw getDatabaseUnavailableError();
  }

  const db = prisma as any;
  const venue = await getVenueEditorData(payload.venueId);

  return db.waitlistEntry.create({
    data: {
      venueId: payload.venueId,
      companyId: venue?.companyId ?? null,
      managerId: venue?.ownerManagerId ?? null,
      sceneId: payload.sceneId,
      sceneTitle: payload.sceneTitle,
      hotspotId: payload.hotspotId ?? null,
      hotspotLabel: payload.hotspotLabel ?? payload.sceneTitle,
      customerName: payload.name,
      customerPhone: payload.phone,
      customerTelegram: normalizeTelegram(payload.telegram) ?? null,
      requestedDate: payload.date ? combineDateTime(payload.date, payload.time) : null,
      requestedTime: payload.time ?? null,
      status: "ACTIVE"
    }
  });
}

export async function listManagerWaitlist(input: {
  companyId: string;
  managerId: string;
  role: "superadmin" | "admin" | "manager";
  includeHistory?: boolean;
}): Promise<ManagerWaitlistEntry[]> {
  if (!prisma) {
    return [];
  }

  const db = prisma as any;
  const rows = await db.waitlistEntry.findMany({
    where: {
      ...(input.role === "superadmin" ? {} : { companyId: input.companyId }),
      ...(input.role === "manager" ? { managerId: input.managerId } : {}),
      status: {
        in: input.includeHistory
          ? ["ACTIVE", "CONTACTED", "RESOLVED", "CANCELLED"]
          : ["ACTIVE", "CONTACTED"]
      }
    },
    orderBy: {
      createdAt: "asc"
    }
  });

  return Promise.all(
    rows.map(async (row: any) => {
      const venue = await getVenueEditorData(row.venueId);

      return {
        id: row.id,
        companyId: row.companyId ?? input.companyId,
        venueId: row.venueId,
        venueName: venue?.name || "Без площадки",
        customerName: row.customerName,
        customerPhone: row.customerPhone,
        customerTelegram: row.customerTelegram || undefined,
        hotspotLabel: row.hotspotLabel || row.sceneTitle || "Без точки",
        requestedAtLabel: formatDateTimeLabel(row.createdAt),
        requestedSlotLabel:
          row.requestedDate && row.requestedTime
            ? formatDateTimeLabel(row.requestedDate, row.requestedTime)
            : undefined,
        status:
          row.status === "CONTACTED"
            ? "contacted"
            : row.status === "RESOLVED"
              ? "resolved"
              : row.status === "CANCELLED"
                ? "cancelled"
                : "active",
        note: row.note || undefined,
        requestedDateIso: row.requestedDate ? formatLocalDateIso(row.requestedDate) : undefined,
        requestedTimeRaw: row.requestedTime || undefined
      };
    })
  );
}

export async function listManagerReminders(input: {
  companyId: string;
  role: "superadmin" | "admin" | "manager";
}): Promise<ManagerReminderItem[]> {
  if (!prisma) {
    return [];
  }

  const db = prisma as any;
  const rows = await db.notificationJob.findMany({
    where: {
      ...(input.role === "superadmin" ? {} : { companyId: input.companyId }),
      status: {
        in: ["PENDING", "SENT", "FAILED"]
      }
    },
    include: {
      bookingRequest: {
        include: {
          venue: true
        }
      }
    },
    orderBy: {
      scheduledAt: "asc"
    },
    take: 20
  });

  return rows.map((row: any) => {
    const parsed = parseBookingComment(row.bookingRequest?.comment);

    return {
      id: row.id,
      companyId: row.companyId ?? input.companyId,
      bookingId: row.bookingRequestId ?? undefined,
      venueName: row.bookingRequest?.venue?.name || "Без площадки",
      customerName: row.bookingRequest?.customerName || undefined,
      placeLabel: parsed.placeLabel,
      scheduledAtLabel: formatDateTimeLabel(row.scheduledAt),
      message: row.message,
      status:
        row.status === "SENT" ? "sent" : row.status === "FAILED" ? "failed" : "pending",
      channel: row.channel,
      recipientLabel: row.recipientLabel || row.recipient,
      scheduledAtIso: row.scheduledAt ? formatLocalDateIso(row.scheduledAt) : undefined
    };
  });
}

export async function createManualBooking(input: ManualBookingPayload, managerId: string) {
  if (!prisma) {
    throw getDatabaseUnavailableError();
  }

  const db = prisma as any;
  const venue = await getVenueEditorData(input.venueId);

  if (!venue) {
    throw new Error("Объект не найден");
  }

  const eventDate = combineDateTime(input.date, input.time);
  const telegram = normalizeTelegram(input.telegram);
  const comment = buildBookingComment({
    placeLabel: input.hotspotLabel,
    slotLabel: input.time,
    note: input.note,
    telegram,
    tableId: input.tableId,
    roomName: input.roomName
  });

  // Conflict check is skipped for WAITLIST — the whole point is that the slot is occupied
  if (input.time && input.status !== "WAITLIST") {
    const conflictingBooking = await findOverlappingManualBooking(db, {
      venueId: venue.id,
      date: input.date,
      time: input.time,
      placeLabel: input.hotspotLabel,
      tableId: input.tableId,
      roomName: input.roomName
    });

    if (conflictingBooking) {
      throw new Error("Этот стол уже занят или слишком близок по времени к другой брони.");
    }
  }

  const booking = await db.bookingRequest.create({
    data: {
      venueId: venue.id,
      managerId,
      eventType: venue.vertical,
      guestCount: input.guests,
      eventDate,
      startTime: input.time,
      customerName: input.name,
      customerPhone: input.phone,
      comment,
      sourceLabel: "Manager booking",
      holdExpiresAt:
        input.status === "HOLD_PENDING" ? new Date(Date.now() + 30 * 60 * 1000) : null,
      confirmedAt: input.status === "CONFIRMED" ? new Date() : null,
      status: input.status || "CONFIRMED",
      managerNote: "Создано из админки"
    },
    include: {
      venue: true
    }
  });

  await scheduleBookingNotifications({
    bookingId: booking.id,
    companyId: venue.companyId,
    venueId: venue.id,
    venueName: venue.name,
    customerName: booking.customerName,
    customerPhone: input.phone,
    customerTelegram: telegram,
    guestCount: input.guests,
    placeLabel: input.hotspotLabel,
    eventDate: booking.eventDate,
    startTime: booking.startTime,
    status: booking.status
  });

  return booking;
}

export async function createWalkinBooking(input: {
  venueId: string;
  date: string;
  tableLabel: string;
  tableId?: string;
  roomName?: string;
  managerId: string;
  upcomingBookingTime?: string;
}) {
  if (!prisma) throw getDatabaseUnavailableError();
  const db = prisma as any;

  const venue = await getVenueEditorData(input.venueId);
  if (!venue) throw new Error("Объект не найден");

  const now = new Date();
  const timeStr = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const eventDate = combineDateTime(input.date, timeStr);
  const comment = buildBookingComment({
    placeLabel: input.tableLabel,
    slotLabel: timeStr,
    tableId: input.tableId,
    roomName: input.roomName
  });
  const archivedBookingIds = await getArchivedBookingIds();

  const existingWalkins = await db.bookingRequest.findMany({
    where: {
      venueId: venue.id,
      eventDate: {
        gte: new Date(`${input.date}T00:00:00`),
        lte: new Date(`${input.date}T23:59:59.999`)
      },
      status: {
        in: [...ACTIVE_BOOKING_STATUSES]
      },
      sourceLabel: "Walk-in"
    },
    select: {
      id: true,
      comment: true
    }
  });

  const sameTableWalkin = existingWalkins.find((row: any) => {
    if (archivedBookingIds.has(row.id)) {
      return false;
    }

    const parsed = parseBookingComment(row.comment);

    if (parsed.tableId && input.tableId) {
      return parsed.tableId === input.tableId;
    }

    if (parsed.roomName && input.roomName) {
      return (
        normalizePlaceLabel(parsed.roomName) === normalizePlaceLabel(input.roomName) &&
        normalizePlaceLabel(parsed.placeLabel) === normalizePlaceLabel(input.tableLabel)
      );
    }

    return normalizePlaceLabel(parsed.placeLabel) === normalizePlaceLabel(input.tableLabel);
  });

  if (sameTableWalkin) {
    throw new Error("Этот стол уже отмечен занятым");
  }

  const booking = await db.bookingRequest.create({
    data: {
      venueId: venue.id,
      managerId: input.managerId,
      eventType: venue.vertical,
      guestCount: 1,
      eventDate,
      startTime: timeStr,
      customerName: "Walk-in",
      customerPhone: "—",
      comment,
      sourceLabel: "Walk-in",
      status: "CONFIRMED",
      confirmedAt: now,
      managerNote: "Гость без брони"
    }
  });

  // Notify admin group about walk-in
  await sendWalkinNotification({
    companyId: venue.companyId,
    venueId: venue.id,
    venueName: venue.name,
    placeLabel: input.tableLabel,
    time: timeStr,
    kind: "occupied"
  }).catch(() => {});

  if (input.upcomingBookingTime) {
    const bookingAt = new Date(`${input.date}T${input.upcomingBookingTime}:00`);
    const warningAt = new Date(bookingAt.getTime() - 30 * 60 * 1000);
    await queueWalkinUpcomingWarning({
      bookingId: booking.id,
      companyId: venue.companyId,
      venueId: venue.id,
      venueName: venue.name,
      placeLabel: input.tableLabel,
      bookingTime: input.upcomingBookingTime,
      scheduledAt: warningAt > now ? warningAt : now
    }).catch(() => {});
  }

  return booking;
}

export async function processNotificationQueue(companyId?: string) {
  if (!prisma) {
    return 0;
  }

  const db = prisma as any;
  const jobs = await db.notificationJob.findMany({
    where: {
      status: "PENDING",
      scheduledAt: {
        lte: new Date()
      },
      ...(companyId ? { companyId } : {})
    },
    orderBy: {
      scheduledAt: "asc"
    },
    take: 25
  });

  const token = process.env.TELEGRAM_BOT_TOKEN;
  let processed = 0;

  for (const job of jobs) {
    try {
      if (token && job.channel === "telegram-admin" && /^-?\\d+$/.test(job.recipient)) {
        const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            chat_id: job.recipient,
            text: job.message
          })
        });

        if (!response.ok) {
          throw new Error(`Telegram API ${response.status}`);
        }
      }

      await db.notificationJob.update({
        where: { id: job.id },
        data: {
          status: "SENT",
          sentAt: new Date(),
          errorMessage: null
        }
      });
      processed += 1;
    } catch (error) {
      await db.notificationJob.update({
        where: { id: job.id },
        data: {
          status: "FAILED",
          failedAt: new Date(),
          errorMessage: error instanceof Error ? error.message : "Unknown notification error"
        }
      });
    }
  }

  return processed;
}

export async function offerWaitlistEntry(entryId: string, managerId: string) {
  if (!prisma) {
    throw getDatabaseUnavailableError();
  }

  const db = prisma as any;
  const entry = await db.waitlistEntry.findUnique({
    where: {
      id: entryId
    }
  });

  if (!entry) {
    throw new Error("Запись waitlist не найдена");
  }

  const venue = await getVenueEditorData(entry.venueId);
  const companyTheme =
    venue?.companyId ? await getCompanyTheme(venue.companyId) : null;

  await db.waitlistEntry.update({
    where: { id: entryId },
    data: {
      status: "CONTACTED",
      contactedAt: new Date(),
      managerId,
      note: "Передано менеджеру на связь после освобождения подходящего места"
    }
  });

  if (companyTheme?.telegramAdminChatId) {
    await queueNotificationJob({
      companyId: venue?.companyId ?? undefined,
      venueId: venue?.id ?? undefined,
      kind: "waitlist-offer",
      channel: "telegram-admin",
      recipient: companyTheme.telegramAdminChatId,
      recipientLabel: companyTheme.telegramBotName || "Telegram admin",
      message: `${venue?.name || "Площадка"}: свяжитесь с ${entry.customerName} по листу ожидания (${entry.hotspotLabel || "без точки"}) и вручную согласуйте бронь.`,
      scheduledAt: new Date()
    });
  }
}

export async function resolveWaitlistEntry(
  entryId: string,
  managerId: string,
  reason: "no-response" | "responded" | "closed"
) {
  if (!prisma) {
    throw getDatabaseUnavailableError();
  }

  const db = prisma as any;
  const entry = await db.waitlistEntry.findUnique({
    where: {
      id: entryId
    }
  });

  if (!entry) {
    throw new Error("Запись waitlist не найдена");
  }

  await db.waitlistEntry.update({
    where: { id: entryId },
    data: {
      status: "RESOLVED",
      resolvedAt: new Date(),
      managerId,
      note:
        reason === "no-response"
          ? "Клиент не ответил, запись закрыта администратором"
          : reason === "responded"
            ? "Клиент ответил, ожидание закрыто и можно оформить бронь"
          : "Запись закрыта администратором"
    }
  });
}
