import importlib.util
import json
import os
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

from app.database import get_engine
from app.main import app


client = TestClient(app)

REPO_ROOT = Path(__file__).resolve().parents[2]
CONFIG_FILE = REPO_ROOT / "config" / "development_prediction_features.json"
TRANSFORM_SCRIPT = (
    REPO_ROOT
    / "cfs-data-pipelines"
    / "transform"
    / "create_development_prediction_feature_matrix.py"
)
ZONING_TRANSFORM_SCRIPT = (
    REPO_ROOT
    / "cfs-data-pipelines"
    / "transform"
    / "create_development_prediction_zoning_enhanced_features.py"
)
ZONING_MODEL_SCRIPT = (
    REPO_ROOT
    / "cfs-data-pipelines"
    / "modeling"
    / "train_development_zoning_enhanced_model.py"
)
PHASE10E_METRICS_FILE = (
    REPO_ROOT
    / "outputs"
    / "modeling"
    / "development_prediction"
    / "phase10e_model_comparison_metrics.json"
)
PHASE10E_SAMPLE_FILE = (
    REPO_ROOT
    / "outputs"
    / "modeling"
    / "development_prediction"
    / "phase10e_zoning_enhanced_predictions_sample.csv"
)
PHASE10F_SUMMARY_FILE = (
    REPO_ROOT / "outputs" / "phase10f_development_prediction_model_qa_summary.json"
)
PHASE10F_CALIBRATION_FILE = (
    REPO_ROOT
    / "outputs"
    / "modeling"
    / "development_prediction"
    / "phase10f_calibration_review.json"
)
PHASE10F_TOP_REVIEW_FILE = (
    REPO_ROOT
    / "outputs"
    / "modeling"
    / "development_prediction"
    / "phase10f_top_ranked_parcel_review.csv"
)
PHASE10G_SUMMARY_FILE = (
    REPO_ROOT / "outputs" / "phase10g_internal_development_ranking_summary.json"
)
PHASE10G_VALIDATION_FILE = (
    REPO_ROOT
    / "outputs"
    / "modeling"
    / "development_prediction"
    / "phase10g_ranking_class_validation.json"
)
spec = importlib.util.spec_from_file_location(
    "create_development_prediction_feature_matrix",
    TRANSFORM_SCRIPT,
)
assert spec and spec.loader
feature_matrix = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = feature_matrix
spec.loader.exec_module(feature_matrix)
zoning_transform_spec = importlib.util.spec_from_file_location(
    "create_development_prediction_zoning_enhanced_features",
    ZONING_TRANSFORM_SCRIPT,
)
assert zoning_transform_spec and zoning_transform_spec.loader
zoning_transform = importlib.util.module_from_spec(zoning_transform_spec)
sys.modules[zoning_transform_spec.name] = zoning_transform
zoning_transform_spec.loader.exec_module(zoning_transform)
zoning_model_spec = importlib.util.spec_from_file_location(
    "train_development_zoning_enhanced_model",
    ZONING_MODEL_SCRIPT,
)
assert zoning_model_spec and zoning_model_spec.loader
zoning_model = importlib.util.module_from_spec(zoning_model_spec)
sys.modules[zoning_model_spec.name] = zoning_model
zoning_model_spec.loader.exec_module(zoning_model)

db_required = pytest.mark.skipif(
    not (os.getenv("POSTGRES_PASSWORD") or os.getenv("CFS_POSTGRES_PASSWORD")),
    reason="Database password environment variable is not configured.",
)


def test_development_prediction_feature_config_parses() -> None:
    config = json.loads(CONFIG_FILE.read_text(encoding="utf-8"))

    assert config["model_active"] is False
    assert config["prediction_probability_available"] is False
    assert "permit_history_features" in config["feature_groups"]
    assert "new_construction_history_features" in feature_matrix.feature_registry_groups()
    assert "zoning_history_available_flag" in {
        feature["feature_name"] for feature in config["features"]
    }


@db_required
def test_development_prediction_features_summary_endpoint() -> None:
    response = client.get("/development/prediction/features/summary")

    assert response.status_code == 200
    body = response.json()
    assert body["feature_matrix_available"] is True
    assert body["row_count"] == 1430221
    assert body["unique_parcel_count"] == 110017
    assert body["model_active"] is False
    assert body["prediction_probability_available"] is False
    assert "prediction_probability" not in body
    assert body["production_ready"] is False
    assert body["zoning_enhanced_feature_matrix_available"] is True
    assert body["zoning_enhanced_row_count"] == 1430221
    assert body["zoning_enhanced_model_experiment_available"] is True
    assert body["latest_zoning_enhanced_experiment_id"] == "phase10e_zoning_enhanced_v1"
    assert body["baseline_vs_zoning_metrics_summary"]["internal_only"] is True
    assert body["baseline_vs_zoning_metrics_summary"]["model_active"] is False
    assert body["baseline_vs_zoning_metrics_summary"][
        "prediction_probability_available"
    ] is False
    assert body["latest_model_qa_available"] is True
    assert body["latest_model_qa_id"] == "phase10f_model_qa_v1"
    assert body["standardized_metrics_available"] is True
    assert body["calibration_review_available"] is True
    assert body["label_positive_rates"]
    assert body["leakage_caveats"]


@db_required
def test_development_prediction_feature_rows_match_labels() -> None:
    with get_engine().connect() as connection:
        row = connection.execute(
            text(
                """
                SELECT
                  (SELECT COUNT(*) FROM public.parcel_development_prediction_features)
                    AS feature_rows,
                  (SELECT COUNT(*) FROM public.parcel_development_prediction_labels)
                    AS label_rows
                """,
            ),
        ).mappings().one()

    assert row["feature_rows"] == row["label_rows"] == 1430221


@db_required
def test_development_prediction_prior_windows_do_not_go_negative() -> None:
    with get_engine().connect() as connection:
        row = connection.execute(
            text(
                """
                SELECT
                  COUNT(*) FILTER (WHERE years_since_last_permit < 0)
                    AS negative_permit_age_rows,
                  COUNT(*) FILTER (WHERE years_since_last_new_construction < 0)
                    AS negative_new_construction_age_rows,
                  COUNT(*) FILTER (
                    WHERE permits_prior_1yr < 0
                       OR permits_prior_3yr < 0
                       OR permits_prior_5yr < 0
                       OR new_construction_permits_prior_1yr < 0
                       OR new_construction_permits_prior_3yr < 0
                       OR new_construction_permits_prior_5yr < 0
                  ) AS negative_count_rows
                FROM public.parcel_development_prediction_features
                """,
            ),
        ).mappings().one()

    assert row["negative_permit_age_rows"] == 0
    assert row["negative_new_construction_age_rows"] == 0
    assert row["negative_count_rows"] == 0


@db_required
def test_development_prediction_school_capacity_remains_inactive() -> None:
    with get_engine().connect() as connection:
        row = connection.execute(
            text(
                """
                SELECT
                  COUNT(*) FILTER (WHERE school_capacity_status <> 'not_available')
                    AS active_capacity_rows,
                  COUNT(*) FILTER (WHERE school_constraint_score IS NOT NULL)
                    AS scored_rows,
                  COUNT(*) FILTER (WHERE school_constraint_class <> 'not_scored')
                    AS classified_rows
                FROM public.parcel_development_prediction_features
                """,
            ),
        ).mappings().one()

    assert row["active_capacity_rows"] == 0
    assert row["scored_rows"] == 0
    assert row["classified_rows"] == 0


def test_development_prediction_features_endpoint_is_in_openapi() -> None:
    response = client.get("/openapi.json")

    assert response.status_code == 200
    assert "/development/prediction/features/summary" in response.json()["paths"]


@db_required
def test_zoning_enhanced_feature_matrix_preserves_base_rows_and_blocks_future_leakage() -> None:
    with get_engine().connect() as connection:
        row = connection.execute(
            text(
                """
                SELECT
                  (SELECT COUNT(*) FROM public.parcel_development_prediction_features)
                    AS base_rows,
                  (SELECT COUNT(*) FROM public.parcel_development_prediction_features_zoning_enhanced)
                    AS enhanced_rows,
                  (
                    SELECT COUNT(*)
                    FROM public.parcel_development_prediction_features_zoning_enhanced
                    WHERE zoning_source_year > snapshot_year
                  ) AS source_year_leakage_rows,
                  (
                    SELECT COUNT(*)
                    FROM public.parcel_development_prediction_features_zoning_enhanced
                    WHERE latest_zoning_change_year > snapshot_year
                  ) AS change_year_leakage_rows,
                  (
                    SELECT COUNT(*)
                    FROM public.parcel_development_prediction_features_zoning_enhanced
                    WHERE zoning_temporal_status = 'current_context'
                  ) AS current_context_rows
                """,
            ),
        ).mappings().one()

    assert row["base_rows"] == row["enhanced_rows"] == 1430221
    assert row["source_year_leakage_rows"] == 0
    assert row["change_year_leakage_rows"] == 0
    assert row["current_context_rows"] == 0


def test_zoning_enhanced_model_feature_set_has_no_target_leakage() -> None:
    feature_columns = zoning_model.baseline.feature_columns_for_set(
        "zoning_enhanced_history",
    )

    zoning_model.baseline.assert_no_target_leakage(feature_columns)
    assert "historical_zoning_code" in feature_columns
    assert "zoning_changed_prior_5yr" in feature_columns
    assert "new_construction_next_3yr" not in feature_columns


def test_phase10e_model_output_structure_is_internal_only() -> None:
    assert PHASE10E_METRICS_FILE.exists()
    payload = json.loads(PHASE10E_METRICS_FILE.read_text(encoding="utf-8"))

    assert payload["experiment_id"] == "phase10e_zoning_enhanced_v1"
    assert payload["model_active"] is False
    assert payload["prediction_probability_available"] is False
    assert payload["production_ready"] is False
    assert payload["zoning_enhanced"]["best_model_name"]
    assert payload["comparison_on_selected_best_models"]


def test_phase10e_prediction_sample_is_not_frontend_ready() -> None:
    assert PHASE10E_SAMPLE_FILE.exists()
    sample_text = PHASE10E_SAMPLE_FILE.read_text(encoding="utf-8")

    assert "experimental_probability" in sample_text
    assert "internal_experiment_not_for_public_decision" in sample_text
    assert "production_ready" in sample_text


def test_no_public_development_prediction_score_endpoint_exists() -> None:
    response = client.get("/openapi.json")

    assert response.status_code == 200
    prediction_paths = [
        path
        for path in response.json()["paths"]
        if path.startswith("/development/prediction")
    ]
    assert sorted(prediction_paths) == [
        "/development/prediction/features/summary",
        "/development/prediction/ranking/summary",
        "/development/prediction/transportation-accessibility/summary",
        "/development/prediction/transportation-plan-traffic/summary",
    ]
    assert all("{official_parcel_id}" not in path for path in prediction_paths)


