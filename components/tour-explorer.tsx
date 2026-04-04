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

const publicNavLinks = [
  { href: "/", label: "Места" },
  { href: "/search?vertical=restaurant&type=all&availability=all&time=all&q=", label: "Подборки" }
] as const;

const phoneCountryCodes = ["+998", "+7", "+996", "+994", "+90"];

function formatPhoneLocal(value: string) {
  return value.replace(/\D/g, "").slice(0, 9);
}

function buildPhoneNumber(countryCode: string, phoneLocal: string) {
  const normalizedLocal = formatPhoneLocal(phoneLocal);
  return `${countryCode} ${normalizedLocal}`.trim();
}

function getSlotStatusText(slot: BookingSlot, hotspotKind?: Hotspot["kind"]) {
  if (slot.status === "unavailable") {
    if (slot.unavailableReason === "past") {
      return "Время прошло";
    }

    if (slot.unavailableReason === "occupied") {
      return "Уже занято";
    }

    return "Недоступно";
  }

  if (hotspotKind === "table" || hotspotKind === "zone") {
    return "Свободно";
  }

  return "Свободно";
}

function getBookingPointStatus(status?: Hotspot["status"]) {
  return status === "waitlist" ? "unavailable" : "available";
}

function getTodayDateValue() {
  const now = new Date();
  const year = now.getFullYear();
  const month = `${now.getMonth() + 1}`.padStart(2, "0");
  const day = `${now.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
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
  const [searchDraft, setSearchDraft] = useState(startingFilters.q);
  const [verticalDraft, setVerticalDraft] = useState<"all" | VenueVertical>(startingFilters.vertical);
  const [typeDraft, setTypeDraft] = useState(startingFilters.type);
  const [availabilityDraft, setAvailabilityDraft] = useState(startingFilters.availability);
  const [timeDraft, setTimeDraft] = useState(startingFilters.time);
  const [venueId, setVenueId] = useState(venues[0]?.id ?? "");
  const [sceneId, setSceneId] = useState(venues[0]?.scenes[0]?.id ?? "");
  const [selectedHotspotId, setSelectedHotspotId] = useState<string | null>(null);
  const [isVenueOpen, setIsVenueOpen] = useState(false);
  const [hasOpenedVenue, setHasOpenedVenue] = useState(false);
  const [panelMode, setPanelMode] = useState<"book" | "waitlist" | null>(null);
  const [toast, setToast] = useState<ToastState>(null);
  const [bookingDate, setBookingDate] = useState(getTodayDateValue);
  const [selectedSlotTime, setSelectedSlotTime] = useState("");
  const [availabilitySlots, setAvailabilitySlots] = useState<BookingSlot[]>([]);
  const [isAvailabilityLoading, setIsAvailabilityLoading] = useState(false);
  const availableSlotCount = useMemo(
    () => availabilitySlots.filter((slot) => slot.status !== "unavailable").length,
    [availabilitySlots]
  );
  const [isPending, startTransition] = useTransition();

  const venueTypes = ["all", ...new Set(venues.map((item) => item.type))];
  const verticalOptions: Array<"all" | VenueVertical> = ["all", ...allVerticalOptions];
  const timeOptions = ["all", ...new Set(venues.flatMap((item) => item.timeTags))];
  const currentVertical = mode === "category" ? initialVertical : startingFilters.vertical;

  const venue = useMemo(() => {
    return venues.find((item) => item.id === venueId) ?? venues[0] ?? null;
  }, [venueId, venues]);

  const scene = useMemo(() => {
    return venue?.scenes.find((item) => item.id === sceneId) ?? venue?.scenes[0] ?? null;
  }, [sceneId, venue]);

  const selectedHotspot = useMemo(() => {
    return scene?.hotspots.find((item) => item.id === selectedHotspotId) ?? null;
  }, [scene, selectedHotspotId]);

  const sceneIndex = scene ? venue?.scenes.findIndex((item) => item.id === scene.id) ?? 0 : 0;
  const processHint = selectedHotspot ? getProcessHint(selectedHotspot.status) : "";
  const destinationVenues = venues.slice(0, 6);
  const featuredCategoryVenues = venues.slice(0, 3);
  const heroVenue = venues[0];
  const recentVenues = venues.slice(0, 4);
  const categoryCards = verticalOptions
    .filter((option) => option !== "all")
    .map((option) => {
      const items = option === currentVertical ? venues : venues.filter((item) => item.vertical === option);
      return {
        vertical: option,
        label: verticalLabels[option],
        count: items.length,
        preview: items[0]?.preview ?? heroVenue?.preview
      };
    });

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

      const response = await fetch(buildClientApiUrl(`/api/availability?${params.toString()}`), {
        cache: "no-store"
      });
      const payload = (await response.json()) as { data?: BookingSlot[] };
      const slots = payload.data || [];

      setAvailabilitySlots(slots);
      const firstAvailable = slots.find((slot) => slot.status !== "unavailable");
      setSelectedSlotTime((current) => {
        const currentStillExists = slots.some(
          (slot) => slot.time === current && slot.status !== "unavailable"
        );

        if (currentStillExists) {
          return current;
        }

        return firstAvailable?.time || "";
      });
    } catch {
      setAvailabilitySlots([]);
    } finally {
      setIsAvailabilityLoading(false);
    }
  }

  useEffect(() => {
    if (!venues.some((item) => item.id === venueId) && venues[0]) {
      setVenueId(venues[0].id);
      setSceneId(venues[0].scenes[0]?.id ?? "");
      setSelectedHotspotId(null);
      setPanelMode(null);
    }
  }, [venueId, venues]);

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

  useEffect(() => {
    if (!toast) {
      return;
    }

    const timeoutId = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(timeoutId);
  }, [toast]);

  useEffect(() => {
    setSelectedSlotTime("");
  }, [bookingDate, selectedHotspotId, venueId]);

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

        const response = await fetch(buildClientApiUrl(`/api/availability?${params.toString()}`), {
          cache: "no-store"
        });
        const payload = (await response.json()) as { data?: BookingSlot[] };
        const slots = payload.data || [];

        if (isCancelled) {
          return;
        }

        setAvailabilitySlots(slots);
        const firstAvailable = slots.find((slot) => slot.status !== "unavailable");
        setSelectedSlotTime((current) => {
          const currentStillExists = slots.some(
            (slot) => slot.time === current && slot.status !== "unavailable"
          );

          if (currentStillExists) {
            return current;
          }

          return firstAvailable?.time || "";
        });
      } catch {
        if (!isCancelled) {
          setAvailabilitySlots([]);
        }
      } finally {
        if (!isCancelled) {
          setIsAvailabilityLoading(false);
        }
      }
    }

    void loadAvailability();

    const refreshAvailability = () => {
      void loadAvailability();
    };

    const intervalId = window.setInterval(refreshAvailability, 15000);
    window.addEventListener("focus", refreshAvailability);
    document.addEventListener("visibilitychange", refreshAvailability);

    return () => {
      isCancelled = true;
      window.clearInterval(intervalId);
      window.removeEventListener("focus", refreshAvailability);
      document.removeEventListener("visibilitychange", refreshAvailability);
    };
  }, [bookingDate, panelMode, selectedHotspot, venue]);

  useEffect(() => {
    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;

    if (isVenueOpen) {
      document.body.style.overflow = "hidden";
      document.documentElement.style.overflow = "hidden";
    }

    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
    };
  }, [isVenueOpen]);

  function getStatusLabel(status: Hotspot["status"], kind?: Hotspot["kind"]) {
    if (kind === "table" || kind === "zone") {
      return status === "waitlist" ? "Недоступно" : "Свободно";
    }

    switch (status) {
      case "available":
        return "Свободно";
      case "waitlist":
        return "Недоступно";
      default:
        return "Уточнить";
    }
  }

  function getVenueAvailabilityLabel(status: Venue["availability"]) {
    switch (status) {
      case "available":
        return "Свободно";
      case "limited":
        return "Мало мест";
      case "busy":
        return "Почти занято";
      default:
        return "Уточнить";
    }
  }

  function selectVenue(nextVenueId: string) {
    const nextVenue = venues.find((item) => item.id === nextVenueId);
    if (!nextVenue) {
      return;
    }

    setVenueId(nextVenue.id);
    setSceneId(nextVenue.scenes[0]?.id ?? "");
    setSelectedHotspotId(null);
    setPanelMode(null);
    setToast(null);
    setIsVenueOpen(true);
    setHasOpenedVenue(true);
  }

  function selectScene(nextSceneId: string) {
    if (!scene) {
      return;
    }

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
    if (!scene || !venue) {
      return;
    }

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

    startTransition(() => {
      router.push(buildSearchHref(filters));
    });
  }

  function handleBooking(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const countryCode = String(formData.get("countryCode") || "+998");
    const phoneLocal = String(formData.get("phoneLocal") || "");
    const telegram = String(formData.get("telegram") || "").trim();

    if (!selectedSlotTime) {
      setToast({
        kind: "error",
        message: "Выбери доступный слот времени."
      });
      return;
    }

    startTransition(async () => {
      const response = await fetch(buildClientApiUrl("/api/booking-requests"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          name: String(formData.get("name") || ""),
          phone: buildPhoneNumber(countryCode, phoneLocal),
          telegram,
          date: bookingDate,
          time: selectedSlotTime,
          guests: Number(formData.get("guests") || 1),
          venue: venue.name,
          hotspotLabel: selectedHotspot?.heading ?? selectedHotspot?.label ?? scene.title,
          comment: [
            selectedHotspot?.heading ?? selectedHotspot?.label ?? scene.title,
            selectedSlotTime,
            String(formData.get("comment") || "")
          ]
            .filter(Boolean)
            .join(" | ")
        })
      });

      const payload = (await response.json()) as ProcessPayload;
      setToast({
        kind: response.ok ? "success" : "error",
        message: response.ok
          ? [payload.message, payload.holdLabel, payload.slaLabel].filter(Boolean).join(" • ")
          : payload.message || payload.issues?.join(", ") || "Не удалось отправить заявку."
      });

      if (response.ok) {
        form.reset();
        await refreshAvailabilitySnapshot();
      }
    });
  }

  function handleWaitlist(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const countryCode = String(formData.get("countryCode") || "+998");
    const phoneLocal = String(formData.get("phoneLocal") || "");
    const telegram = String(formData.get("telegram") || "").trim();

    startTransition(async () => {
      const response = await fetch(buildClientApiUrl("/api/waitlist"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          venueId: venue.id,
          venueName: venue.name,
          sceneId: scene.id,
          sceneTitle: scene.title,
          hotspotId: selectedHotspot?.id,
          hotspotLabel: selectedHotspot?.heading ?? selectedHotspot?.label,
          name: String(formData.get("name") || ""),
          phone: buildPhoneNumber(countryCode, phoneLocal),
          telegram
        })
      });

      const payload = (await response.json()) as ProcessPayload;
      setToast({
        kind: response.ok ? "info" : "error",
        message: response.ok
          ? [payload.message, payload.slaLabel].filter(Boolean).join(" • ")
          : payload.message || payload.issues?.join(", ") || "Не удалось добавить в лист ожидания."
      });

      if (response.ok) {
        form.reset();
      }
    });
  }

  const themeStyle = {
    "--accent": "#a10f37",
    "--accent-dark": "#18284a",
    "--surface-brand": "#fbf6f7",
    "--surface": "#ffffff",
    "--surface-strong": "#ffffff",
    "--line": "rgba(24, 40, 74, 0.12)",
    "--text": "#18284a",
    "--muted": "#6c6d79",
    "--shadow": "0 18px 48px rgba(24, 40, 74, 0.08)"
  } as CSSProperties;

  return (
    <section className="immersive-shell discover-shell golobe-shell" style={themeStyle}>
      <div className="discover-topbar golobe-topbar">
        <nav className="golobe-service-nav">
          {publicNavLinks.map((item) => (
            <Link className="golobe-service-link" href={item.href} key={item.href}>
              {item.label}
            </Link>
          ))}
        </nav>
        <TudorsStudioLogo className="discover-brand-lockup golobe-brand-lockup" variant="header" />
        <nav className="discover-nav-tabs golobe-category-tabs">
          <Link className={`discover-nav-tab ${mode === "home" ? "active" : ""}`} href="/">
            Все
          </Link>
          {categoryCards.slice(0, 4).map((item) => (
            <Link
              className={`discover-nav-tab ${currentVertical === item.vertical ? "active" : ""}`}
              href={`/categories/${item.vertical}`}
              key={item.vertical}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="discover-topbar-actions golobe-topbar-actions">
          <Link className="manager-link discover-manager-link" href="/manager/login">
            Вход для менеджера
          </Link>
        </div>
      </div>

      {mode === "category" ? (
        <div className="category-crumbs">
          <Link className="toolbar-button" href="/">
            Все категории
          </Link>
          <span className="category-crumb-current">
            {currentVertical === "all" ? "Все объекты" : verticalLabels[currentVertical]}
          </span>
        </div>
      ) : null}

      <section className={`discover-hero golobe-hero ${mode === "category" ? "discover-hero-compact" : ""}`} style={{ backgroundImage: heroVenue?.preview }}>
        <div className="discover-hero-overlay" />
        <div className="discover-hero-content golobe-hero-content">
          {mode === "home" ? (
            <div className="golobe-hero-copy">
              <span className="card-label">Tudors Studio</span>
              <h1>Найди место для встречи, отдыха или события</h1>
              <p>Выбирай объект, смотри 360-тур и отправляй бронь внутри сцены.</p>
            </div>
          ) : (
            <div className="discover-hero-label golobe-hero-label">
              <span className="card-label">{mode === "search" ? "Результаты" : "Категория"}</span>
              <strong>
                {mode === "search"
                  ? `${venues.length} вариантов по вашему запросу`
                  : verticalLabels[currentVertical as VenueVertical]}
              </strong>
            </div>
          )}
        </div>

        <form
          className="discover-search-panel golobe-search-panel"
          onSubmit={(event) => {
            event.preventDefault();
            submitSearch();
          }}
        >
          <div className="discover-search-row discover-search-row-main golobe-search-main">
            <label className="discover-search-field discover-search-field-wide">
              <span>Где</span>
              <input
                className="search-input"
                onChange={(event) => setSearchDraft(event.target.value)}
                placeholder="Ресторан, квартира, вилла, площадка или коммерция"
                type="text"
                value={searchDraft}
              />
            </label>
            <button className="primary-button" type="submit">
              Найти
            </button>
          </div>

          <div className="discover-search-row discover-search-row-filters golobe-search-filters">
            {mode === "home" ? (
              <label className="discover-search-field">
                <span>Категория</span>
                <select
                  className="compact-select"
                  onChange={(event) => setVerticalDraft(event.target.value as "all" | VenueVertical)}
                  value={verticalDraft}
                >
                  <option value="all">Все категории</option>
                  {verticalOptions
                    .filter((option) => option !== "all")
                    .map((option) => (
                      <option key={option} value={option}>
                        {verticalLabels[option]}
                      </option>
                    ))}
                </select>
              </label>
            ) : (
              <div className="category-filter-lock">
                <span>Категория</span>
                <strong>{verticalLabels[currentVertical as VenueVertical]}</strong>
              </div>
            )}
              <label className="discover-search-field">
              <span>Формат</span>
              <select className="compact-select" onChange={(event) => setTypeDraft(event.target.value)} value={typeDraft}>
                {venueTypes.map((type) => (
                  <option key={type} value={type}>
                    {type === "all" ? "Любой формат" : type}
                  </option>
                ))}
              </select>
            </label>
            <label className="discover-search-field">
              <span>Статус</span>
              <select
                className="compact-select"
                onChange={(event) => setAvailabilityDraft(event.target.value as VenueSearchFilters["availability"])}
                value={availabilityDraft}
              >
                <option value="all">Любая доступность</option>
                <option value="available">Свободно</option>
                <option value="busy">Почти занято</option>
              </select>
            </label>
            <label className="discover-search-field">
              <span>Время</span>
              <select className="compact-select" onChange={(event) => setTimeDraft(event.target.value)} value={timeDraft}>
                {timeOptions.map((option) => (
                  <option key={option} value={option}>
                    {option === "all" ? "Любое время" : option}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </form>
      </section>

      {mode === "home" ? (
        <section className="discover-section golobe-recent-section">
          <div className="discover-section-head">
            <h2>Недавние просмотры</h2>
          </div>
          <div className="golobe-recent-grid">
            {recentVenues.map((item) => (
              <button className="golobe-recent-card" key={item.id} onClick={() => selectVenue(item.id)} type="button">
                <div className="golobe-recent-thumb" style={{ backgroundImage: item.preview }} />
                <div>
                  <strong>{item.name}</strong>
                  <span>{item.city}</span>
                </div>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {mode === "home" ? (
        <section className="discover-section golobe-plan-section">
          <div className="discover-section-head">
            <h2>{currentVertical === "all" ? "Подбери подходящее место" : verticalLabels[currentVertical]}</h2>
            <div className="search-results-meta">
              Найдено: <strong>{venues.length}</strong>
            </div>
          </div>
          <div className="discover-feature-grid golobe-feature-grid">
            {destinationVenues.map((item) => (
              <button className="discover-feature-card" key={item.id} onClick={() => selectVenue(item.id)} type="button">
                <div className="discover-feature-image" style={{ backgroundImage: item.preview }} />
                <div className="discover-feature-copy">
                  <strong>{item.name}</strong>
                  <p>{item.summary}</p>
                  <div className="facts">
                    <span className="fact">{item.price}</span>
                    <span className="fact">{getVenueAvailabilityLabel(item.availability)}</span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </section>
      ) : (
        <section className="discover-section golobe-plan-section">
          <div className="discover-section-head">
            <h2>Лучшие варианты</h2>
            <div className="search-results-meta">
              Найдено: <strong>{venues.length}</strong>
            </div>
          </div>
          <div className="discover-featured-grid golobe-featured-grid">
            {featuredCategoryVenues.map((item) => (
              <button className="discover-featured-card" key={item.id} onClick={() => selectVenue(item.id)} type="button">
                <div className="discover-featured-image" style={{ backgroundImage: item.preview }} />
                <div className="discover-featured-copy">
                  <strong>{item.name}</strong>
                  <span>{item.city}</span>
                  <div className="facts">
                    <span className="fact">{item.price}</span>
                    <span className="fact">{item.type}</span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="discover-section golobe-results-section" id="results-section">
        <div className="discover-section-head">
          <h2>
            {mode === "category"
              ? "Все объекты категории"
              : mode === "search"
                ? "Результаты поиска"
                : "Подходящие пространства"}
          </h2>
        </div>
        <div className={`golobe-results-shell ${mode === "home" ? "home-mode" : ""}`}>
          {mode !== "home" ? (
            <aside className="golobe-filter-panel">
              <div className="golobe-filter-card">
                <strong>Filters</strong>
                <label className="discover-search-field">
                  <span>Категория</span>
                  <select
                    className="compact-select"
                    onChange={(event) => setVerticalDraft(event.target.value as "all" | VenueVertical)}
                    value={mode === "category" ? currentVertical : verticalDraft}
                  >
                    <option value="all">Все категории</option>
                    {verticalOptions
                      .filter((option) => option !== "all")
                      .map((option) => (
                        <option key={option} value={option}>
                          {verticalLabels[option]}
                        </option>
                      ))}
                  </select>
                </label>
                <label className="discover-search-field">
                  <span>Формат</span>
                  <select className="compact-select" onChange={(event) => setTypeDraft(event.target.value)} value={typeDraft}>
                    {venueTypes.map((type) => (
                      <option key={type} value={type}>
                        {type === "all" ? "Любой формат" : type}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="discover-search-field">
                  <span>Статус</span>
                  <select
                    className="compact-select"
                    onChange={(event) => setAvailabilityDraft(event.target.value as VenueSearchFilters["availability"])}
                    value={availabilityDraft}
                  >
                    <option value="all">Любая доступность</option>
                    <option value="available">Свободно</option>
                    <option value="busy">Почти занято</option>
                  </select>
                </label>
                <label className="discover-search-field">
                  <span>Время</span>
                  <select className="compact-select" onChange={(event) => setTimeDraft(event.target.value)} value={timeDraft}>
                    {timeOptions.map((option) => (
                      <option key={option} value={option}>
                        {option === "all" ? "Любое время" : option}
                      </option>
                    ))}
                  </select>
                </label>
                <button className="primary-button" onClick={submitSearch} type="button">
                  Обновить поиск
                </button>
              </div>
            </aside>
          ) : null}
          <div className={`search-results-grid discover-results-grid golobe-results-list ${mode !== "home" ? "list-mode" : ""}`}>
            {venues.length > 0 ? (
              venues.map((item) => (
                <button
                  className={`search-result-card discover-result-card golobe-result-card ${item.id === venue?.id && isVenueOpen ? "active" : ""}`}
                  key={item.id}
                  onClick={() => selectVenue(item.id)}
                  type="button"
                >
                  <div className="search-result-preview discover-result-preview golobe-result-preview" style={{ backgroundImage: item.preview }}>
                    <div className="search-result-preview-overlay">
                      <span className="preview-city">{item.city}</span>
                      <span className={`status-badge status-${item.availability}`}>
                        {getVenueAvailabilityLabel(item.availability)}
                      </span>
                    </div>
                  </div>
                  <div className="search-result-content golobe-result-content">
                    <div className="search-result-head">
                      <div>
                        <div className="result-topline">
                          <span className="result-vertical-chip">{verticalLabels[item.vertical]}</span>
                        </div>
                        <strong>{item.name}</strong>
                        <span className="result-subtitle">{item.type}</span>
                      </div>
                      <span className="open-tour-link">Открыть</span>
                    </div>
                    <p>{item.summary}</p>
                    <div className="facts">
                      <span className="fact">До {item.capacity} гостей</span>
                      <span className="fact">{item.price}</span>
                      <span className="fact">Бронь: {item.averageBookingLead}</span>
                    </div>
                    {mode !== "home" ? (
                      <div className="golobe-result-actions">
                        <span className="golobe-price-note">от</span>
                        <strong>{item.price}</strong>
                      </div>
                    ) : null}
                  </div>
                </button>
              ))
            ) : (
              <div className="search-empty-state">
                <strong>Ничего не найдено</strong>
                <p>Измени параметры и нажми `Найти`, чтобы получить новую подборку.</p>
              </div>
            )}
          </div>
        </div>
      </section>

      <footer className="discover-footer golobe-footer">
        <div className="discover-footer-grid">
          {footerColumns.map((column) => (
            <div className="discover-footer-column" key={column.title}>
              <strong>{column.title}</strong>
              {column.items.map((item) => (
                <span key={item}>{item}</span>
              ))}
            </div>
          ))}
        </div>
        <div className="discover-footer-bottom">
          <span>© 2026 Tudors Studio</span>
          <span>Русский (RU)</span>
          <span>UZS</span>
        </div>
      </footer>

      {hasOpenedVenue && venue && scene ? (
        <div className={`venue-view-shell ${isVenueOpen ? "open" : "closed"}`}>
          <div className="venue-view-backdrop" onClick={() => setIsVenueOpen(false)} />
          <div className="venue-view-panel">
            <div className="venue-view-header">
              <div className="stage-copy">
                <span className="card-label">{verticalLabels[venue.vertical]}</span>
                <h1>{venue.name}</h1>
                <p>
                  {scene.title} · {scene.floorPlanLabel}
                </p>
              </div>
              <div className="stage-actions">
                <button className="toolbar-button" onClick={() => moveScene(-1)} type="button">
                  Назад
                </button>
                <button className="toolbar-button" onClick={() => moveScene(1)} type="button">
                  Вперед
                </button>
                <button className="toolbar-button" onClick={() => setIsVenueOpen(false)} type="button">
                  Закрыть
                </button>
              </div>
            </div>

            <div className="venue-view-layout">
              <div className="panorama-stage venue-view-stage">
                <div className="panorama-frame immersive-frame venue-open-frame">
                  <PanoramaViewer
                    onObjectSelect={selectHotspot}
                    onSceneChange={(nextSceneId) => {
                      if (nextSceneId !== scene.id) {
                        selectScene(nextSceneId);
                      }
                    }}
                    scene={scene}
                    selectedHotspotId={selectedHotspotId}
                    venue={venue}
                  />
                  <div className="viewer-overlay viewer-overlay-prod">
                    <div className="viewer-chip">{sceneIndex + 1} / {venue.scenes.length}</div>
                    <div className="viewer-overlay-copy">
                      <p>{scene.description}</p>
                      <span>Выбери точку в сцене и оформи бронь или аренду в этом же окне</span>
                    </div>
                  </div>
                  {selectedHotspot ? (
                    <>
                      <div
                        className="scene-hud-backdrop"
                        onClick={() => {
                          setSelectedHotspotId(null);
                          setPanelMode(null);
                        }}
                      />
                      <div className="scene-hud-minimal">
                        <div className="scene-hud-header">
                          <div className="scene-hud-focus">
                            <span className="card-label">Выбрано</span>
                            <h3>{selectedHotspot.heading ?? selectedHotspot.label}</h3>
                          </div>
                          <button
                            className="hud-close-button"
                            onClick={() => {
                              setSelectedHotspotId(null);
                              setPanelMode(null);
                            }}
                            type="button"
                          >
                            ×
                          </button>
                        </div>

                        <div className="scene-hud-summary">
                          <div className="facts">
                          {selectedHotspot.status ? (
                            <span className={`status-badge status-${getBookingPointStatus(selectedHotspot.status)}`}>
                              {getStatusLabel(selectedHotspot.status, selectedHotspot.kind)}
                            </span>
                          ) : null}
                            {selectedHotspot.capacity ? <span className="fact">{selectedHotspot.capacity}</span> : null}
                            {selectedHotspot.deposit ? <span className="fact">{selectedHotspot.deposit}</span> : null}
                            {selectedHotspot.minSpend ? <span className="fact">{selectedHotspot.minSpend}</span> : null}
                          </div>
                        </div>

                        <div className="process-inline-note">{processHint}</div>

                        <div className="scene-hud-actions">
                          <button
                            className={`hud-mode-button ${panelMode !== "waitlist" ? "active" : ""}`}
                            onClick={() => setPanelMode("book")}
                            type="button"
                          >
                            Забронировать
                          </button>
                          <button
                            className={`hud-mode-button ${panelMode === "waitlist" ? "active" : ""}`}
                            onClick={() => setPanelMode("waitlist")}
                            type="button"
                          >
                            Лист ожидания
                          </button>
                        </div>

                        <div className="scene-hud-form">
                          {panelMode === "waitlist" ? (
                          <form className="inline-form booking-inline-form compact-form" onSubmit={handleWaitlist}>
                            <div className="booking-grid compact-booking-grid">
                              <input name="name" placeholder="Имя" required type="text" />
                              <div className="phone-field-row">
                                <select className="compact-select phone-country-select" defaultValue="+998" name="countryCode">
                                  {phoneCountryCodes.map((code) => (
                                    <option key={code} value={code}>
                                      {code}
                                    </option>
                                  ))}
                                </select>
                                <input
                                  inputMode="numeric"
                                  maxLength={9}
                                  name="phoneLocal"
                                  onInput={(event) => {
                                    event.currentTarget.value = formatPhoneLocal(event.currentTarget.value);
                                  }}
                                  pattern="[0-9]{7,9}"
                                  placeholder="Телефон"
                                  required
                                  type="tel"
                                />
                              </div>
                              <input name="telegram" placeholder="@telegram (опционально)" type="text" />
                            </div>
                            <button className="primary-button wide-button waitlist-submit-button" disabled={isPending} type="submit">
                              {isPending ? "Отправка..." : "Встать в лист ожидания"}
                            </button>
                          </form>
                        ) : (
                          <form className="inline-form booking-inline-form compact-form" onSubmit={handleBooking}>
                            <div className="booking-grid compact-booking-grid">
                              <input name="name" placeholder="Имя" required type="text" />
                              <div className="phone-field-row">
                                <select className="compact-select phone-country-select" defaultValue="+998" name="countryCode">
                                  {phoneCountryCodes.map((code) => (
                                    <option key={code} value={code}>
                                      {code}
                                    </option>
                                  ))}
                                </select>
                                <input
                                  inputMode="numeric"
                                  maxLength={9}
                                  name="phoneLocal"
                                  onInput={(event) => {
                                    event.currentTarget.value = formatPhoneLocal(event.currentTarget.value);
                                  }}
                                  pattern="[0-9]{7,9}"
                                  placeholder="Телефон"
                                  required
                                  type="tel"
                                />
                              </div>
                              <input name="telegram" placeholder="@telegram (опционально)" type="text" />
                              <input
                                min={getTodayDateValue()}
                                name="date"
                                onChange={(event) => setBookingDate(event.target.value)}
                                required
                                type="date"
                                value={bookingDate}
                              />
                              <input max="5000" min="1" name="guests" placeholder="Гостей" required type="number" />
                            </div>
                            <div className="slot-picker-shell">
                              <div className="slot-picker-head">
                                <strong>Доступные слоты</strong>
                                <span>
                                  {isAvailabilityLoading
                                    ? "Загружаем..."
                                    : availableSlotCount > 0
                                      ? `${availableSlotCount} свободно`
                                      : "Свободных слотов нет"}
                                </span>
                              </div>
                              <div className="slot-grid">
                                {availabilitySlots.length > 0 ? (
                                  availabilitySlots.map((slot) => (
                                    <button
                                      className={`slot-chip status-${slot.status} ${selectedSlotTime === slot.time ? "active" : ""}`}
                                      disabled={slot.status === "unavailable"}
                                      key={slot.time}
                                      onClick={() => setSelectedSlotTime(slot.time)}
                                      type="button"
                                    >
                                      <strong>{slot.label}</strong>
                                      <span>{getSlotStatusText(slot, selectedHotspot.kind)}</span>
                                    </button>
                                  ))
                                ) : (
                                  <div className="slot-empty-state">На эту дату слоты пока не найдены.</div>
                                )}
                              </div>
                            </div>
                            <button className="primary-button wide-button" disabled={isPending} type="submit">
                              {isPending ? "Отправка..." : "Отправить"}
                            </button>
                          </form>
                          )}
                        </div>
                      </div>
                    </>
                  ) : null}
                </div>

                <div className="scene-strip">
                  {venue.scenes.map((item) => (
                    <button
                      className={`scene-chip ${item.id === scene.id ? "active" : ""}`}
                      key={item.id}
                      onClick={() => selectScene(item.id)}
                      type="button"
                    >
                      <strong>{item.title}</strong>
                      <span>{item.floorPlanLabel}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {toast ? <div className={`toast toast-${toast.kind}`}>{toast.message}</div> : null}
    </section>
  );
}
