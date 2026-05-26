# Cabarrus FutureScape

Cabarrus FutureScape (CFS) is the frontend foundation for a Cabarrus County, NC digital twin and growth intelligence platform. The long-term product vision combines GIS, planning, infrastructure, analytics, parcel intelligence, simulation, and executive decision support.

## Current Phase

Phase 1: Next.js + TypeScript App Scaffold with hardened ArcGIS SceneView, dashboard interaction state, operational layer service readiness, map interaction event readiness, shareable dashboard URL state, command/search readiness, workspace modes, event stream readiness, frontend-only role-based dashboard readiness, mock scenario comparison / executive briefing readiness, and export/report package readiness.

This phase preserves the early futuristic dashboard shell while organizing the codebase into a scalable application foundation. The current app is frontend-only, uses mock operational data, renders a real ArcGIS `SceneView` in the central viewport, keeps interaction state modular, and prepares GIS layer, map interaction, role-aware workspace, scenario comparison, briefing, export/report, and shareable state architecture for future service-backed ArcGIS workflows.

## Tech Stack

- Next.js 16 App Router
- TypeScript
- Tailwind CSS 4
- React 19
- Lucide React icons
- ArcGIS Maps SDK for JavaScript installed via `@arcgis/core`

## Run Locally

```bash
npm install
npm run dev
```

Then open the local URL shown in the terminal, usually:

```text
http://localhost:3000
```

Useful checks:

```bash
npm run typecheck
npm run lint
npm run build
```

## Folder Structure

```text
src/
  app/
    globals.css          Next.js app styles entrypoint
    layout.tsx           Root metadata, fonts, and document shell
    page.tsx             Dashboard route entrypoint
  components/
    dashboard/           Dashboard-specific panels and controls
    gis/                 GIS viewport components and SceneView boundary
    layout/              App-level dashboard layout shell
    ui/                  Reusable UI primitives
  data/
    mock/                Mock dashboard, layer, parcel, event, role, scenario, and report data
  hooks/
    useDashboardState.tsx Shared dashboard state provider and public hook
    useExecutiveBriefing.ts Mock comparison and briefing state
    useExecutiveReports.ts Mock report package, print mode, and export state
    useLayerVisibility.ts Layer visibility state
    useMapInteractionState.ts Scene status and map error state
    useRoleState.ts     Active county stakeholder role state
    useScenarioState.ts Scenario horizon and simulation control state
    useSelectedParcel.ts Parcel selection state
  lib/
    dashboard/           URL-safe dashboard state helpers
    gis/                 ArcGIS loading, SceneView factory, layer factory, service adapter, config, and registry helpers
    utils.ts             Shared formatting and class utilities
  styles/
    cfs-theme.css        CFS visual tokens and global utility classes
  types/
    gisServices.ts       Future GIS service adapter contracts
    index.ts             Shared TypeScript domain types
    mapInteractions.ts   Typed map click, hover, hit-test, identify, and selection events
    scenarioComparison.ts Mock scenario comparison and briefing domain types
    reports.ts           Mock report, briefing packet, and export domain types
    userRoles.ts         Frontend-only role metadata and role preset types
```

## What Is Mocked

- Parcel summaries and sample parcel geometry
- KPI cards and trend values
- Scenario horizon presets
- Layer registry metadata
- Development pressure, readiness, tax opportunity, and risk scores
- Dashboard state and selected parcel behavior
- Client-side ArcGIS graphics layers
- GIS service adapter responses
- Future `FeatureLayer`, `SceneLayer`, and `MapImageLayer` service definitions
- Role presets, role KPI emphasis, role insights, and role-aware command suggestions
- Scenario comparison metrics, executive narratives, and briefing sections
- Executive report packages, briefing packets, print previews, and export history

No backend, database, live parcel feed, forecasting model, AI system, or production GIS service is connected yet.

## ArcGIS SceneView

The project has a dedicated client-side GIS architecture boundary:

