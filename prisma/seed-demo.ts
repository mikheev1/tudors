/**
 * Демо-сид для показа карточки гостя на встрече с ресторатором.
 *
 * Создаёт три «постоянных» гостя с историей бронирований за последние 4 месяца.
 * Идемпотентен: при повторном запуске удаляет старые seed-demo брони и создаёт заново.
 *
 * Запуск: npx tsx prisma/seed-demo.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const DEMO_SOURCE = "seed-demo";

/** Под какую компанию/venue/менеджера сеем. Берём city-table — основной демо-аккаунт. */
const COMPANY = {
  id: "city-table",
  slug: "city-table",
  name: "City Table",
  logoText: "CT",
  accent: "#c0392b",
  accentDark: "#1f1b16",
  surfaceTint: "rgba(31,27,22,0.92)",
};

const MANAGER = {
  id: "mgr-city-1",
  email: "city.manager@local.tudors",
  fullName: "Amina Rakhimova",
  role: "admin",
};

const VENUE = {
  id: "bukhara-courtyard",
  slug: "bukhara-courtyard",
  name: "Bukhara Courtyard",
  vertical: "restaurant",
  city: "Ташкент",
  description: "Городской ресторан с уютным внутренним двориком.",
  capacityMax: 80,
};

type DemoGuest = {
  name: string;
  phone: string;
  telegram?: string;
  /** Сколько всего историй создать */
  total: number;
  /** Сколько из них no-show */
  noShows: number;
  /** Сколько в статусе NEW (ожидают подтверждения, ещё не прошли) */
  pending: number;
  /** Любимое место для подавляющего большинства броней */
  favorite: { roomName: string; tableLabel: string; tableId: string };
  averageGuests: number;
};

const guests: DemoGuest[] = [
  {
    name: "Анна Каримова",
    phone: "+998901234567",
    telegram: "@anna_karimova",
    total: 12,
    noShows: 1,
    pending: 1,
    favorite: { roomName: "Терраса", tableLabel: "Стол 4", tableId: "demo-table-terrace-4" },
    averageGuests: 2,
  },
  {
    name: "Дилшод Рахимов",
    phone: "+998931112233",
    telegram: "@dilshod_r",
    total: 6,
    noShows: 0,
    pending: 0,
    favorite: { roomName: "Главный зал", tableLabel: "Стол 9", tableId: "demo-table-main-9" },
    averageGuests: 4,
  },
  {
    name: "Шахзод Турсунов",
    phone: "+998998765432",
    total: 4,
    noShows: 2,
    pending: 0,
    favorite: { roomName: "Главный зал", tableLabel: "Стол 2", tableId: "demo-table-main-2" },
    averageGuests: 6,
  },
];

const TIMES = ["12:00", "13:30", "18:00", "19:00", "19:30", "20:00", "21:00", "21:30"];

