import { venues as fallbackVenues } from "@/lib/data";
import { getVenueBookingConfigs, updateVenueBookingConfig } from "@/lib/venue-booking-config";
import { getDatabaseUnavailableError, prisma } from "@/lib/prisma";
import type { FloorPlanData, Hotspot, Scene, Venue } from "@/lib/types";

function enrichHotspot(venueId: string, sceneId: string, hotspotId: string, partial: Partial<Hotspot>): Hotspot {
  const fallbackVenue = fallbackVenues.find((item) => item.id === venueId);
  const fallbackScene = fallbackVenue?.scenes.find((item) => item.id === sceneId);
  const fallbackHotspot = fallbackScene?.hotspots.find((item) => item.id === hotspotId);

  return {
    id: hotspotId,
    label: partial.label || fallbackHotspot?.label || "Точка",
    kind: partial.kind || fallbackHotspot?.kind || "zone",
    target: partial.target ?? fallbackHotspot?.target,
    pitch: partial.pitch ?? fallbackHotspot?.pitch,
    yaw: partial.yaw ?? fallbackHotspot?.yaw,
    heading: partial.heading ?? fallbackHotspot?.heading,
    status: partial.status ?? fallbackHotspot?.status,
    capacity: partial.capacity ?? fallbackHotspot?.capacity,
    deposit: partial.deposit ?? fallbackHotspot?.deposit,
    minSpend: partial.minSpend ?? fallbackHotspot?.minSpend,
    conditions: partial.conditions ?? fallbackHotspot?.conditions ?? []
  };
}

function enrichScene(venueId: string, sceneId: string, partial: Partial<Scene>): Scene {
  const fallbackVenue = fallbackVenues.find((item) => item.id === venueId);
  const fallbackScene = fallbackVenue?.scenes.find((item) => item.id === sceneId);

  return {
    id: sceneId,
    title: partial.title || fallbackScene?.title || "Сцена",
    description: partial.description || fallbackScene?.description || "",
    image: partial.image || fallbackScene?.image || "",
    panoramaUrl: partial.panoramaUrl || fallbackScene?.panoramaUrl || "",
    previewUrl: partial.previewUrl || fallbackScene?.previewUrl,
    initialPitch: partial.initialPitch ?? fallbackScene?.initialPitch,
    initialYaw: partial.initialYaw ?? fallbackScene?.initialYaw,
    initialHfov: partial.initialHfov ?? fallbackScene?.initialHfov,
    floorPlanLabel: partial.floorPlanLabel || fallbackScene?.floorPlanLabel,
    hotspots: partial.hotspots || fallbackScene?.hotspots || []
  };
}

async function seedVenueToDb(venue: Venue) {
  const db = prisma as any;

  await db.venue.upsert({
    where: { id: venue.id },
    update: {
      companyId: venue.companyId,
      ownerManagerId: venue.ownerManagerId,
      name: venue.name,
      vertical: venue.vertical,
      city: venue.city,
      description: venue.summary,
      capacityMax: venue.capacity,
      status: "ACTIVE"
    },
    create: {
      id: venue.id,
      companyId: venue.companyId,
      ownerManagerId: venue.ownerManagerId,
      slug: venue.id,
      name: venue.name,
      vertical: venue.vertical,
      city: venue.city,
      description: venue.summary,
      capacityMax: venue.capacity,
      status: "ACTIVE"
    }
  });

  await db.panoramaTour.upsert({
    where: { id: `${venue.id}-tour` },
    update: {
      venueId: venue.id,
      status: "active",
      coverSceneId: venue.scenes[0]?.id ?? null
    },
    create: {
      id: `${venue.id}-tour`,
      venueId: venue.id,
      status: "active",
      coverSceneId: venue.scenes[0]?.id ?? null
    }
  });

  for (const scene of venue.scenes) {
    await db.panoramaScene.upsert({
      where: { id: scene.id },
      update: {
        tourId: `${venue.id}-tour`,
        name: scene.title,
        sourceImageUrl: scene.panoramaUrl,
        yawDefault: scene.initialYaw ?? null,
        pitchDefault: scene.initialPitch ?? null,
        hfovDefault: scene.initialHfov ?? null,
        sortOrder: venue.scenes.findIndex((item) => item.id === scene.id)
      },
      create: {
        id: scene.id,
        tourId: `${venue.id}-tour`,
        name: scene.title,
        sourceImageUrl: scene.panoramaUrl,
        yawDefault: scene.initialYaw ?? null,
        pitchDefault: scene.initialPitch ?? null,
        hfovDefault: scene.initialHfov ?? null,
        sortOrder: venue.scenes.findIndex((item) => item.id === scene.id)
      }
    });
  }

  for (const scene of venue.scenes) {
    for (const hotspot of scene.hotspots) {
      await db.sceneHotspot.upsert({
        where: { id: hotspot.id },
        update: {
          sceneId: scene.id,
          targetSceneId: hotspot.target ?? null,
          yaw: hotspot.yaw ?? null,
          pitch: hotspot.pitch ?? null,
          label: hotspot.label,
          kind: hotspot.kind
        },
        create: {
          id: hotspot.id,
          sceneId: scene.id,
          targetSceneId: hotspot.target ?? null,
          yaw: hotspot.yaw ?? null,
          pitch: hotspot.pitch ?? null,
          label: hotspot.label,
          kind: hotspot.kind
        }
      });
    }
  }
}

