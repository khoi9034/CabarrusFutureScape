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
        "indicator_summary.json",
        "development_trends.json",
        "flood_summary.json",
        "school_capacity_watch.json",
        "model_status.json",
        "sample_parcels.json",
        "model_lab_demo_clusters.json",
    }

    assert expected_files.issubset({path.name for path in demo_dir.glob("*.json")})

    demo_text = "\n".join(
        path.read_text(encoding="utf-8").lower()
        for path in demo_dir.glob("*.json")
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


def test_portfolio_demo_mode_is_documented() -> None:
    readme = read("README.md")
    env_example = read(".env.example")
    deployment_report = read("docs/deployment_report.md")

    assert "Portfolio Demo Mode" in readme
    assert "NEXT_PUBLIC_CFS_DEPLOYMENT_MODE=demo" in env_example
    assert "NEXT_PUBLIC_USE_BACKEND_API=false" in env_example
    assert "public/demo-data" in deployment_report
