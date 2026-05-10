"use client";

import { useEffect, useId, useMemo, useState } from "react";

import { migrateFloorPlan } from "@/lib/floor-plan";
import type {
  FloorPlanData,
  FloorPlanItemMeta,
  FloorPlanRoom,
  FloorPlanTable,
  FloorPlanZone,
  FloorPlanTableStatus
} from "@/lib/types";

const TABLE_STATUS: Record<
  FloorPlanTableStatus,
  { fill: string; stroke: string; text: string; label: string; tone: string }
> = {
  available: {
    fill: "rgba(117, 243, 174, 0.14)",
    stroke: "#75f3ae",
    text: "#1b3a2a",
    label: "Свободно",
    tone: "available"
  },
  new: {
    fill: "rgba(240, 193, 76, 0.20)",
    stroke: "#e5b94f",
    text: "#5a4310",
    label: "Новая",
    tone: "new"
  },
  hold_pending: {
    fill: "rgba(255, 174, 92, 0.22)",
    stroke: "#ff9f45",
    text: "#5e3414",
    label: "Hold",
    tone: "hold"
  },
  confirmed: {
    fill: "rgba(255, 122, 122, 0.16)",
    stroke: "#ff7a7a",
    text: "#5a1f1f",
    label: "Недоступно",
    tone: "confirmed"
  },
  waitlist: {
    fill: "rgba(182, 132, 255, 0.18)",
    stroke: "#b684ff",
    text: "#47206e",
    label: "Waitlist",
    tone: "waitlist"
  },
  declined: {
    fill: "rgba(148, 163, 184, 0.18)",
    stroke: "#94a3b8",
    text: "#334155",
    label: "Закрыта",
    tone: "declined"
  }
};

const OPERATIONAL_STATUS = {
  attention: {
    fill: "rgba(255, 82, 82, 0.32)",
    stroke: "#ff5252",
    text: "#5f1818"
  },
  late: {
    fill: "rgba(240, 193, 76, 0.34)",
    stroke: "#f0c14b",
    text: "#624400"
  },
  arriving: {
    fill: "rgba(232, 160, 48, 0.32)",
    stroke: "#e8a030",
    text: "#69400b"
  }
} as const;

const META_PILL_TONES = {
  available: { fill: "#75f3ae", text: "#173322" },
  new: { fill: "#e5b94f", text: "#4b380c" },
  hold: { fill: "#ff9f45", text: "#4b2810" },
  confirmed: { fill: "#ff7a7a", text: "#4f1717" },
  waitlist: { fill: "#b684ff", text: "#2d1149" },
  declined: { fill: "#94a3b8", text: "#172334" },
  occupied_booking: { fill: "#56e39f", text: "#10271c" },
  occupied_walkin: { fill: "#68a2ff", text: "#10233f" }
} as const;

const META_CORNER_TONES = {
  attention: { fill: "#ff5252", text: "#ffffff" },
  late: { fill: "#f0c14b", text: "#2f2406" },
  arriving: { fill: "#e8a030", text: "#342008" },
  waitlist: { fill: "#b684ff", text: "#ffffff" },
  info: { fill: "#68a2ff", text: "#ffffff" }
} as const;

const META_STATUS_ICONS: Record<NonNullable<FloorPlanItemMeta["topTone"]>, string> = {
  available: "OK",
  new: "N",
  hold: "H",
  confirmed: "X",
  waitlist: "W",
  declined: "-",
  occupied_booking: "BR",
  occupied_walkin: "WI"
};

const OCCUPIED_NOW_COLORS = {
  fill: "rgba(20, 35, 54, 0.92)",
  stroke: "#56e39f",
  text: "#f4fbff"
} as const;

const MIN_DISPLAY_CANVAS_W = 1280;
const MIN_DISPLAY_CANVAS_H = 820;

