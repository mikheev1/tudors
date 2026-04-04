import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const dataDir = path.join(process.cwd(), "data");
const configPath = path.join(dataDir, "venue-booking-config.json");

export type VenueBookingConfig = {
  venueId: string;
  bookingSlots: string[];
};

async function ensureDataDir() {
  await mkdir(dataDir, { recursive: true });
}

async function readConfigFile(): Promise<VenueBookingConfig[]> {
  try {
    const raw = await readFile(configPath, "utf8");
    return JSON.parse(raw) as VenueBookingConfig[];
  } catch {
    return [];
  }
}

async function writeConfigFile(value: VenueBookingConfig[]) {
  await ensureDataDir();
  await writeFile(configPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function normalizeSlots(slots: string[]) {
  return [...new Set(
    slots
      .map((slot) => slot.trim())
      .filter(Boolean)
      .sort((left, right) => left.localeCompare(right))
  )];
}

export async function getVenueBookingConfigs() {
  return readConfigFile();
}

export async function getVenueBookingConfig(venueId: string) {
  const configs = await readConfigFile();
  return configs.find((item) => item.venueId === venueId) ?? null;
}

export async function updateVenueBookingConfig(venueId: string, bookingSlots: string[]) {
  const configs = await readConfigFile();
  const nextEntry: VenueBookingConfig = {
    venueId,
    bookingSlots: normalizeSlots(bookingSlots)
  };
  const nextConfigs = configs.some((item) => item.venueId === venueId)
    ? configs.map((item) => (item.venueId === venueId ? nextEntry : item))
    : [...configs, nextEntry];

  await writeConfigFile(nextConfigs);
  return nextEntry;
}
