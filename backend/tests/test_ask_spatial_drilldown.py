from datetime import date

from app.schemas.ai_search import CfsAiDashboardActions, CfsAiSearchRequest
from app.services.ask_gis_agent import analyze_highlighted_result


class _Result:
    def __init__(self, value):
        self.value = value

    def scalar_one(self):
        return self.value

    def mappings(self):
        return self

    def all(self):
        return self.value


class _Session:
    def __init__(self):
        self.calls = 0

    def execute(self, _statement, _params):
        self.calls += 1
        if self.calls == 1:
            return _Result(100)
        if self.calls == 2:
            return _Result([
                {"label": "Governed Area A", "count": 35, "recent_permits": 18, "total_permits": 72,
                 "xmin": -80.7, "ymin": 35.2, "xmax": -80.6, "ymax": 35.3},
                {"label": "Governed Area B", "count": 20, "recent_permits": 7, "total_permits": 31,
                 "xmin": -80.6, "ymin": 35.3, "xmax": -80.5, "ymax": 35.4},
            ])
        return _Result([
            {"official_parcel_id": "PARCEL-1", "pin14": None, "area_label": "Governed Area A",
             "recent_permits": 5, "total_permits": 12, "latest_permit_date": date(2025, 8, 1),
             "flood_review": True, "sewer_nearby": True, "elevated_signal": False,
             "economic_review": False, "longitude": -80.65, "latitude": 35.25,
             "xmin": -80.66, "ymin": 35.24, "xmax": -80.64, "ymax": 35.26,
             "highlight_geometry": {"type": "Polygon", "coordinates": []}},
        ])


def _request(query: str, selected_parcel: str | None = None) -> CfsAiSearchRequest:
    return CfsAiSearchRequest(
        app_mode="planning",
        query=query,
        filter_context={
            "management_handoff_selection": "active_development_parcels",
            "management_handoff_selection_type": "parcel-population",
            "management_handoff_period_start": "2025-01-01",
            "management_handoff_period_end": "2025-12-31",
            "selected_parcel_id": selected_parcel,
        },
    )


def test_spatial_analysis_keeps_management_result_as_parent_and_returns_actions() -> None:
    result = analyze_highlighted_result(_Session(), _request("What patterns do you see?"))

    assert result is not None
    assert result["agent_result"].count == 100
    assert result["areas"][0]["share_percent"] == 35.0
    assert result["areas"][0]["parent_result_id"] == result["agent_result"].result_id
    assert result["parcels"][0]["parent_result_id"] == result["agent_result"].result_id
    assert "recent one-year window" in result["parcels"][0]["reason"]

    actions = CfsAiDashboardActions(
        agent_result=result["agent_result"],
        recommended_areas=result["areas"],
        recommended_parcels=result["parcels"],
    )
    assert actions.recommended_areas[0].subset_result_id
    assert actions.recommended_parcels[0].parcel_reference == "PARCEL-1"


def test_recommended_parcel_followup_uses_parent_relationship() -> None:
    result = analyze_highlighted_result(
        _Session(),
        _request("Why did you recommend this parcel?", "PARCEL-1"),
    )

    assert result is not None
    assert result["answer"].startswith("I recommended parcel PARCEL-1 because")
    assert "Governed Area A" in result["answer"]
