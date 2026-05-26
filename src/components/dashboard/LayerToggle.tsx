"use client";

import { Layers3 } from "lucide-react";
import {
  layerCategories,
  operationalLayerRegistry,
} from "@/lib/gis/layerRegistry";
import { cn } from "@/lib/utils";
import { useDashboardState } from "@/hooks/useDashboardState";

export function LayerToggle() {
  const { isLayerActive, setLayerVisibility } = useDashboardState();

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-medium uppercase text-slate-500">
            Layer Registry
          </p>
          <h2 className="mt-1 text-lg font-semibold text-white">
            Operational Layers
          </h2>
        </div>
        <div className="flex h-9 w-9 items-center justify-center rounded-md border border-white/10 bg-white/[0.04] text-[#d8b86a]">
          <Layers3 className="h-4 w-4" />
        </div>
      </div>

      <div className="space-y-4">
        {layerCategories.map((category) => {
          const layers = operationalLayerRegistry.filter(
            (layer) => layer.category === category,
          );

          if (!layers.length) {
            return null;
          }

          return (
            <div key={category}>
              <p className="mb-2 text-[11px] font-medium uppercase text-slate-500">
                {category}
              </p>
              <div className="space-y-2">
                {layers.map((layer) => {
                  const active = isLayerActive(layer.id);

                  return (
                    <label
                      className={cn(
                        "group flex items-center gap-3 rounded-lg border p-3 transition",
                        active
                          ? "border-white/15 bg-white/[0.065]"
                          : "border-white/[0.08] bg-black/10 hover:border-white/[0.12] hover:bg-white/[0.04]",
                      )}
                      key={layer.id}
                    >
                      <input
                        checked={active}
                        className="sr-only"
                        onChange={(event) =>
                          setLayerVisibility(layer.id, event.target.checked)
                        }
                        type="checkbox"
                      />
                      <span
                        className="h-2.5 w-2.5 rounded-full shadow-[0_0_18px_currentColor]"
                        style={{ color: layer.accent, background: layer.accent }}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium text-slate-100">
                          {layer.title}
                        </span>
                        <span className="mt-1 block truncate text-xs text-slate-500">
                          {layer.description}
                        </span>
                      </span>
                      <span
                        className={cn(
                          "relative h-5 w-9 rounded-full border transition",
                          active
                            ? "border-[#d8b86a]/40 bg-[#d8b86a]/25"
                            : "border-white/10 bg-white/5",
                        )}
                      >
                        <span
                          className={cn(
                            "absolute top-1/2 h-3.5 w-3.5 -translate-y-1/2 rounded-full transition",
                            active
                              ? "left-[18px] bg-[#f0cd79]"
                              : "left-1 bg-slate-500",
                          )}
                        />
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
