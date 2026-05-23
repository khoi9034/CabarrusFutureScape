# Cabarrus FutureScape

Cabarrus FutureScape is the Phase 1 frontend foundation for a Cabarrus County digital twin and growth intelligence platform. This version focuses on an immersive executive dashboard shell, ArcGIS SceneView integration, mock parcel intelligence, layer registry architecture, scenario controls, and KPI surfaces.

## Stack

- Next.js 16 with App Router
- TypeScript
- Tailwind CSS 4
- ArcGIS Maps SDK for JavaScript via `@arcgis/core`
- Lucide React icons

## Project Structure

```text
src/
  app/
    globals.css
    layout.tsx
    page.tsx
  components/
    cards/
      KPICard.tsx
      ScoreCard.tsx
    layers/
      LayerToggleGroup.tsx
    map/
      SceneViewMap.tsx
    parcels/
      ParcelSummaryPanel.tsx
    scenarios/
      ScenarioControls.tsx
    shell/
      AppShell.tsx
      BottomAnalyticsBar.tsx
      IntelligencePanel.tsx
      LeftPanel.tsx
      TopNav.tsx
  data/
    mockMetrics.ts
    mockParcels.ts
  lib/
    layers/
      layerRegistry.ts
    types.ts
    utils.ts
  state/
    dashboard-store.tsx
```

## Development

```bash
npm run dev
```

Then open `http://localhost:3000`.

## Phase 1 Scope

This repository intentionally uses mock data and frontend-only state. Backend services, PostGIS, real forecasting, real AI scoring, and production GIS services are reserved for later phases.
