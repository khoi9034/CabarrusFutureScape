from pathlib import Path
from zipfile import ZipFile


REPO_ROOT = Path(__file__).resolve().parents[2]


def read(path: str) -> str:
    return (REPO_ROOT / path).read_text(encoding="utf-8")


def test_frontend_runtime_mode_switch_is_demo_safe() -> None:
    client = read("src/lib/api/client.ts")

    assert "CFS_RUNTIME_CONFIG" in client
    assert 'CFS_RUNTIME_MODE === "demo"' in client
    assert "USE_BACKEND_API = CFS_RUNTIME_CONFIG.useBackendApi" in client


def test_retired_investment_urls_redirect_home() -> None:
    page = read("src/app/page.tsx")
    state = read("src/hooks/useDashboardState.tsx")
    url_sync = read("src/components/dashboard/DashboardUrlSync.tsx")
    app_types = read("src/types/index.ts")

    assert 'appMode === "consulting"' in page
    for key in (
        "investmentPage",
        "consultingPage",
        "caseStudy",
        "caseStep",
        "casePanel",
        "caseItem",
    ):
        assert f'"{key}"' in page
        assert f'has("{key}")' not in state
        assert f'has("{key}")' not in url_sync
    assert 'redirect("/")' in page
    assert 'value === "consulting"' not in state
    assert '| "consulting"' not in app_types


def test_home_and_switcher_expose_only_active_destinations() -> None:
    home = read("src/components/layout/CfsMasterHome.tsx")
    top_nav = read("src/components/layout/TopNav.tsx")
    app_shell = read("src/components/layout/AppShell.tsx")

    destinations = (
        ("CFS Planning", "Open Planning", "/?app=planning"),
        ("CFS Economics", "Open Economics", "/?app=economics"),
        ("Ask CFS", "Open Ask CFS", "/?app=ask-cfs"),
        ("CFS Master Data", "Open Master Data", "/?app=master-data"),
    )
    for title, action, route in destinations:
        assert title in home
        assert action in home
        assert route in home

    assert "data-testid=\"cfs-master-home\"" in home
    assert "planning intelligence and self-service data platform" in home
    assert "CFS Investments" not in home
    assert "CFS Investments" not in top_nav
    assert "Investment Intelligence" not in top_nav
    assert "ConsultingShell" not in app_shell
    assert "InvestmentShell" not in app_shell
    assert 'window.history.pushState(null, "", "/")' in top_nav


def test_ask_cfs_is_a_first_class_destination() -> None:
    app_shell = read("src/components/layout/AppShell.tsx")
    app_types = read("src/types/index.ts")
    state = read("src/hooks/useDashboardState.tsx")
    url_sync = read("src/components/dashboard/DashboardUrlSync.tsx")

    assert '| "ask-cfs"' in app_types
    assert 'value === "ask-cfs"' in state
    assert 'appMode === "ask-cfs"' in url_sync
    assert 'cfsAppMode === "ask-cfs"' in app_shell
    assert 'moduleName="Ask CFS"' in app_shell
    assert '<AskCfsPanel' in app_shell
    assert 'appMode="planning"' in app_shell
    assert "Ask planning and economics questions" in app_shell


def test_planning_and_economics_navigation_remains_focused() -> None:
    top_nav = read("src/components/layout/TopNav.tsx")
    state = read("src/hooks/useDashboardState.tsx")
    economics = read("src/components/economics/EconomicsShell.tsx")

    planning_nav = top_nav.split("const productModes", 1)[1].split(
        "const economicsProductModes", 1
    )[0]
    economics_nav = top_nav.split("const economicsProductModes", 1)[1].split(
        "const QUICK_SEARCH_LIMIT", 1
    )[0]
    assert 'label: "Overview"' not in planning_nav
    assert 'label: "Overview"' not in economics_nav
    assert "Planning Snapshot" in planning_nav
    assert "Power BI & Tools" in economics_nav
    assert "Economic Dashboard" in economics_nav
    assert "Print" in economics_nav
    assert 'useState<ProductMode>("workspace")' in state
    assert 'useState<EconomicsSection>("dashboard")' in state
    assert "EconomicsShell" in economics


