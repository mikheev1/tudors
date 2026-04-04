import cors from "cors";
import express from "express";
import { z } from "zod";

import { loadBackendEnv } from "./load-env";
import { createRealBooking } from "@/lib/manager-bookings";
import { createWaitlistEntry } from "@/lib/operations";
import { getVenueAvailabilitySlots } from "@/lib/availability";
import { buildBookingFeedback, buildWaitlistFeedback } from "@/lib/processes";
import { getVenueSearchResults, sanitizeVenueSearchFilters } from "@/lib/server/venue-search";
import { bookingRequestSchema } from "@/lib/validation";
import { getPublicVenues } from "@/lib/venue-repository";

loadBackendEnv();

const app = express();
const port = Number(process.env.BACKEND_PORT || 4000);
const frontendOrigin = process.env.FRONTEND_ORIGIN || "http://localhost:3000";

const waitlistSchema = z.object({
  venueId: z.string().min(1),
  venueName: z.string().min(1),
  sceneId: z.string().min(1),
  sceneTitle: z.string().min(1),
  hotspotId: z.string().optional(),
  hotspotLabel: z.string().optional(),
  name: z.string().min(2, "Введите имя"),
  phone: z.string().min(7, "Введите номер телефона"),
  date: z.string().optional(),
  time: z.string().optional(),
  telegram: z
    .string()
    .trim()
    .optional()
    .transform((value) => value || undefined)
    .refine((value) => !value || /^@?[a-zA-Z0-9_]{5,32}$/.test(value), "Введите корректный Telegram")
});

app.use(
  cors({
    origin: frontendOrigin,
    credentials: true
  })
);
app.use(express.json({ limit: "1mb" }));

app.get("/health", (_request, response) => {
  response.json({
    ok: true,
    service: "tudors-backend"
  });
});

app.get("/api/venues", async (request, response) => {
  try {
    const filters = sanitizeVenueSearchFilters(request.query as Record<string, string | string[] | undefined>);
    const items = await getVenueSearchResults(filters);

    response.json({
      ok: true,
      items
    });
  } catch (error) {
    console.error("Failed to load venues", error);
    response.status(500).json({
      ok: false,
      message: "Не удалось загрузить объекты."
    });
  }
});

app.get("/api/availability", async (request, response) => {
  const venueId = String(request.query.venueId || "");
  const date = String(request.query.date || "");
  const hotspotLabel = request.query.hotspotLabel ? String(request.query.hotspotLabel) : undefined;
  const hotspotStatus = request.query.hotspotStatus ? String(request.query.hotspotStatus) : undefined;
  const hotspotKind = request.query.hotspotKind ? String(request.query.hotspotKind) : undefined;

  if (!venueId || !date) {
    response.status(400).json({
      ok: false,
      message: "venueId и date обязательны."
    });
    return;
  }

  try {
    const venues = await getPublicVenues();
    const venue = venues.find((item) => item.id === venueId);

    if (!venue) {
      response.status(404).json({
        ok: false,
        message: "Объект не найден."
      });
      return;
    }

    const slots = await getVenueAvailabilitySlots({
      venue,
      date,
      hotspotLabel,
      hotspotStatus,
      hotspotKind
    });

    response.json({
      ok: true,
      data: slots
    });
  } catch (error) {
    console.error("Failed to load availability", error);
    response.status(500).json({
      ok: false,
      message: "Не удалось загрузить доступность."
    });
  }
});

app.post("/api/booking-requests", async (request, response) => {
  const result = bookingRequestSchema.safeParse(request.body);

  if (!result.success) {
    response.status(400).json({
      ok: false,
      message: "Заявка не прошла валидацию.",
      issues: result.error.issues.map((issue) => issue.message)
    });
    return;
  }

  const selectedSpot = result.data.comment?.split("|")[0]?.trim() || "выбранному месту";
  const feedback = buildBookingFeedback(
    result.data.venue,
    selectedSpot,
    result.data.date,
    result.data.time
  );

  try {
    await createRealBooking(result.data);
  } catch (error) {
    console.error("Failed to create booking request", error);
    response.status(500).json({
      ok: false,
      message: error instanceof Error ? error.message : "Не удалось сохранить заявку в базе."
    });
    return;
  }

  response.status(201).json({
    ok: true,
    ...feedback
  });
});

app.post("/api/waitlist", (request, response) => {
  const result = waitlistSchema.safeParse(request.body);

  if (!result.success) {
    response.status(400).json({
      ok: false,
      message: "Не удалось добавить в лист ожидания.",
      issues: result.error.issues.map((issue) => issue.message)
    });
    return;
  }

  void createWaitlistEntry(result.data)
    .then(() => {
      const feedback = buildWaitlistFeedback(
        result.data.venueName,
        result.data.hotspotLabel || result.data.sceneTitle
      );

      response.status(201).json({
        ok: true,
        ...feedback
      });
    })
    .catch((error) => {
      console.error("Failed to create waitlist entry", error);
      response.status(500).json({
        ok: false,
        message: "Не удалось добавить в лист ожидания."
      });
    });
});

app.listen(port, () => {
  console.log(`Tudors Studio backend is running on http://localhost:${port}`);
});