function buildBookingComment(input: {
  placeLabel: string;
  slotLabel: string;
  telegram?: string;
  tableId?: string;
  roomName?: string;
  note?: string;
}) {
  return [
    input.placeLabel,
    input.slotLabel,
    input.note || "",
    input.telegram ? `TG: ${input.telegram}` : "",
    input.roomName ? `ROOM: ${input.roomName}` : "",
    input.tableId ? `TABLE_ID: ${input.tableId}` : "",
  ]
    .filter(Boolean)
    .join(" | ");
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

async function ensureBase() {
  await prisma.company.upsert({
    where: { id: COMPANY.id },
    update: {
      name: COMPANY.name,
      slug: COMPANY.slug,
      logoText: COMPANY.logoText,
      accent: COMPANY.accent,
      accentDark: COMPANY.accentDark,
      surfaceTint: COMPANY.surfaceTint,
    },
    create: {
      id: COMPANY.id,
      slug: COMPANY.slug,
      name: COMPANY.name,
      logoText: COMPANY.logoText,
      accent: COMPANY.accent,
      accentDark: COMPANY.accentDark,
      surfaceTint: COMPANY.surfaceTint,
    },
  });

  await prisma.manager.upsert({
    where: { id: MANAGER.id },
    update: {
      companyId: COMPANY.id,
      email: MANAGER.email,
      fullName: MANAGER.fullName,
      role: MANAGER.role,
    },
    create: {
      id: MANAGER.id,
      companyId: COMPANY.id,
      email: MANAGER.email,
      fullName: MANAGER.fullName,
      role: MANAGER.role,
    },
  });

  await prisma.venue.upsert({
    where: { id: VENUE.id },
    update: {
      companyId: COMPANY.id,
      ownerManagerId: MANAGER.id,
      slug: VENUE.slug,
      name: VENUE.name,
      vertical: VENUE.vertical,
      city: VENUE.city,
      description: VENUE.description,
      capacityMax: VENUE.capacityMax,
      status: "ACTIVE",
    },
    create: {
      id: VENUE.id,
      companyId: COMPANY.id,
      ownerManagerId: MANAGER.id,
      slug: VENUE.slug,
      name: VENUE.name,
      vertical: VENUE.vertical,
      city: VENUE.city,
      description: VENUE.description,
      capacityMax: VENUE.capacityMax,
      status: "ACTIVE",
    },
  });
}

async function clearPriorDemo() {
  const result = await prisma.bookingRequest.deleteMany({ where: { sourceLabel: DEMO_SOURCE } });
  return result.count;
}

async function seedGuestBookings(guest: DemoGuest) {
  let created = 0;
  // Спрэдим брони равномерно по последним 120 дням.
  const totalDaysWindow = 120;
  const step = Math.max(7, Math.floor(totalDaysWindow / Math.max(1, guest.total)));

  for (let i = 0; i < guest.total; i++) {
    const isPending = i < guest.pending;
    const isNoShow = !isPending && i >= guest.pending && i < guest.pending + guest.noShows;

    // Pending — ставим в будущее, остальное в прошлое
    const dayOffset = isPending ? -(2 + Math.floor(Math.random() * 5)) : (i + 1) * step + Math.floor(Math.random() * 4);
    const eventDate = new Date();
    eventDate.setDate(eventDate.getDate() - dayOffset);
    const time = pick(TIMES);
    eventDate.setHours(Number(time.slice(0, 2)), Number(time.slice(3, 5)), 0, 0);

    const useFavorite = Math.random() < 0.75; // 75% на любимом столе
    const place = useFavorite
      ? guest.favorite
      : { roomName: pick(["Терраса", "Главный зал", "VIP-зал"]), tableLabel: `Стол ${1 + Math.floor(Math.random() * 14)}`, tableId: `demo-rand-${Math.random().toString(36).slice(2, 8)}` };

    const guestCount = Math.max(1, Math.round(guest.averageGuests + (Math.random() - 0.5) * 2));

    let status: "CONFIRMED" | "CANCELLED" | "NEW" | "HOLD_PENDING";
    let managerNote: string;
    if (isPending) {
      status = i % 2 === 0 ? "NEW" : "HOLD_PENDING";
      managerNote = i % 2 === 0 ? "Новая заявка, ожидает подтверждения" : "Hold 30 минут";
    } else if (isNoShow) {
      status = "CANCELLED";
      managerNote = "Не пришёл — снято автоматически";
    } else {
      status = "CONFIRMED";
      managerNote = "[ARRIVED] Гость пришёл и посажен · Подтверждено менеджером";
    }

    await prisma.bookingRequest.create({
      data: {
        venueId: VENUE.id,
        managerId: MANAGER.id,
        eventType: VENUE.vertical,
        guestCount,
        eventDate,
        startTime: time,
        customerName: guest.name,
        customerPhone: guest.phone,
        comment: buildBookingComment({
          placeLabel: place.tableLabel,
          slotLabel: time,
          telegram: guest.telegram,
          tableId: place.tableId,
          roomName: place.roomName,
        }),
        sourceLabel: DEMO_SOURCE,
        managerNote,
        status,
      },
    });
    created += 1;
  }

  return created;
}

async function main() {
  console.log("📦 Подготавливаем демо-окружение…");
  await ensureBase();

  console.log("🧹 Чистим предыдущие демо-данные…");
  const cleared = await clearPriorDemo();
  console.log(`   удалено старых демо-броней: ${cleared}`);

  let total = 0;
  for (const guest of guests) {
    const count = await seedGuestBookings(guest);
    total += count;
    console.log(`✅ ${guest.name} (${guest.phone}) — создано броней: ${count}`);
  }

  console.log("");
  console.log(`🎉 Готово. Всего демо-броней: ${total}`);
  console.log("");
  console.log("На демо-встрече покажи карточку гостя:");
  guests.forEach((g) => console.log(`   • ${g.name} — телефон ${g.phone}`));
  console.log("");
  console.log("Все эти телефоны — рабочие для guest lookup. Введи любой в Manual booking → появится плашка.");
}

main()
  .catch((err) => {
    console.error("❌ Demo seed failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
