"use client";

import Script from "next/script";
import { useEffect, useId, useMemo, useRef, useState } from "react";

import type { Hotspot, Scene, Venue } from "@/lib/types";

type PanoramaViewerProps = {
  venue: Venue;
  scene: Scene;
  selectedHotspotId: string | null;
  onSceneChange: (sceneId: string) => void;
  onObjectSelect: (hotspot: Hotspot) => void;
};

type PannellumHotspot = {
  pitch?: number;
  yaw?: number;
  type: "info";
  text: string;
  cssClass?: string;
  clickHandlerFunc?: (event: MouseEvent, args: { hotspotId: string }) => void;
  clickHandlerArgs?: { hotspotId: string };
  createTooltipFunc?: (hotSpotDiv: HTMLDivElement, args: { hotspot: Hotspot }) => void;
  createTooltipArgs?: { hotspot: Hotspot };
};

type PannellumScene = {
  title: string;
  hfov?: number;
  pitch?: number;
  yaw?: number;
  type: "equirectangular";
  panorama: string;
  preview?: string;
  hotSpots: PannellumHotspot[];
};

type PannellumConfig = {
  default: {
    firstScene: string;
    sceneFadeDuration: number;
    autoLoad: boolean;
    showZoomCtrl: boolean;
    showFullscreenCtrl: boolean;
    mouseZoom: boolean;
  };
  scenes: Record<string, PannellumScene>;
};

declare global {
  interface Window {
    pannellum?: {
      viewer: (
        element: string | HTMLElement,
        config: PannellumConfig
      ) => {
        destroy?: () => void;
        resize?: () => void;
        loadScene: (
          sceneId: string,
          pitch?: number | "same",
          yaw?: number | "same",
          hfov?: number | "same"
        ) => void;
      };
    };
  }
}

function createTooltip(hotSpotDiv: HTMLDivElement, args: { hotspot: Hotspot }) {
  const wrapper = document.createElement("div");
  wrapper.className = `custom-panorama-hotspot hotspot-${args.hotspot.kind}`;
  wrapper.dataset.hotspotId = args.hotspot.id;

  const dot = document.createElement("span");
  dot.className = "custom-panorama-hotspot-dot";

  const icon = document.createElement("span");
  icon.className = "custom-panorama-hotspot-icon";
  icon.textContent = args.hotspot.kind === "scene" ? "→" : args.hotspot.kind === "table" ? "T" : "Z";

  const label = document.createElement("span");
  label.className = "custom-panorama-hotspot-label";
  label.textContent = args.hotspot.label;

  wrapper.append(dot, icon, label);
  hotSpotDiv.append(wrapper);
}

