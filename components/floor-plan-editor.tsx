"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { FloorPlanData, FloorPlanRoom, FloorPlanTable, FloorPlanZone } from "@/lib/types";
import { createEmptyRoom, migrateFloorPlan } from "@/lib/floor-plan";

// ─── Constants ────────────────────────────────────────────────────────────────

const HANDLE_R = 6;

const ZONE_COLORS = [
  "#dbeafe", // blue
  "#dcfce7", // green
  "#fef3c7", // yellow
  "#fce7f3", // pink
  "#ede9fe", // purple
  "#ffedd5", // orange
];

const ZONE_BORDER_COLORS = [
  "#93c5fd",
  "#86efac",
  "#fcd34d",
  "#f9a8d4",
  "#c4b5fd",
  "#fdba74",
];

const ZONE_LABEL_COLORS = [
  "#1e40af",
  "#166534",
  "#92400e",
  "#9d174d",
  "#5b21b6",
  "#9a3412",
];

// ─── Types ────────────────────────────────────────────────────────────────────

type Tool = "select" | "zone" | "table";

type DragState =
  | { kind: "none" }
  | { kind: "zone-draw"; startX: number; startY: number; currentX: number; currentY: number }
  | { kind: "move-zone"; zoneId: string; offsetX: number; offsetY: number }
  | { kind: "move-table"; tableId: string; offsetX: number; offsetY: number }
  | { kind: "resize-zone"; zoneId: string; handle: "se"; startX: number; startY: number; origW: number; origH: number };

type Selected =
  | { kind: "none" }
  | { kind: "zone"; id: string }
  | { kind: "table"; id: string };

// ─── Props ────────────────────────────────────────────────────────────────────