export async function ensureVenueSeedData() {
  for (const venue of fallbackVenues) {
    await seedVenueToDb(venue);
  }
}

export async function getPublicVenues(): Promise<Venue[]> {
  const db = prisma as any;

  try {
    await ensureVenueSeedData();

    const rows = await db.venue.findMany({
      include: {
        tours: {
          include: {
            scenes: {
              include: {
                hotspots: true
              },
              orderBy: {
                sortOrder: "asc"
              }
            }
          }
        }
      },
      orderBy: {
        createdAt: "asc"
      }
    });
    const bookingConfigs = await getVenueBookingConfigs();

    return rows.map((row: any) => {
      const fallbackVenue = fallbackVenues.find((item) => item.id === row.id);
      const slotConfig = bookingConfigs.find((item) => item.venueId === row.id);
      const scenes: Scene[] =
        row.tours?.[0]?.scenes?.map((scene: any) =>
          enrichScene(row.id, scene.id, {
            title: scene.name,
            description:
              fallbackVenue?.scenes.find((item) => item.id === scene.id)?.description || "",
            image: fallbackVenue?.scenes.find((item) => item.id === scene.id)?.image || "",
            panoramaUrl: scene.sourceImageUrl,
            previewUrl: fallbackVenue?.scenes.find((item) => item.id === scene.id)?.previewUrl,
            initialPitch: scene.pitchDefault,
            initialYaw: scene.yawDefault,
            initialHfov: scene.hfovDefault,
            floorPlanLabel:
              fallbackVenue?.scenes.find((item) => item.id === scene.id)?.floorPlanLabel || "",
            hotspots: scene.hotspots.map((hotspot: any) =>
              enrichHotspot(row.id, scene.id, hotspot.id, {
                label: hotspot.label,
                kind: hotspot.kind,
                target: hotspot.targetSceneId,
                pitch: hotspot.pitch,
                yaw: hotspot.yaw
              })
            )
          })
        ) || [];

      return {
        id: row.id,
        companyId: row.companyId,
        ownerManagerId: row.ownerManagerId,
        name: row.name,
        vertical: row.vertical,
        type: fallbackVenue?.type || "Объект",
        city: row.city,
        capacity: row.capacityMax || fallbackVenue?.capacity || 0,
        price: fallbackVenue?.price || "По запросу",
        summary: row.description || fallbackVenue?.summary || "",
        amenities: fallbackVenue?.amenities || [],
        preview: fallbackVenue?.preview || "",
        availability: fallbackVenue?.availability || "available",
        timeTags: fallbackVenue?.timeTags || [],
        averageBookingLead: fallbackVenue?.averageBookingLead || "По запросу",
        bookingSlots: slotConfig?.bookingSlots ?? [],
        scenes: scenes.length > 0 ? scenes : fallbackVenue?.scenes || [],
        floorPlan: (row.floorPlan as FloorPlanData | null) ?? null
      } as Venue;
    });
  } catch {
    return fallbackVenues;
  }
}

export async function getVenueEditorData(venueId: string) {
  const venues = await getPublicVenues();
  return venues.find((item) => item.id === venueId) || null;
}

export async function updateVenueEditorData(input: Venue) {
  if (!prisma) {
    throw getDatabaseUnavailableError();
  }

  const db = prisma as any;

  await seedVenueToDb(input);
  await updateVenueBookingConfig(input.id, input.bookingSlots);

  await db.venue.update({
    where: { id: input.id },
    data: {
      name: input.name,
      city: input.city,
      description: input.summary,
      vertical: input.vertical,
      capacityMax: input.capacity,
      ownerManagerId: input.ownerManagerId,
      floorPlan: input.floorPlan ? (input.floorPlan as object) : null
    }
  });

  await db.panoramaTour.upsert({
    where: { id: `${input.id}-tour` },
    update: {
      coverSceneId: input.scenes[0]?.id ?? null
    },
    create: {
      id: `${input.id}-tour`,
      venueId: input.id,
      coverSceneId: input.scenes[0]?.id ?? null
    }
  });

  for (const scene of input.scenes) {
    await db.panoramaScene.upsert({
      where: { id: scene.id },
      update: {
        tourId: `${input.id}-tour`,
        name: scene.title,
        sourceImageUrl: scene.panoramaUrl,
        yawDefault: scene.initialYaw ?? null,
        pitchDefault: scene.initialPitch ?? null,
        hfovDefault: scene.initialHfov ?? null
      },
      create: {
        id: scene.id,
        tourId: `${input.id}-tour`,
        name: scene.title,
        sourceImageUrl: scene.panoramaUrl,
        yawDefault: scene.initialYaw ?? null,
        pitchDefault: scene.initialPitch ?? null,
        hfovDefault: scene.initialHfov ?? null
      }
    });

    for (const hotspot of scene.hotspots) {
      await db.sceneHotspot.upsert({
        where: { id: hotspot.id },
        update: {
          sceneId: scene.id,
          targetSceneId: hotspot.target ?? null,
          label: hotspot.label,
          kind: hotspot.kind,
          yaw: hotspot.yaw ?? null,
          pitch: hotspot.pitch ?? null
        },
        create: {
          id: hotspot.id,
          sceneId: scene.id,
          targetSceneId: hotspot.target ?? null,
          label: hotspot.label,
          kind: hotspot.kind,
          yaw: hotspot.yaw ?? null,
          pitch: hotspot.pitch ?? null
        }
      });
    }
  }
}
