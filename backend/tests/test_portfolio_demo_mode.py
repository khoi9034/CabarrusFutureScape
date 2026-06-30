from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]


def read(path: str) -> str:
    return (REPO_ROOT / path).read_text(encoding="utf-8")


def test_frontend_runtime_mode_switch_is_demo_safe() -> None:
    client = read("src/lib/api/client.ts")

    assert "NEXT_PUBLIC_CFS_DEPLOYMENT_MODE" in client
    assert 'CFS_DEPLOYMENT_MODE === "demo"' in client
    assert "!IS_DEMO_MODE && process.env.NEXT_PUBLIC_USE_BACKEND_API" in client


def test_demo_mode_uses_sanitized_static_search() -> None:
    top_nav = read("src/components/layout/TopNav.tsx")
    command_palette = read("src/components/dashboard/CommandPalette.tsx")
    parcel_panel = read("src/components/dashboard/ParcelSearchPanel.tsx")

    assert "searchDemoParcels" in top_nav
    assert "DEMO_QUICK_SEARCH_SUGGESTION_LIMIT = 5" in top_nav
    assert "loadDemoQuickSearchSuggestions" in top_nav
    assert "Demo Parcel Examples" in top_nav
    assert "Demo Picks" in top_nav
    assert 'setOverviewCommandMode("countywide")' in top_nav
    assert "getDemoParcelMapFocus(record, \"search\")" in top_nav
    assert "searchDemoParcels" in command_palette
    assert "getDemoSampleParcels" in parcel_panel
    assert "getDemoParcelById" in parcel_panel
    assert "PIN, parcel ID, subdivision, zoning" in parcel_panel


def test_demo_data_files_exist_and_avoid_sensitive_contact_fields() -> None:
    demo_dir = REPO_ROOT / "public" / "demo-data"
    expected_files = {
        "demo_manifest.json",
        "development_years.json",
        "economics_intelligence.json",
        "indicator_summary.json",
        "indicator_intelligence.json",
        "development_trends.json",
        "flood_summary.json",
        "school_capacity_watch.json",
        "model_status.json",
        "sample_parcels.json",
        "model_lab_demo_clusters.json",
    }
    expected_map_files = {
        "demo_county_boundary.geojson",
        "demo_development_hotspots.geojson",
        "demo_floodplain_review.geojson",
        "demo_layer_manifest.json",
        "demo_model_research.geojson",
        "demo_parcels.geojson",
        "demo_school_capacity.geojson",
        "demo_transportation_context.geojson",
    }

    assert expected_files.issubset({path.name for path in demo_dir.glob("*.json")})
    assert expected_map_files.issubset(
        {path.name for path in (demo_dir / "map_layers").glob("*")}
    )

    demo_text = "\n".join(
        path.read_text(encoding="utf-8").lower()
        for path in demo_dir.rglob("*")
        if path.is_file()
    )
    blocked_terms = [
        "acctname",
        "mailaddr",
        "mailing",
        "owner",
        "password",
        "database_url",
        "token",
        "secret",
    ]

    for term in blocked_terms:
        assert term not in demo_text

    years_text = (demo_dir / "development_years.json").read_text(
        encoding="utf-8",
    )
    hotspot_text = (
        demo_dir / "map_layers" / "demo_development_hotspots.geojson"
    ).read_text(encoding="utf-8")
    model_lab_text = (demo_dir / "model_lab_demo_clusters.json").read_text(
        encoding="utf-8",
    )
    assert "available_years" in years_text
    assert "segment_year_counts" in years_text
    assert "year_start" in hotspot_text
    assert "year_end" in hotspot_text
    assert "segment_year_counts" in hotspot_text
    assert "research_band" in model_lab_text
    assert "top_drivers" in model_lab_text


def test_demo_map_layers_are_wired_without_backend_calls() -> None:
    map_client = read("src/lib/demo-data/mapLayerClient.ts")
    hotspot_hook = read("src/hooks/useDevelopmentHotspotLayer.ts")
    flood_hook = read("src/hooks/useFloodConstraintLayer.ts")
    flood_zone_hook = read("src/hooks/useFloodZoneLayer.ts")
    school_hook = read("src/hooks/useSchoolUtilizationZoneLayer.ts")
    layer_toggle = read("src/components/dashboard/LayerToggle.tsx")
    model_hook = read("src/hooks/useModelResearchPreviewLayer.ts")

    assert "getDemoGeoJsonLayer" in map_client
    assert "getDemoDevelopmentYears" in map_client
    assert "getDemoDevelopmentHotspotsBySegment" in map_client
    assert "getDemoModelLabMarkers" in map_client
    assert "getDemoParcelMapFocus" in map_client
    assert "getDemoDevelopmentHotspotsBySegment" in hotspot_hook
    assert "yearStart: permitYearStart" in hotspot_hook
    assert "getDemoFloodConstraintMarkers" in flood_hook
    assert "getDemoFloodZonePolygons" in flood_zone_hook
    assert "getDemoSchoolUtilizationPolygons" in school_hook
    assert "getDemoModelLabMarkers" in model_hook
    assert "Permit Year Range" in layer_toggle
    assert "Reset Years" in layer_toggle
    assert "Portfolio Demo" in layer_toggle
    assert "Demo Sample" in layer_toggle
    assert "Choose how permit activity appears on the map." in layer_toggle
    assert "min-[380px]:grid-cols-3" in layer_toggle


