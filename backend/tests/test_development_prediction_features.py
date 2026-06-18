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
    assert "Auto by zoom" in sidebar_text
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

    assert 'actionLabel: "Search Parcel"' in command_text
    assert 'actionLabel: "Explore Countywide"' in command_text
    assert 'actionLabel: "Model Lab"' in command_text
    assert 'actionLabel: "Snapshot Builder"' in command_text
    assert 'actionLabel: "Countywide Intelligence"' not in command_text
    assert 'setOverviewCommandMode("snapshot")' in command_text

    assert "<SnapshotCapturePanel" in right_panel_text
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
        "Find parcel context.",
        "Open layers and indicators.",
        "Review internal model research.",
        "Choose what to capture.",
    ]
    for card_copy in expected_card_copy:
        assert card_copy in command_text

    assert "min-h-[68px]" in command_text
    assert "sm:grid-cols-2 2xl:grid-cols-4" in command_text
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
    assert "Search, explore, model, or save a report-ready snapshot." in command_text
    assert "Find parcel context." in command_text
    assert "Open layers and indicators." in command_text
    assert "Review internal model research." in command_text
    assert "Choose what to capture." in command_text
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

    assert 'actionLabel: "Snapshot Builder"' in command_text
    assert 'helper: "Choose what to capture."' in command_text
    assert "function openSnapshotBuilder()" in command_text
    snapshot_builder_block = command_text.split("function openSnapshotBuilder()", 1)[
        1
    ].split("function showModelLab()", 1)[0]
    assert 'setOverviewCommandMode("snapshot")' in snapshot_builder_block
    assert "CFS_EXPAND_OVERVIEW_RAIL_EVENT" in snapshot_builder_block
    assert "CFS_SAVE_PLANNING_SNAPSHOT_EVENT" not in snapshot_builder_block
    assert "openSnapshotBuilder();" in command_text

    explicit_save_block = command_text.split("function saveSnapshotForReport()", 1)[
        1
    ].split("function openSnapshotBuilder()", 1)[0]
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
    assert "Show explanation cards" in snapshot_text
    assert "Executive Summary Preview" in snapshot_text
    assert "Print Executive Summary" in snapshot_text
    assert "No planning snapshots saved yet" in snapshot_text
    assert "Open Methodology" in snapshot_text

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
    assert "Scale is approximate; 3D scene perspective affects distance." in snapshot_text
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