export function PanoramaViewer({
  venue,
  scene,
  selectedHotspotId,
  onSceneChange,
  onObjectSelect
}: PanoramaViewerProps) {
  const [isScriptReady, setIsScriptReady] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewerRef = useRef<ReturnType<NonNullable<typeof window.pannellum>["viewer"]> | null>(
    null
  );
  const onSceneChangeRef = useRef(onSceneChange);
  const onObjectSelectRef = useRef(onObjectSelect);
  const viewerId = useId().replace(/:/g, "");

  useEffect(() => {
    onSceneChangeRef.current = onSceneChange;
  }, [onSceneChange]);

  useEffect(() => {
    onObjectSelectRef.current = onObjectSelect;
  }, [onObjectSelect]);

  useEffect(() => {
    venue.scenes.forEach((item) => {
      const image = new Image();
      image.src = item.panoramaUrl;
    });
  }, [venue.scenes]);

  const config = useMemo<PannellumConfig>(() => {
    const scenes = venue.scenes.reduce<Record<string, PannellumScene>>((acc, item) => {
      acc[item.id] = {
        title: item.title,
        hfov: item.initialHfov ?? 110,
        pitch: item.initialPitch ?? 0,
        yaw: item.initialYaw ?? 0,
        type: "equirectangular",
        panorama: item.panoramaUrl,
        preview: item.previewUrl,
        hotSpots: item.hotspots
          .filter((hotspot) => typeof hotspot.pitch === "number" && typeof hotspot.yaw === "number")
          .map((hotspot) => {
            if (hotspot.kind === "scene" && hotspot.target) {
              return {
                pitch: hotspot.pitch,
                yaw: hotspot.yaw,
                type: "info",
                text: hotspot.label,
                cssClass: `tour-hotspot-${hotspot.kind}`,
                createTooltipFunc: createTooltip,
                createTooltipArgs: { hotspot },
                clickHandlerFunc: () => {
                  viewerRef.current?.loadScene(
                    hotspot.target!,
                    hotspot.targetPitch ?? "same",
                    hotspot.targetYaw ?? "same",
                    "same"
                  );
                  onSceneChangeRef.current(hotspot.target!);
                },
                clickHandlerArgs: { hotspotId: hotspot.id }
              };
            }

            return {
              pitch: hotspot.pitch,
              yaw: hotspot.yaw,
              type: "info",
              text: hotspot.label,
              cssClass: `tour-hotspot-${hotspot.kind}`,
              createTooltipFunc: createTooltip,
              createTooltipArgs: { hotspot },
              clickHandlerFunc: (_event: MouseEvent, args: { hotspotId: string }) => {
                const targetHotspot = item.hotspots.find((entry) => entry.id === args.hotspotId);
                if (targetHotspot) {
                  onObjectSelectRef.current(targetHotspot);
                }
              },
              clickHandlerArgs: { hotspotId: hotspot.id }
            };
          })
      };
      return acc;
    }, {});

    return {
      default: {
        firstScene: scene.id,
        sceneFadeDuration: 280,
        autoLoad: true,
        showZoomCtrl: true,
        showFullscreenCtrl: true,
        mouseZoom: true
      },
      scenes
    };
  }, [scene.id, venue.scenes]);

  useEffect(() => {
    if (!isScriptReady || !containerRef.current || !window.pannellum) {
      return;
    }

    containerRef.current.innerHTML = "";
    viewerRef.current?.destroy?.();

    viewerRef.current = window.pannellum.viewer(containerRef.current, config);
    window.setTimeout(() => viewerRef.current?.resize?.(), 60);
    window.setTimeout(() => viewerRef.current?.resize?.(), 220);

    return () => {
      viewerRef.current?.destroy?.();
      viewerRef.current = null;
    };
  }, [config, isScriptReady, scene.id, venue.scenes]);

  useEffect(() => {
    if (!viewerRef.current) {
      return;
    }

    viewerRef.current.loadScene(
      scene.id,
      scene.initialPitch ?? 0,
      scene.initialYaw ?? 0,
      scene.initialHfov ?? 110
    );
    window.setTimeout(() => viewerRef.current?.resize?.(), 40);
  }, [scene.id, scene.initialPitch, scene.initialYaw, scene.initialHfov]);

  useEffect(() => {
    if (!containerRef.current) {
      return;
    }

    const nodes = containerRef.current.querySelectorAll<HTMLElement>(".custom-panorama-hotspot");
    nodes.forEach((node) => {
      node.classList.toggle("selected", node.dataset.hotspotId === selectedHotspotId);
    });
  }, [scene.id, selectedHotspotId]);

  return (
    <>
      <Script
        src="https://cdn.jsdelivr.net/npm/pannellum@2.5.6/build/pannellum.js"
        strategy="afterInteractive"
        onLoad={() => setIsScriptReady(true)}
      />
      <div className="panorama-engine-shell">
        <div
          className={`panorama-engine ${selectedHotspotId ? "has-selection" : ""}`}
          id={viewerId}
          ref={containerRef}
        />
        {!isScriptReady ? (
          <div className="panorama-fallback">
            <div className="viewer-chip">360 ENGINE</div>
            <p>Загрузка настоящего 360 viewer...</p>
          </div>
        ) : null}
      </div>
    </>
  );
}
