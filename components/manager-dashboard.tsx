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
    <svg aria-hidden="true" fill="none" height="16" viewBox="0 0 20 20" width="16">
      <path d="M5.55 2.5h2.2c.39 0 .73.27.82.65l.75 3.23a.84.84 0 0 1-.24.8L7.5 8.73a11.45 11.45 0 0 0 3.77 3.77l1.55-1.58a.84.84 0 0 1 .8-.24l3.23.75c.38.09.65.43.65.82v2.2a1.05 1.05 0 0 1-1.05 1.05A13.95 13.95 0 0 1 2.5 3.55 1.05 1.05 0 0 1 3.55 2.5Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.6" />
    </svg>
  );
}

function TelegramIcon() {
  return (
    <svg aria-hidden="true" fill="none" height="16" viewBox="0 0 20 20" width="16">
      <path d="M17.36 3.02 2.9 8.6c-.99.4-.98.96-.18 1.2l3.71 1.16 1.43 4.44c.17.48.08.67.6.67.4 0 .58-.19.8-.42l2-1.94 4.15 3.06c.77.42 1.32.2 1.51-.72l2.46-11.62c.28-1.13-.43-1.64-1.35-1.41Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.35" />
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
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function formatOperationalDate(value: string) {
  if (!value) return "без даты";
  return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", weekday: "long" }).format(new Date(`${value}T00:00:00`));
}

function formatTime(value?: string) { return value || "без времени"; }

function slugifyPhone(value: string) { return value.replace(/[^\d+]/g, ""); }

function buildOperationalTimeline(startHour = 11, endHour = 23) {
  const slots: string[] = [];
  for (let h = startHour; h <= endHour; h++) slots.push(`${String(h).padStart(2, "0")}:00`);
  return slots;
}

function getActionConfirmationText(action: ManagerAction) {
  switch (action) {
    case "cancel": return "Снять уже активную бронь? Слот освободится, и его можно будет отдать другому клиенту.";
    case "decline": return "Не подтверждать входящую заявку? Она уйдет из активной очереди.";
    case "waitlist": return "Перевести заявку в лист ожидания?";
    case "archive": return "Убрать заявку из рабочего потока в архив?";
    case "restore": return "Вернуть заявку из архива обратно в работу?";
    case "hold": return "Поставить бронь во временный резерв на 30 минут?";
    default: return "";
  }
}

const actionLabels: Record<ManagerAction, string> = {
  confirm: "Подтвердить", decline: "Не подтверждать", hold: "Резерв 30 мин",
  waitlist: "В ожидание", cancel: "Снять бронь", archive: "Архивировать", restore: "Вернуть в работу"
};

const bookingBoardColumns: Array<{ key: BookingBoardColumnKey; title: string; hint: string }> = [
  { key: "new", title: "Новые", hint: "Ждут решения" },
  { key: "hold_pending", title: "Резерв", hint: "Временное удержание" },
  { key: "confirmed", title: "Подтверждены", hint: "Активные брони" },
  { key: "waitlist", title: "Ожидание", hint: "Без свободного слота" },
  { key: "waitlist_entries", title: "Лист ожидания", hint: "Отдельная очередь" },
  { key: "declined", title: "Закрыты", hint: "Отклонены или сняты" }
];

const SUPPORT_TELEGRAM_URL = "https://t.me/fdaffdklafjew";

function getBookingStatusMeta(booking: ManagerBooking) {
  if (booking.status === "declined") {
    if (booking.managerNote.toLowerCase().includes("отмен"))
      return { shortLabel: "Снята", detailLabel: "Бронь снята после создания", tone: "cancelled" } as const;
    return { shortLabel: "Не подтверждена", detailLabel: "Входящая заявка отклонена", tone: "declined" } as const;
  }
  if (booking.status === "hold_pending") return { shortLabel: "Резерв", detailLabel: "Держим слот 30 минут", tone: "hold" } as const;
  if (booking.status === "confirmed") return { shortLabel: "Подтверждена", detailLabel: "Слот закреплен за клиентом", tone: "confirmed" } as const;
  if (booking.status === "waitlist") return { shortLabel: "Ожидание", detailLabel: "Клиент в листе ожидания", tone: "waitlist" } as const;
  return { shortLabel: "Новая", detailLabel: "Ждет решения менеджера", tone: "new" } as const;
}

function getWaitlistEntryMeta(entry: ManagerWaitlistEntry) {
  if (entry.status === "contacted") return { shortLabel: "На связи", tone: "contacted" } as const;
  return { shortLabel: "Ожидание", tone: "active" } as const;
}

function getBoardMoveAction(booking: ManagerBooking, targetStatus: BookingBoardColumnKey): ManagerAction | null {
  if (booking.status === targetStatus) return null;
  switch (targetStatus) {
    case "confirmed": return statusActions[booking.status].includes("confirm") ? "confirm" : null;
    case "hold_pending": return statusActions[booking.status].includes("hold") ? "hold" : null;
    case "waitlist": return statusActions[booking.status].includes("waitlist") ? "waitlist" : null;
    case "declined":
      if (booking.status === "confirmed") return statusActions[booking.status].includes("cancel") ? "cancel" : null;
      return statusActions[booking.status].includes("decline") ? "decline" : null;
    default: return null;
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
  bookings, listings, companies, companyTheme, managerName,
  operationalVenues, reminders, role, waitlistEntries
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
    setNotice({ id: Date.now(), ...next });
  }

  function openConfirmDialog(config: Omit<ConfirmState, "onConfirm"> & { onConfirm: () => void }) {
    setConfirmState({ ...config, onConfirm: () => { setConfirmState(null); config.onConfirm(); } });
  }

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => {
      setNotice((current) => (current?.id === notice.id ? null : current));
    }, 4200);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  useEffect(() => {
    setSuperadminPage((current) => Math.min(current, superadminPageCount));
  }, [superadminPageCount]);

  useEffect(() => {
    if (role === "superadmin") return;
    let disposed = false;
    const processNotificationsSilently = async () => {
      if (disposed || document.visibilityState !== "visible") return;
      try { await fetch("/api/admin/notifications/process", { method: "POST" }); } catch { /* silent */ }
    };
    void processNotificationsSilently();
    const interval = window.setInterval(() => void processNotificationsSilently(), 60_000);
    return () => { disposed = true; window.clearInterval(interval); };
  }, [role]);

  const pagedListings = useMemo(() => {
    if (role !== "superadmin") return listings;
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
    () => operationalVenues.find((v) => v.id === selectedVenueId) ?? operationalVenues[0] ?? null,
    [operationalVenues, selectedVenueId]
  );
  const operationalTimeline = useMemo(
    () => selectedVenue?.bookingSlots?.length ? selectedVenue.bookingSlots : buildOperationalTimeline(),
    [selectedVenue]
  );
  const bookablePoints = useMemo(
    () => selectedVenue
      ? selectedVenue.scenes.flatMap((scene) =>
          scene.hotspots.filter((h) => h.kind !== "scene").map((h) => ({
            id: h.id, label: h.heading ?? h.label,
            floorPlanLabel: scene.floorPlanLabel, sceneTitle: scene.title,
            status: h.status, kind: h.kind, yaw: h.yaw ?? 0, pitch: h.pitch ?? 0
          }))
        )
      : [],
    [selectedVenue]
  );
  const manualScenes = selectedVenue?.scenes ?? [];
  const selectedManualScene = manualScenes.find((s) => s.id === selectedSceneId) ?? manualScenes[0] ?? null;
  const selectedScenePoints = useMemo(
    () => bookablePoints.filter((p) => selectedManualScene ? p.sceneTitle === selectedManualScene.title : true),
    [bookablePoints, selectedManualScene]
  );
  const selectedPoint = useMemo(
    () => bookablePoints.find((p) => p.id === selectedHotspotId) ?? bookablePoints[0] ?? null,
    [bookablePoints, selectedHotspotId]
  );
  const bookingsForOperationalDate = useMemo(
    () => bookings.filter((b) => !b.eventDateIso || b.eventDateIso === operationalDate),
    [bookings, operationalDate]
  );
  const activeBookingsForOperationalDate = useMemo(
    () => bookingsForOperationalDate.filter((b) => !b.archived),
    [bookingsForOperationalDate]
  );
  const archivedBookings = useMemo(() => bookings.filter((b) => b.archived), [bookings]);
  const filteredArchivedBookings = useMemo(() => {
    const query = archiveQuery.trim().toLowerCase();
    return archivedBookings.filter((b) => {
      const matchesQuery = !query || b.customerName.toLowerCase().includes(query) ||
        b.placeLabel.toLowerCase().includes(query) || b.phone.toLowerCase().includes(query) ||
        b.dateLabel.toLowerCase().includes(query);
      const matchesStatus = archiveStatusFilter === "all" || b.status === archiveStatusFilter;
      const matchesDate = !archiveDateFilter || b.eventDateIso === archiveDateFilter;
      return matchesQuery && matchesStatus && matchesDate;
    });
  }, [archiveDateFilter, archiveQuery, archiveStatusFilter, archivedBookings]);

  const waitlistForOperationalDate = useMemo(
    () => waitlistEntries.filter((e) => !e.requestedDateIso || e.requestedDateIso === operationalDate),
    [operationalDate, waitlistEntries]
  );
  const activeWaitlistForOperationalDate = useMemo(
    () => waitlistForOperationalDate.filter((e) => e.status === "active" || e.status === "contacted"),
    [waitlistForOperationalDate]
  );
  const archivedWaitlistForOperationalDate = useMemo(
    () => waitlistForOperationalDate.filter((e) => e.status === "resolved" || e.status === "cancelled"),
    [waitlistForOperationalDate]
  );
  const remindersForOperationalDate = useMemo(
    () => reminders.filter((item) => !item.scheduledAtIso || item.scheduledAtIso === operationalDate),
    [operationalDate, reminders]
  );
  const selectedBookingDetail = useMemo(
    () => bookingsForOperationalDate.find((b) => b.id === selectedBookingId) ?? null,
    [bookingsForOperationalDate, selectedBookingId]
  );
  const bookingBoard = useMemo(
    () => bookingBoardColumns.map((column) => ({
      ...column,
      items: column.key === "waitlist_entries"
        ? activeWaitlistForOperationalDate.map((entry) => ({ kind: "waitlist" as const, id: `wl-${entry.id}`, entry }))
        : activeBookingsForOperationalDate.filter((b) => b.status === column.key).map((b) => ({ kind: "booking" as const, id: b.id, booking: b }))
    })),
    [activeBookingsForOperationalDate, activeWaitlistForOperationalDate]
  );
  const nextUpcomingBooking = useMemo(
    () => [...bookingsForOperationalDate].sort((a, b) => (a.startTimeRaw || "").localeCompare(b.startTimeRaw || "")).find((b) => b.status !== "declined"),
    [bookingsForOperationalDate]
  );
  const urgentReminder = remindersForOperationalDate.find((item) => item.status === "pending") ?? null;
  const contactedWaitlistEntry = activeWaitlistForOperationalDate.find((e) => e.status === "contacted") ?? null;
  const activeWaitlistEntry = activeWaitlistForOperationalDate.find((e) => e.status === "active") ?? null;
  const priorityWaitlistEntry = contactedWaitlistEntry ?? activeWaitlistEntry;

  const attentionItems = useMemo(() => {
    const items: Array<{ id: string; label: string; description: string }> = [];
    const pendingBookings = bookingsForOperationalDate.filter((b) => b.status === "new");
    const holdBookings = bookingsForOperationalDate.filter((b) => b.status === "hold_pending");
    const contactedWaitlist = waitlistForOperationalDate.filter((e) => e.status === "contacted");
    if (pendingBookings.length > 0) items.push({ id: "pending", label: "Новые заявки", description: `${pendingBookings.length} ждут подтверждения на ${formatOperationalDate(operationalDate)}` });
    if (holdBookings.length > 0) items.push({ id: "hold", label: "Брони в резерве", description: `${holdBookings.length} нужно подтвердить или снять с резерва` });
    if (urgentReminder) items.push({ id: `reminder-${urgentReminder.id}`, label: "Напоминание менеджеру", description: urgentReminder.message });
    if (contactedWaitlist.length > 0) items.push({ id: "contacted", label: "Ждем ответ клиента", description: `${contactedWaitlist.length} клиентам уже написали или позвонили` });
    if (items.length === 0) items.push({ id: "calm", label: "Спокойная смена", description: "На выбранную дату нет срочных задач, можно работать по входящим броням." });
    return items.slice(0, 3);
  }, [bookingsForOperationalDate, operationalDate, urgentReminder, waitlistForOperationalDate]);

  const occupancyRows = useMemo(
    () => bookablePoints.map((point) => {
      const occupiedSlots = new Set(
        bookingsForOperationalDate.filter((b) => b.placeLabel === point.label && b.startTimeRaw && b.status !== "declined").map((b) => b.startTimeRaw as string)
      );
      return { point, occupiedSlots };
    }),
    [bookablePoints, bookingsForOperationalDate]
  );
  const manualTimeOptions = useMemo(() => {
    const available = manualSlots.filter((s) => s.status !== "unavailable").map((s) => ({ value: s.time, label: s.label }));
    if (manualTime && !available.some((o) => o.value === manualTime)) return [{ value: manualTime, label: `${manualTime} · вручную` }, ...available];
    return available;
  }, [manualSlots, manualTime]);

  useEffect(() => { if (!selectedVenueId && operationalVenues[0]) setSelectedVenueId(operationalVenues[0].id); }, [operationalVenues, selectedVenueId]);
  useEffect(() => { if (!selectedPoint && bookablePoints[0]) setSelectedHotspotId(bookablePoints[0].id); }, [bookablePoints, selectedPoint]);
  useEffect(() => { setManualDate(operationalDate); setManualTime(""); setPendingManualTime(""); }, [operationalDate]);
  useEffect(() => { if (!selectedSceneId && manualScenes[0]) setSelectedSceneId(manualScenes[0].id); }, [manualScenes, selectedSceneId]);
  useEffect(() => {
    if (selectedPoint && selectedPoint.sceneTitle !== selectedManualScene?.title) {
      const match = manualScenes.find((s) => s.title === selectedPoint.sceneTitle);
      if (match) setSelectedSceneId(match.id);
    }
  }, [manualScenes, selectedManualScene, selectedPoint]);

  useEffect(() => {
    async function loadSlots() {
      if (!selectedVenue || !selectedPoint || !manualDate) { setManualSlots([]); setIsManualSlotLoading(false); return; }
      setIsManualSlotLoading(true);
      const params = new URLSearchParams({ venueId: selectedVenue.id, date: manualDate, hotspotLabel: selectedPoint.label, hotspotStatus: selectedPoint.status || "", hotspotKind: selectedPoint.kind });
      try {
        const response = await fetch(`/api/availability?${params}`, { cache: "no-store" });
        const payload = (await response.json()) as { data?: Array<{ time: string; label: string; status: string }> };
        const slots = payload.data || [];
        setManualSlots(slots);
        const preferred = pendingManualTime || manualTime;
        const matched = slots.find((s) => s.time === preferred);
        if (preferred && (!matched || matched.status !== "unavailable")) setManualTime(preferred);
        else if (preferred && matched?.status === "unavailable") setManualTime("");
        if (pendingManualTime) setPendingManualTime("");
      } finally { setIsManualSlotLoading(false); }
    }
    void loadSlots();
  }, [manualDate, manualTime, pendingManualTime, selectedPoint, selectedVenue]);

  function executeBookingAction(bookingId: string, action: ManagerAction) {
    startTransition(async () => {
      const response = await fetch(`/api/admin/bookings/${bookingId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action })
      });
      const payload = (await response.json()) as { message?: string };
      if (!response.ok) { pushNotice({ kind: "error", message: payload.message || "Не удалось обновить заявку" }); return; }
      pushNotice({ kind: "success", message: "Статус заявки обновлен", actionLabel: "К заявкам", targetTab: "bookings" });
      router.refresh();
    });
  }

  function handleAction(bookingId: string, action: ManagerAction) {
    const confirmText = getActionConfirmationText(action);
    if (confirmText) {
      openConfirmDialog({ title: actionLabels[action], description: confirmText, confirmLabel: actionLabels[action], tone: action === "cancel" || action === "decline" ? "danger" : "default", onConfirm: () => executeBookingAction(bookingId, action) });
      return;
    }
    executeBookingAction(bookingId, action);
  }

  function handleBoardMove(booking: ManagerBooking, targetStatus: BookingBoardColumnKey) {
    const action = getBoardMoveAction(booking, targetStatus);
    if (!action) { pushNotice({ kind: "info", message: "Эту заявку нельзя перевести в выбранную колонку" }); return; }
    handleAction(booking.id, action);
  }

  function handleWaitlistOffer(entryId: string) {
    openConfirmDialog({
      title: "Отметить звонок клиенту", description: "Подтверди, что ты уже позвонил клиенту.", confirmLabel: "Позвонил",
      onConfirm: () => startTransition(async () => {
        const response = await fetch(`/api/admin/waitlist/${entryId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "offer" }) });
        const payload = (await response.json()) as { message?: string };
        if (!response.ok) { pushNotice({ kind: "error", message: payload.message || "Не удалось" }); return; }
        pushNotice({ kind: "success", message: "Звонок отмечен.", actionLabel: "Открыть лист", targetTab: "waitlist" });
        router.refresh();
      })
    });
  }

  function handleWaitlistNoResponse(entryId: string) {
    openConfirmDialog({
      title: "Закрыть ожидание", description: "Отметить, что клиент не ответил?", confirmLabel: "Не ответил", tone: "danger",
      onConfirm: () => startTransition(async () => {
        const response = await fetch(`/api/admin/waitlist/${entryId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "no-response" }) });
        const payload = (await response.json()) as { message?: string };
        if (!response.ok) { pushNotice({ kind: "error", message: payload.message || "Не удалось" }); return; }
        pushNotice({ kind: "success", message: "Запись закрыта как без ответа", actionLabel: "Открыть лист", targetTab: "waitlist" });
        router.refresh();
      })
    });
  }

  function handleWaitlistResponded(entryId: string) {
    openConfirmDialog({
      title: "Отметить ответ клиента", description: "Закрыть ожидание как успешный ответ клиента?", confirmLabel: "Ответил",
      onConfirm: () => startTransition(async () => {
        const response = await fetch(`/api/admin/waitlist/${entryId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "responded" }) });
        const payload = (await response.json()) as { message?: string };
        if (!response.ok) { pushNotice({ kind: "error", message: payload.message || "Не удалось" }); return; }
        pushNotice({ kind: "success", message: "Ответ клиента отмечен.", actionLabel: "К записи", targetTab: "manual" });
        router.refresh();
      })
    });
  }

  function handleProcessNotifications() {
    openConfirmDialog({
      title: "Обработать уведомления", description: "Система отправит все готовые напоминания.", confirmLabel: "Запустить",
      onConfirm: () => startTransition(async () => {
        const response = await fetch("/api/admin/notifications/process", { method: "POST" });
        const payload = (await response.json()) as { message?: string; processed?: number };
        if (!response.ok) { pushNotice({ kind: "error", message: payload.message || "Не удалось" }); return; }
        pushNotice({ kind: "success", message: `Уведомлений обработано: ${payload.processed || 0}`, actionLabel: "К уведомлениям", targetTab: "reminders" });
        router.refresh();
      })
    });
  }

  function collectManualFormData() {
    const form = manualFormRef.current;
    if (!form) return null;
    const fd = new FormData(form);
    return {
      form, name: String(fd.get("name") || "").trim(), phone: String(fd.get("phone") || "").trim(),
      telegram: String(fd.get("telegram") || "").trim(), time: String(fd.get("time") || "").trim(),
      guests: Number(fd.get("guests") || 1), note: String(fd.get("note") || "").trim(),
      status: String(fd.get("status") || "CONFIRMED")
    };
  }

  function submitManualBooking(collected: NonNullable<ReturnType<typeof collectManualFormData>>) {
    startTransition(async () => {
      const response = await fetch("/api/admin/bookings/manual", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ venueId: selectedVenue?.id, hotspotLabel: selectedPoint?.label, name: collected.name, phone: collected.phone, telegram: collected.telegram, date: manualDate, time: manualTime || collected.time, guests: collected.guests, note: collected.note, status: collected.status })
      });
      const payload = (await response.json()) as { message?: string };
      if (!response.ok) { pushNotice({ kind: "error", message: payload.message || "Не удалось записать бронь" }); return; }
      collected.form.reset(); setManualDate(operationalDate); setManualTime(""); setManualSlots([]); setActiveTab("bookings");
      pushNotice({ kind: "success", message: "Бронь создана и добавлена в заявки", actionLabel: "К заявкам", targetTab: "bookings" });
      router.refresh();
    });
  }

  function handleManualBooking(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const collected = collectManualFormData();
    if (!collected) { pushNotice({ kind: "error", message: "Форма недоступна" }); return; }
    openConfirmDialog({
      title: "Создать бронь",
      description: `Подтвердить бронь на ${selectedPoint?.label || "выбранную точку"}${manualDate ? ` · ${formatOperationalDate(manualDate)}` : ""}${collected.time ? ` · ${collected.time}` : ""}?`,
      confirmLabel: "Создать бронь", onConfirm: () => submitManualBooking(collected)
    });
  }

  function handleManualWaitlist() {
    const collected = collectManualFormData();
    if (!collected) { pushNotice({ kind: "error", message: "Форма недоступна" }); return; }
    if (!selectedVenue || !selectedManualScene || !selectedPoint) { pushNotice({ kind: "error", message: "Выбери объект, сцену и точку" }); return; }
    if (!collected.name || !collected.phone) { pushNotice({ kind: "error", message: "Нужны имя и телефон клиента" }); return; }
    openConfirmDialog({
      title: "Добавить в лист ожидания",
      description: `Добавить ${collected.name} в лист ожидания на ${selectedPoint.label}${manualDate ? ` · ${formatOperationalDate(manualDate)}` : ""}?`,
      confirmLabel: "Добавить",
      onConfirm: () => startTransition(async () => {
        const response = await fetch("/api/waitlist", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ venueId: selectedVenue.id, venueName: selectedVenue.name, sceneId: selectedManualScene.id, sceneTitle: selectedManualScene.title, hotspotId: selectedPoint.id, hotspotLabel: selectedPoint.label, name: collected.name, phone: collected.phone, telegram: collected.telegram || undefined, date: manualDate || undefined, time: manualTime || collected.time || undefined })
        });
        const payload = (await response.json()) as { message?: string };
        if (!response.ok) { pushNotice({ kind: "error", message: payload.message || "Не удалось" }); return; }
        collected.form.reset(); setManualDate(operationalDate); setManualTime(""); setManualSlots([]); setActiveTab("bookings");
        pushNotice({ kind: "success", message: "Клиент добавлен в ожидание", actionLabel: "К доске", targetTab: "bookings" });
        router.refresh();
      })
    });
  }

  const logoMark = companyTheme.logoText || "TS";

  return (
    <div className="m-shell">
      {/* ── TOP BAR ───────────────────────────────────────────── */}
      <header className="m-topbar">
        <div className="m-topbar-brand">
          {companyTheme.logoImageUrl ? (
            <Image alt={companyTheme.name} className="m-topbar-mark" height={30} src={companyTheme.logoImageUrl} width={30} style={{ objectFit: "cover" }} />
          ) : (
            <div className="m-topbar-mark">{logoMark}</div>
          )}
          <div>
            <div className="m-topbar-name">{companyTheme.name}</div>
            <div className="m-topbar-role">
              {managerName} · {role === "superadmin" ? "Супер-админ" : role === "admin" ? "Администратор" : "Менеджер"}
            </div>
          </div>
        </div>

        {role !== "superadmin" && (
          <>
            <div className="m-topbar-sep" />
            <div className="m-topbar-date">
              <strong>{formatOperationalDate(operationalDate)}</strong>
            </div>
          </>
        )}

        {role !== "superadmin" && (
          <div className="m-topbar-kpis">
            <div className="m-topbar-kpi">
              <span className="m-topbar-kpi-val gold">{stats.newCount}</span>
              <span className="m-topbar-kpi-label">Новые</span>
            </div>
            <div className="m-topbar-kpi">
              <span className={`m-topbar-kpi-val ${stats.holdCount > 0 ? "amber" : ""}`}>{stats.holdCount}</span>
              <span className="m-topbar-kpi-label">Hold</span>
            </div>
            <div className="m-topbar-kpi">
              <span className="m-topbar-kpi-val">{stats.bookingsCount}</span>
              <span className="m-topbar-kpi-label">Заявок</span>
            </div>
          </div>
        )}

        <div className="m-topbar-actions" style={{ marginLeft: role === "superadmin" ? "auto" : undefined }}>
          <Link className="m-btn" href="/">↗ К витрине</Link>
          <form action="/api/admin/logout" method="post">
            <button className="m-btn" type="submit">↩ Выйти</button>
          </form>
        </div>
      </header>

      {/* ── DATE BAR (non-superadmin) ─────────────────────────── */}
      {role !== "superadmin" ? (
        <div className="m-datebar">
          <span className="m-datebar-label">Операционный день</span>
          <input
            className="m-datebar-input"
            min={getTodayIso()}
            onChange={(e) => setOperationalDate(e.target.value)}
            type="date"
            value={operationalDate}
          />
          <div className="m-datebar-stats">
            <span className="m-datebar-stat"><strong>{bookingsForOperationalDate.length}</strong> броней</span>
            <span className="m-datebar-stat"><strong>{bookingsForOperationalDate.filter((b) => b.status === "confirmed").length}</strong> подтверждено</span>
            <span className="m-datebar-stat"><strong>{activeWaitlistForOperationalDate.length}</strong> в ожидании</span>
            <span className="m-datebar-stat"><strong>{remindersForOperationalDate.filter((r) => r.status === "pending").length}</strong> напоминаний</span>
          </div>
        </div>
      ) : null}

      {/* ── NOTICE TOAST ─────────────────────────────────────── */}
      {notice ? (
        <div className={`m-notice m-notice-${notice.kind}`}>
          <div className="m-notice-copy">
            <span className="m-notice-title">
              {notice.kind === "error" ? "Нужно внимание" : notice.kind === "success" ? "Готово" : "Уведомление"}
            </span>
            <p className="m-notice-msg">{notice.message}</p>
          </div>
          <div className="m-notice-actions">
            {notice.actionLabel && notice.targetTab ? (
              <button className="m-btn" onClick={() => { setActiveTab(notice.targetTab as DashboardTab); setNotice(null); }} type="button">
                {notice.actionLabel}
              </button>
            ) : null}
            <button className="m-btn" onClick={() => setNotice(null)} type="button">✕</button>
          </div>
        </div>
      ) : null}

      {/* ── CONFIRM DIALOG ───────────────────────────────────── */}
      {confirmState ? (
        <div className="m-backdrop" role="presentation" onClick={() => setConfirmState(null)}>
          <div className="m-dialog" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div className="m-dialog-head">
              <div className="m-dialog-head-copy">
                <span className="m-dialog-eyebrow">Подтверждение</span>
                <h2 className="m-dialog-title">{confirmState.title}</h2>
                <p className="m-dialog-desc">{confirmState.description}</p>
              </div>
            </div>
            <div className="m-dialog-foot">
              <button className="m-btn" onClick={() => setConfirmState(null)} type="button">Отмена</button>
              <button
                className={`m-btn ${confirmState.tone === "danger" ? "m-btn-danger" : "m-btn-gold"}`}
                onClick={confirmState.onConfirm}
                type="button"
              >
                {confirmState.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* ── BOOKING DETAIL DIALOG ────────────────────────────── */}
      {selectedBookingDetail ? (() => {
        const meta = getBookingStatusMeta(selectedBookingDetail);
        return (
          <div className="m-backdrop" role="presentation" onClick={() => setSelectedBookingId(null)}>
            <div className="m-dialog m-dialog-lg" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
              <div className="m-dialog-head">
                <div className="m-dialog-head-copy">
                  <span className="m-dialog-eyebrow">Карточка заявки</span>
                  <h2 className="m-dialog-title">{selectedBookingDetail.customerName}</h2>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8 }}>
                    <span className={`m-status m-status-${meta.tone}`}>{meta.shortLabel}</span>
                    <span style={{ fontSize: 12, color: "var(--s-muted)" }}>{selectedBookingDetail.venueName}</span>
                  </div>
                </div>
                <button className="m-btn" onClick={() => setSelectedBookingId(null)} type="button">✕</button>
              </div>

              <div className="m-dialog-body">
                <div className="m-detail-row">
                  <span className="m-detail-fact">{selectedBookingDetail.placeLabel}</span>
                  {selectedBookingDetail.slotLabel ? <span className="m-detail-fact">{selectedBookingDetail.slotLabel}</span> : null}
                  <span className="m-detail-fact">{selectedBookingDetail.dateLabel}</span>
                  <span className="m-detail-fact">{selectedBookingDetail.guestsLabel}</span>
                </div>

                <div className="m-detail-grid">
                  <div className="m-detail-section">
                    <span className="m-detail-label">Контакты</span>
                    <span className="m-detail-value">{selectedBookingDetail.phone}</span>
                    {selectedBookingDetail.telegram ? <span className="m-detail-sub">{selectedBookingDetail.telegram}</span> : null}
                  </div>
                  <div className="m-detail-section">
                    <span className="m-detail-label">Детали</span>
                    <span className="m-detail-value">{selectedBookingDetail.amountLabel}</span>
                    <span className="m-detail-sub">{selectedBookingDetail.sourceLabel}</span>
                  </div>
                </div>

                <div className="m-note">{selectedBookingDetail.managerNote}</div>

                <div className="m-detail-section">
                  <span className="m-detail-label">Связь</span>
                  <div className="m-detail-actions" style={{ marginTop: 4 }}>
                    <a aria-label="Позвонить" className="m-contact-btn" href={`tel:${slugifyPhone(selectedBookingDetail.phone)}`} title="Позвонить"><PhoneIcon /></a>
                    <a aria-label="Telegram поддержки" className="m-contact-btn" href={SUPPORT_TELEGRAM_URL} rel="noreferrer" target="_blank"><TelegramIcon /></a>
                    {selectedBookingDetail.telegram ? (
                      <a aria-label="Telegram клиента" className="m-contact-btn" href={`https://t.me/${selectedBookingDetail.telegram.replace("@", "")}`} rel="noreferrer" target="_blank"><TelegramIcon /></a>
                    ) : null}
                  </div>
                </div>

                {!selectedBookingDetail.archived ? (
                  <div className="m-detail-section">
                    <span className="m-detail-label">Изменить статус</span>
                    <div className="m-detail-actions" style={{ marginTop: 4 }}>
                      {statusActions[selectedBookingDetail.status].map((action) => (
                        <button
                          className={`m-btn ${action === "confirm" ? "m-btn-positive" : action === "cancel" || action === "decline" ? "m-btn-danger" : ""}`}
                          disabled={isPending} key={action}
                          onClick={() => { setSelectedBookingId(null); handleAction(selectedBookingDetail.id, action); }}
                          type="button"
                        >
                          {actionLabels[action]}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}

                <div className="m-detail-section">
                  <span className="m-detail-label">{selectedBookingDetail.archived ? "Вернуть в работу" : "Архив"}</span>
                  <div className="m-detail-actions" style={{ marginTop: 4 }}>
                    <button
                      className="m-btn" disabled={isPending}
                      onClick={() => { setSelectedBookingId(null); handleAction(selectedBookingDetail.id, selectedBookingDetail.archived ? "restore" : "archive"); }}
                      type="button"
                    >
                      {selectedBookingDetail.archived ? "↺ Вернуть в работу" : "Архивировать"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })() : null}

      {/* ── BODY ─────────────────────────────────────────────── */}
      <div className="m-body">
        {/* Sidebar — non-superadmin only */}
        {role !== "superadmin" ? (
          <nav className="m-sidebar">
            {([
              { key: "overview", icon: "⌂", label: "Объект" },
              { key: "bookings", icon: "▥", label: "Заявки", badge: stats.newCount > 0 ? String(stats.newCount) : undefined, badgeTone: "gold" },
              { key: "archive", icon: "◫", label: "Архив" },
              { key: "manual", icon: "＋", label: "Запись" },
              { key: "waitlist", icon: "◷", label: "Ожидание", badge: activeWaitlistForOperationalDate.length > 0 ? String(activeWaitlistForOperationalDate.length) : undefined, badgeTone: "amber" },
              { key: "reminders", icon: "◎", label: "Уведомления", badge: remindersForOperationalDate.filter((r) => r.status === "pending").length > 0 ? String(remindersForOperationalDate.filter((r) => r.status === "pending").length) : undefined }
            ] as const).map((tab) => (
              <button
                className={`m-sidebar-tab ${activeTab === tab.key ? "active" : ""}`}
                key={tab.key}
                onClick={() => setActiveTab(tab.key as DashboardTab)}
                type="button"
              >
                <span className="m-sidebar-icon">{tab.icon}</span>
                <span>{tab.label}</span>
                {"badge" in tab && tab.badge ? (
                  <span className={`m-sidebar-badge ${"badgeTone" in tab ? tab.badgeTone : ""}`}>{tab.badge}</span>
                ) : null}
              </button>
            ))}

            <div className="m-sidebar-divider" />

            <Link className="m-sidebar-tab" href={listings[0] ? `/manager/listings/${listings[0].id}` : "/manager"}>
              <span className="m-sidebar-icon">✎</span>
              <span>Редактировать</span>
            </Link>
          </nav>
        ) : null}

        {/* ── MAIN CONTENT ───────────────────────────────────── */}
        <main className="m-content">

          {/* ── SUPERADMIN VIEW ──────────────────────────────── */}
          {role === "superadmin" ? (
            <>
              <div className="m-section-head">
                <div>
                  <div className="m-eyebrow">Платформа</div>
                  <h1 className="m-section-title">Все объекты · {listings.length} записей</h1>
                </div>
                <div className="m-section-actions">
                  <div className="m-pagination">
                    <button className="m-btn" disabled={superadminPage <= 1} onClick={() => setSuperadminPage((p) => Math.max(1, p - 1))} type="button">← Назад</button>
                    <span className="m-pagination-info">{superadminPage} / {superadminPageCount}</span>
                    <button className="m-btn" disabled={superadminPage >= superadminPageCount} onClick={() => setSuperadminPage((p) => Math.min(superadminPageCount, p + 1))} type="button">Дальше →</button>
                  </div>
                  <Link className="m-btn m-btn-gold" href="/manager/settings">Центр управления →</Link>
                </div>
              </div>

              <div className="m-admin-grid">
                {pagedListings.map((listing) => (
                  <article className="m-admin-card" key={listing.id}>
                    <span className="m-admin-card-type">{listing.type}</span>
                    <span className="m-admin-card-name">{listing.name}</span>
                    <span className="m-admin-card-company">{companies.find((c) => c.id === listing.companyId)?.name || listing.companyId}</span>
                    <span style={{ fontSize: 11, color: "var(--s-muted)" }}>{listing.city}</span>
                    <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 4 }}>
                      <span style={{ fontSize: 12, color: "var(--s-text)" }}>{listing.price}</span>
                      <span className={`m-status m-status-${listing.availability === "available" ? "confirmed" : listing.availability === "limited" ? "hold" : "waitlist"}`}>
                        {listing.availability === "available" ? "Свободно" : listing.availability === "limited" ? "Мало мест" : "Почти занято"}
                      </span>
                    </div>
                    <Link className="m-btn" href={`/manager/listings/${listing.id}`} style={{ marginTop: 8, display: "inline-flex" }}>
                      Редактировать →
                    </Link>
                  </article>
                ))}
              </div>
            </>
          ) : null}

          {/* ── OVERVIEW TAB ─────────────────────────────────── */}
          {role !== "superadmin" && activeTab === "overview" ? (
            <>
              <div className="m-section-head">
                <div>
                  <div className="m-eyebrow">Объект менеджера</div>
                  <h1 className="m-section-title">{listings[0]?.name || "Объект не найден"}</h1>
                </div>
              </div>

              {listings[0] ? (
                <>
                  <div className="m-overview-grid">
                    <div className="m-listing-panel">
                      <span className="m-admin-card-type">{listings[0].type}</span>
                      <p className="m-listing-name">{listings[0].name}</p>
                      <span className="m-listing-meta">{listings[0].city}</span>
                      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                        <span className={`m-status m-status-${listings[0].availability === "available" ? "confirmed" : listings[0].availability === "limited" ? "hold" : "waitlist"}`}>
                          {listings[0].availability === "available" ? "Свободно" : listings[0].availability === "limited" ? "Мало мест" : "Почти занято"}
                        </span>
                        <span className="m-listing-meta">{listings[0].price}</span>
                      </div>
                      <div className="m-listing-stats">
                        <div className="m-listing-stat">
                          <span className="m-listing-stat-val">{stats.bookingsCount}</span>
                          <span className="m-listing-stat-label">Заявок</span>
                        </div>
                        <div className="m-listing-stat">
                          <span className="m-listing-stat-val" style={{ color: "var(--s-gold-lt)" }}>{stats.newCount}</span>
                          <span className="m-listing-stat-label">Новые</span>
                        </div>
                        <div className="m-listing-stat">
                          <span className="m-listing-stat-val" style={{ color: stats.holdCount > 0 ? "var(--s-amber)" : undefined }}>{stats.holdCount}</span>
                          <span className="m-listing-stat-label">Hold</span>
                        </div>
                      </div>
                      <Link className="m-btn m-btn-gold" href={`/manager/listings/${listings[0].id}`} style={{ marginTop: 8 }}>
                        Редактировать объект →
                      </Link>
                    </div>

                    <div className="m-focus-grid">
                      {/* Next booking */}
                      <div className="m-focus-card">
                        <span className="m-focus-eyebrow">Следующая бронь</span>
                        {nextUpcomingBooking ? (
                          <>
                            <span className="m-focus-name">{nextUpcomingBooking.customerName}</span>
                            <p className="m-focus-sub">{nextUpcomingBooking.placeLabel} · {formatTime(nextUpcomingBooking.startTimeRaw)}</p>
                            <div className="m-focus-actions">
                              <a className="m-contact-btn" href={`tel:${slugifyPhone(nextUpcomingBooking.phone)}`}><PhoneIcon /></a>
                              <a className="m-contact-btn" href={SUPPORT_TELEGRAM_URL} rel="noreferrer" target="_blank"><TelegramIcon /></a>
                              {nextUpcomingBooking.telegram ? (
                                <a className="m-contact-btn" href={`https://t.me/${nextUpcomingBooking.telegram.replace("@", "")}`} rel="noreferrer" target="_blank"><TelegramIcon /></a>
                              ) : null}
                            </div>
                          </>
                        ) : (
                          <p className="m-focus-sub">На выбранную дату активных броней пока нет.</p>
                        )}
                      </div>

                      {/* Attention */}
                      <div className="m-focus-card">
                        <span className="m-focus-eyebrow">Требует внимания</span>
                        <div className="m-attention-list">
                          {attentionItems.map((item) => (
                            <div className="m-attention-item" key={item.id}>
                              <span className="m-attention-label">{item.label}</span>
                              <p className="m-attention-desc">{item.description}</p>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Waitlist */}
                      <div className="m-focus-card">
                        <span className="m-focus-eyebrow">Очередь ожидания</span>
                        {priorityWaitlistEntry ? (
                          <>
                            <span className="m-focus-name">{priorityWaitlistEntry.customerName}</span>
                            <span className={`m-status m-status-${priorityWaitlistEntry.status === "contacted" ? "contacted" : "active"}`}>
                              {priorityWaitlistEntry.status === "contacted" ? "Связались, ждем итог" : "Ждет первого контакта"}
                            </span>
                            <p className="m-focus-sub">{priorityWaitlistEntry.hotspotLabel}</p>
                            <div className="m-focus-actions">
                              <a className="m-contact-btn" href={`tel:${slugifyPhone(priorityWaitlistEntry.customerPhone)}`}><PhoneIcon /></a>
                              <a className="m-contact-btn" href={SUPPORT_TELEGRAM_URL} rel="noreferrer" target="_blank"><TelegramIcon /></a>
                              {priorityWaitlistEntry.customerTelegram ? (
                                <a className="m-contact-btn" href={`https://t.me/${priorityWaitlistEntry.customerTelegram.replace("@", "")}`} rel="noreferrer" target="_blank"><TelegramIcon /></a>
                              ) : null}
                              <button className="m-btn" disabled={isPending} onClick={() => handleWaitlistOffer(priorityWaitlistEntry.id)} type="button">
                                {priorityWaitlistEntry.status === "contacted" ? "Позвонить ещё" : "Позвонил"}
                              </button>
                              {priorityWaitlistEntry.status === "contacted" ? (
                                <>
                                  <button className="m-btn m-btn-positive" disabled={isPending} onClick={() => handleWaitlistResponded(priorityWaitlistEntry.id)} type="button">Ответил</button>
                                  <button className="m-btn m-btn-danger" disabled={isPending} onClick={() => handleWaitlistNoResponse(priorityWaitlistEntry.id)} type="button">Не ответил</button>
                                </>
                              ) : null}
                            </div>
                          </>
                        ) : (
                          <p className="m-focus-sub">Лист ожидания на эту дату пуст.</p>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Occupancy */}
                  {occupancyRows.length > 0 ? (
                    <>
                      <div className="m-section-head" style={{ marginTop: 32 }}>
                        <div>
                          <div className="m-eyebrow">Загрузка</div>
                          <h2 className="m-section-title">Схема дня по столам и зонам</h2>
                        </div>
                      </div>
                      <div className="m-occupancy">
                        <div className="m-occupancy-head">
                          <span className="m-occupancy-head-label">Точка</span>
                          <div className="m-occupancy-head-slots">
                            {operationalTimeline.map((slot) => (
                              <span className="m-occupancy-head-slot" key={slot}>{slot}</span>
                            ))}
                          </div>
                        </div>
                        {occupancyRows.map((row) => (
                          <div className="m-occupancy-row" key={row.point.id}>
                            <span className="m-occupancy-row-label">{row.point.label}</span>
                            <div className="m-occupancy-cells">
                              {operationalTimeline.map((slot) => {
                                const busy = row.occupiedSlots.has(slot);
                                return (
                                  <button
                                    className={`m-occupancy-cell ${busy ? "busy" : "free"}`}
                                    disabled={busy}
                                    key={`${row.point.id}-${slot}`}
                                    onClick={() => {
                                      if (busy) return;
                                      setSelectedHotspotId(row.point.id);
                                      setSelectedSceneId(manualScenes.find((s) => s.title === row.point.sceneTitle)?.id || selectedSceneId);
                                      setManualDate(operationalDate);
                                      setPendingManualTime(slot);
                                      setManualTime(slot);
                                      setActiveTab("manual");
                                    }}
                                    type="button"
                                  >
                                    {busy ? "Занят" : "Своб."}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : null}
                </>
              ) : (
                <div className="m-note">За вами пока не закреплен объект.</div>
              )}
            </>
          ) : null}

          {/* ── BOOKINGS KANBAN ──────────────────────────────── */}
          {role !== "superadmin" && activeTab === "bookings" ? (
            <>
              <div className="m-section-head">
                <div>
                  <div className="m-eyebrow">Мои заявки</div>
                  <h1 className="m-section-title">{role === "manager" ? "Только назначенные вам" : "Все заявки компании"}</h1>
                </div>
              </div>
              <div className="m-note" style={{ marginBottom: 16 }}>
                Перетаскивай карточки между колонками, чтобы менять этап заявки без лишних кнопок.
              </div>
              <div className="m-kanban">
                {bookingBoard.map((column) => (
                  <section
                    className={`m-kanban-col ${dragOverColumn === column.key ? "drag-over" : ""}`}
                    key={column.key}
                    onDragLeave={() => setDragOverColumn((c) => (c === column.key ? null : c))}
                    onDragOver={(e) => { if (column.key === "waitlist_entries") return; e.preventDefault(); setDragOverColumn(column.key); }}
                    onDrop={(e) => {
                      if (column.key === "waitlist_entries") { setDragOverColumn(null); setDraggedBookingId(null); return; }
                      e.preventDefault();
                      const booking = bookingsForOperationalDate.find((b) => b.id === draggedBookingId);
                      setDragOverColumn(null); setDraggedBookingId(null);
                      if (booking) handleBoardMove(booking, column.key);
                    }}
                  >
                    <div className="m-kanban-col-head">
                      <div>
                        <span className="m-kanban-col-title">{column.title}</span>
                        <span className="m-kanban-col-hint">{column.hint}</span>
                      </div>
                      <span className="m-kanban-col-count">{column.items.length}</span>
                    </div>

                    <div className="m-kanban-list">
                      {column.items.length === 0 ? <div className="m-kanban-empty">Пусто</div> : null}
                      {column.items.map((item) => {
                        if (item.kind === "waitlist") {
                          const meta = getWaitlistEntryMeta(item.entry);
                          return (
                            <article className="m-booking-card" key={item.id} onClick={() => setActiveTab("waitlist")}>
                              <div className="m-booking-card-top">
                                <span className={`m-status m-status-${meta.tone}`}>{meta.shortLabel}</span>
                                <span className="m-booking-card-name">{item.entry.customerName}</span>
                              </div>
                              <div className="m-booking-card-info">
                                <div className="m-booking-card-row">
                                  <span className="m-booking-card-lbl">Стол</span>
                                  <span className="m-booking-card-val">{item.entry.hotspotLabel}</span>
                                </div>
                                {item.entry.requestedTimeRaw ? (
                                  <div className="m-booking-card-row">
                                    <span className="m-booking-card-lbl">Время</span>
                                    <span className="m-booking-card-val">{item.entry.requestedTimeRaw}</span>
                                  </div>
                                ) : null}
                              </div>
                              <div className="m-booking-card-hint">◷ Открыть лист ожидания</div>
                            </article>
                          );
                        }

                        const booking = item.booking;
                        const meta = getBookingStatusMeta(booking);
                        return (
                          <article
                            className="m-booking-card"
                            draggable
                            key={item.id}
                            onClick={() => setSelectedBookingId(booking.id)}
                            onDragEnd={() => { setDraggedBookingId(null); setDragOverColumn(null); }}
                            onDragStart={() => setDraggedBookingId(booking.id)}
                          >
                            <div className="m-booking-card-top">
                              <span className={`m-status m-status-${meta.tone}`}>{meta.shortLabel}</span>
                              <span className="m-booking-card-name">{booking.customerName}</span>
                            </div>
                            <div className="m-booking-card-info">
                              <div className="m-booking-card-row">
                                <span className="m-booking-card-lbl">Стол</span>
                                <span className="m-booking-card-val">{booking.placeLabel}</span>
                              </div>
                              {booking.slotLabel ? (
                                <div className="m-booking-card-row">
                                  <span className="m-booking-card-lbl">Время</span>
                                  <span className="m-booking-card-val">{booking.slotLabel}</span>
                                </div>
                              ) : null}
                              <div className="m-booking-card-row">
                                <span className="m-booking-card-lbl">Дата</span>
                                <span className="m-booking-card-val">{booking.dateLabel}</span>
                              </div>
                            </div>
                            <div className="m-booking-card-hint">↗ Открыть детали</div>
                          </article>
                        );
                      })}
                    </div>
                  </section>
                ))}
              </div>
            </>
          ) : null}

          {/* ── ARCHIVE TAB ──────────────────────────────────── */}
          {role !== "superadmin" && activeTab === "archive" ? (
            <>
              <div className="m-section-head">
                <div>
                  <div className="m-eyebrow">Архив заявок</div>
                  <h1 className="m-section-title">Все архивные заявки</h1>
                </div>
                <div className="m-filters">
                  <input className="m-filter-input" onChange={(e) => setArchiveQuery(e.target.value)} placeholder="Поиск по клиенту, столу, телефону" type="search" value={archiveQuery} />
                  <select className="m-filter-select" onChange={(e) => setArchiveStatusFilter(e.target.value as "all" | ManagerBooking["status"])} value={archiveStatusFilter}>
                    <option value="all">Все статусы</option>
                    <option value="new">Новая</option>
                    <option value="hold_pending">Резерв</option>
                    <option value="confirmed">Подтверждена</option>
                    <option value="waitlist">Ожидание</option>
                    <option value="declined">Закрыта</option>
                  </select>
                  <input className="m-filter-input" onChange={(e) => setArchiveDateFilter(e.target.value)} type="date" value={archiveDateFilter} style={{ minWidth: 140 }} />
                </div>
              </div>

              <div className="m-list">
                {filteredArchivedBookings.length === 0 ? (
                  <div className="m-note">В архиве ничего не найдено по текущим фильтрам.</div>
                ) : null}
                {filteredArchivedBookings.map((booking) => {
                  const meta = getBookingStatusMeta(booking);
                  return (
                    <div className="m-list-card" key={`arch-${booking.id}`}>
                      <div className="m-list-card-top">
                        <div>
                          <div className="m-list-card-name">{booking.customerName}</div>
                          <div className="m-list-card-sub">{meta.detailLabel}</div>
                        </div>
                        <span className={`m-status m-status-${meta.tone}`}>{meta.shortLabel}</span>
                      </div>
                      <div className="m-list-card-grid">
                        <div className="m-list-card-facts">
                          <span className="m-fact">{booking.placeLabel}</span>
                          {booking.slotLabel ? <span className="m-fact">{booking.slotLabel}</span> : null}
                          <span className="m-fact">{booking.dateLabel}</span>
                          <span className="m-fact">{booking.guestsLabel}</span>
                          <span className="m-fact">{booking.phone}</span>
                        </div>
                        <div className="m-list-card-actions">
                          <button className="m-btn" onClick={() => setSelectedBookingId(booking.id)} type="button">↗ Детали</button>
                          <button className="m-btn" disabled={isPending} onClick={() => handleAction(booking.id, "restore")} type="button">↺ В работу</button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          ) : null}

          {/* ── MANUAL BOOKING TAB ───────────────────────────── */}
          {role !== "superadmin" && activeTab === "manual" ? (
            <>
              <div className="m-section-head">
                <div>
                  <div className="m-eyebrow">Быстрая запись</div>
                  <h1 className="m-section-title">Записать бронь на конкретный стол</h1>
                </div>
              </div>

              <form onSubmit={handleManualBooking} ref={manualFormRef}>
                {/* Venue info */}
                <div className="m-note" style={{ marginBottom: 20 }}>
                  <strong style={{ color: "var(--s-text)", fontSize: 13 }}>{selectedVenue?.name || "Объект не выбран"}</strong>
                  {selectedVenue ? <span style={{ marginLeft: 8 }}>{selectedVenue.city}</span> : <span> — подключи объект к менеджеру</span>}
                </div>

                {/* Floor plan */}
                {selectedManualScene ? (
                  <div className="m-plan-wrap">
                    <div className="m-plan-head">
                      <div>
                        <div className="m-eyebrow">Схема выбора</div>
                        <strong style={{ fontSize: 13, color: "var(--s-text)" }}>{selectedManualScene.floorPlanLabel || selectedManualScene.title}</strong>
                      </div>
                      <div className="m-plan-scene-tabs">
                        {manualScenes.map((scene) => (
                          <button
                            className={`m-plan-scene-tab ${scene.id === selectedManualScene.id ? "active" : ""}`}
                            key={scene.id}
                            onClick={() => { setSelectedSceneId(scene.id); setManualTime(""); setPendingManualTime(""); }}
                            type="button"
                          >
                            {scene.title}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="m-plan-board">
                      {selectedScenePoints.map((point) => {
                        const left = `${Math.min(Math.max(((point.yaw + 180) / 360) * 100, 8), 92)}%`;
                        const top = `${Math.min(Math.max(((point.pitch + 35) / 70) * 100, 12), 88)}%`;
                        return (
                          <button
                            className={`m-plan-point ${selectedPoint?.id === point.id ? "active" : ""}`}
                            key={point.id}
                            onClick={() => { setSelectedHotspotId(point.id); setManualTime(""); setPendingManualTime(""); }}
                            style={{ left, top } as CSSProperties}
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

                {/* Point selector */}
                <div className="m-form-grid" style={{ gridTemplateColumns: "1fr" }}>
                  <div className="m-field">
                    <label className="m-field-label">Точка по схеме</label>
                    <select className="m-select" onChange={(e) => { setSelectedHotspotId(e.target.value); setManualTime(""); setPendingManualTime(""); }} value={selectedPoint?.id || ""}>
                      {bookablePoints.map((point) => (
                        <option key={point.id} value={point.id}>{point.sceneTitle} · {point.label}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Client info */}
                <div className="m-form-grid">
                  <div className="m-field">
                    <label className="m-field-label">Клиент</label>
                    <input className="m-input" name="name" placeholder="Имя клиента" required />
                  </div>
                  <div className="m-field">
                    <label className="m-field-label">Телефон</label>
                    <input className="m-input" name="phone" placeholder="+998..." required />
                  </div>
                  <div className="m-field">
                    <label className="m-field-label">Telegram</label>
                    <input className="m-input" name="telegram" placeholder="@telegram" />
                  </div>
                  <div className="m-field">
                    <label className="m-field-label">Гостей</label>
                    <input className="m-input" defaultValue={2} min={1} name="guests" type="number" />
                  </div>
                </div>

                {/* Date/time/status */}
                <div className="m-form-grid">
                  <div className="m-field">
                    <label className="m-field-label">Дата</label>
                    <input className="m-input" min={getTodayIso()} onChange={(e) => { setManualDate(e.target.value); setManualTime(""); setPendingManualTime(""); }} type="date" value={manualDate} />
                  </div>
                  <div className="m-field">
                    <label className="m-field-label">Время</label>
                    <select className="m-select" name="time" onChange={(e) => { setManualTime(e.target.value); setPendingManualTime(""); }} value={manualTime}>
                      <option value="">Любое время / уточнить позже</option>
                      {manualTimeOptions.map((slot) => (
                        <option key={slot.value} value={slot.value}>{slot.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="m-field">
                    <label className="m-field-label">Статус</label>
                    <select className="m-select" defaultValue="CONFIRMED" name="status">
                      <option value="CONFIRMED">Сразу подтвердить</option>
                      <option value="HOLD_PENDING">Поставить на hold</option>
                      <option value="NEW">Новая заявка</option>
                    </select>
                  </div>
                </div>

                {/* Slot feedback */}
                <div className={`m-slot-feedback ${manualTime ? "has-slot" : ""}`}>
                  {isManualSlotLoading ? "Загружаем доступные слоты..." : manualTime ? <>Выбран слот: <strong>{manualTime}</strong></> : "Выбери свободный слот на схеме дня или в списке времени."}
                </div>

                {/* Note */}
                <div className="m-field" style={{ marginBottom: 24 }}>
                  <label className="m-field-label">Комментарий</label>
                  <textarea className="m-textarea" name="note" placeholder="Доп. заметка менеджера" />
                </div>

                <div className="m-form-actions">
                  <button className="m-btn m-btn-gold" disabled={isPending} type="submit">Записать бронь</button>
                  <button className="m-btn" disabled={isPending} onClick={handleManualWaitlist} type="button">В лист ожидания</button>
                </div>
              </form>
            </>
          ) : null}

          {/* ── WAITLIST TAB ─────────────────────────────────── */}
          {role !== "superadmin" && activeTab === "waitlist" ? (
            <>
              <div className="m-section-head">
                <div>
                  <div className="m-eyebrow">Лист ожидания</div>
                  <h1 className="m-section-title">Клиенты, с которыми нужно связаться</h1>
                </div>
              </div>

              <div className="m-list" style={{ marginBottom: 32 }}>
                {activeWaitlistForOperationalDate.length === 0 ? (
                  <div className="m-note">Лист ожидания пока пуст.</div>
                ) : null}
                {activeWaitlistForOperationalDate.map((entry) => (
                  <div className="m-list-card" key={entry.id}>
                    <div className="m-list-card-top">
                      <div>
                        <div className="m-list-card-name">{entry.customerName}</div>
                        <div className="m-list-card-sub">{entry.venueName}</div>
                      </div>
                      <span className={`m-status m-status-${entry.status === "contacted" ? "contacted" : "active"}`}>
                        {entry.status === "contacted" ? "Связались" : "Ожидает"}
                      </span>
                    </div>
                    <div className="m-list-card-grid">
                      <div className="m-list-card-facts">
                        <span className="m-fact">{entry.hotspotLabel}</span>
                        {entry.requestedSlotLabel ? <span className="m-fact">{entry.requestedSlotLabel}</span> : null}
                        <span className="m-fact">{entry.customerPhone}</span>
                        {entry.customerTelegram ? <span className="m-fact">{entry.customerTelegram}</span> : null}
                        <span className="m-fact">{entry.requestedAtLabel}</span>
                      </div>
                      <div className="m-list-card-actions">
                        <a className="m-contact-btn" href={`tel:${slugifyPhone(entry.customerPhone)}`}><PhoneIcon /></a>
                        <a className="m-contact-btn" href={SUPPORT_TELEGRAM_URL} rel="noreferrer" target="_blank"><TelegramIcon /></a>
                        {entry.customerTelegram ? (
                          <a className="m-contact-btn" href={`https://t.me/${entry.customerTelegram.replace("@", "")}`} rel="noreferrer" target="_blank"><TelegramIcon /></a>
                        ) : null}
                        <button className="m-btn" disabled={isPending} onClick={() => handleWaitlistOffer(entry.id)} type="button">
                          {entry.status === "contacted" ? "Позвонить ещё" : "Позвонил"}
                        </button>
                        {entry.status === "contacted" ? (
                          <>
                            <button className="m-btn m-btn-positive" disabled={isPending} onClick={() => handleWaitlistResponded(entry.id)} type="button">Ответил</button>
                            <button className="m-btn m-btn-danger" disabled={isPending} onClick={() => handleWaitlistNoResponse(entry.id)} type="button">Не ответил</button>
                          </>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {archivedWaitlistForOperationalDate.length > 0 ? (
                <>
                  <div className="m-section-head">
                    <div>
                      <div className="m-eyebrow">История ожидания</div>
                      <h2 className="m-section-title">Закрытые записи</h2>
                    </div>
                  </div>
                  <div className="m-list">
                    {archivedWaitlistForOperationalDate.map((entry) => (
                      <div className="m-list-card" key={`hist-${entry.id}`}>
                        <div className="m-list-card-top">
                          <div>
                            <div className="m-list-card-name">{entry.customerName}</div>
                            <div className="m-list-card-sub">{entry.venueName}</div>
                          </div>
                          <span className={`m-status ${entry.status === "resolved" ? "m-status-resolved" : "m-status-declined"}`}>
                            {entry.status === "resolved" ? "Закрыто" : "Отменено"}
                          </span>
                        </div>
                        <div className="m-list-card-facts">
                          <span className="m-fact">{entry.hotspotLabel}</span>
                          {entry.requestedSlotLabel ? <span className="m-fact">{entry.requestedSlotLabel}</span> : null}
                          <span className="m-fact">{entry.customerPhone}</span>
                          <span className="m-fact">{entry.requestedAtLabel}</span>
                        </div>
                        {entry.note ? <div className="m-note">{entry.note}</div> : null}
                      </div>
                    ))}
                  </div>
                </>
              ) : null}
            </>
          ) : null}

          {/* ── REMINDERS TAB ────────────────────────────────── */}
          {role !== "superadmin" && activeTab === "reminders" ? (
            <>
              <div className="m-section-head">
                <div>
                  <div className="m-eyebrow">Напоминания и бот</div>
                  <h1 className="m-section-title">Очередь уведомлений по броням</h1>
                </div>
                <button className="m-btn m-btn-gold" disabled={isPending} onClick={handleProcessNotifications} type="button">
                  Обработать сейчас
                </button>
              </div>

              <div className="m-list">
                {remindersForOperationalDate.length === 0 ? (
                  <div className="m-note">Пока нет запланированных уведомлений.</div>
                ) : null}
                {remindersForOperationalDate.map((item) => (
                  <div className="m-list-card" key={item.id}>
                    <div className="m-list-card-top">
                      <div>
                        <div className="m-list-card-name">{item.venueName}</div>
                        <div className="m-list-card-sub">{item.message}</div>
                      </div>
                      <span className={`m-status m-status-${item.status === "pending" ? "pending" : item.status === "sent" ? "sent" : "error"}`}>
                        {item.status === "pending" ? "Запланировано" : item.status === "sent" ? "Отправлено" : "Ошибка"}
                      </span>
                    </div>
                    <div className="m-list-card-facts">
                      {item.placeLabel ? <span className="m-fact">{item.placeLabel}</span> : null}
                      <span className="m-fact">{item.scheduledAtLabel}</span>
                      <span className="m-fact">{item.channel}</span>
                      <span className="m-fact">{item.recipientLabel}</span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : null}

        </main>
      </div>
    </div>
  );
}