def test_demo_data_is_sanitized_and_contains_no_retired_module() -> None:
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
    assert expected_files.issubset({path.name for path in demo_dir.glob("*.json")})
    assert expected_map_files.issubset(
        {path.name for path in (demo_dir / "map_layers").glob("*")}
    )

    demo_parts: list[str] = []
    for path in demo_dir.rglob("*"):
        if not path.is_file():
            continue
        if path.suffix == ".zip":
            with ZipFile(path) as archive:
                demo_parts.extend(
                    archive.read(name).decode("utf-8").lower()
                    for name in archive.namelist()
                    if not name.endswith("/")
                )
            continue
        demo_parts.append(path.read_text(encoding="utf-8").lower())
    demo_text = "\n".join(demo_parts)
    for term in (
        "acctname",
        "mailaddr",
        '"mailing"',
        '"owner"',
        "password",
        "database_url",
        "token",
        "secret",
        "cfs investments",
        "case-1",
    ):
        assert term not in demo_text


def test_demo_map_layers_are_backend_independent() -> None:
    map_client = read("src/lib/demo-data/mapLayerClient.ts")
    scene = read("src/components/gis/SceneViewContainer.tsx")
    layer_toggle = read("src/components/dashboard/LayerToggle.tsx")

    assert "getDemoGeoJsonLayer" in map_client
    assert "getDemoDevelopmentHotspotsBySegment" in map_client
    assert "getDemoModelLabMarkers" in map_client
    assert "getDemoParcelMapFocus" in map_client
    assert "getModeScopedActiveLayerIds" in scene
    assert "applyOperationalLayerVisibility" in scene
    assert "Permit Year Range" in layer_toggle
    assert "Portfolio Demo" in layer_toggle


def test_map_view_modes_and_land_screener_remain_available() -> None:
    overlay_modes = read("src/types/map/overlayViewModes.ts")
    layer_toggle = read("src/components/dashboard/LayerToggle.tsx")
    sidebar = read("src/components/layout/Sidebar.tsx")
    scene = read("src/components/gis/SceneViewContainer.tsx")
    intelligence = read("src/components/dashboard/IntelligencePanel.tsx")

    assert '"points" | "clusters" | "heatmap"' in overlay_modes
    assert "Development Hotspots view mode" in layer_toggle
    assert "Model Lab research overlay view mode" in sidebar
    assert "createPermitActivityHeatmapRenderer" in scene
    assert "createResearchSignalHeatmapRenderer" in scene
    assert "LandOpportunityScreenerPanel" in intelligence
    assert "Land Opportunity Screener" in intelligence


def test_master_data_workflow_remains_available() -> None:
    workspace = read("src/components/master-data/MasterDataWorkspace.tsx")
    app_shell = read("src/components/layout/AppShell.tsx")

    assert "<MasterDataWorkspace />" in app_shell
    assert "Master Data extract builder" in workspace
    assert 'const steps = ["Choose Dataset", "Filter Records", "Choose Fields", "Preview", "Export"]' in workspace
    assert "master_data:export" in workspace
    assert "Portfolio Demo uses bundled sanitized samples" in workspace


def test_economics_reports_due_diligence_and_ask_cfs_remain_available() -> None:
    economics = read("src/components/economics/EconomicsShell.tsx")
    economics_service = read("src/lib/economicsIntelligenceService.ts")
    ask_service = read("src/lib/aiSearchService.ts")

    for contract in (
        "Land Due Diligence Screener",
        "EconomicDashboardPage",
        "EnterpriseToolsPage",
        "EconomicsPrintPage",
        "ReportBucketPanel",
        "Add to Report Bucket",
        "Send Bucket to Print",
        "Ask CFS Economics",
        "Power BI Report Canvas",
        "Generate Due Diligence Packet",
        "WSACC data supports sewer proximity and subbasin context only",
    ):
        assert contract in economics
    assert "InvestmentShell" not in economics
    assert "investmentIntelligenceService" not in economics
    assert '"/economics/intelligence"' in economics_service
    assert '"/economics/enterprise-export"' in economics_service
    assert '"/economics/powerbi-export"' in economics_service
    assert "askCfsEconomicsSuggestedPrompts" in ask_service
    assert 'app_mode === "economics"' in ask_service


def test_portfolio_demo_mode_is_documented() -> None:
    readme = read("README.md")
    env_example = read(".env.example")
    deployment_report = read("docs/deployment_report.md")

    assert "Portfolio Demo Mode" in readme
    assert "NEXT_PUBLIC_CFS_RUNTIME_MODE=demo" in env_example
    assert "NEXT_PUBLIC_CFS_DATA_PROVIDER=static" in env_example
    assert "public/demo-data" in deployment_report
