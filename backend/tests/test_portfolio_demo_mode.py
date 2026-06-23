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
    assert "searchDemoParcels" in command_palette
    assert "getDemoSampleParcels" in parcel_panel
    assert "getDemoParcelById" in parcel_panel
    assert "PIN, parcel ID, subdivision, zoning" in parcel_panel


def test_demo_data_files_exist_and_avoid_sensitive_contact_fields() -> None:
    demo_dir = REPO_ROOT / "public" / "demo-data"
    expected_files = {
        "demo_manifest.json",
        "development_years.json",
        "indicator_summary.json",
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


def test_portfolio_demo_mode_is_documented() -> None:
    readme = read("README.md")
    env_example = read(".env.example")
    deployment_report = read("docs/deployment_report.md")

    assert "Portfolio Demo Mode" in readme
    assert "NEXT_PUBLIC_CFS_DEPLOYMENT_MODE=demo" in env_example
    assert "NEXT_PUBLIC_USE_BACKEND_API=false" in env_example
    assert "public/demo-data" in deployment_report
