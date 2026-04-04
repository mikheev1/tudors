import { prisma } from "@/lib/prisma";
import { getCompanyTheme } from "@/lib/company-config";
import { getVenueEditorData } from "@/lib/venue-repository";
import type {
  CompanyThemeConfig,
  ManagerReminderItem,
  ManagerWaitlistEntry,
  ManualBookingPayload
} from "@/lib/types";

function combineDateTime(date: string, time?: string | null) {
  return new Date(`${date}T${time || "00:00"}:00`);
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

function parseBookingComment(comment?: string | null) {
  const parts = (comment || "")
    .split("|")
    .map((item) => item.trim())
    .filter(Boolean);

  return {
    placeLabel: parts[0] || "Без точки",
    slotLabel: parts[1] || undefined
  };
}

function buildManagerReminderMessage(
  venueName: string,
  placeLabel: string,
  customerName: string,
  minutes: number
) {
  return `${venueName}: через ${minutes} мин. бронь на ${placeLabel} для ${customerName}. Позвоните и подтвердите приезд.`;
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
  customerTelegram?: string | null;
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
    ? combineDateTime(
        input.eventDate.toISOString().slice(0, 10),
        input.startTime
      )
    : input.eventDate;

  await clearPendingNotificationJobs(input.bookingId, [
    "manager-reminder",
    "customer-reminder",
    "waitlist-offer"
  ]);

  if (!["CONFIRMED", "HOLD_PENDING", "NEW"].includes(input.status)) {
    return;
  }

  const managerReminderAt = new Date(eventDateTime.getTime() - managerLead * 60 * 1000);
  const customerReminderAt = new Date(eventDateTime.getTime() - customerLead * 60 * 1000);

  if (managerChatId) {
    await queueNotificationJob({
      bookingRequestId: input.bookingId,
      companyId: input.companyId ?? undefined,
      venueId: input.venueId ?? undefined,
      kind: "manager-reminder",
      channel: "telegram-admin",
      recipient: managerChatId,
      recipientLabel: companyTheme?.telegramBotName || "Telegram admin",
      message: buildManagerReminderMessage(
        input.venueName,
        input.placeLabel,
        input.customerName,
        managerLead
      ),
      scheduledAt: managerReminderAt
    });
  }

  if (input.customerTelegram) {
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
        requestedDateIso: row.requestedDate
          ? new Date(row.requestedDate).toISOString().slice(0, 10)
          : undefined,
        requestedTimeRaw: row.requestedTime || undefined
      };
    })
  );
}

export async function listManagerReminders(input: {
  companyId: string;
  role: "superadmin" | "admin" | "manager";
}): Promise<ManagerReminderItem[]> {
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
      scheduledAtIso: row.scheduledAt
        ? new Date(row.scheduledAt).toISOString().slice(0, 10)
        : undefined
    };
  });
}

export async function createManualBooking(input: ManualBookingPayload, managerId: string) {
  const db = prisma as any;
  const venue = await getVenueEditorData(input.venueId);

  if (!venue) {
    throw new Error("Объект не найден");
  }

  const eventDate = combineDateTime(input.date, input.time);
  const telegram = normalizeTelegram(input.telegram);
  const comment = [input.hotspotLabel, input.time, input.note, telegram ? `TG: ${telegram}` : ""]
    .filter(Boolean)
    .join(" | ");

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
    customerTelegram: telegram,
    placeLabel: input.hotspotLabel,
    eventDate: booking.eventDate,
    startTime: booking.startTime,
    status: booking.status
  });

  return booking;
}

export async function processNotificationQueue(companyId?: string) {
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