def test_phase23_model_research_preview_endpoint_is_safe() -> None:
    response = client.get(
        "/development/model-research/preview",
        params={"include_geometry": True, "limit": 5, "signal": "higher"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["production_ready"] is False
    assert body["public_exposure_allowed"] is False
    assert body["exact_probability_available"] is False
    assert body["no_exact_probabilities"] is True
    assert body["no_raw_model_scores"] is True
    assert body["no_official_prediction_classes"] is True

    serialized = json.dumps(body).lower()
    forbidden_terms = [
        "prediction_probability",
        "experimental_probability",
        '"raw_model_score":',
        "development_signal_class",
        "growth_probability",
    ]
    for term in forbidden_terms:
        assert term not in serialized

    for feature in body["features"]:
        assert feature["production_ready"] is False
        assert feature["public_exposure_allowed"] is False
        assert feature["exact_probability_available"] is False
        assert "prediction_probability" not in feature
        assert "experimental_probability" not in feature
        assert "raw_model_score" not in feature
        assert "development_signal_class" not in feature


def test_phase23d_model_lab_progressive_ui_copy_and_guardrails() -> None:
    scene_text = (
        REPO_ROOT / "src" / "components" / "gis" / "SceneViewContainer.tsx"
    ).read_text(encoding="utf-8")
    right_panel_text = (
        REPO_ROOT / "src" / "components" / "dashboard" / "IntelligencePanel.tsx"
    ).read_text(encoding="utf-8")
    sidebar_text = (
        REPO_ROOT / "src" / "components" / "layout" / "Sidebar.tsx"
    ).read_text(encoding="utf-8")
    report_text = (
        REPO_ROOT / "src" / "components" / "dashboard" / "DueDiligenceReview.tsx"
    ).read_text(encoding="utf-8")

    assert "countywide_heatmap" in scene_text
    assert "clustered_markers" in scene_text
    assert "parcel_detail" in scene_text
    assert "Explain the Numbers" in right_panel_text
    assert "ModelLabViewModeControl" in sidebar_text
    assert "Model Lab research overlay view mode" in sidebar_text
    assert "Heatmap shows relative research concentration only." in sidebar_text
    assert "countywide heatmap cell" in report_text
    assert "research records in a cluster" in report_text

    user_facing_text = "\n".join(
        [scene_text, right_panel_text, sidebar_text, report_text],
    ).lower()
    forbidden_terms = [
        "prediction_probability",
        "experimental_probability",
        '"raw_model_score":',
        "development_signal_class",
        "parcel_score",
        "will_develop",
        "likelihood percentage",
    ]
    for term in forbidden_terms:
        assert term not in user_facing_text


def test_phase23e_model_lab_relative_signal_ui_cleanup() -> None:
    scene_text = (
        REPO_ROOT / "src" / "components" / "gis" / "SceneViewContainer.tsx"
    ).read_text(encoding="utf-8")
    right_panel_text = (
        REPO_ROOT / "src" / "components" / "dashboard" / "IntelligencePanel.tsx"
    ).read_text(encoding="utf-8")
    sidebar_text = (
        REPO_ROOT / "src" / "components" / "layout" / "Sidebar.tsx"
    ).read_text(encoding="utf-8")
    app_shell_text = (
        REPO_ROOT / "src" / "components" / "layout" / "AppShell.tsx"
    ).read_text(encoding="utf-8")
    report_text = (
        REPO_ROOT / "src" / "components" / "dashboard" / "DueDiligenceReview.tsx"
    ).read_text(encoding="utf-8")
    model_lab_text = (
        REPO_ROOT / "src" / "data" / "intelligence" / "developmentModelLab.ts"
    ).read_text(encoding="utf-8")

    assert "ModelLabMapModeBadge" not in app_shell_text
    assert "Very Strong Research Signal" in model_lab_text
    assert "Strong Research Signal" in model_lab_text
    assert "Moderate Research Signal" in model_lab_text
    assert "Lower Research Signal" in model_lab_text
    assert "Development Research Signal" in right_panel_text
    assert "Explain the Numbers" in right_panel_text
    assert "These are aggregate test metrics and relative research bands" in right_panel_text
    assert "formatRelativeDevelopmentSignalBand" in scene_text
    assert "What the band means" in report_text
    assert "How signal is calculated" in report_text
    assert "Driver sources" in sidebar_text

    user_facing_text = "\n".join(
        [right_panel_text, sidebar_text, app_shell_text, report_text, model_lab_text],
    ).lower()
    forbidden_terms = [
        "prediction_probability",
        "experimental_probability",
        '"raw_model_score":',
        "parcel_score",
        "growth_probability",
        "will_develop",
    ]
    for term in forbidden_terms:
        assert term not in user_facing_text


def test_phase23g_model_lab_adaptive_clustering_and_cluster_context() -> None:
    scene_text = (
        REPO_ROOT / "src" / "components" / "gis" / "SceneViewContainer.tsx"
    ).read_text(encoding="utf-8")
    right_panel_text = (
        REPO_ROOT / "src" / "components" / "dashboard" / "IntelligencePanel.tsx"
    ).read_text(encoding="utf-8")
    report_text = (
        REPO_ROOT / "src" / "components" / "dashboard" / "DueDiligenceReview.tsx"
    ).read_text(encoding="utf-8")
    sidebar_text = (
        REPO_ROOT / "src" / "components" / "layout" / "Sidebar.tsx"
    ).read_text(encoding="utf-8")
    snapshot_type_text = (REPO_ROOT / "src" / "types" / "index.ts").read_text(
        encoding="utf-8",
    )

    assert "MODEL_LAB_COUNTYWIDE_MIN_SCALE" in scene_text
    assert "MODEL_LAB_CLUSTER_MIN_SCALE" in scene_text
    assert "MODEL_LAB_COUNTYWIDE_CELL_SIZE_DEGREES" in scene_text
    assert "MODEL_LAB_CLUSTER_CELL_SIZE_DEGREES" in scene_text
    assert "MODEL_LAB_PARCEL_DETAIL_MAX_MARKERS" in scene_text
    assert "bandCounts" in scene_text
    assert "createModelResearchAreaLabel" in scene_text
    assert "Research cluster of" in scene_text
    assert "Research surface cell of" in scene_text
    assert "Selected Research Cluster" in right_panel_text
    assert "Parcels represented" in right_panel_text
    assert "Band distribution" in right_panel_text
    assert "formatModelResearchBandDistribution" in right_panel_text
    assert "Parcels represented" in report_text
    assert "phase23g_v1" in snapshot_type_text
    assert "count-scaled clusters" in sidebar_text

    user_facing_text = "\n".join(
        [scene_text, right_panel_text, report_text, sidebar_text],
    ).lower()
    forbidden_terms = [
        "prediction_probability",
        "experimental_probability",
        '"raw_model_score":',
        "parcel_score",
        "growth_probability",
        "will_develop",
        "development_signal_class",
    ]
    for term in forbidden_terms:
        assert term not in user_facing_text


def test_phase23h_model_lab_panel_prioritizes_selected_context() -> None:
    right_panel_text = (
        REPO_ROOT / "src" / "components" / "dashboard" / "IntelligencePanel.tsx"
    ).read_text(encoding="utf-8")
    report_text = (
        REPO_ROOT / "src" / "components" / "dashboard" / "DueDiligenceReview.tsx"
    ).read_text(encoding="utf-8")

    assert "getSelectedModelResearchContextTitle" in right_panel_text
    assert "Selected Research Cluster" in right_panel_text
    assert "Selected Research Feature" in right_panel_text
    assert "formatRepresentedResearchCount" in right_panel_text
    assert "1 parcel represented" in right_panel_text
    assert "parcels or features represented" not in right_panel_text
    assert "Recommended interpretation" in right_panel_text
    assert "Model QA Details" in right_panel_text
    assert "Future Model Ideas" in right_panel_text
    assert "ModelLabQaDetailsPanel" in right_panel_text
    assert "FutureModelIdeasPanel" in right_panel_text
    assert (
        right_panel_text.index("getSelectedModelResearchContextTitle")
        < right_panel_text.index("Current Map View")
    )

    assert "getModelResearchReportContextTitle" in report_text
    assert "formatModelResearchReportRepresentedCount" in report_text
    assert "Selected research cluster" in report_text
    assert "Selected research feature" in report_text
    assert "Why highlighted" in report_text

    user_facing_text = "\n".join([right_panel_text, report_text]).lower()
    forbidden_terms = [
        "prediction_probability",
        "experimental_probability",
        '"raw_model_score":',
        "parcel_score",
        "growth_probability",
        "will_develop",
        "development_signal_class",
    ]
    for term in forbidden_terms:
        assert term not in user_facing_text


def test_phase23i_model_lab_cluster_scale_calibration() -> None:
    scene_text = (
        REPO_ROOT / "src" / "components" / "gis" / "SceneViewContainer.tsx"
    ).read_text(encoding="utf-8")
    right_panel_text = (
        REPO_ROOT / "src" / "components" / "dashboard" / "IntelligencePanel.tsx"
    ).read_text(encoding="utf-8")
    report_text = (
        REPO_ROOT / "src" / "components" / "dashboard" / "DueDiligenceReview.tsx"
    ).read_text(encoding="utf-8")

    assert "MODEL_LAB_COUNTYWIDE_SCALE_THRESHOLD" in scene_text
    assert "MODEL_LAB_CLUSTER_SCALE_THRESHOLD" in scene_text
    assert "MODEL_LAB_DETAIL_SCALE_THRESHOLD" in scene_text
    assert "MODEL_LAB_COUNTYWIDE_CELL_SIZE_DEGREES = 0.08" in scene_text
    assert "MODEL_LAB_CLUSTER_CELL_SIZE_DEGREES = 0.038" in scene_text
    assert "MODEL_LAB_COUNTYWIDE_MAX_CELLS = 32" in scene_text
    assert "MODEL_LAB_CLUSTER_MAX_CELLS = 52" in scene_text
    assert "MODEL_LAB_PARCEL_DETAIL_MAX_MARKERS = 120" in scene_text
    assert "createModelResearchAggregateLabelGraphic" in scene_text
    assert "text: formatDevelopmentCount(cell.count)" in scene_text
    assert "getModelResearchCountSizeProfile" in scene_text
    assert "normalizedCount <= 5" in scene_text
    assert "normalizedCount <= 75" in scene_text
    assert "right.count * 2 + right.weight" in scene_text
    assert "formatModelResearchParcelCountLabel" in scene_text

    assert "formatSelectedModelResearchDisplayMode" in right_panel_text
    assert "Count-scaled clusters" in right_panel_text
    assert "Parcels represented" in right_panel_text
    assert "Band distribution" in right_panel_text
    assert "This Model Lab snapshot summarizes a relative research cluster" in report_text

    user_facing_text = "\n".join([scene_text, right_panel_text, report_text]).lower()
    forbidden_terms = [
        "prediction_probability",
        "experimental_probability",
        '"raw_model_score":',
        "parcel_score",
        "growth_probability",
        "will_develop",
        "development_signal_class",
        "1 parcels",
    ]
    for term in forbidden_terms:
        assert term not in user_facing_text


def test_phase23j_model_lab_intermediate_cluster_split_level() -> None:
    scene_text = (
        REPO_ROOT / "src" / "components" / "gis" / "SceneViewContainer.tsx"
    ).read_text(encoding="utf-8")
    right_panel_text = (
        REPO_ROOT / "src" / "components" / "dashboard" / "IntelligencePanel.tsx"
    ).read_text(encoding="utf-8")
    preview_type_text = (
        REPO_ROOT / "src" / "types" / "map" / "modelResearchPreview.ts"
    ).read_text(encoding="utf-8")
    snapshot_type_text = (REPO_ROOT / "src" / "types" / "index.ts").read_text(
        encoding="utf-8",
    )
    report_text = (
        REPO_ROOT / "src" / "components" / "dashboard" / "DueDiligenceReview.tsx"
    ).read_text(encoding="utf-8")

    assert "MODEL_LAB_COUNTYWIDE_CLUSTER_SCALE = 78000" in scene_text
    assert "MODEL_LAB_INTERMEDIATE_CLUSTER_SCALE = 36000" in scene_text
    assert "MODEL_LAB_FINE_CLUSTER_SCALE = 9000" in scene_text
    assert "MODEL_LAB_INDIVIDUAL_SCALE = MODEL_LAB_FINE_CLUSTER_SCALE" in scene_text
    assert "MODEL_LAB_INTERMEDIATE_CELL_SIZE_DEGREES" in scene_text
    assert "MODEL_LAB_FINE_CELL_SIZE_DEGREES = 0.014" in scene_text
    assert "MODEL_LAB_FINE_MAX_CELLS = 112" in scene_text
    assert 'return "intermediate_subclusters"' in scene_text
    assert 'return "fine_local_clusters"' in scene_text
    assert "getModelResearchClusterCellSize" in scene_text
    assert "getModelResearchClusterMaxCells" in scene_text
    assert "getModelResearchAggregateWorldLength" in scene_text
    assert "getContextualModelResearchAreaLabel" in scene_text

    assert "intermediate_subclusters" in snapshot_type_text
    assert "fine_local_clusters" in snapshot_type_text
    assert "intermediate_subclusters" in preview_type_text
    assert "fine_local_clusters" in preview_type_text
    assert "Intermediate sub-clusters" in right_panel_text
    assert "Fine local clusters" in right_panel_text
    assert "Large concentrations split into count-labeled sub-clusters" in right_panel_text
    assert "1 parcel represented" in right_panel_text
    assert "This Model Lab snapshot summarizes a relative research cluster" in report_text

    user_facing_text = "\n".join(
        [scene_text, right_panel_text, report_text, preview_type_text],
    ).lower()
    forbidden_terms = [
        "prediction_probability",
        "experimental_probability",
        '"raw_model_score":',
        "parcel_score",
        "growth_probability",
        "will_develop",
        "development_signal_class",
        "1 parcels",
    ]
    for term in forbidden_terms:
        assert term not in user_facing_text


def test_phase24c_methodology_independent_accordion_and_model_lab_explainer() -> None:
    methodology_text = (
        REPO_ROOT
        / "src"
        / "components"
        / "dashboard"
        / "MethodologyWorkspace.tsx"
    ).read_text(encoding="utf-8")
    right_panel_text = (
        REPO_ROOT / "src" / "components" / "dashboard" / "IntelligencePanel.tsx"
    ).read_text(encoding="utf-8")
    report_text = (
        REPO_ROOT / "src" / "components" / "dashboard" / "DueDiligenceReview.tsx"
    ).read_text(encoding="utf-8")
    model_lab_text = (
        REPO_ROOT / "src" / "data" / "intelligence" / "developmentModelLab.ts"
    ).read_text(encoding="utf-8")

    assert "splitIntoIndependentColumns(dataNeedDetails)" in methodology_text
    assert "openNeedDatasetIds" in methodology_text
    assert "openDataDomainIds" in methodology_text
    assert "openFaqQuestionIds" in methodology_text
    assert "openCapabilityIds" in methodology_text
    assert "toggleOpenAccordionId" in methodology_text
    assert "new Set(openIds)" in methodology_text
    assert "openNeedDatasetIds.has(need.dataset)" in methodology_text
    assert "openQuestionIds.has(item.question)" in methodology_text
    assert "openDataDomainIds.has(domain.domain)" in methodology_text
    assert "openCapabilityIds.has(card.id)" in methodology_text
    assert "data-need-column" in methodology_text
    assert "faq-column" in methodology_text
    assert "lg:items-start" in methodology_text
    assert "self-start overflow-hidden rounded-lg border" in methodology_text
    assert "Research band language" in methodology_text
    assert "Very Strong Research Signal corresponds to the highest-ranked" in methodology_text

    assert "Explain the Numbers" in right_panel_text
    assert "Research bands" in right_panel_text
    assert "Very Strong Research Signal" in right_panel_text
    assert "Strong Research Signal" in right_panel_text
    assert "Model QA Details" in right_panel_text
    assert "PR-AUC" in right_panel_text
    assert "Lift@top 5%" in right_panel_text
    assert "Precision@top 5%" in right_panel_text
    assert "How this is calculated" in right_panel_text
    assert "These are aggregate model test metrics, not parcel-level scores." in right_panel_text
    assert "Not an exact probability. Not an official parcel score." in right_panel_text

    assert "Very Strong Research Signal" in model_lab_text
    assert "Insufficient Data" in model_lab_text
    assert "getModelResearchBandMeaning" in model_lab_text
    assert "How signal is calculated" in report_text
    assert "This is an internal research preview. It does not show exact parcel" in report_text

    user_facing_text = "\n".join(
        [methodology_text, right_panel_text, report_text, model_lab_text],
    ).lower()
    forbidden_terms = [
        "prediction_probability",
        "experimental_probability",
        '"raw_model_score":',
        "parcel_score",
        "growth_probability",
        "will_develop",
    ]
    for term in forbidden_terms:
        assert term not in user_facing_text


def test_phase24b_overview_task_mode_navigation_copy_and_guardrails() -> None:
    command_text = (
        REPO_ROOT
        / "src"
        / "components"
        / "dashboard"
        / "OverviewCommandCenter.tsx"
    ).read_text(encoding="utf-8")
    right_panel_text = (
        REPO_ROOT / "src" / "components" / "dashboard" / "IntelligencePanel.tsx"
    ).read_text(encoding="utf-8")
    sidebar_text = (
        REPO_ROOT / "src" / "components" / "layout" / "Sidebar.tsx"
    ).read_text(encoding="utf-8")

    assert 'actionLabel: "Search Parcel"' not in command_text
    assert 'actionLabel: "Explore Countywide"' in command_text
    assert 'actionLabel: "Indicator Center"' in command_text
    assert 'actionLabel: "Model Lab"' in command_text
    assert 'actionLabel: "Snapshot Builder"' not in command_text
    assert 'actionLabel: "Countywide Intelligence"' not in command_text
    assert 'setOverviewCommandMode("snapshot")' not in command_text
    assert "CFS Workspace Center" in command_text

    assert "<SnapshotCapturePanel" in right_panel_text
    assert "IndicatorCenterPanel" in right_panel_text
    assert "Selected Parcel Intelligence" in right_panel_text
    assert "Countywide Intelligence" in right_panel_text
    assert "Snapshot Builder mode active" in right_panel_text
    assert "A Planning Snapshot combines the map image" in right_panel_text
    assert "Model Lab Intelligence" in right_panel_text

    assert "SnapshotModeControlsPanel" in sidebar_text
    assert "Current mode" in sidebar_text
    assert "Active layers" in sidebar_text
    assert "Map image" in sidebar_text

    user_facing_text = "\n".join(
        [command_text, right_panel_text, sidebar_text],
    ).lower()
    forbidden_terms = [
        "prediction_probability",
        "experimental_probability",
        '"raw_model_score":',
        "development_signal_class",
        "parcel_score",
        "will develop",
    ]
    for term in forbidden_terms:
        assert term not in user_facing_text


def test_phase24b_qa1_command_center_cards_are_readable() -> None:
    command_text = (
        REPO_ROOT
        / "src"
        / "components"
        / "dashboard"
        / "OverviewCommandCenter.tsx"
    ).read_text(encoding="utf-8")

    expected_card_copy = [
        "Explore live map layers, activity, constraints, schools, transportation, and infrastructure.",
        "Review attention flags and countywide signals that show where staff may need follow-up.",
        "Explore internal development model research and relative research signals.",
    ]
    for card_copy in expected_card_copy:
        assert card_copy in command_text

    assert "min-h-[68px]" in command_text
    assert "md:grid-cols-3" in command_text
    assert "snapshotStatusText" in command_text
    assert 'className="truncate text-sm font-semibold"' not in command_text


def test_phase24b_qa2_overview_compact_command_center_and_no_bottom_kpi() -> None:
    command_text = (
        REPO_ROOT
        / "src"
        / "components"
        / "dashboard"
        / "OverviewCommandCenter.tsx"
    ).read_text(encoding="utf-8")
    app_shell_text = (
        REPO_ROOT / "src" / "components" / "layout" / "AppShell.tsx"
    ).read_text(encoding="utf-8")
    right_panel_text = (
        REPO_ROOT / "src" / "components" / "dashboard" / "IntelligencePanel.tsx"
    ).read_text(encoding="utf-8")

    assert "MetricsBar" not in app_shell_text
    assert "Explore countywide, review indicators, or open internal research." in command_text
    assert "Explore live map layers, activity, constraints, schools, transportation, and infrastructure." in command_text
    assert "Review attention flags and countywide signals that show where staff may need follow-up." in command_text
    assert "Explore internal development model research and relative research signals." in command_text
    assert "min-h-[68px]" in command_text
    assert "bg-[#68d8ff]/16" in command_text
    assert "shadow-[0_0_30px_rgba(104,216,255,0.2)]" in command_text
    assert "absolute inset-y-2 left-0 w-1" in command_text

    assert "Permit Records" in right_panel_text
    assert "Active Parcels" in right_panel_text
    assert "Flood Review" in right_panel_text
    assert "Parcel Coverage" in right_panel_text


def test_phase24b_qa3_snapshot_builder_does_not_save_from_top_command() -> None:
    command_text = (
        REPO_ROOT
        / "src"
        / "components"
        / "dashboard"
        / "OverviewCommandCenter.tsx"
    ).read_text(encoding="utf-8")
    sidebar_text = (
        REPO_ROOT / "src" / "components" / "layout" / "Sidebar.tsx"
    ).read_text(encoding="utf-8")
    right_panel_text = (
        REPO_ROOT / "src" / "components" / "dashboard" / "IntelligencePanel.tsx"
    ).read_text(encoding="utf-8")

    assert 'actionLabel: "Snapshot Builder"' not in command_text
    assert 'helper: "Choose what to capture."' not in command_text
    assert "function openSnapshotBuilder()" not in command_text
    assert 'setOverviewCommandMode("snapshot")' not in command_text

    explicit_save_block = command_text.split("function saveSnapshotForReport()", 1)[
        1
    ].split("function openPlanningSnapshot()", 1)[0]
    assert "CFS_SAVE_PLANNING_SNAPSHOT_EVENT" in explicit_save_block
    assert "Save Another Snapshot" in command_text

    assert "Snapshot Builder" in sidebar_text
    assert "Choose what to capture" in sidebar_text
    assert "Snapshot will include selected parcel facts" in sidebar_text
    assert "Snapshot will capture the current map" in sidebar_text
    assert "Save Snapshot" in sidebar_text

    assert "Snapshot Builder mode active" in right_panel_text
    assert "Click Save Snapshot to capture the current map" in right_panel_text


def test_phase24e_planning_snapshot_simplified_report_builder() -> None:
    snapshot_text = (
        REPO_ROOT
        / "src"
        / "components"
        / "dashboard"
        / "DueDiligenceReview.tsx"
    ).read_text(encoding="utf-8")
    theme_text = (REPO_ROOT / "src" / "styles" / "cfs-theme.css").read_text(
        encoding="utf-8",
    )

    assert "PlanningSnapshotReportBuilder" in snapshot_text
    assert "PlanningSnapshotTabs" not in snapshot_text
    assert "planningSnapshotTabs" not in snapshot_text
    assert "Selected Snapshot Map" in snapshot_text
    assert "Customize Report" in snapshot_text
    assert "Explain the Numbers" in snapshot_text
    assert "Executive Summary Preview" in snapshot_text
    assert "Print Report" in snapshot_text
    assert "No planning snapshots saved yet" in snapshot_text
    assert "Open Methodology" in snapshot_text
    assert "ReportDraftsPanel" in snapshot_text
    assert "cfs.planningSnapshot.reportDrafts.v1" in snapshot_text
    assert "New Draft from Snapshot" in snapshot_text
    assert "Save Current Draft" in snapshot_text
    assert "Load Draft" in snapshot_text

    for legend_label in [
        "Very Strong Research Signal",
        "Strong Research Signal",
        "Moderate Research Signal",
        "Lower Research Signal",
        "Insufficient Data",
        "Floodway",
        "SFHA",
        "Under capacity",
        "Permit/development activity",
    ]:
        assert legend_label in snapshot_text

    assert "NorthArrow" in snapshot_text
    assert "Scale is approximate for this browser map snapshot." in snapshot_text
    assert "Active layers are listed below. No specialized legend was available" in snapshot_text
    assert "This is an internal research preview. It does not show exact parcel" in snapshot_text
    assert "showExplanationCards ? (" in snapshot_text
    assert "Method / rationale" not in snapshot_text
    assert "Recommended action" not in snapshot_text

    assert ".print-report" in theme_text
    assert ".no-print" in theme_text
    assert "display: none !important;" in theme_text

    user_facing_text = snapshot_text.lower()
    forbidden_terms = [
        "prediction_probability",
        "experimental_probability",
        '"raw_model_score":',
        "parcel_score",
        "growth_probability",
        "will_develop",
    ]
    for term in forbidden_terms:
        assert term not in user_facing_text


def test_phase24f_planning_snapshot_executive_report_builder_redesign() -> None:
    snapshot_text = (
        REPO_ROOT
        / "src"
        / "components"
        / "dashboard"
        / "DueDiligenceReview.tsx"
    ).read_text(encoding="utf-8")
    theme_text = (REPO_ROOT / "src" / "styles" / "cfs-theme.css").read_text(
        encoding="utf-8",
    )

    assert "DEFAULT_EXECUTIVE_REPORT_TITLE" in snapshot_text
    assert "Planning Snapshot Executive Summary" in snapshot_text
    assert "Report title" in snapshot_text
    assert "Report notes" in snapshot_text
    assert "Key Statistics" in snapshot_text
    assert "ReportKeyStatisticsSection" in snapshot_text
    assert "buildExecutiveKeyStatistics" in snapshot_text
    assert "buildExecutiveRecommendedActions" in snapshot_text
    assert "buildExecutiveCaveats" in snapshot_text
    assert "Explain the Numbers Appendix" in snapshot_text
    assert "What it means:" in snapshot_text
    assert "Source:" in snapshot_text
    assert "Caveat:" in snapshot_text
    assert "cfs-command-card app-chrome no-print rounded-lg p-3" in snapshot_text
    assert "cfs-command-surface app-chrome no-print rounded-lg p-4" in snapshot_text
    assert "showLegendAndNotes={extraSections.legend_map_notes}" in snapshot_text
    assert "Development activity cluster" in snapshot_text
    assert "Permit/development activity marker" in snapshot_text
    assert "Marker count = records/parcels represented" in snapshot_text
    assert "Selected parcel outline" in snapshot_text
    assert "Observed permit/development activity only. Not prediction." in snapshot_text
    assert "print-report img" in theme_text
    assert "max-height: 4.75in" in theme_text
    assert "hide dashboard nav" not in snapshot_text.lower()

    user_facing_text = snapshot_text.lower()
    forbidden_terms = [
        "prediction_probability",
        "experimental_probability",
        '"raw_model_score":',
        "parcel_score",
        "growth_probability",
        "will develop",
    ]
    for term in forbidden_terms:
        assert term not in user_facing_text


def test_phase28j_global_layout_customization_removed() -> None:
    command_text = (
        REPO_ROOT
        / "src"
        / "components"
        / "dashboard"
        / "OverviewCommandCenter.tsx"
    ).read_text(encoding="utf-8")
    app_shell_text = (
        REPO_ROOT / "src" / "components" / "layout" / "AppShell.tsx"
    ).read_text(encoding="utf-8")
    workspace_path = (
        REPO_ROOT
        / "src"
        / "components"
        / "dashboard"
        / "OverviewWorkspaceBuilder.tsx"
    )
    sidebar_text = (
        REPO_ROOT / "src" / "components" / "layout" / "Sidebar.tsx"
    ).read_text(encoding="utf-8")
    indicator_workspace_text = (
        REPO_ROOT
        / "src"
        / "components"
        / "dashboard"
        / "IndicatorCenterWorkspace.tsx"
    ).read_text(encoding="utf-8")
    dashboard_state_text = (
        REPO_ROOT / "src" / "hooks" / "useDashboardState.tsx"
    ).read_text(encoding="utf-8")

    assert "StableOverviewWorkspace" in app_shell_text
    assert not workspace_path.exists()
    assert "OverviewWorkspaceBuilder" not in app_shell_text
    assert "customOverviewActive" not in app_shell_text
    assert "initialEditMode" not in app_shell_text
    assert "Customize Layout" not in command_text
    assert "CFS_TOGGLE_OVERVIEW_CUSTOM_LAYOUT_EVENT" not in command_text
    assert "Customize Workspace layout" not in command_text
    assert "Workspace Preset" not in command_text
    assert "LayoutDashboard" not in command_text
    assert "Time window" not in indicator_workspace_text
    assert "Category" not in indicator_workspace_text
    assert "ControlSelect" not in indicator_workspace_text
    assert "Reset Layout" not in "\n".join([command_text, app_shell_text, indicator_workspace_text])
    assert "Save Layout" not in "\n".join([command_text, app_shell_text, indicator_workspace_text])
    assert "Lock Layout" not in "\n".join([command_text, app_shell_text, indicator_workspace_text])
    assert "Add Panel" not in "\n".join([command_text, app_shell_text, indicator_workspace_text])
    assert "WorkspaceTile" not in "\n".join([command_text, app_shell_text, indicator_workspace_text])
    assert "LEGACY_OVERVIEW_LAYOUT_STORAGE_KEYS" in dashboard_state_text
    assert "clearLegacyOverviewLayoutStorage" in dashboard_state_text
    assert "window.localStorage.setItem(\"cfs.overview" not in dashboard_state_text
    assert "readStoredOverviewLayoutPreference" not in dashboard_state_text
    assert "writeStoredOverviewLayoutPreference" not in dashboard_state_text
    assert "embedded?: boolean" in sidebar_text
    assert "<LayerRailEdgeHandle" in sidebar_text

    user_facing_text = "\n".join(
        [command_text, app_shell_text, indicator_workspace_text, sidebar_text],
    ).lower()
    forbidden_terms = [
        "prediction_probability",
        "experimental_probability",
        '"raw_model_score":',
        "parcel_score",
        "growth_probability",
        "will develop",
    ]
    for term in forbidden_terms:
        assert term not in user_facing_text


def test_phase28j_layout_storage_cleanup_without_persistence() -> None:
    dashboard_state_text = (
        REPO_ROOT / "src" / "hooks" / "useDashboardState.tsx"
    ).read_text(encoding="utf-8")
    types_text = (REPO_ROOT / "src" / "types" / "index.ts").read_text(
        encoding="utf-8",
    )

    assert "OverviewLayoutPreference" in types_text
    assert "OverviewLayoutPreset" not in types_text
    assert "preset:" not in types_text
    assert "cfs.overview.layout.v2" in dashboard_state_text
    assert "cfs.overview.layout.v1" in dashboard_state_text
    assert "cfs.overview.customLayout.v2" in dashboard_state_text
    assert "cfs.overview.customLayout.v1" in dashboard_state_text
    assert "LEGACY_OVERVIEW_LAYOUT_STORAGE_KEYS" in dashboard_state_text
    assert "clearLegacyOverviewLayoutStorage" in dashboard_state_text
    assert "readStoredOverviewLayoutPreference" not in dashboard_state_text
    assert "writeStoredOverviewLayoutPreference" not in dashboard_state_text
    assert "applyOverviewLayoutPreset" not in dashboard_state_text
    assert "resetOverviewLayout" not in dashboard_state_text
    assert "saveOverviewLayoutPreference" not in dashboard_state_text
    assert "setOverviewLayoutPanel" in dashboard_state_text
    assert "setOverviewLayoutWidthPreset" not in dashboard_state_text
    assert "window.localStorage.removeItem(storageKey)" in dashboard_state_text


def test_phase25b_qa1_overview_rail_and_intelligence_panel_layout() -> None:
    app_shell_text = (
        REPO_ROOT / "src" / "components" / "layout" / "AppShell.tsx"
    ).read_text(encoding="utf-8")
    sidebar_text = (
        REPO_ROOT / "src" / "components" / "layout" / "Sidebar.tsx"
    ).read_text(encoding="utf-8")
    intelligence_text = (
        REPO_ROOT
        / "src"
        / "components"
        / "dashboard"
        / "IntelligencePanel.tsx"
    ).read_text(encoding="utf-8")

    assert "const collapsedLabel = getCollapsedRailLabel(overviewCommandMode)" in sidebar_text
    assert "CollapsedRailGlyph" in sidebar_text
    assert "cfs-layer-rail--collapsed" in sidebar_text
    assert "grid h-full min-h-[22rem] min-w-0 grid-rows-[auto_minmax(0,1fr)_auto]" in sidebar_text
    assert "flex h-full min-h-0 w-full items-center justify-center py-3" in sidebar_text
    assert "h-10 w-10 rounded-md border border-white/0" in sidebar_text
    assert "right-[-0.85rem] top-1/2" in sidebar_text
    assert "whitespace-nowrap" in sidebar_text

    assert "flex h-full min-h-0 shrink-0 overflow-visible" in app_shell_text
    assert "LEFT_PANEL_COLLAPSED_WIDTH = 64" in app_shell_text
    assert "LEFT_PANEL_COLLAPSE_THRESHOLD = 210" in app_shell_text

    assert "h-full min-h-0 max-h-full w-full" in intelligence_text
    assert "overflow-x-hidden overflow-y-auto" in intelligence_text
    assert "md:max-h-[72vh]" not in intelligence_text.split(
        'aria-label={`${metadata.label} intelligence panel`}',
        1,
    )[1].split(">", 1)[0]


def test_phase25b_qa2_unified_left_panel_resize_and_layer_drawer_shell() -> None:
    app_shell_text = (
        REPO_ROOT / "src" / "components" / "layout" / "AppShell.tsx"
    ).read_text(encoding="utf-8")
    command_text = (
        REPO_ROOT
        / "src"
        / "components"
        / "dashboard"
        / "OverviewCommandCenter.tsx"
    ).read_text(encoding="utf-8")
    sidebar_text = (
        REPO_ROOT / "src" / "components" / "layout" / "Sidebar.tsx"
    ).read_text(encoding="utf-8")
    layer_toggle_text = (
        REPO_ROOT / "src" / "components" / "dashboard" / "LayerToggle.tsx"
    ).read_text(encoding="utf-8")
    theme_text = (REPO_ROOT / "src" / "styles" / "cfs-theme.css").read_text(
        encoding="utf-8",
    )

    assert "LEFT_PANEL_MIN_EXPANDED_WIDTH = 320" in app_shell_text
    assert "LEFT_PANEL_MAX_EXPANDED_WIDTH = 520" in app_shell_text
    assert "LEFT_PANEL_COLLAPSE_THRESHOLD = 210" in app_shell_text
    assert "lastExpandedLayerRailWidth" in app_shell_text
    assert 'setOverviewLayoutPanel("left", "collapsed");' in app_shell_text
    assert "rawWidth <= LEFT_PANEL_COLLAPSE_THRESHOLD" in app_shell_text
    assert 'setOverviewLayoutPanel("left", "collapsed")' in app_shell_text
    assert 'document.body.classList.add("cfs-resizing")' in app_shell_text
    assert 'document.body.classList.remove("cfs-resizing")' in app_shell_text
    assert "width: leftPanelCollapsed" in app_shell_text
    assert "LEFT_PANEL_COLLAPSED_WIDTH" in app_shell_text
    assert "onToggleCollapsed={toggleLayerRailCollapsed}" in app_shell_text
    explore_countywide_workflow = command_text.split(
        'actionLabel: "Explore Countywide"',
        1,
    )[1].split("},", 1)[0]
    assert "icon: Layers3" in explore_countywide_workflow
    assert "BarChart3" not in command_text

    assert "getCollapsedRailLabel(overviewCommandMode)" in sidebar_text
    assert "CollapsedRailGlyph" in sidebar_text
    assert "h-full min-h-0 w-full min-w-0 flex-col overflow-visible" in sidebar_text
    assert "overflow-x-hidden overflow-y-auto" in sidebar_text
    assert "Collapse map controls" in sidebar_text
    assert "ArrowLeftRight" in sidebar_text
    assert "Drag to resize panel" in sidebar_text
    assert "Collapse map layers panel" not in sidebar_text
    assert "<LayerToggle />" in sidebar_text
    assert "ModelLabControlsPanel" in sidebar_text
    assert "SnapshotModeControlsPanel" in sidebar_text

    assert "min-w-0 overflow-hidden rounded-lg" in layer_toggle_text
    assert "flex min-w-0 cursor-pointer list-none flex-wrap" in layer_toggle_text
    assert "min-w-0 space-y-2 overflow-hidden" in layer_toggle_text
    assert "min-w-0 flex-wrap items-center gap-2" in layer_toggle_text
    assert "ml-auto flex shrink-0 items-center gap-1.5" in layer_toggle_text
    assert "overflow-x-hidden" not in layer_toggle_text
    assert "Collapse drawer" not in layer_toggle_text
    assert "onCollapseDrawer" not in layer_toggle_text

    assert ".cfs-layer-rail {" in theme_text
    assert "min-width: 0;" in theme_text


def test_phase25c_left_panel_and_snapshot_report_builder_cleanup() -> None:
    app_shell_text = (
        REPO_ROOT / "src" / "components" / "layout" / "AppShell.tsx"
    ).read_text(encoding="utf-8")
    command_text = (
        REPO_ROOT
        / "src"
        / "components"
        / "dashboard"
        / "OverviewCommandCenter.tsx"
    ).read_text(encoding="utf-8")
    sidebar_text = (
        REPO_ROOT / "src" / "components" / "layout" / "Sidebar.tsx"
    ).read_text(encoding="utf-8")
    snapshot_text = (
        REPO_ROOT
        / "src"
        / "components"
        / "dashboard"
        / "DueDiligenceReview.tsx"
    ).read_text(encoding="utf-8")
    state_text = (
        REPO_ROOT / "src" / "hooks" / "useDashboardState.tsx"
    ).read_text(encoding="utf-8")

    assert 'setOverviewLayoutPanel("left", "collapsed");' in app_shell_text
    assert "rawWidth <= LEFT_PANEL_COLLAPSE_THRESHOLD" in app_shell_text
    assert "overflow-visible transition-[width]" in app_shell_text
    assert "cfs-layer-rail-arrow" in sidebar_text
    assert "overflow-visible" in sidebar_text
    assert "overflow-x-hidden overflow-y-auto" in sidebar_text

    for block_name in [
        "function showIntelligenceBrief()",
        "function showModelLab()",
    ]:
        block = command_text.split(block_name, 1)[1].split("\n  function ", 1)[0]
        assert 'setOverviewLayoutPanel("left", "collapsed")' in block

    indicator_block = command_text.split(
        "function showIndicatorCenter()",
        1,
    )[1].split("\n  function ", 1)[0]
    assert 'setOverviewLayoutPanel("left", "hidden")' in indicator_block

    assert "function openSnapshotBuilder()" not in command_text
    assert 'setOverviewCommandMode("snapshot")' not in command_text
    assert "CFS_EXPAND_OVERVIEW_RAIL_EVENT" not in command_text

    assert "PlanningSnapshotReportBuilder" in snapshot_text
    assert "Snapshot Library" in snapshot_text
    assert "Report Drafts" in snapshot_text
    assert "cfs.planningSnapshot.reportDrafts.v1" in snapshot_text
    assert "Report title, notes, and sections" in snapshot_text
    assert "Explain the Numbers Appendix" in snapshot_text
    assert "showExplanationCards, setShowExplanationCards] = useState(false)" in snapshot_text
    assert "New Draft from Snapshot" in snapshot_text
    assert "Load Draft" in snapshot_text
    assert "Save Current Draft" in snapshot_text
    assert "Print Report" in snapshot_text
    assert "Key Statistics" in snapshot_text
    assert "Report title" in snapshot_text
    assert "NorthArrow" in snapshot_text
    assert "Scale is approximate for this browser map snapshot." in snapshot_text
    assert "renamePlanningSnapshot" in state_text

    user_facing_text = "\n".join(
        [command_text, sidebar_text, snapshot_text],
    ).lower()
    forbidden_terms = [
        "prediction_probability",
        "experimental_probability",
        '"raw_model_score":',
        "parcel_score",
        "will develop",
    ]
    for term in forbidden_terms:
        assert term not in user_facing_text


def test_phase25c_qa1_clears_parcel_selection_when_leaving_parcel_mode() -> None:
    command_text = (
        REPO_ROOT
        / "src"
        / "components"
        / "dashboard"
        / "OverviewCommandCenter.tsx"
    ).read_text(encoding="utf-8")
    scene_text = (
        REPO_ROOT / "src" / "components" / "gis" / "SceneViewContainer.tsx"
    ).read_text(encoding="utf-8")
    state_text = (
        REPO_ROOT / "src" / "hooks" / "useDashboardState.tsx"
    ).read_text(encoding="utf-8")
    top_nav_text = (
        REPO_ROOT / "src" / "components" / "layout" / "TopNav.tsx"
    ).read_text(encoding="utf-8")
    intelligence_panel_text = (
        REPO_ROOT
        / "src"
        / "components"
        / "dashboard"
        / "IntelligencePanel.tsx"
    ).read_text(encoding="utf-8")

    assert "overviewCommandModeRef.current = mode" in state_text
    assert "parcelSelectionAllowed" not in state_text
    assert "clearParcelSelectionContext();" not in state_text
    assert "setSelectedParcelIntelligenceState(parcel, source)" in state_text
    assert "selectParcelState(parcelId, options)" in state_text

    countywide_block = command_text.split("function showIntelligenceBrief()", 1)[
        1
    ].split("function showIndicatorCenter()", 1)[0]
    indicator_center_block = command_text.split("function showIndicatorCenter()", 1)[
        1
    ].split("function showModelLab()", 1)[0]
    model_lab_block = command_text.split("function showModelLab()", 1)[
        1
    ].split("function saveSnapshotForReport()", 1)[0]
    assert 'setOverviewCommandMode("countywide")' in countywide_block
    assert 'setOverviewCommandMode("indicatorCenter")' in indicator_center_block
    assert 'setOverviewCommandMode("modelLab")' in model_lab_block
    assert 'setOverviewCommandMode("snapshot")' not in command_text

    assert "allowsParcelSelectionGraphics" in scene_text
    assert "getSelectedParcelGraphicsId" in scene_text
    assert "clearParcelSceneFocus" in scene_text
    assert "focusLayerRef.current?.removeAll()" in scene_text
    assert "setLastParcelFocusSummary(null)" in scene_text
    assert 'mode === "indicatorCenter"' in scene_text
    assert "SceneView parcel focus drawing skipped after mode change" in scene_text
    assert "SceneView parcel focus result ignored after mode change" in scene_text
    assert "updateSelectedParcelSymbols(" in scene_text
    assert "getSelectedParcelGraphicsId(overviewCommandMode, selectedParcelId)" in scene_text
    assert "CFS_PARCEL_MAP_FOCUS_REQUEST_EVENT" in scene_text

    assert 'setProductMode("workspace")' in top_nav_text
    assert 'setOverviewCommandMode("parcel")' not in top_nav_text
    assert 'setOverviewCommandMode("countywide")' in top_nav_text
    assert "hydrateSelectedParcel(record" in top_nav_text

    assert "IndicatorCenterPanel" in intelligence_panel_text
    assert "setCountywideBriefOverride(null)" in intelligence_panel_text
    assert "countywideBriefVisible" in intelligence_panel_text

    user_facing_text = "\n".join(
        [command_text, scene_text, state_text, intelligence_panel_text],
    ).lower()
    for term in [
        "prediction_probability",
        "experimental_probability",
        '"raw_model_score":',
        "parcel_score",
        "will develop",
    ]:
        assert term not in user_facing_text


def test_phase26a_countywide_hotspot_intelligence_framework() -> None:
    scene_text = (
        REPO_ROOT / "src" / "components" / "gis" / "SceneViewContainer.tsx"
    ).read_text(encoding="utf-8")
    intelligence_text = (
        REPO_ROOT
        / "src"
        / "components"
        / "dashboard"
        / "IntelligencePanel.tsx"
    ).read_text(encoding="utf-8")
    snapshot_text = (
        REPO_ROOT
        / "src"
        / "components"
        / "dashboard"
        / "DueDiligenceReview.tsx"
    ).read_text(encoding="utf-8")
    types_text = (REPO_ROOT / "src" / "types" / "index.ts").read_text(
        encoding="utf-8",
    )
    hotspot_types_text = (
        REPO_ROOT / "src" / "types" / "map" / "developmentHotspots.ts"
    ).read_text(encoding="utf-8")

    assert "DEVELOPMENT_HOTSPOT_COUNTYWIDE_CLUSTER_SCALE" in scene_text
    assert "DEVELOPMENT_HOTSPOT_INTERMEDIATE_CLUSTER_SCALE" in scene_text
    assert "DEVELOPMENT_HOTSPOT_FINE_CLUSTER_SCALE" in scene_text
    assert "buildDevelopmentHotspotDisplayGraphics" in scene_text
    assert "createDevelopmentHotspotAggregateGraphic" in scene_text
    assert "createDevelopmentHotspotAggregateLabelGraphic" in scene_text
    assert "createDevelopmentHotspotSelectionContext" in scene_text
    assert "recordsRepresented" in scene_text
    assert "parcelsRepresented" in scene_text
    assert '"Observed permit/development activity only. Not a prediction."' in scene_text
    assert "Development hotspot information" not in scene_text
    assert "hotspotInfoPosition" not in scene_text

    assert "SelectedDevelopmentHotspotContext" in hotspot_types_text
    assert "DevelopmentHotspotMapDisplayMode" in hotspot_types_text
    assert "developmentActivityContext" in types_text
    assert '"phase26a_v1"' in types_text

    assert "SelectedDevelopmentHotspotCard" in intelligence_text
    assert "Selected Development Activity Cluster" in intelligence_text
    assert "Development Activity Context" in intelligence_text
    assert "Observed permit/development activity only. Not a prediction." in intelligence_text

    assert "ReportDevelopmentActivityContextSection" in snapshot_text
    assert "Development Hotspots context is included" in snapshot_text
    assert "Review underlying permit records before formal planning decisions." in snapshot_text

    user_facing_text = "\n".join(
        [scene_text, intelligence_text, snapshot_text, types_text],
    ).lower()
    for term in [
        "prediction_probability",
        "experimental_probability",
        '"raw_model_score":',
        "parcel_score",
        "growth_probability",
        "will develop",
    ]:
        assert term not in user_facing_text


def test_phase27a_navigation_refactor_overview_workspace_system() -> None:
    app_shell_text = (
        REPO_ROOT / "src" / "components" / "layout" / "AppShell.tsx"
    ).read_text(encoding="utf-8")
    top_nav_text = (
        REPO_ROOT / "src" / "components" / "layout" / "TopNav.tsx"
    ).read_text(encoding="utf-8")
    command_text = (
        REPO_ROOT
        / "src"
        / "components"
        / "dashboard"
        / "OverviewCommandCenter.tsx"
    ).read_text(encoding="utf-8")
    intelligence_text = (
        REPO_ROOT
        / "src"
        / "components"
        / "dashboard"
        / "IntelligencePanel.tsx"
    ).read_text(encoding="utf-8")
    types_text = (REPO_ROOT / "src" / "types" / "index.ts").read_text(
        encoding="utf-8",
    )
    snapshot_text = (
        REPO_ROOT
        / "src"
        / "components"
        / "dashboard"
        / "DueDiligenceReview.tsx"
    ).read_text(encoding="utf-8")

    assert 'id: "overview"' in top_nav_text
    assert 'id: "workspace"' in top_nav_text
    assert 'label: "Planning Snapshot"' in top_nav_text
    assert 'label: "Methodology"' in top_nav_text
    assert "Live map workspace for countywide exploration and Model Lab" in top_nav_text
    assert 'setProductMode("workspace")' in top_nav_text
    assert 'setOverviewCommandMode("parcel")' not in top_nav_text
    assert 'setOverviewCommandMode("countywide")' in top_nav_text

    assert 'type ProductMode =' in types_text
    assert '| "workspace";' in types_text
    assert '| "indicatorCenter"' in types_text

    assert "function OverviewLandingPage" in app_shell_text
    assert "Cabarrus FutureScape" in app_shell_text
    assert "Parcel-centered planning intelligence for growth, constraints" in app_shell_text
    assert "Live Capability Strip" in app_shell_text
    assert "CFS Operating Model" in app_shell_text
    assert "What CFS Can Do Today" in app_shell_text
    assert "What Still Needs Official Data" in app_shell_text
    assert "Safety / Trust Strip" in app_shell_text
    assert "Data Sources" in app_shell_text
    assert "Monitoring Indicators" in app_shell_text
    assert "No exact parcel probabilities are shown." in app_shell_text
    assert "Go to Workspace" in app_shell_text
    assert 'setOverviewCommandMode("countywide")' in app_shell_text
    assert 'setProductMode("workspace")' in app_shell_text
    assert "overviewLandingMode ? (" in app_shell_text
    assert "customOverviewActive" not in app_shell_text
    assert "OverviewWorkspaceBuilder" not in app_shell_text

    assert "CFS Workspace Center" in command_text
    assert 'actionLabel: "Explore Countywide"' in command_text
    assert 'actionLabel: "Indicator Center"' in command_text
    assert 'actionLabel: "Model Lab"' in command_text
    assert 'actionLabel: "Search Parcel"' not in command_text
    assert 'actionLabel: "Snapshot Builder"' not in command_text
    assert "Use the global search bar for parcel search" in command_text
    assert "Planning Snapshot remains" in command_text
    assert "the top-level report builder" in command_text
    assert "Customize Layout" not in command_text

    assert "IndicatorCenterPanel" in intelligence_text
    assert "what needs review, why it matters" in intelligence_text
    assert "No fake values" in intelligence_text
    assert "official risk scores, predictions, or made-up measures" in intelligence_text
    assert "workspace:" in intelligence_text

    assert "Go to Workspace" in snapshot_text
    assert 'setProductMode("workspace")' in snapshot_text

    user_facing_text = "\n".join(
        [app_shell_text, top_nav_text, command_text, intelligence_text, snapshot_text],
    ).lower()
    for term in [
        "prediction_probability",
        "experimental_probability",
        '"raw_model_score":',
        "parcel_score",
        "growth_probability",
        "will develop",
    ]:
        assert term not in user_facing_text


def test_phase27b_workspace_indicator_center_mode() -> None:
    command_text = (
        REPO_ROOT
        / "src"
        / "components"
        / "dashboard"
        / "OverviewCommandCenter.tsx"
    ).read_text(encoding="utf-8")
    intelligence_text = (
        REPO_ROOT
        / "src"
        / "components"
        / "dashboard"
        / "IntelligencePanel.tsx"
    ).read_text(encoding="utf-8")
    sidebar_text = (
        REPO_ROOT / "src" / "components" / "layout" / "Sidebar.tsx"
    ).read_text(encoding="utf-8")
    top_nav_text = (
        REPO_ROOT / "src" / "components" / "layout" / "TopNav.tsx"
    ).read_text(encoding="utf-8")
    state_text = (
        REPO_ROOT / "src" / "hooks" / "useDashboardState.tsx"
    ).read_text(encoding="utf-8")
    types_text = (REPO_ROOT / "src" / "types" / "index.ts").read_text(
        encoding="utf-8",
    )
    snapshot_text = (
        REPO_ROOT
        / "src"
        / "components"
        / "dashboard"
        / "DueDiligenceReview.tsx"
    ).read_text(encoding="utf-8")
    app_shell_text = (
        REPO_ROOT / "src" / "components" / "layout" / "AppShell.tsx"
    ).read_text(encoding="utf-8")
    indicator_data_text = (
        REPO_ROOT / "src" / "data" / "intelligence" / "indicatorCenter.ts"
    ).read_text(encoding="utf-8")
    indicator_config_text = (
        REPO_ROOT / "config" / "indicator_center_v1.json"
    ).read_text(encoding="utf-8")
    indicator_workspace_text = (
        REPO_ROOT
        / "src"
        / "components"
        / "dashboard"
        / "IndicatorCenterWorkspace.tsx"
    ).read_text(encoding="utf-8")
    app_shell_text = (
        REPO_ROOT / "src" / "components" / "layout" / "AppShell.tsx"
    ).read_text(encoding="utf-8")

    assert 'actionLabel: "Explore Countywide"' in command_text
    assert 'actionLabel: "Indicator Center"' in command_text
    assert 'actionLabel: "Model Lab"' in command_text
    assert 'actionLabel: "Search Parcel"' not in command_text
    assert 'actionLabel: "Snapshot Builder"' not in command_text
    assert "Review attention flags and countywide signals that show where staff may need follow-up." in command_text
    assert "Use the global search bar for parcel search" in command_text

    assert 'setOverviewCommandMode("parcel")' not in top_nav_text
    assert 'setOverviewCommandMode("countywide")' in top_nav_text
    assert 'setProductMode("workspace")' in top_nav_text
    assert "hydrateSelectedParcel(record" in top_nav_text

    assert "selectedIndicatorCenterContext" in state_text
    assert "setSelectedIndicatorCenterContext" in state_text
    assert "indicatorCenterDisplayMode" in state_text
    assert "selectedIndicatorCenterGroupIds" in state_text
    assert "IndicatorCenterContext" in types_text
    assert "PlanningSnapshotIndicatorCenterContext" in types_text
    assert '"phase28a_v1"' in types_text
    assert '"phase28b_v1"' in types_text
    assert '"phase28c_v1"' in types_text
    assert '"phase28d_v1"' in types_text
    assert '"phase28g_v1"' in types_text
    assert '"phase28h_v1"' in types_text
    assert '"phase28i_v1"' in types_text

    assert "IndicatorControlsPanel" not in sidebar_text
    assert "Indicator Controls" not in sidebar_text
    assert "indicatorCenterDefinitions.map" not in sidebar_text
    assert "setSelectedIndicatorCenterContext(indicator)" not in sidebar_text
    assert "indicatorCenterDisplayOptions.map" not in sidebar_text
    assert "setSelectedIndicatorCenterGroupIds" not in sidebar_text
    assert "setIndicatorCenterDisplayMode" not in sidebar_text
    assert "Show high-priority only" not in sidebar_text

    expected_indicator_copy = [
        "Development Activity Flags",
        "Flood Review Flags",
        "School Context Flags",
        "Utility / Infrastructure Flags",
        "Model Research Flags",
        "Data Gaps / Official Data Needed",
        "High Attention",
        "Review Needed",
        "Data Needed",
        "Proxy Only",
        "Internal Research Only",
        "planned local road projects",
        "planned utility extensions",
    ]
    for expected in expected_indicator_copy:
        assert expected in indicator_config_text

    expected_indicator_ui_copy = [
        "Indicator Intelligence",
        "what needs review, why it matters",
        "No fake values",
        "No official risk scores, predictions, or made-up measures are generated.",
        "Indicator summary cards",
        "Review themes",
    ]
    for expected in expected_indicator_ui_copy:
        assert expected in intelligence_text

    assert "IndicatorCenterWorkspace" in app_shell_text
    assert "CFS Mission Control" in indicator_workspace_text
    assert "County growth, constraint, and readiness monitoring." in indicator_workspace_text
    assert "Primary KPI Strip" in indicator_workspace_text
    assert "Current Readiness Posture" in indicator_workspace_text
    assert "Trend Intelligence" in indicator_workspace_text
    assert "Operational Watchlist Board" in indicator_workspace_text
    assert "Domain Readiness Matrix" in indicator_workspace_text
    assert "IndicatorReadinessTabs" in indicator_workspace_text
    assert "Infrastructure & Utility Readiness" in indicator_workspace_text
    assert "Data Still Needed" in indicator_workspace_text
    assert "buildIndicatorCenterSummaryCards" in indicator_workspace_text
    assert "toIndicatorCenterSnapshotSummaries" in indicator_workspace_text
    assert "No official capacity claims" in indicator_workspace_text
    assert "Time window" not in indicator_workspace_text
    assert "Category" not in indicator_workspace_text
    assert "ControlSelect" not in indicator_workspace_text

    assert "serializeIndicatorCenterSnapshotContext" in intelligence_text
    assert "createIndicatorCenterSnapshotMetric" in intelligence_text
    assert "Indicator Center Context" in intelligence_text
    assert "phase28i_v1" in intelligence_text
    assert "Indicator Center snapshot - monitoring dashboard context, no map image required." in intelligence_text
    assert "selectedGroupIds" in intelligence_text
    assert "indicatorSummaries" in intelligence_text

    assert "Indicator Center Context" in snapshot_text
    assert "Indicator Center Flags" in snapshot_text
    assert "Indicator Center Snapshot" in snapshot_text
    assert "Indicator Center flags are monitoring indicators" in snapshot_text
    assert "not official determinations" in snapshot_text

    user_facing_text = "\n".join(
        [
            command_text,
            indicator_data_text,
            indicator_config_text,
            indicator_workspace_text,
            intelligence_text,
            sidebar_text,
            top_nav_text,
            snapshot_text,
        ],
    ).lower()
    for term in [
        "prediction_probability",
        "experimental_probability",
        '"raw_model_score":',
        "parcel_score",
        "growth_probability",
        "will develop",
    ]:
        assert term not in user_facing_text


def test_phase28a_indicator_center_foundation_dashboard() -> None:
    indicator_data_text = (
        REPO_ROOT / "src" / "data" / "intelligence" / "indicatorCenter.ts"
    ).read_text(encoding="utf-8")
    indicator_config_text = (
        REPO_ROOT / "config" / "indicator_center_v1.json"
    ).read_text(encoding="utf-8")
    indicator_workspace_text = (
        REPO_ROOT
        / "src"
        / "components"
        / "dashboard"
        / "IndicatorCenterWorkspace.tsx"
    ).read_text(encoding="utf-8")
    app_shell_text = (
        REPO_ROOT / "src" / "components" / "layout" / "AppShell.tsx"
    ).read_text(encoding="utf-8")
    intelligence_text = (
        REPO_ROOT
        / "src"
        / "components"
        / "dashboard"
        / "IntelligencePanel.tsx"
    ).read_text(encoding="utf-8")
    sidebar_text = (
        REPO_ROOT / "src" / "components" / "layout" / "Sidebar.tsx"
    ).read_text(encoding="utf-8")
    app_shell_text = (
        REPO_ROOT / "src" / "components" / "layout" / "AppShell.tsx"
    ).read_text(encoding="utf-8")
    state_text = (
        REPO_ROOT / "src" / "hooks" / "useDashboardState.tsx"
    ).read_text(encoding="utf-8")
    types_text = (REPO_ROOT / "src" / "types" / "index.ts").read_text(
        encoding="utf-8",
    )
    snapshot_text = (
        REPO_ROOT
        / "src"
        / "components"
        / "dashboard"
        / "DueDiligenceReview.tsx"
    ).read_text(encoding="utf-8")

    for group in [
        "development-activity",
        "flood-review",
        "school-context",
        "utility-infrastructure",
        "model-research",
        "data-gaps",
    ]:
        assert group in indicator_config_text

    for label in [
        "High Attention",
        "Review Needed",
        "Data Needed",
        "Internal Research Only",
        "All indicators",
        "High attention only",
        "Data-needed only",
        "Selected group only",
    ]:
        assert label in "\n".join([indicator_data_text, indicator_config_text])

    assert "IndicatorCenterWorkspace" in app_shell_text
    assert "CFS Mission Control" in indicator_workspace_text
    assert "County growth, constraint, and readiness monitoring." in indicator_workspace_text
    assert "No map required" in indicator_workspace_text
    assert "buildIndicatorCenterSummaryCards" in indicator_workspace_text
    assert "permit records" in indicator_config_text
    assert "FEMA floodplain parcel overlay" in indicator_config_text
    assert "school attendance-zone assignment" in indicator_config_text
    assert "utility proxy context" in indicator_config_text
    assert "relative development research signal" in indicator_config_text
    assert "WSACC true utility capacity" in indicator_config_text

    assert "Indicator Controls" not in sidebar_text
    assert "setSelectedIndicatorCenterGroupIds" not in sidebar_text
    assert "setIndicatorCenterDisplayMode" not in sidebar_text
    assert "indicatorCenterDisplayOptions.map" not in sidebar_text

    assert "Indicator Intelligence" in intelligence_text
    assert "Selected indicator" in intelligence_text
    assert "Data used" in intelligence_text
    assert "Snapshot" in intelligence_text
    assert "Highest-priority attention categories" in intelligence_text
    assert "Data-needed categories" in intelligence_text
    assert "Indicator summary cards" in intelligence_text
    assert "No official risk scores, predictions, or made-up measures are generated." in intelligence_text

    assert "IndicatorCenterDisplayMode" in types_text
    assert "PlanningSnapshotIndicatorSummary" in types_text
    assert '"phase28a_v1"' in types_text
    assert '"phase28b_v1"' in types_text
    assert '"phase28c_v1"' in types_text
    assert '"phase28d_v1"' in types_text
    assert '"phase28g_v1"' in types_text
    assert "defaultIndicatorCenterGroupIds" in state_text
    assert "selectedIndicatorCenterGroupIds" in state_text
    assert "indicatorCenterDisplayMode" in state_text

    assert "Captured summaries" in snapshot_text
    assert "Display filter" not in snapshot_text
    assert "Dashboard posture" in snapshot_text
    assert "getIndicatorCenterDisplayModeLabel" in snapshot_text
    assert "Indicator Center flags are monitoring indicators" in snapshot_text

    user_facing_text = "\n".join(
        [
            indicator_data_text,
            indicator_config_text,
            indicator_workspace_text,
            intelligence_text,
            sidebar_text,
            snapshot_text,
        ],
    ).lower()
    for term in [
        "prediction_probability",
        "experimental_probability",
        '"raw_model_score":',
        "parcel_score",
        "growth_probability",
        "will develop",
    ]:
        assert term not in user_facing_text


def test_phase28i_indicator_center_drawer_labels_charts_cleanup() -> None:
    app_shell_text = (
        REPO_ROOT / "src" / "components" / "layout" / "AppShell.tsx"
    ).read_text(encoding="utf-8")
    backend_main_text = (REPO_ROOT / "backend" / "app" / "main.py").read_text(
        encoding="utf-8",
    )
    indicator_router_text = (
        REPO_ROOT / "backend" / "app" / "routers" / "indicators_router.py"
    ).read_text(encoding="utf-8")
    indicator_config_text = (
        REPO_ROOT / "config" / "indicator_center_v1.json"
    ).read_text(encoding="utf-8")
    indicator_data_text = (
        REPO_ROOT / "src" / "data" / "intelligence" / "indicatorCenter.ts"
    ).read_text(encoding="utf-8")
    indicator_workspace_text = (
        REPO_ROOT
        / "src"
        / "components"
        / "dashboard"
        / "IndicatorCenterWorkspace.tsx"
    ).read_text(encoding="utf-8")
    intelligence_text = (
        REPO_ROOT
        / "src"
        / "components"
        / "dashboard"
        / "IntelligencePanel.tsx"
    ).read_text(encoding="utf-8")
    sidebar_text = (
        REPO_ROOT / "src" / "components" / "layout" / "Sidebar.tsx"
    ).read_text(encoding="utf-8")
    state_text = (
        REPO_ROOT / "src" / "hooks" / "useDashboardState.tsx"
    ).read_text(encoding="utf-8")
    types_text = (REPO_ROOT / "src" / "types" / "index.ts").read_text(
        encoding="utf-8",
    )
    readme_text = (REPO_ROOT / "README.md").read_text(encoding="utf-8")
    walkthrough_text = (
        REPO_ROOT / "docs" / "demo" / "cfs_demo_walkthrough.md"
    ).read_text(encoding="utf-8")
    data_request_text = (
        REPO_ROOT / "docs" / "data_requests" / "cfs_next_data_request_packet.md"
    ).read_text(encoding="utf-8")
    school_adapter_text = (
        REPO_ROOT
        / "src"
        / "lib"
        / "adapters"
        / "schoolConstraintSummaryAdapter.ts"
    ).read_text(encoding="utf-8")

    for required in [
        '"version": "phase28i_v1"',
        '"title": "School Capacity Watch"',
        '"display_rank": 2',
        '"metric_key": "school_preliminary_capacity_flags"',
        '"front_page_metric": "preliminary capacity flags"',
        '"detail_endpoint": "/constraints/schools/utilization-seed"',
        '"status": "Preliminary Data"',
        '"caveat_short": "Preliminary data."',
        '"recommended_action_short": "Request official capacity/enrollment."',
        '"source_tables_or_endpoints"',
        '"updates_over_time": false',
        '"recommended_action": "Request official school capacity and enrollment before making capacity statements."',
        '"snapshot_include_default": true',
        '"map_supported": false',
        '"chart_supported": true',
        '"official_data_needed": true',
        "planned local road projects",
        "No exact parcel probabilities. Not public-facing. Not production-ready.",
    ]:
        assert required in indicator_config_text

    for required in [
        "buildIndicatorCenterHeadlineMetrics",
        "buildIndicatorCenterReviewThemes",
        "metricKey",
        "High Attention",
        "Review Needed",
        "Data Needed",
        "Proxy Only",
        "Internal Research Only",
    ]:
        assert required in "\n".join([indicator_data_text, indicator_config_text])

    for required in [
        "CFS Mission Control",
        "Primary KPI Strip",
        "Current Readiness Posture",
        "Trend Intelligence",
        "Compact Monitoring Visuals",
        "Operational Watchlist Board",
        "Domain Readiness Matrix",
        "IndicatorReadinessTabs",
        "DomainReadinessMatrix",
        "MissionHeader",
        "Data Still Needed",
        "County growth, constraint, and readiness monitoring.",
        "Portfolio Demo",
        "Cached demo extract",
        "Local Live Data",
        "Transportation Project Context",
        "DataStillNeededStrip",
        "PermitIntelligencePanel",
        "PermitMetric",
        "ConstraintReviewPanel",
        "Observed Development Activity",
        "Yearly Permit Trend",
        "Permit Type Breakdown",
        "Permit Segment Breakdown",
        "Top Jurisdictions / Geographies",
        "Constraints, Infrastructure, and Governance",
        "focusIndicator",
        "Permit Activity by Year",
        "Permit Activity by Type",
        "School Capacity Watch",
        "Floodplain Review",
        "Development Activity",
        "Infrastructure & Utility Readiness",
        "savePlanningSnapshot(snapshot)",
        'snapshotVersion: "phase28k_v1"',
        'visualType: "dashboard"',
        "dashboardImageDataUrl",
        "data-cfs-snapshot-region=\"indicator-dashboard\"",
        'overviewCommandMode: "indicatorCenter"',
        "How indicators work",
        "monitoringChartCards",
        "formatChartLabel",
        "shortCaveat",
        "shortAction",
        "Inspect",
    ]:
        assert required in indicator_workspace_text

    for removed_filter_or_customization in [
        "Time window",
        "Category",
        "ControlSelect",
        "Customize Dashboard",
        "Customize Layout",
        "Reset Layout",
        "Save Layout",
        "WorkspaceTile",
    ]:
        assert removed_filter_or_customization not in indicator_workspace_text

    for removed in [
        "CFS Indicator Control Tower",
        "School Utilization Watch",
        "Key Indicator Modules",
        "Recommended Staff Actions",
        "Critical Signal Strip",
        "Live Monitoring Grid",
        "Core Charts",
        "Data Readiness Board",
        "DataReadinessBoard",
        "MissionMonitorCard",
        "MicroChart",
        "buildMissionMonitorCards",
        "Expand drawer",
        "Restore drawer",
        "Indicator Detail Drawer",
        "Drag to move drawer",
        "Resize details drawer from left edge",
        "Resize details drawer from right edge",
        "Resize details drawer from bottom edge",
        "Resize details drawer from bottom left corner",
        "Resize details drawer from bottom right corner",
        "resizeDrawerGeometry",
        "Reset drawer position",
        "Close details",
        "IndicatorDeepDive",
        "DrawerResizeHandleElement",
        "SchoolSeedTable",
        "CompactField",
        "Include in Snapshot",
        "Maximize2",
        "Minimize2",
        "School Capacity Seed",
        "School Utilization Seed",
        "Seed Only",
        "over seed",
        "very-high seed",
        "attention seed zones",
        "Flood Review Exposure",
        "FEMA Review",
        "overflow-x-auto",
        "min-w-[60rem]",
    ]:
        assert removed not in indicator_workspace_text

    for required in [
        "SchoolUtilizationSeedDetailViewModel",
        "utilizationSeedRows",
        "utilizationPctLabel",
        "Utilization percent not available from current source",
        "Not available from current source",
    ]:
        assert required in school_adapter_text

    for required in [
        'APIRouter(prefix="/indicators"',
        '@router.get("/summary")',
        '@router.get("/school-utilization-detail")',
        "signal_tiles",
        "monitoring_cards",
        "priority_issues",
        "chart_data",
        "School Capacity Watch",
        "Floodplain Review",
        "Preliminary Data",
        "school_capacity_category_breakdown",
        "total_preliminary_records",
        "over_capacity_schools",
        "very_high_schools",
        "approaching_capacity_schools",
        "under_capacity_schools",
        "fields_available",
        "fields_missing",
        "No official school capacity determination is made by this endpoint.",
        "Based on FEMA floodplain data.",
        '"exact_probabilities_exposed": False',
        '"raw_model_scores_exposed": False',
    ]:
        assert required in indicator_router_text

    assert "indicators_router" in backend_main_text
    assert "app.include_router(indicators_router.router)" in backend_main_text

    for required in [
        "what needs review, why it matters",
        "Data-needed categories",
        "Planning Snapshot",
        "This indicator can be included with the saved dashboard context",
        "phase28i_v1",
        "Indicator Center snapshot - monitoring dashboard context, no map image required.",
    ]:
        assert required in intelligence_text

    assert "!rightPanelHidden && !indicatorCenterDashboardMode" in app_shell_text
    assert "!leftPanelHidden && !indicatorCenterDashboardMode" in app_shell_text
    assert "customOverviewActive" not in app_shell_text
    assert "OverviewWorkspaceBuilder" not in app_shell_text
    assert "Indicator dashboard filters stay controlled here" not in sidebar_text
    assert "phase28b_v1" in state_text
    assert '"phase28b_v1"' in types_text
    assert "phase28c_v1" in state_text
    assert '"phase28c_v1"' in types_text
    assert "phase28d_v1" in state_text
    assert '"phase28d_v1"' in types_text
    assert "phase28e_v1" in state_text
    assert '"phase28e_v1"' in types_text
    assert "phase28f_v1" in state_text
    assert '"phase28f_v1"' in types_text
    assert "phase28g_v1" in state_text
    assert '"phase28g_v1"' in types_text
    assert "phase28h_v1" in state_text
    assert '"phase28h_v1"' in types_text
    assert "phase28i_v1" in state_text
    assert '"phase28i_v1"' in types_text
    assert "phase28k_v1" in state_text
    assert '"phase28k_v1"' in types_text
    assert "map-free monitoring dashboard" in readme_text
    assert "draggable/resizable Inspect" in readme_text
    assert "map-free Mission Control" in walkthrough_text
    assert "priority missing inputs" in data_request_text

    user_facing_text = "\n".join(
        [
            indicator_config_text,
            indicator_data_text,
            indicator_workspace_text,
            intelligence_text,
            indicator_router_text,
            sidebar_text,
        ],
    ).lower()
    for term in [
        "prediction_probability",
        "experimental_probability",
        '"raw_model_score":',
        "will develop",
    ]:
        assert term not in user_facing_text


def test_phase28k_indicator_center_dashboard_snapshot_report_integration() -> None:
    indicator_workspace_text = (
        REPO_ROOT
        / "src"
        / "components"
        / "dashboard"
        / "IndicatorCenterWorkspace.tsx"
    ).read_text(encoding="utf-8")
    snapshot_text = (
        REPO_ROOT
        / "src"
        / "components"
        / "dashboard"
        / "DueDiligenceReview.tsx"
    ).read_text(encoding="utf-8")
    types_text = (REPO_ROOT / "src" / "types" / "index.ts").read_text(
        encoding="utf-8",
    )
    state_text = (
        REPO_ROOT / "src" / "hooks" / "useDashboardState.tsx"
    ).read_text(encoding="utf-8")

    for required in [
        "captureIndicatorDashboardSnapshot",
        "inlineSnapshotStyles",
        "data-cfs-snapshot-region=\"indicator-dashboard\"",
        "data-cfs-snapshot-section=\"critical_signals\"",
        "data-cfs-snapshot-section=\"monitoring_charts\"",
        "INDICATOR_DASHBOARD_CAPTURE_SECTIONS",
        "dashboardImageDataUrl",
        "dashboardImageAlt",
        "dashboardImageCapturedAt",
        "dashboardImageFailureReason",
        "dashboardImageStatus",
        "hasDashboardImage",
        "hasMapImage: false",
        'snapshotType: "indicator_center"',
        'visualType: "dashboard"',
        'snapshotVersion: "phase28k_v1"',
        "mapScreenshotDataUrl: null",
        "mapScreenshotStatus: \"unavailable\"",
    ]:
        assert required in indicator_workspace_text

    for required in [
        'visualType?: "dashboard" | "map"',
        'snapshotType?: "indicator_center" | "map"',
        "dashboardImageDataUrl?: string | null",
        "dashboardImageStatus?: \"captured\" | \"failed\" | \"unavailable\"",
        "hasDashboardImage?: boolean",
        "hasMapImage?: boolean",
        '"phase28k_v1"',
    ]:
        assert required in types_text

    assert 'snapshotVersion === "phase28k_v1"' in state_text

    for required in [
        "getSnapshotVisualType",
        "isIndicatorDashboardSnapshot",
        "hasCapturedDashboardImage",
        "Selected Dashboard Snapshot",
        "Dashboard snapshot unavailable",
        "Indicator Center Dashboard Snapshot",
        "Critical Signals and Monitoring Charts captured from Indicator Center",
        "getVisualSnapshotSectionLabel",
        "Dashboard Snapshot",
        "Dashboard captured",
        "Dashboard unavailable",
        "dashboardImageDataUrl",
        "dashboardImageAlt",
        "formatDashboardCapturedSection",
    ]:
        assert required in snapshot_text

    assert "NorthArrow" in snapshot_text
    assert "MapLegendPanel" in snapshot_text
    assert "Scale note" in snapshot_text
    assert "ReportMapSnapshotSection" in snapshot_text
    assert "planningSnapshot.mapScreenshotDataUrl" in snapshot_text
    assert "planningSnapshot.dashboardImageDataUrl" in snapshot_text

    dashboard_branch = snapshot_text[
        snapshot_text.index("Selected Dashboard Snapshot") :
        snapshot_text.index("const captured =\n    planningSnapshot.mapScreenshotStatus")
    ]
    assert "NorthArrow" not in dashboard_branch
    assert "MapLegendPanel" not in dashboard_branch
    assert "Scale note" not in dashboard_branch
    assert "Camera:" not in dashboard_branch
    assert "Map snapshot unavailable" not in dashboard_branch

    user_facing_text = "\n".join([indicator_workspace_text, snapshot_text]).lower()
    for term in [
        "prediction_probability",
        "exact_probability",
        "experimental_probability",
        '"raw_model_score":',
        "official prediction class",
        "will develop",
    ]:
        assert term not in user_facing_text


def test_phase29b_final_ui_polish_overview_and_navigation() -> None:
    app_shell_text = (
        REPO_ROOT / "src" / "components" / "layout" / "AppShell.tsx"
    ).read_text(encoding="utf-8")
    top_nav_text = (
        REPO_ROOT / "src" / "components" / "layout" / "TopNav.tsx"
    ).read_text(encoding="utf-8")
    theme_text = (REPO_ROOT / "src" / "styles" / "cfs-theme.css").read_text(
        encoding="utf-8",
    )
    command_text = (
        REPO_ROOT
        / "src"
        / "components"
        / "dashboard"
        / "OverviewCommandCenter.tsx"
    ).read_text(encoding="utf-8")

    overview_slice = app_shell_text[
        app_shell_text.index("function OverviewLandingPage") :
        app_shell_text.index("function StableOverviewWorkspace")
    ]

    for required in [
        "cfs-command-bar",
        "cfs-product-nav",
        "grid-cols-4",
        "aria-label={`${mode.label}: ${mode.title}`}",
        "mode.shortLabel",
        "mode.description",
        "2xl:flex",
        "Planning Snapshot",
        "Methodology",
        "Search parcel, PIN, owner, address, subdivision",
        "dashboardStatusLabels[mapStatus]",
        "API Live",
    ]:
        assert required in top_nav_text

    for required in [
        "Enterprise planning intelligence",
        "Parcel-centered planning intelligence for growth",
        "Go to Workspace",
        "Open Planning Snapshot",
        "View Methodology",
        "Live Capability Strip",
        "Parcel Intelligence",
        "Development Activity",
        "Floodplain Review",
        "School Capacity Watch",
        "Indicator Center",
        "Model Research",
        "Planning Snapshot",
        "CFS Operating Model",
        "Data Sources",
        "Parcel Intelligence",
        "Monitoring Indicators",
        "Model Research",
        "Planning Snapshot",
        "What CFS Can Do Today",
        "What Still Needs Official Data",
        "WSACC true utility capacity",
        "Official school enrollment/capacity",
        "Countywide development pipeline",
        "Safety / Trust Strip",
        "Monitoring indicators are not official determinations.",
        "Model Lab is internal research only.",
        "No exact parcel probabilities are shown.",
        "Utility proxy does not confirm capacity.",
        "Preliminary school capacity indicators need official verification.",
        'data-testid="cfs-overview-landing"',
    ]:
        assert required in overview_slice

    for forbidden in [
        "SceneViewContainer",
        "IndicatorCenterWorkspace",
        "IntelligencePanel",
        "Sidebar",
        "<canvas",
        "Three",
        "requestAnimationFrame",
    ]:
        assert forbidden not in overview_slice

    for required in [
        'setOverviewCommandMode("countywide")',
        'setProductMode("workspace")',
        'setProductMode("due_diligence")',
        'setProductMode("methodology")',
        'setOverviewLayoutPanel("left", "collapsed")',
        'setOverviewLayoutPanel("right", "visible")',
    ]:
        assert required in app_shell_text

    for required in [
        ".cfs-command-bar",
        ".cfs-product-nav",
        ".cfs-command-backdrop",
        ".cfs-command-surface",
        ".cfs-command-card",
        ".cfs-status-chip",
        ".cfs-op-queue",
        ".cfs-chart-panel",
        ".cfs-overview-grid-bg",
        ".cfs-overview-flow-link",
        ".cfs-overview-trust",
        "prefers-reduced-motion",
    ]:
        assert required in theme_text

    assert 'actionLabel: "Search Parcel"' not in command_text
    assert 'actionLabel: "Snapshot Builder"' not in command_text
    assert "Customize Layout" not in "\n".join([top_nav_text, app_shell_text])

    user_facing_text = "\n".join(
        [app_shell_text, top_nav_text, command_text],
    ).lower()
    for term in [
        "prediction_probability",
        "exact_probability",
        "experimental_probability",
        '"raw_model_score":',
        "official prediction class",
        "will develop",
    ]:
        assert term not in user_facing_text


def test_command_center_visual_polish_is_applied_across_core_surfaces() -> None:
    app_shell_text = (
        REPO_ROOT / "src" / "components" / "layout" / "AppShell.tsx"
    ).read_text(encoding="utf-8")
    top_nav_text = (
        REPO_ROOT / "src" / "components" / "layout" / "TopNav.tsx"
    ).read_text(encoding="utf-8")
    indicator_text = (
        REPO_ROOT
        / "src"
        / "components"
        / "dashboard"
        / "IndicatorCenterWorkspace.tsx"
    ).read_text(encoding="utf-8")
    layer_toggle_text = (
        REPO_ROOT / "src" / "components" / "dashboard" / "LayerToggle.tsx"
    ).read_text(encoding="utf-8")
    sidebar_text = (
        REPO_ROOT / "src" / "components" / "layout" / "Sidebar.tsx"
    ).read_text(encoding="utf-8")
    snapshot_text = (
        REPO_ROOT
        / "src"
        / "components"
        / "dashboard"
        / "DueDiligenceReview.tsx"
    ).read_text(encoding="utf-8")
    theme_text = (REPO_ROOT / "src" / "styles" / "cfs-theme.css").read_text(
        encoding="utf-8",
    )

    assert "cfs-command-backdrop metric-grid" in app_shell_text
    assert "cfs-command-surface cfs-overview-hero" in app_shell_text
    assert "cfs-command-bar" in top_nav_text
    assert "cfs-product-nav" in top_nav_text
    assert "cfs-command-surface rounded-lg p-4" in indicator_text
    assert "cfs-op-queue" in indicator_text
    assert "cfs-drawer-command" not in indicator_text
    assert "cfs-chart-panel rounded-md p-3" in indicator_text
    assert "cfs-command-card min-w-0 overflow-hidden rounded-md" in layer_toggle_text
    assert "cfs-chart-panel mt-2" in layer_toggle_text
    assert "cfs-command-card rounded-lg" in sidebar_text
    assert "cfs-command-surface app-chrome no-print" in snapshot_text
    assert "cfs-command-card app-chrome no-print" in snapshot_text

    for required in [
        "radial-gradient(circle at 16% 8%",
        "body::before",
        "@media (prefers-reduced-motion: reduce)",
    ]:
        assert required in theme_text


def test_phase29c_explore_countywide_layer_controls_usability_cleanup() -> None:
    layer_toggle_text = (
        REPO_ROOT
        / "src"
        / "components"
        / "dashboard"
        / "LayerToggle.tsx"
    ).read_text(encoding="utf-8")
    scene_view_text = (
        REPO_ROOT / "src" / "components" / "gis" / "SceneViewContainer.tsx"
    ).read_text(encoding="utf-8")
    layer_registry_text = (
        REPO_ROOT / "src" / "data" / "mock" / "layersMockData.ts"
    ).read_text(encoding="utf-8")

    for required in [
        "Development Activity",
        "Permit Segment",
        "Choose a permit segment to view hotspot concentration.",
        "Select a permit segment to display hotspot concentration.",
        "Generic",
        "all-permit markers stay hidden to keep the map readable.",
        "Advanced Filters",
        "renderDevelopmentHotspotControls()",
        'label="Permit Segment"',
        'open={isOpen}',
    ]:
        assert required in layer_toggle_text
    assert "Development Hotspots" in layer_registry_text

    development_render_slice = layer_toggle_text[
        layer_toggle_text.index("const isDevelopmentHotspotLayer") :
        layer_toggle_text.index("const hasLegend")
    ]
    assert "isDevelopmentHotspotLayer ||" not in development_render_slice
    assert "isFemaFloodZoneLayer || isSchoolUtilizationLayer" in development_render_slice

    hotspot_controls_slice = layer_toggle_text[
        layer_toggle_text.index("function renderDevelopmentHotspotControls") :
        layer_toggle_text.index("function renderLegendPanel")
    ]
    assert "HotspotAdvancedFilters" in hotspot_controls_slice
    assert "Settings2" not in hotspot_controls_slice

    for required in [
        "Available Map Layers",
        "Available now",
        "Coming Soon / Official Data Needed",
        "Official data needed",
        "Coming Soon",
        "Data still needed",
        "Available when official data is added.",
        "Utility Capacity",
        "Planned Utility Extensions",
        "Planned Road Projects",
        "Official Rezoning Records",
        "Countywide Development Pipeline",
        "Planning Context / Future Land Use",
        "Development Pipeline / Subdivision Approvals",
        "data-layer-disabled=\"true\"",
        "disabled",
        "!isLayerDisabledForControls(layer)",
    ]:
        assert required in layer_toggle_text

    for required in [
        "Floodplain Review",
        "Floodplain Source Areas",
        "Special Flood Hazard Area",
        "School Capacity Watch",
        "Preliminary Data",
        "Above capacity",
        "Very high utilization",
    ]:
        assert required in layer_toggle_text

    for forbidden in [
        "Seed only",
        "Under capacity seed",
        "Approaching capacity seed",
        "Over capacity seed",
        "Severely over capacity seed",
        "FEMA zones off",
        "Flood constraints off",
        "Detailed methodology, caveats, and data lineage live in Methodology.",
    ]:
        assert forbidden not in layer_toggle_text

    assert 'developmentHotspotControls.permitSegment === "all"' in scene_view_text
    assert "setSelectedDevelopmentHotspotContext(null)" in scene_view_text

    user_facing_text = "\n".join([layer_toggle_text, scene_view_text]).lower()
    for term in [
        "prediction_probability",
        "exact_probability",
        "experimental_probability",
        '"raw_model_score":',
        "official prediction class",
        "will develop",
    ]:
        assert term not in user_facing_text


def test_phase29c_qa1_development_hotspots_segment_selector_visible_by_default() -> None:
    layer_toggle_text = (
        REPO_ROOT
        / "src"
        / "components"
        / "dashboard"
        / "LayerToggle.tsx"
    ).read_text(encoding="utf-8")

    hotspot_controls_slice = layer_toggle_text[
        layer_toggle_text.index("function renderDevelopmentHotspotControls") :
        layer_toggle_text.index("function renderLegendPanel")
    ]
    hotspot_configure_slice = layer_toggle_text[
        layer_toggle_text.index("const hasConfigure") :
        layer_toggle_text.index("const hasLegend")
    ]
    status_badge_slice = layer_toggle_text[
        layer_toggle_text.index('{active ? "Active" : "Hidden"}') :
        layer_toggle_text.index("SCHOOL_UTILIZATION_LAYER_ID", layer_toggle_text.index('{active ? "Active" : "Hidden"}'))
    ]

    for required in [
        'label="Permit Segment"',
        "Choose a permit segment to view hotspot concentration.",
        "Select a permit segment to display hotspot concentration.",
        "Generic",
        "all-permit markers stay hidden to keep the map readable.",
        "HotspotAdvancedFilters",
    ]:
        assert required in hotspot_controls_slice
    assert "Development hotspot ${label.toLowerCase()} filter" in layer_toggle_text
    for option_label in ["Select segment...", "Residential Growth", "Commercial Activity"]:
        assert option_label in layer_toggle_text

    assert "Settings2" not in hotspot_controls_slice
    assert "Configure" not in hotspot_controls_slice
    assert "isFemaFloodZoneLayer || isSchoolUtilizationLayer" in hotspot_configure_slice
    assert "isDevelopmentHotspotLayer ||" not in hotspot_configure_slice

    assert '{active ? "Active" : "Hidden"}' in status_badge_slice
    assert "isDevelopmentHotspotLayer" in status_badge_slice
    assert "!selectedHotspotSegment" in status_badge_slice
    assert "Choose segment" in status_badge_slice
    assert 'tone="orange"' in status_badge_slice

    advanced_filters_slice = layer_toggle_text[
        layer_toggle_text.index("function HotspotAdvancedFilters") :
        layer_toggle_text.index("function HotspotSelect")
    ]
    assert "useState(false)" in advanced_filters_slice
    assert "open={isOpen}" in advanced_filters_slice
    assert "Advanced Filters" in advanced_filters_slice

    forbidden_terms = [
        "prediction_probability",
        "exact_probability",
        "experimental_probability",
        '"raw_model_score":',
        "official prediction class",
        "will develop",
    ]
    for term in forbidden_terms:
        assert term not in layer_toggle_text.lower()


def test_phase29c_qa2_layer_drawer_available_vs_coming_soon_sections() -> None:
    layer_toggle_text = (
        REPO_ROOT
        / "src"
        / "components"
        / "dashboard"
        / "LayerToggle.tsx"
    ).read_text(encoding="utf-8")

    assert "Available Map Layers" in layer_toggle_text
    assert "Coming Soon / Official Data Needed" in layer_toggle_text
    assert layer_toggle_text.index("Available Map Layers") < layer_toggle_text.index(
        "Coming Soon / Official Data Needed",
    )

    default_open_slice = layer_toggle_text[
        layer_toggle_text.index("const defaultOpenLayerGroups") :
        layer_toggle_text.index("interface ComingSoonOverlay")
    ]
    assert '"development-activity": true' in default_open_slice

    available_group_slice = layer_toggle_text[
        layer_toggle_text.index("const layerDisplayGroups") :
        layer_toggle_text.index("const defaultOpenLayerGroups")
    ]
    for available_group in [
        "Base / Parcel",
        "Development Activity",
        "Floodplain Review",
        "Schools",
        "Internal Research / Governance",
    ]:
        assert available_group in available_group_slice
    for moved_group in [
        "utility-infrastructure",
        "Planning Context",
        "Transportation",
    ]:
        assert moved_group not in available_group_slice

    coming_soon_config_slice = layer_toggle_text[
        layer_toggle_text.index("const comingSoonLayerTopics") :
        layer_toggle_text.index("interface LayerInfoContent")
    ]
    for required_topic in [
        "Utility Capacity",
        "Planned Utility Extensions",
        "Planned Road Projects",
        "Planning Context / Future Land Use",
        "Official Rezoning Records",
        "Development Pipeline / Subdivision Approvals",
    ]:
        assert required_topic in coming_soon_config_slice

    render_slice = layer_toggle_text[
        layer_toggle_text.index("Available Map Layers") :
        layer_toggle_text.index("Methodology contains source notes and caveats.")
    ]
    assert "comingSoonLayerTopics.map" in render_slice
    assert "LayerStatusBadge active tone=\"green\"" in render_slice
    assert "Official data needed before these overlays can be enabled." in render_slice

    coming_soon_row_slice = layer_toggle_text[
        layer_toggle_text.index("function ComingSoonLayerRow") :
        layer_toggle_text.index("function LayerMoreInfoPanel")
    ]
    assert "data-layer-disabled=\"true\"" in coming_soon_row_slice
    assert "Coming Soon" in coming_soon_row_slice
    assert "Data still needed" in coming_soon_row_slice
    assert "aria-label={`${title} unavailable`}" in coming_soon_row_slice
    assert "disabled" in coming_soon_row_slice
    assert "onClick={() => setLayerOn(layer, !active)}" not in coming_soon_row_slice

    active_count_slice = layer_toggle_text[
        layer_toggle_text.index("function getActiveLayerCount") :
        layer_toggle_text.index("function getGroupActiveCount")
    ]
    assert "!isLayerDisabledForControls(layer)" in active_count_slice
    assert "comingSoonLayerTopics" not in active_count_slice

    assert "Methodology contains source notes and caveats." in layer_toggle_text
    assert "Detailed methodology, caveats, and data lineage live in Methodology." not in layer_toggle_text

    for term in [
        "prediction_probability",
        "exact_probability",
        "experimental_probability",
        '"raw_model_score":',
        "official prediction class",
        "will develop",
    ]:
        assert term not in layer_toggle_text.lower()


def test_layer_controls_use_text_disclosures_instead_of_icon_only_actions() -> None:
    layer_toggle_text = (
        REPO_ROOT
        / "src"
        / "components"
        / "dashboard"
        / "LayerToggle.tsx"
    ).read_text(encoding="utf-8")

    assert "function LayerMetadataDisclosure" in layer_toggle_text
    for required in [
        "Source Notes",
        "Layer Filters",
        "Read the symbols and colors used on the map.",
        "Source notes and legends are",
        "shown inside each layer card.",
    ]:
        assert required in layer_toggle_text

    for forbidden in [
        "Settings2",
        "SwatchBook",
        "<Info",
        "inline-flex h-7 w-7",
        'title="More Info"',
        'title="Configure"',
        "aria-label={`Legend for",
        "aria-label={`Configure",
    ]:
        assert forbidden not in layer_toggle_text


def test_standardized_lift_calculation_is_tie_aware() -> None:
    metrics = zoning_model.baseline.development_model_metrics.precision_recall_lift_at_fraction(
        [1, 0, 1, 0, 1],
        zoning_model.np.asarray([0.9, 0.8, 0.8, 0.8, 0.1]),
        0.4,
    )

    assert metrics["k"] == 2
    assert metrics["tie_count_at_cutoff"] == 3
    assert metrics["tie_adjusted"] is True
    assert metrics["precision"] == 0.666667
    assert metrics["lift"] == 1.111111


def test_phase10f_qa_outputs_keep_model_inactive() -> None:
    assert PHASE10F_SUMMARY_FILE.exists()
    payload = json.loads(PHASE10F_SUMMARY_FILE.read_text(encoding="utf-8"))

    assert payload["qa_id"] == "phase10f_model_qa_v1"
    assert payload["model_active"] is False
    assert payload["prediction_probability_available"] is False
    assert payload["production_ready"] is False
    assert payload["standardized_baseline_metrics"]["row_count"] == 110017
    assert payload["standardized_zoning_enhanced_metrics"]["row_count"] == 110017
    assert payload["test_years"] == [2022]
    assert max(payload["mature_years"]) == 2022


def test_phase10f_calibration_output_structure() -> None:
    assert PHASE10F_CALIBRATION_FILE.exists()
    payload = json.loads(PHASE10F_CALIBRATION_FILE.read_text(encoding="utf-8"))

    assert payload["qa_id"] == "phase10f_model_qa_v1"
    assert payload["calibration_bins"]
    assert payload["calibration_bins"][0]["row_count"] > 0
    assert payload["model_active"] is False
    assert payload["prediction_probability_available"] is False
    assert payload["production_ready"] is False


def test_phase10f_top_ranked_review_is_internal_only() -> None:
    assert PHASE10F_TOP_REVIEW_FILE.exists()
    review_text = PHASE10F_TOP_REVIEW_FILE.read_text(encoding="utf-8")

    assert "experimental_probability" in review_text
    assert "production_ready" in review_text
    assert "internal_experiment_not_for_public_decision" in review_text


@db_required
def test_phase10g_ranking_class_assignment_counts_and_flags() -> None:
    with get_engine().connect() as connection:
        rows = connection.execute(
            text(
                """
                SELECT development_signal_class, COUNT(*) AS row_count
                FROM public.development_prediction_ranking_classes
                WHERE model_experiment_id = 'phase10e_zoning_enhanced_v1'
                GROUP BY development_signal_class
                """,
            ),
        ).mappings().all()
        flags = connection.execute(
            text(
                """
                SELECT
                  COUNT(*) AS row_count,
                  COUNT(DISTINCT official_parcel_id) AS parcel_count,
                  COUNT(*) FILTER (WHERE production_ready IS TRUE) AS production_ready_rows,
                  COUNT(*) FILTER (WHERE public_exposure_allowed IS TRUE)
                    AS public_exposure_rows
                FROM public.development_prediction_ranking_classes
                WHERE model_experiment_id = 'phase10e_zoning_enhanced_v1'
                """,
            ),
        ).mappings().one()

    counts = {row["development_signal_class"]: row["row_count"] for row in rows}
    assert counts["very_high_development_signal"] == 1101
    assert counts["very_high_development_signal"] + counts["high_development_signal"] == 5501
    assert (
        counts["very_high_development_signal"]
        + counts["high_development_signal"]
        + counts["moderate_development_signal"]
        == 16503
    )
    assert flags["row_count"] == flags["parcel_count"] == 110017
    assert flags["production_ready_rows"] == 0
    assert flags["public_exposure_rows"] == 0


@db_required
def test_phase10g_ranking_tables_do_not_store_public_probability_fields() -> None:
    with get_engine().connect() as connection:
        rows = connection.execute(
            text(
                """
                SELECT table_name, column_name
                FROM information_schema.columns
                WHERE table_schema = 'public'
                  AND table_name IN (
                    'development_prediction_ranking_classes',
                    'development_prediction_ranking_explanations'
                  )
                  AND column_name ILIKE '%probability%'
                """,
            ),
        ).mappings().all()

    assert rows == []


@db_required
def test_phase10g_explanations_generated_without_fake_missing_drivers() -> None:
    with get_engine().connect() as connection:
        row = connection.execute(
            text(
                """
                SELECT
                  COUNT(*) AS explanation_rows,
                  COUNT(*) FILTER (WHERE driver_summary = 'insufficient_feature_context')
                    AS insufficient_rows,
                  COUNT(*) FILTER (WHERE caveat <> 'internal_ranking_research_not_for_public_decision')
                    AS bad_caveat_rows
                FROM public.development_prediction_ranking_explanations
                WHERE model_experiment_id = 'phase10e_zoning_enhanced_v1'
                """,
            ),
        ).mappings().one()

    assert row["explanation_rows"] == 110017
    assert row["insufficient_rows"] == 0
    assert row["bad_caveat_rows"] == 0


def test_phase10g_aggregate_endpoint_is_internal_readiness_only() -> None:
    response = client.get("/development/prediction/ranking/summary")

    assert response.status_code == 200
    body = response.json()
    assert body["ranking_available"] is True
    assert body["experiment_id"] == "phase10e_zoning_enhanced_v1"
    assert body["ranking_row_count"] == 110017
    assert body["production_ready"] is False
    assert body["public_exposure_allowed"] is False
    assert body["prediction_probability_available"] is False
    assert body["exact_probabilities_exposed"] is False
    assert body["no_parcel_level_scores"] is True
    assert "experimental_probability" not in body
    assert body["calibration_status"] == "weak_probability_calibration"


def test_phase10g_summary_outputs_are_internal_only() -> None:
    assert PHASE10G_SUMMARY_FILE.exists()
    assert PHASE10G_VALIDATION_FILE.exists()
    summary = json.loads(PHASE10G_SUMMARY_FILE.read_text(encoding="utf-8"))
    validation = json.loads(PHASE10G_VALIDATION_FILE.read_text(encoding="utf-8"))

    assert summary["exact_probabilities_exposed"] is False
    assert summary["frontend_exposure"] is False
    assert summary["production_ready"] is False
    assert validation["public_exposure_allowed"] is False
    assert validation["production_ready"] is False
