"use client";

import { useState, useTransition } from "react";

import type { FloorPlanData, Hotspot, Venue } from "@/lib/types";
import { FloorPlanEditor } from "@/components/floor-plan-editor";

type ListingEditorProps = {
  initialVenue: Venue;
  mode: "basic" | "full";
};

function makeSceneId(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, "-") || `scene-${Date.now()}`;
}

function makeHotspotId(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, "-") || `hotspot-${Date.now()}`;
}

export function ListingEditor({ initialVenue, mode }: ListingEditorProps) {
  const [venue, setVenue] = useState(initialVenue);
  const [selectedSceneId, setSelectedSceneId] = useState(initialVenue.scenes[0]?.id ?? "");
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();
  const [floorPlanSaving, setFloorPlanSaving] = useState(false);
  const [floorPlanMessage, setFloorPlanMessage] = useState("");

  const selectedScene = venue.scenes.find((item) => item.id === selectedSceneId) ?? venue.scenes[0];

  function updateVenueField<Key extends keyof Venue>(key: Key, value: Venue[Key]) {
    setVenue((current) => ({ ...current, [key]: value }));
  }

  function updateSceneField(key: string, value: string) {
    setVenue((current) => ({
      ...current,
      scenes: current.scenes.map((scene) =>
        scene.id === selectedScene.id
          ? {
              ...scene,
              [key]:
                key === "initialYaw" || key === "initialPitch" || key === "initialHfov"
                  ? Number(value)
                  : value
            }
          : scene
      )
    }));
  }

  function updateHotspot(index: number, key: keyof Hotspot, value: string) {
    setVenue((current) => ({
      ...current,
      scenes: current.scenes.map((scene) =>
        scene.id === selectedScene.id
          ? {
              ...scene,
              hotspots: scene.hotspots.map((hotspot, hotspotIndex) =>
                hotspotIndex === index
                  ? {
                      ...hotspot,
                      [key]:
                        key === "yaw" || key === "pitch"
                          ? Number(value)
                          : key === "target" && value.length === 0
                            ? undefined
                            : value
                    }
                  : hotspot
              )
            }
          : scene
      )
    }));
  }

  function addScene() {
    const title = `Новая сцена ${venue.scenes.length + 1}`;
    const nextId = makeSceneId(title);

    setVenue((current) => ({
      ...current,
      scenes: [
        ...current.scenes,
        {
          id: nextId,
          title,
          description: "",
          image: "",
          panoramaUrl: "",
          previewUrl: "",
          initialPitch: 0,
          initialYaw: 0,
          initialHfov: 110,
          floorPlanLabel: title,
          hotspots: []
        }
      ]
    }));
    setSelectedSceneId(nextId);
  }

  function addHotspot() {
    const label = `Point ${selectedScene.hotspots.length + 1}`;

    setVenue((current) => ({
      ...current,
      scenes: current.scenes.map((scene) =>
        scene.id === selectedScene.id
          ? {
              ...scene,
              hotspots: [
                ...scene.hotspots,
                {
                  id: makeHotspotId(label),
                  label,
                  kind: "zone",
                  pitch: 0,
                  yaw: 0
                }
              ]
            }
          : scene
      )
    }));
  }

  async function saveFloorPlan(data: FloorPlanData) {
    setFloorPlanSaving(true);
    setFloorPlanMessage("");
    try {
      const res = await fetch(`/api/admin/listings/${venue.id}/floor-plan`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const payload = (await res.json()) as { ok?: boolean; message?: string };
      if (res.ok) {
        // фиксируем сохраненное состояние в локальном venue, чтобы
        // редактор не сбрасывал карту при последующих рендерах.
        setVenue((current) => ({ ...current, floorPlan: data }));
        setFloorPlanMessage("Карта сохранена");
      } else {
        setFloorPlanMessage(payload.message ?? "Ошибка сохранения");
      }
    } catch {
      setFloorPlanMessage("Ошибка сети");
    } finally {
      setFloorPlanSaving(false);
    }
  }

  function saveChanges() {
    startTransition(async () => {
      setMessage("");

      const response = await fetch(`/api/admin/listings/${venue.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(venue)
      });

      const payload = (await response.json()) as { message?: string };
      setMessage(response.ok ? "Изменения сохранены" : payload.message || "Не удалось сохранить");
    });
  }

  return (
    <section className="listing-editor-shell manager-listing-editor">
      <div className="listing-editor-header">
        <div>
          <span className="card-label">Редактор объекта</span>
          <h2>{venue.name}</h2>
          <p>
            {mode === "full"
              ? "Здесь задаются общая информация, 360-сцены и метки внутри панорамы."
              : "Здесь можно редактировать только основную информацию объявления. 360-сцены и метки доступны только супер-админу."}
          </p>
        </div>
        <button className="m-btn m-btn-gold manager-listing-save" disabled={isPending} onClick={saveChanges} type="button">
          {isPending ? "Сохранение..." : "Сохранить"}
        </button>
      </div>

      {message ? <div className="admin-login-hint manager-listing-message">{message}</div> : null}

      <div className="listing-editor-grid">
        <div className="listing-editor-card">
          <div className="listing-editor-section-head">
            <span className="card-label">Информация</span>
            <p>Базовые поля объекта, которые видят менеджеры и клиенты.</p>
          </div>
          <div className="inline-form listing-editor-form-grid">
            <label className="listing-field">
              <span>Название объекта</span>
              <input
                onChange={(event) => updateVenueField("name", event.target.value)}
                value={venue.name}
              />
            </label>
            <label className="listing-field">
              <span>Город</span>
              <input
                onChange={(event) => updateVenueField("city", event.target.value)}
                value={venue.city}
              />
            </label>
            <label className="listing-field">
              <span>Тип</span>
              <input
                onChange={(event) => updateVenueField("type", event.target.value)}
                value={venue.type}
              />
            </label>
            <label className="listing-field">
              <span>Цена</span>
              <input
                onChange={(event) => updateVenueField("price", event.target.value)}
                value={venue.price}
              />
            </label>
            <label className="listing-field">
              <span>Краткое описание</span>
              <textarea
                onChange={(event) => updateVenueField("summary", event.target.value)}
                value={venue.summary}
              />
            </label>
          </div>
        </div>

        {mode === "full" ? (
        <div className="listing-editor-card">
          <div className="listing-editor-card-head">
            <span className="card-label">Сцены 360</span>
            <button className="toolbar-button" onClick={addScene} type="button">
              Добавить сцену
            </button>
          </div>

          <div className="scene-editor-tabs">
            {venue.scenes.map((scene) => (
              <button
                className={`scene-chip ${scene.id === selectedScene.id ? "active" : ""}`}
                key={scene.id}
                onClick={() => setSelectedSceneId(scene.id)}
                type="button"
              >
                <strong>{scene.title}</strong>
              </button>
            ))}
          </div>

          <div className="inline-form">
            <input onChange={(event) => updateSceneField("title", event.target.value)} value={selectedScene.title} />
            <input
              onChange={(event) => updateSceneField("floorPlanLabel", event.target.value)}
              value={selectedScene.floorPlanLabel || ""}
            />
            <input
              onChange={(event) => updateSceneField("panoramaUrl", event.target.value)}
              placeholder="URL 360 картинки"
              value={selectedScene.panoramaUrl}
            />
            <textarea
              onChange={(event) => updateSceneField("description", event.target.value)}
              value={selectedScene.description}
            />
            <div className="booking-grid compact-booking-grid">
              <input
                onChange={(event) => updateSceneField("initialYaw", event.target.value)}
                placeholder="Yaw"
                type="number"
                value={selectedScene.initialYaw ?? 0}
              />
              <input
                onChange={(event) => updateSceneField("initialPitch", event.target.value)}
                placeholder="Pitch"
                type="number"
                value={selectedScene.initialPitch ?? 0}
              />
              <input
                onChange={(event) => updateSceneField("initialHfov", event.target.value)}
                placeholder="HFOV"
                type="number"
                value={selectedScene.initialHfov ?? 110}
              />
            </div>
          </div>
        </div>
        ) : null}

        {mode === "full" ? (
        <div className="listing-editor-card listing-editor-card-wide">
          <div className="listing-editor-card-head">
            <span className="card-label">Метки в сцене</span>
            <button className="toolbar-button" onClick={addHotspot} type="button">
              Добавить метку
            </button>
          </div>

          <div className="hotspot-editor-list">
            {selectedScene.hotspots.map((hotspot, index) => (
              <div className="hotspot-editor-card" key={hotspot.id}>
                <div className="booking-grid compact-booking-grid">
                  <input
                    onChange={(event) => updateHotspot(index, "label", event.target.value)}
                    value={hotspot.label}
                  />
                  <input
                    onChange={(event) => updateHotspot(index, "kind", event.target.value)}
                    value={hotspot.kind}
                  />
                  <input
                    onChange={(event) => updateHotspot(index, "target", event.target.value)}
                    placeholder="target scene id"
                    value={hotspot.target || ""}
                  />
                  <input
                    onChange={(event) => updateHotspot(index, "yaw", event.target.value)}
                    placeholder="yaw"
                    type="number"
                    value={hotspot.yaw ?? 0}
                  />
                  <input
                    onChange={(event) => updateHotspot(index, "pitch", event.target.value)}
                    placeholder="pitch"
                    type="number"
                    value={hotspot.pitch ?? 0}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
        ) : null}

        {/* ── Floor Plan Editor ── */}
        <div className="listing-editor-card listing-editor-card-wide">
          <div className="listing-editor-card-head">
            <span className="card-label">Карта заведения</span>
            <p>Добавляйте отдельные секции: VIP, Welcome, Lobby и задавайте для каждой свою схему столов и зон.</p>
          </div>
          {floorPlanMessage && (
            <div className="admin-login-hint manager-listing-message" style={{ marginBottom: 12 }}>
              {floorPlanMessage}
            </div>
          )}
          <FloorPlanEditor
            key={venue.id}
            initialData={venue.floorPlan ?? null}
            onSave={saveFloorPlan}
            saving={floorPlanSaving}
          />
        </div>
      </div>
    </section>
  );
}