def test_phase25b_overview_customization_is_opt_in() -> None:
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
    workspace_text = (
        REPO_ROOT
        / "src"
        / "components"
        / "dashboard"
        / "OverviewWorkspaceBuilder.tsx"
    ).read_text(encoding="utf-8")
    sidebar_text = (
        REPO_ROOT / "src" / "components" / "layout" / "Sidebar.tsx"
    ).read_text(encoding="utf-8")

    assert "StableOverviewWorkspace" in app_shell_text
    assert "customOverviewActive ? (" in app_shell_text
    assert "initialEditMode" in app_shell_text
    assert "onResetToDefault={() => setCustomOverviewActive(false)}" in app_shell_text
    assert "OverviewWorkspaceBuilder" in app_shell_text
    assert "cfs.overview.customLayout.v2" in workspace_text
    assert "cfs.overview.customLayout.v1" in workspace_text
    assert "CUSTOM_LAYOUT_VERSION = \"phase25b_v2\"" in workspace_text
    assert "GRID_COLUMNS = 12" in workspace_text
    assert "GRID_ROW_HEIGHT = 32" in workspace_text
    assert "WorkspaceTileLayout" in workspace_text
    assert "WorkspaceTileDefinition" in workspace_text
    assert "defaultCustomLayout" in workspace_text
    assert "resolveTileOverlaps" in workspace_text
    assert "beginTileInteraction" in workspace_text
    assert "Drag or resize panels. This only changes your local workspace" in workspace_text
    assert "layout." in workspace_text
    assert "Resize" in workspace_text
    assert "Save Layout" in workspace_text
    assert "Reset Layout" in workspace_text
    assert "Add Panel" in workspace_text
    assert "Lock Layout" in workspace_text
    assert "Map is required and stays available." in workspace_text

    for tile_label in [
        "Map / SceneView",
        "CFS Command Center",
        "Intelligence Panel",
        "Map Layers",
        "Model Lab Controls",
        "Snapshot Helper",
        "Active Selection",
        "Countywide Indicators",
        "Snapshot Status",
    ]:
        assert tile_label in workspace_text

    assert "Customize Layout" in command_text
    assert "CFS_TOGGLE_OVERVIEW_CUSTOM_LAYOUT_EVENT" in command_text
    assert "Customize Overview layout" in command_text
    assert "Workspace Preset" not in command_text
    assert "LayoutDashboard" not in command_text
    assert "embedded?: boolean" in sidebar_text
    assert "<LayerRailEdgeHandle" in sidebar_text

    user_facing_text = "\n".join(
        [command_text, app_shell_text, workspace_text, sidebar_text],
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


def test_phase25b_layout_storage_is_versioned_and_non_auto_persisting() -> None:
    dashboard_state_text = (
        REPO_ROOT / "src" / "hooks" / "useDashboardState.tsx"
    ).read_text(encoding="utf-8")
    types_text = (REPO_ROOT / "src" / "types" / "index.ts").read_text(
        encoding="utf-8",
    )

    assert "OverviewLayoutPreset" in types_text
    assert "OverviewLayoutPreference" in types_text
    for preset in [
        "command_center",
        "map_focus",
        "parcel_intelligence",
        "countywide_layers",
        "model_lab",
        "snapshot_builder",
        "executive_demo",
    ]:
        assert preset in types_text
        assert preset in dashboard_state_text

    assert "cfs.overview.layout.v2" in dashboard_state_text
    assert "cfs.overview.layout.v1" in dashboard_state_text
    assert "LEGACY_OVERVIEW_LAYOUT_STORAGE_KEY" in dashboard_state_text
    assert "clearStoredOverviewLayoutPreference" in dashboard_state_text
    assert "readStoredOverviewLayoutPreference" in dashboard_state_text
    assert "applyOverviewLayoutPreset" in dashboard_state_text
    assert "resetOverviewLayout" in dashboard_state_text
    assert "saveOverviewLayoutPreference" in dashboard_state_text
    assert "setOverviewLayoutPanel" in dashboard_state_text
    assert "setOverviewLayoutWidthPreset" in dashboard_state_text
    assert "window.localStorage.removeItem(LEGACY_OVERVIEW_LAYOUT_STORAGE_KEY)" in dashboard_state_text


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
    assert "flex h-full min-h-[22rem] min-w-0 flex-col" in sidebar_text
    assert "flex min-h-0 flex-1 items-center justify-center" in sidebar_text
    assert "whitespace-nowrap" in sidebar_text

    assert "flex h-full min-h-0 shrink-0 transition-[width]" in app_shell_text
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
    assert "rawWidth <= LEFT_PANEL_COLLAPSE_THRESHOLD" in app_shell_text
    assert 'setOverviewLayoutPanel("left", "collapsed")' in app_shell_text
    assert 'document.body.classList.add("cfs-resizing")' in app_shell_text
    assert 'document.body.classList.remove("cfs-resizing")' in app_shell_text
    assert "width: leftPanelCollapsed" in app_shell_text
    assert "LEFT_PANEL_COLLAPSED_WIDTH" in app_shell_text
    assert "onToggleCollapsed={toggleLayerRailCollapsed}" in app_shell_text

    assert "getCollapsedRailLabel(overviewCommandMode)" in sidebar_text
    assert "CollapsedRailGlyph" in sidebar_text
    assert "h-full min-h-0 w-full min-w-0 flex-col overflow-hidden" in sidebar_text
    assert "overflow-x-hidden overflow-y-auto" in sidebar_text
    assert "<LayerToggle onCollapseDrawer={onCollapseDrawer} />" in sidebar_text
    assert "ModelLabControlsPanel" in sidebar_text
    assert "SnapshotModeControlsPanel" in sidebar_text

    assert "min-w-0 overflow-hidden rounded-lg" in layer_toggle_text
    assert "flex min-w-0 cursor-pointer list-none flex-wrap" in layer_toggle_text
    assert "min-w-0 space-y-2 overflow-hidden" in layer_toggle_text
    assert "min-w-0 flex-wrap items-center gap-2" in layer_toggle_text
    assert "ml-auto flex shrink-0 items-center gap-1.5" in layer_toggle_text
    assert "overflow-x-hidden" not in layer_toggle_text

    assert ".cfs-layer-rail {" in theme_text
    assert "min-width: 0;" in theme_text


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