- `src/components/gis/SceneViewContainer.tsx`
- `src/components/gis/MapViewportPlaceholder.tsx`
- `src/lib/gis/arcgisRuntime.ts`
- `src/lib/gis/gisConfig.ts`
- `src/lib/gis/gisServiceAdapter.ts`
- `src/lib/gis/layerFactory.ts`
- `src/lib/gis/layerRegistry.ts`
- `src/lib/gis/mapInteractionController.ts`
- `src/lib/gis/mockSceneLayers.ts`
- `src/lib/gis/sceneViewFactory.ts`
- `src/data/mock/layersMockData.ts`

`@arcgis/core` is loaded dynamically from the client-only `SceneViewContainer` to avoid SSR issues. The central viewport creates a real ArcGIS `Map` and `SceneView` centered around Concord / Cabarrus County, NC. Current layers are mock `GraphicsLayer` instances, but the layer registry now includes source metadata for future `FeatureLayer`, `SceneLayer`, `GraphicsLayer`, and `MapImageLayer` services.

The SceneView implementation includes:

- Client-only ArcGIS module loading
- Isolated SceneView factory
- Isolated mock layer creation and symbol updates
- Layer visibility synchronization
- Parcel hit-test selection for mock graphics
- Typed map interaction controller for clicks, hover readiness, hit-tests, identify preparation, and selection events
- Loading and degraded/error states
- Cleanup for click handles, layers, and SceneView instances

## Operational Layer Readiness

Operational layer definitions now support:

- ArcGIS layer kinds: `GraphicsLayer`, `FeatureLayer`, `SceneLayer`, and `MapImageLayer`
- Source statuses: `mock`, `placeholder`, `disabled`, and `live`
- Visibility and opacity metadata
- Optional service URL metadata
- Optional popup, renderer, and field metadata

Current dashboard layers stay in the `mock` workflow. `src/lib/gis/layerFactory.ts` reads those definitions and resolves them to the existing mock `GraphicsLayer` scene graphics from `src/lib/gis/mockSceneLayers.ts`, preserving the current parcel selection, layer toggles, and 3D mock visuals.

Future service-backed layers are represented as placeholder or disabled definitions in the registry. The factory has safe creation paths for `FeatureLayer`, `SceneLayer`, and `MapImageLayer`, but those paths no-op unless a layer is explicitly marked `live` and has a valid HTTPS ArcGIS service URL. This keeps production county services disconnected during Phase 1 while making the integration shape clear.

The service adapter in `src/lib/gis/gisServiceAdapter.ts` now exposes future-ready methods for retrieving layer definitions, creating one or many operational layers, syncing layer visibility, and updating opacity. Its current implementation remains mock-safe and frontend-only.

## Map Interaction Event Readiness

Map interaction events are now typed in `src/types/mapInteractions.ts` and coordinated through `src/lib/gis/mapInteractionController.ts`.

The current mock selection path is:

- `SceneViewContainer` registers ArcGIS `click` and lightweight `pointer-move` handlers after the SceneView is ready.
- `mapInteractionController` converts ArcGIS events into typed `MapClickEvent` and `MapHoverEvent` objects.
- On click, the controller runs `SceneView.hitTest`.
- If a mock graphic has a `parcelId`, the controller resolves it through the mock-safe GIS adapter and emits a typed selection event.
- Dashboard state receives the selection event and updates the selected parcel, parcel command panel, map label, and selected graphic styling.

Empty map clicks preserve the current selection. This matches the existing dashboard behavior and avoids accidental deselection while users orbit, pan, or click around the 3D scene. A typed `clearSelection` path exists in the controller for a future explicit clear-selection UI command.

The future identify/query path is prepared but not connected to production services. When a click does not resolve to a mock parcel graphic, the controller builds an `IdentifyQueryRequest` and routes it through `gisServiceAdapter.identifyFeatures`. The current adapter returns an empty mock-safe result; later phases can replace that method with real `FeatureLayer`, `SceneLayer`, or map-service identify/query logic.

## Shareable URL State

