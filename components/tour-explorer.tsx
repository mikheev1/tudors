"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { CSSProperties, FormEvent, useEffect, useMemo, useState, useTransition } from "react";

import { buildClientApiUrl } from "@/lib/client/api";
import { buildSearchHref } from "@/lib/client/search-route";
import { PanoramaViewer } from "@/components/panorama-viewer";
import { TudorsStudioLogo } from "@/components/tudors-studio-logo";
import { getProcessHint } from "@/lib/processes";
import type {
  BookingSlot,
  CompanyThemeConfig,
  Hotspot,
  Venue,
  VenueSearchFilters,
  VenueVertical
} from "@/lib/types";

type TourExplorerProps = {
  venues: Venue[];
  companyTheme: CompanyThemeConfig;
  initialVertical?: "all" | VenueVertical;
  initialFilters?: VenueSearchFilters;
  mode?: "home" | "category" | "search";
};

type ToastState = {
  kind: "success" | "info" | "error";
  message: string;
} | null;

type ProcessPayload = {
  message?: string;
  issues?: string[];
  holdLabel?: string;
  slaLabel?: string;
};

const verticalLabels: Record<VenueVertical, string> = {
  restaurant: "Рестораны",
  apartment: "Квартиры",
  "event-space": "Площадки",
  office: "Коммерция",
  villa: "Виллы"
};

const allVerticalOptions: VenueVertical[] = [
  "restaurant",
  "apartment",
  "event-space",
  "office",
  "villa"
];

const footerColumns = [
  {
    title: "Поддержка",
    items: ["Центр помощи", "Безопасность", "Связаться с нами", "Доступность"]
  },
  {
    title: "Размещение",
    items: ["Подключить объект", "Правила площадки", "Инструменты для менеджера", "360-редактор"]
  },
  {
    title: "Категории",
    items: ["Рестораны", "Квартиры", "Площадки", "Виллы"]
  },
  {
    title: "Tudors Studio",
    items: ["О сервисе", "Для партнеров", "Условия", "Конфиденциальность"]
  }
] as const;

const heroHighlights = [
  "360° тур до бронирования",
  "Быстрый ответ менеджера",
  "Заявка за 1 минуту"
] as const;

const phoneCountryCodes = ["+998", "+7", "+996", "+994", "+90"];

function formatPhoneLocal(value: string) {
  return value.replace(/\D/g, "").slice(0, 9);
}

function buildPhoneNumber(countryCode: string, phoneLocal: string) {
  const normalizedLocal = formatPhoneLocal(phoneLocal);
  return `${countryCode} ${normalizedLocal}`.trim();
}

function getSlotStatusText(slot: BookingSlot) {
  if (slot.status === "unavailable") {
    if (slot.unavailableReason === "past") return "Прошло";
    if (slot.unavailableReason === "occupied") return "Занято";
    return "Недоступно";
  }
  return "Свободно";
}

function getBookingPointStatus(status?: Hotspot["status"]) {
  return status === "waitlist" ? "unavailable" : "available";
}