type Props = {
  initialData?: FloorPlanData | null;
  onSave: (data: FloorPlanData) => Promise<void>;
  saving?: boolean;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function uid() {
  return Math.random().toString(36).slice(2, 9);
}

function ptInRect(px: number, py: number, z: FloorPlanZone) {
  return px >= z.x && px <= z.x + z.width && py >= z.y && py <= z.y + z.height;
}

function ptInCircle(px: number, py: number, t: FloorPlanTable) {
  const dx = px - t.x;
  const dy = py - t.y;
  return Math.sqrt(dx * dx + dy * dy) <= t.radius;
}

function ptInHandle(px: number, py: number, hx: number, hy: number) {
  return Math.abs(px - hx) <= HANDLE_R + 2 && Math.abs(py - hy) <= HANDLE_R + 2;
}

// ─── Draw ─────────────────────────────────────────────────────────────────────

function draw(
  ctx: CanvasRenderingContext2D,
  room: FloorPlanRoom,
  selected: Selected,
  drag: DragState,
  colorIdx: (zoneId: string) => number
) {
  ctx.clearRect(0, 0, room.canvasWidth, room.canvasHeight);

  // grid
  ctx.strokeStyle = "#f1f5f9";
  ctx.lineWidth = 1;
  for (let x = 0; x <= room.canvasWidth; x += 40) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, room.canvasHeight); ctx.stroke();
  }
  for (let y = 0; y <= room.canvasHeight; y += 40) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(room.canvasWidth, y); ctx.stroke();
  }

  // zones
  for (const zone of room.zones) {
    const idx = colorIdx(zone.id);
    const isSelected = selected.kind === "zone" && selected.id === zone.id;

    ctx.fillStyle = zone.color;
    ctx.strokeStyle = isSelected ? "#3b82f6" : ZONE_BORDER_COLORS[idx % ZONE_BORDER_COLORS.length];
    ctx.lineWidth = isSelected ? 2 : 1;

    ctx.beginPath();
    ctx.roundRect(zone.x, zone.y, zone.width, zone.height, 6);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = ZONE_LABEL_COLORS[idx % ZONE_LABEL_COLORS.length];
    ctx.font = "bold 13px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText(zone.label, zone.x + zone.width / 2, zone.y + 8, zone.width - 16);

    if (isSelected) {
      const hx = zone.x + zone.width;
      const hy = zone.y + zone.height;
      ctx.fillStyle = "#fff";
      ctx.strokeStyle = "#3b82f6";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(hx, hy, HANDLE_R, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }

  // ghost zone while drawing
  if (drag.kind === "zone-draw") {
    const x = Math.min(drag.startX, drag.currentX);
    const y = Math.min(drag.startY, drag.currentY);
    const w = Math.abs(drag.currentX - drag.startX);
    const h = Math.abs(drag.currentY - drag.startY);
    ctx.fillStyle = "rgba(59,130,246,0.15)";
    ctx.strokeStyle = "#3b82f6";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 3]);
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 4);
    ctx.fill();
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // tables
  for (const table of room.tables) {
    const isSelected = selected.kind === "table" && selected.id === table.id;

    ctx.fillStyle = isSelected ? "#dbeafe" : "#fff";
    ctx.strokeStyle = isSelected ? "#3b82f6" : "#94a3b8";
    ctx.lineWidth = isSelected ? 2 : 1.5;
    ctx.beginPath();
    ctx.arc(table.x, table.y, table.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = isSelected ? "#1e40af" : "#334155";
    ctx.font = "bold 11px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(table.label, table.x, table.y - 4);

    ctx.fillStyle = isSelected ? "#3b82f6" : "#64748b";
    ctx.font = "10px system-ui, sans-serif";
    ctx.fillText(`${table.capacity}ч`, table.x, table.y + 7);
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export function FloorPlanEditor({
  initialData,
  onSave,
  saving
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [slotInput, setSlotInput] = useState("");

  // ── Список комнат ──────────────────────────────────────────────────────────
  const initialRooms = useMemo<FloorPlanRoom[]>(() => {
    const migrated = migrateFloorPlan(initialData);
    return migrated.rooms.length ? migrated.rooms : [createEmptyRoom("Зал")];
  }, [initialData]);

  const [rooms, setRooms] = useState<FloorPlanRoom[]>(initialRooms);
  const [activeRoomId, setActiveRoomId] = useState<string>(initialRooms[0].id);

  const activeRoom = rooms.find((r) => r.id === activeRoomId) ?? rooms[0];

  // ── Инструменты, выбор, drag ──────────────────────────────────────────────
  const [tool, setTool] = useState<Tool>("select");
  const [selected, setSelected] = useState<Selected>({ kind: "none" });
  const [drag, setDrag] = useState<DragState>({ kind: "none" });
  const [labelInput, setLabelInput] = useState("");
  const [capacityInput, setCapacityInput] = useState("4");
  const slotPresets = ["10:00", "12:00", "14:00", "16:00", "18:00", "20:00", "22:00"];

  // colorIdx (per room)
  const [colorIdxByRoom, setColorIdxByRoom] = useState<Record<string, Record<string, number>>>(() => {
    const map: Record<string, Record<string, number>> = {};
    for (const room of initialRooms) {
      const inner: Record<string, number> = {};
      room.zones.forEach((zone, idx) => { inner[zone.id] = idx; });
      map[room.id] = inner;
    }
    return map;
  });

  const getColorIdx = useCallback(
    (id: string) => (colorIdxByRoom[activeRoom.id]?.[id] ?? 0),
    [colorIdxByRoom, activeRoom.id]
  );

  // ── Helpers для текущей комнаты ────────────────────────────────────────────
  function patchActiveRoom(patch: Partial<FloorPlanRoom> | ((r: FloorPlanRoom) => FloorPlanRoom)) {
    setRooms((prev) =>
      prev.map((r) => {
        if (r.id !== activeRoom.id) return r;
        return typeof patch === "function" ? patch(r) : { ...r, ...patch };
      })
    );
  }

  function setZones(updater: (zones: FloorPlanZone[]) => FloorPlanZone[]) {
    patchActiveRoom((r) => ({ ...r, zones: updater(r.zones) }));
  }

  function setTables(updater: (tables: FloorPlanTable[]) => FloorPlanTable[]) {
    patchActiveRoom((r) => ({ ...r, tables: updater(r.tables) }));
  }

  // ── redraw ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = typeof window !== "undefined" ? Math.min(window.devicePixelRatio || 1, 2) : 1;
    canvas.width = Math.round(activeRoom.canvasWidth * dpr);
    canvas.height = Math.round(activeRoom.canvasHeight * dpr);
    canvas.style.width = `${activeRoom.canvasWidth}px`;
    canvas.style.height = `${activeRoom.canvasHeight}px`;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw(ctx, activeRoom, selected, drag, getColorIdx);
  }, [activeRoom, selected, drag, getColorIdx]);

  // когда меняется активная комната — сбрасываем выбор
  useEffect(() => {
    setSelected({ kind: "none" });
    setDrag({ kind: "none" });
  }, [activeRoom.id]);

  // ── Canvas events ──────────────────────────────────────────────────────────

  function getPos(e: React.MouseEvent<HTMLCanvasElement>) {
    const rect = canvasRef.current!.getBoundingClientRect();
    const scaleX = activeRoom.canvasWidth / rect.width;
    const scaleY = activeRoom.canvasHeight / rect.height;
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
  }

  function onMouseDown(e: React.MouseEvent<HTMLCanvasElement>) {
    const { x, y } = getPos(e);

    if (tool === "table") {
      const newTable: FloorPlanTable = {
        id: uid(),
        label: labelInput || `Стол ${activeRoom.tables.length + 1}`,
        x,
        y,
        radius: 28,
        capacity: Number(capacityInput) || 4,
        bookingSlots: []
      };
      setTables((prev) => [...prev, newTable]);
      setSelected({ kind: "table", id: newTable.id });
      return;
    }

    if (tool === "zone") {
      setDrag({ kind: "zone-draw", startX: x, startY: y, currentX: x, currentY: y });
      setSelected({ kind: "none" });
      return;
    }

    // select tool — check resize handle first
    if (selected.kind === "zone") {
      const zone = activeRoom.zones.find((z) => z.id === selected.id);
      if (zone && ptInHandle(x, y, zone.x + zone.width, zone.y + zone.height)) {
        setDrag({ kind: "resize-zone", zoneId: zone.id, handle: "se", startX: x, startY: y, origW: zone.width, origH: zone.height });
        return;
      }
    }

    // tables (front to back)
    for (let i = activeRoom.tables.length - 1; i >= 0; i--) {
      if (ptInCircle(x, y, activeRoom.tables[i])) {
        setSelected({ kind: "table", id: activeRoom.tables[i].id });
        setDrag({ kind: "move-table", tableId: activeRoom.tables[i].id, offsetX: x - activeRoom.tables[i].x, offsetY: y - activeRoom.tables[i].y });
        return;
      }
    }

    // zones (front to back)
    for (let i = activeRoom.zones.length - 1; i >= 0; i--) {
      if (ptInRect(x, y, activeRoom.zones[i])) {
        setSelected({ kind: "zone", id: activeRoom.zones[i].id });
        setDrag({ kind: "move-zone", zoneId: activeRoom.zones[i].id, offsetX: x - activeRoom.zones[i].x, offsetY: y - activeRoom.zones[i].y });
        return;
      }
    }

    setSelected({ kind: "none" });
  }

  function onMouseMove(e: React.MouseEvent<HTMLCanvasElement>) {
    const { x, y } = getPos(e);

    if (drag.kind === "zone-draw") {
      setDrag((prev) => (prev.kind === "zone-draw" ? { ...prev, currentX: x, currentY: y } : prev));
    } else if (drag.kind === "move-zone") {
      setZones((prev) =>
        prev.map((z) => (z.id === drag.zoneId ? { ...z, x: x - drag.offsetX, y: y - drag.offsetY } : z))
      );
    } else if (drag.kind === "move-table") {
      setTables((prev) =>
        prev.map((t) => (t.id === drag.tableId ? { ...t, x: x - drag.offsetX, y: y - drag.offsetY } : t))
      );
    } else if (drag.kind === "resize-zone") {
      const dw = x - drag.startX;
      const dh = y - drag.startY;
      setZones((prev) =>
        prev.map((z) =>
          z.id === drag.zoneId
            ? { ...z, width: Math.max(80, drag.origW + dw), height: Math.max(60, drag.origH + dh) }
            : z
        )
      );
    }
  }

  function onMouseUp(e: React.MouseEvent<HTMLCanvasElement>) {
    if (drag.kind === "zone-draw") {
      const { x, y } = getPos(e);
      const rx = Math.min(drag.startX, x);
      const ry = Math.min(drag.startY, y);
      const rw = Math.abs(x - drag.startX);
      const rh = Math.abs(y - drag.startY);

      if (rw > 30 && rh > 30) {
        const idx = activeRoom.zones.length;
        const newZone: FloorPlanZone = {
          id: uid(),
          label: labelInput || `Зона ${idx + 1}`,
          x: rx, y: ry,
          width: rw, height: rh,
          color: ZONE_COLORS[idx % ZONE_COLORS.length],
        };
        setColorIdxByRoom((prev) => ({
          ...prev,
          [activeRoom.id]: { ...(prev[activeRoom.id] || {}), [newZone.id]: idx },
        }));
        setZones((prev) => [...prev, newZone]);
        setSelected({ kind: "zone", id: newZone.id });
      }
    }
    setDrag({ kind: "none" });
  }

  function getCursor() {
    if (tool === "zone") return "crosshair";
    if (tool === "table") return "copy";
    return "default";
  }

  // ── Delete / Update ────────────────────────────────────────────────────────

  function deleteSelected() {
    if (selected.kind === "zone") {
      setZones((prev) => prev.filter((z) => z.id !== selected.id));
      setTables((prev) => prev.filter((t) => t.zoneId !== selected.id));
    } else if (selected.kind === "table") {
      setTables((prev) => prev.filter((t) => t.id !== selected.id));
    }
    setSelected({ kind: "none" });
  }

  function updateSelectedLabel(val: string) {
    if (selected.kind === "zone") {
      setZones((prev) => prev.map((z) => (z.id === selected.id ? { ...z, label: val } : z)));
    } else if (selected.kind === "table") {
      setTables((prev) => prev.map((t) => (t.id === selected.id ? { ...t, label: val } : t)));
    }
  }

  function updateSelectedCapacity(val: string) {
    if (selected.kind === "table") {
      setTables((prev) => prev.map((t) => (t.id === selected.id ? { ...t, capacity: Number(val) || 1 } : t)));
    }
  }

  function updateSelectedBookingSlots(slots: string[]) {
    if (selected.kind !== "table") {
      return;
    }

    setTables((prev) =>
      prev.map((table) =>
        table.id === selected.id
          ? { ...table, bookingSlots: normalizeBookingSlots(slots) }
          : table
      )
    );
  }

  const selectedZone = selected.kind === "zone" ? activeRoom.zones.find((z) => z.id === selected.id) : undefined;
  const selectedTable = selected.kind === "table" ? activeRoom.tables.find((t) => t.id === selected.id) : undefined;

  // ── Rooms management ──────────────────────────────────────────────────────

  function addRoom() {
    const next = createEmptyRoom(`Зал ${rooms.length + 1}`);
    setRooms((prev) => [...prev, next]);
    setActiveRoomId(next.id);
  }

  function renameRoom(id: string, name: string) {
    setRooms((prev) => prev.map((r) => (r.id === id ? { ...r, name } : r)));
  }

  function deleteRoom(id: string) {
    if (rooms.length <= 1) return;
    setRooms((prev) => {
      const next = prev.filter((r) => r.id !== id);
      if (id === activeRoomId) {
        setActiveRoomId(next[0].id);
      }
      return next;
    });
    setColorIdxByRoom((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }

  // ── Save ───────────────────────────────────────────────────────────────────

  async function handleSave() {
    await onSave({ rooms });
  }

  function normalizeBookingSlots(slots: string[]) {
    return [...new Set(slots.map((slot) => slot.trim()).filter(Boolean))].sort((left, right) =>
      left.localeCompare(right)
    );
  }

  function toggleBookingSlot(slot: string) {
    if (!selectedTable) {
      return;
    }

    const currentSlots = selectedTable.bookingSlots ?? [];
    updateSelectedBookingSlots(
      currentSlots.includes(slot)
        ? currentSlots.filter((item) => item !== slot)
        : [...currentSlots, slot]
    );
  }

  function addCustomBookingSlot() {
    if (!selectedTable || !slotInput) {
      return;
    }

    updateSelectedBookingSlots([...(selectedTable.bookingSlots ?? []), slotInput]);
    setSlotInput("");
  }

  function removeBookingSlot(slot: string) {
    if (!selectedTable) {
      return;
    }

    updateSelectedBookingSlots((selectedTable.bookingSlots ?? []).filter((item) => item !== slot));
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

      {/* Sections tabs */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        {rooms.map((room) => (
          <button
            key={room.id}
            type="button"
            onClick={() => setActiveRoomId(room.id)}
            style={{
              padding: "6px 14px",
              fontSize: 13,
              borderRadius: 8,
              border: room.id === activeRoom.id ? "2px solid #3b82f6" : "1px solid #e2e8f0",
              background: room.id === activeRoom.id ? "#dbeafe" : "#fff",
              color: room.id === activeRoom.id ? "#1e40af" : "#334155",
              cursor: "pointer",
              fontWeight: room.id === activeRoom.id ? 500 : 400,
            }}
          >
            {room.name}
          </button>
        ))}
        <button
          type="button"
          onClick={addRoom}
          style={{
            padding: "6px 12px",
            fontSize: 13,
            borderRadius: 8,
            border: "1px dashed #94a3b8",
            background: "#f8fafc",
            color: "#475569",
            cursor: "pointer",
          }}
        >
          + Добавить секцию
        </button>
      </div>

      {/* Active section name + delete */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <label style={{ fontSize: 12, color: "#64748b" }}>Название секции / зоны</label>
        <input
          value={activeRoom.name}
          onChange={(e) => renameRoom(activeRoom.id, e.target.value)}
          style={{ padding: "5px 10px", fontSize: 13, borderRadius: 8, border: "1px solid #e2e8f0", width: 220 }}
        />
        {rooms.length > 1 ? (
          <button
            type="button"
            onClick={() => deleteRoom(activeRoom.id)}
            style={{ padding: "6px 12px", fontSize: 13, borderRadius: 8, border: "1px solid #fca5a5", background: "#fee2e2", color: "#b91c1c", cursor: "pointer" }}
          >
            ✕ Удалить секцию
          </button>
        ) : null}
      </div>

      {/* Toolbar */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        {(["select", "zone", "table"] as Tool[]).map((t) => (
          <button
            key={t}
            onClick={() => setTool(t)}
            style={{
              padding: "6px 14px",
              fontSize: 13,
              borderRadius: 8,
              border: tool === t ? "2px solid #3b82f6" : "1px solid #e2e8f0",
              background: tool === t ? "#dbeafe" : "#fff",
              color: tool === t ? "#1e40af" : "#334155",
              cursor: "pointer",
              fontWeight: tool === t ? 500 : 400,
            }}
          >
            {t === "select" ? "↖ Выбор" : t === "zone" ? "□ Зона" : "○ Стол"}
          </button>
        ))}

        <div style={{ width: 1, height: 28, background: "#e2e8f0", margin: "0 4px" }} />

        <input
          placeholder={tool === "zone" ? "Название зоны" : "Название стола"}
          value={labelInput}
          onChange={(e) => setLabelInput(e.target.value)}
          style={{ padding: "5px 10px", fontSize: 13, borderRadius: 8, border: "1px solid #e2e8f0", width: 140 }}
        />

        {tool === "table" && (
          <input
            type="number"
            min={1}
            max={50}
            placeholder="Мест"
            value={capacityInput}
            onChange={(e) => setCapacityInput(e.target.value)}
            style={{ padding: "5px 10px", fontSize: 13, borderRadius: 8, border: "1px solid #e2e8f0", width: 72 }}
          />
        )}

        <div style={{ flex: 1 }} />

        {selected.kind !== "none" && (
          <button
            onClick={deleteSelected}
            style={{ padding: "6px 12px", fontSize: 13, borderRadius: 8, border: "1px solid #fca5a5", background: "#fee2e2", color: "#b91c1c", cursor: "pointer" }}
          >
            ✕ Удалить
          </button>
        )}

        <button
          onClick={handleSave}
          disabled={saving}
          style={{ padding: "6px 18px", fontSize: 13, borderRadius: 8, border: "none", background: saving ? "#93c5fd" : "#3b82f6", color: "#fff", cursor: saving ? "not-allowed" : "pointer", fontWeight: 500 }}
        >
          {saving ? "Сохранение…" : "Сохранить"}
        </button>
      </div>

      {/* Canvas + Properties panel */}
      <div style={{ display: "flex", gap: 12 }}>
        <div style={{ flex: 1, border: "1px solid #e2e8f0", borderRadius: 12, overflow: "hidden", background: "#f8fafc" }}>
          <canvas
            ref={canvasRef}
            width={activeRoom.canvasWidth}
            height={activeRoom.canvasHeight}
            style={{ width: "100%", height: "auto", display: "block", cursor: getCursor() }}
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
          />
        </div>

        <div style={{ width: 200, display: "flex", flexDirection: "column", gap: 12 }}>
          {(selectedZone || selectedTable) && (
            <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: 14 }}>
              <p style={{ fontSize: 12, fontWeight: 500, color: "#64748b", margin: "0 0 10px", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                {selectedZone ? "Зона" : "Стол"}
              </p>

              <label style={{ fontSize: 12, color: "#64748b", display: "block", marginBottom: 4 }}>Название</label>
              <input
                value={selectedZone?.label ?? selectedTable?.label ?? ""}
                onChange={(e) => updateSelectedLabel(e.target.value)}
                style={{ width: "100%", padding: "5px 8px", fontSize: 13, borderRadius: 6, border: "1px solid #e2e8f0", boxSizing: "border-box", color: "#0f172a" }}
              />

              {selectedTable && (
                <>
                  <label style={{ fontSize: 12, color: "#64748b", display: "block", marginTop: 10, marginBottom: 4 }}>Количество мест</label>
                  <input
                    type="number"
                    min={1}
                    max={50}
                    value={selectedTable.capacity}
                    onChange={(e) => updateSelectedCapacity(e.target.value)}
                    style={{ width: "100%", padding: "5px 8px", fontSize: 13, borderRadius: 6, border: "1px solid #e2e8f0", boxSizing: "border-box", color: "#0f172a" }}
                  />

                  <div style={{ height: 1, background: "#e2e8f0", margin: "12px 0" }} />

                  <p style={{ fontSize: 12, fontWeight: 600, color: "#475569", margin: "0 0 8px", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    Часы этого стола
                  </p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
                    {slotPresets.map((slot) => {
                      const active = (selectedTable.bookingSlots ?? []).includes(slot);
                      return (
                        <button
                          key={slot}
                          onClick={() => toggleBookingSlot(slot)}
                          style={{
                            padding: "7px 12px",
                            fontSize: 12,
                            borderRadius: 999,
                            border: active ? "1px solid #c9a44a" : "1px solid #d5dde9",
                            background: active ? "rgba(201, 164, 74, 0.14)" : "#fff",
                            color: active ? "#6b4f12" : "#475569",
                            cursor: "pointer",
                            fontWeight: 600
                          }}
                          type="button"
                        >
                          {slot}
                        </button>
                      );
                    })}
                  </div>

                  <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                    <input
                      onChange={(e) => setSlotInput(e.target.value)}
                      style={{
                        flex: 1,
                        padding: "7px 10px",
                        fontSize: 13,
                        borderRadius: 8,
                        border: "1px solid #d5dde9",
                        background: "#fff",
                        color: "#0f172a"
                      }}
                      type="time"
                      value={slotInput}
                    />
                    <button
                      onClick={addCustomBookingSlot}
                      style={{
                        padding: "7px 12px",
                        fontSize: 12,
                        borderRadius: 8,
                        border: "1px solid #c9a44a",
                        background: "#f8edd1",
                        color: "#6b4f12",
                        cursor: "pointer",
                        fontWeight: 600
                      }}
                      type="button"
                    >
                      Добавить
                    </button>
                  </div>

                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {(selectedTable.bookingSlots ?? []).length > 0 ? (
                      (selectedTable.bookingSlots ?? []).map((slot) => (
                        <button
                          key={slot}
                          onClick={() => removeBookingSlot(slot)}
                          style={{
                            padding: "7px 12px",
                            fontSize: 12,
                            borderRadius: 999,
                            border: "1px solid #e2c47a",
                            background: "#fff7e0",
                            color: "#5e4a18",
                            cursor: "pointer",
                            fontWeight: 600
                          }}
                          type="button"
                        >
                          {slot} ×
                        </button>
                      ))
                    ) : (
                      <span style={{ fontSize: 12, color: "#94a3b8" }}>
                        Для этого стола слоты пока не заданы.
                      </span>
                    )}
                  </div>
                </>
              )}

              {selectedZone && (
                <div style={{ marginTop: 10, fontSize: 12, color: "#94a3b8" }}>
                  {Math.round(selectedZone.width)} × {Math.round(selectedZone.height)} px
                </div>
              )}
            </div>
          )}

          <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: 14 }}>
            <p style={{ fontSize: 12, fontWeight: 500, color: "#64748b", margin: "0 0 10px", textTransform: "uppercase", letterSpacing: "0.05em" }}>Инструкция</p>
            <div style={{ fontSize: 12, color: "#64748b", lineHeight: 1.7 }}>
              <p style={{ margin: "0 0 4px" }}>□ <b>Зона</b> — нажмите и тяните</p>
              <p style={{ margin: "0 0 4px" }}>○ <b>Стол</b> — кликните на canvas</p>
              <p style={{ margin: "0 0 4px" }}>↖ <b>Выбор</b> — двигайте объекты</p>
              <p style={{ margin: 0 }}>• Угол зоны — для изменения размера</p>
            </div>
          </div>

          <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 12, padding: 14 }}>
            <div style={{ fontSize: 13, color: "#334155" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ color: "#64748b" }}>Комнат</span>
                <b>{rooms.length}</b>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ color: "#64748b" }}>Зон</span>
                <b>{activeRoom.zones.length}</b>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ color: "#64748b" }}>Столов</span>
                <b>{activeRoom.tables.length}</b>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "#64748b" }}>Всего мест</span>
                <b>{activeRoom.tables.reduce((s, t) => s + t.capacity, 0)}</b>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div style={{ fontSize: 12, color: "#94a3b8", textAlign: "center" }}>
        Каждая секция — отдельная схема. VIP, Welcome, Lobby и другие области переключаются через вкладки сверху.
      </div>
    </div>
  );
}
