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
        "economics_enterprise_export.json",
        "economics_intelligence.json",
        "economics_powerbi_export.json",
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
    expected_powerbi_files = {
        "csv_manifest.json",
        "domain_readiness_dim.csv",
        "economics_kpi_fact.csv",
        "geography_dim.csv",
        "parcel_economic_signal_fact.csv",
        "scenario_dim.csv",
        "scenario_output_fact.csv",
        "time_dim.csv",
    }

    assert expected_files.issubset({path.name for path in demo_dir.glob("*.json")})
    assert expected_map_files.issubset(
        {path.name for path in (demo_dir / "map_layers").glob("*")}
    )
    assert expected_powerbi_files.issubset(
        {path.name for path in (demo_dir / "powerbi").glob("*")}
    )

    demo_text = "\n".join(
        path.read_text(encoding="utf-8").lower()
        for path in demo_dir.rglob("*")
        if path.is_file()
    )
    blocked_terms = [
        "acctname",
        "mailaddr",
        '"mailing"',
        '"owner"',
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
    powerbi_text = (demo_dir / "economics_powerbi_export.json").read_text(
        encoding="utf-8",
    )
    assert "report_builder_guide" in powerbi_text
    assert "suggested_measures" in powerbi_text
    assert "No contact fields imported." in powerbi_text


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
    assert "Utility + Land Opportunity Features in Model" in intelligence_panel
    assert "LandOpportunityScreenerPanel" in intelligence_panel
    assert "Land Opportunity Screener" in intelligence_panel
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
    app_shell = read("src/components/layout/AppShell.tsx")
    economics_shell = read("src/components/economics/EconomicsShell.tsx")
    economics_types = read("src/types/index.ts")
    indicator_center = read("src/components/dashboard/IndicatorCenterWorkspace.tsx")
    overview = read("src/components/layout/AppShell.tsx")
    economics_service = read("src/lib/economicsIntelligenceService.ts")
    enterprise_export_types = read("src/lib/enterpriseAdapters/enterpriseExportTypes.ts")
    ask_service = read("src/lib/aiSearchService.ts")

    assert "Planning Intelligence" in top_nav
    assert "Economic Intelligence" in top_nav
    assert "Overview" in top_nav
    assert "Power BI & Tools" in top_nav
    assert "Economic Dashboard" in top_nav
    assert "Print" in top_nav
    assert 'label: "Workspace"' not in top_nav.split("const economicsProductModes", 1)[1].split("const QUICK_SEARCH_LIMIT", 1)[0]
    assert "Enterprise Workspace" not in top_nav.split("const economicsProductModes", 1)[1].split("const QUICK_SEARCH_LIMIT", 1)[0]
    assert "Executive Brief" not in top_nav
    assert "Parcel Screen" not in top_nav
    assert "Scenario Lab" not in top_nav
    assert "Enterprise Tools" not in top_nav
    assert "economicsProductModes" in top_nav
    assert "setCfsAppMode" in top_nav
    assert "CfsAppMode" in dashboard_state
    assert "EconomicsSection" in economics_types
    assert "economicsSection" in dashboard_state
    assert "setEconomicsSection" in dashboard_state
    assert "localStorage.setItem(CFS_APP_MODE_STORAGE_KEY" in dashboard_state
    assert "<EconomicsShell />" in app_shell
    assert "econ-app-backdrop" in app_shell
    assert "ExecutiveBriefPage" in economics_shell
    assert "PowerBiToolsPage" in economics_shell
    assert "EconomicsWorkspacePage" in economics_shell
    assert "EconomicDashboardPage" in economics_shell
    assert "EnterpriseWorkspacePage" in economics_shell
    assert "EconomicsPrintPage" in economics_shell
    assert "EconomicsTutorialButton" in economics_shell
    assert "EconomicsTutorialOverlay" in economics_shell
    assert "computeTutorialPlacement" in economics_shell
    assert "clampTutorialValue" in economics_shell
    assert "getTutorialHeaderOffset" in economics_shell
    assert "TUTORIAL_VIEWPORT_MARGIN" in economics_shell
    assert "TUTORIAL_HEADER_FALLBACK" in economics_shell
    assert "Skip tutorial" in economics_shell
    assert "Escape" in economics_shell
    assert "Start Tutorial" in economics_shell
    assert 'maxWidth: "calc(100vw - 2rem)"' in economics_shell
    assert 'maxHeight: "calc(100vh - 7rem)"' in economics_shell
    assert 'window.addEventListener("resize", queueMeasure)' in economics_shell
    assert 'window.addEventListener("scroll", queueMeasure, true)' in economics_shell
    assert 'scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" })' in economics_shell
    assert 'data-econ-tour="overview-hero"' in economics_shell
    assert "powerbi-tools-header" in economics_shell
    assert "economics-row-selection" in economics_shell
    assert 'data-econ-tour="economics-filters"' in economics_shell
    assert "selected-rows-tray" in economics_shell
    assert 'data-econ-tour="powerbi-csv-export"' in economics_shell
    assert "chart-builder" in economics_shell
    assert 'data-econ-tour="chart-templates"' in economics_shell
    assert 'data-econ-tour="report-canvas"' in economics_shell
    assert "advanced-tools" in economics_shell
    assert "tools-final-actions" in economics_shell
    assert 'data-econ-tour="kpi-strip"' in economics_shell
    assert 'data-econ-tour="slicers"' in economics_shell
    assert 'data-econ-tour="segment-visuals"' in economics_shell
    assert 'data-econ-tour="ask-cfs"' in economics_shell
    assert 'data-econ-tour="print-header"' in economics_shell
    assert 'data-econ-tour="print-scope"' in economics_shell
    assert 'data-econ-tour="print-actions"' in economics_shell
    assert "overview:" in economics_shell
    assert "tools:" in economics_shell
    assert "dashboard:" in economics_shell
    assert "print:" in economics_shell
    assert "tools-purpose" in economics_shell
    assert "tools-ask-cfs" in economics_shell
    assert "generated-report-preview" in economics_shell
    assert "Generate Power BI Report" in economics_shell
    assert "Generated Report Preview" in economics_shell
    assert "Save Report to Bucket" in economics_shell
    assert "Send Report to Print" in economics_shell
    assert "buildReportDataAvailability" in economics_shell
    assert "available_report_types" in economics_shell
    assert "best_default_report_type" in economics_shell
    assert "Scenario + Data Confidence Report" in economics_shell
    assert "Land Due Diligence Screener" in economics_shell
    assert "InvestmentPanelGate" in economics_shell
    assert "InvestmentPanelPage" in economics_shell
    investment_shell = read("src/components/investment/InvestmentShell.tsx")
    assert "InvestmentShell" in economics_shell
    assert "CFS Investment" in investment_shell
    assert "Land, Property, and Real Estate Intelligence" in investment_shell
    assert "CFS Investment" in economics_shell
    assert "Internal Access" in economics_shell
    assert "Local convenience gate only" in economics_shell
    assert 'const INVESTMENT_PANEL_ACCESS_CODE = "demo"' in economics_shell
    assert "Access code did not match" in economics_shell
    assert "Ask CFS Investment Research" in economics_shell
    assert "Investment Report Studio" in economics_shell
    assert "Generate Report" in economics_shell
    assert "Add report to Report Bucket" in economics_shell
    assert "Ranked Candidate Table" in economics_shell
    assert "Generate Review Guide" in economics_shell
    assert "Ask CFS about this candidate" in economics_shell
    assert "Land Due Diligence Report" in economics_shell
    assert "Land Review Watchlist" in economics_shell
    assert "Top Land Review Candidates" in economics_shell
    assert "Screening-level candidate ranking" in economics_shell
    assert "CFS ranks candidates for manual review only" in economics_shell
    assert "Tier 1 - Strong Review Candidate" in economics_shell
    assert "Tier 2 - Good Review Candidate" in economics_shell
    assert "Tier 3 - Watchlist / More Data Needed" in economics_shell
    assert "Tier 4 - Constraint or Data-Limited" in economics_shell
    assert "Special Review - Compare Separately" in economics_shell
    assert "Infrastructure-supported candidates" in economics_shell
    assert "Growth pressure + sewer proximity" in economics_shell
    assert "Underbuilt + utility proxy" in economics_shell
    assert "More data needed but interesting" in economics_shell
    assert "Special assets / compare separately" in economics_shell
    assert "Create Top 25 Review Watchlist" in economics_shell
    assert "Compare Selected Candidates" in economics_shell
    assert "Why this candidate ranked here" in economics_shell
    assert "Comparison for manual due diligence prioritization" in economics_shell
    assert "Top Land Review Candidates Report" in economics_shell
    assert "Comparable Context" in economics_shell
    assert "Comparable Context Report" in economics_shell
    assert "value_per_acre_band" in economics_shell
    assert "comparison_group" in economics_shell
    assert "Manual comps review required" in economics_shell
    assert "CFS is not an appraisal" in economics_shell
    assert "Parcel Due Diligence Card" in economics_shell
    assert "land-due-diligence-steps" in economics_shell
    assert "Filter" in economics_shell
    assert "Select" in economics_shell
    assert "Review" in economics_shell
    assert "Generate Packet" in economics_shell
    assert "land-due-diligence-primary-filters" in economics_shell
    assert "land-due-diligence-advanced-filters" in economics_shell
    assert "Show advanced filters" in economics_shell
    assert "Generate Due Diligence Packet" in economics_shell
    assert "Generate Watchlist Packet" in economics_shell
    assert "Due Diligence {noun} Preview" in economics_shell
    assert "Add {noun} to Report Bucket" in economics_shell
    assert "Send {noun} to Print" in economics_shell
    assert "Copy {noun} Summary" in economics_shell
    assert "Copy Questions to Ask" in economics_shell
    assert "Download JSON" in economics_shell
    assert "due_diligence_packet" in economics_shell
    assert "DueDiligencePacketPrintDetails" in economics_shell
    assert "Parcel Due Diligence Packet" in economics_shell
    assert "WSACC data supports sewer proximity and subbasin context only" in economics_shell
    assert "Not financial or buy/sell guidance" in economics_shell
    assert "Is sewer service available" in economics_shell
    assert "review priority" in economics_shell
    assert "Add selected rows to bucket" not in economics_shell
    assert "Send due diligence report to Print" not in economics_shell
    assert "What supports the signal" in economics_shell
    assert "What could be a problem" in economics_shell
    assert "What to verify next" in economics_shell
    assert "Verify utility service/capacity with utility provider" in economics_shell
    assert "buy this" not in economics_shell.lower()
    assert ("guaranteed " + "return") not in economics_shell.lower()
    assert "Land Opportunity Screener" in economics_shell
    assert "development_readiness_band" in economics_shell
    assert "Unavailable until data refresh" in economics_shell
    assert "Unavailable visuals" in economics_shell
    assert "CFS selected" in economics_shell
    assert "underbuilt candidate rows unavailable" in economics_shell
    assert "generatedVisualUnavailableReason" in economics_shell
    assert "parcel_economic_signal_fact currently has 0 rows" in economics_shell
    assert "Power BI export table is empty" in economics_shell
    assert "Advanced Manual Tools" in economics_shell
    assert "tools-chart-builder" in economics_shell
    assert "tools-chart-templates" in economics_shell
    assert "tools-report-canvas" in economics_shell
    assert "tools-due-diligence" in economics_shell
    assert "tools-advanced" in economics_shell
    assert "tools-final-output" in economics_shell
    assert "Overview -> Power BI & Tools -> Economic Dashboard -> Print" in ask_service
    assert "Uses the local FastAPI backend and local PostGIS economics data." in economics_shell
    assert "Uses a sanitized cached demo extract for portfolio review." in economics_shell
    assert "You are here:" in economics_shell
    assert "Understand the workflow." in economics_shell
    assert "Generate a Power BI-style report preview, save it to the bucket, then send it to Print." in economics_shell
    assert economics_shell.index('tourId="tools-ask-cfs"') < economics_shell.index('tourRowSelectionId="economics-row-selection"')
    assert "Screening-level economic context, not official appraisal, tax bill, or fiscal impact study." in economics_shell
    assert "Growth and tax-base intelligence with segment-aware visuals and slicers." in economics_shell
    assert "EconomicsSlicerBar" in economics_shell
    assert "economicsSignalsFromPowerBiExport" in economics_shell
    assert "Economics data is currently using a partial fallback" in economics_shell
    assert "CFS will not silently swap in demo data while local live mode is selected." in economics_shell
    assert "grid-template-columns:repeat(auto-fit,minmax(220px,1fr))" in economics_shell
    assert "Economic Segment" in economics_shell
    assert "Segment-Aware Land Economics" in economics_shell
    assert "Power BI recipe details" in economics_shell
    assert "EconomicsDonutChart" in economics_shell
    assert "EconomicsMatrixChart" in economics_shell
    assert "EconomicsTrendChart" in economics_shell
    assert "Opportunity Class Breakdown" in economics_shell
    assert "Value per Acre / Land Efficiency" in economics_shell
    assert "Scenario Output Comparison" in economics_shell
    assert "Fiscal / Service Burden Matrix" in economics_shell
    assert "Data Confidence Visual" in economics_shell
    assert "Development Readiness Bands" in economics_shell
    assert "Power BI recipe" in economics_shell
    assert "Visual analytics" not in economics_shell
    assert "Source table, visual type, and fields." not in economics_shell
    assert "Reset filters" in economics_shell
    assert "Three-step Power BI workflow" in economics_shell
    assert "Screening-level economic context for selected rows or current economics summary." in economics_shell
    assert "What CFS Economics does" in economics_shell
    assert "What data it uses" in economics_shell
    assert "What outputs it creates" in economics_shell
    assert "What it is not" in economics_shell
    assert "Why this matters" in economics_shell
    assert "Parcel Economic Baseline" in economics_shell
    assert "WorkspaceTableTabs" in economics_shell
    assert "Table type" in economics_shell
    assert "Opportunity Class" in economics_shell
    assert "Geography / Jurisdiction" in economics_shell
    assert "Burden Band" in economics_shell
    assert "Tax-Base Opportunity" in economics_shell
    assert "Scenario Candidates" in economics_shell
    assert "Data Readiness" in economics_shell
    assert "Selected for Power BI & Tools / Print" in economics_shell
    assert "Use selected rows in tools" in economics_shell
    assert "Send selected to Print" in economics_shell
    assert "Select rows from the economics tables to move them into model, export, or print work." in economics_shell
    assert "Selected rows can become Power BI table filters, scenario model context, or decision-pack evidence." in economics_shell
    assert "Ask CFS Economics" in economics_shell
    assert "Power BI & Tools Ask CFS" not in economics_shell
    assert "Select rows" in economics_shell
    assert "Choose Tool" in economics_shell
    assert "Tool Workspace" in economics_shell
    assert "Next Actions" in economics_shell
    assert "Select rows on Power BI & Tools" in economics_shell
    assert "enterpriseOutputCards" in economics_shell
    assert "Select Data" in economics_shell
    assert "Power BI Export" in economics_shell
    assert "Decision Pack" in economics_shell
    assert "Development type" in economics_shell
    assert "Scenario Output" in economics_shell
    assert "Reference scenario bands" in economics_shell
    assert "Decision memo" in economics_shell
    assert "Evidence Pack" in economics_shell
    assert "calculateScenarioOutput" in economics_shell
    assert "ScenarioSelect" in economics_shell
    assert "Data Needed" in economics_shell
    assert "EnterpriseToolsPage" in economics_shell
    assert "Executive Brief" not in economics_shell
    assert "Parcel Screen" not in economics_shell
    assert "Scenario Lab" not in economics_shell
    assert "Enterprise Tools" not in economics_shell
    assert "Preview tables" in economics_shell
    assert "Show payload" in economics_shell
    assert "Flat CSV Tables" in economics_shell
    assert "Copy import order" in economics_shell
    assert "Power BI Import QA Checklist" in economics_shell
    assert "Copy QA Checklist" in economics_shell
    assert "Build Your Own Chart" in economics_shell
    assert "PowerBiChartBuilder" in economics_shell
    assert "AI Power BI Report Builder" in economics_shell
    assert "Generate Report Plan" in economics_shell
    assert "buildPowerBiReportPlan" in economics_shell
    assert "powerbi_actions" in read("src/types/api/aiSearch.ts")
    assert "demoPowerBiActionsForQuery" in ask_service
    assert "handleAskCfsResponse" in economics_shell
    assert "powerBiActionsToGeneratedPlan" in economics_shell
    assert "Apply to Chart Builder" in economics_shell
    assert "Add Visuals to Report Canvas" in economics_shell
    assert "Copy Power BI Build Steps" in economics_shell
    assert "Download Report Plan JSON" in economics_shell
    assert "Ask CFS configured this report from your prompt." in economics_shell
    assert "generatedVisualToCanvasItem" in economics_shell
    assert "ReportBucketItem" in economics_shell
    assert "GeneratedPowerBiReportSnapshot" in economics_shell
    assert "generated_report" in economics_shell
    assert "GeneratedReportPrintDetails" in economics_shell
    assert "buildGeneratedReportSnapshot" in economics_shell
    assert "ReportBucketPanel" in economics_shell
    assert "Add to Report Bucket" in economics_shell
    assert "Add Ask CFS answer to Report Bucket" in economics_shell
    assert "Add Report Plan to Report Bucket" in economics_shell
    assert "Add Canvas to Bucket" in economics_shell
    assert "Send Bucket to Print" in economics_shell
    assert "Include in Print" in economics_shell
    assert "Copy selected report items" in economics_shell
    assert "Selected Report Items" in economics_shell
    assert 'data-econ-tour="report-bucket"' in economics_shell
    assert 'data-econ-tour="print-report-bucket"' in economics_shell
    assert "userChartTemplates" in economics_shell
    assert "Opportunity Class Breakdown" in economics_shell
    assert "Economic Segment Mix" in economics_shell
    assert "Scenario Fiscal Attractiveness" in economics_shell
    assert "Copy Power BI recipe" in economics_shell
    assert "Power BI Report Canvas" in economics_shell
    assert "Add to Report Canvas" in economics_shell
    assert "Copy Report Recipe" in economics_shell
    assert "Advanced field details" in economics_shell
    assert "UserChartBar" in economics_shell
    assert "UserChartDonut" in economics_shell
    assert "UserChartMatrix" in economics_shell
    chart_metadata = economics_shell.split("const powerBiChartFieldMetadata", 1)[1].split("const userChartTemplates", 1)[0].lower()
    assert "owner" not in chart_metadata
    assert "mailing" not in chart_metadata
    assert "raw" + "_score" not in chart_metadata
    assert "Power BI Report Builder Guide" in economics_shell
    assert "Download Power BI JSON Pack" in economics_shell
    assert "Copy relationships" in economics_shell
    assert "Suggested DAX-style measures" in economics_shell
    assert "Power BI Concepts Used" in economics_shell
    assert "Quality checks" in economics_shell
    assert "Planning Model Schema" in economics_shell
    assert "DetailsBlock" in economics_shell
    assert "visiblePromptCount={6}" in economics_shell
    assert "More prompts" in read("src/components/dashboard/AskCfsPanel.tsx")
    assert "CFS Economics Snapshot" in economics_shell
    assert "CFS Economics Snapshot" in economics_shell
    assert "Print / Save as PDF" in economics_shell
    assert "Copy Executive Summary" in economics_shell
    assert "Copy Decision Memo" in economics_shell
    assert "Copy Evidence Pack" in economics_shell
    assert "Copy Power BI follow-up notes" in economics_shell
    assert "text ready to copy manually" in economics_shell
    assert "Go to Economic Dashboard" in economics_shell
    assert "Selected Rows / Scope" in economics_shell
    assert "Opportunity & Segment Summary" in economics_shell
    assert "Fiscal / Service Burden Context" in economics_shell
    assert "Evidence Pack" in economics_shell
    assert "Caveats & Assumptions" in economics_shell
    assert "Power BI / Export Notes" in economics_shell
    assert "Top opportunity class" in economics_shell
    assert "Special assets" in economics_shell
    assert "No rows selected. This snapshot is using the current economics summary." in economics_shell
    assert "Ask CFS Economics" in economics_shell
    assert "Ask first" in economics_shell
    assert "filterContext={askCfsFilterContext}" in economics_shell
    assert economics_shell.index('tourId="ask-cfs"') < economics_shell.index('data-econ-tour="slicers"')
    assert "Domain Status Breakdown" in indicator_center
    assert "Watchlist by Domain" in indicator_center
    assert "Data Readiness Status" in indicator_center
    assert "School Pressure Signals" in indicator_center
    assert "filterContext={askCfsFilterContext}" in indicator_center
    assert "EconomicMissionControl" in indicator_center
    assert "getDemoEconomicsIntelligence" in economics_service
    assert '"/economics/intelligence"' in economics_service
    assert '"/economics/enterprise-export"' in economics_service
    assert '"/economics/powerbi-export"' in economics_service
    assert "EnterpriseExportPreviewKind" in enterprise_export_types
    assert "askCfsEconomicsSuggestedPrompts" in ask_service
    assert "askCfsEconomicsWorkspacePrompts" in ask_service
    assert 'app_mode === "economics"' in ask_service
    assert "Source: ${source}" in read("src/components/dashboard/AskCfsPanel.tsx")
    assert "portfolio_demo_extract" in ask_service
    assert "cached_demo_extract" in ask_service
    assert "Traditional GIS can show where things are" in overview
    assert "Consulting Decision Workflows" in overview
    assert "What should I inspect first?" in ask_service
    assert "What does the opportunity class chart mean?" in ask_service
    assert "How do I recreate this dashboard in Power BI?" in ask_service
    assert "Explain the scenario comparison matrix." in ask_service
    assert "What does the data confidence register show?" in ask_service
    assert "What should go in the print snapshot?" in ask_service
    assert "Write an executive takeaway." in ask_service
    assert "What caveats should I include?" in ask_service
    assert "What next diligence should I list?" in ask_service
    assert "Which chart shows fiscal burden?" in ask_service
    assert "Which rows should I select first?" in ask_service
    assert "What does this table mean?" in ask_service
    assert "Which underbuilt candidates need review?" in ask_service
    assert "What should I do with selected rows?" in ask_service
    assert "Where did Workspace go?" in ask_service
    assert "What is Power BI & Tools?" in ask_service
    assert "What should I send to Print?" in ask_service
    assert "How should I walk through CFS Economics?" in ask_service
    assert "Which rows should I send?" in ask_service
    assert "How do I build this in Power BI?" in ask_service
    assert "Build me a Power BI report." in ask_service
    assert "Create a chart of opportunity classes." in ask_service
    assert "Build a report for underbuilt parcels." in ask_service
    assert "Make a scenario comparison page." in ask_service
    assert "Show special assets as a report." in ask_service
    assert "Build a data confidence matrix." in ask_service
    assert "What should I add to the Power BI Report Canvas?" in ask_service
    assert "What should I add to the report bucket?" in ask_service
    assert "How do I use the report bucket?" in ask_service
    assert "What bucket items should go in the print snapshot?" in ask_service
    assert "Build a report plan and add it to the bucket." in ask_service
    assert "Build me a Power BI dashboard." in ask_service
    assert "What charts should Power BI generate?" in ask_service
    assert "AI Power BI Report Builder" in ask_service
    assert "How do I build a chart?" in ask_service
    assert "How do I QA the export?" in ask_service
    assert "Which areas show underbuilt opportunity?" in ask_service
    assert "Where is data confidence weak?" in ask_service
    assert "Build a decision-pack summary." in ask_service
    assert "Which parcels look underbuilt?" in ask_service
    assert "Where is tax-base opportunity high?" in ask_service
    assert "Should I use JSON or CSV for Power BI?" in ask_service
    assert "What CSV tables should I import first?" in ask_service
    assert "How do I QA the Power BI export?" in ask_service
    assert "Build a snapshot summary." in ask_service
    assert "What should go in the print snapshot?" in ask_service
    assert "Write an executive takeaway." in ask_service
    assert "What should go into the economic snapshot?" in ask_service
    assert "What caveats should I include?" in ask_service
    assert "What next diligence should I list?" in ask_service
    assert "How should I present selected rows?" in ask_service
    assert "What relationships should I build?" in ask_service