Dashboard intelligence state is synced to URL search params through `src/components/dashboard/DashboardUrlSync.tsx` and `src/lib/dashboard/urlState.ts`.

Supported params:

- `parcel`: selected mock parcel ID, for example `CAB-151-4823`
- `scenario`: active scenario horizon, for example `baseline`
- `year`: active simulation year, constrained to the current mock time horizon
- `intensity`: simulation intensity, constrained from `0` to `100`
- `layers`: comma-separated operational layer IDs, or `none` when every layer is off
- `role`: active frontend role preset, for example `county-executive` or `parcel-analyst`
- `compare`: active scenario comparison pair, for example `baseline,accelerated-growth`
- `briefing`: active mock briefing mode, for example `executive`, `planning`, `infrastructure`, or `risk`
- `report`: active mock report package, for example `executive-growth`
- `print`: active printable view mode, for example `briefing`, `summary`, `board-packet`, or `parcel-snapshot`
- `export`: active report intent, for example `executive`, `board`, `infrastructure`, `parcel`, or `scenario`

Valid URL params hydrate the dashboard on load. Parcel IDs are validated against the mock parcel data, scenario IDs against mock scenario presets, layer IDs against the layer registry, role IDs against the role registry, comparison pairs against mock comparison definitions, briefing modes against supported mock modes, report and print params against mock report registries, and workspace view modes against the workspace preset registry. Invalid values are ignored safely and do not connect to any production services.

Only meaningful dashboard state is URL-synced. Camera movement, tilt, zoom, and pointer movement are intentionally excluded for now so normal 3D navigation does not create noisy URLs. Future shareable intelligence views can add explicit map bookmarks once the view/camera model is designed.

## Command Palette And Search Readiness

The top search surface now opens a client-side command palette backed by:

- `src/components/dashboard/CommandPalette.tsx`
- `src/lib/dashboard/commandRegistry.ts`
- `src/lib/dashboard/searchMatcher.ts`
- `src/lib/dashboard/searchServiceAdapter.ts`
- `src/types/search.ts`

Supported mock searches include parcel IDs, parcel labels, zoning text, layer titles, layer categories, scenario names, comparison names, briefing titles, report packages, role names, event notices, workspace modes, and command keywords. Command actions can select mock parcels, toggle operational layers, switch scenario horizons, switch scenario comparison pairs, open mock executive briefings, run mock report exports, switch frontend role presets, set mock simulation year/intensity presets, and clear parcel selection.

When the command palette opens with no query, active-role command suggestions are prioritized from the role registry. This keeps the top command surface ready for role-aware workflows without connecting a service-backed search index.

The command palette does not write URL params directly. It calls the existing dashboard state actions, and `DashboardUrlSync` updates shareable URL state for parcel, scenario, simulation, and layer changes.

`searchServiceAdapter.ts` is the placeholder boundary for future service-backed parcel, place, layer, and command search. Phase 1 keeps that adapter frontend-only and mock-based; no production county services, backend search APIs, forecasting systems, or AI tools are connected.

## Executive View Modes And Workspace Readiness

The dashboard now supports mock operational view modes through:

- `src/types/workspace.ts`
- `src/lib/dashboard/workspacePresets.ts`
- `src/lib/dashboard/workspaceController.ts`
- `src/lib/dashboard/workspaceStorage.ts`
- `src/hooks/useWorkspaceState.ts`

Supported view modes are:

- `executive`: countywide summary of growth, readiness, revenue, and risk
- `parcel`: parcel intelligence and opportunity review
- `infrastructure`: service capacity and readiness review
- `growth`: development pressure and permit activity review
- `risk`: flood risk and constraint review
- `planning`: planning operations, policy, permits, and scenario envelopes

Each preset defines visible mock layers, a default scenario horizon, mock simulation settings, KPI focus metadata, panel preferences, map emphasis metadata, and section ordering metadata. The current UI applies the layer/scenario/simulation parts of each preset while preserving the existing dashboard shell.