type Props = {
  data: FloorPlanData;
  allowOccupiedTableSelection?: boolean;
  attentionIds?: string[];
  lateIds?: string[];
  showOperationalLegend?: boolean;
  roomStatuses?: Record<string, FloorPlanTableStatus>;
  roomMeta?: Record<string, FloorPlanItemMeta>;
  tableStatuses?: Record<string, FloorPlanTableStatus>;
  tableMeta?: Record<string, FloorPlanItemMeta>;
  zoneStatuses?: Record<string, FloorPlanTableStatus>;
  zoneMeta?: Record<string, FloorPlanItemMeta>;
  onZoneSelect?: (zone: FloorPlanZone, room: FloorPlanRoom) => void;
  onTableSelect?: (table: FloorPlanTable, room: FloorPlanRoom) => void;
  selectedRoomId?: string;
  selectedZoneId?: string;
  onRoomChange?: (room: FloorPlanRoom) => void;
  selectedTableId?: string;
  /** Tables with arriving soon bookings (amber pulsing ring) */
  arrivingSoonIds?: string[];
  /** Waitlist queue count badge per table ID */
  waitlistCounts?: Record<string, number>;
};

export function FloorPlanViewer({
  data,
  attentionIds = [],
  arrivingSoonIds = [],
  lateIds = [],
  showOperationalLegend = false,
  waitlistCounts = {},
  allowOccupiedTableSelection = false,
  roomStatuses = {},
  roomMeta = {},
  tableStatuses = {},
  tableMeta = {},
  zoneStatuses = {},
  zoneMeta = {},
  onZoneSelect,
  onTableSelect,
  selectedRoomId,
  selectedZoneId,
  onRoomChange,
  selectedTableId
}: Props) {
  const [hovered, setHovered] = useState<string | null>(null);
  const patternId = useId().replace(/:/g, "");
  const plan = useMemo(() => migrateFloorPlan(data), [data]);
  const [internalRoomId, setInternalRoomId] = useState(plan.rooms[0]?.id ?? "");

  useEffect(() => {
    setInternalRoomId((current) =>
      plan.rooms.some((room) => room.id === current) ? current : plan.rooms[0]?.id ?? ""
    );
  }, [plan.rooms]);

  const activeRoom = useMemo(() => {
    const targetRoomId =
      selectedRoomId && plan.rooms.some((room) => room.id === selectedRoomId)
        ? selectedRoomId
        : internalRoomId;
    return plan.rooms.find((room) => room.id === targetRoomId) ?? plan.rooms[0] ?? null;
  }, [internalRoomId, plan.rooms, selectedRoomId]);

  const displayCanvasWidth = Math.max(activeRoom?.canvasWidth ?? 0, MIN_DISPLAY_CANVAS_W);
  const displayCanvasHeight = Math.max(activeRoom?.canvasHeight ?? 0, MIN_DISPLAY_CANVAS_H);
  const tableDisplayPositions = useMemo(() => {
    if (!activeRoom?.tables.length) {
      return new Map<string, { x: number; y: number }>();
    }

    const minX = Math.min(...activeRoom.tables.map((table) => table.x));
    const minY = Math.min(...activeRoom.tables.map((table) => table.y));
    const spreadX = 1.28;
    const spreadY = 1.22;
    const edgePadding = 72;

    const stretched = activeRoom.tables.map((table) => ({
      id: table.id,
      x: minX + (table.x - minX) * spreadX,
      y: minY + (table.y - minY) * spreadY
    }));

    const minDisplayX = Math.min(...stretched.map((table) => table.x));
    const minDisplayY = Math.min(...stretched.map((table) => table.y));
    const maxX = Math.max(...stretched.map((table) => table.x));
    const maxY = Math.max(...stretched.map((table) => table.y));

    let offsetX = edgePadding - minDisplayX;
    let offsetY = edgePadding - minDisplayY;

    if (maxX + offsetX > displayCanvasWidth - edgePadding) {
      offsetX += displayCanvasWidth - edgePadding - (maxX + offsetX);
    }

    if (maxY + offsetY > displayCanvasHeight - edgePadding) {
      offsetY += displayCanvasHeight - edgePadding - (maxY + offsetY);
    }

    return new Map(
      stretched.map((table) => [
        table.id,
        {
          x: table.x + offsetX,
          y: table.y + offsetY
        }
      ])
    );
  }, [activeRoom, displayCanvasHeight, displayCanvasWidth]);

  function getTableStatus(table: FloorPlanTable): FloorPlanTableStatus {
    return tableStatuses[table.id] ?? "available";
  }

  function getZoneStatus(zoneId: string): FloorPlanTableStatus {
    return zoneStatuses[zoneId] ?? "available";
  }

  function selectRoom(room: FloorPlanRoom) {
    if (!selectedRoomId) {
      setInternalRoomId(room.id);
    }

    onRoomChange?.(room);
  }

  if (!activeRoom) {
    return <div className="m-plan-empty">Пока нет залов на карте заведения.</div>;
  }

  const availableCount = activeRoom.tables.filter(
    (table) => (tableStatuses[table.id] ?? "available") === "available"
  ).length;
  const occupiedCount = activeRoom.tables.filter(
    (table) => tableMeta[table.id]?.appearance === "occupied"
  ).length;
  const attentionCount = activeRoom.tables.filter((table) => attentionIds.includes(table.id)).length;
  const lateCount = activeRoom.tables.filter((table) => lateIds.includes(table.id)).length;
  const arrivingSoonCount = activeRoom.tables.filter((table) => arrivingSoonIds.includes(table.id)).length;
  const statusCounts = activeRoom.tables.reduce((accumulator, table) => {
    const status = tableStatuses[table.id];
    if (!status || status === "available") {
      return accumulator;
    }

    accumulator[status] = (accumulator[status] || 0) + 1;
    return accumulator;
  }, {} as Partial<Record<FloorPlanTableStatus, number>>);
  const unavailableCount = Math.max((statusCounts.confirmed ?? 0) - occupiedCount, 0);

  return (
    <div className="m-plan-venue-map">
      {plan.rooms.length > 1 ? (
        <div className="m-plan-scene-tabs m-plan-room-tabs">
          {plan.rooms.map((room) => (
            (() => {
              const roomStatus = roomStatuses[room.id];
              const roomStatusInfo = roomStatus ? TABLE_STATUS[roomStatus] : null;
              const roomInfo = roomMeta[room.id];

              return (
                <button
                  className={`m-plan-scene-tab ${room.id === activeRoom.id ? "active" : ""}`}
                  key={room.id}
                  onClick={() => selectRoom(room)}
                  type="button"
                >
                  <span>{room.name}</span>
                  {roomStatusInfo ? (
                    <span className={`m-plan-room-state is-${roomStatusInfo.tone}`}>
                      {roomInfo?.statusLabel || roomStatusInfo.label}
                    </span>
                  ) : null}
                </button>
              );
            })()
          ))}
        </div>
      ) : null}

      <div className="m-plan-canvas-shell">
        <svg
          aria-label={`Карта заведения: ${activeRoom.name}`}
          className="m-plan-canvas"
          preserveAspectRatio="xMinYMin meet"
          role="img"
          viewBox={`0 0 ${displayCanvasWidth} ${displayCanvasHeight}`}
        >
          <defs>
            <pattern
              height="40"
              id={patternId}
              patternUnits="userSpaceOnUse"
              width="40"
            >
              <path
                d="M 40 0 L 0 0 0 40"
                fill="none"
                stroke="rgba(20, 28, 48, 0.06)"
                strokeWidth="1"
              />
            </pattern>
          </defs>

          <rect
            fill={`url(#${patternId})`}
            height={displayCanvasHeight}
            width={displayCanvasWidth}
            x={0}
            y={0}
          />

          {activeRoom.zones.map((zone) => (
            (() => {
              const zoneStatus = getZoneStatus(zone.id);
              const zoneColors = TABLE_STATUS[zoneStatus];
              const meta = zoneMeta[zone.id];
              const zoneLabel = meta?.statusLabel || zone.label;
              const zoneDetail = meta?.detailLabel;
              const isZoneClickable = Boolean(onZoneSelect) && zoneStatus === "available";
              const isZoneSelected = selectedZoneId === zone.id;

              return (
                <g key={zone.id}>
              <rect
                className={isZoneClickable ? "is-clickable" : undefined}
                fill={zoneStatus === "available" ? zone.color : zoneColors.fill}
                height={zone.height}
                rx={12}
                stroke={zoneStatus === "available" ? "rgba(15, 23, 42, 0.14)" : zoneColors.stroke}
                strokeWidth={isZoneSelected ? "3" : zoneStatus === "available" ? "1.5" : "2"}
                width={zone.width}
                x={zone.x}
                y={zone.y}
                onClick={() => {
                  if (isZoneClickable) {
                    onZoneSelect?.(zone, activeRoom);
                  }
                }}
              />
              <text
                fill={zoneStatus === "available" ? "rgba(18, 28, 48, 0.86)" : zoneColors.text}
                fontFamily="var(--font-manrope), system-ui, sans-serif"
                fontSize="14"
                fontWeight="700"
                pointerEvents="none"
                textAnchor="middle"
                x={zone.x + zone.width / 2}
                y={zone.y + 22}
              >
                {zoneLabel}
              </text>
              {zoneDetail ? (
                <text
                  fill={zoneStatus === "available" ? "rgba(18, 28, 48, 0.7)" : zoneColors.text}
                  fontFamily="var(--font-manrope), system-ui, sans-serif"
                  fontSize="11"
                  fontWeight="600"
                  opacity="0.8"
                  pointerEvents="none"
                  textAnchor="middle"
                  x={zone.x + zone.width / 2}
                  y={zone.y + 40}
                >
                  {zoneDetail}
                </text>
              ) : null}
            </g>
              );
            })()
          ))}

          {activeRoom.tables.map((table) => {
            const status = getTableStatus(table);
            const colors = TABLE_STATUS[status];
            const isHovered = hovered === table.id;
            const displayPosition = tableDisplayPositions.get(table.id);
            const displayX = displayPosition?.x ?? table.x;
            const displayY = displayPosition?.y ?? table.y;
            const operationalTone = attentionIds.includes(table.id)
              ? "attention"
              : lateIds.includes(table.id)
                ? "late"
                : arrivingSoonIds.includes(table.id)
                  ? "arriving"
                  : null;
            const isClickable =
              Boolean(onTableSelect) &&
              status !== "declined" &&
              (status === "available" || allowOccupiedTableSelection);
            const isSelected = selectedTableId === table.id;
            const meta = tableMeta[table.id];
            const subLabel = meta?.statusLabel || `${table.capacity} мест`;
            const detailLabel = meta?.detailLabel || "";
            const hoverLabel = meta?.hoverLabel;
            const topLabel = meta?.topLabel;
            const topTone = meta?.topTone;
            const cornerLabel = meta?.cornerLabel;
            const cornerTone = meta?.cornerTone;
            const displayColors =
              meta?.appearance === "occupied"
                ? OCCUPIED_NOW_COLORS
                : operationalTone
                  ? OPERATIONAL_STATUS[operationalTone]
                  : colors;
            const topToneColors = topTone ? META_PILL_TONES[topTone] : null;
            const cornerToneColors = cornerTone ? META_CORNER_TONES[cornerTone] : null;
            const topIcon = topTone ? META_STATUS_ICONS[topTone] : null;
            const topBadgeLabel = topIcon || topLabel || null;
            const topLabelWidth = topBadgeLabel
              ? Math.max(topIcon ? 24 : 0, (topBadgeLabel.length <= 3 ? 24 : topBadgeLabel.length * 7.4 + 14))
              : 0;
            const displayRadius = Math.max(
              table.radius + 12,
              detailLabel ? 46 : 42,
              meta?.appearance === "occupied" ? 48 : 0
            );

            return (
              <g
                className={isClickable ? "is-clickable" : undefined}
                key={table.id}
                onClick={() => {
                  if (isClickable) {
                    onTableSelect?.(table, activeRoom);
                  }
                }}
                onMouseEnter={() => setHovered(table.id)}
                onMouseLeave={() => setHovered(null)}
              >
                {attentionIds.includes(table.id) && !isSelected ? (
                  <circle
                    cx={displayX}
                    cy={displayY}
                    fill="none"
                    opacity="0.9"
                    r={displayRadius + 11}
                    stroke="#ff5252"
                    strokeWidth="3"
                  />
                ) : null}
                {lateIds.includes(table.id) && !isSelected && !attentionIds.includes(table.id) ? (
                  <circle
                    cx={displayX}
                    cy={displayY}
                    fill="none"
                    opacity="0.9"
                    r={displayRadius + 10}
                    stroke="#f0c14b"
                    strokeDasharray="6 3"
                    strokeWidth="2.5"
                  />
                ) : null}
                {/* Arriving soon — amber dashed ring */}
                {arrivingSoonIds.includes(table.id) && !isSelected && !attentionIds.includes(table.id) && !lateIds.includes(table.id) ? (
                  <circle
                    cx={displayX}
                    cy={displayY}
                    fill="none"
                    r={displayRadius + 10}
                    stroke="#e8a030"
                    strokeDasharray="5 3"
                    strokeWidth="2"
                    opacity="0.9"
                  />
                ) : null}
                {isHovered && isClickable ? (
                  <circle
                    cx={displayX}
                    cy={displayY}
                    fill="none"
                    opacity="0.65"
                    r={Math.max(displayRadius - 3, 18)}
                    stroke="#68a2ff"
                    strokeDasharray="5 4"
                    strokeWidth="1.5"
                  />
                ) : null}
                {isSelected ? (
                  <circle
                    cx={displayX}
                    cy={displayY}
                    fill="none"
                    r={Math.max(displayRadius - 5, 18)}
                    stroke="#68a2ff"
                    strokeWidth="2.2"
                  />
                ) : null}
                <circle
                  cx={displayX}
                  cy={displayY}
                  fill={displayColors.fill}
                  r={displayRadius}
                  stroke={displayColors.stroke}
                  strokeWidth={isSelected ? 2.5 : operationalTone ? 2.3 : 1.8}
                />
                {topBadgeLabel && topToneColors ? (
                  <g>
                    <rect
                      fill={topToneColors.fill}
                      height={topIcon ? "16" : "13"}
                      opacity="0.96"
                      rx={topIcon ? "8" : "6.5"}
                      width={topLabelWidth}
                      x={displayX - topLabelWidth / 2}
                      y={displayY - displayRadius + 8}
                    />
                    <text
                      fill={topToneColors.text}
                      fontFamily="var(--font-manrope), system-ui, sans-serif"
                      fontSize={topIcon ? "8.8" : "8.2"}
                      fontWeight="800"
                      letterSpacing="0.05em"
                      textAnchor="middle"
                      x={displayX}
                      y={displayY - displayRadius + (topIcon ? 19 : 17.5)}
                    >
                      {topBadgeLabel}
                    </text>
                  </g>
                ) : null}
                <text
                  fill={displayColors.text}
                  fontFamily="var(--font-manrope), system-ui, sans-serif"
                  fontSize="15.4"
                  fontWeight="900"
                  textAnchor="middle"
                  x={displayX}
                  y={displayY - (topBadgeLabel ? 6 : 10)}
                >
                  {table.label}
                </text>
                <text
                  fill={displayColors.text}
                  fontFamily="var(--font-manrope), system-ui, sans-serif"
                  fontSize="13.2"
                  fontWeight="800"
                  opacity="0.92"
                  textAnchor="middle"
                  x={displayX}
                  y={displayY + (topBadgeLabel ? 6 : 3)}
                >
                  {subLabel}
                </text>
                {detailLabel ? (
                  <text
                    fill={displayColors.text}
                    fontFamily="var(--font-manrope), system-ui, sans-serif"
                    fontSize="11"
                    fontWeight="700"
                    opacity="0.88"
                    textAnchor="middle"
                    x={displayX}
                    y={displayY + (topBadgeLabel ? 20 : 16)}
                  >
                    {detailLabel}
                  </text>
                ) : null}
                {cornerLabel && cornerToneColors ? (
                  <g>
                    <circle
                      cx={displayX + displayRadius - 1}
                      cy={displayY - displayRadius + 2}
                      fill={cornerToneColors.fill}
                      r="10.5"
                    />
                    <text
                      fill={cornerToneColors.text}
                      fontFamily="var(--font-manrope), system-ui, sans-serif"
                      fontSize="7.4"
                      fontWeight="800"
                      pointerEvents="none"
                      textAnchor="middle"
                      x={displayX + displayRadius - 1}
                      y={displayY - displayRadius + 4.8}
                    >
                      {cornerLabel}
                    </text>
                  </g>
                ) : null}
                {/* Waitlist count badge */}
                {(waitlistCounts[table.id] ?? 0) > 0 ? (
                  <g>
                    <circle
                      cx={cornerLabel ? displayX - displayRadius + 2 : displayX + displayRadius - 2}
                      cy={displayY - displayRadius + 2}
                      fill="#b684ff"
                      r="10"
                    />
                    <text
                      fill="white"
                      fontFamily="var(--font-manrope), system-ui, sans-serif"
                      fontSize="8.4"
                      fontWeight="800"
                      pointerEvents="none"
                      textAnchor="middle"
                      x={cornerLabel ? displayX - displayRadius + 2 : displayX + displayRadius - 2}
                      y={displayY - displayRadius + 6.4}
                    >
                      {waitlistCounts[table.id]}
                    </text>
                  </g>
                ) : null}
              </g>
            );
          })}
        </svg>
      </div>

      <div className="m-plan-meta">
        <div className="m-plan-legend">
          {(
            Object.entries(TABLE_STATUS) as Array<
              [FloorPlanTableStatus, (typeof TABLE_STATUS)[FloorPlanTableStatus]]
            >
          ).map(([key, value]) => (
            <div className="m-plan-legend-item" key={key}>
              <span className={`m-plan-legend-dot is-${value.tone}`} />
              <span>{value.label}</span>
            </div>
          ))}
          <div className="m-plan-legend-item">
            <span className="m-plan-legend-dot is-selected" />
            <span>Выбрано</span>
          </div>
          <div className="m-plan-legend-item">
            <span className="m-plan-legend-badge">X</span>
            <span>Недоступно</span>
          </div>
          <div className="m-plan-legend-item">
            <span className="m-plan-legend-badge is-occupied">BR</span>
            <span>Гость по брони сидит</span>
          </div>
          <div className="m-plan-legend-item">
            <span className="m-plan-legend-badge is-walkin">WI</span>
            <span>Walk-in сидит</span>
          </div>
          {showOperationalLegend ? (
            <div className="m-plan-legend-item">
              <span className="m-plan-legend-badge is-arriving">→</span>
              <span>Скоро придут</span>
            </div>
          ) : null}
          {showOperationalLegend ? (
            <div className="m-plan-legend-item">
              <span className="m-plan-legend-badge is-late">⌛</span>
              <span>Гость опаздывает</span>
            </div>
          ) : null}
          {showOperationalLegend ? (
            <div className="m-plan-legend-item">
              <span className="m-plan-legend-badge is-attention">!</span>
              <span>Нужно действие</span>
            </div>
          ) : null}
          {showOperationalLegend ? (
            <div className="m-plan-legend-item">
              <span className="m-plan-legend-badge is-waitlist">W</span>
              <span>Лист ожидания</span>
            </div>
          ) : null}
        </div>

        <div className="m-plan-stats">
          <span>
            <b>{availableCount}</b> свободно
          </span>
          {statusCounts.new ? (
            <span>
              <b>{statusCounts.new}</b> новые
            </span>
          ) : null}
          {statusCounts.hold_pending ? (
            <span>
              <b>{statusCounts.hold_pending}</b> hold
            </span>
          ) : null}
          {occupiedCount > 0 ? (
            <span>
              <b>{occupiedCount}</b> сидят сейчас
            </span>
          ) : null}
          {unavailableCount > 0 ? (
            <span>
              <b>{unavailableCount}</b> недоступно
            </span>
          ) : null}
          {statusCounts.waitlist ? (
            <span>
              <b>{statusCounts.waitlist}</b> waitlist
            </span>
          ) : null}
          {arrivingSoonCount > 0 ? (
            <span>
              <b>{arrivingSoonCount}</b> скоро придут
            </span>
          ) : null}
          {lateCount > 0 ? (
            <span>
              <b>{lateCount}</b> опаздывают
            </span>
          ) : null}
          {attentionCount > 0 ? (
            <span>
              <b>{attentionCount}</b> нужно действие
            </span>
          ) : null}
          <span>
            <b>{activeRoom.tables.length}</b> всего
          </span>
        </div>
      </div>

      {selectedTableId ? (
        (() => {
          const selectedTable = activeRoom.tables.find((table) => table.id === selectedTableId);
          return selectedTable ? (
            <div className="m-plan-selection">
              Выбран стол <strong>{selectedTable.label}</strong> в зале{" "}
              <strong>{activeRoom.name}</strong> на {selectedTable.capacity} мест.
            </div>
          ) : null;
        })()
      ) : null}
    </div>
  );
}
