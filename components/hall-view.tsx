"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { FloorPlanViewer } from "@/components/floor-plan-viewer";
import type { FloorPlanTable, FloorPlanTableStatus, ManagerBooking, ManagerWaitlistEntry, Venue } from "@/lib/types";

// ── helpers ──────────────────────────────────────────────────────────────────

function getTodayIso() {
  return new Date().toISOString().slice(0, 10);
}

function formatDateRu(iso: string) {
  return new Intl.DateTimeFormat("ru-RU", { weekday: "short", day: "numeric", month: "long" }).format(
    new Date(iso + "T12:00:00Z")
  );
}

function shiftDate(iso: string, days: number) {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function getEventDateTime(booking: ManagerBooking): Date | null {
  if (!booking.eventDateIso || !booking.startTimeRaw) return null;
  return new Date(`${booking.eventDateIso}T${booking.startTimeRaw}:00`);
}

function diffMinutes(a: Date, b: Date) {
  return (a.getTime() - b.getTime()) / 60000;
}

const STATUS_CONFIG: Record<ManagerBooking["status"], { label: string; color: string; icon: string }> = {
  confirmed:    { label: "Подтверждено", color: "#1ecb82", icon: "✓" },
  new:          { label: "Новая",        color: "#e8a030", icon: "●" },
  hold_pending: { label: "Резерв",       color: "#ff9f45", icon: "◐" },
  waitlist:     { label: "Ожидание",     color: "#b684ff", icon: "⋯" },
  declined:     { label: "Закрыта",      color: "#5a6580", icon: "✕" },
};

// ── types ─────────────────────────────────────────────────────────────────────

type Props = {
  bookings: ManagerBooking[];
  waitlistEntries: ManagerWaitlistEntry[];
  venues: Venue[];
  role: string;
  managerName: string;
};

// ── component ─────────────────────────────────────────────────────────────────

export function HallView({ bookings, waitlistEntries, venues, role, managerName }: Props) {
  const router = useRouter();
  const listRef = useRef<HTMLDivElement>(null);
  const [date, setDate] = useState(getTodayIso);
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
  const [highlightedBookingId, setHighlightedBookingId] = useState<string | null>(null);
  const [selectedVenueId, setSelectedVenueId] = useState<string>(venues[0]?.id ?? "");
  const [now, setNow] = useState(() => new Date());

  // update "now" every minute for arriving-soon calc
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  // auto-refresh data every 30s
  useEffect(() => {
    const t = setInterval(() => router.refresh(), 30_000);
    return () => clearInterval(t);
  }, [router]);

  const venue = venues.find((v) => v.id === selectedVenueId) ?? venues[0] ?? null;
  const floorPlan = venue?.floorPlan ?? null;

  // build label → table map from floor plan
  const tableByLabel = useMemo(() => {
    const map: Record<string, FloorPlanTable> = {};
    if (!floorPlan) return map;
    for (const room of floorPlan.rooms) {
      for (const table of room.tables) {
        map[table.label] = table;
      }
    }
    return map;
  }, [floorPlan]);

  // today's bookings for this venue
  const todayBookings = useMemo(
    () =>
      bookings.filter(
        (b) =>
          b.eventDateIso === date &&
          !b.archived &&
          b.status !== "declined" &&
          (venue ? b.venueName === venue.name : true)
      ).sort((a, b) => (a.startTimeRaw ?? "").localeCompare(b.startTimeRaw ?? "")),
    [bookings, date, venue]
  );

  // arriving soon: confirmed/hold bookings arriving in next 30 min
  const arrivingSoon = useMemo(
    () =>
      todayBookings.filter((b) => {
        if (b.status !== "confirmed" && b.status !== "hold_pending") return false;
        const dt = getEventDateTime(b);
        if (!dt) return false;
        const diff = diffMinutes(dt, now);
        return diff >= -5 && diff <= 30; // -5 min grace, up to 30 min ahead
      }),
    [todayBookings, now]
  );

  const arrivingSoonIds = useMemo(
    () =>
      arrivingSoon
        .map((b) => tableByLabel[b.placeLabel]?.id)
        .filter((id): id is string => Boolean(id)),
    [arrivingSoon, tableByLabel]
  );

  // waitlist bookings (status === "waitlist")
  const waitlistBookings = useMemo(
    () => todayBookings.filter((b) => b.status === "waitlist"),
    [todayBookings]
  );

  // regular bookings (not waitlist)
  const regularBookings = useMemo(
    () => todayBookings.filter((b) => b.status !== "waitlist"),
    [todayBookings]
  );

  // table statuses for floor plan
  const tableStatuses = useMemo(() => {
    const map: Record<string, FloorPlanTableStatus> = {};
    for (const b of todayBookings) {
      const table = tableByLabel[b.placeLabel];
      if (!table) continue;
      const prev = map[table.id];
      const priority: Record<string, number> = { confirmed: 5, hold_pending: 4, new: 3, waitlist: 2 };
      if (!prev || (priority[b.status] ?? 0) > (priority[prev] ?? 0)) {
        map[table.id] = b.status as FloorPlanTableStatus;
      }
    }
    return map;
  }, [todayBookings, tableByLabel]);

  // waitlist count per table ID
  const waitlistCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const b of waitlistBookings) {
      const table = tableByLabel[b.placeLabel];
      if (!table) continue;
      counts[table.id] = (counts[table.id] ?? 0) + 1;
    }
    return counts;
  }, [waitlistBookings, tableByLabel]);

  // stats
  const freeCount = floorPlan
    ? floorPlan.rooms.flatMap((r) => r.tables).filter((t) => !tableStatuses[t.id]).length
    : 0;
  const confirmedCount = todayBookings.filter((b) => b.status === "confirmed").length;
  const newCount = todayBookings.filter((b) => b.status === "new").length;
  const waitlistCount = waitlistBookings.length;

  function handleTableSelect(table: FloorPlanTable) {
    setSelectedTableId(table.id);
    const booking = regularBookings.find((b) => tableByLabel[b.placeLabel]?.id === table.id);
    if (booking) {
      setHighlightedBookingId(booking.id);
      document.getElementById(`hb-${booking.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }

  function handleBookingClick(booking: ManagerBooking) {
    setHighlightedBookingId(booking.id);
    const tableId = tableByLabel[booking.placeLabel]?.id;
    if (tableId) setSelectedTableId(tableId);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: "var(--s-void)", color: "var(--s-text)", fontFamily: "var(--font-space-grotesk), system-ui, sans-serif" }}>

      {/* ── TOP BAR ─────────────────────────────────────────────────────── */}
      <header style={{ display: "flex", alignItems: "center", gap: 16, padding: "0 20px", height: 56, borderBottom: "1px solid var(--s-border)", flexShrink: 0, background: "var(--s-deep)" }}>
        <a href="/manager" style={{ color: "var(--s-muted)", fontSize: 13, textDecoration: "none", display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" }}>
          ← Дашборд
        </a>

        <div style={{ width: 1, height: 20, background: "var(--s-border)", flexShrink: 0 }} />

        {/* Date nav */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button onClick={() => setDate((d) => shiftDate(d, -1))} style={navBtnStyle}>‹</button>
          <span style={{ fontSize: 14, fontWeight: 600, minWidth: 160, textAlign: "center" }}>
            {formatDateRu(date)}
          </span>
          <button onClick={() => setDate((d) => shiftDate(d, 1))} style={navBtnStyle}>›</button>
          {date !== getTodayIso() && (
            <button onClick={() => setDate(getTodayIso())} style={{ ...navBtnStyle, padding: "4px 10px", fontSize: 11, color: "var(--s-gold)" }}>
              Сегодня
            </button>
          )}
        </div>

        <div style={{ width: 1, height: 20, background: "var(--s-border)", flexShrink: 0 }} />

        {/* Venue tabs */}
        {venues.length > 1 && (
          <div style={{ display: "flex", gap: 4 }}>
            {venues.map((v) => (
              <button
                key={v.id}
                onClick={() => setSelectedVenueId(v.id)}
                style={{
                  padding: "4px 12px", fontSize: 12, borderRadius: 4, border: "1px solid",
                  cursor: "pointer", transition: "all 0.15s",
                  background: v.id === selectedVenueId ? "var(--s-gold)" : "transparent",
                  color: v.id === selectedVenueId ? "var(--s-gold-text)" : "var(--s-muted)",
                  borderColor: v.id === selectedVenueId ? "var(--s-gold)" : "var(--s-border)",
                  fontWeight: 600
                }}
              >
                {v.name}
              </button>
            ))}
          </div>
        )}

        <div style={{ flex: 1 }} />

        {/* Stats */}
        <div style={{ display: "flex", gap: 16, fontSize: 12 }}>
          <span><b style={{ color: "#1ecb82" }}>{freeCount}</b> <span style={{ color: "var(--s-muted)" }}>свободно</span></span>
          <span><b style={{ color: "#1ecb82" }}>{confirmedCount}</b> <span style={{ color: "var(--s-muted)" }}>брони</span></span>
          {newCount > 0 && <span><b style={{ color: "#e8a030" }}>{newCount}</b> <span style={{ color: "var(--s-muted)" }}>новых</span></span>}
          {waitlistCount > 0 && <span><b style={{ color: "#b684ff" }}>{waitlistCount}</b> <span style={{ color: "var(--s-muted)" }}>ожидание</span></span>}
        </div>

        <div style={{ width: 1, height: 20, background: "var(--s-border)", flexShrink: 0 }} />
        <span style={{ fontSize: 12, color: "var(--s-muted)" }}>{managerName}</span>
      </header>

      {/* ── MAIN ────────────────────────────────────────────────────────── */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>

        {/* LEFT — booking list */}
        <div
          ref={listRef}
          style={{ width: 340, flexShrink: 0, overflowY: "auto", borderRight: "1px solid var(--s-border)", display: "flex", flexDirection: "column" }}
        >
          {/* Arriving soon */}
          {arrivingSoon.length > 0 && (
            <section style={{ padding: "12px 12px 4px" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#e8a030", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
                <span>⚡</span> Скоро придут <span style={{ background: "rgba(232,160,48,0.15)", color: "#e8a030", borderRadius: 10, padding: "1px 7px", fontSize: 10 }}>{arrivingSoon.length}</span>
              </div>
              {arrivingSoon.map((b) => (
                <BookingCard
                  key={b.id}
                  booking={b}
                  highlighted={highlightedBookingId === b.id}
                  arrivingSoon
                  onClick={() => handleBookingClick(b)}
                />
              ))}
            </section>
          )}

          {/* All bookings */}
          <section style={{ padding: "12px 12px 4px", flex: 1 }}>
            {arrivingSoon.length > 0 && (
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--s-muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>
                Все брони <span style={{ background: "var(--s-surface)", borderRadius: 10, padding: "1px 7px", fontSize: 10, color: "var(--s-text-2)" }}>{regularBookings.length}</span>
              </div>
            )}
            {regularBookings.length === 0 && (
              <div style={{ color: "var(--s-muted)", fontSize: 13, padding: "20px 0", textAlign: "center" }}>
                Броней на {formatDateRu(date)} нет
              </div>
            )}
            {regularBookings.map((b) => (
              <BookingCard
                key={b.id}
                booking={b}
                highlighted={highlightedBookingId === b.id}
                onClick={() => handleBookingClick(b)}
              />
            ))}
          </section>

          {/* Waitlist */}
          {waitlistBookings.length > 0 && (
            <section style={{ padding: "12px 12px 16px", borderTop: "1px solid var(--s-border)" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#b684ff", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
                <span>⏳</span> Ожидание <span style={{ background: "rgba(182,132,255,0.12)", color: "#b684ff", borderRadius: 10, padding: "1px 7px", fontSize: 10 }}>{waitlistBookings.length}</span>
              </div>
              {waitlistBookings.map((b) => (
                <BookingCard
                  key={b.id}
                  booking={b}
                  highlighted={highlightedBookingId === b.id}
                  onClick={() => handleBookingClick(b)}
                />
              ))}
            </section>
          )}
        </div>

        {/* RIGHT — floor plan */}
        <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
          {floorPlan ? (
            <div style={{ flex: 1, overflow: "hidden" }}>
              <FloorPlanViewer
                allowOccupiedTableSelection
                arrivingSoonIds={arrivingSoonIds}
                data={floorPlan}
                onTableSelect={handleTableSelect}
                selectedTableId={selectedTableId ?? undefined}
                tableStatuses={tableStatuses}
                waitlistCounts={waitlistCounts}
              />
            </div>
          ) : (
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--s-muted)", flexDirection: "column", gap: 8 }}>
              <span style={{ fontSize: 32 }}>🗺️</span>
              <span>Карта зала не настроена для этого объекта</span>
              <a href="/manager" style={{ fontSize: 13, color: "var(--s-gold)", textDecoration: "none" }}>Настроить в дашборде</a>
            </div>
          )}
        </div>
      </div>

      {/* Arriving soon legend */}
      {arrivingSoonIds.length > 0 && (
        <div style={{ position: "fixed", bottom: 16, right: 16, background: "var(--s-surface)", border: "1px solid var(--s-border)", borderRadius: 8, padding: "8px 14px", fontSize: 12, display: "flex", gap: 16, alignItems: "center" }}>
          <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <svg width="16" height="16" viewBox="0 0 16 16"><circle cx="8" cy="8" r="6" fill="none" stroke="#e8a030" strokeWidth="2" strokeDasharray="4 3" /></svg>
            <span style={{ color: "var(--s-muted)" }}>Скоро придут</span>
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <svg width="16" height="16" viewBox="0 0 16 16"><circle cx="8" cy="8" r="6" fill="#b684ff" /><text x="8" y="12" textAnchor="middle" fontSize="9" fill="white" fontWeight="800">2</text></svg>
            <span style={{ color: "var(--s-muted)" }}>В ожидании</span>
          </span>
        </div>
      )}
    </div>
  );
}

// ── BookingCard ───────────────────────────────────────────────────────────────

function BookingCard({
  booking,
  highlighted,
  arrivingSoon = false,
  onClick,
}: {
  booking: ManagerBooking;
  highlighted: boolean;
  arrivingSoon?: boolean;
  onClick: () => void;
}) {
  const cfg = STATUS_CONFIG[booking.status] ?? STATUS_CONFIG.new;

  return (
    <div
      id={`hb-${booking.id}`}
      onClick={onClick}
      style={{
        marginBottom: 6,
        padding: "10px 12px",
        borderRadius: 8,
        border: "1px solid",
        borderColor: highlighted ? cfg.color : arrivingSoon ? "rgba(232,160,48,0.35)" : "var(--s-border)",
        background: highlighted
          ? `${cfg.color}14`
          : arrivingSoon
            ? "rgba(232,160,48,0.07)"
            : "var(--s-surface)",
        cursor: "pointer",
        transition: "all 0.15s",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Status bar on left edge */}
      <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: cfg.color, borderRadius: "8px 0 0 8px" }} />

      <div style={{ paddingLeft: 4 }}>
        {/* Time + status */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
          <span style={{ fontSize: 16, fontWeight: 800, color: arrivingSoon ? "#e8a030" : "var(--s-text)", letterSpacing: "-0.02em" }}>
            {booking.startTimeRaw ?? "—:——"}
          </span>
          <span style={{ fontSize: 10, fontWeight: 700, color: cfg.color, background: `${cfg.color}18`, padding: "2px 8px", borderRadius: 10 }}>
            {cfg.icon} {cfg.label}
          </span>
        </div>

        {/* Name */}
        <div style={{ fontSize: 13, fontWeight: 700, color: "var(--s-text)", marginBottom: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {booking.customerName}
        </div>

        {/* Details row */}
        <div style={{ display: "flex", gap: 10, fontSize: 11, color: "var(--s-muted)" }}>
          <span>📍 {booking.placeLabel}</span>
          <span>👥 {booking.guestsLabel}</span>
          {booking.phone && booking.phone !== "—" && (
            <a href={`tel:${booking.phone}`} onClick={(e) => e.stopPropagation()} style={{ color: "var(--s-gold)", textDecoration: "none", marginLeft: "auto" }}>
              📞
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

// ── styles ────────────────────────────────────────────────────────────────────

const navBtnStyle: React.CSSProperties = {
  background: "transparent",
  border: "1px solid var(--s-border)",
  color: "var(--s-text)",
  borderRadius: 4,
  padding: "4px 8px",
  cursor: "pointer",
  fontSize: 14,
  lineHeight: 1,
};