Workspace mode is shareable through the `view` URL param, for example `?view=risk`. Invalid view values are ignored safely. Command palette search also includes view mode commands, and view changes still update URL state through `DashboardUrlSync` rather than duplicating URL logic.

`workspaceStorage.ts` defines a local saved-workspace shape and localStorage helper boundary for future saved layouts. No backend persistence, user accounts, production GIS services, forecasting, or AI systems are connected in Phase 1.

## Role-Based Dashboard Readiness

The dashboard now supports frontend-only stakeholder roles through:

- `src/types/userRoles.ts`
- `src/lib/dashboard/roleRegistry.ts`
- `src/lib/dashboard/roleController.ts`
- `src/hooks/useRoleState.ts`
- `src/components/dashboard/RoleIntelligencePanel.tsx`

Initial roles are:

- `county-executive`: countywide growth, infrastructure risk, critical notices, and executive KPI posture
- `planning-staff`: zoning review, permit activity, development pressure, and planning workflows
- `infrastructure-reviewer`: utility strain, transportation flags, corridor readiness, and risk overlays
- `parcel-analyst`: parcel boundaries, ownership review, nearby permit context, and identify/query focus

Each role defines a default workspace mode, visible mock operational layers, preferred scenario presets, preferred KPI cards, default dashboard panel metadata, frontend dashboard tools, mock map viewpoint metadata, command suggestions, role KPI summaries, and role-specific operational insights.

Switching roles from the top navigation or command palette applies the role preset through the same dashboard state actions used by workspace modes. Role changes update the active workspace mode, layer visibility, scenario posture, role-aware KPI ordering, default scenario comparison, briefing mode, role insight panel, and `role` URL param. Dashboard panels remain visually preserved in Phase 1; role panel metadata is exposed through state for future saved-layout and permission-aware rendering.

This is not authentication. There are no user accounts, permission checks, backend role assignments, or production authorization rules. Future auth can bind real users or groups to these role presets while preserving the frontend contract.

## Scenario Comparison And Executive Briefing Readiness

The dashboard now supports mock executive comparison workflows through:

- `src/types/scenarioComparison.ts`
- `src/data/mock/scenarioComparisonMockData.ts`
- `src/lib/dashboard/scenarioComparisonAdapter.ts`
- `src/hooks/useExecutiveBriefing.ts`
- `src/components/dashboard/ScenarioComparisonPanel.tsx`
- `src/components/dashboard/ExecutiveBriefingPanel.tsx`

Supported mock comparison workflows include:

- Baseline vs Accelerated Growth
- Baseline vs Infrastructure First
- Infill Priority vs Accelerated Growth
- Infrastructure First vs Accelerated Growth

Each comparison includes mock KPI deltas, trend direction, severity, fiscal opportunity shift, infrastructure readiness shift, parcel pressure shift, risk indicators, and executive narrative summaries. The intelligence panel presents a side-by-side comparison selector and a briefing-ready summary with top opportunities, top risks, infrastructure outlook, growth pressure summary, and mock recommendation text.

Comparison state is shareable through the `compare` URL param and briefing posture is shareable through the `briefing` URL param. Command palette search includes comparison and briefing commands such as `Compare Baseline vs Accelerated Growth` and `Open Executive Growth Brief`.

`scenarioComparisonAdapter.ts` is the future boundary for service-backed scenario analytics, PDF/report export, executive briefing packets, and AI-assisted briefing generation. Phase 1 remains mock-only: no forecasting engine, AI system, report renderer, or production county data service is connected.

## Export And Report Package Readiness

The dashboard now supports mock executive report and print workflows through:

- `src/types/reports.ts`
- `src/data/mock/reportMockData.ts`
- `src/lib/dashboard/reportExportAdapter.ts`
- `src/hooks/useExecutiveReports.ts`
- `src/components/dashboard/ExecutiveReportPanel.tsx`
- `src/components/dashboard/PrintLayoutPreview.tsx`

Supported mock report packages include:

- Executive Growth Briefing
- Infrastructure Readiness Packet
- Flood Risk Review Packet
- Parcel Opportunity Summary
- Scenario Comparison Export

