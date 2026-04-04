"use client";

import type { CSSProperties, FormEvent } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";

import type {
  CompanyThemeConfig,
  ManagerAction,
  ManagerBooking,
  ManagerListing,
  ManagerReminderItem,
  ManagerWaitlistEntry,
  Venue
} from "@/lib/types";

function PhoneIcon() {
  return (
    <svg aria-hidden="true" fill="none" height="18" viewBox="0 0 20 20" width="18">
      <path
        d="M5.55 2.5h2.2c.39 0 .73.27.82.65l.75 3.23a.84.84 0 0 1-.24.8L7.5 8.73a11.45 11.45 0 0 0 3.77 3.77l1.55-1.58a.84.84 0 0 1 .8-.24l3.23.75c.38.09.65.43.65.82v2.2a1.05 1.05 0 0 1-1.05 1.05A13.95 13.95 0 0 1 2.5 3.55 1.05 1.05 0 0 1 3.55 2.5Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.6"
      />
    </svg>
  );
}

function TelegramIcon() {
  return (
    <svg aria-hidden="true" fill="none" height="18" viewBox="0 0 20 20" width="18">
      <path
        d="M17.36 3.02 2.9 8.6c-.99.4-.98.96-.18 1.2l3.71 1.16 1.43 4.44c.17.48.08.67.6.67.4 0 .58-.19.8-.42l2-1.94 4.15 3.06c.77.42 1.32.2 1.51-.72l2.46-11.62c.28-1.13-.43-1.64-1.35-1.41Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.35"
      />
      <path d="m6.82 10.7 8.28-5.22" stroke="currentColor" strokeLinecap="round" strokeWidth="1.35" />
    </svg>
  );
}

type ManagerDashboardProps = {
  bookings: ManagerBooking[];
  listings: ManagerListing[];
  companies: CompanyThemeConfig[];
  companyTheme: CompanyThemeConfig;
  managerName: string;
  operationalVenues: Venue[];
  reminders: ManagerReminderItem[];
  role: "superadmin" | "admin" | "manager";
  waitlistEntries: ManagerWaitlistEntry[];
};

type DashboardTab = "overview" | "bookings" | "archive" | "manual" | "waitlist" | "reminders";
type BookingBoardColumnKey = "new" | "hold_pending" | "confirmed" | "waitlist" | "waitlist_entries" | "declined";
type BookingBoardItem =
  | { kind: "booking"; id: string; booking: ManagerBooking }
  | { kind: "waitlist"; id: string; entry: ManagerWaitlistEntry };

type NoticeState = {
  id: number;
  kind: "success" | "info" | "error";
  message: string;
  actionLabel?: string;
  targetTab?: DashboardTab;
};

type ConfirmState = {
  title: string;
  description: string;
  confirmLabel: string;
  tone?: "default" | "danger";
  onConfirm: () => void;
};

function getTodayIso() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function formatOperationalDate(value: string) {
  if (!value) {
    return "без даты";
  }

  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    weekday: "long"
  }).format(new Date(`${value}T00:00:00`));
}

function formatTime(value?: string) {
  return value || "без времени";
}

function slugifyPhone(value: string) {
  return value.replace(/[^\d+]/g, "");
}

function buildOperationalTimeline(startHour = 11, endHour = 23) {
  const slots: string[] = [];

  for (let hour = startHour; hour <= endHour; hour += 1) {
    slots.push(`${String(hour).padStart(2, "0")}:00`);
  }

  return slots;
}

function getActionConfirmationText(action: ManagerAction) {
  switch (action) {
    case "cancel":
      return "Снять уже активную бронь? Слот освободится, и его можно будет отдать другому клиенту.";
    case "decline":
      return "Не подтверждать входящую заявку? Она уйдет из активной очереди.";
    case "waitlist":
      return "Перевести заявку в лист ожидания?";
    case "archive":
      return "Убрать заявку из рабочего потока в архив?";
    case "restore":
      return "Вернуть заявку из архива обратно в работу?";
    case "hold":
      return "Поставить бронь во временный резерв на 30 минут?";
    case "confirm":
    default:
      return "";
  }
}

const actionLabels: Record<ManagerAction, string> = {
  confirm: "Подтвердить",
  decline: "Не подтверждать",
  hold: "Резерв 30 мин",
  waitlist: "В ожидание",
  cancel: "Снять бронь",
  archive: "Архивировать",
  restore: "Вернуть в работу"
};

const bookingBoardColumns: Array<{
  key: BookingBoardColumnKey;
  title: string;
  hint: string;
}> = [
  { key: "new", title: "Новые", hint: "Ждут решения" },
  { key: "hold_pending", title: "Резерв", hint: "Временное удержание" },
  { key: "confirmed", title: "Подтверждены", hint: "Активные брони" },
  { key: "waitlist", title: "Ожидание", hint: "Заявки без свободного слота" },
  { key: "waitlist_entries", title: "Лист ожидания", hint: "Отдельная очередь клиентов" },
  { key: "declined", title: "Закрыты", hint: "Отклонены или сняты" }
];

const SUPPORT_TELEGRAM_HANDLE = "@fdaffdklafjew";
const SUPPORT_TELEGRAM_URL = "https://t.me/fdaffdklafjew";

function getBookingStatusMeta(booking: ManagerBooking) {
  if (booking.status === "declined") {
    if (booking.managerNote.toLowerCase().includes("отмен")) {
      return {
        shortLabel: "Снята",
        detailLabel: "Бронь снята после создания",
        tone: "cancelled"
      } as const;
    }

    if (booking.managerNote.toLowerCase().includes("отклон")) {
      return {
        shortLabel: "Не подтверждена",
        detailLabel: "Входящая заявка отклонена",
        tone: "declined"
      } as const;
    }
  }

  if (booking.status === "hold_pending") {
    return {
      shortLabel: "Резерв",
      detailLabel: "Держим слот 30 минут",
      tone: "hold"
    } as const;
  }

  if (booking.status === "confirmed") {
    return {
      shortLabel: "Подтверждена",
      detailLabel: "Слот закреплен за клиентом",
      tone: "confirmed"
    } as const;
  }

  if (booking.status === "waitlist") {
    return {
      shortLabel: "Ожидание",
      detailLabel: "Клиент в листе ожидания",
      tone: "waitlist"
    } as const;
  }

  return {
    shortLabel: "Новая",
    detailLabel: "Ждет решения менеджера",
    tone: "new"
  } as const;
}

function getWaitlistEntryMeta(entry: ManagerWaitlistEntry) {
  if (entry.status === "contacted") {
    return {
      shortLabel: "На связи",
      tone: "hold"
    } as const;
  }

  return {
    shortLabel: "Ожидание",
    tone: "waitlist"
  } as const;
}

function getBoardMoveAction(
  booking: ManagerBooking,
  targetStatus: BookingBoardColumnKey
): ManagerAction | null {
  if (booking.status === targetStatus) {
    return null;
  }

  switch (targetStatus) {
    case "confirmed":
      return statusActions[booking.status].includes("confirm") ? "confirm" : null;
    case "hold_pending":
      return statusActions[booking.status].includes("hold") ? "hold" : null;
    case "waitlist":
      return statusActions[booking.status].includes("waitlist") ? "waitlist" : null;
    case "declined":
      if (booking.status === "confirmed") {
        return statusActions[booking.status].includes("cancel") ? "cancel" : null;
      }

      return statusActions[booking.status].includes("decline") ? "decline" : null;
    case "waitlist_entries":
    case "new":
    default:
      return null;
  }
}

const statusActions: Record<ManagerBooking["status"], ManagerAction[]> = {
  new: ["confirm", "hold", "decline", "cancel"],
  hold_pending: ["confirm", "waitlist", "decline", "cancel"],
  confirmed: ["hold", "cancel"],
  waitlist: ["confirm", "decline"],
  declined: ["confirm"]
};

