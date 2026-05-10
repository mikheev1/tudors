import type { FloorPlanData, FloorPlanRoom, FloorPlanTable, FloorPlanZone, Scene } from "@/lib/types";

const DEFAULT_CANVAS_W = 1280;
const DEFAULT_CANVAS_H = 820;

function roomId() {
  return `room-${Math.random().toString(36).slice(2, 9)}`;
}

export function createEmptyRoom(name = "Зал"): FloorPlanRoom {
  return {
    id: roomId(),
    name,
    canvasWidth: DEFAULT_CANVAS_W,
    canvasHeight: DEFAULT_CANVAS_H,
    zones: [],
    tables: [],
  };
}

function normalizeTable(raw: unknown): FloorPlanTable {
  const table = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    id: typeof table.id === "string" && table.id ? table.id : `table-${Math.random().toString(36).slice(2, 9)}`,
    label: typeof table.label === "string" && table.label ? table.label : "Стол",
    x: typeof table.x === "number" ? table.x : 0,
    y: typeof table.y === "number" ? table.y : 0,
    radius: typeof table.radius === "number" ? table.radius : 28,
    capacity: typeof table.capacity === "number" ? table.capacity : 4,
    zoneId: typeof table.zoneId === "string" && table.zoneId ? table.zoneId : undefined,
    bookingSlots: Array.isArray(table.bookingSlots)
      ? table.bookingSlots.map((slot) => String(slot).trim()).filter(Boolean)
      : []
  };
}

/**
 * Приводит произвольный JSON из БД к актуальному виду FloorPlanData.
 * Поддерживает:
 *   - null/undefined  → пустой набор комнат
 *   - старый формат { canvasWidth, canvasHeight, zones[], tables[] } → одна комната «Зал»
 *   - новый формат   { rooms: FloorPlanRoom[] }                    → как есть
 */
export function migrateFloorPlan(raw: unknown): FloorPlanData {
  if (!raw || typeof raw !== "object") {
    return { rooms: [] };
  }

  const data = raw as Record<string, unknown>;

  if (Array.isArray(data.rooms)) {
    return {
      rooms: data.rooms.map((room) => normalizeRoom(room)),
    };
  }

  // legacy single-canvas
  if (Array.isArray(data.zones) || Array.isArray(data.tables)) {
    return {
      rooms: [
        {
          id: "room-main",
          name: "Зал",
          canvasWidth:
            typeof data.canvasWidth === "number" ? data.canvasWidth : DEFAULT_CANVAS_W,
          canvasHeight:
            typeof data.canvasHeight === "number" ? data.canvasHeight : DEFAULT_CANVAS_H,
          zones: (Array.isArray(data.zones) ? data.zones : []) as FloorPlanZone[],
          tables: (Array.isArray(data.tables) ? data.tables : []) as FloorPlanTable[],
        },
      ],
    };
  }

  return { rooms: [] };
}

function normalizeRoom(raw: unknown): FloorPlanRoom {
  const room = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    id: typeof room.id === "string" && room.id ? room.id : roomId(),
    name: typeof room.name === "string" && room.name ? room.name : "Комната",
    canvasWidth:
      typeof room.canvasWidth === "number" ? room.canvasWidth : DEFAULT_CANVAS_W,
    canvasHeight:
      typeof room.canvasHeight === "number" ? room.canvasHeight : DEFAULT_CANVAS_H,
    zones: Array.isArray(room.zones) ? (room.zones as FloorPlanZone[]) : [],
    tables: Array.isArray(room.tables) ? room.tables.map((table) => normalizeTable(table)) : [],
  };
}

/** Все столы из всех комнат (для занятости и поиска по label). */
export function collectAllTables(data: FloorPlanData | null | undefined): FloorPlanTable[] {
  if (!data) return [];
  return data.rooms.flatMap((room) => room.tables);
}

function normalizeKey(value?: string) {
  return (value || "").trim().toLowerCase();
}

function compareStableText(left?: string, right?: string) {
  const normalizedLeft = normalizeKey(left);
  const normalizedRight = normalizeKey(right);
  if (normalizedLeft < normalizedRight) return -1;
  if (normalizedLeft > normalizedRight) return 1;
  const rawLeft = left || "";
  const rawRight = right || "";
  if (rawLeft < rawRight) return -1;
  if (rawLeft > rawRight) return 1;
  return 0;
}

function parseCapacity(capacity?: string) {
  const match = capacity?.match(/\d+/);
  return match ? Number(match[0]) : 4;
}

function buildFallbackTables(room: FloorPlanRoom, scene: Scene, sharedSlots: string[]): FloorPlanTable[] {
  const tableHotspots = scene.hotspots.filter((item) => item.kind === "table");
  if (tableHotspots.length === 0) {
    return [];
  }

  const columns = Math.min(3, tableHotspots.length);
  const spacingX = room.canvasWidth / (columns + 1);
  const rows = Math.ceil(tableHotspots.length / columns);
  const spacingY = room.canvasHeight / (rows + 1);

  return tableHotspots.map((hotspot, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);

    return {
      id: `hotspot-table:${hotspot.id}`,
      label: hotspot.heading ?? hotspot.label,
      x: Math.round(spacingX * (column + 1)),
      y: Math.round(spacingY * (row + 1)),
      radius: 28,
      capacity: parseCapacity(hotspot.capacity),
      bookingSlots: sharedSlots
    };
  });
}

export function hydrateFloorPlanRooms(
  floorPlan: FloorPlanData | null | undefined,
  scenes: Scene[]
): FloorPlanData | null {
  if (!floorPlan) {
    return null;
  }

  const sharedSlots = [
    ...new Set(
      floorPlan.rooms.flatMap((room) =>
        room.tables.flatMap((table) => table.bookingSlots ?? [])
      )
    )
  ].sort(compareStableText);

  return {
    rooms: floorPlan.rooms.map((room) => {
      if (room.tables.length > 0) {
        return room;
      }

      const matchedScene = scenes.find(
        (scene) => normalizeKey(scene.floorPlanLabel || scene.title) === normalizeKey(room.name)
      );

      if (!matchedScene) {
        return room;
      }

      const fallbackTables = buildFallbackTables(room, matchedScene, sharedSlots);
      if (fallbackTables.length === 0) {
        return room;
      }

      return {
        ...room,
        tables: fallbackTables
      };
    })
  };
}
