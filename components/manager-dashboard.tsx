"use client";

import type { CSSProperties, FormEvent } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";

import { collectAllTables, hydrateFloorPlanRooms, migrateFloorPlan } from "@/lib/floor-plan";
import type {
  CompanyThemeConfig,
  FloorPlanItemMeta,
  FloorPlanRoom,
  FloorPlanTableStatus,
  ManagerAction,
  ManagerBooking,
  ManagerListing,
  ManagerReminderItem,
  ManagerWaitlistEntry,
  Venue
} from "@/lib/types";
import { FloorPlanViewer } from "@/components/floor-plan-viewer";
import {
  getBookingWindow,
  getExistingBookingWindow,
  windowsOverlap
} from "@/lib/booking-time-policy";

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

type DashboardTab = "overview" | "bookings" | "archive" | "manual" | "waitlist" | "reminders" | "hall";
type OverviewWorkspaceTab = "shift" | "occupancy" | "stream";
type BookingBoardColumnKey = "new" | "hold_pending" | "confirmed" | "waitlist" | "waitlist_entries" | "declined";
type BookingBoardItem =
  | { kind: "booking"; id: string; booking: ManagerBooking }
  | { kind: "waitlist"; id: string; entry: ManagerWaitlistEntry };
type BookingPoint = {
  id: string;
  label: string;
  bookingSlots: string[];
  sceneId: string;
  sceneTitle: string;
  roomName: string;
  floorPlanLabel?: string;
  status?: "available" | "limited" | "waitlist";
  kind: "table";
  yaw: number;
  pitch: number;
  source: "hotspot" | "floor-table";
  floorRoomId?: string;
  floorTableId?: string;
};

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

type HallOperationalTone = "attention" | "late" | "arriving";

type HallOperationalState = {
  bookingId: string;
  tone: HallOperationalTone;
  label: string;
  shortLabel: string;
  description: string;
  tableId?: string;
};

type SidebarTabItem = {
  key: DashboardTab;
  icon: string;
  label: string;
  badge?: string;
  badgeTone?: "gold" | "amber" | "red" | "slate" | "violet";
};

type OptimisticWalkinEntry = {
  bookingId: string;
  tableId: string;
  tableLabel: string;
  roomName?: string;
  startTimeRaw: string;
  operationalDate: string;
  upcomingBookingTime?: string;
};

const HALL_ARRIVING_WINDOW_MINUTES = 30;
const HALL_LATE_THRESHOLD_MINUTES = 15;
const OPERATIONAL_NOTE_ARRIVED = "[ARRIVED]";
const LIVE_SYNC_INTERVAL_MS = 10_000;
const LIVE_SYNC_THROTTLE_MS = 4_000;

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
function normalizePlanKey(value?: string) { return (value || "").trim().toLowerCase(); }
function compareStableText(left?: string, right?: string) {
  const normalizedLeft = (left || "").trim().toLowerCase();
  const normalizedRight = (right || "").trim().toLowerCase();
  if (normalizedLeft < normalizedRight) return -1;
  if (normalizedLeft > normalizedRight) return 1;
  const rawLeft = left || "";
  const rawRight = right || "";
  if (rawLeft < rawRight) return -1;
  if (rawLeft > rawRight) return 1;
  return 0;
}
function getBookingStartDate(booking: Pick<ManagerBooking, "eventDateIso" | "startTimeRaw">) {
  if (!booking.eventDateIso || !booking.startTimeRaw) {
    return null;
  }

  const value = new Date(`${booking.eventDateIso}T${booking.startTimeRaw}:00`);
  return Number.isNaN(value.getTime()) ? null : value;
}
function formatRelativeMinutes(minutes: number) {
  if (minutes <= 0) return "сейчас";
  if (minutes < 60) return `${minutes} мин`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder > 0 ? `${hours} ч ${remainder} мин` : `${hours} ч`;
}
function isPastOperationalSlot(date: string, time: string, now = new Date()) {
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  if (date !== today) {
    return false;
  }

  return new Date(`${date}T${time}:00`).getTime() <= now.getTime();
}
function isBookingMarkedArrived(note?: string) {
  return (note || "").includes(OPERATIONAL_NOTE_ARRIVED);
}
function shortCustomerName(value?: string) {
  if (!value) return "";
  return value.split(" ")[0] || value;
}

function formatCompactGuestsLabel(value?: string) {
  const count = Number.parseInt((value || "").replace(/[^\d]/g, ""), 10);
  if (!Number.isFinite(count) || count <= 0) {
    return "гости";
  }
  if (count === 1) {
    return "1 гость";
  }
  if (count >= 2 && count <= 4) {
    return `${count} гостя`;
  }
  return `${count} гостей`;
}

function matchesBookingPoint(booking: Pick<ManagerBooking, "tableId" | "roomName" | "placeLabel">, point: BookingPoint) {
  if (booking.tableId && point.floorTableId) {
    return booking.tableId === point.floorTableId;
  }

  if (booking.roomName) {
    return (
      normalizePlanKey(booking.placeLabel) === normalizePlanKey(point.label) &&
      normalizePlanKey(booking.roomName) === normalizePlanKey(point.roomName)
    );
  }

  return normalizePlanKey(booking.placeLabel) === normalizePlanKey(point.label);
}

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
    case "arrived": return "Отметить, что гость уже пришел и посажен за стол?";
    case "complete_visit": return "Освободить стол и завершить визит? Заявка уйдет из активной работы в архив.";
    default: return "";
  }
}