export function ManagerDashboard({
  bookings,
  listings,
  companies,
  companyTheme,
  managerName,
  operationalVenues,
  reminders,
  role,
  waitlistEntries
}: ManagerDashboardProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const [notice, setNotice] = useState<NoticeState | null>(null);
  const [selectedVenueId, setSelectedVenueId] = useState(operationalVenues[0]?.id ?? "");
  const [selectedHotspotId, setSelectedHotspotId] = useState("");
  const [activeTab, setActiveTab] = useState<DashboardTab>("overview");
  const [selectedSceneId, setSelectedSceneId] = useState("");
  const [operationalDate, setOperationalDate] = useState(getTodayIso());
  const [manualDate, setManualDate] = useState(getTodayIso());
  const [manualTime, setManualTime] = useState("");
  const [pendingManualTime, setPendingManualTime] = useState("");
  const [manualSlots, setManualSlots] = useState<Array<{ time: string; label: string; status: string }>>([]);
  const [isManualSlotLoading, setIsManualSlotLoading] = useState(false);
  const [superadminPage, setSuperadminPage] = useState(1);
  const [draggedBookingId, setDraggedBookingId] = useState<string | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<BookingBoardColumnKey | null>(null);
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null);
  const [archiveQuery, setArchiveQuery] = useState("");
  const [archiveStatusFilter, setArchiveStatusFilter] = useState<"all" | ManagerBooking["status"]>("all");
  const [archiveDateFilter, setArchiveDateFilter] = useState("");
  const manualFormRef = useRef<HTMLFormElement | null>(null);
  const superadminPageSize = 8;
  const superadminPageCount = Math.max(1, Math.ceil(listings.length / superadminPageSize));

  function pushNotice(next: Omit<NoticeState, "id">) {
    setNotice({
      id: Date.now(),
      ...next
    });
  }

  function openConfirmDialog(config: Omit<ConfirmState, "onConfirm"> & { onConfirm: () => void }) {
    setConfirmState({
      ...config,
      onConfirm: () => {
        setConfirmState(null);
        config.onConfirm();
      }
    });
  }

  useEffect(() => {
    if (!notice) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setNotice((current) => (current?.id === notice.id ? null : current));
    }, 4200);

    return () => window.clearTimeout(timeout);
  }, [notice]);

  useEffect(() => {
    setSuperadminPage((current) => Math.min(current, superadminPageCount));
  }, [superadminPageCount]);

  useEffect(() => {
    if (role === "superadmin") {
      return;
    }

    let disposed = false;

    const processNotificationsSilently = async () => {
      if (disposed || document.visibilityState !== "visible") {
        return;
      }

      try {
        await fetch("/api/admin/notifications/process", {
          method: "POST"
        });
      } catch {
        // Silent background sync for notification queue.
      }
    };

    void processNotificationsSilently();
    const interval = window.setInterval(() => {
      void processNotificationsSilently();
    }, 60_000);

    return () => {
      disposed = true;
      window.clearInterval(interval);
    };
  }, [role]);

  const pagedListings = useMemo(() => {
    if (role !== "superadmin") {
      return listings;
    }

    const start = (superadminPage - 1) * superadminPageSize;
    return listings.slice(start, start + superadminPageSize);
  }, [listings, role, superadminPage]);

  const stats = {
    listingsCount: listings.length,
    bookingsCount: bookings.filter((item) => !item.archived).length,
    newCount: bookings.filter((item) => !item.archived && item.status === "new").length,
    holdCount: bookings.filter((item) => !item.archived && item.status === "hold_pending").length,
    archivedCount: bookings.filter((item) => item.archived).length
  };
  const selectedVenue = useMemo(
    () => operationalVenues.find((venue) => venue.id === selectedVenueId) ?? operationalVenues[0] ?? null,
    [operationalVenues, selectedVenueId]
  );
  const operationalTimeline = useMemo(
    () =>
      selectedVenue?.bookingSlots && selectedVenue.bookingSlots.length > 0
        ? selectedVenue.bookingSlots
        : buildOperationalTimeline(),
    [selectedVenue]
  );
  const bookablePoints = useMemo(
    () =>
      selectedVenue
        ? selectedVenue.scenes.flatMap((scene) =>
            scene.hotspots
              .filter((hotspot) => hotspot.kind !== "scene")
              .map((hotspot) => ({
                id: hotspot.id,
                label: hotspot.heading ?? hotspot.label,
                floorPlanLabel: scene.floorPlanLabel,
                sceneTitle: scene.title,
                status: hotspot.status,
                kind: hotspot.kind,
                yaw: hotspot.yaw ?? 0,
                pitch: hotspot.pitch ?? 0
              }))
          )
        : [],
    [selectedVenue]
  );
  const manualScenes = selectedVenue?.scenes ?? [];
  const selectedManualScene =
    manualScenes.find((scene) => scene.id === selectedSceneId) ?? manualScenes[0] ?? null;
  const selectedScenePoints = useMemo(
    () =>
      bookablePoints.filter((point) =>
        selectedManualScene ? point.sceneTitle === selectedManualScene.title : true
      ),
    [bookablePoints, selectedManualScene]
  );
  const selectedPoint = useMemo(
    () => bookablePoints.find((point) => point.id === selectedHotspotId) ?? bookablePoints[0] ?? null,
    [bookablePoints, selectedHotspotId]
  );
  const bookingsForOperationalDate = useMemo(
    () => bookings.filter((booking) => !booking.eventDateIso || booking.eventDateIso === operationalDate),
    [bookings, operationalDate]
  );
  const activeBookingsForOperationalDate = useMemo(
    () => bookingsForOperationalDate.filter((booking) => !booking.archived),
    [bookingsForOperationalDate]
  );
  const archivedBookingsForOperationalDate = useMemo(
    () => bookingsForOperationalDate.filter((booking) => booking.archived),
    [bookingsForOperationalDate]
  );
  const archivedBookings = useMemo(
    () => bookings.filter((booking) => booking.archived),
    [bookings]
  );
  const filteredArchivedBookings = useMemo(() => {
    const query = archiveQuery.trim().toLowerCase();

    return archivedBookings.filter((booking) => {
      const matchesQuery =
        !query ||
        booking.customerName.toLowerCase().includes(query) ||
        booking.placeLabel.toLowerCase().includes(query) ||
        booking.phone.toLowerCase().includes(query) ||
        booking.dateLabel.toLowerCase().includes(query);
      const matchesStatus = archiveStatusFilter === "all" || booking.status === archiveStatusFilter;
      const matchesDate = !archiveDateFilter || booking.eventDateIso === archiveDateFilter;

      return matchesQuery && matchesStatus && matchesDate;
    });
  }, [archiveDateFilter, archiveQuery, archiveStatusFilter, archivedBookings]);
  const waitlistForOperationalDate = useMemo(
    () =>
      waitlistEntries.filter(
        (entry) => !entry.requestedDateIso || entry.requestedDateIso === operationalDate
      ),
    [operationalDate, waitlistEntries]
  );
  const activeWaitlistForOperationalDate = useMemo(
    () =>
      waitlistForOperationalDate.filter(
        (entry) => entry.status === "active" || entry.status === "contacted"
      ),
    [waitlistForOperationalDate]
  );
  const archivedWaitlistForOperationalDate = useMemo(
    () =>
      waitlistForOperationalDate.filter(
        (entry) => entry.status === "resolved" || entry.status === "cancelled"
      ),
    [waitlistForOperationalDate]
  );
  const remindersForOperationalDate = useMemo(
    () => reminders.filter((item) => !item.scheduledAtIso || item.scheduledAtIso === operationalDate),
    [operationalDate, reminders]
  );
  const selectedBookingDetail = useMemo(
    () => bookingsForOperationalDate.find((booking) => booking.id === selectedBookingId) ?? null,
    [bookingsForOperationalDate, selectedBookingId]
  );
  const bookingBoard = useMemo(
    () =>
      bookingBoardColumns.map((column) => ({
        ...column,
        items:
          column.key === "waitlist_entries"
            ? activeWaitlistForOperationalDate.map((entry) => ({
                kind: "waitlist" as const,
                id: `waitlist-${entry.id}`,
                entry
              }))
            : activeBookingsForOperationalDate
                .filter((booking) => booking.status === column.key)
                .map((booking) => ({
                  kind: "booking" as const,
                  id: booking.id,
                  booking
                }))
      })),
    [activeBookingsForOperationalDate, activeWaitlistForOperationalDate]
  );
  const nextUpcomingBooking = useMemo(
    () =>
      [...bookingsForOperationalDate]
        .sort((a, b) => (a.startTimeRaw || "").localeCompare(b.startTimeRaw || ""))
        .find((booking) => booking.status !== "declined"),
    [bookingsForOperationalDate]
  );
  const urgentReminder = remindersForOperationalDate.find((item) => item.status === "pending") ?? null;
  const contactedWaitlistEntry =
    activeWaitlistForOperationalDate.find((entry) => entry.status === "contacted") ?? null;
  const activeWaitlistEntry =
    activeWaitlistForOperationalDate.find((entry) => entry.status === "active") ?? null;
  const priorityWaitlistEntry = contactedWaitlistEntry ?? activeWaitlistEntry;
  const attentionItems = useMemo(() => {
    const items: Array<{ id: string; label: string; description: string }> = [];
    const pendingBookings = bookingsForOperationalDate.filter((booking) => booking.status === "new");
    const holdBookings = bookingsForOperationalDate.filter((booking) => booking.status === "hold_pending");
    const contactedWaitlist = waitlistForOperationalDate.filter((entry) => entry.status === "contacted");

    if (pendingBookings.length > 0) {
      items.push({
        id: "pending-bookings",
        label: "Новые заявки",
        description: `${pendingBookings.length} ждут подтверждения на ${formatOperationalDate(operationalDate)}`
      });
    }

    if (holdBookings.length > 0) {
      items.push({
        id: "hold-bookings",
        label: "Брони в резерве",
        description: `${holdBookings.length} нужно подтвердить или снять с резерва`
      });
    }

    if (urgentReminder) {
      items.push({
        id: `reminder-${urgentReminder.id}`,
        label: "Напоминание менеджеру",
        description: urgentReminder.message
      });
    }

    if (contactedWaitlist.length > 0) {
      items.push({
        id: "contacted-waitlist",
        label: "Ждем ответ клиента",
        description: `${contactedWaitlist.length} клиентам уже написали или позвонили, нужно закрыть результат`
      });
    }

    if (items.length === 0) {
      items.push({
        id: "calm-day",
        label: "Спокойная смена",
        description: "На выбранную дату нет срочных задач, можно работать по входящим броням."
      });
    }

    return items.slice(0, 3);
  }, [bookingsForOperationalDate, operationalDate, urgentReminder, waitlistForOperationalDate]);
  const occupancyRows = useMemo(
    () =>
      bookablePoints.map((point) => {
        const occupiedSlots = new Set(
          bookingsForOperationalDate
            .filter(
              (booking) =>
                booking.placeLabel === point.label &&
                booking.startTimeRaw &&
                booking.status !== "declined"
            )
            .map((booking) => booking.startTimeRaw as string)
        );

        return {
          point,
          occupiedSlots
        };
      }),
    [bookablePoints, bookingsForOperationalDate]
  );
  const manualTimeOptions = useMemo(() => {
    const availableTimes = manualSlots
      .filter((slot) => slot.status !== "unavailable")
      .map((slot) => ({
        value: slot.time,
        label: slot.label
      }));

    if (manualTime && !availableTimes.some((option) => option.value === manualTime)) {
      return [{ value: manualTime, label: `${manualTime} · вручную` }, ...availableTimes];
    }

    return availableTimes;
  }, [manualSlots, manualTime]);

  useEffect(() => {
    if (!selectedVenueId && operationalVenues[0]) {
      setSelectedVenueId(operationalVenues[0].id);
    }
  }, [operationalVenues, selectedVenueId]);

  useEffect(() => {
    if (!selectedPoint && bookablePoints[0]) {
      setSelectedHotspotId(bookablePoints[0].id);
    }
  }, [bookablePoints, selectedPoint]);

  useEffect(() => {
    setManualDate(operationalDate);
    setManualTime("");
    setPendingManualTime("");
  }, [operationalDate]);

  useEffect(() => {
    if (!selectedSceneId && manualScenes[0]) {
      setSelectedSceneId(manualScenes[0].id);
    }
  }, [manualScenes, selectedSceneId]);

  useEffect(() => {
    if (selectedPoint && selectedPoint.sceneTitle !== selectedManualScene?.title) {
      const sceneMatch = manualScenes.find((scene) => scene.title === selectedPoint.sceneTitle);
      if (sceneMatch) {
        setSelectedSceneId(sceneMatch.id);
      }
    }
  }, [manualScenes, selectedManualScene, selectedPoint]);

  useEffect(() => {
    async function loadSlots() {
      if (!selectedVenue || !selectedPoint || !manualDate) {
        setManualSlots([]);
        setIsManualSlotLoading(false);
        return;
      }

      setIsManualSlotLoading(true);
      const params = new URLSearchParams({
        venueId: selectedVenue.id,
        date: manualDate,
        hotspotLabel: selectedPoint.label,
        hotspotStatus: selectedPoint.status || "",
        hotspotKind: selectedPoint.kind
      });
      try {
        const response = await fetch(`/api/availability?${params.toString()}`, { cache: "no-store" });
        const payload = (await response.json()) as { data?: Array<{ time: string; label: string; status: string }> };
        const slots = payload.data || [];
        setManualSlots(slots);

        const preferredTime = pendingManualTime || manualTime;
        const matchedSlot = slots.find((slot) => slot.time === preferredTime);

        if (preferredTime && !matchedSlot) {
          setManualTime(preferredTime);
        } else if (preferredTime && matchedSlot?.status !== "unavailable") {
          setManualTime(preferredTime);
        } else if (preferredTime && matchedSlot?.status === "unavailable") {
          setManualTime("");
        }

        if (pendingManualTime) {
          setPendingManualTime("");
        }
      } finally {
        setIsManualSlotLoading(false);
      }
    }

    void loadSlots();
  }, [manualDate, manualTime, pendingManualTime, selectedPoint, selectedVenue]);

  function executeBookingAction(bookingId: string, action: ManagerAction) {
    startTransition(async () => {
      const response = await fetch(`/api/admin/bookings/${bookingId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ action })
      });

      const payload = (await response.json()) as { message?: string };

      if (!response.ok) {
        pushNotice({
          kind: "error",
          message: payload.message || "Не удалось обновить заявку"
        });
        return;
      }

      pushNotice({
        kind: "success",
        message: "Статус заявки обновлен",
        actionLabel: "К заявкам",
        targetTab: "bookings"
      });
      router.refresh();
    });
  }

  function handleAction(bookingId: string, action: ManagerAction) {
    const confirmationText = getActionConfirmationText(action);

    if (confirmationText) {
      openConfirmDialog({
        title: actionLabels[action],
        description: confirmationText,
        confirmLabel: actionLabels[action],
        tone: action === "cancel" || action === "decline" ? "danger" : "default",
        onConfirm: () => executeBookingAction(bookingId, action)
      });
      return;
    }

    executeBookingAction(bookingId, action);
  }

  function handleBoardMove(booking: ManagerBooking, targetStatus: BookingBoardColumnKey) {
    const action = getBoardMoveAction(booking, targetStatus);

    if (!action) {
      pushNotice({
        kind: "info",
        message: "Эту заявку нельзя перевести в выбранную колонку"
      });
      return;
    }

    handleAction(booking.id, action);
  }

  function handleWaitlistOffer(entryId: string) {
    openConfirmDialog({
      title: "Отметить звонок клиенту",
      description: "Подтверди, что ты уже позвонил клиенту. После этого запись перейдет в этап ожидания ответа.",
      confirmLabel: "Позвонил",
      onConfirm: () => {
        startTransition(async () => {
          const response = await fetch(`/api/admin/waitlist/${entryId}`, {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify({ action: "offer" })
          });
          const payload = (await response.json()) as { message?: string };
          if (!response.ok) {
            pushNotice({
              kind: "error",
              message: payload.message || "Не удалось обработать лист ожидания"
            });
            return;
          }

          pushNotice({
            kind: "success",
            message: "Звонок отмечен. Теперь по клиенту нужно зафиксировать итог.",
            actionLabel: "Открыть лист",
            targetTab: "waitlist"
          });
          router.refresh();
        });
      }
    });
  }

  function handleWaitlistNoResponse(entryId: string) {
    openConfirmDialog({
      title: "Закрыть ожидание",
      description: "Отметить, что клиент не ответил, и убрать его из активного листа ожидания?",
      confirmLabel: "Не ответил",
      tone: "danger",
      onConfirm: () => {
        startTransition(async () => {
          const response = await fetch(`/api/admin/waitlist/${entryId}`, {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify({ action: "no-response" })
          });
          const payload = (await response.json()) as { message?: string };
          if (!response.ok) {
            pushNotice({
              kind: "error",
              message: payload.message || "Не удалось закрыть запись листа ожидания"
            });
            return;
          }

          pushNotice({
            kind: "success",
            message: "Запись листа ожидания закрыта как без ответа",
            actionLabel: "Открыть лист",
            targetTab: "waitlist"
          });
          router.refresh();
        });
      }
    });
  }

  function handleWaitlistResponded(entryId: string) {
    openConfirmDialog({
      title: "Отметить ответ клиента",
      description: "Закрыть ожидание как успешный ответ клиента и убрать запись из активного списка?",
      confirmLabel: "Ответил",
      onConfirm: () => {
        startTransition(async () => {
          const response = await fetch(`/api/admin/waitlist/${entryId}`, {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify({ action: "responded" })
          });
          const payload = (await response.json()) as { message?: string };
          if (!response.ok) {
            pushNotice({
              kind: "error",
              message: payload.message || "Не удалось отметить ответ клиента"
            });
            return;
          }

          pushNotice({
            kind: "success",
            message: "Ответ клиента отмечен. Теперь можно оформить бронь вручную.",
            actionLabel: "К записи",
            targetTab: "manual"
          });
          router.refresh();
        });
      }
    });
  }

  function handleProcessNotifications() {
    openConfirmDialog({
      title: "Обработать уведомления",
      description: "Система отправит все готовые к этому моменту напоминания и обновит очередь.",
      confirmLabel: "Запустить",
      onConfirm: () => {
        startTransition(async () => {
          const response = await fetch("/api/admin/notifications/process", { method: "POST" });
          const payload = (await response.json()) as { message?: string; processed?: number };
          if (!response.ok) {
            pushNotice({
              kind: "error",
              message: payload.message || "Не удалось обработать уведомления"
            });
            return;
          }

          pushNotice({
            kind: "success",
            message: `Уведомлений обработано: ${payload.processed || 0}`,
            actionLabel: "К уведомлениям",
            targetTab: "reminders"
          });
          router.refresh();
        });
      }
    });
  }

  function collectManualFormData() {
    const form = manualFormRef.current;

    if (!form) {
      return null;
    }

    const formData = new FormData(form);

    return {
      form,
      name: String(formData.get("name") || "").trim(),
      phone: String(formData.get("phone") || "").trim(),
      telegram: String(formData.get("telegram") || "").trim(),
      time: String(formData.get("time") || "").trim(),
      guests: Number(formData.get("guests") || 1),
      note: String(formData.get("note") || "").trim(),
      status: String(formData.get("status") || "CONFIRMED")
    };
  }

  function submitManualBooking(collected: NonNullable<ReturnType<typeof collectManualFormData>>) {
    startTransition(async () => {
      const response = await fetch("/api/admin/bookings/manual", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          venueId: selectedVenue?.id,
          hotspotLabel: selectedPoint?.label,
          name: collected.name,
          phone: collected.phone,
          telegram: collected.telegram,
          date: manualDate,
          time: manualTime || collected.time,
          guests: collected.guests,
          note: collected.note,
          status: collected.status
        })
      });
      const payload = (await response.json()) as { message?: string };
      if (!response.ok) {
        pushNotice({
          kind: "error",
          message: payload.message || "Не удалось записать бронь"
        });
        return;
      }

      collected.form.reset();
      setManualDate(operationalDate);
      setManualTime("");
      setManualSlots([]);
      setActiveTab("bookings");
      pushNotice({
        kind: "success",
        message: "Бронь создана и добавлена в заявки",
        actionLabel: "К заявкам",
        targetTab: "bookings"
      });
      router.refresh();
    });
  }

  function handleManualBooking(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const collected = collectManualFormData();

    if (!collected) {
      pushNotice({
        kind: "error",
        message: "Форма бронирования недоступна"
      });
      return;
    }

    openConfirmDialog({
      title: "Создать бронь",
      description: `Подтвердить бронь на ${selectedPoint?.label || "выбранную точку"}${manualDate ? ` · ${formatOperationalDate(manualDate)}` : ""}${collected.time ? ` · ${collected.time}` : ""}?`,
      confirmLabel: "Создать бронь",
      onConfirm: () => submitManualBooking(collected)
    });
  }

  function handleManualWaitlist() {
    const collected = collectManualFormData();

    if (!collected) {
      pushNotice({
        kind: "error",
        message: "Форма листа ожидания недоступна"
      });
      return;
    }

    if (!selectedVenue || !selectedManualScene || !selectedPoint) {
      pushNotice({
        kind: "error",
        message: "Выбери объект, сцену и точку на схеме"
      });
      return;
    }

    if (!collected.name || !collected.phone) {
      pushNotice({
        kind: "error",
        message: "Для листа ожидания нужны имя и телефон клиента"
      });
      return;
    }

    openConfirmDialog({
      title: "Добавить в лист ожидания",
      description: `Добавить ${collected.name} в лист ожидания на ${selectedPoint.label}${manualDate ? ` · ${formatOperationalDate(manualDate)}` : ""}?`,
      confirmLabel: "Добавить",
      onConfirm: () => {
        startTransition(async () => {
          const response = await fetch("/api/waitlist", {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              venueId: selectedVenue.id,
              venueName: selectedVenue.name,
              sceneId: selectedManualScene.id,
              sceneTitle: selectedManualScene.title,
              hotspotId: selectedPoint.id,
              hotspotLabel: selectedPoint.label,
              name: collected.name,
              phone: collected.phone,
              telegram: collected.telegram || undefined,
              date: manualDate || undefined,
              time: manualTime || collected.time || undefined
            })
          });
          const payload = (await response.json()) as { message?: string };
          if (!response.ok) {
            pushNotice({
              kind: "error",
              message: payload.message || "Не удалось добавить клиента в лист ожидания"
            });
            return;
          }

          collected.form.reset();
          setManualDate(operationalDate);
          setManualTime("");
          setManualSlots([]);
          setActiveTab("bookings");
          pushNotice({
            kind: "success",
            message: "Клиент добавлен в ожидание и показан в канбане",
            actionLabel: "К доске",
            targetTab: "bookings"
          });
          router.refresh();
        });
      }
    });
  }

  return (
    <section
      className="manager-shell company-dashboard"
      style={
        {
          "--accent": companyTheme.accent,
          "--accent-dark": companyTheme.accentDark,
          "--surface-brand": companyTheme.surfaceTint,
          "--manager-surface": companyTheme.panelSurface,
          "--manager-dashboard-bg": companyTheme.dashboardBackgroundUrl
            ? `url(${companyTheme.dashboardBackgroundUrl})`
            : "none"
        } as CSSProperties
      }
    >
      <div className="manager-sticky-shell">
        <div className="manager-dashboard-header">
          <div className="manager-company">
            <div className="manager-company-mark">
              {companyTheme.logoImageUrl ? (
                <Image
                  alt={companyTheme.name}
                  className="brand-upload-image manager-company-image"
                  height={72}
                  src={companyTheme.logoImageUrl}
                  width={72}
                />
              ) : (
                <span
                  className="brand-badge manager-company-badge"
                  style={{ background: `linear-gradient(135deg, ${companyTheme.accentDark}, ${companyTheme.accent})` }}
                >
                  {companyTheme.logoText}
                </span>
              )}
            </div>
            <div className="manager-company-copy">
              <span className="card-label">Компания</span>
              <h1>{companyTheme.name}</h1>
              <p>
                {managerName} · {role === "superadmin"
                  ? "Супер-админ"
                  : role === "admin"
                    ? "Администратор компании"
                    : "Менеджер объявлений"}
              </p>
            </div>
          </div>
          <div className="manager-summary-strip">
            <span>{stats.listingsCount} объектов</span>
            {role === "superadmin" ? (
              <span>{companies.length} компаний</span>
            ) : (
              <>
                <span>{stats.bookingsCount} заявок</span>
                <span>{stats.newCount} новые</span>
                <span>{stats.holdCount} hold</span>
                <span>{stats.archivedCount} архив</span>
              </>
            )}
          </div>
        </div>

        {role !== "superadmin" ? (
          <div className="manager-ops-toolbar">
            <div className="manager-ops-date">
              <span className="card-label">Операционный день</span>
              <strong>{formatOperationalDate(operationalDate)}</strong>
            </div>
            <label className="settings-field manager-ops-date-picker">
              <span>Дата работы</span>
              <input
                className="manager-input"
                min={getTodayIso()}
                onChange={(event) => setOperationalDate(event.target.value)}
                type="date"
                value={operationalDate}
              />
            </label>
            <div className="manager-day-kpis">
              <span>{bookingsForOperationalDate.length} броней</span>
              <span>{bookingsForOperationalDate.filter((item) => item.status === "confirmed").length} подтверждено</span>
              <span>{activeWaitlistForOperationalDate.length} в ожидании</span>
              <span>{remindersForOperationalDate.filter((item) => item.status === "pending").length} напоминаний</span>
            </div>
          </div>
        ) : null}

        {role === "superadmin" ? (
          <div className="manager-superadmin-strip">
            <div className="manager-note-box">
              Управление клиентами, брендингом и пользователями собрано в одном центре, чтобы не прыгать по разным разделам.
            </div>
            <Link className="primary-button subtle-button" href="/manager/settings">
              Открыть центр управления
            </Link>
          </div>
        ) : null}
      </div>

      {notice ? (
        <div className={`manager-system-notice toast toast-${notice.kind}`}>
          <div className="manager-system-notice-copy">
            <strong>{notice.kind === "error" ? "Нужно внимание" : notice.kind === "success" ? "Готово" : "Уведомление"}</strong>
            <p>{notice.message}</p>
          </div>
          <div className="manager-system-notice-actions">
            {notice.actionLabel && notice.targetTab ? (
              <button
                className="toolbar-button manager-notice-action"
                onClick={() => {
                  setActiveTab(notice.targetTab as DashboardTab);
                  setNotice(null);
                }}
                type="button"
              >
                {notice.actionLabel}
              </button>
            ) : null}
            <button
              className="toolbar-button manager-notice-close"
              onClick={() => setNotice(null)}
              type="button"
            >
              Закрыть
            </button>
          </div>
        </div>
      ) : null}

      {confirmState ? (
        <div className="manager-confirm-backdrop" role="presentation">
          <div className="manager-confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="manager-confirm-title">
            <div className="manager-confirm-copy">
              <span className="card-label">Подтверждение</span>
              <h2 id="manager-confirm-title">{confirmState.title}</h2>
              <p>{confirmState.description}</p>
            </div>
            <div className="manager-confirm-actions">
              <button
                className="toolbar-button"
                onClick={() => setConfirmState(null)}
                type="button"
              >
                Отмена
              </button>
              <button
                className={`primary-button ${confirmState.tone === "danger" ? "danger-button" : ""}`}
                onClick={confirmState.onConfirm}
                type="button"
              >
                {confirmState.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {selectedBookingDetail ? (
        <div className="manager-detail-backdrop" role="presentation">
          {(() => {
            const detailStatusMeta = getBookingStatusMeta(selectedBookingDetail);

            return (
          <div
            aria-labelledby="manager-detail-title"
            aria-modal="true"
            className="manager-detail-dialog"
            role="dialog"
          >
            <div className="manager-detail-head">
              <div className="manager-detail-head-copy">
                <span className="card-label">Карточка заявки</span>
                <h2 id="manager-detail-title">{selectedBookingDetail.customerName}</h2>
                <p>{selectedBookingDetail.venueName}</p>
              </div>
              <div className="manager-detail-head-actions">
                <span className={`manager-status-badge status-${detailStatusMeta.tone} manager-detail-status-chip`}>
                  {detailStatusMeta.shortLabel}
                </span>
                <button
                  className="toolbar-button"
                  onClick={() => setSelectedBookingId(null)}
                  type="button"
                >
                  <span className="manager-button-icon" aria-hidden="true">✕</span>
                  <span>Закрыть</span>
                </button>
              </div>
            </div>

            <div className="manager-detail-body">
              <div className="manager-detail-section manager-detail-summary">
                <div className="manager-meta-row">
                  <span className="fact">{selectedBookingDetail.placeLabel}</span>
                  {selectedBookingDetail.slotLabel ? (
                    <span className="fact">{selectedBookingDetail.slotLabel}</span>
                  ) : null}
                  <span className="fact">{selectedBookingDetail.dateLabel}</span>
                  <span className="fact">{selectedBookingDetail.guestsLabel}</span>
                </div>
              </div>

              <div className="manager-detail-grid">
                <div className="manager-detail-section">
                  <span className="card-label">Контакты</span>
                  <strong>{selectedBookingDetail.phone}</strong>
                  {selectedBookingDetail.telegram ? <p>{selectedBookingDetail.telegram}</p> : null}
                </div>
                <div className="manager-detail-section">
                  <span className="card-label">Детали</span>
                  <p>{selectedBookingDetail.amountLabel}</p>
                  <p>{selectedBookingDetail.sourceLabel}</p>
                </div>
              </div>

              <div className="manager-note-box">{selectedBookingDetail.managerNote}</div>

              <div className="manager-detail-actions-shell">
                <div className="manager-detail-action-block">
                  <span className="card-label">Связь</span>
                  <div className="manager-action-cluster">
                  <a
                    aria-label="Позвонить"
                    className="toolbar-button manager-quick-contact"
                    href={`tel:${slugifyPhone(selectedBookingDetail.phone)}`}
                    title="Позвонить"
                  >
                    <span className="manager-button-icon" aria-hidden="true"><PhoneIcon /></span>
                  </a>
                  <a
                    aria-label="Связаться в Telegram"
                    className="toolbar-button manager-quick-contact"
                    href={SUPPORT_TELEGRAM_URL}
                    rel="noreferrer"
                    target="_blank"
                    title="Связаться в Telegram"
                  >
                    <span className="manager-button-icon" aria-hidden="true"><TelegramIcon /></span>
                  </a>
                  {selectedBookingDetail.telegram ? (
                    <a
                      aria-label="Открыть Telegram клиента"
                      className="toolbar-button manager-quick-contact"
                      href={`https://t.me/${selectedBookingDetail.telegram.replace("@", "")}`}
                      rel="noreferrer"
                      target="_blank"
                      title="Открыть Telegram клиента"
                    >
                      <span className="manager-button-icon" aria-hidden="true"><TelegramIcon /></span>
                    </a>
                  ) : null}
                </div>
                </div>
                {!selectedBookingDetail.archived ? (
                  <div className="manager-detail-action-block">
                    <span className="card-label">Изменить статус</span>
                    <div className="manager-action-cluster manager-detail-action-group">
                      {statusActions[selectedBookingDetail.status].map((action) => (
                        <button
                          className={`toolbar-button ${action === "confirm" ? "manager-action-positive" : ""} ${action === "cancel" || action === "decline" ? "manager-action-danger" : ""}`}
                          disabled={isPending}
                          key={action}
                          onClick={() => {
                            setSelectedBookingId(null);
                            handleAction(selectedBookingDetail.id, action);
                          }}
                          type="button"
                        >
                          {actionLabels[action]}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
                <div className="manager-detail-action-block">
                  <span className="card-label">{selectedBookingDetail.archived ? "Вернуть в работу" : "Архив"}</span>
                  <div className="manager-action-cluster manager-detail-action-group">
                    <button
                      className="toolbar-button"
                      disabled={isPending}
                      onClick={() => {
                        setSelectedBookingId(null);
                        handleAction(
                          selectedBookingDetail.id,
                          selectedBookingDetail.archived ? "restore" : "archive"
                        );
                      }}
                      type="button"
                    >
                      <span className="manager-button-icon" aria-hidden="true">
                        {selectedBookingDetail.archived ? "↺" : "🗂"}
                      </span>
                      <span>{selectedBookingDetail.archived ? "Вернуть в работу" : "Архивировать"}</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
            );
          })()}
        </div>
      ) : null}

      {role === "superadmin" ? (
        <div className="manager-table-shell compact-manager-shell manager-table-shell-wide">
          <div className="manager-table-head compact-manager-head">
            <div>
              <span className="card-label">Все точки</span>
              <h2>Список всех объектов на платформе</h2>
            </div>
            <div className="manager-inline-pagination">
              <button
                className="toolbar-button"
                disabled={superadminPage <= 1}
                onClick={() => setSuperadminPage((current) => Math.max(1, current - 1))}
                type="button"
              >
                Назад
              </button>
              <span>
                {superadminPage} / {superadminPageCount}
              </span>
              <button
                className="toolbar-button"
                disabled={superadminPage >= superadminPageCount}
                onClick={() => setSuperadminPage((current) => Math.min(superadminPageCount, current + 1))}
                type="button"
              >
                Дальше
              </button>
            </div>
          </div>

          <div className="manager-listing-grid manager-listing-grid-wide">
            {pagedListings.map((listing) => (
              <article className="manager-listing-card" key={listing.id}>
                <strong>{listing.name}</strong>
                <span className="fact">{companies.find((company) => company.id === listing.companyId)?.name || listing.companyId}</span>
                <span className="result-vertical-chip">{listing.type}</span>
                <p>{listing.city}</p>
                <div className="manager-meta-row">
                  <span className="fact">{listing.price}</span>
                  <span className={`status-badge status-${listing.availability}`}>
                    {listing.availability === "available"
                      ? "Свободно"
                      : listing.availability === "limited"
                        ? "Мало мест"
                        : "Почти занято"}
                  </span>
                </div>
                <Link className="manager-edit-link" href={`/manager/listings/${listing.id}`}>
                  {role === "superadmin" ? "Редактировать 360 и метки" : "Редактировать информацию"}
                </Link>
              </article>
            ))}
          </div>
        </div>
      ) : (
        <div className="manager-workspace-shell">
          <div className="manager-workspace-tabs">
            <button
              className={`workspace-tab ${activeTab === "overview" ? "active" : ""}`}
              onClick={() => setActiveTab("overview")}
              type="button"
            >
              <span className="manager-button-icon" aria-hidden="true">⌂</span>
              <span>Объект</span>
            </button>
            <button
              className={`workspace-tab ${activeTab === "bookings" ? "active" : ""}`}
              onClick={() => setActiveTab("bookings")}
              type="button"
            >
              <span className="manager-button-icon" aria-hidden="true">▥</span>
              <span>Заявки</span>
            </button>
            <button
              className={`workspace-tab ${activeTab === "archive" ? "active" : ""}`}
              onClick={() => setActiveTab("archive")}
              type="button"
            >
              <span className="manager-button-icon" aria-hidden="true">🗂</span>
              <span>Архив</span>
            </button>
            <button
              className={`workspace-tab ${activeTab === "manual" ? "active" : ""}`}
              onClick={() => setActiveTab("manual")}
              type="button"
            >
              <span className="manager-button-icon" aria-hidden="true">＋</span>
              <span>Запись</span>
            </button>
            <button
              className={`workspace-tab ${activeTab === "waitlist" ? "active" : ""}`}
              onClick={() => setActiveTab("waitlist")}
              type="button"
            >
              <span className="manager-button-icon" aria-hidden="true">◷</span>
              <span>Лист ожидания</span>
            </button>
            <button
              className={`workspace-tab ${activeTab === "reminders" ? "active" : ""}`}
              onClick={() => setActiveTab("reminders")}
              type="button"
            >
              <span className="manager-button-icon" aria-hidden="true">🔔</span>
              <span>Уведомления</span>
            </button>
          </div>

          {activeTab === "overview" ? (
            <div className="manager-table-shell compact-manager-shell">
              <div className="manager-table-head compact-manager-head">
                <div>
                  <span className="card-label">Объект менеджера</span>
                  <h2>{listings[0]?.name || "Объект не найден"}</h2>
                </div>
              </div>

              {listings[0] ? (
                <div className="manager-overview-grid">
                  <article className="manager-listing-card manager-listing-card-featured">
                    <strong>{listings[0].name}</strong>
                    <span className="result-vertical-chip">{listings[0].type}</span>
                    <p>{listings[0].city}</p>
                    <div className="manager-meta-row">
                      <span className="fact">{listings[0].price}</span>
                      <span className={`status-badge status-${listings[0].availability}`}>
                        {listings[0].availability === "available"
                          ? "Свободно"
                          : listings[0].availability === "limited"
                            ? "Мало мест"
                            : "Почти занято"}
                      </span>
                    </div>
                    <div className="manager-summary-strip manager-summary-strip-inline">
                      <span>{stats.bookingsCount} заявок</span>
                      <span>{stats.newCount} новые</span>
                      <span>{stats.holdCount} hold</span>
                    </div>
                    <Link className="manager-edit-link" href={`/manager/listings/${listings[0].id}`}>
                      Редактировать информацию
                    </Link>
                  </article>

                  <div className="manager-day-focus-grid">
                    <article className="manager-focus-card">
                      <span className="card-label">Следующая бронь</span>
                      {nextUpcomingBooking ? (
                        <>
                          <strong>{nextUpcomingBooking.customerName}</strong>
                          <p>{nextUpcomingBooking.placeLabel} · {formatTime(nextUpcomingBooking.startTimeRaw)}</p>
                          <div className="manager-inline-actions">
                            <a
                              aria-label="Позвонить"
                              className="toolbar-button manager-quick-contact"
                              href={`tel:${slugifyPhone(nextUpcomingBooking.phone)}`}
                              title="Позвонить"
                            >
                              <span className="manager-button-icon" aria-hidden="true"><PhoneIcon /></span>
                            </a>
                            <a
                              aria-label="Связаться в Telegram"
                              className="toolbar-button manager-quick-contact"
                              href={SUPPORT_TELEGRAM_URL}
                              rel="noreferrer"
                              target="_blank"
                              title="Связаться в Telegram"
                            >
                              <span className="manager-button-icon" aria-hidden="true"><TelegramIcon /></span>
                            </a>
                            {nextUpcomingBooking.telegram ? (
                              <a
                                aria-label="Открыть Telegram клиента"
                                className="toolbar-button manager-quick-contact"
                                href={`https://t.me/${nextUpcomingBooking.telegram.replace("@", "")}`}
                                rel="noreferrer"
                                target="_blank"
                                title="Открыть Telegram клиента"
                              >
                                <span className="manager-button-icon" aria-hidden="true"><TelegramIcon /></span>
                              </a>
                            ) : null}
                          </div>
                        </>
                      ) : (
                        <p>На выбранную дату активных броней пока нет.</p>
                      )}
                    </article>

                    <article className="manager-focus-card">
                      <span className="card-label">Что требует внимания</span>
                      <div className="manager-attention-list">
                        {attentionItems.map((item) => (
                          <div className="manager-attention-item" key={item.id}>
                            <strong>{item.label}</strong>
                            <p>{item.description}</p>
                          </div>
                        ))}
                      </div>
                    </article>

                    <article className="manager-focus-card">
                      <span className="card-label">Очередь ожидания</span>
                      {priorityWaitlistEntry ? (
                        <>
                          <strong>{priorityWaitlistEntry.customerName}</strong>
                          <p>
                            {priorityWaitlistEntry.status === "contacted"
                              ? "Ждем итог после звонка"
                              : "Нужно позвонить первому клиенту"}
                          </p>
                          <p>{priorityWaitlistEntry.hotspotLabel}</p>
                          <span className={`manager-status-badge status-${priorityWaitlistEntry.status}`}>
                            {priorityWaitlistEntry.status === "contacted" ? "Связались, ждем итог" : "Ждет первого контакта"}
                          </span>
                          <div className="manager-focus-actions">
                            <div className="manager-inline-actions manager-inline-actions-icons">
                              <a
                                aria-label="Позвонить"
                                className="toolbar-button manager-quick-contact"
                                href={`tel:${slugifyPhone(priorityWaitlistEntry.customerPhone)}`}
                                title="Позвонить"
                              >
                                <span className="manager-button-icon" aria-hidden="true"><PhoneIcon /></span>
                              </a>
                              <a
                                aria-label="Связаться в Telegram"
                                className="toolbar-button manager-quick-contact"
                                href={SUPPORT_TELEGRAM_URL}
                                rel="noreferrer"
                                target="_blank"
                                title="Связаться в Telegram"
                              >
                                <span className="manager-button-icon" aria-hidden="true"><TelegramIcon /></span>
                              </a>
                              {priorityWaitlistEntry.customerTelegram ? (
                                <a
                                  aria-label="Открыть Telegram клиента"
                                  className="toolbar-button manager-quick-contact"
                                  href={`https://t.me/${priorityWaitlistEntry.customerTelegram.replace("@", "")}`}
                                  rel="noreferrer"
                                  target="_blank"
                                  title="Открыть Telegram клиента"
                                >
                                  <span className="manager-button-icon" aria-hidden="true"><TelegramIcon /></span>
                                </a>
                              ) : null}
                            </div>
                            <div className="manager-inline-actions manager-inline-actions-text">
                              <button
                                className="toolbar-button"
                                disabled={isPending}
                                onClick={() => handleWaitlistOffer(priorityWaitlistEntry.id)}
                                type="button"
                              >
                                {priorityWaitlistEntry.status === "contacted" ? "Позвонить еще раз" : "Позвонил"}
                              </button>
                              {priorityWaitlistEntry.status === "contacted" ? (
                                <button
                                  className="toolbar-button"
                                  disabled={isPending}
                                  onClick={() => handleWaitlistResponded(priorityWaitlistEntry.id)}
                                  type="button"
                                >
                                  Ответил
                                </button>
                              ) : null}
                            </div>
                          </div>
                        </>
                      ) : (
                        <p>Лист ожидания на эту дату пуст.</p>
                      )}
                    </article>
                  </div>

                  <div className="manager-occupancy-card">
                    <div className="manager-table-head compact-manager-head">
                      <div>
                        <span className="card-label">Загрузка по точкам</span>
                        <h2>Схема дня по столам и зонам</h2>
                      </div>
                    </div>
                    <div className="manager-occupancy-grid">
                      <div className="manager-occupancy-header">
                        <span>Точка</span>
                        {operationalTimeline.map((slot) => (
                          <span key={slot}>{slot}</span>
                        ))}
                      </div>
                      {occupancyRows.map((row) => (
                        <div className="manager-occupancy-row" key={row.point.id}>
                          <strong>{row.point.label}</strong>
                          {operationalTimeline.map((slot) => {
                            const busy = row.occupiedSlots.has(slot);
                            const isClickable = !busy;
                            return (
                              <button
                                className={`manager-occupancy-cell ${busy ? "busy" : "free"}`}
                                disabled={!isClickable}
                                key={`${row.point.id}-${slot}`}
                                onClick={() => {
                                  if (!isClickable) {
                                    return;
                                  }

                                  setSelectedHotspotId(row.point.id);
                                  setSelectedSceneId(
                                    manualScenes.find((scene) => scene.title === row.point.sceneTitle)?.id ||
                                      selectedSceneId
                                  );
                                  setManualDate(operationalDate);
                                  setPendingManualTime(slot);
                                  setManualTime(slot);
                                  setActiveTab("manual");
                                }}
                                type="button"
                              >
                                {busy ? "Занят" : "Свободен"}
                              </button>
                            );
                          })}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="manager-note-box">За вами пока не закреплен объект.</div>
              )}
            </div>
          ) : null}

          {activeTab === "bookings" ? (
            <div className="manager-table-shell compact-manager-shell">
            <div className="manager-table-head compact-manager-head">
              <div>
                <span className="card-label">Мои заявки</span>
                <h2>
                  {role === "manager" ? "Только назначенные вам заявки" : "Все заявки компании"}
                </h2>
              </div>
            </div>

            <div className="manager-note-box manager-kanban-hint">
              Перетаскивай карточки между колонками, чтобы менять этап заявки без лишних кнопок.
            </div>

            <div className="manager-kanban-board">
              {bookingBoard.map((column) => (
                <section
                  className={`manager-kanban-column ${dragOverColumn === column.key ? "drag-over" : ""}`}
                  key={column.key}
                  onDragOver={(event) => {
                    if (column.key === "waitlist_entries") {
                      return;
                    }
                    event.preventDefault();
                    setDragOverColumn(column.key);
                  }}
                  onDragLeave={() => setDragOverColumn((current) => (current === column.key ? null : current))}
                  onDrop={(event) => {
                    if (column.key === "waitlist_entries") {
                      setDragOverColumn(null);
                      setDraggedBookingId(null);
                      return;
                    }
                    event.preventDefault();
                    const booking = bookingsForOperationalDate.find((item) => item.id === draggedBookingId);
                    setDragOverColumn(null);
                    setDraggedBookingId(null);

                    if (!booking) {
                      return;
                    }

                    handleBoardMove(booking, column.key);
                  }}
                >
                  <div className="manager-kanban-column-head">
                    <div>
                      <strong>{column.title}</strong>
                      <span>{column.hint}</span>
                    </div>
                    <span className="manager-kanban-count">{column.items.length}</span>
                  </div>

                  <div className="manager-kanban-list">
                    {column.items.length === 0 ? (
                      <div className="manager-kanban-empty">Пусто</div>
                    ) : null}

                    {column.items.map((item) => {
                      if (item.kind === "waitlist") {
                        const statusMeta = getWaitlistEntryMeta(item.entry);

                        return (
                          <article
                            className="manager-booking-card compact-manager-card manager-kanban-card"
                            key={item.id}
                            onClick={() => setActiveTab("waitlist")}
                          >
                            <div className="manager-kanban-card-top">
                              <span className={`manager-status-badge status-${statusMeta.tone}`}>
                                {statusMeta.shortLabel}
                              </span>
                              <div className="manager-booking-title-copy">
                                <strong>{item.entry.customerName}</strong>
                              </div>
                            </div>

                            <div className="manager-kanban-info">
                              <div className="manager-kanban-info-row">
                                <span className="manager-kanban-info-label">Стол</span>
                                <span className="manager-kanban-info-value">{item.entry.hotspotLabel}</span>
                              </div>
                              {item.entry.requestedTimeRaw ? (
                                <div className="manager-kanban-info-row">
                                  <span className="manager-kanban-info-label">Время</span>
                                  <span className="manager-kanban-info-value">{item.entry.requestedTimeRaw}</span>
                                </div>
                              ) : null}
                              <div className="manager-kanban-info-row">
                                <span className="manager-kanban-info-label">Дата</span>
                                <span className="manager-kanban-info-value">
                                  {item.entry.requestedDateIso
                                    ? formatOperationalDate(item.entry.requestedDateIso)
                                    : item.entry.requestedAtLabel}
                                </span>
                              </div>
                            </div>
                            <div className="manager-kanban-card-hint">
                              <span className="manager-button-icon" aria-hidden="true">◷</span>
                              <span>Открыть лист ожидания</span>
                            </div>
                          </article>
                        );
                      }

                      const booking = item.booking;
                      const statusMeta = getBookingStatusMeta(booking);

                      return (
                        <article
                          className="manager-booking-card compact-manager-card manager-kanban-card"
                          draggable
                          key={item.id}
                          onClick={() => setSelectedBookingId(booking.id)}
                          onDragEnd={() => {
                            setDraggedBookingId(null);
                            setDragOverColumn(null);
                          }}
                          onDragStart={() => setDraggedBookingId(booking.id)}
                        >
                          <div className="manager-kanban-card-top">
                            <span className={`manager-status-badge status-${statusMeta.tone}`}>
                              {statusMeta.shortLabel}
                            </span>
                            <div className="manager-booking-title-copy">
                              <strong>{booking.customerName}</strong>
                            </div>
                          </div>

                          <div className="manager-kanban-info">
                            <div className="manager-kanban-info-row">
                              <span className="manager-kanban-info-label">Стол</span>
                              <span className="manager-kanban-info-value">{booking.placeLabel}</span>
                            </div>
                            {booking.slotLabel ? (
                              <div className="manager-kanban-info-row">
                                <span className="manager-kanban-info-label">Время</span>
                                <span className="manager-kanban-info-value">{booking.slotLabel}</span>
                              </div>
                            ) : null}
                            <div className="manager-kanban-info-row">
                              <span className="manager-kanban-info-label">Дата</span>
                              <span className="manager-kanban-info-value">{booking.dateLabel}</span>
                            </div>
                          </div>
                          <div className="manager-kanban-card-hint">
                            <span className="manager-button-icon" aria-hidden="true">↗</span>
                            <span>Открыть детали</span>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          </div>
          ) : null}

          {activeTab === "archive" ? (
            <div className="manager-table-shell compact-manager-shell">
              <div className="manager-table-head compact-manager-head">
                <div>
                  <span className="card-label">Архив заявок</span>
                  <h2>Все архивные заявки</h2>
                </div>
                <div className="manager-archive-filters">
                  <input
                    className="manager-filter-input"
                    onChange={(event) => setArchiveQuery(event.target.value)}
                    placeholder="Поиск по клиенту, столу или телефону"
                    type="search"
                    value={archiveQuery}
                  />
                  <select
                    className="manager-filter-select"
                    onChange={(event) => setArchiveStatusFilter(event.target.value as "all" | ManagerBooking["status"])}
                    value={archiveStatusFilter}
                  >
                    <option value="all">Все статусы</option>
                    <option value="new">Новая</option>
                    <option value="hold_pending">Резерв</option>
                    <option value="confirmed">Подтверждена</option>
                    <option value="waitlist">Ожидание</option>
                    <option value="declined">Закрыта</option>
                  </select>
                  <input
                    className="manager-filter-input manager-filter-date"
                    onChange={(event) => setArchiveDateFilter(event.target.value)}
                    type="date"
                    value={archiveDateFilter}
                  />
                </div>
              </div>

              <div className="manager-list">
                {filteredArchivedBookings.length === 0 ? (
                  <div className="manager-note-box">
                    В архиве ничего не найдено по текущим фильтрам.
                  </div>
                ) : null}

                {filteredArchivedBookings.map((booking) => {
                  const statusMeta = getBookingStatusMeta(booking);

                  return (
                    <article className="manager-booking-card compact-manager-card" key={`archive-${booking.id}`}>
                      <div className="manager-booking-title">
                        <div className="manager-booking-title-copy">
                          <strong>{booking.customerName}</strong>
                          <span className="manager-booking-status-note">{statusMeta.detailLabel}</span>
                        </div>
                        <span className={`manager-status-badge status-${statusMeta.tone}`}>
                          {statusMeta.shortLabel}
                        </span>
                      </div>

                      <div className="manager-booking-grid">
                        <div className="manager-booking-main">
                          <p>{booking.placeLabel}</p>
                          <div className="manager-meta-row">
                            {booking.slotLabel ? <span className="fact">{booking.slotLabel}</span> : null}
                            <span className="fact">{booking.dateLabel}</span>
                            <span className="fact">{booking.guestsLabel}</span>
                          </div>
                        </div>
                        <div className="manager-booking-side">
                          <span>{booking.phone}</span>
                        </div>
                      </div>

                      <div className="manager-actions-row manager-actions-row-grouped">
                        <div className="manager-action-cluster">
                          <button
                            className="toolbar-button"
                            onClick={() => setSelectedBookingId(booking.id)}
                            type="button"
                          >
                            <span className="manager-button-icon" aria-hidden="true">↗</span>
                            <span>Открыть детали</span>
                          </button>
                        </div>
                        <div className="manager-action-cluster manager-action-cluster-primary">
                          <button
                            className="toolbar-button"
                            disabled={isPending}
                            onClick={() => handleAction(booking.id, "restore")}
                            type="button"
                          >
                            <span className="manager-button-icon" aria-hidden="true">↺</span>
                            <span>Вернуть в работу</span>
                          </button>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          ) : null}

          {activeTab === "manual" ? (
            <div className="manager-table-shell compact-manager-shell">
            <div className="manager-table-head compact-manager-head">
              <div>
                <span className="card-label">Быстрая запись</span>
                <h2>Записать бронь на конкретный стол</h2>
              </div>
            </div>

            <form className="manager-ops-form" onSubmit={handleManualBooking} ref={manualFormRef}>
              <div className="manager-venue-inline-card">
                <span className="card-label">Объект</span>
                <strong>{selectedVenue?.name || "Объект не выбран"}</strong>
                <p>{selectedVenue?.city || "Подключи объект к менеджеру"}</p>
              </div>

              {selectedManualScene ? (
                <div className="manager-plan-shell">
                  <div className="manager-plan-head">
                    <div>
                      <span className="card-label">Схема выбора</span>
                      <strong>{selectedManualScene.floorPlanLabel || selectedManualScene.title}</strong>
                    </div>
                    <div className="scene-editor-tabs manager-scene-tabs">
                      {manualScenes.map((scene) => (
                        <button
                          className={`scene-chip ${scene.id === selectedManualScene.id ? "active" : ""}`}
                          key={scene.id}
                          onClick={() => {
                            setSelectedSceneId(scene.id);
                            setManualTime("");
                            setPendingManualTime("");
                          }}
                          type="button"
                        >
                          <strong>{scene.title}</strong>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="manager-plan-board">
                    {selectedScenePoints.map((point) => {
                      const left = `${Math.min(Math.max(((point.yaw + 180) / 360) * 100, 8), 92)}%`;
                      const top = `${Math.min(Math.max(((point.pitch + 35) / 70) * 100, 12), 88)}%`;

                      return (
                        <button
                          className={`manager-plan-point ${selectedPoint?.id === point.id ? "active" : ""}`}
                          key={point.id}
                          onClick={() => {
                            setSelectedHotspotId(point.id);
                            setManualTime("");
                            setPendingManualTime("");
                          }}
                          style={{ left, top }}
                          type="button"
                        >
                          <span>{point.kind === "table" ? "Стол" : "Зона"}</span>
                          <strong>{point.label}</strong>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              <div className="settings-field-grid">
                <label className="settings-field">
                  <span>Точка по схеме</span>
                  <select
                    className="compact-select manager-input"
                    onChange={(event) => {
                      setSelectedHotspotId(event.target.value);
                      setManualTime("");
                      setPendingManualTime("");
                    }}
                    value={selectedPoint?.id || ""}
                  >
                    {bookablePoints.map((point) => (
                      <option key={point.id} value={point.id}>
                        {point.sceneTitle} · {point.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="settings-field-grid">
                <label className="settings-field">
                  <span>Клиент</span>
                  <input className="manager-input" name="name" placeholder="Имя клиента" required />
                </label>
                <label className="settings-field">
                  <span>Телефон</span>
                  <input className="manager-input" name="phone" placeholder="+998..." required />
                </label>
                <label className="settings-field">
                  <span>Telegram</span>
                  <input className="manager-input" name="telegram" placeholder="@telegram" />
                </label>
                <label className="settings-field">
                  <span>Гостей</span>
                  <input className="manager-input" defaultValue={2} min={1} name="guests" type="number" />
                </label>
              </div>

              <div className="settings-field-grid">
                <label className="settings-field">
                  <span>Дата</span>
                  <input
                    className="manager-input"
                    min={getTodayIso()}
                    onChange={(event) => {
                      setManualDate(event.target.value);
                      setManualTime("");
                      setPendingManualTime("");
                    }}
                    type="date"
                    value={manualDate}
                  />
                </label>
                <label className="settings-field">
                  <span>Время</span>
                  <select
                    className="compact-select manager-input"
                    name="time"
                    onChange={(event) => {
                      setManualTime(event.target.value);
                      setPendingManualTime("");
                    }}
                    value={manualTime}
                  >
                    <option value="">Любое время / уточнить позже</option>
                    {manualTimeOptions.map((slot) => (
                      <option key={slot.value} value={slot.value}>
                        {slot.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="settings-field">
                  <span>Статус</span>
                  <select className="compact-select manager-input" defaultValue="CONFIRMED" name="status">
                    <option value="CONFIRMED">Сразу подтвердить</option>
                    <option value="HOLD_PENDING">Поставить на hold</option>
                    <option value="NEW">Новая заявка</option>
                  </select>
                </label>
              </div>

              <div className="manager-slot-feedback">
                {isManualSlotLoading ? (
                  <div className="manager-note-box">Загружаем доступные слоты...</div>
                ) : manualTime ? (
                  <div className="manager-note-box">
                    Выбран слот: <strong>{manualTime}</strong>
                  </div>
                ) : (
                  <div className="manager-note-box">Выбери свободный слот на схеме дня или в списке времени.</div>
                )}
              </div>

              <label className="settings-field">
                <span>Комментарий</span>
                <textarea className="manager-input" name="note" placeholder="Доп. заметка менеджера" />
              </label>

              <div className="manager-form-actions">
                <button className="primary-button" disabled={isPending} type="submit">
                  Записать бронь
                </button>
                <button
                  className="primary-button manager-secondary-action"
                  disabled={isPending}
                  onClick={handleManualWaitlist}
                  type="button"
                >
                  В лист ожидания
                </button>
              </div>
            </form>
          </div>
          ) : null}

          {activeTab === "waitlist" ? (
            <>
              <div className="manager-table-shell compact-manager-shell">
                <div className="manager-table-head compact-manager-head">
                  <div>
                    <span className="card-label">Лист ожидания</span>
                    <h2>Клиенты, с которыми нужно связаться по освободившемуся месту</h2>
                  </div>
                </div>

                <div className="manager-list">
                  {activeWaitlistForOperationalDate.length === 0 ? (
                    <div className="manager-note-box">Лист ожидания пока пуст.</div>
                  ) : null}

                  {activeWaitlistForOperationalDate.map((entry) => (
                    <article className="manager-booking-card compact-manager-card" key={entry.id}>
                      <div className="manager-booking-title">
                        <strong>{entry.customerName}</strong>
                        <span className={`manager-status-badge status-${entry.status}`}>
                          {entry.status === "contacted" ? "Связались" : "Ожидает"}
                        </span>
                      </div>
                      <div className="manager-booking-grid">
                        <div className="manager-booking-main">
                          <p>{entry.venueName}</p>
                          <div className="manager-meta-row">
                            <span className="fact">{entry.hotspotLabel}</span>
                            {entry.requestedSlotLabel ? <span className="fact">{entry.requestedSlotLabel}</span> : null}
                          </div>
                        </div>
                        <div className="manager-booking-side">
                          <span>{entry.customerPhone}</span>
                          {entry.customerTelegram ? <span>{entry.customerTelegram}</span> : null}
                          <span>{entry.requestedAtLabel}</span>
                        </div>
                      </div>
                      <div className="manager-actions-row">
                        <a
                          aria-label="Позвонить"
                          className="toolbar-button manager-quick-contact"
                          href={`tel:${slugifyPhone(entry.customerPhone)}`}
                          title="Позвонить"
                        >
                          <span className="manager-button-icon" aria-hidden="true"><PhoneIcon /></span>
                        </a>
                        <a
                          aria-label="Связаться в Telegram"
                          className="toolbar-button manager-quick-contact"
                          href={SUPPORT_TELEGRAM_URL}
                          rel="noreferrer"
                          target="_blank"
                          title="Связаться в Telegram"
                        >
                          <span className="manager-button-icon" aria-hidden="true"><TelegramIcon /></span>
                        </a>
                        {entry.customerTelegram ? (
                          <a
                            aria-label="Открыть Telegram клиента"
                            className="toolbar-button manager-quick-contact"
                            href={`https://t.me/${entry.customerTelegram.replace("@", "")}`}
                            rel="noreferrer"
                            target="_blank"
                            title="Открыть Telegram клиента"
                          >
                            <span className="manager-button-icon" aria-hidden="true"><TelegramIcon /></span>
                          </a>
                        ) : null}
                        <button
                          className="toolbar-button"
                          disabled={isPending}
                          onClick={() => handleWaitlistOffer(entry.id)}
                          type="button"
                        >
                          {entry.status === "contacted" ? "Позвонить еще раз" : "Позвонил"}
                        </button>
                        {entry.status === "contacted" ? (
                          <button
                            className="toolbar-button"
                            disabled={isPending}
                            onClick={() => handleWaitlistResponded(entry.id)}
                            type="button"
                          >
                            Ответил
                          </button>
                        ) : null}
                        {entry.status === "contacted" ? (
                          <button
                            className="toolbar-button"
                            disabled={isPending}
                            onClick={() => handleWaitlistNoResponse(entry.id)}
                            type="button"
                          >
                            Не ответил
                          </button>
                        ) : null}
                      </div>
                    </article>
                  ))}
                </div>
              </div>

              {archivedWaitlistForOperationalDate.length > 0 ? (
                <div className="manager-table-shell compact-manager-shell">
                  <div className="manager-table-head compact-manager-head">
                    <div>
                      <span className="card-label">История ожидания</span>
                      <h2>Закрытые записи</h2>
                    </div>
                  </div>

                  <div className="manager-list">
                    {archivedWaitlistForOperationalDate.map((entry) => (
                      <article className="manager-booking-card compact-manager-card" key={`history-${entry.id}`}>
                        <div className="manager-booking-title">
                          <strong>{entry.customerName}</strong>
                          <span className={`manager-status-badge status-${entry.status}`}>
                            {entry.status === "resolved" ? "Закрыто" : "Отменено"}
                          </span>
                        </div>
                        <div className="manager-booking-grid">
                          <div className="manager-booking-main">
                            <p>{entry.venueName}</p>
                            <div className="manager-meta-row">
                              <span className="fact">{entry.hotspotLabel}</span>
                              {entry.requestedSlotLabel ? <span className="fact">{entry.requestedSlotLabel}</span> : null}
                            </div>
                          </div>
                          <div className="manager-booking-side">
                            <span>{entry.customerPhone}</span>
                            <span>{entry.requestedAtLabel}</span>
                          </div>
                        </div>
                        {entry.note ? <div className="manager-note-box">{entry.note}</div> : null}
                      </article>
                    ))}
                  </div>
                </div>
              ) : null}
            </>
          ) : null}

          {activeTab === "reminders" ? (
            <div className="manager-table-shell compact-manager-shell">
            <div className="manager-table-head compact-manager-head">
              <div>
                <span className="card-label">Напоминания и бот</span>
                <h2>Очередь уведомлений по броням</h2>
              </div>
              <button className="toolbar-button" disabled={isPending} onClick={handleProcessNotifications} type="button">
                Обработать сейчас
              </button>
            </div>

            <div className="manager-list">
              {remindersForOperationalDate.length === 0 ? (
                <div className="manager-note-box">Пока нет запланированных уведомлений.</div>
              ) : null}

              {remindersForOperationalDate.map((item) => (
                <article className="manager-booking-card compact-manager-card" key={item.id}>
                  <div className="manager-booking-title">
                    <strong>{item.venueName}</strong>
                    <span className={`manager-status-badge status-${item.status}`}>
                      {item.status === "pending" ? "Запланировано" : item.status === "sent" ? "Отправлено" : "Ошибка"}
                    </span>
                  </div>
                  <div className="manager-booking-grid">
                    <div className="manager-booking-main">
                      <p>{item.message}</p>
                      <div className="manager-meta-row">
                        {item.placeLabel ? <span className="fact">{item.placeLabel}</span> : null}
                        <span className="fact">{item.scheduledAtLabel}</span>
                      </div>
                    </div>
                    <div className="manager-booking-side">
                      <span>{item.channel}</span>
                      <span>{item.recipientLabel}</span>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>
          ) : null}
        </div>
      )}
    </section>
  );
}
