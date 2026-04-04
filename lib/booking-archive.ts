import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const dataDir = path.join(process.cwd(), "data");
const archivePath = path.join(dataDir, "archived-bookings.json");

type BookingArchiveRecord = {
  bookingId: string;
  archivedAt: string;
};

async function ensureDataDir() {
  await mkdir(dataDir, { recursive: true });
}

async function readArchiveFile(): Promise<BookingArchiveRecord[]> {
  try {
    const raw = await readFile(archivePath, "utf8");
    return JSON.parse(raw) as BookingArchiveRecord[];
  } catch {
    return [];
  }
}

async function writeArchiveFile(value: BookingArchiveRecord[]) {
  await ensureDataDir();
  await writeFile(archivePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export async function getArchivedBookingIds() {
  const rows = await readArchiveFile();
  return new Set(rows.map((row) => row.bookingId));
}

export async function archiveBooking(bookingId: string) {
  const rows = await readArchiveFile();
  if (rows.some((row) => row.bookingId === bookingId)) {
    return;
  }

  await writeArchiveFile([
    ...rows,
    {
      bookingId,
      archivedAt: new Date().toISOString()
    }
  ]);
}

export async function restoreBooking(bookingId: string) {
  const rows = await readArchiveFile();
  await writeArchiveFile(rows.filter((row) => row.bookingId !== bookingId));
}