The intelligence panel includes a report package selector, KPI summary blocks, mock export status, local export history, and a print-style preview surface for briefing, summary, board-packet, and parcel-snapshot modes. Export actions such as `Export Executive Packet`, `Open Print Layout`, `Generate Board Brief`, and `Export Scenario Comparison` update local dashboard state and URL-safe report params, but they do not generate real PDF files.

`reportExportAdapter.ts` is the future boundary for server-side PDF generation, board-packet automation, print rendering, citation-aware export packages, and AI-assisted report drafting. Phase 1 keeps this frontend-only and mock-based: no PDF service, document renderer, county record system, backend queue, or AI report generator is connected.

## Notification And Event Stream Readiness

The intelligence panel now includes a mock operational event stream backed by:

- `src/types/events.ts`
- `src/data/mock/eventsMockData.ts`
- `src/lib/dashboard/eventStreamAdapter.ts`
- `src/hooks/useOperationalEvents.ts`
- `src/components/dashboard/EventStreamPanel.tsx`

Supported mock event types include parcel alerts, permit activity, infrastructure flags, risk notices, zoning updates, system status messages, and scenario updates. Severities include `info`, `warning`, `critical`, and `success`.

The event stream can mark events read, dismiss events locally, filter to unread events, filter to the selected parcel, focus a related mock parcel, toggle a related mock layer, and switch a related scenario. These actions call existing dashboard state methods so parcel, layer, scenario, and URL/share behavior remain centralized.

Command palette search also includes recent operational events. Event commands jump to related parcel, layer, or scenario targets when mock target metadata exists.

`eventStreamAdapter.ts` is the future boundary for service-backed permit feeds, infrastructure alerts, risk notifications, scenario notices, and system status messages. Phase 1 keeps event state local to the browser; read/dismiss/filter state is not written to URL params and no production notification service is connected.

## Dashboard State Architecture

Dashboard interaction state is exposed through `useDashboardState`, but the implementation is split into smaller hooks:

- `useLayerVisibility` controls active operational layer IDs and validates them against the layer registry.
- `useSelectedParcel` tracks the selected parcel, selection source, and clear/select actions.
- `useScenarioState` owns the active scenario horizon, simulation year, and intensity.
- `useMapInteractionState` owns SceneView status and error state.
- `useRoleState` owns the active frontend stakeholder role and role preset metadata.
- `useWorkspaceState` owns the active executive view mode and preset metadata.
- `useExecutiveBriefing` owns the active scenario comparison pair, briefing mode, mock narrative selection, comparison metrics, and briefing sections.
- `useExecutiveReports` owns the active report package, print mode, export intent, mock export state, and mock export history.
- `useOperationalEvents` owns mock event read, dismiss, filter, count, and selected-parcel event state.

The public dashboard API remains simple for UI components, while the internals are ready for future URL state and service-backed GIS workflows.

`src/lib/dashboard/urlState.ts` provides serialization and deserialization helpers for URL-safe dashboard state, including selected parcel ID, active scenario, simulation controls, active layer IDs, workspace view mode, active role, active comparison pair, briefing mode, active report package, print mode, and report export intent. `src/components/dashboard/DashboardUrlSync.tsx` hydrates valid values from the URL on load and updates the browser URL when those dashboard states change.

`src/lib/gis/gisServiceAdapter.ts` defines the mock implementation of the future GIS service boundary. The contract in `src/types/gisServices.ts` includes future methods for loading operational layer definitions, creating ArcGIS runtime layers, querying parcels, querying features by extent, syncing layer visibility, and updating opacity. Phase 1 keeps these methods mock/no-op where appropriate so real services can be connected later without rewriting dashboard components.

## Next Step

Next planned task: Phase 1 polish and resilience pass.

That task should keep the app frontend-only while tightening responsive behavior, empty/loading states, interaction affordances, accessibility labels, and visual QA around the dashboard shell before connecting real GIS services.