def test_workspace_mode_layer_isolation_guards_map_overlays() -> None:
    ownership = read("src/lib/gis/layerModeOwnership.ts")
    scene = read("src/components/gis/SceneViewContainer.tsx")
    dashboard_state = read("src/hooks/useDashboardState.tsx")
    intelligence_panel = read("src/components/dashboard/IntelligencePanel.tsx")

    assert '"county-boundary": "sharedBase"' in ownership
    assert '"permit-activity": "exploreCountywide"' in ownership
    assert '"flood-risk": "exploreCountywide"' in ownership
    assert '"fema-flood-zones": "exploreCountywide"' in ownership
    assert '"school-utilization-seed": "exploreCountywide"' in ownership
    assert '"transportation-context": "exploreCountywide"' in ownership
    assert '"opportunity-extrusions": "modelLab"' in ownership
    assert "getModeScopedActiveLayerIds" in scene
    assert "applyOperationalLayerVisibility(layerRefs.current, scopedLayerIds)" in scene
    assert "!exploreCountywideLayersActive" in scene
    assert "!modelLabLayersActive" in scene
    assert "setSelectedDevelopmentHotspotContext(null)" in scene
    assert "setSelectedModelResearchContext(null)" in scene
    assert "developmentHotspotsEnabled && exploreCountywideLayersActive" in dashboard_state
    assert "floodConstraintsEnabled && exploreCountywideLayersActive" in dashboard_state
    assert "floodZonesEnabled && exploreCountywideLayersActive" in dashboard_state
    assert "schoolUtilizationZonesEnabled && exploreCountywideLayersActive" in dashboard_state
    assert 'mode !== "countywide"' in dashboard_state
    assert 'mode !== "modelLab"' in dashboard_state
    assert "getModeScopedActiveLayers" in intelligence_panel
    assert "includeExploreMapContext && developmentHotspotsEnabled" in intelligence_panel
    assert "includeModelLabMapContext && modelResearchOverlayEnabled" in intelligence_panel
    assert "activeLayerIds: scopedActiveLayerIds" in intelligence_panel


def test_points_clusters_heatmap_view_modes_are_wired_for_map_modes() -> None:
    overlay_modes = read("src/types/map/overlayViewModes.ts")
    hotspot_types = read("src/types/map/developmentHotspots.ts")
    layer_toggle = read("src/components/dashboard/LayerToggle.tsx")
    sidebar = read("src/components/layout/Sidebar.tsx")
    scene = read("src/components/gis/SceneViewContainer.tsx")
    dashboard_state = read("src/hooks/useDashboardState.tsx")
    intelligence_panel = read("src/components/dashboard/IntelligencePanel.tsx")

    assert '"points" | "clusters" | "heatmap"' in overlay_modes
    assert 'viewMode: "clusters"' in hotspot_types
    assert "HotspotViewModeControl" in layer_toggle
    assert "Development Hotspots view mode" in layer_toggle
    assert "Permit Activity Heatmap" in layer_toggle
    assert "ModelLabViewModeControl" in sidebar
    assert "Model Lab research overlay view mode" in sidebar
    assert "They are not exact probabilities or official parcel classes." in sidebar
    assert "modelResearchViewMode" in dashboard_state
    assert "getDevelopmentHotspotDisplayModeForViewMode" in scene
    assert "createDevelopmentHotspotHeatmapFeatureLayer" in scene
    assert "createPermitActivityHeatmapRenderer" in scene
    assert "getModelResearchDisplayModeForViewMode" in scene
    assert "createModelResearchHeatmapFeatureLayer" in scene
    assert "createResearchSignalHeatmapRenderer" in scene
    assert "removeFeatureLayerFromView(view, hotspotHeatmapLayerRef.current)" in scene
    assert "removeFeatureLayerFromView(view, modelResearchHeatmapLayerRef.current)" in scene
    assert "developmentHotspotControls.viewMode" in scene
    assert "modelResearchViewMode === \"heatmap\"" in scene
    assert "formatMapOverlayViewMode(modelResearchViewMode)" in intelligence_panel
    assert "formatMapOverlayViewMode(controls.viewMode)" in intelligence_panel
    assert "Choose how research signals appear on the map." in sidebar


def test_portfolio_demo_mode_is_documented() -> None:
    readme = read("README.md")
    env_example = read(".env.example")
    deployment_report = read("docs/deployment_report.md")

    assert "Portfolio Demo Mode" in readme
    assert "NEXT_PUBLIC_CFS_DEPLOYMENT_MODE=demo" in env_example
    assert "NEXT_PUBLIC_USE_BACKEND_API=false" in env_example
    assert "public/demo-data" in deployment_report


def test_cfs_economics_mode_is_wired_without_new_nav_item() -> None:
    top_nav = read("src/components/layout/TopNav.tsx")
    dashboard_state = read("src/hooks/useDashboardState.tsx")
    indicator_center = read("src/components/dashboard/IndicatorCenterWorkspace.tsx")
    economics_service = read("src/lib/economicsIntelligenceService.ts")
    ask_service = read("src/lib/aiSearchService.ts")

    assert "Planning Intelligence" in top_nav
    assert "Economic Intelligence" in top_nav
    assert "setCfsAppMode" in top_nav
    assert "CfsAppMode" in dashboard_state
    assert "localStorage.setItem(CFS_APP_MODE_STORAGE_KEY" in dashboard_state
    assert "EconomicMissionControl" in indicator_center
    assert "getDemoEconomicsIntelligence" in economics_service
    assert '"/economics/intelligence"' in economics_service
    assert "askCfsEconomicsSuggestedPrompts" in ask_service
    assert 'app_mode === "economics"' in ask_service