const actionLabels: Record<ManagerAction, string> = {
  confirm: "Подтвердить", decline: "Не подтверждать", hold: "Резерв 30 мин",
  waitlist: "В ожидание", cancel: "Снять бронь", archive: "Архивировать", restore: "Вернуть в работу",
  arrived: "Гость пришёл", complete_visit: "Стол свободен"
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
  if (isBookingMarkedArrived(booking.managerNote) && booking.status === "confirmed") {
    return { shortLabel: "В зале", detailLabel: "Гость уже посажен", tone: "confirmed" } as const;
  }
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

function getQuickTableStatusActions(booking: ManagerBooking): ManagerAction[] {
  const actions = [...statusActions[booking.status]];

  if (booking.status === "confirmed") {
    if (isBookingMarkedArrived(booking.managerNote)) {
      actions.unshift("complete_visit");
    } else {
      actions.unshift("arrived");
    }
  }

  return actions;
}

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
  const [overviewWorkspaceTab, setOverviewWorkspaceTab] = useState<OverviewWorkspaceTab>("shift");
  const [selectedSceneId, setSelectedSceneId] = useState("");
  const [operationalDate, setOperationalDate] = useState(getTodayIso());
  const [manualDate, setManualDate] = useState(getTodayIso());
  const [manualTime, setManualTime] = useState("");
  const [pendingManualTime, setPendingManualTime] = useState("");
  const [manualStatus, setManualStatus] = useState("CONFIRMED");
  const [liveNowMs, setLiveNowMs] = useState(() => Date.now());
  const [manualSlots, setManualSlots] = useState<Array<{ time: string; label: string; status: string }>>([]);
  const [isManualSlotLoading, setIsManualSlotLoading] = useState(false);
  const [manualConflict, setManualConflict] = useState<null | {
    customerName: string | null;
    placeLabel: string;
    windowLabel: string;
  }>(null);
  const [phoneInputValue, setPhoneInputValue] = useState("");
  type WalkinSuggestion = {
    tableId: string;
    tableLabel: string;
    roomName: string;
    roomId: string;
    capacity: number;
    nextBookingTime: string | null;
    availableMinutes: number | null;
  };
  const [walkinSearchOpen, setWalkinSearchOpen] = useState(false);
  const [walkinGuests, setWalkinGuests] = useState(2);
  const [walkinDuration, setWalkinDuration] = useState(90);
  const [walkinSuggestions, setWalkinSuggestions] = useState<WalkinSuggestion[] | null>(null);
  const [walkinSearchLoading, setWalkinSearchLoading] = useState(false);
  const [walkinSeatingId, setWalkinSeatingId] = useState<string | null>(null);
  const [walkinPreferredRoomId, setWalkinPreferredRoomId] = useState<string>("");
  const [guestProfile, setGuestProfile] = useState<null | {
    phone: string;
    primaryName: string;
    totalBookings: number;
    confirmedBookings: number;
    noShowCount: number;
    lastVisitLabel: string | null;
    averageGuests: number;
    favoriteVenueName: string | null;
    favoritePlaceLabel: string | null;
    flags: Array<"first-visit" | "regular" | "vip" | "risk">;
  }>(null);
  const [guestLookupLoading, setGuestLookupLoading] = useState(false);
  const [superadminPage, setSuperadminPage] = useState(1);
  const [draggedBookingId, setDraggedBookingId] = useState<string | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<BookingBoardColumnKey | null>(null);
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null);
  const [selectedFloorRoomId, setSelectedFloorRoomId] = useState("");
  const [selectedFloorTableId, setSelectedFloorTableId] = useState<string>("");
  const [assignTimeSlots, setAssignTimeSlots] = useState<Array<{ time: string; label: string; status: string }>>([]);
  const [selectedAssignTime, setSelectedAssignTime] = useState("");
  const [isAssignTimeLoading, setIsAssignTimeLoading] = useState(false);
  const [walkinDialog, setWalkinDialog] = useState<{
    tableId: string;
    tableLabel: string;
    roomName?: string;
    walkinBookingId?: string;
    upcomingBookingTime?: string;
    upcomingBookingCustomer?: string;
    prefilledBookingTime?: string;
  } | null>(null);
  const [inlineManualDialog, setInlineManualDialog] = useState<{
    tableId: string;
    tableLabel: string;
    roomName?: string;
  } | null>(null);
  const [optimisticOccupiedWalkins, setOptimisticOccupiedWalkins] = useState<Record<string, OptimisticWalkinEntry>>({});
  const [optimisticReleasedTableIds, setOptimisticReleasedTableIds] = useState<Record<string, true>>({});
  const [occupancyRoomFilter, setOccupancyRoomFilter] = useState("all");
  const [archiveQuery, setArchiveQuery] = useState("");
  const [archiveStatusFilter, setArchiveStatusFilter] = useState<"all" | ManagerBooking["status"]>("all");
  const [archiveDateFilter, setArchiveDateFilter] = useState("");
  const manualFormRef = useRef<HTMLFormElement | null>(null);
  const lastLiveSyncAtRef = useRef(0);
  const superadminPageSize = 8;
  const superadminPageCount = Math.max(1, Math.ceil(listings.length / superadminPageSize));

  function pushNotice(next: Omit<NoticeState, "id">) {
    setNotice({ id: Date.now(), ...next });
  }

  function openConfirmDialog(config: Omit<ConfirmState, "onConfirm"> & { onConfirm: () => void }) {
    setConfirmState({ ...config, onConfirm: () => { setConfirmState(null); config.onConfirm(); } });
  }

  useEffect(() => {
    const interval = window.setInterval(() => {
      setLiveNowMs(Date.now());
    }, 30_000);

    return () => window.clearInterval(interval);
  }, []);

  const liveNow = useMemo(() => new Date(liveNowMs), [liveNowMs]);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => {
      setNotice((current) => (current?.id === notice.id ? null : current));
    }, 4200);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  useEffect(() => {
    setOptimisticOccupiedWalkins({});
    setOptimisticReleasedTableIds({});
  }, [bookings, operationalDate]);

  useEffect(() => {
    setSuperadminPage((current) => Math.min(current, superadminPageCount));
  }, [superadminPageCount]);

  useEffect(() => {
    const syncNow = (force = false) => {
      const nowMs = Date.now();
      if (!force && nowMs - lastLiveSyncAtRef.current < LIVE_SYNC_THROTTLE_MS) {
        return;
      }
      if (document.hidden) {
        return;
      }

      lastLiveSyncAtRef.current = nowMs;
      router.refresh();
    };

    const interval = window.setInterval(() => syncNow(), LIVE_SYNC_INTERVAL_MS);
    const handleFocus = () => syncNow(true);
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        syncNow(true);
      }
    };

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [router]);

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
  const selectedFloorPlan = useMemo(
    () =>
      selectedVenue?.floorPlan
        ? hydrateFloorPlanRooms(migrateFloorPlan(selectedVenue.floorPlan), selectedVenue.scenes) 
        : null,
    [selectedVenue]
  );
  const floorPlanRooms = selectedFloorPlan?.rooms ?? [];
  const floorPlanTables = useMemo(
    () =>
      floorPlanRooms.flatMap((room) =>
        room.tables.map((table) => ({
          ...table,
          roomId: room.id,
          roomName: room.name
        }))
      ),
    [floorPlanRooms]
  );
  const floorPlanTableById = useMemo(
    () =>
      floorPlanTables.reduce((accumulator, table) => {
        accumulator[table.id] = table;
        return accumulator;
      }, {} as Record<string, (typeof floorPlanTables)[number]>),
    [floorPlanTables]
  );
  const floorPlanTableIdsByLabel = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const table of floorPlanTables) {
      const key = normalizePlanKey(table.label);
      const ids = map.get(key) ?? [];
      ids.push(table.id);
      map.set(key, ids);
    }
    return map;
  }, [floorPlanTables]);
  const floorPlanTableIdsByRoomAndLabel = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const table of floorPlanTables) {
      const key = `${normalizePlanKey(table.roomName)}::${normalizePlanKey(table.label)}`;
      const ids = map.get(key) ?? [];
      ids.push(table.id);
      map.set(key, ids);
    }
    return map;
  }, [floorPlanTables]);
  const manualScenes = selectedVenue?.scenes ?? [];
  const bookablePoints = useMemo<BookingPoint[]>(() => {
    if (!selectedVenue) {
      return [];
    }

    const points: BookingPoint[] = [];
    const knownKeys = new Set<string>();
    const sceneByRoomKey = new Map(
      manualScenes.map((scene) => [
        normalizePlanKey(scene.floorPlanLabel || scene.title),
        scene
      ])
    );

    const pushPoint = (point: BookingPoint) => {
      const key = `${normalizePlanKey(point.roomName)}::${normalizePlanKey(point.label)}::${point.kind}`;
      if (knownKeys.has(key)) {
        return;
      }

      knownKeys.add(key);
      points.push(point);
    };

    if (floorPlanRooms.length === 0) {
      for (const scene of manualScenes) {
        for (const hotspot of scene.hotspots.filter((item) => item.kind === "table")) {
        pushPoint({
          bookingSlots: selectedVenue.bookingSlots ?? [],
          id: hotspot.id,
          kind: "table",
          label: hotspot.heading ?? hotspot.label,
            pitch: hotspot.pitch ?? 0,
            roomName: scene.floorPlanLabel || scene.title,
            sceneId: scene.id,
            sceneTitle: scene.title,
            source: "hotspot",
            status: hotspot.status,
            yaw: hotspot.yaw ?? 0
          });
        }
      }
    }

    for (const room of floorPlanRooms) {
      const matchedScene =
        sceneByRoomKey.get(normalizePlanKey(room.name)) ?? manualScenes[0];
      const basePoint = {
        pitch: 0,
        roomName: room.name,
        sceneId: matchedScene?.id || "",
        sceneTitle: matchedScene?.title || room.name,
        yaw: 0
      };

      for (const table of room.tables) {
        pushPoint({
          ...basePoint,
          bookingSlots: table.bookingSlots?.length ? table.bookingSlots : selectedVenue.bookingSlots ?? [],
          id: `floor-table:${table.id}`,
          kind: "table",
          label: table.label,
          source: "floor-table",
          floorRoomId: room.id,
          floorTableId: table.id
        });
      }
    }

    return points;
  }, [floorPlanRooms, manualScenes, selectedVenue]);
  const operationalTimeline = useMemo(
    () =>
      [...new Set(bookablePoints.flatMap((point) => point.bookingSlots))]
        .sort(compareStableText),
    [bookablePoints]
  );
  const selectedManualScene = manualScenes.find((s) => s.id === selectedSceneId) ?? manualScenes[0] ?? null;
  const selectedScenePoints = useMemo(
    () => bookablePoints.filter((p) => selectedManualScene ? p.sceneId === selectedManualScene.id : true),
    [bookablePoints, selectedManualScene]
  );
  const selectedPoint = useMemo(
    () => bookablePoints.find((p) => p.id === selectedHotspotId) ?? bookablePoints[0] ?? null,
    [bookablePoints, selectedHotspotId]
  );
  const selectedFloorRoom = useMemo(
    () => floorPlanRooms.find((room) => room.id === selectedFloorRoomId) ?? floorPlanRooms[0] ?? null,
    [floorPlanRooms, selectedFloorRoomId]
  );
  const bookingsForOperationalDate = useMemo(
    () => bookings.filter((b) => !b.eventDateIso || b.eventDateIso === operationalDate),
    [bookings, operationalDate]
  );
  const activeBookingsForOperationalDate = useMemo(
    () => bookingsForOperationalDate.filter((b) => !b.archived),
    [bookingsForOperationalDate]
  );
  const getBookingTableIds = (booking: Pick<ManagerBooking, "tableId" | "roomName" | "placeLabel">) => {
    if (booking.tableId && floorPlanTableById[booking.tableId]) {
      return [booking.tableId];
    }

    if (booking.roomName) {
      const ids = floorPlanTableIdsByRoomAndLabel.get(
        `${normalizePlanKey(booking.roomName)}::${normalizePlanKey(booking.placeLabel)}`
      );
      if (ids?.length) {
        return ids;
      }
    }

    return floorPlanTableIdsByLabel.get(normalizePlanKey(booking.placeLabel)) ?? [];
  };
  const getPrimaryBookingTableId = (booking: Pick<ManagerBooking, "tableId" | "roomName" | "placeLabel">) =>
    getBookingTableIds(booking)[0];
  const nextReservedBookingByTableId = useMemo(() => {
    const result: Record<string, ManagerBooking> = {};
    for (const booking of activeBookingsForOperationalDate) {
      if (
        booking.status === "declined" ||
        booking.status === "waitlist" ||
        booking.sourceLabel === "Walk-in"
      ) {
        continue;
      }

      const startAt = getBookingStartDate(booking);
      if (!startAt || startAt <= liveNow) {
        continue;
      }

      const tableIds = getBookingTableIds(booking);
      if (!tableIds?.length) {
        continue;
      }

      for (const tableId of tableIds) {
        const current = result[tableId];
        const currentStart = current ? getBookingStartDate(current) : null;
        if (!currentStart || startAt < currentStart) {
          result[tableId] = booking;
        }
      }
    }

    return result;
  }, [activeBookingsForOperationalDate, floorPlanTableById, floorPlanTableIdsByLabel, floorPlanTableIdsByRoomAndLabel, liveNow]);

  // ── Hall view data ────────────────────────────────────────────────────────
  const tableLabelToRoom = useMemo(() => {
    const map: Record<string, string> = {};
    for (const table of floorPlanTables) {
      map[table.label] = table.roomName;
    }
    return map;
  }, [floorPlanTables]);

  const [hallSelectedTableId, setHallSelectedTableId] = useState<string | null>(null);
  const [hallHighlightedBookingId, setHallHighlightedBookingId] = useState<string | null>(null);

  const hallActiveBookings = useMemo(
    () =>
      activeBookingsForOperationalDate
        .filter((b) => b.status !== "declined")
        .sort((a, b) => compareStableText(a.startTimeRaw, b.startTimeRaw)),
    [activeBookingsForOperationalDate]
  );

  const hallRegularBookings = useMemo(
    () => hallActiveBookings.filter((b) => b.status !== "waitlist"),
    [hallActiveBookings]
  );

  const hallWalkinBookings = useMemo(
    () => hallRegularBookings.filter((b) => b.sourceLabel === "Walk-in"),
    [hallRegularBookings]
  );

  const hallReservationBookings = useMemo(
    () => hallRegularBookings.filter((b) => b.sourceLabel !== "Walk-in"),
    [hallRegularBookings]
  );

  const hallWaitlistBookings = useMemo(
    () => hallActiveBookings.filter((b) => b.status === "waitlist"),
    [hallActiveBookings]
  );

  const hallWalkinByTableId = useMemo(() => {
    const map: Record<string, ManagerBooking> = {};
    for (const booking of hallWalkinBookings) {
      const tableId = getPrimaryBookingTableId(booking);
      if (tableId && !optimisticReleasedTableIds[tableId]) {
        map[tableId] = booking;
      }
    }

    for (const entry of Object.values(optimisticOccupiedWalkins)) {
      if (entry.operationalDate !== operationalDate) {
        continue;
      }

      map[entry.tableId] = {
        id: entry.bookingId,
        companyId: companyTheme.id,
        ownerManagerId: undefined,
        customerName: "Walk-in",
        phone: "—",
        telegram: undefined,
        venueName: selectedVenue?.name || "Без площадки",
        vertical: (selectedVenue?.vertical || "event-space") as ManagerBooking["vertical"],
        placeLabel: entry.tableLabel,
        tableId: entry.tableId,
        roomName: entry.roomName,
        slotLabel: entry.startTimeRaw,
        dateLabel: formatOperationalDate(entry.operationalDate),
        guestsLabel: "1 гость",
        amountLabel: "—",
        sourceLabel: "Walk-in",
        managerNote: "Гость без брони",
        status: "confirmed",
        archived: false,
        eventDateIso: entry.operationalDate,
        startTimeRaw: entry.startTimeRaw
      };
    }

    return map;
  }, [companyTheme.id, hallWalkinBookings, operationalDate, optimisticOccupiedWalkins, optimisticReleasedTableIds, selectedVenue]);
  const hallReservationBookingsByTableId = useMemo(() => {
    const map: Record<string, ManagerBooking[]> = {};

    for (const booking of hallReservationBookings) {
      const tableId = getPrimaryBookingTableId(booking);
      if (!tableId) {
        continue;
      }

      (map[tableId] ||= []).push(booking);
    }

    for (const tableId of Object.keys(map)) {
      map[tableId] = map[tableId].sort((left, right) => {
        const leftStart = getBookingStartDate(left)?.getTime() ?? Number.MAX_SAFE_INTEGER;
        const rightStart = getBookingStartDate(right)?.getTime() ?? Number.MAX_SAFE_INTEGER;
        return leftStart - rightStart;
      });
    }

    return map;
  }, [hallReservationBookings]);
  const walkinDialogRelatedBooking = useMemo(() => {
    if (!walkinDialog) {
      return null;
    }

    const tableBookings = hallReservationBookingsByTableId[walkinDialog.tableId] || [];
    if (!tableBookings.length) {
      return null;
    }

    if (walkinDialog.upcomingBookingTime) {
      return tableBookings.find((booking) => booking.startTimeRaw === walkinDialog.upcomingBookingTime) ?? tableBookings[0];
    }

    return tableBookings[0];
  }, [hallReservationBookingsByTableId, walkinDialog]);

  const hallOperationalStatesByBookingId = useMemo(() => {
    const states: Record<string, HallOperationalState> = {};

    for (const booking of hallReservationBookings) {
      if (booking.status !== "confirmed" && booking.status !== "hold_pending") {
        continue;
      }
      if (isBookingMarkedArrived(booking.managerNote)) {
        continue;
      }

      const startAt = getBookingStartDate(booking);
      if (!startAt) {
        continue;
      }

      const tableId = getPrimaryBookingTableId(booking);
      const walkin = tableId ? hallWalkinByTableId[tableId] : undefined;
      const minutesUntil = Math.round((startAt.getTime() - liveNow.getTime()) / 60000);

      if (walkin && minutesUntil <= HALL_ARRIVING_WINDOW_MINUTES) {
        states[booking.id] = {
          bookingId: booking.id,
          tone: "attention",
          label:
            minutesUntil < -HALL_LATE_THRESHOLD_MINUTES
              ? "Гость опаздывает, стол занят"
              : "Стол занят, гость уже едет",
          shortLabel: "Действие",
          description:
            minutesUntil < -HALL_LATE_THRESHOLD_MINUTES
              ? `Бронь была на ${booking.startTimeRaw || "сейчас"}, а стол все еще отмечен занятым.`
              : `До брони ${formatRelativeMinutes(Math.max(minutesUntil, 0))}, но стол еще не освобожден.`,
          tableId
        };
        continue;
      }

      if (minutesUntil < -HALL_LATE_THRESHOLD_MINUTES) {
        states[booking.id] = {
          bookingId: booking.id,
          tone: "late",
          label: "Гость опаздывает",
          shortLabel: "Опозд.",
          description: `Время брони прошло ${formatRelativeMinutes(Math.abs(minutesUntil))} назад.`,
          tableId
        };
        continue;
      }

      if (minutesUntil >= -5 && minutesUntil <= HALL_ARRIVING_WINDOW_MINUTES) {
        states[booking.id] = {
          bookingId: booking.id,
          tone: "arriving",
          label: minutesUntil <= 0 ? "Гость уже должен быть" : "Скоро придет гость",
          shortLabel: "Скоро",
          description:
            minutesUntil <= 0
              ? `Старт брони уже наступил${booking.startTimeRaw ? ` · ${booking.startTimeRaw}` : ""}.`
              : `До прихода около ${formatRelativeMinutes(minutesUntil)}.`,
          tableId
        };
      }
    }

    return states;
  }, [hallReservationBookings, hallWalkinByTableId, liveNow]);

  const hallAttentionBookings = useMemo(
    () => hallReservationBookings.filter((booking) => hallOperationalStatesByBookingId[booking.id]?.tone === "attention"),
    [hallOperationalStatesByBookingId, hallReservationBookings]
  );

  const hallLateBookings = useMemo(
    () => hallReservationBookings.filter((booking) => hallOperationalStatesByBookingId[booking.id]?.tone === "late"),
    [hallOperationalStatesByBookingId, hallReservationBookings]
  );

  const hallArrivingSoon = useMemo(
    () => hallReservationBookings.filter((booking) => hallOperationalStatesByBookingId[booking.id]?.tone === "arriving"),
    [hallOperationalStatesByBookingId, hallReservationBookings]
  );

  const hallOperationalBookingIds = useMemo(
    () => new Set([...hallAttentionBookings, ...hallLateBookings, ...hallArrivingSoon].map((booking) => booking.id)),
    [hallArrivingSoon, hallAttentionBookings, hallLateBookings]
  );

  const hallPlainBookings = useMemo(
    () => hallReservationBookings.filter((booking) => !hallOperationalBookingIds.has(booking.id)),
    [hallOperationalBookingIds, hallReservationBookings]
  );
  const hallUpcomingBookings = useMemo(
    () =>
      [...hallReservationBookings]
        .filter((booking) => {
          const startAt = getBookingStartDate(booking);
          return !startAt || startAt.getTime() + 15 * 60 * 1000 >= liveNow.getTime();
        })
        .sort((a, b) => compareStableText(a.startTimeRaw, b.startTimeRaw))
        .slice(0, 8),
    [hallReservationBookings, liveNow]
  );

  const hallAttentionIds = useMemo(
    () =>
      hallAttentionBookings
        .map((booking) => hallOperationalStatesByBookingId[booking.id]?.tableId)
        .filter(Boolean) as string[],
    [hallAttentionBookings, hallOperationalStatesByBookingId]
  );

  const hallLateIds = useMemo(
    () =>
      hallLateBookings
        .map((booking) => hallOperationalStatesByBookingId[booking.id]?.tableId)
        .filter(Boolean) as string[],
    [hallLateBookings, hallOperationalStatesByBookingId]
  );

  const hallArrivingSoonIds = useMemo(
    () =>
      hallArrivingSoon
        .map((booking) => hallOperationalStatesByBookingId[booking.id]?.tableId)
        .filter(Boolean) as string[],
    [hallArrivingSoon, hallOperationalStatesByBookingId]
  );

  const hallWaitlistCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const b of hallWaitlistBookings) {
      const id = getPrimaryBookingTableId(b);
      if (id) counts[id] = (counts[id] ?? 0) + 1;
    }
    return counts;
  }, [hallWaitlistBookings]);

  function handleHallTableSelect(table: { id: string }, _room: unknown) {
    setHallSelectedTableId(table.id);
    const booking =
      hallAttentionBookings.find((b) => getPrimaryBookingTableId(b) === table.id) ??
      hallLateBookings.find((b) => getPrimaryBookingTableId(b) === table.id) ??
      hallArrivingSoon.find((b) => getPrimaryBookingTableId(b) === table.id) ??
      hallPlainBookings.find((b) => getPrimaryBookingTableId(b) === table.id) ??
      hallWalkinBookings.find((b) => getPrimaryBookingTableId(b) === table.id);
    if (booking) {
      setHallHighlightedBookingId(booking.id);
      document.getElementById(`hb-${booking.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }

  function handleHallBookingClick(booking: ManagerBooking) {
    setHallHighlightedBookingId(booking.id);
    const id = getPrimaryBookingTableId(booking);
    if (id) setHallSelectedTableId(id);
  }

  function renderHallBookingCard(
    booking: ManagerBooking,
    options: {
      accentColor?: string;
      background?: string;
      idPrefix?: string;
      keyPrefix?: string;
    }
  ) {
    const roomName = booking.roomName || tableLabelToRoom[booking.placeLabel];
    const isHighlighted = hallHighlightedBookingId === booking.id;
    const operationalState = hallOperationalStatesByBookingId[booking.id];
    const chipTone = operationalState?.tone;
    const chipStyles =
      chipTone === "attention"
        ? { color: "#ff8c8c", borderColor: "rgba(255,82,82,0.55)", background: "rgba(255,82,82,0.08)" }
        : chipTone === "late"
          ? { color: "#f0c14b", borderColor: "rgba(240,193,76,0.55)", background: "rgba(240,193,76,0.08)" }
          : chipTone === "arriving"
            ? { color: "#e8a030", borderColor: "rgba(232,160,48,0.55)", background: "rgba(232,160,48,0.08)" }
            : null;
    const accentColor =
      options.accentColor ||
      (booking.status === "confirmed"
        ? "#75f3ae"
        : booking.status === "hold_pending"
          ? "#ff9f45"
          : booking.status === "new"
            ? "#e5b94f"
            : booking.status === "waitlist"
              ? "#b684ff"
              : "#94a3b8");

    return (
      <div
        id={`${options.idPrefix || "hb"}-${booking.id}`}
        key={`${options.keyPrefix || "hb"}-${booking.id}`}
        onClick={() => handleHallBookingClick(booking)}
        style={{
          padding: "10px 16px",
          borderLeft: `3px solid ${accentColor}`,
          background: isHighlighted ? "rgba(104,162,255,0.10)" : options.background || "transparent",
          cursor: "pointer",
          borderBottom: "1px solid var(--s-border)"
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
          <span style={{ fontWeight: 800, fontSize: 20, color: "var(--s-text)", lineHeight: 1 }}>{booking.startTimeRaw || "—"}</span>
          <span style={{ fontSize: 11, color: "var(--s-muted)" }}>{booking.guestsLabel}</span>
        </div>
        {operationalState && chipStyles ? (
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              marginTop: 8,
              padding: "4px 9px",
              borderRadius: 999,
              border: `1px solid ${chipStyles.borderColor}`,
              background: chipStyles.background,
              color: chipStyles.color,
              fontSize: 11,
              fontWeight: 700
            }}
          >
            {operationalState.label}
          </div>
        ) : null}
        <div style={{ fontWeight: 600, fontSize: 13, color: "var(--s-text)", marginTop: operationalState ? 8 : 3 }}>{booking.customerName}</div>
        <div style={{ fontSize: 11, color: "var(--s-muted)", marginTop: 2 }}>
          {booking.placeLabel}
          {roomName ? <span style={{ marginLeft: 5, color: "var(--s-gold-lt)" }}>· {roomName}</span> : null}
        </div>
        {operationalState?.description ? (
          <div style={{ fontSize: 11, color: "var(--s-muted)", marginTop: 6, lineHeight: 1.35 }}>
            {operationalState.description}
          </div>
        ) : null}
        {booking.phone ? (
          <a
            href={`tel:${slugifyPhone(booking.phone)}`}
            onClick={(e) => e.stopPropagation()}
            style={{ fontSize: 11, color: "var(--s-muted)", marginTop: 6, display: "inline-flex", alignItems: "center", gap: 4 }}
          >
            <PhoneIcon /> {booking.phone}
          </a>
        ) : null}
      </div>
    );
  }

  function renderHallSection(
    title: string,
    items: ManagerBooking[],
    options: {
      accentColor?: string;
      headerColor: string;
      headerBackground: string;
      icon?: string;
      emptyLabel?: string;
      keyPrefix?: string;
      idPrefix?: string;
    }
  ) {
    if (items.length === 0) {
      return null;
    }

    return (
      <section
        style={{
          borderBottom: "1px solid var(--s-border)",
          background: "rgba(255,255,255,0.01)"
        }}
      >
        <div
          style={{
            padding: "12px 16px 8px",
            fontSize: 11,
            fontWeight: 800,
            color: options.headerColor,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            background: options.headerBackground,
            borderBottom: "1px solid var(--s-border)"
          }}
        >
          {options.icon ? `${options.icon} ` : ""}{title}
        </div>
        <div>
          {items.map((booking) =>
            renderHallBookingCard(booking, {
              accentColor: options.accentColor,
              background: "transparent",
              keyPrefix: options.keyPrefix,
              idPrefix: options.idPrefix
            })
          )}
        </div>
      </section>
    );
  }
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
    () => [...bookingsForOperationalDate].sort((a, b) => compareStableText(a.startTimeRaw, b.startTimeRaw)).find((b) => b.status !== "declined"),
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
  const pendingRemindersCount = useMemo(
    () => remindersForOperationalDate.filter((item) => item.status === "pending").length,
    [remindersForOperationalDate]
  );
  const sidebarTabs = useMemo<SidebarTabItem[]>(() => {
    const centerCount =
      hallAttentionBookings.length +
      hallLateBookings.length +
      hallArrivingSoon.length +
      hallWaitlistBookings.length;
    const kanbanCount = bookingBoard.reduce((sum, column) => sum + column.items.length, 0);

    return [
      {
        key: "overview",
        icon: "⌂",
        label: "Центр",
        badge: centerCount > 0 ? String(centerCount) : undefined,
        badgeTone: hallAttentionBookings.length + hallLateBookings.length > 0 ? "red" : centerCount > 0 ? "amber" : undefined
      },
      {
        key: "bookings",
        icon: "▥",
        label: "Канбан",
        badge: kanbanCount > 0 ? String(kanbanCount) : undefined,
        badgeTone: stats.newCount > 0 ? "gold" : stats.holdCount > 0 ? "amber" : "slate"
      },
      {
        key: "archive",
        icon: "◫",
        label: "Архив",
        badge: stats.archivedCount > 0 ? String(stats.archivedCount) : undefined,
        badgeTone: "slate"
      },
      {
        key: "waitlist",
        icon: "◷",
        label: "Ожидание",
        badge: activeWaitlistForOperationalDate.length > 0 ? String(activeWaitlistForOperationalDate.length) : undefined,
        badgeTone: "violet"
      },
      {
        key: "reminders",
        icon: "◎",
        label: "Уведомления",
        badge: pendingRemindersCount > 0 ? String(pendingRemindersCount) : undefined,
        badgeTone: "amber"
      }
    ];
  }, [
    activeWaitlistForOperationalDate.length,
    bookingBoard,
    hallArrivingSoon.length,
    hallAttentionBookings.length,
    hallLateBookings.length,
    hallWaitlistBookings.length,
    pendingRemindersCount,
    stats.archivedCount,
    stats.holdCount,
    stats.newCount
  ]);

  const occupancyRows = useMemo(
    () => bookablePoints.map((point) => {
      const pointBookings = bookingsForOperationalDate.filter(
        (booking) =>
          matchesBookingPoint(booking, point) &&
          booking.startTimeRaw &&
          booking.status !== "declined" &&
          booking.eventDateIso
      );
      const bookingBySlot = point.bookingSlots.reduce((accumulator, slot) => {
        const matchedBooking =
          pointBookings.find((booking) => {
            const candidateWindow = getBookingWindow(operationalDate, slot);
            const existingWindow = getExistingBookingWindow(
              booking.eventDateIso || operationalDate,
              booking.startTimeRaw
            );

            return existingWindow ? windowsOverlap(candidateWindow, existingWindow) : false;
          }) ?? null;
        accumulator[slot] = matchedBooking;
        return accumulator;
      }, {} as Record<string, ManagerBooking | null>);
      const occupiedSlots = new Set(point.bookingSlots.filter((slot) => Boolean(bookingBySlot[slot])));
      const slotState = point.bookingSlots.reduce((accumulator, slot) => {
        if (isPastOperationalSlot(operationalDate, slot, liveNow)) {
          accumulator[slot] = "past";
          return accumulator;
        }

        if (occupiedSlots.has(slot)) {
          accumulator[slot] = "blocked";
          return accumulator;
        }

        accumulator[slot] = "available";
        return accumulator;
      }, {} as Record<string, "available" | "past" | "blocked">);
      const availableSlots = new Set(point.bookingSlots);
      return { point, occupiedSlots, availableSlots, slotState, bookingBySlot };
    }),
    [bookablePoints, bookingsForOperationalDate, liveNow, operationalDate]
  );
  const occupancyRoomOptions = useMemo(
    () => [...new Set(occupancyRows.map((row) => row.point.roomName).filter(Boolean))].sort(compareStableText),
    [occupancyRows]
  );
  const nextAvailableTimeByLabel = useMemo(
    () =>
      occupancyRows.reduce((accumulator, row) => {
        accumulator[row.point.floorTableId || row.point.id] =
          row.point.bookingSlots.find((slot) => row.slotState[slot] === "available") || "";
        return accumulator;
      }, {} as Record<string, string>),
    [occupancyRows]
  );
  const filteredOccupancyRows = useMemo(
    () =>
      occupancyRoomFilter === "all"
        ? occupancyRows
        : occupancyRows.filter((row) => row.point.roomName === occupancyRoomFilter),
    [occupancyRoomFilter, occupancyRows]
  );
  // ── Floor plan: статусы столов на выбранную дату ─────────────────────────
  const floorPlanTableState = useMemo(() => {
    if (!selectedFloorPlan) {
      return {
        statuses: {} as Record<string, FloorPlanTableStatus>,
        meta: {} as Record<string, FloorPlanItemMeta>,
        walkinBookingIds: {} as Record<string, string>
      };
    }

    const statuses: Record<string, FloorPlanTableStatus> = {};
    const meta: Record<string, FloorPlanItemMeta> = {};
    const walkinBookingIds: Record<string, string> = {};
    const activeBookingsByTableId = bookingsForOperationalDate.reduce((accumulator, booking) => {
      if (booking.archived || booking.status === "declined") {
        return accumulator;
      }

      const tableIds = getBookingTableIds(booking);
      if (!tableIds.length) {
        return accumulator;
      }

      for (const tableId of tableIds) {
        if (booking.sourceLabel === "Walk-in" && optimisticReleasedTableIds[tableId]) {
          continue;
        }
        (accumulator[tableId] ||= []).push(booking);
      }
      return accumulator;
    }, {} as Record<string, ManagerBooking[]>);
    const activeWaitlistByLabel = activeWaitlistForOperationalDate.reduce((accumulator, entry) => {
      const key = normalizePlanKey(entry.hotspotLabel);
      if (!key) {
        return accumulator;
      }

      (accumulator[key] ||= []).push(entry);
      return accumulator;
    }, {} as Record<string, ManagerWaitlistEntry[]>);

    const bookingPriority: ManagerBooking["status"][] = [
      "confirmed",
      "hold_pending",
      "new",
      "waitlist"
    ];

    for (const table of collectAllTables(selectedFloorPlan)) {
      const key = normalizePlanKey(table.label);
      const bookingsForTable = (activeBookingsByTableId[table.id] || []).sort((left, right) => {
        const leftRank = bookingPriority.indexOf(left.status);
        const rightRank = bookingPriority.indexOf(right.status);
        if (leftRank !== rightRank) {
          return leftRank - rightRank;
        }

        return compareStableText(left.startTimeRaw, right.startTimeRaw);
      });
      const primaryBooking = bookingsForTable[0];
      const waitlistEntriesForTable = activeWaitlistByLabel[key] || [];

      if (primaryBooking) {
        const isWalkin = primaryBooking.sourceLabel === "Walk-in";
        statuses[table.id] = primaryBooking.status;
        if (isWalkin) walkinBookingIds[table.id] = primaryBooking.id;
        meta[table.id] = {
          detailLabel: primaryBooking.startTimeRaw || undefined,
          hoverLabel: isWalkin
            ? `Недоступно для брони${nextAvailableTimeByLabel[table.id] ? ` до ${nextAvailableTimeByLabel[table.id]}` : ""} · гость сидит сейчас`
            : nextAvailableTimeByLabel[table.id]
              ? `Недоступно для брони · свободно с ${nextAvailableTimeByLabel[table.id]}`
              : "Недоступно для брони · свободных слотов нет"
        };
        continue;
      }

      if (waitlistEntriesForTable.length > 0) {
        const waitlistEntry = waitlistEntriesForTable[0];
        statuses[table.id] = "waitlist";
        meta[table.id] = {
          detailLabel:
            waitlistEntry.requestedTimeRaw ||
            undefined,
          hoverLabel:
            `${waitlistEntry.status === "contacted" ? "Контакт" : "Waitlist"}${waitlistEntry.customerName ? ` · ${shortCustomerName(waitlistEntry.customerName)}` : ""}`
        };
      }
    }

    for (const optimisticWalkin of Object.values(optimisticOccupiedWalkins)) {
      if (optimisticWalkin.operationalDate !== operationalDate) {
        continue;
      }

      statuses[optimisticWalkin.tableId] = "confirmed";
      walkinBookingIds[optimisticWalkin.tableId] = optimisticWalkin.bookingId;
      meta[optimisticWalkin.tableId] = {
        detailLabel: optimisticWalkin.upcomingBookingTime
          ? `до ${optimisticWalkin.upcomingBookingTime}`
          : `с ${optimisticWalkin.startTimeRaw}`,
        hoverLabel: optimisticWalkin.upcomingBookingTime
          ? `Недоступно для брони до ${optimisticWalkin.upcomingBookingTime} · гость сидит сейчас`
          : "Недоступно для брони · гость сидит сейчас"
      };
    }

    return { statuses, meta, walkinBookingIds };
  }, [
    activeWaitlistForOperationalDate,
    bookingsForOperationalDate,
    nextAvailableTimeByLabel,
    operationalDate,
    optimisticOccupiedWalkins,
    optimisticReleasedTableIds,
    selectedFloorPlan
  ]);
  const manualTimeOptions = useMemo(() => {
    if (manualStatus === "WAITLIST") {
      // For waitlist show ONLY occupied slots
      const occupied = manualSlots
        .filter((s) => s.status === "unavailable")
        .map((s) => ({ value: s.time, label: `${s.label} · недоступно` }));
      if (manualTime && !occupied.some((o) => o.value === manualTime)) {
        return [{ value: manualTime, label: `${manualTime} · вручную` }, ...occupied];
      }
      return occupied;
    }
    const available = manualSlots.filter((s) => s.status !== "unavailable").map((s) => ({ value: s.time, label: s.label }));
    if (manualTime && !available.some((o) => o.value === manualTime)) return [{ value: manualTime, label: `${manualTime} · вручную` }, ...available];
    return available;
  }, [manualSlots, manualTime, manualStatus]);
  const nextAvailableManualSlot = useMemo(
    () => manualSlots.find((slot) => slot.status !== "unavailable") ?? null,
    [manualSlots]
  );
  const selectedTableBookingStatus = useMemo(
    () => (selectedFloorTableId ? floorPlanTableState.statuses[selectedFloorTableId] : undefined),
    [floorPlanTableState.statuses, selectedFloorTableId]
  );
  const hallFloorPlanMeta = useMemo(() => {
    const merged: Record<string, FloorPlanItemMeta> = { ...floorPlanTableState.meta };

    const bookingsByTableId = hallRegularBookings.reduce((accumulator, booking) => {
      const tableId = getPrimaryBookingTableId(booking);
      if (!tableId) {
        return accumulator;
      }

      (accumulator[tableId] ||= []).push(booking);
      return accumulator;
    }, {} as Record<string, ManagerBooking[]>);

    for (const table of collectAllTables(selectedFloorPlan!)) {
      const tableId = table.id;
      const current = merged[tableId] ?? {};
      const tableBookings = bookingsByTableId[tableId] ?? [];
      const seatedBooking =
        hallWalkinByTableId[tableId] ??
        tableBookings.find((booking) => booking.sourceLabel !== "Walk-in" && isBookingMarkedArrived(booking.managerNote));
      const upcomingBooking = nextReservedBookingByTableId[tableId];
      const operationalState = upcomingBooking ? hallOperationalStatesByBookingId[upcomingBooking.id] : undefined;

      const cornerLabel =
        operationalState?.tone === "attention"
          ? "!"
          : operationalState?.tone === "late"
            ? "⌛"
            : operationalState?.tone === "arriving"
              ? "→"
              : current.cornerLabel;
      const cornerTone =
        operationalState?.tone === "attention"
          ? "attention"
          : operationalState?.tone === "late"
            ? "late"
            : operationalState?.tone === "arriving"
              ? "arriving"
              : current.cornerTone;

      if (seatedBooking) {
        const isWalkinOccupant = seatedBooking.sourceLabel === "Walk-in";
        merged[tableId] = {
          ...current,
          appearance: "occupied",
          topLabel: "недост.",
          topTone: isWalkinOccupant ? "occupied_walkin" : "occupied_booking",
          statusLabel: formatCompactGuestsLabel(seatedBooking.guestsLabel),
          detailLabel: upcomingBooking?.startTimeRaw
            ? `до ${upcomingBooking.startTimeRaw}`
            : seatedBooking.startTimeRaw
              ? `с ${seatedBooking.startTimeRaw}`
              : "сейчас",
          cornerLabel,
          cornerTone,
          hoverLabel: upcomingBooking?.startTimeRaw
            ? `${isWalkinOccupant ? "Walk-in" : "Гость по брони"} сидит · недоступно до ${upcomingBooking.startTimeRaw}`
            : isWalkinOccupant
              ? "Walk-in сидит сейчас"
              : "Гость по брони сидит сейчас"
        };
        continue;
      }

      if (upcomingBooking) {
        merged[tableId] = {
          ...current,
          appearance: "default",
          topLabel: "недост.",
          topTone:
            upcomingBooking.status === "hold_pending"
              ? "hold"
              : upcomingBooking.status === "new"
                ? "new"
                : upcomingBooking.status === "waitlist"
                  ? "waitlist"
                  : "confirmed",
          statusLabel: formatCompactGuestsLabel(upcomingBooking.guestsLabel),
          detailLabel: `до ${upcomingBooking.startTimeRaw || "?"}`,
          cornerLabel,
          cornerTone,
          hoverLabel: [current.hoverLabel, `Недоступно для брони до ${upcomingBooking.startTimeRaw || "?"}`]
            .filter(Boolean)
            .join(" · ")
        };
      }
    }

    return merged;
  }, [
    floorPlanTableState.meta,
    hallOperationalStatesByBookingId,
    hallRegularBookings,
    hallWalkinByTableId,
    nextReservedBookingByTableId,
    selectedFloorPlan
  ]);

  useEffect(() => { if (!selectedVenueId && operationalVenues[0]) setSelectedVenueId(operationalVenues[0].id); }, [operationalVenues, selectedVenueId]);
  useEffect(() => { if (!selectedPoint && bookablePoints[0]) setSelectedHotspotId(bookablePoints[0].id); }, [bookablePoints, selectedPoint]);
  useEffect(() => {
    setOccupancyRoomFilter((current) =>
      current === "all" || occupancyRoomOptions.includes(current) ? current : "all"
    );
  }, [occupancyRoomOptions]);
  useEffect(() => { setManualDate(operationalDate); setManualTime(""); setPendingManualTime(""); }, [operationalDate]);

  // Load available slots when opening a timeless booking detail so manager can assign a time
  useEffect(() => {
    if (!selectedBookingDetail || selectedBookingDetail.startTimeRaw || selectedBookingDetail.archived) {
      setAssignTimeSlots([]);
      setSelectedAssignTime("");
      return;
    }
    const venue = operationalVenues.find((v) => v.name === selectedBookingDetail.venueName);
    if (!venue || !selectedBookingDetail.eventDateIso || !selectedBookingDetail.placeLabel) {
      setAssignTimeSlots([]);
      return;
    }
    let cancelled = false;
    setIsAssignTimeLoading(true);
    const params = new URLSearchParams({
      venueId: venue.id,
      date: selectedBookingDetail.eventDateIso,
      hotspotLabel: selectedBookingDetail.placeLabel,
      hotspotKind: "table",
      hotspotStatus: ""
    });
    fetch(`/api/availability?${params.toString()}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((data: { data?: Array<{ time: string; label: string; status: string }> }) => {
        if (cancelled) return;
        const slots = data.data ?? [];
        setAssignTimeSlots(slots);
        const first = slots.find((s) => s.status !== "unavailable");
        setSelectedAssignTime(first?.time ?? "");
      })
      .catch(() => { if (!cancelled) setAssignTimeSlots([]); })
      .finally(() => { if (!cancelled) setIsAssignTimeLoading(false); });
    return () => { cancelled = true; };
  }, [selectedBookingDetail, operationalVenues]);
  useEffect(() => { if (!selectedSceneId && manualScenes[0]) setSelectedSceneId(manualScenes[0].id); }, [manualScenes, selectedSceneId]);
  useEffect(() => {
    setSelectedFloorRoomId((current) =>
      floorPlanRooms.some((room) => room.id === current) ? current : floorPlanRooms[0]?.id ?? ""
    );
  }, [floorPlanRooms]);
  useEffect(() => {
    if (selectedPoint && selectedPoint.sceneTitle !== selectedManualScene?.title) {
      const match = manualScenes.find((s) => s.title === selectedPoint.sceneTitle);
      if (match) setSelectedSceneId(match.id);
    }
  }, [manualScenes, selectedManualScene, selectedPoint]);
  useEffect(() => {
    if (!selectedManualScene || floorPlanRooms.length === 0) {
      return;
    }

    const sceneRoomKey = normalizePlanKey(selectedManualScene.floorPlanLabel || selectedManualScene.title);
    const matchedRoom = floorPlanRooms.find((room) => normalizePlanKey(room.name) === sceneRoomKey);

    if (matchedRoom && matchedRoom.id !== selectedFloorRoomId) {
      setSelectedFloorRoomId(matchedRoom.id);
    }
  }, [floorPlanRooms, selectedFloorRoomId, selectedManualScene]);
  useEffect(() => {
    if (selectedFloorRoom && !selectedFloorRoom.tables.some((table) => table.id === selectedFloorTableId)) {
      setSelectedFloorTableId("");
    }
  }, [selectedFloorRoom, selectedFloorTableId]);
  useEffect(() => {
    if (!selectedPoint) {
      return;
    }

    if (selectedPoint.floorRoomId) {
      setSelectedFloorRoomId(selectedPoint.floorRoomId);
    } else {
      const matchedRoom = floorPlanRooms.find(
        (room) => normalizePlanKey(room.name) === normalizePlanKey(selectedPoint.roomName)
      );
      if (matchedRoom) {
        setSelectedFloorRoomId(matchedRoom.id);
      }
    }

    setSelectedFloorTableId(selectedPoint.floorTableId || "");
  }, [floorPlanRooms, selectedPoint]);

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
        if (manualStatus === "WAITLIST") {
          // For waitlist keep occupied time; default to first occupied slot
          const firstOccupied = slots.find((s) => s.status === "unavailable")?.time || "";
          if (preferred && slots.find((s) => s.time === preferred)?.status === "unavailable") setManualTime(preferred);
          else setManualTime(firstOccupied);
        } else if (preferred && (!matched || matched.status !== "unavailable")) setManualTime(preferred);
        else if (preferred && matched?.status === "unavailable") setManualTime("");
        else if (!preferred) setManualTime(slots.find((s) => s.status !== "unavailable")?.time || "");
        if (pendingManualTime) setPendingManualTime("");
      } finally { setIsManualSlotLoading(false); }
    }
    void loadSlots();
  }, [manualDate, manualTime, manualStatus, pendingManualTime, selectedPoint, selectedVenue]);

  // ── Conflict check для ручной брони ───────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    async function checkConflict() {
      if (!selectedVenue || !selectedPoint || !manualDate || !manualTime || manualStatus === "WAITLIST") {
        setManualConflict(null);
        return;
      }
      const params = new URLSearchParams({
        venueId: selectedVenue.id,
        date: manualDate,
        time: manualTime,
        placeLabel: selectedPoint.label,
      });
      if (selectedPoint.floorTableId) params.set("tableId", selectedPoint.floorTableId);
      if (selectedPoint.roomName) params.set("roomName", selectedPoint.roomName);
      try {
        const res = await fetch(`/api/admin/bookings/check-conflict?${params}`, { cache: "no-store" });
        if (!res.ok || cancelled) {
          if (!cancelled) setManualConflict(null);
          return;
        }
        const data = (await res.json()) as { conflict?: typeof manualConflict };
        if (!cancelled) setManualConflict(data.conflict ?? null);
      } catch {
        if (!cancelled) setManualConflict(null);
      }
    }
    void checkConflict();
    return () => { cancelled = true; };
  }, [selectedVenue, selectedPoint, manualDate, manualTime, manualStatus]);

  // ── Guest lookup при вводе телефона ───────────────────────────────────────
  useEffect(() => {
    const digits = phoneInputValue.replace(/\D+/g, "");
    if (digits.length < 7) {
      setGuestProfile(null);
      setGuestLookupLoading(false);
      return;
    }
    let cancelled = false;
    setGuestLookupLoading(true);
    const handle = window.setTimeout(async () => {
      try {
        const params = new URLSearchParams({ phone: phoneInputValue });
        const res = await fetch(`/api/admin/guests/lookup?${params}`, { cache: "no-store" });
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as { profile?: typeof guestProfile };
        if (!cancelled) setGuestProfile(data.profile ?? null);
      } catch {
        if (!cancelled) setGuestProfile(null);
      } finally {
        if (!cancelled) setGuestLookupLoading(false);
      }
    }, 350);
    return () => { cancelled = true; window.clearTimeout(handle); };
  }, [phoneInputValue]);

  async function runWalkinSearch() {
    if (!selectedVenue) return;
    setWalkinSearchLoading(true);
    setWalkinSuggestions(null);
    try {
      const params = new URLSearchParams({
        venueId: selectedVenue.id,
        guests: String(walkinGuests),
        durationMinutes: String(walkinDuration),
      });
      if (walkinPreferredRoomId) params.set("preferredRoomId", walkinPreferredRoomId);
      const res = await fetch(`/api/admin/walkin/suggest?${params}`, { cache: "no-store" });
      const data = (await res.json()) as { suggestions?: WalkinSuggestion[] };
      setWalkinSuggestions(data.suggestions || []);
    } catch {
      setWalkinSuggestions([]);
    } finally {
      setWalkinSearchLoading(false);
    }
  }

  async function seatWalkinSuggestion(suggestion: WalkinSuggestion) {
    if (!selectedVenue || walkinSeatingId) return;
    setWalkinSeatingId(suggestion.tableId);
    try {
      const todayIso = getTodayIso();
      const res = await fetch("/api/admin/walkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          venueId: selectedVenue.id,
          date: todayIso,
          tableLabel: suggestion.tableLabel,
          tableId: suggestion.tableId,
          roomName: suggestion.roomName,
          upcomingBookingTime: suggestion.nextBookingTime || undefined,
        }),
      });
      const payload = (await res.json()) as { message?: string };
      if (!res.ok) {
        pushNotice({ kind: "error", message: payload.message || "Не удалось посадить" });
        return;
      }
      pushNotice({
        kind: "success",
        message: `Посадили на ${suggestion.tableLabel} (${suggestion.roomName})`,
      });
      setWalkinSearchOpen(false);
      setWalkinSuggestions(null);
      router.refresh();
    } finally {
      setWalkinSeatingId(null);
    }
  }

  function applyGuestNameToForm() {
    const form = manualFormRef.current;
    if (!form || !guestProfile?.primaryName) return;
    const nameInput = form.elements.namedItem("name");
    if (nameInput instanceof HTMLInputElement) {
      nameInput.value = guestProfile.primaryName;
      // триггерим визуальное обновление placeholder/required UI на всякий случай
      nameInput.dispatchEvent(new Event("input", { bubbles: true }));
    }
  }

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

  function handleWalkinOccupy(
    tableId: string,
    tableLabel: string,
    roomName?: string,
    upcomingBookingTime?: string
  ) {
    startTransition(async () => {
      const optimisticStart = `${String(liveNow.getHours()).padStart(2, "0")}:${String(liveNow.getMinutes()).padStart(2, "0")}`;
      const response = await fetch("/api/admin/walkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          venueId: selectedVenueId,
          date: operationalDate,
          tableLabel,
          tableId,
          roomName,
          upcomingBookingTime
        })
      });
      const payload = (await response.json()) as { message?: string; bookingId?: string };
      if (!response.ok) {
        pushNotice({ kind: "error", message: payload.message || "Не удалось отметить стол" });
        return;
      }
      setOptimisticReleasedTableIds((current) => {
        const next = { ...current };
        delete next[tableId];
        return next;
      });
      setOptimisticOccupiedWalkins((current) => ({
        ...current,
        [tableId]: {
          bookingId: payload.bookingId || `optimistic-${tableId}-${Date.now()}`,
          tableId,
          tableLabel,
          roomName,
          startTimeRaw: optimisticStart,
          operationalDate,
          upcomingBookingTime
        }
      }));
      setWalkinDialog(null);
      pushNotice({
        kind: "success",
        message: upcomingBookingTime
          ? `Стол ${tableLabel} занят. Напоминание о брони в ${upcomingBookingTime} поставлено в Telegram.`
          : `Стол ${tableLabel} отмечен — гость сидит`
      });
      router.refresh();
    });
  }

  function handleWalkinRelease(bookingId: string, tableId: string, tableLabel: string) {
    startTransition(async () => {
      const response = await fetch(`/api/admin/bookings/${bookingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "complete_visit" })
      });
      if (!response.ok) {
        pushNotice({ kind: "error", message: "Не удалось освободить стол" });
        return;
      }
      setOptimisticOccupiedWalkins((current) => {
        const next = { ...current };
        delete next[tableId];
        return next;
      });
      setOptimisticReleasedTableIds((current) => ({
        ...current,
        [tableId]: true
      }));
      setWalkinDialog(null);
      pushNotice({ kind: "success", message: `Стол ${tableLabel} освобождён` });
      router.refresh();
    });
  }

  function assignTime(bookingId: string, time: string) {
    startTransition(async () => {
      const response = await fetch(`/api/admin/bookings/${bookingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "assign_time", time })
      });
      const payload = (await response.json()) as { message?: string };
      if (!response.ok) {
        pushNotice({ kind: "error", message: payload.message || "Не удалось назначить время" });
        return;
      }
      setSelectedBookingId(null);
      pushNotice({ kind: "success", message: `Время ${time} назначено` });
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
    const fallbackTime = manualTime || String(fd.get("time") || "").trim() || nextAvailableManualSlot?.time || "";
    return {
      form, name: String(fd.get("name") || "").trim(), phone: String(fd.get("phone") || "").trim(),
      telegram: String(fd.get("telegram") || "").trim(), time: fallbackTime,
      guests: Number(fd.get("guests") || 1), note: String(fd.get("note") || "").trim(),
      status: String(fd.get("status") || "CONFIRMED")
    };
  }

  function selectPointByLabel(label: string, roomName?: string, preferredSource?: BookingPoint["source"]) {
    const normalizedLabel = normalizePlanKey(label);
    const normalizedRoom = normalizePlanKey(roomName);
    const matchedPoint =
      bookablePoints.find(
        (point) =>
          normalizePlanKey(point.label) === normalizedLabel &&
          normalizedRoom &&
          normalizePlanKey(point.roomName) === normalizedRoom &&
          (!preferredSource || point.source === preferredSource)
      ) ??
      bookablePoints.find(
        (point) =>
          normalizePlanKey(point.label) === normalizedLabel &&
          normalizedRoom &&
          normalizePlanKey(point.roomName) === normalizedRoom
      ) ??
      bookablePoints.find((point) => normalizePlanKey(point.label) === normalizedLabel);

    if (!matchedPoint) {
      return;
    }

    setSelectedHotspotId(matchedPoint.id);
    const sceneMatch = manualScenes.find((scene) => scene.title === matchedPoint.sceneTitle);
    if (sceneMatch) {
      setSelectedSceneId(sceneMatch.id);
    }
  }

  function openManualBookingForTable(
    tableId: string,
    tableLabel: string,
    roomName?: string,
    presetTime?: string
  ) {
    if (roomName) {
      const matchedRoom = floorPlanRooms.find((room) => normalizePlanKey(room.name) === normalizePlanKey(roomName));
      if (matchedRoom) {
        setSelectedFloorRoomId(matchedRoom.id);
      }
    }

    setSelectedFloorTableId(tableId);
    selectPointByLabel(tableLabel, roomName, "floor-table");
    setManualDate(operationalDate);
    setManualStatus("CONFIRMED");
    setManualTime(presetTime || "");
    setPendingManualTime(presetTime || "");
    setWalkinDialog(null);
    setInlineManualDialog({
      tableId,
      tableLabel,
      roomName
    });
  }

  function getRelatedHallBooking(tableId: string, preferredBookingId?: string | null) {
    if (preferredBookingId) {
      const exactBooking = bookingsForOperationalDate.find((booking) => booking.id === preferredBookingId);
      if (exactBooking) {
        return exactBooking;
      }
    }

    return (
      hallAttentionBookings.find((booking) => getPrimaryBookingTableId(booking) === tableId) ??
      hallLateBookings.find((booking) => getPrimaryBookingTableId(booking) === tableId) ??
      hallArrivingSoon.find((booking) => getPrimaryBookingTableId(booking) === tableId) ??
      hallPlainBookings.find((booking) => getPrimaryBookingTableId(booking) === tableId) ??
      hallWalkinBookings.find((booking) => getPrimaryBookingTableId(booking) === tableId) ??
      null
    );
  }

  function openHallTableContext(
    tableId: string,
    tableLabel: string,
    roomName?: string,
    options?: {
      prefilledBookingTime?: string;
      preferredBookingId?: string | null;
    }
  ) {
    setHallSelectedTableId(tableId);

    const walkinBookingId = floorPlanTableState.walkinBookingIds[tableId];
    const status = floorPlanTableState.statuses[tableId] ?? "available";
    const relatedBooking = getRelatedHallBooking(tableId, options?.preferredBookingId);
    const upcomingBooking =
      (options?.prefilledBookingTime
        ? hallReservationBookingsByTableId[tableId]?.find(
            (booking) => booking.startTimeRaw === options.prefilledBookingTime
          )
        : null) ??
      nextReservedBookingByTableId[tableId];

    if (relatedBooking) {
      setHallHighlightedBookingId(relatedBooking.id);
    }

    if (
      status === "available" ||
      Boolean(walkinBookingId) ||
      Boolean(upcomingBooking) ||
      relatedBooking?.sourceLabel === "Walk-in" ||
      Boolean(options?.prefilledBookingTime)
    ) {
      setWalkinDialog({
        tableId,
        tableLabel,
        roomName,
        walkinBookingId,
        upcomingBookingCustomer: upcomingBooking?.customerName,
        upcomingBookingTime: upcomingBooking?.startTimeRaw,
        prefilledBookingTime: options?.prefilledBookingTime
      });
      return;
    }

    if (relatedBooking) {
      setSelectedBookingId(relatedBooking.id);
    }
  }

  function handleFloorRoomChange(room: FloorPlanRoom) {
    setSelectedFloorRoomId(room.id);
    setSelectedFloorTableId("");
    const sceneMatch = manualScenes.find(
      (scene) => normalizePlanKey(scene.floorPlanLabel || scene.title) === normalizePlanKey(room.name)
    );

    if (sceneMatch) {
      setSelectedSceneId(sceneMatch.id);
      const firstPoint =
        bookablePoints.find((point) => point.floorRoomId === room.id) ??
        bookablePoints.find((point) => point.sceneId === sceneMatch.id);
      if (firstPoint) setSelectedHotspotId(firstPoint.id);
    }
    setManualTime("");
    setPendingManualTime("");
  }

  function submitManualBooking(collected: NonNullable<ReturnType<typeof collectManualFormData>>) {
    startTransition(async () => {
      const response = await fetch("/api/admin/bookings/manual", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          venueId: selectedVenue?.id,
          hotspotLabel: selectedPoint?.label,
          tableId: selectedPoint?.floorTableId,
          roomName: selectedPoint?.roomName,
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
      if (!response.ok) { pushNotice({ kind: "error", message: payload.message || "Не удалось записать бронь" }); return; }
      collected.form.reset();
      setManualDate(operationalDate);
      setManualTime("");
      setManualSlots([]);
      if (inlineManualDialog) {
        setInlineManualDialog(null);
        pushNotice({ kind: "success", message: "Бронь создана на выбранный стол" });
      } else {
        setActiveTab("bookings");
        pushNotice({ kind: "success", message: "Бронь создана и добавлена в заявки", actionLabel: "К заявкам", targetTab: "bookings" });
      }
      router.refresh();
    });
  }

  function handleManualBooking(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const collected = collectManualFormData();
    if (!collected) { pushNotice({ kind: "error", message: "Форма недоступна" }); return; }
    if (collected.status !== "WAITLIST" && !collected.time) {
      pushNotice({ kind: "error", message: "Выберите время брони перед сохранением." });
      return;
    }
    if (collected.status === "WAITLIST" && collected.time) {
      const slotOccupied = manualSlots.find((s) => s.time === collected.time)?.status === "unavailable";
      if (!slotOccupied) {
        pushNotice({ kind: "error", message: "Этот слот свободен — оформи обычную бронь, а не ожидание." });
        return;
      }
    }
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
        collected.form.reset();
        setManualDate(operationalDate);
        setManualTime("");
        setManualSlots([]);
        if (inlineManualDialog) {
          setInlineManualDialog(null);
          pushNotice({ kind: "success", message: "Клиент добавлен в ожидание для выбранного стола" });
        } else {
          setActiveTab("bookings");
          pushNotice({ kind: "success", message: "Клиент добавлен в ожидание", actionLabel: "К доске", targetTab: "bookings" });
        }
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
        <div className="m-backdrop m-backdrop-confirm" role="presentation" onClick={() => setConfirmState(null)}>
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

      {/* ── WALK-IN DIALOG ───────────────────────────────────── */}
      {walkinSearchOpen ? (
        <div
          className="m-backdrop m-backdrop-walkin"
          role="presentation"
          onClick={() => setWalkinSearchOpen(false)}
        >
          <div className="m-dialog" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div className="m-dialog-head">
              <div className="m-dialog-head-copy">
                <span className="m-dialog-eyebrow">Walk-in</span>
                <h2 className="m-dialog-title">Гость с улицы — подобрать стол</h2>
                <p className="m-dialog-desc" style={{ marginTop: 6 }}>
                  Укажи количество гостей и длительность. Система предложит свободные столы прямо сейчас.
                </p>
              </div>
              <button className="m-btn" onClick={() => setWalkinSearchOpen(false)} type="button">✕</button>
            </div>
            <div className="m-dialog-body">
              <div className="m-form-grid" style={{ marginBottom: 16 }}>
                <div className="m-field">
                  <label className="m-field-label">Гостей</label>
                  <input
                    className="m-input"
                    type="number"
                    min={1}
                    max={50}
                    value={walkinGuests}
                    onChange={(e) => setWalkinGuests(Math.max(1, Number(e.target.value) || 1))}
                  />
                </div>
                <div className="m-field">
                  <label className="m-field-label">На сколько (мин)</label>
                  <select
                    className="m-select"
                    value={walkinDuration}
                    onChange={(e) => setWalkinDuration(Number(e.target.value) || 90)}
                  >
                    {[45, 60, 90, 120, 150, 180, 240].map((m) => (
                      <option key={m} value={m}>{m} мин</option>
                    ))}
                  </select>
                </div>
                {floorPlanRooms.length > 1 ? (
                  <div className="m-field">
                    <label className="m-field-label">Зал (опционально)</label>
                    <select
                      className="m-select"
                      value={walkinPreferredRoomId}
                      onChange={(e) => setWalkinPreferredRoomId(e.target.value)}
                    >
                      <option value="">Любой</option>
                      {floorPlanRooms.map((room) => (
                        <option key={room.id} value={room.id}>{room.name}</option>
                      ))}
                    </select>
                  </div>
                ) : null}
              </div>

              <div className="m-detail-actions" style={{ marginBottom: 16 }}>
                <button
                  type="button"
                  className="m-btn m-btn-gold"
                  disabled={walkinSearchLoading}
                  onClick={() => void runWalkinSearch()}
                >
                  {walkinSearchLoading ? "Ищем..." : "Подобрать столы"}
                </button>
                <button
                  type="button"
                  className="m-btn"
                  onClick={() => setWalkinSearchOpen(false)}
                >
                  Отмена
                </button>
              </div>

              {walkinSuggestions !== null ? (
                walkinSuggestions.length === 0 ? (
                  <div className="m-note">
                    Подходящих столов сейчас нет — все занятые или слишком маленькие. Попробуй уменьшить длительность или подождать освобождения.
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <div className="m-eyebrow">Топ {walkinSuggestions.length} вариантов</div>
                    {walkinSuggestions.map((s) => (
                      <div
                        key={`walkin-sugg-${s.tableId}`}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 12,
                          padding: "12px 14px",
                          border: "1px solid var(--s-border)",
                          borderRadius: 10,
                          background: "var(--s-deep)",
                        }}
                      >
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 14, fontWeight: 600, color: "var(--s-text)" }}>
                            {s.tableLabel}{" "}
                            <span style={{ fontSize: 12, fontWeight: 400, color: "var(--s-muted)" }}>
                              · {s.roomName} · {s.capacity} мест
                            </span>
                          </div>
                          <div style={{ fontSize: 12, color: "var(--s-muted)", marginTop: 4 }}>
                            {s.nextBookingTime
                              ? <>Свободен до <b>{s.nextBookingTime}</b>{s.availableMinutes !== null ? <> (≈{s.availableMinutes} мин)</> : null}</>
                              : <>Свободен без ограничений по бронированию</>}
                          </div>
                        </div>
                        <button
                          type="button"
                          className="m-btn m-btn-positive"
                          disabled={!!walkinSeatingId}
                          onClick={() => void seatWalkinSuggestion(s)}
                        >
                          {walkinSeatingId === s.tableId ? "Сажаем…" : "Посадить"}
                        </button>
                      </div>
                    ))}
                  </div>
                )
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {walkinDialog ? (
        <div className="m-backdrop m-backdrop-walkin" role="presentation" onClick={() => setWalkinDialog(null)}>
          <div className="m-dialog" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
              <div className="m-dialog-head">
                <div className="m-dialog-head-copy">
                  <span className="m-dialog-eyebrow">
                  {walkinDialog.walkinBookingId ? "Гость сидит" : walkinDialog.upcomingBookingTime ? "Стол зарезервирован позже" : "Стол свободен"}
                  </span>
                  <h2 className="m-dialog-title">{walkinDialog.tableLabel}</h2>
                  {walkinDialog.roomName ? (
                    <p className="m-dialog-desc" style={{ marginTop: 6 }}>{walkinDialog.roomName}</p>
                  ) : null}
                </div>
              <button className="m-btn" onClick={() => setWalkinDialog(null)} type="button">✕</button>
            </div>
            <div className="m-dialog-body">
              {walkinDialog.walkinBookingId ? (
                <>
                  <p style={{ fontSize: 13, color: "var(--s-muted)", margin: "0 0 16px" }}>
                    Этот стол занят walk-in гостем без предварительной брони.
                    Когда гости уйдут, нажмите «Освободить стол» — освободится только этот стол, остальные не изменятся.
                  </p>
                  <div className="m-detail-actions">
                    <button
                      className="m-btn m-btn-danger"
                      disabled={isPending}
                      onClick={() => handleWalkinRelease(walkinDialog.walkinBookingId!, walkinDialog.tableId, walkinDialog.tableLabel)}
                      type="button"
                    >
                      Освободить стол
                    </button>
                    <button className="m-btn" onClick={() => setWalkinDialog(null)} type="button">
                      Закрыть
                    </button>
                  </div>
                  {walkinDialogRelatedBooking ? (
                    <>
                      <div style={{ height: 1, background: "var(--s-border)", margin: "20px 0" }} />
                      <div className="m-eyebrow" style={{ marginBottom: 10 }}>Статус ближайшей брони</div>
                      <div style={{ fontSize: 13, color: "var(--s-muted)", marginBottom: 12 }}>
                        {walkinDialogRelatedBooking.customerName} · {walkinDialogRelatedBooking.startTimeRaw || "без времени"} · {getBookingStatusMeta(walkinDialogRelatedBooking).shortLabel}
                      </div>
                      <div className="m-detail-actions">
                        {getQuickTableStatusActions(walkinDialogRelatedBooking).map((action) => (
                          <button
                            key={`walkin-dialog-booking-${walkinDialogRelatedBooking.id}-${action}`}
                            className={`m-btn ${action === "cancel" || action === "decline" ? "m-btn-danger" : action === "arrived" || action === "confirm" || action === "complete_visit" ? "m-btn-positive" : ""}`}
                            disabled={isPending}
                            onClick={() => handleAction(walkinDialogRelatedBooking.id, action)}
                            type="button"
                          >
                            {actionLabels[action]}
                          </button>
                        ))}
                      </div>
                    </>
                  ) : null}
                </>
              ) : (
                <>
                  <p style={{ fontSize: 13, color: "var(--s-muted)", margin: "0 0 16px" }}>
                    {walkinDialog.upcomingBookingTime
                      ? <>Можно посадить гостя сейчас, но обязательно предупредите его: стол понадобится к <strong>{walkinDialog.upcomingBookingTime}</strong>{walkinDialog.upcomingBookingCustomer ? ` для ${walkinDialog.upcomingBookingCustomer}` : ""}. За 30 минут до этой брони менеджеру придет Telegram-напоминание.</>
                      : <>Если гость сел без предварительной брони, нажмите «Занять». Стол станет занятым только для этой точки и не будет предложен другим клиентам.</>}
                  </p>
                  <div className="m-detail-actions">
                    <button
                      className="m-btn m-btn-positive"
                      disabled={isPending}
                      onClick={() =>
                        handleWalkinOccupy(
                          walkinDialog.tableId,
                          walkinDialog.tableLabel,
                          walkinDialog.roomName,
                          walkinDialog.upcomingBookingTime
                        )
                      }
                      type="button"
                    >
                      {walkinDialog.upcomingBookingTime ? "Предупредил и занял" : "Занять"}
                    </button>
                    <button
                      className="m-btn"
                      onClick={() =>
                        openManualBookingForTable(
                          walkinDialog.tableId,
                          walkinDialog.tableLabel,
                          walkinDialog.roomName,
                          walkinDialog.prefilledBookingTime
                        )
                      }
                      type="button"
                    >
                      Новая бронь
                    </button>
                    <button className="m-btn" onClick={() => setWalkinDialog(null)} type="button">
                      Отмена
                    </button>
                  </div>
                  {walkinDialogRelatedBooking ? (
                    <>
                      <div style={{ height: 1, background: "var(--s-border)", margin: "20px 0" }} />
                      <div className="m-eyebrow" style={{ marginBottom: 10 }}>Статус брони по этому столу</div>
                      <div style={{ fontSize: 13, color: "var(--s-muted)", marginBottom: 12 }}>
                        {walkinDialogRelatedBooking.customerName} · {walkinDialogRelatedBooking.startTimeRaw || "без времени"} · {getBookingStatusMeta(walkinDialogRelatedBooking).shortLabel}
                      </div>
                      <div className="m-detail-actions">
                        {getQuickTableStatusActions(walkinDialogRelatedBooking).map((action) => (
                          <button
                            key={`walkin-dialog-status-${walkinDialogRelatedBooking.id}-${action}`}
                            className={`m-btn ${action === "cancel" || action === "decline" ? "m-btn-danger" : action === "arrived" || action === "confirm" || action === "complete_visit" ? "m-btn-positive" : ""}`}
                            disabled={isPending}
                            onClick={() => handleAction(walkinDialogRelatedBooking.id, action)}
                            type="button"
                          >
                            {actionLabels[action]}
                          </button>
                        ))}
                      </div>
                    </>
                  ) : null}
                </>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {/* ── INLINE MANUAL BOOKING DIALOG ────────────────────── */}
      {inlineManualDialog ? (
        <div className="m-backdrop m-backdrop-inline" role="presentation" onClick={() => setInlineManualDialog(null)}>
          <div className="m-dialog m-dialog-lg" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div className="m-dialog-head">
              <div className="m-dialog-head-copy">
                <span className="m-dialog-eyebrow">Новая бронь</span>
                <h2 className="m-dialog-title">{inlineManualDialog.tableLabel}</h2>
                <p className="m-dialog-desc">
                  {inlineManualDialog.roomName
                    ? `${inlineManualDialog.roomName} · оформи бронь прямо отсюда`
                    : "Оформи бронь прямо отсюда"}
                </p>
              </div>
              <button className="m-btn" onClick={() => setInlineManualDialog(null)} type="button">✕</button>
            </div>

            <div className="m-dialog-body">
              <form onSubmit={handleManualBooking} ref={manualFormRef}>
                <div className="m-note" style={{ marginBottom: 20 }}>
                  <strong style={{ color: "var(--s-text)", fontSize: 13 }}>{selectedVenue?.name || "Объект не выбран"}</strong>
                  {selectedPoint ? <span style={{ marginLeft: 8 }}>{selectedPoint.roomName} · {selectedPoint.label}</span> : null}
                </div>

                <div className="m-form-grid">
                  <div className="m-field">
                    <label className="m-field-label">Клиент</label>
                    <input className="m-input" name="name" placeholder="Имя клиента" required />
                  </div>
                  <div className="m-field">
                    <label className="m-field-label">Телефон</label>
                    <input
                      className="m-input"
                      name="phone"
                      placeholder="+998..."
                      required
                      value={phoneInputValue}
                      onChange={(e) => setPhoneInputValue(e.target.value)}
                    />
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

                {/* ── Карточка гостя из истории ─────────────────────────── */}
                {guestProfile ? (
                  <div
                    style={{
                      marginBottom: 16,
                      padding: "14px 16px",
                      borderRadius: 12,
                      border: "1px solid rgba(59, 130, 246, 0.35)",
                      background: "rgba(59, 130, 246, 0.08)",
                      color: "var(--s-text)",
                      fontSize: 13,
                      display: "flex",
                      flexDirection: "column",
                      gap: 8,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <strong style={{ fontSize: 14 }}>
                        {guestProfile.primaryName || "Постоянный гость"}
                      </strong>
                      {guestProfile.flags.includes("vip") ? (
                        <span style={{ padding: "2px 8px", borderRadius: 999, background: "#fef3c7", color: "#92400e", fontSize: 11, fontWeight: 600 }}>VIP</span>
                      ) : null}
                      {guestProfile.flags.includes("regular") ? (
                        <span style={{ padding: "2px 8px", borderRadius: 999, background: "#dcfce7", color: "#166534", fontSize: 11, fontWeight: 600 }}>Постоянник</span>
                      ) : null}
                      {guestProfile.flags.includes("first-visit") ? (
                        <span style={{ padding: "2px 8px", borderRadius: 999, background: "#e0e7ff", color: "#3730a3", fontSize: 11, fontWeight: 600 }}>Первый визит</span>
                      ) : null}
                      {guestProfile.flags.includes("risk") ? (
                        <span style={{ padding: "2px 8px", borderRadius: 999, background: "#fee2e2", color: "#b91c1c", fontSize: 11, fontWeight: 600 }}>⚠ Риск no-show</span>
                      ) : null}
                    </div>
                    <div style={{ fontSize: 12, color: "var(--s-muted)", lineHeight: 1.6 }}>
                      Был у нас <b>{guestProfile.totalBookings}</b> {guestProfile.totalBookings === 1 ? "раз" : "раз(а)"}
                      {guestProfile.confirmedBookings > 0 ? <>, состоялось — <b>{guestProfile.confirmedBookings}</b></> : null}
                      {guestProfile.noShowCount > 0 ? <>, не пришёл — <b style={{ color: "#b91c1c" }}>{guestProfile.noShowCount}</b></> : null}
                      {guestProfile.lastVisitLabel ? <>. Последний визит: <b>{guestProfile.lastVisitLabel}</b></> : null}.
                      {guestProfile.favoritePlaceLabel ? <> Любимое место: <b>{guestProfile.favoritePlaceLabel}</b>{guestProfile.favoriteVenueName && guestProfile.favoriteVenueName !== selectedVenue?.name ? <> ({guestProfile.favoriteVenueName})</> : null}.</> : null}
                      {guestProfile.averageGuests ? <> Средняя компания: <b>{guestProfile.averageGuests}</b> чел.</> : null}
                    </div>
                    {guestProfile.primaryName ? (
                      <div>
                        <button type="button" className="m-btn" onClick={applyGuestNameToForm} style={{ fontSize: 12 }}>
                          ↳ Использовать «{guestProfile.primaryName}»
                        </button>
                      </div>
                    ) : null}
                  </div>
                ) : guestLookupLoading && phoneInputValue.replace(/\D+/g, "").length >= 7 ? (
                  <div style={{ marginBottom: 16, fontSize: 12, color: "var(--s-muted)" }}>
                    Ищем гостя в истории…
                  </div>
                ) : null}

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
                    <select className="m-select" name="status" value={manualStatus} onChange={(e) => setManualStatus(e.target.value)}>
                      <option value="CONFIRMED">Сразу подтвердить</option>
                      <option value="HOLD_PENDING">Поставить на hold</option>
                      <option value="NEW">Новая заявка</option>
                      <option value="WAITLIST">В ожидание</option>
                    </select>
                  </div>
                </div>

                <div className={`m-slot-feedback ${manualTime ? "has-slot" : ""}`}>
                  {isManualSlotLoading
                    ? "Загружаем доступные слоты..."
                    : manualStatus === "WAITLIST" && manualTime
                      ? (() => {
                          const slotOccupied = manualSlots.find((s) => s.time === manualTime)?.status === "unavailable";
                          return slotOccupied
                            ? <>Клиент будет в листе ожидания на <strong>{manualTime}</strong> — слот недоступен для брони.</>
                            : <>Слот <strong>{manualTime}</strong> свободен — лучше сразу оформить бронь, а не ожидание.</>;
                        })()
                      : manualStatus === "WAITLIST"
                        ? "Выберите время, на которое хочет попасть клиент."
                      : selectedTableBookingStatus && selectedTableBookingStatus !== "available" && nextAvailableManualSlot
                        ? <>Стол сейчас недоступен для брони. Ближайшее время для новой брони: <strong>{manualTime || nextAvailableManualSlot.time}</strong></>
                        : nextAvailableManualSlot
                          ? <>Ближайшее время для брони: <strong>{manualTime || nextAvailableManualSlot.time}</strong></>
                        : "Для этого стола на выбранную дату свободных слотов нет."}
                </div>

                <div className="m-field" style={{ marginBottom: 24 }}>
                  <label className="m-field-label">Комментарий</label>
                  <textarea className="m-textarea" name="note" placeholder="Доп. заметка менеджера" />
                </div>

                {/* ── Conflict warning ─────────────────────────────────── */}
                {manualConflict && manualStatus !== "WAITLIST" ? (
                  <div
                    style={{
                      marginBottom: 16,
                      padding: "12px 14px",
                      borderRadius: 10,
                      border: "1px solid #fca5a5",
                      background: "rgba(239, 68, 68, 0.08)",
                      color: "#b91c1c",
                      fontSize: 13,
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 10,
                    }}
                  >
                    <span style={{ fontSize: 16, lineHeight: "20px" }}>⚠</span>
                    <div>
                      <div style={{ fontWeight: 600, marginBottom: 2 }}>Конфликт по времени</div>
                      <div>
                        Стол <strong>{manualConflict.placeLabel}</strong> уже занят бронью
                        {manualConflict.customerName ? <> на <strong>{manualConflict.customerName}</strong></> : null}
                        {" "}({manualConflict.windowLabel}). Выберите другое время или другой стол —
                        либо переведите клиента в лист ожидания.
                      </div>
                    </div>
                  </div>
                ) : null}

                <div className="m-detail-actions">
                  <button
                    className="m-btn m-btn-gold"
                    disabled={
                      isPending ||
                      (manualStatus !== "WAITLIST" && !manualTime && !nextAvailableManualSlot) ||
                      (manualStatus === "WAITLIST" && !!manualTime && manualSlots.find((s) => s.time === manualTime)?.status !== "unavailable") ||
                      (manualStatus !== "WAITLIST" && !!manualConflict)
                    }
                    type="submit"
                  >
                    Записать бронь
                  </button>
                  <button className="m-btn" disabled={isPending} onClick={handleManualWaitlist} type="button">
                    В лист ожидания
                  </button>
                  <button className="m-btn" onClick={() => setInlineManualDialog(null)} type="button">
                    Отмена
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      ) : null}

      {/* ── BOOKING DETAIL DIALOG ────────────────────────────── */}
      {selectedBookingDetail ? (() => {
        const meta = getBookingStatusMeta(selectedBookingDetail);
        const bookingArrived = isBookingMarkedArrived(selectedBookingDetail.managerNote);
        return (
          <div className="m-backdrop m-backdrop-booking" role="presentation" onClick={() => setSelectedBookingId(null)}>
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

                {/* Assign time section — only for bookings without a time */}
                {!selectedBookingDetail.startTimeRaw && !selectedBookingDetail.archived ? (
                  <div className="m-detail-section" style={{ borderTop: "1px solid var(--s-border)", paddingTop: 14 }}>
                    <span className="m-detail-label" style={{ color: "#f0c14b" }}>⏱ Назначить время</span>
                    <p style={{ fontSize: 12, color: "var(--s-muted)", margin: "4px 0 10px" }}>
                      Позвоните клиенту, договоритесь о времени и выберите слот ниже.
                    </p>
                    {isAssignTimeLoading ? (
                      <span style={{ fontSize: 12, color: "var(--s-muted)" }}>Загружаем доступные слоты…</span>
                    ) : assignTimeSlots.filter((s) => s.status !== "unavailable").length === 0 ? (
                      <span style={{ fontSize: 12, color: "var(--s-muted)" }}>
                        Нет свободных слотов на {selectedBookingDetail.dateLabel}
                      </span>
                    ) : (
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                        <select
                          className="m-filter-select"
                          onChange={(e) => setSelectedAssignTime(e.target.value)}
                          style={{ minWidth: 150 }}
                          value={selectedAssignTime}
                        >
                          {assignTimeSlots
                            .filter((s) => s.status !== "unavailable")
                            .map((s) => (
                              <option key={s.time} value={s.time}>{s.label}</option>
                            ))}
                        </select>
                        <button
                          className="m-btn m-btn-positive"
                          disabled={!selectedAssignTime || isPending}
                          onClick={() => assignTime(selectedBookingDetail.id, selectedAssignTime)}
                          type="button"
                        >
                          Назначить
                        </button>
                      </div>
                    )}
                  </div>
                ) : null}

                {!selectedBookingDetail.archived ? (
                  <div className="m-detail-section">
                    <span className="m-detail-label">Посадка</span>
                    <div className="m-detail-actions" style={{ marginTop: 4 }}>
                      {!bookingArrived && selectedBookingDetail.status === "confirmed" ? (
                        <button
                          className="m-btn m-btn-positive"
                          disabled={isPending}
                          onClick={() => { setSelectedBookingId(null); handleAction(selectedBookingDetail.id, "arrived"); }}
                          type="button"
                        >
                          Гость пришёл
                        </button>
                      ) : null}
                      {(selectedBookingDetail.status === "confirmed" || bookingArrived) ? (
                        <button
                          className="m-btn"
                          disabled={isPending}
                          onClick={() => { setSelectedBookingId(null); handleAction(selectedBookingDetail.id, "complete_visit"); }}
                          type="button"
                        >
                          Стол свободен
                        </button>
                      ) : null}
                    </div>
                  </div>
                ) : null}

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
            {sidebarTabs.map((tab) => (
              <button
                className={`m-sidebar-tab ${activeTab === tab.key ? "active" : ""}`}
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                type="button"
              >
                <span className="m-sidebar-icon">{tab.icon}</span>
                <span>{tab.label}</span>
                {tab.badge ? <span className={`m-sidebar-badge ${tab.badgeTone || ""}`}>{tab.badge}</span> : null}
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
              {listings[0] ? (
                <div className="m-center-workspace">
                  <div className="m-center-tabs">
                    <button className={`m-center-tab ${overviewWorkspaceTab === "shift" ? "active" : ""}`} onClick={() => setOverviewWorkspaceTab("shift")} type="button">Смена</button>
                    <button className={`m-center-tab ${overviewWorkspaceTab === "occupancy" ? "active" : ""}`} onClick={() => setOverviewWorkspaceTab("occupancy")} type="button">Загрузка</button>
                    <button className={`m-center-tab ${overviewWorkspaceTab === "stream" ? "active" : ""}`} onClick={() => setOverviewWorkspaceTab("stream")} type="button">Лента смены</button>
                  </div>

                  <div className="m-center-panel">
                    {overviewWorkspaceTab === "shift" ? (
                      <div className="m-shift-grid m-shift-grid-fill">
                        <aside className="m-shift-side">
                          <div className="m-shift-side-head">
                            <div className="m-eyebrow">Смена</div>
                            <strong className="m-shift-side-date">{formatOperationalDate(operationalDate)}</strong>
                            <div className="m-shift-side-stats">
                              <span>{hallReservationBookings.length} броней</span>
                              {hallAttentionBookings.length > 0 ? <span className="is-attention">{hallAttentionBookings.length} нужно действие</span> : null}
                              {hallLateBookings.length > 0 ? <span className="is-late">{hallLateBookings.length} опаздывают</span> : null}
                              {hallArrivingSoon.length > 0 ? <span className="is-arriving">{hallArrivingSoon.length} скоро придут</span> : null}
                            </div>
                          </div>
                          <div className="m-shift-side-scroll">
                            {renderHallSection("Нужно действие", hallAttentionBookings, { accentColor: "#ff5252", headerColor: "#ff8c8c", headerBackground: "rgba(255,82,82,0.08)", icon: "●", keyPrefix: "ov-attn" })}
                            {renderHallSection("Гость опаздывает", hallLateBookings, { accentColor: "#f0c14b", headerColor: "#f0c14b", headerBackground: "rgba(240,193,76,0.06)", icon: "◌", keyPrefix: "ov-late" })}
                            {renderHallSection("Скоро придут", hallArrivingSoon, { accentColor: "#e8a030", headerColor: "#e8a030", headerBackground: "rgba(232,160,48,0.06)", icon: "⚡", keyPrefix: "ov-soon" })}
                            {renderHallSection("Walk-in сидят", hallWalkinBookings, { accentColor: "#ff9f45", headerColor: "#ffb067", headerBackground: "rgba(255,159,69,0.06)", icon: "■", keyPrefix: "ov-walkin" })}
                            {renderHallSection("Ожидание", hallWaitlistBookings, { accentColor: "#b684ff", headerColor: "#b684ff", headerBackground: "rgba(182,132,255,0.06)", icon: "◷", keyPrefix: "ov-wl", idPrefix: "ov-hb-wl" })}
                            {hallReservationBookings.length > 0 ? renderHallSection("Остальные брони", hallPlainBookings, { headerColor: "var(--s-muted)", headerBackground: "var(--s-bg)", keyPrefix: "ov-rest" }) : (
                              <div className="m-note" style={{ margin: 16 }}>На выбранную дату активных броней нет.</div>
                            )}
                          </div>
                        </aside>

                        <div className="m-shift-main">
                          {floorPlanRooms.length > 0 ? (
                            <div className="m-plan-wrap">
                              <div className="m-plan-head">
                                <div>
                                  <div className="m-eyebrow">Карта заведения</div>
                                  <strong style={{ fontSize: 13, color: "var(--s-text)" }}>В каждом зале своя расстановка столов и зон</strong>
                                </div>
                                <button
                                  type="button"
                                  className="m-btn m-btn-gold"
                                  onClick={() => {
                                    setWalkinSearchOpen(true);
                                    setWalkinSuggestions(null);
                                  }}
                                  style={{ fontSize: 13 }}
                                >
                                  👋 Walk-in: гость с улицы
                                </button>
                              </div>
                              <FloorPlanViewer
                                allowOccupiedTableSelection
                                attentionIds={hallAttentionIds}
                                arrivingSoonIds={hallArrivingSoonIds}
                                data={selectedFloorPlan!}
                                lateIds={hallLateIds}
                                onRoomChange={handleFloorRoomChange}
                                onTableSelect={(table) =>
                                  openHallTableContext(
                                    table.id,
                                    table.label,
                                    floorPlanTableById[table.id]?.roomName
                                  )
                                }
                                selectedRoomId={selectedFloorRoomId || undefined}
                                selectedTableId={hallSelectedTableId ?? undefined}
                                showOperationalLegend
                                tableMeta={hallFloorPlanMeta}
                                tableStatuses={floorPlanTableState.statuses}
                                waitlistCounts={hallWaitlistCounts}
                              />
                            </div>
                          ) : selectedVenue ? (
                            <div className="m-note">Зайди в <strong>Редактировать объект</strong> и нарисуй зоны со столами — они появятся здесь и на странице заведения для клиентов.</div>
                          ) : null}
                        </div>
                      </div>
                    ) : null}

                    {overviewWorkspaceTab === "occupancy" ? (
                      <>
                        <div className="m-center-panel-head">
                          <div>
                            <div className="m-eyebrow">Загрузка</div>
                            <h2 className="m-section-title">Схема дня по столам</h2>
                          </div>
                        </div>
                        {occupancyRows.length > 0 && operationalTimeline.length > 0 ? (
                          <>
                            {occupancyRoomOptions.length > 1 ? (
                              <div className="m-occupancy-filters">
                                <button className={`m-occupancy-filter ${occupancyRoomFilter === "all" ? "active" : ""}`} onClick={() => setOccupancyRoomFilter("all")} type="button">Все залы</button>
                                {occupancyRoomOptions.map((roomName) => (
                                  <button className={`m-occupancy-filter ${occupancyRoomFilter === roomName ? "active" : ""}`} key={roomName} onClick={() => setOccupancyRoomFilter(roomName)} type="button">
                                    {roomName}
                                  </button>
                                ))}
                              </div>
                            ) : null}
                            <div className="m-occupancy">
                              <div className="m-occupancy-head">
                                <span className="m-occupancy-head-label">Стол</span>
                                <div className="m-occupancy-head-slots">
                                  {operationalTimeline.map((slot) => (
                                    <span className="m-occupancy-head-slot" key={slot}>{slot}</span>
                                  ))}
                                </div>
                              </div>
                              {filteredOccupancyRows.map((row) => (
                                <div className="m-occupancy-row" key={row.point.id}>
                                  <span className="m-occupancy-row-label">
                                    <span className="m-occupancy-row-table">{row.point.label}</span>
                                    <span className="m-occupancy-row-room">{row.point.roomName}</span>
                                  </span>
                                  <div className="m-occupancy-cells">
                                    {operationalTimeline.map((slot) => {
                                      const hasSlot = row.availableSlots.has(slot);
                                      const state = row.slotState[slot];
                                      const unavailable = state === "blocked" || state === "past";
                                      if (!hasSlot) {
                                        return <button className="m-occupancy-cell na" disabled key={`${row.point.id}-${slot}`} type="button">-</button>;
                                      }
                                      return (
                                        <button
                                          className={`m-occupancy-cell ${unavailable ? "busy" : "free"}`}
                                          key={`${row.point.id}-${slot}`}
                                          onClick={() => {
                                            const tableId = row.point.floorTableId || row.point.id;
                                            const bookingAtSlot = row.bookingBySlot[slot];

                                            if (state === "available") {
                                              openHallTableContext(tableId, row.point.label, row.point.roomName, {
                                                prefilledBookingTime: slot
                                              });
                                              return;
                                            }

                                            if (state === "blocked") {
                                              if (bookingAtSlot?.sourceLabel === "Walk-in") {
                                                openHallTableContext(tableId, row.point.label, row.point.roomName);
                                                return;
                                              }

                                              if (bookingAtSlot) {
                                                setHallSelectedTableId(tableId);
                                                setHallHighlightedBookingId(bookingAtSlot.id);
                                                setSelectedBookingId(bookingAtSlot.id);
                                                return;
                                              }
                                            }

                                            openHallTableContext(tableId, row.point.label, row.point.roomName);
                                          }}
                                          type="button"
                                        >
                                          {unavailable ? "Недост." : "Своб."}
                                        </button>
                                      );
                                    })}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </>
                        ) : (
                          <div className="m-note">В админке у объекта пока не сохранены времена бронирования. После добавления слотов там они появятся здесь автоматически.</div>
                        )}
                      </>
                    ) : null}

                    {overviewWorkspaceTab === "stream" ? (
                      <>
                        <div className="m-center-panel-head">
                          <div>
                            <div className="m-eyebrow">Лента смены</div>
                            <h2 className="m-section-title">Ближайшие брони и ожидание</h2>
                          </div>
                          <div className="m-section-actions">
                            <button className="m-btn" onClick={() => setActiveTab("bookings")} type="button">Открыть канбан</button>
                          </div>
                        </div>
                        <div className="m-note" style={{ marginBottom: 16 }}>
                          Для хостес важнее не колонки, а живая очередь: кто придёт сейчас, кто уже в зале, какой стол скоро понадобится и кого нужно предупредить.
                        </div>
                        <div className="m-shift-stream">
                          <section className="m-shift-stream-panel">
                            <div className="m-shift-stream-head">
                              <div>
                                <div className="m-eyebrow">Ближайшие брони</div>
                                <strong>Вся очередь на сегодня</strong>
                              </div>
                              <span>{hallUpcomingBookings.length}</span>
                            </div>
                            <div className="m-shift-stream-body">
                              {hallUpcomingBookings.length === 0 ? (
                                <div className="m-note">На выбранную дату подтверждённых броней пока нет.</div>
                              ) : (
                                hallUpcomingBookings.map((booking) =>
                                  renderHallBookingCard(booking, { keyPrefix: "overview-upcoming", idPrefix: "overview-upcoming" })
                                )
                              )}
                            </div>
                          </section>

                          <section className="m-shift-stream-panel">
                            <div className="m-shift-stream-head">
                              <div>
                                <div className="m-eyebrow">Лист ожидания</div>
                                <strong>Кого можно быстро обработать</strong>
                              </div>
                              <span>{activeWaitlistForOperationalDate.length}</span>
                            </div>
                            <div className="m-shift-stream-body">
                              {activeWaitlistForOperationalDate.length === 0 ? (
                                <div className="m-note">Лист ожидания на выбранную дату пуст.</div>
                              ) : (
                                activeWaitlistForOperationalDate.slice(0, 8).map((entry) => {
                                  const meta = getWaitlistEntryMeta(entry);
                                  return (
                                    <article className="m-booking-card" key={`overview-stream-${entry.id}`} onClick={() => setActiveTab("waitlist")}>
                                      <div className="m-booking-card-top">
                                        <span className={`m-status m-status-${meta.tone}`}>{meta.shortLabel}</span>
                                        <span className="m-booking-card-name">{entry.customerName}</span>
                                      </div>
                                      <div className="m-booking-card-info">
                                        <div className="m-booking-card-row">
                                          <span className="m-booking-card-lbl">Стол</span>
                                          <span className="m-booking-card-val">{entry.hotspotLabel}</span>
                                        </div>
                                        {entry.requestedTimeRaw ? (
                                          <div className="m-booking-card-row">
                                            <span className="m-booking-card-lbl">Время</span>
                                            <span className="m-booking-card-val">{entry.requestedTimeRaw}</span>
                                          </div>
                                        ) : null}
                                        <div className="m-booking-card-row">
                                          <span className="m-booking-card-lbl">Тел.</span>
                                          <span className="m-booking-card-val">{entry.customerPhone}</span>
                                        </div>
                                      </div>
                                    </article>
                                  );
                                })
                              )}
                            </div>
                          </section>
                        </div>
                      </>
                    ) : null}
                  </div>
                </div>
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
                  <div className="m-eyebrow">Канбан заявок</div>
                  <h1 className="m-section-title">{role === "manager" ? "Только назначенные вам" : "Все заявки компании"}</h1>
                </div>
              </div>
              <div className="m-note" style={{ marginBottom: 16 }}>
                Это отдельный административный режим. Для посадки гостей и управления столами используйте вкладку `Центр`.
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
                              <div className="m-booking-card-row">
                                <span className="m-booking-card-lbl">Время</span>
                                {booking.startTimeRaw ? (
                                  <span className="m-booking-card-val">{booking.slotLabel || booking.startTimeRaw}</span>
                                ) : (
                                  <span className="m-booking-card-val" style={{ color: "#f0c14b", fontWeight: 600, fontSize: 11 }}>
                                    ⏱ уточнить
                                  </span>
                                )}
                              </div>
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
                  <h1 className="m-section-title">Записать бронь на стол</h1>
                </div>
              </div>

              <form onSubmit={handleManualBooking} ref={manualFormRef}>
                {/* Venue info */}
                <div className="m-note" style={{ marginBottom: 20 }}>
                  <strong style={{ color: "var(--s-text)", fontSize: 13 }}>{selectedVenue?.name || "Объект не выбран"}</strong>
                  {selectedVenue ? <span style={{ marginLeft: 8 }}>{selectedVenue.city}</span> : <span> — подключи объект к менеджеру</span>}
                </div>

                {/* ── Карта заведения (FloorPlanViewer) ─────────────────── */}
                {floorPlanRooms.length > 0 ? (
                  <div className="m-plan-wrap" style={{ marginBottom: 20 }}>
                    <div className="m-plan-head">
                      <div>
                        <div className="m-eyebrow">Карта заведения</div>
                        <strong style={{ fontSize: 13, color: "var(--s-text)" }}>
                          Переключи зал сверху и выбери стол на схеме — нижняя форма синхронизируется автоматически
                        </strong>
                      </div>
                    </div>
                    <FloorPlanViewer
                      allowOccupiedTableSelection
                      data={selectedFloorPlan!}
                      onRoomChange={handleFloorRoomChange}
                      onTableSelect={(table, room) => {
                        setSelectedFloorRoomId(room.id);
                        setSelectedFloorTableId(table.id);
                        selectPointByLabel(table.label, room.name, "floor-table");
                        setManualTime("");
                        setPendingManualTime("");
                      }}
                      selectedRoomId={selectedFloorRoomId || undefined}
                      selectedTableId={selectedFloorTableId || undefined}
                      tableMeta={floorPlanTableState.meta}
                      tableStatuses={floorPlanTableState.statuses}
                    />
                  </div>
                ) : null}

                {/* Legacy point board fallback */}
                {floorPlanRooms.length === 0 && selectedManualScene ? (
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
                    <label className="m-field-label">Стол по схеме</label>
                    <select className="m-select" onChange={(e) => { setSelectedHotspotId(e.target.value); setManualTime(""); setPendingManualTime(""); }} value={selectedPoint?.id || ""}>
                      {bookablePoints.map((point) => (
                        <option key={point.id} value={point.id}>
                          {point.source === "floor-table"
                            ? `${point.roomName} · Стол · ${point.label}`
                            : `${point.roomName} · ${point.label}`}
                        </option>
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
                    <input
                      className="m-input"
                      name="phone"
                      placeholder="+998..."
                      required
                      value={phoneInputValue}
                      onChange={(e) => setPhoneInputValue(e.target.value)}
                    />
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

                {/* ── Карточка гостя из истории ─────────────────────────── */}
                {guestProfile ? (
                  <div
                    style={{
                      marginBottom: 16,
                      padding: "14px 16px",
                      borderRadius: 12,
                      border: "1px solid rgba(59, 130, 246, 0.35)",
                      background: "rgba(59, 130, 246, 0.08)",
                      color: "var(--s-text)",
                      fontSize: 13,
                      display: "flex",
                      flexDirection: "column",
                      gap: 8,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <strong style={{ fontSize: 14 }}>
                        {guestProfile.primaryName || "Постоянный гость"}
                      </strong>
                      {guestProfile.flags.includes("vip") ? (
                        <span style={{ padding: "2px 8px", borderRadius: 999, background: "#fef3c7", color: "#92400e", fontSize: 11, fontWeight: 600 }}>VIP</span>
                      ) : null}
                      {guestProfile.flags.includes("regular") ? (
                        <span style={{ padding: "2px 8px", borderRadius: 999, background: "#dcfce7", color: "#166534", fontSize: 11, fontWeight: 600 }}>Постоянник</span>
                      ) : null}
                      {guestProfile.flags.includes("first-visit") ? (
                        <span style={{ padding: "2px 8px", borderRadius: 999, background: "#e0e7ff", color: "#3730a3", fontSize: 11, fontWeight: 600 }}>Первый визит</span>
                      ) : null}
                      {guestProfile.flags.includes("risk") ? (
                        <span style={{ padding: "2px 8px", borderRadius: 999, background: "#fee2e2", color: "#b91c1c", fontSize: 11, fontWeight: 600 }}>⚠ Риск no-show</span>
                      ) : null}
                    </div>
                    <div style={{ fontSize: 12, color: "var(--s-muted)", lineHeight: 1.6 }}>
                      Был у нас <b>{guestProfile.totalBookings}</b> {guestProfile.totalBookings === 1 ? "раз" : "раз(а)"}
                      {guestProfile.confirmedBookings > 0 ? <>, состоялось — <b>{guestProfile.confirmedBookings}</b></> : null}
                      {guestProfile.noShowCount > 0 ? <>, не пришёл — <b style={{ color: "#b91c1c" }}>{guestProfile.noShowCount}</b></> : null}
                      {guestProfile.lastVisitLabel ? <>. Последний визит: <b>{guestProfile.lastVisitLabel}</b></> : null}.
                      {guestProfile.favoritePlaceLabel ? <> Любимое место: <b>{guestProfile.favoritePlaceLabel}</b>{guestProfile.favoriteVenueName && guestProfile.favoriteVenueName !== selectedVenue?.name ? <> ({guestProfile.favoriteVenueName})</> : null}.</> : null}
                      {guestProfile.averageGuests ? <> Средняя компания: <b>{guestProfile.averageGuests}</b> чел.</> : null}
                    </div>
                    {guestProfile.primaryName ? (
                      <div>
                        <button type="button" className="m-btn" onClick={applyGuestNameToForm} style={{ fontSize: 12 }}>
                          ↳ Использовать «{guestProfile.primaryName}»
                        </button>
                      </div>
                    ) : null}
                  </div>
                ) : guestLookupLoading && phoneInputValue.replace(/\D+/g, "").length >= 7 ? (
                  <div style={{ marginBottom: 16, fontSize: 12, color: "var(--s-muted)" }}>
                    Ищем гостя в истории…
                  </div>
                ) : null}

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
                    <select className="m-select" name="status" value={manualStatus} onChange={(e) => setManualStatus(e.target.value)}>
                      <option value="CONFIRMED">Сразу подтвердить</option>
                      <option value="HOLD_PENDING">Поставить на hold</option>
                      <option value="NEW">Новая заявка</option>
                      <option value="WAITLIST">В ожидание</option>
                    </select>
                  </div>
                </div>

                {/* Slot feedback */}
                <div className={`m-slot-feedback ${manualTime ? "has-slot" : ""}`}>
                  {isManualSlotLoading
                    ? "Загружаем доступные слоты..."
                    : manualStatus === "WAITLIST" && manualTime
                      ? (() => {
                          const slotOccupied = manualSlots.find((s) => s.time === manualTime)?.status === "unavailable";
                          return slotOccupied
                            ? <>Клиент будет в листе ожидания на <strong>{manualTime}</strong> — слот недоступен для брони.</>
                            : <>Слот <strong>{manualTime}</strong> свободен — лучше сразу оформить бронь, а не ожидание.</>;
                        })()
                    : manualStatus === "WAITLIST"
                      ? "Выберите время, на которое хочет попасть клиент."
                    : selectedTableBookingStatus && selectedTableBookingStatus !== "available" && nextAvailableManualSlot
                      ? <>Стол сейчас недоступен для брони. Ближайшее время для новой брони: <strong>{manualTime || nextAvailableManualSlot.time}</strong></>
                      : nextAvailableManualSlot
                        ? <>Ближайшее время для брони: <strong>{manualTime || nextAvailableManualSlot.time}</strong></>
                      : "Для этого стола на выбранную дату свободных слотов нет."}
                </div>

                {/* Note */}
                <div className="m-field" style={{ marginBottom: 24 }}>
                  <label className="m-field-label">Комментарий</label>
                  <textarea className="m-textarea" name="note" placeholder="Доп. заметка менеджера" />
                </div>

                <div className="m-form-actions">
                  <button
                    className="m-btn m-btn-gold"
                    disabled={
                      isPending ||
                      (manualStatus !== "WAITLIST" && !manualTime && !nextAvailableManualSlot) ||
                      (manualStatus === "WAITLIST" && !!manualTime && manualSlots.find((s) => s.time === manualTime)?.status !== "unavailable")
                    }
                    type="submit"
                  >Записать бронь</button>
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

          {/* ── HALL TAB ─────────────────────────────────────── */}
          {role !== "superadmin" && activeTab === "hall" ? (
            <div style={{ display: "flex", height: "calc(100vh - 120px)", overflow: "hidden", margin: "-24px" }}>

              {/* ── Left panel: booking list ──────────────────── */}
              <div style={{ width: 380, minWidth: 320, overflowY: "auto", borderRight: "1px solid var(--s-border)", display: "flex", flexDirection: "column", flexShrink: 0, background: "rgba(7,11,24,0.96)" }}>

                {/* Panel header */}
                <div style={{ padding: 16, borderBottom: "1px solid var(--s-border)", background: "var(--s-surface)", position: "sticky", top: 0, zIndex: 2 }}>
                  <div
                    style={{
                      border: "1px solid var(--s-border)",
                      background: "linear-gradient(180deg, rgba(18,24,44,0.98), rgba(14,18,34,0.98))",
                      padding: 16
                    }}
                  >
                    <div className="m-eyebrow">Режим зала</div>
                    <strong style={{ fontSize: 28, color: "var(--s-text)", display: "block", marginTop: 8, lineHeight: 1.05 }}>
                      {formatOperationalDate(operationalDate)}
                    </strong>
                    <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 12 }}>
                      <span style={{ fontSize: 12, color: "var(--s-muted)" }}>{hallReservationBookings.length} броней</span>
                      {hallAttentionBookings.length > 0 ? <span style={{ fontSize: 12, color: "#ff7a7a", fontWeight: 700 }}>● {hallAttentionBookings.length} нужно действие</span> : null}
                      {hallLateBookings.length > 0 ? <span style={{ fontSize: 12, color: "#f0c14b", fontWeight: 700 }}>◌ {hallLateBookings.length} опаздывают</span> : null}
                      {hallArrivingSoon.length > 0 ? <span style={{ fontSize: 12, color: "#e8a030", fontWeight: 700 }}>⚡ {hallArrivingSoon.length} скоро придут</span> : null}
                      {hallWaitlistBookings.length > 0 ? <span style={{ fontSize: 12, color: "#b684ff", fontWeight: 700 }}>◷ {hallWaitlistBookings.length} ожидание</span> : null}
                    </div>
                  </div>
                </div>

                {renderHallSection("Нужно действие", hallAttentionBookings, {
                  accentColor: "#ff5252",
                  headerColor: "#ff8c8c",
                  headerBackground: "rgba(255,82,82,0.08)",
                  icon: "●",
                  keyPrefix: "attn"
                })}

                {renderHallSection("Гость опаздывает", hallLateBookings, {
                  accentColor: "#f0c14b",
                  headerColor: "#f0c14b",
                  headerBackground: "rgba(240,193,76,0.06)",
                  icon: "◌",
                  keyPrefix: "late"
                })}

                {renderHallSection("Скоро придут", hallArrivingSoon, {
                  accentColor: "#e8a030",
                  headerColor: "#e8a030",
                  headerBackground: "rgba(232,160,48,0.06)",
                  icon: "⚡",
                  keyPrefix: "soon"
                })}

                {renderHallSection("Столы заняты сейчас", hallWalkinBookings, {
                  accentColor: "#ff9f45",
                  headerColor: "#ffb067",
                  headerBackground: "rgba(255,159,69,0.06)",
                  icon: "■",
                  keyPrefix: "walkin"
                })}

                {hallReservationBookings.length > 0 ? renderHallSection("Остальные брони", hallPlainBookings, {
                  headerColor: "var(--s-muted)",
                  headerBackground: "var(--s-bg)",
                  keyPrefix: "rest"
                }) : (
                  <div style={{ padding: "16px", fontSize: 13, color: "var(--s-muted)" }}>Броней на эту дату нет.</div>
                )}

                {renderHallSection("Ожидание", hallWaitlistBookings, {
                  accentColor: "#b684ff",
                  headerColor: "#b684ff",
                  headerBackground: "rgba(182,132,255,0.06)",
                  icon: "◷",
                  keyPrefix: "wl",
                  idPrefix: "hb-wl"
                })}
              </div>

              {/* ── Right panel: floor plan ───────────────────── */}
              <div style={{ flex: 1, overflow: "auto", padding: 16, minWidth: 0 }}>
                {selectedFloorPlan ? (
                  <FloorPlanViewer
                    allowOccupiedTableSelection
                    attentionIds={hallAttentionIds}
                    arrivingSoonIds={hallArrivingSoonIds}
                    data={selectedFloorPlan}
                    lateIds={hallLateIds}
                    onTableSelect={handleHallTableSelect}
                    selectedTableId={hallSelectedTableId ?? undefined}
                    showOperationalLegend
                    tableMeta={hallFloorPlanMeta}
                    tableStatuses={floorPlanTableState.statuses}
                    waitlistCounts={hallWaitlistCounts}
                  />
                ) : (
                  <div className="m-note" style={{ marginTop: 24 }}>
                    Карта заведения не загружена. Зайди в{" "}
                    <strong>Редактировать объект</strong> и нарисуй залы — они появятся здесь автоматически.
                  </div>
                )}
              </div>
            </div>
          ) : null}

        </main>
      </div>
    </div>
  );
}