function getTodayDateValue() {
  const now = new Date();
  const y = now.getFullYear();
  const m = `${now.getMonth() + 1}`.padStart(2, "0");
  const d = `${now.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function getVenueAvailabilityLabel(status: Venue["availability"]) {
  switch (status) {
    case "available": return "Свободно";
    case "limited": return "Мало мест";
    case "busy": return "Почти занято";
    default: return "Уточнить";
  }
}

function getStatusLabel(status: Hotspot["status"], kind?: Hotspot["kind"]) {
  if (kind === "table" || kind === "zone") {
    return status === "waitlist" ? "Недоступно" : "Свободно";
  }
  switch (status) {
    case "available": return "Свободно";
    case "waitlist": return "Недоступно";
    default: return "Уточнить";
  }
}

export function TourExplorer({
  venues,
  companyTheme,
  initialVertical = "all",
  initialFilters,
  mode = "home"
}: TourExplorerProps) {
  const router = useRouter();
  const startingFilters = initialFilters ?? {
    q: "",
    vertical: initialVertical,
    type: "all",
    availability: "all",
    time: "all"
  };

  // Filter state
  const [searchDraft, setSearchDraft] = useState(startingFilters.q);
  const [verticalDraft, setVerticalDraft] = useState<"all" | VenueVertical>(startingFilters.vertical);
  const [typeDraft, setTypeDraft] = useState(startingFilters.type);
  const [availabilityDraft, setAvailabilityDraft] = useState(startingFilters.availability);
  const [timeDraft, setTimeDraft] = useState(startingFilters.time);

  // Venue / scene / hotspot state
  const [venueId, setVenueId] = useState(venues[0]?.id ?? "");
  const [sceneId, setSceneId] = useState(venues[0]?.scenes[0]?.id ?? "");
  const [selectedHotspotId, setSelectedHotspotId] = useState<string | null>(null);
  const [isVenueOpen, setIsVenueOpen] = useState(false);
  const [hasOpenedVenue, setHasOpenedVenue] = useState(false);
  const [panelMode, setPanelMode] = useState<"book" | "waitlist" | null>(null);

  // Booking state
  const [toast, setToast] = useState<ToastState>(null);
  const [bookingDate, setBookingDate] = useState(getTodayDateValue);
  const [selectedSlotTime, setSelectedSlotTime] = useState("");
  const [availabilitySlots, setAvailabilitySlots] = useState<BookingSlot[]>([]);
  const [isAvailabilityLoading, setIsAvailabilityLoading] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [isMobileHud, setIsMobileHud] = useState(false);

  // Detect mobile for HUD layout
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1024px)");
    setIsMobileHud(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobileHud(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  // Derived data
  const venueTypes = ["all", ...new Set(venues.map((v) => v.type))];
  const verticalOptions: Array<"all" | VenueVertical> = ["all", ...allVerticalOptions];
  const timeOptions = ["all", ...new Set(venues.flatMap((v) => v.timeTags))];
  const currentVertical = mode === "category" ? initialVertical : startingFilters.vertical;

  const venue = useMemo(
    () => venues.find((v) => v.id === venueId) ?? venues[0] ?? null,
    [venueId, venues]
  );

  const scene = useMemo(
    () => venue?.scenes.find((s) => s.id === sceneId) ?? venue?.scenes[0] ?? null,
    [sceneId, venue]
  );

  const selectedHotspot = useMemo(
    () => scene?.hotspots.find((h) => h.id === selectedHotspotId) ?? null,
    [scene, selectedHotspotId]
  );

  const sceneIndex = scene ? (venue?.scenes.findIndex((s) => s.id === scene.id) ?? 0) : 0;
  const processHint = selectedHotspot ? getProcessHint(selectedHotspot.status) : "";
  const heroVenue = venues[0];
  const availableSlotCount = useMemo(
    () => availabilitySlots.filter((s) => s.status !== "unavailable").length,
    [availabilitySlots]
  );

  // ── Effects ────────────────────────────────────────────────────

  // Sync filters when URL changes
  useEffect(() => {
    setSearchDraft(startingFilters.q);
    setVerticalDraft(mode === "category" ? initialVertical : startingFilters.vertical);
    setTypeDraft(startingFilters.type);
    setAvailabilityDraft(startingFilters.availability);
    setTimeDraft(startingFilters.time);
  }, [
    initialVertical,
    mode,
    startingFilters.availability,
    startingFilters.q,
    startingFilters.time,
    startingFilters.type,
    startingFilters.vertical
  ]);

  // Reset venueId when venue list changes
  useEffect(() => {
    if (!venues.some((v) => v.id === venueId) && venues[0]) {
      setVenueId(venues[0].id);
      setSceneId(venues[0].scenes[0]?.id ?? "");
      setSelectedHotspotId(null);
      setPanelMode(null);
    }
  }, [venueId, venues]);

  // Auto-dismiss toast
  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(id);
  }, [toast]);

  // Reset slot time on date/hotspot change
  useEffect(() => {
    setSelectedSlotTime("");
  }, [bookingDate, selectedHotspotId, venueId]);

  // Availability polling
  useEffect(() => {
    let isCancelled = false;

    async function loadAvailability() {
      if (!venue || !selectedHotspot || panelMode === "waitlist") {
        setAvailabilitySlots([]);
        return;
      }
      setIsAvailabilityLoading(true);
      try {
        const params = new URLSearchParams({
          venueId: venue.id,
          date: bookingDate,
          hotspotLabel: selectedHotspot.heading ?? selectedHotspot.label,
          hotspotStatus: selectedHotspot.status || "",
          hotspotKind: selectedHotspot.kind
        });
        const res = await fetch(buildClientApiUrl(`/api/availability?${params.toString()}`), {
          cache: "no-store"
        });
        const data = (await res.json()) as { data?: BookingSlot[] };
        const slots = data.data || [];
        if (isCancelled) return;
        setAvailabilitySlots(slots);
        const firstAvailable = slots.find((s) => s.status !== "unavailable");
        setSelectedSlotTime((cur) => {
          const stillValid = slots.some((s) => s.time === cur && s.status !== "unavailable");
          return stillValid ? cur : firstAvailable?.time || "";
        });
      } catch {
        if (!isCancelled) setAvailabilitySlots([]);
      } finally {
        if (!isCancelled) setIsAvailabilityLoading(false);
      }
    }

    void loadAvailability();
    const refresh = () => void loadAvailability();
    const id = window.setInterval(refresh, 15000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      isCancelled = true;
      window.clearInterval(id);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [bookingDate, panelMode, selectedHotspot, venue]);

  // Lock body scroll when modal open
  useEffect(() => {
    const prevBody = document.body.style.overflow;
    const prevHtml = document.documentElement.style.overflow;
    if (isVenueOpen) {
      document.body.style.overflow = "hidden";
      document.documentElement.style.overflow = "hidden";
    }
    return () => {
      document.body.style.overflow = prevBody;
      document.documentElement.style.overflow = prevHtml;
    };
  }, [isVenueOpen]);

  // ── Handlers ───────────────────────────────────────────────────

  async function refreshAvailabilitySnapshot() {
    if (!venue || !selectedHotspot || panelMode === "waitlist") {
      setAvailabilitySlots([]);
      return;
    }
    setIsAvailabilityLoading(true);
    try {
      const params = new URLSearchParams({
        venueId: venue.id,
        date: bookingDate,
        hotspotLabel: selectedHotspot.heading ?? selectedHotspot.label,
        hotspotStatus: selectedHotspot.status || "",
        hotspotKind: selectedHotspot.kind
      });
      const res = await fetch(buildClientApiUrl(`/api/availability?${params.toString()}`), {
        cache: "no-store"
      });
      const data = (await res.json()) as { data?: BookingSlot[] };
      setAvailabilitySlots(data.data || []);
    } catch {
      setAvailabilitySlots([]);
    } finally {
      setIsAvailabilityLoading(false);
    }
  }

  function selectVenue(nextVenueId: string) {
    const next = venues.find((v) => v.id === nextVenueId);
    if (!next) return;
    setVenueId(next.id);
    setSceneId(next.scenes[0]?.id ?? "");
    setSelectedHotspotId(null);
    setPanelMode(null);
    setToast(null);
    setIsVenueOpen(true);
    setHasOpenedVenue(true);
  }

  function selectScene(nextSceneId: string) {
    setSceneId(nextSceneId);
    setSelectedHotspotId(null);
    setPanelMode(null);
  }

  function selectHotspot(hotspot: Hotspot) {
    if (hotspot.kind === "scene" && hotspot.target) {
      selectScene(hotspot.target);
      return;
    }
    setSelectedHotspotId(hotspot.id);
    setPanelMode(null);
  }

  function moveScene(direction: number) {
    if (!scene || !venue) return;
    const nextIndex = (sceneIndex + direction + venue.scenes.length) % venue.scenes.length;
    selectScene(venue.scenes[nextIndex].id);
  }

  function submitSearch() {
    const filters: VenueSearchFilters = {
      q: searchDraft.trim(),
      vertical: mode === "category" ? initialVertical : verticalDraft,
      type: typeDraft,
      availability: availabilityDraft,
      time: timeDraft
    };
    startTransition(() => router.push(buildSearchHref(filters)));
  }

  function handleBooking(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const fd = new FormData(form);
    const countryCode = String(fd.get("countryCode") || "+998");
    const phoneLocal = String(fd.get("phoneLocal") || "");
    const telegram = String(fd.get("telegram") || "").trim();

    if (!selectedSlotTime) {
      setToast({ kind: "error", message: "Выбери доступный слот времени." });
      return;
    }

    startTransition(async () => {
      const res = await fetch(buildClientApiUrl("/api/booking-requests"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: String(fd.get("name") || ""),
          phone: buildPhoneNumber(countryCode, phoneLocal),
          telegram,
          date: bookingDate,
          time: selectedSlotTime,
          guests: Number(fd.get("guests") || 1),
          venue: venue!.name,
          hotspotLabel: selectedHotspot?.heading ?? selectedHotspot?.label ?? scene!.title,
          comment: [
            selectedHotspot?.heading ?? selectedHotspot?.label ?? scene!.title,
            selectedSlotTime,
            String(fd.get("comment") || "")
          ]
            .filter(Boolean)
            .join(" | ")
        })
      });
      const payload = (await res.json()) as ProcessPayload;
      setToast({
        kind: res.ok ? "success" : "error",
        message: res.ok
          ? [payload.message, payload.holdLabel, payload.slaLabel].filter(Boolean).join(" • ")
          : payload.message || payload.issues?.join(", ") || "Не удалось отправить заявку."
      });
      if (res.ok) {
        form.reset();
        await refreshAvailabilitySnapshot();
      }
    });
  }

  function handleWaitlist(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const fd = new FormData(form);
    const countryCode = String(fd.get("countryCode") || "+998");
    const phoneLocal = String(fd.get("phoneLocal") || "");
    const telegram = String(fd.get("telegram") || "").trim();

    startTransition(async () => {
      const res = await fetch(buildClientApiUrl("/api/waitlist"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          venueId: venue!.id,
          venueName: venue!.name,
          sceneId: scene!.id,
          sceneTitle: scene!.title,
          hotspotId: selectedHotspot?.id,
          hotspotLabel: selectedHotspot?.heading ?? selectedHotspot?.label,
          name: String(fd.get("name") || ""),
          phone: buildPhoneNumber(countryCode, phoneLocal),
          telegram
        })
      });
      const payload = (await res.json()) as ProcessPayload;
      setToast({
        kind: res.ok ? "info" : "error",
        message: res.ok
          ? [payload.message, payload.slaLabel].filter(Boolean).join(" • ")
          : payload.message || payload.issues?.join(", ") || "Не удалось добавить в лист ожидания."
      });
      if (res.ok) form.reset();
    });
  }

  // ── Render ─────────────────────────────────────────────────────

  return (
    <div className="studio">

      {/* ── TOP NAV ── */}
      <header className="s-nav">
        <div className="s-nav-inner">
          <Link className="s-brand" href="/">
            <span className="s-brand-mark">TS</span>
            <span>
              <span className="s-brand-name">Tudors Studio</span>
              <span className="s-brand-sub">Площадки и пространства</span>
            </span>
          </Link>

          <nav className="s-tabs">
            <Link className={`s-tab ${mode === "home" ? "active" : ""}`} href="/">
              Все
            </Link>
            {allVerticalOptions.slice(0, 4).map((v) => (
              <Link
                className={`s-tab ${currentVertical === v ? "active" : ""}`}
                href={`/categories/${v}`}
                key={v}
              >
                {verticalLabels[v]}
              </Link>
            ))}
          </nav>

          <div className="s-nav-actions">
            <Link className="s-btn-ghost" href="/manager/login">
              Войти
            </Link>
            <Link className="s-btn-gold" href="/manager/login">
              Разместить объект
            </Link>
          </div>
        </div>
      </header>

      {/* ── BREADCRUMBS ── */}
      {mode === "category" ? (
        <div className="s-crumbs">
          <Link className="s-crumb-link" href="/">Все категории</Link>
          <span className="s-crumb-sep">›</span>
          <span className="s-crumb-current">
            {currentVertical === "all" ? "Все объекты" : verticalLabels[currentVertical as VenueVertical]}
          </span>
        </div>
      ) : null}

      {/* ── HERO ── */}
      <section className={`s-hero ${mode !== "home" ? "s-hero-compact" : ""}`}>
        <div
          className="s-hero-bg"
          style={heroVenue?.preview ? { backgroundImage: heroVenue.preview } : undefined}
        />
        <div className="s-hero-overlay" />

        <div className="s-hero-body">
          {mode === "home" ? (
            <div className="s-hero-copy">
              <div className="s-hero-eyebrow">Tudors Studio</div>
              <h1 className="s-hero-title">
                Современный выбор площадок для встреч, отдыха и событий
              </h1>
              <p className="s-hero-sub">
                Сравнивайте места по атмосфере, смотрите 360-тур и оставляйте заявку без лишних шагов.
              </p>
              <ul className="s-hero-highlights">
                {heroHighlights.map((hl) => (
                  <li className="s-hero-hl" key={hl}>{hl}</li>
                ))}
              </ul>
              <a className="s-hero-cta" href="#results-section">
                Смотреть варианты
              </a>
            </div>
          ) : (
            <div className="s-hero-label">
              <div className="s-hero-label-eyebrow">
                {mode === "search" ? "Результаты поиска" : "Категория"}
              </div>
              <h1 className="s-hero-label-title">
                {mode === "search"
                  ? `${venues.length} вариантов по вашему запросу`
                  : verticalLabels[currentVertical as VenueVertical]}
              </h1>
            </div>
          )}

          {/* Search panel */}
          <form
            className="s-search"
            onSubmit={(e) => { e.preventDefault(); submitSearch(); }}
          >
            <div className="s-search-row">
              <div className="s-search-field wide">
                <label className="s-search-label">Где</label>
                <input
                  className="s-search-input"
                  onChange={(e) => setSearchDraft(e.target.value)}
                  placeholder="Ресторан, квартира, вилла, площадка..."
                  type="text"
                  value={searchDraft}
                />
              </div>
              <button className="s-search-submit" type="submit">
                Найти
              </button>
            </div>

            <div className="s-search-row filters-row">
              {mode === "home" ? (
                <div className="s-search-field">
                  <label className="s-search-label">Категория</label>
                  <select
                    className="s-search-select"
                    onChange={(e) => setVerticalDraft(e.target.value as "all" | VenueVertical)}
                    value={verticalDraft}
                  >
                    <option value="all">Все категории</option>
                    {allVerticalOptions.map((v) => (
                      <option key={v} value={v}>{verticalLabels[v]}</option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="s-search-lock">
                  <span className="s-search-lock-label">Категория</span>
                  <strong className="s-search-lock-value">
                    {verticalLabels[currentVertical as VenueVertical]}
                  </strong>
                </div>
              )}
              <div className="s-search-field">
                <label className="s-search-label">Формат</label>
                <select
                  className="s-search-select"
                  onChange={(e) => setTypeDraft(e.target.value)}
                  value={typeDraft}
                >
                  {venueTypes.map((t) => (
                    <option key={t} value={t}>{t === "all" ? "Любой формат" : t}</option>
                  ))}
                </select>
              </div>
              <div className="s-search-field">
                <label className="s-search-label">Статус</label>
                <select
                  className="s-search-select"
                  onChange={(e) => setAvailabilityDraft(e.target.value as VenueSearchFilters["availability"])}
                  value={availabilityDraft}
                >
                  <option value="all">Любая доступность</option>
                  <option value="available">Свободно</option>
                  <option value="busy">Почти занято</option>
                </select>
              </div>
              <div className="s-search-field">
                <label className="s-search-label">Время</label>
                <select
                  className="s-search-select"
                  onChange={(e) => setTimeDraft(e.target.value)}
                  value={timeDraft}
                >
                  {timeOptions.map((t) => (
                    <option key={t} value={t}>{t === "all" ? "Любое время" : t}</option>
                  ))}
                </select>
              </div>
            </div>
          </form>
        </div>
      </section>

      {/* ── RECENT SECTION (home only) ── */}
      {mode === "home" && venues.length > 0 ? (
        <section className="s-section">
          <div className="s-section-head">
            <h2 className="s-section-title">Популярные места</h2>
          </div>
          <div className="s-recent-grid">
            {venues.slice(0, 4).map((v) => (
              <button
                className="s-recent-card"
                key={v.id}
                onClick={() => selectVenue(v.id)}
                type="button"
              >
                <div
                  className="s-recent-thumb"
                  style={v.preview ? { backgroundImage: v.preview } : undefined}
                />
                <div>
                  <span className="s-recent-name">{v.name}</span>
                  <span className="s-recent-city">{v.city}</span>
                </div>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {/* ── FEATURED SECTION ── */}
      {mode === "home" && venues.length > 0 ? (
        <section className="s-section">
          <div className="s-section-head">
            <h2 className="s-section-title">Подбери подходящее место</h2>
            <span className="s-section-meta">
              Найдено: <strong>{venues.length}</strong>
            </span>
          </div>
          <div className="s-feature-grid">
            {venues.slice(0, 3).map((v) => (
              <button
                className="s-feature-card"
                key={v.id}
                onClick={() => selectVenue(v.id)}
                type="button"
              >
                <div
                  className="s-feature-image"
                  style={v.preview ? { backgroundImage: v.preview } : undefined}
                />
                <div className="s-feature-body">
                  <span className="s-feature-name">{v.name}</span>
                  <p className="s-feature-summary">{v.summary}</p>
                  <div className="s-card-facts">
                    <span className="s-card-fact s-card-price">{v.price}</span>
                    <span className={`s-status s-status-${v.availability}`}>
                      {getVenueAvailabilityLabel(v.availability)}
                    </span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {/* ── MAIN RESULTS ── */}
      <section className="s-section" id="results-section">
        <div className="s-section-head">
          <h2 className="s-section-title">
            {mode === "category"
              ? "Все объекты категории"
              : mode === "search"
                ? "Результаты поиска"
                : "Подходящие пространства"}
          </h2>
          <span className="s-section-meta">
            Найдено: <strong>{venues.length}</strong>
          </span>
        </div>

        <div className={`s-results-shell ${mode === "home" ? "home-mode" : ""}`}>
          {/* Filter sidebar for search/category */}
          {mode !== "home" ? (
            <aside className="s-filter-sidebar">
              <div className="s-filter-card">
                <span className="s-filter-title">Фильтры</span>
                <div className="s-filter-field">
                  <label className="s-filter-label">Категория</label>
                  <select
                    className="s-filter-select"
                    onChange={(e) => setVerticalDraft(e.target.value as "all" | VenueVertical)}
                    value={mode === "category" ? currentVertical : verticalDraft}
                  >
                    <option value="all">Все категории</option>
                    {allVerticalOptions.map((v) => (
                      <option key={v} value={v}>{verticalLabels[v]}</option>
                    ))}
                  </select>
                </div>
                <div className="s-filter-field">
                  <label className="s-filter-label">Формат</label>
                  <select
                    className="s-filter-select"
                    onChange={(e) => setTypeDraft(e.target.value)}
                    value={typeDraft}
                  >
                    {venueTypes.map((t) => (
                      <option key={t} value={t}>{t === "all" ? "Любой формат" : t}</option>
                    ))}
                  </select>
                </div>
                <div className="s-filter-field">
                  <label className="s-filter-label">Статус</label>
                  <select
                    className="s-filter-select"
                    onChange={(e) => setAvailabilityDraft(e.target.value as VenueSearchFilters["availability"])}
                    value={availabilityDraft}
                  >
                    <option value="all">Любая доступность</option>
                    <option value="available">Свободно</option>
                    <option value="busy">Почти занято</option>
                  </select>
                </div>
                <div className="s-filter-field">
                  <label className="s-filter-label">Время</label>
                  <select
                    className="s-filter-select"
                    onChange={(e) => setTimeDraft(e.target.value)}
                    value={timeDraft}
                  >
                    {timeOptions.map((t) => (
                      <option key={t} value={t}>{t === "all" ? "Любое время" : t}</option>
                    ))}
                  </select>
                </div>
                <button className="s-filter-submit" onClick={submitSearch} type="button">
                  Обновить поиск
                </button>
              </div>
            </aside>
          ) : null}

          {/* Venue cards */}
          <div className={`s-results-grid ${mode !== "home" ? "list-mode" : ""}`}>
            {venues.length > 0 ? (
              venues.map((v) => (
                <button
                  className={`s-card ${v.id === venue?.id && isVenueOpen ? "active" : ""}`}
                  key={v.id}
                  onClick={() => selectVenue(v.id)}
                  type="button"
                >
                  <div
                    className="s-card-image"
                    style={v.preview ? { backgroundImage: v.preview } : undefined}
                  >
                    <div className="s-card-image-overlay">
                      <span className="s-card-city">{v.city}</span>
                      <span className={`s-status s-status-${v.availability}`}>
                        {getVenueAvailabilityLabel(v.availability)}
                      </span>
                    </div>
                  </div>
                  <div className="s-card-body">
                    <div className="s-card-top">
                      <span className="s-card-chip">{verticalLabels[v.vertical]}</span>
                      <span className="s-card-cta">Смотреть тур →</span>
                    </div>
                    <span className="s-card-name">{v.name}</span>
                    <span className="s-card-type">{v.type}</span>
                    <p className="s-card-summary">{v.summary}</p>
                    <div className="s-card-facts">
                      <span className="s-card-fact">До {v.capacity} гостей</span>
                      <span className="s-card-fact s-card-price">{v.price}</span>
                      <span className="s-card-fact">Бронь: {v.averageBookingLead}</span>
                    </div>
                  </div>
                </button>
              ))
            ) : (
              <div className="s-empty">
                <span className="s-empty-title">Ничего не найдено</span>
                <p className="s-empty-text">
                  Измени параметры поиска, чтобы получить новую подборку.
                </p>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="s-footer">
        <div className="s-footer-inner">
          <div className="s-footer-cols">
            {footerColumns.map((col) => (
              <div key={col.title}>
                <span className="s-footer-col-title">{col.title}</span>
                {col.items.map((item) => (
                  <span className="s-footer-link" key={item}>{item}</span>
                ))}
              </div>
            ))}
          </div>
          <div className="s-footer-bottom">
            <span>© 2026 Tudors Studio</span>
            <span>Русский (RU)</span>
            <span>UZS</span>
          </div>
        </div>
      </footer>

      {/* ── VENUE MODAL ── */}
      {hasOpenedVenue && venue && scene ? (
        <div className={`s-modal ${isVenueOpen ? "open" : ""}`}>
          <div className="s-modal-backdrop" onClick={() => setIsVenueOpen(false)} />
          <div className="s-modal-panel">

            {/* Modal Header */}
            <div className="s-modal-header">
              <div className="s-modal-identity">
                <span className="s-modal-eyebrow">{verticalLabels[venue.vertical]}</span>
                <h2 className="s-modal-name">{venue.name}</h2>
                <span className="s-modal-scene-info">
                  {scene.title}
                  {(scene as { floorPlanLabel?: string }).floorPlanLabel
                    ? ` · ${(scene as { floorPlanLabel?: string }).floorPlanLabel}`
                    : null}
                </span>
              </div>
              <div className="s-modal-controls">
                <button
                  className="s-modal-btn"
                  onClick={() => moveScene(-1)}
                  type="button"
                >
                  ← Назад
                </button>
                <button
                  className="s-modal-btn"
                  onClick={() => moveScene(1)}
                  type="button"
                >
                  Вперёд →
                </button>
                <button
                  className="s-modal-close"
                  onClick={() => setIsVenueOpen(false)}
                  type="button"
                  aria-label="Закрыть"
                >
                  ×
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="s-modal-body">
              <div className="s-panorama-stage">
                <div className="s-panorama-frame">
                  <PanoramaViewer
                    onObjectSelect={selectHotspot}
                    onSceneChange={(nextSceneId) => {
                      if (nextSceneId !== scene.id) selectScene(nextSceneId);
                    }}
                    scene={scene}
                    selectedHotspotId={selectedHotspotId}
                    venue={venue}
                  />

                  {/* Panorama overlay info */}
                  <div className="s-panorama-overlay">
                    <div className="s-panorama-counter">
                      {sceneIndex + 1} / {venue.scenes.length}
                    </div>
                    <p className="s-panorama-desc">{scene.description}</p>
                    <p className="s-panorama-hint">
                      Нажми на точку в сцене, чтобы открыть бронирование
                    </p>
                  </div>

                  {/* HUD backdrop */}
                  {selectedHotspot ? (
                    <div
                      className="s-hud-backdrop"
                      style={{ position: "fixed", inset: 0, zIndex: 208 } as CSSProperties}
                      onClick={() => {
                        setSelectedHotspotId(null);
                        setPanelMode(null);
                      }}
                    />
                  ) : null}

                  {/* HUD Panel */}
                  {selectedHotspot ? (
                    <div
                      className="s-hud"
                      style={isMobileHud ? {
                        position: "fixed",
                        right: 0,
                        left: 0,
                        bottom: 0,
                        top: "auto",
                        width: "100%",
                        transform: "none",
                        borderRadius: 0,
                        maxHeight: "72vh",
                        zIndex: 210
                      } as CSSProperties : {
                        position: "fixed",
                        right: 0,
                        left: "auto",
                        top: 60,
                        bottom: 0,
                        width: 360,
                        maxHeight: "none",
                        transform: "none",
                        zIndex: 210
                      } as CSSProperties}
                    >
                      <div className="s-hud-header">
                        <div>
                          <div className="s-hud-eyebrow">Выбрано</div>
                          <h3 className="s-hud-title">
                            {selectedHotspot.heading ?? selectedHotspot.label}
                          </h3>
                        </div>
                        <button
                          className="s-hud-close"
                          onClick={() => {
                            setSelectedHotspotId(null);
                            setPanelMode(null);
                          }}
                          type="button"
                        >
                          ×
                        </button>
                      </div>

                      <div className="s-hud-meta">
                        {selectedHotspot.status ? (
                          <span className={`s-status s-status-${getBookingPointStatus(selectedHotspot.status)}`}>
                            {getStatusLabel(selectedHotspot.status, selectedHotspot.kind)}
                          </span>
                        ) : null}
                        {selectedHotspot.capacity ? (
                          <span className="s-card-fact">{selectedHotspot.capacity}</span>
                        ) : null}
                        {selectedHotspot.deposit ? (
                          <span className="s-card-fact">{selectedHotspot.deposit}</span>
                        ) : null}
                        {selectedHotspot.minSpend ? (
                          <span className="s-card-fact">{selectedHotspot.minSpend}</span>
                        ) : null}
                      </div>

                      {processHint ? (
                        <div className="s-hud-hint">{processHint}</div>
                      ) : null}

                      <div className="s-hud-tabs">
                        <button
                          className={`s-hud-tab ${panelMode !== "waitlist" ? "active" : ""}`}
                          onClick={() => setPanelMode("book")}
                          type="button"
                        >
                          Забронировать
                        </button>
                        <button
                          className={`s-hud-tab ${panelMode === "waitlist" ? "active" : ""}`}
                          onClick={() => setPanelMode("waitlist")}
                          type="button"
                        >
                          Лист ожидания
                        </button>
                      </div>

                      <div className="s-hud-form">
                        {panelMode === "waitlist" ? (
                          <form className="s-form" onSubmit={handleWaitlist}>
                            <div className="s-form-grid">
                              <input
                                className="s-form-input"
                                name="name"
                                placeholder="Имя"
                                required
                                type="text"
                              />
                              <div className="s-form-phone-row">
                                <select
                                  className="s-form-phone-code"
                                  defaultValue="+998"
                                  name="countryCode"
                                >
                                  {phoneCountryCodes.map((code) => (
                                    <option key={code} value={code}>{code}</option>
                                  ))}
                                </select>
                                <input
                                  className="s-form-input"
                                  inputMode="numeric"
                                  maxLength={9}
                                  name="phoneLocal"
                                  onInput={(e) => {
                                    e.currentTarget.value = formatPhoneLocal(e.currentTarget.value);
                                  }}
                                  pattern="[0-9]{7,9}"
                                  placeholder="Телефон"
                                  required
                                  style={{ flex: 1 }}
                                  type="tel"
                                />
                              </div>
                              <input
                                className="s-form-input"
                                name="telegram"
                                placeholder="@telegram (опционально)"
                                type="text"
                              />
                            </div>
                            <button
                              className="s-form-submit"
                              disabled={isPending}
                              type="submit"
                            >
                              {isPending ? "Отправка..." : "Встать в лист ожидания"}
                            </button>
                          </form>
                        ) : (
                          <form className="s-form" onSubmit={handleBooking}>
                            <div className="s-form-grid">
                              <input
                                className="s-form-input"
                                name="name"
                                placeholder="Имя"
                                required
                                type="text"
                              />
                              <div className="s-form-phone-row">
                                <select
                                  className="s-form-phone-code"
                                  defaultValue="+998"
                                  name="countryCode"
                                >
                                  {phoneCountryCodes.map((code) => (
                                    <option key={code} value={code}>{code}</option>
                                  ))}
                                </select>
                                <input
                                  className="s-form-input"
                                  inputMode="numeric"
                                  maxLength={9}
                                  name="phoneLocal"
                                  onInput={(e) => {
                                    e.currentTarget.value = formatPhoneLocal(e.currentTarget.value);
                                  }}
                                  pattern="[0-9]{7,9}"
                                  placeholder="Телефон"
                                  required
                                  style={{ flex: 1 }}
                                  type="tel"
                                />
                              </div>
                              <input
                                className="s-form-input"
                                name="telegram"
                                placeholder="@telegram (опционально)"
                                type="text"
                              />
                              <input
                                className="s-form-input"
                                min={getTodayDateValue()}
                                name="date"
                                onChange={(e) => setBookingDate(e.target.value)}
                                required
                                type="date"
                                value={bookingDate}
                              />
                              <input
                                className="s-form-input"
                                max="5000"
                                min="1"
                                name="guests"
                                placeholder="Кол-во гостей"
                                required
                                type="number"
                              />
                            </div>

                            {/* Slot picker */}
                            <div className="s-slot-picker">
                              <div className="s-slot-head">
                                <span className="s-slot-head-title">Доступные слоты</span>
                                <span className="s-slot-head-count">
                                  {isAvailabilityLoading
                                    ? "Загружаем..."
                                    : availableSlotCount > 0
                                      ? `${availableSlotCount} свободно`
                                      : "Нет свободных"}
                                </span>
                              </div>
                              <div className="s-slot-grid">
                                {availabilitySlots.length > 0 ? (
                                  availabilitySlots.map((slot) => (
                                    <button
                                      className={`s-slot ${slot.status} ${selectedSlotTime === slot.time ? "selected" : ""}`}
                                      disabled={slot.status === "unavailable"}
                                      key={slot.time}
                                      onClick={() => setSelectedSlotTime(slot.time)}
                                      type="button"
                                    >
                                      <span className="s-slot-time">{slot.label}</span>
                                      <span className="s-slot-label">
                                        {getSlotStatusText(slot)}
                                      </span>
                                    </button>
                                  ))
                                ) : (
                                  <span className="s-slot-empty">
                                    Слоты не найдены для этой даты
                                  </span>
                                )}
                              </div>
                            </div>

                            <button
                              className="s-form-submit"
                              disabled={isPending}
                              type="submit"
                            >
                              {isPending ? "Отправка..." : "Отправить заявку"}
                            </button>
                          </form>
                        )}
                      </div>
                    </div>
                  ) : null}
                </div>

                {/* Scene strip */}
                <div className="s-scene-strip">
                  {venue.scenes.map((s) => (
                    <button
                      className={`s-scene-chip ${s.id === scene.id ? "active" : ""}`}
                      key={s.id}
                      onClick={() => selectScene(s.id)}
                      type="button"
                    >
                      <span className="s-scene-chip-name">{s.title}</span>
                      {(s as { floorPlanLabel?: string }).floorPlanLabel ? (
                        <span className="s-scene-chip-floor">
                          {(s as { floorPlanLabel?: string }).floorPlanLabel}
                        </span>
                      ) : null}
                    </button>
                  ))}
                </div>
              </div>
            </div>

          </div>
        </div>
      ) : null}

      {/* ── TOAST ── */}
      {toast ? (
        <div className={`s-toast ${toast.kind}`}>{toast.message}</div>
      ) : null}

    </div>
  );
}
