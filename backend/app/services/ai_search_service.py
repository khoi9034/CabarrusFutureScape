from __future__ import annotations

import concurrent.futures
import json
import re
import urllib.error
import urllib.request
from datetime import UTC, datetime
from typing import Any

from app.config import Settings
from app.schemas.ai_search import (
    CfsAiContext,
    CfsAiDashboardActions,
    CfsAiDomain,
    CfsAiEvidenceItem,
    CfsAiOpenDetailAction,
    CfsAiSearchRequest,
    CfsAiSearchResponse,
    CfsAiSelectedSignal,
)

SAFE_CAVEATS = [
    "Answers use CFS summary context only and do not invent missing data.",
    "Observed permit activity is a planning signal, not a prediction.",
    "Preliminary school capacity watch is not an official enrollment forecast.",
    "Model Lab context is internal research only; no exact probabilities are shown.",
]

RELATED_LAYERS = {
    "data_readiness": ["Data Still Needed", "Methodology"],
    "flood": ["Floodplain Review"],
    "general": ["Development Hotspots", "Floodplain Review", "School Utilization + Permit Pressure"],
    "methodology": ["Methodology"],
    "model_lab": ["Model Lab Research"],
    "permits": ["Development Hotspots", "Permit Activity by Year"],
    "schools": ["School Utilization + Permit Pressure", "School Capacity Watch"],
    "transportation": ["Transportation Context"],
    "utilities": ["Utility Readiness"],
    "zoning": ["Zoning / Land Use"],
}

_PROVIDER_TIMEOUT_SECONDS = 2.5
_PROVIDER_EXECUTOR = concurrent.futures.ThreadPoolExecutor(
    max_workers=2,
    thread_name_prefix="cfs-ai-provider",
)

DASHBOARD_ACTIONS: dict[CfsAiDomain, dict[str, Any]] = {
    "data_readiness": {
        "filter_watchlist": {"domain": "data_readiness", "status": "data needed"},
        "focus_domain": "data_readiness",
        "highlight_kpis": ["data_readiness"],
        "open_detail": {"type": "domain", "id": "data_readiness"},
        "sort_watchlist_by": "data_gap",
    },
    "flood": {
        "focus_domain": "flood",
        "highlight_kpis": ["floodplain_review"],
        "open_detail": {"type": "kpi", "id": "floodplain_review"},
        "recommended_layers": ["Floodplain Review"],
    },
    "general": {
        "focus_domain": "general",
        "highlight_kpis": ["observed_development_activity", "school_pressure"],
        "recommended_layers": [
            "Development Hotspots",
            "School Utilization + Permit Pressure",
            "Floodplain Review",
        ],
    },
    "model_lab": {
        "focus_domain": "model_lab",
        "highlight_kpis": ["model_research_status"],
        "open_detail": {"type": "domain", "id": "model_lab"},
        "recommended_layers": ["Model Lab Research Signals"],
    },
    "permits": {
        "focus_domain": "permits",
        "highlight_kpis": ["observed_development_activity"],
        "open_detail": {"type": "kpi", "id": "observed_development_activity"},
        "recommended_layers": ["Development Hotspots"],
        "sort_watchlist_by": "recent_activity",
    },
    "schools": {
        "filter_watchlist": {"domain": "schools", "status": "elevated review"},
        "focus_domain": "schools",
        "highlight_kpis": ["school_pressure"],
        "open_detail": {"type": "kpi", "id": "school_pressure"},
        "recommended_layers": [
            "School Utilization + Permit Pressure",
            "Development Hotspots",
        ],
        "sort_watchlist_by": "severity",
    },
    "transportation": {
        "focus_domain": "transportation",
        "highlight_kpis": ["transportation_context"],
        "recommended_layers": ["Transportation Context"],
    },
    "utilities": {
        "focus_domain": "utilities",
        "highlight_kpis": ["utility_readiness"],
        "recommended_layers": ["Utility Readiness"],
    },
    "zoning": {
        "focus_domain": "zoning",
        "highlight_kpis": ["data_readiness"],
        "recommended_layers": ["Zoning / Land Use"],
    },
}

DOMAIN_KEYWORDS: list[tuple[CfsAiDomain, tuple[str, ...]]] = [
    ("schools", ("school", "attendance", "capacity", "utilization", "student")),
    ("flood", ("flood", "fema", "floodplain", "floodway", "hazard")),
    ("permits", ("permit", "development", "growth", "activity", "trend")),
    ("transportation", ("transportation", "traffic", "road", "stip", "aadt")),
    ("utilities", ("utility", "utilities", "wsacc", "water", "sewer")),
    ("model_lab", ("model", "research", "signal", "lab")),
    ("data_readiness", ("missing", "data", "coverage", "readiness", "needed")),
    ("zoning", ("zoning", "land use", "rezoning", "planning")),
    ("methodology", ("method", "explain", "caveat", "limitation")),
]

UNSAFE_REPLACEMENTS = {
    r"\bwill be developed\b": "has observed planning context",
    r"\bwill develop\b": "shows observed permit activity",
    r"\bwill overcrowd\b": "needs school capacity review",
    r"\bovercrowding prediction\b": "preliminary school capacity watch",
    r"\bovercrowded\b": "above capacity in preliminary context",
    r"\bofficial prediction\b": "planning review signal",
    r"\bofficial score\b": "review status",
    r"\bexact probability\b": "no exact probability",
    r"\bprediction probability\b": "relative research signal",
    r"\braw score\b": "relative research signal",
    r"\bguaranteed\b": "not guaranteed",
    r"\bcertain\b": "not certain",
}


class CfsAiSearchService:
    def __init__(self, settings: Settings) -> None:
        self._settings = settings

    def search(
        self,
        request: CfsAiSearchRequest,
        context: CfsAiContext,
    ) -> CfsAiSearchResponse:
        domains = request.filters.domains or selected_signal_domains(request) or resolve_query_domains(request)
        fallback = deterministic_answer(request, context, domains)
        provider = self._settings.cfs_ai_provider

        if (
            not self._settings.cfs_ai_enabled
            or provider == "none"
            or not self._settings.cfs_ai_model.strip()
        ):
            return fallback

        try:
            provider_payload = self._provider_answer_with_timeout(request, context, domains)
        except concurrent.futures.TimeoutError:
            fallback.caveats.append(
                "OpenAI provider did not respond within the presentation timeout, so CFS used grounded deterministic analysis.",
            )
            return sanitize_response(fallback)
        except Exception:
            fallback.caveats.append(
                "AI provider was unavailable; deterministic CFS answer returned.",
            )
            return sanitize_response(fallback)

        if provider_payload and provider_payload.get("_provider_unavailable_reason") == "rate_limit_quota":
            fallback.caveats.append(
                "OpenAI provider was unavailable due to rate limit or quota status, so CFS used grounded deterministic analysis.",
            )
            return sanitize_response(fallback)

        if provider_payload is None:
            fallback.caveats.append(
                "AI provider is not fully configured; deterministic CFS answer returned.",
            )
            return sanitize_response(fallback)

        provider_answer = str(provider_payload.get("answer") or "")
        if not _provider_answer_is_useful(provider_answer, fallback.answer):
            fallback.caveats.append(
                "AI provider response was too sparse for the presentation view, so CFS used grounded deterministic analysis.",
            )
            return sanitize_response(fallback)

        response = CfsAiSearchResponse(
            answer=provider_answer,
            as_of=fallback.as_of,
            caveats=_string_list(provider_payload.get("caveats")) or fallback.caveats,
            data_mode=request.mode,
            domains=domains,
            evidence=_evidence_items(provider_payload.get("evidence")) or fallback.evidence,
            dashboard_actions=_dashboard_actions_from_payload(
                provider_payload.get("dashboard_actions"),
            )
            or fallback.dashboard_actions,
            provider=provider,
            related_layers=_string_list(provider_payload.get("related_layers"))
            or fallback.related_layers,
            suggested_actions=_string_list(provider_payload.get("suggested_actions"))
            or fallback.suggested_actions,
        )
        if request.selected_signal:
            response.dashboard_actions = _selected_signal_actions(request.selected_signal, domains)
            response.related_layers = list(
                dict.fromkeys(
                    [
                        *response.related_layers,
                        *request.selected_signal.related_layers,
                    ],
                ),
            )[:6]
        return sanitize_response(response)

    def _provider_answer_with_timeout(
        self,
        request: CfsAiSearchRequest,
        context: CfsAiContext,
        domains: list[CfsAiDomain],
    ) -> dict[str, Any] | None:
        future = _PROVIDER_EXECUTOR.submit(self._provider_answer, request, context, domains)
        try:
            return future.result(timeout=_PROVIDER_TIMEOUT_SECONDS)
        except concurrent.futures.TimeoutError:
            future.cancel()
            raise

    def _provider_answer(
        self,
        request: CfsAiSearchRequest,
        context: CfsAiContext,
        domains: list[CfsAiDomain],
    ) -> dict[str, Any] | None:
        if self._settings.cfs_ai_provider != "openai":
            return None

        api_key = self._settings.openai_api_key.strip()
        if not api_key:
            return None
        payload = {
            "model": self._settings.cfs_ai_model.strip(),
            "messages": [
                {"role": "system", "content": _provider_system_prompt()},
                {
                    "role": "user",
                    "content": json.dumps(
                        {
                            "domains": domains,
                            "query": request.query,
                            "conversation_context": [
                                turn.model_dump(exclude_none=True)
                                for turn in request.conversation_context[-5:]
                            ],
                            "selected_signal": request.selected_signal.model_dump(exclude_none=True)
                            if request.selected_signal
                            else None,
                            "cfs_context": compact_context(context),
                            "deterministic_dashboard_actions": dashboard_actions_for_domains(
                                domains,
                            ).model_dump(exclude_none=True),
                        },
                        default=str,
                    ),
                },
            ],
            "response_format": {"type": "json_object"},
        }
        return _post_provider_json(
            "https://api.openai.com/v1/chat/completions",
            payload,
            {
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            ["choices", 0, "message", "content"],
        )


def classify_query_domains(query: str) -> list[CfsAiDomain]:
    normalized = query.lower()
    matches = [
        domain
        for domain, keywords in DOMAIN_KEYWORDS
        if any(keyword in normalized for keyword in keywords)
    ]
    return matches[:3] or ["general"]


FOLLOW_UP_TERMS = (
    "those",
    "that",
    "them",
    "which ones",
    "what about",
    "what layers",
    "which layers",
    "inspect next",
    "why",
    "show me more",
    "explain more",
)


def resolve_query_domains(request: CfsAiSearchRequest) -> list[CfsAiDomain]:
    domains = classify_query_domains(request.query)
    previous = _previous_domains(request)
    is_follow_up = any(term in request.query.lower() for term in FOLLOW_UP_TERMS)

    if is_follow_up and domains == ["general"] and previous:
        domains = previous
    elif is_follow_up:
        domains = list(dict.fromkeys([*domains, *previous]))

    return domains[:3] or ["general"]


def selected_signal_domains(request: CfsAiSearchRequest) -> list[CfsAiDomain]:
    if not request.selected_signal:
        return []
    domain = _domain_from_selected_signal(request.selected_signal.domain)
    return [domain] if domain else []


def _domain_from_selected_signal(domain: str) -> CfsAiDomain | None:
    normalized = domain.lower().replace("-", "_").replace(" ", "_")
    direct: dict[str, CfsAiDomain] = {
        "data_readiness": "data_readiness",
        "development_activity": "permits",
        "flood": "flood",
        "floodplain_review": "flood",
        "model_lab": "model_lab",
        "model_research": "model_lab",
        "permits": "permits",
        "school_pressure": "schools",
        "schools": "schools",
        "transportation": "transportation",
        "transportation_context": "transportation",
        "utilities": "utilities",
        "utility_readiness": "utilities",
        "zoning": "zoning",
        "zoning_land_use": "zoning",
    }
    if normalized in direct:
        return direct[normalized]
    matches = classify_query_domains(domain)
    return matches[0] if matches and matches[0] != "general" else None


def _previous_domains(request: CfsAiSearchRequest) -> list[CfsAiDomain]:
    domains: list[CfsAiDomain] = []
    allowed = set(DASHBOARD_ACTIONS)
    for turn in reversed(request.conversation_context[-5:]):
        focus = turn.focused_domain
        if focus in allowed and focus != "general":
            domains.append(focus)  # type: ignore[arg-type]
        for layer in turn.related_layers:
            domains.extend(classify_query_domains(layer))
    return list(dict.fromkeys(domain for domain in domains if domain != "general"))


def deterministic_answer(
    request: CfsAiSearchRequest,
    context: CfsAiContext,
    domains: list[CfsAiDomain],
) -> CfsAiSearchResponse:
    if request.selected_signal:
        return _selected_signal_answer(request, context, domains)

    primary_domain = domains[0] if domains else "general"
    builders = {
        "data_readiness": _data_readiness_answer,
        "flood": _flood_answer,
        "general": _general_answer,
        "methodology": _methodology_answer,
        "model_lab": _model_answer,
        "permits": _permit_answer,
        "schools": _school_answer,
        "transportation": _transportation_answer,
        "utilities": _utility_answer,
        "zoning": _zoning_answer,
    }
    response = builders.get(primary_domain, _general_answer)(request, context, domains)
    return sanitize_response(response)


def sanitize_response(response: CfsAiSearchResponse) -> CfsAiSearchResponse:
    payload = response.model_dump()
    sanitized = _sanitize_value(payload)
    return CfsAiSearchResponse.model_validate(sanitized)


def sanitize_text(value: str) -> str:
    sanitized = value
    for pattern, replacement in UNSAFE_REPLACEMENTS.items():
        sanitized = re.sub(pattern, replacement, sanitized, flags=re.IGNORECASE)
    return sanitized


def dashboard_actions_for_domains(
    domains: list[CfsAiDomain],
    request: CfsAiSearchRequest | None = None,
) -> CfsAiDashboardActions:
    primary = domains[0] if domains else "general"
    payload = dict(DASHBOARD_ACTIONS.get(primary, DASHBOARD_ACTIONS["general"]))
    if request and (request.filters.year_start or request.filters.year_end):
        payload["time_range"] = {
            "end_year": request.filters.year_end,
            "start_year": request.filters.year_start,
        }
    return CfsAiDashboardActions.model_validate(payload)


def compact_context(context: CfsAiContext) -> CfsAiContext:
    return {
        "indicator_intelligence": context.get("indicator_intelligence"),
        "indicator_summary": context.get("indicator_summary"),
        "school_pressure": context.get("school_pressure"),
        "methodology": context.get("methodology"),
    }


def extract_development_activity_detail(context: CfsAiContext) -> dict[str, Any]:
    intelligence = context.get("indicator_intelligence", {})
    summary = context.get("indicator_summary", {})
    detail: dict[str, Any] = {}
    if isinstance(intelligence, dict):
        source = intelligence.get("development_activity_detail")
        if isinstance(source, dict):
            detail.update(source)
        nested = intelligence.get("details")
        if isinstance(nested, dict) and isinstance(nested.get("development_activity"), dict):
            detail = {**nested["development_activity"], **detail}

    growth = _monitor_metrics(summary, "growth_monitor") if isinstance(summary, dict) else {}
    trend = _chart(summary, "development_permit_trend") if isinstance(summary, dict) else []
    signal = _first_signal(intelligence, "development_activity") if isinstance(intelligence, dict) else {}

    evidence_text = " ".join(str(item) for item in signal.get("evidence", []))
    records, parcels = _parse_permit_totals(evidence_text)
    detail.setdefault("total_records", growth.get("permit_records") or records)
    detail.setdefault("active_parcels", growth.get("active_parcels") or parcels)

    yearly_counts = _normalize_yearly_counts(detail.get("yearly_counts") or trend)
    if yearly_counts:
        detail["yearly_counts"] = yearly_counts
        detail.setdefault("years_available", [row["year"] for row in yearly_counts])
        detail.setdefault("strongest_year", max(yearly_counts, key=lambda row: row["count"]))
        detail.setdefault("weakest_year", min(yearly_counts, key=lambda row: row["count"]))
        previous, latest = yearly_counts[-2], yearly_counts[-1]
        detail.setdefault("previous_window", previous["year"])
        detail.setdefault("recent_window", latest["year"])
        detail.setdefault("previous_count", previous["count"])
        detail.setdefault("recent_count", latest["count"])
        if detail.get("delta") is None:
            detail["delta"] = latest["count"] - previous["count"]
        if detail.get("pct_change") is None and previous["count"]:
            detail["pct_change"] = detail["delta"] / previous["count"] * 100

    if not detail.get("top_segments") and growth.get("top_permit_segment"):
        detail["top_segments"] = [_label_count_from_text(str(growth["top_permit_segment"]))]
    detail.setdefault("top_permit_types", [])
    detail.setdefault("top_segments", [])
    detail.setdefault("top_geographies", [])
    return detail


def _selected_signal_answer(
    request: CfsAiSearchRequest,
    context: CfsAiContext,
    domains: list[CfsAiDomain],
) -> CfsAiSearchResponse:
    signal = request.selected_signal
    if signal is None:
        return _general_answer(request, context, domains)

    active_domains = domains or selected_signal_domains(request) or ["general"]
    safe_evidence = signal.evidence[:4] or ["Evidence is limited in the selected dashboard item."]
    safe_layers = signal.related_layers[:4] or _related_layers(active_domains)
    status = signal.status_band or "review signal"
    meaning, why_it_matters, caveat = _selected_signal_meaning(signal.domain)
    answer = _briefing(
        ("What this signal means", f"{signal.title}: {meaning} Current status band: {status}."),
        ("Evidence", _bullets(safe_evidence)),
        ("Why it matters", why_it_matters),
        ("What to inspect next", _bullets(safe_layers or ["Operational Watchlist", "Methodology"])),
        ("Caveats", caveat),
    )
    response = _response(
        answer,
        context,
        active_domains,
        request.mode,
        [
            _evidence(
                signal.title,
                "; ".join(safe_evidence),
                f"selected_signal.{signal.id}",
                "available" if signal.evidence else "limited",
            ),
        ],
        [
            f"Open the detail drawer for {signal.title}.",
            "Compare the signal with recommended Explore Countywide layers.",
            "Review Methodology before using this as decision support.",
        ],
    )
    response.dashboard_actions = _selected_signal_actions(signal, active_domains)
    response.related_layers = list(dict.fromkeys([*response.related_layers, *safe_layers]))[:6]
    return response


def _selected_signal_meaning(domain: str) -> tuple[str, str, str]:
    normalized = domain.lower().replace("-", "_").replace(" ", "_")
    if normalized in {"development_activity", "permits"}:
        return (
            "Observed permit activity is showing where review workload or development attention may be concentrated.",
            "Permit activity helps staff compare growth signals against schools, floodplain review, utilities, transportation, and zoning context.",
            "Permit records are observed activity only; they are not predictions and do not confirm completed construction.",
        )
    if normalized in {"school_pressure", "schools"}:
        return (
            "This combines utilization context with observed permit activity inside attendance areas.",
            "Areas where utilization context and recent permits overlap may deserve planning review before stronger conclusions are made.",
            "This is not an official enrollment forecast and does not claim school capacity findings.",
        )
    if normalized in {"flood", "floodplain_review"}:
        return (
            "Floodplain Review flags mapped floodplain context that should be checked during planning review.",
            "Overlap with active areas can change what staff inspect before planning around a parcel or district.",
            "This is a planning screen, not a permitting determination.",
        )
    if normalized in {"utility_readiness", "utilities"}:
        return (
            "Utility readiness shows where CFS has only proxy context or where official capacity data is still needed.",
            "Missing service, committed capacity, and update-date fields limit infrastructure readiness conclusions.",
            "Proxy proximity does not confirm available capacity.",
        )
    if normalized in {"transportation", "transportation_context"}:
        return (
            "Transportation context highlights road, traffic, or project context that can affect planning coordination.",
            "Comparing corridor context with permit activity helps identify places that need transportation follow-up.",
            "Project status, funding, and timing can be incomplete in the current CFS context.",
        )
    if normalized in {"model_lab", "model_research"}:
        return (
            "Model Lab shows relative research signal only and remains internal research context.",
            "It can help prioritize questions, but source records and staff review remain the evidence base.",
            "No exact probabilities, raw model values, or official prediction classes are shown.",
        )
    if normalized in {"data_readiness", "zoning_land_use", "zoning"}:
        return (
            "Data readiness identifies missing or incomplete source data that limits stronger analysis.",
            "These gaps tell staff what to request before turning exploratory signals into formal review support.",
            "CFS labels missing data instead of inventing values.",
        )
    return (
        "This is a CFS planning signal assembled from available indicator context.",
        "It helps staff choose what to inspect next without turning the dashboard into an official scoring system.",
        "Answers use available CFS summaries only and preserve source caveats.",
    )


def _selected_signal_actions(
    signal: CfsAiSelectedSignal,
    domains: list[CfsAiDomain],
) -> CfsAiDashboardActions:
    actions = dashboard_actions_for_domains(domains)
    actions.open_detail = CfsAiOpenDetailAction(type="kpi", id=signal.id)
    actions.recommended_layers = list(
        dict.fromkeys([*actions.recommended_layers, *signal.related_layers]),
    )[:6]
    return actions


def _permit_answer(
    request: CfsAiSearchRequest,
    context: CfsAiContext,
    domains: list[CfsAiDomain],
) -> CfsAiSearchResponse:
    detail = extract_development_activity_detail(context)
    top_types = _named_counts(detail.get("top_permit_types") or [])
    top_segments = _named_counts(detail.get("top_segments") or [])
    top_geographies = _named_counts(detail.get("top_geographies") or [])
    total_records = detail.get("total_records")
    active_parcels = detail.get("active_parcels")
    total_sentence = (
        f"CFS analyzed {_fmt(total_records)} observed permit records "
        f"across {_fmt(active_parcels)} active parcels."
        if total_records or active_parcels
        else "CFS does not have permit totals in the current compact context."
    )
    answer = _briefing(
        (
            "Executive summary",
            (
                f"{total_sentence} "
                f"{_recent_change_text(detail)} This is a planning review signal, not a prediction."
            ),
        ),
        (
            "Key findings",
            _bullets(
                [
                    f"Years available: {_range_text(detail.get('years_available') or [])}.",
                    f"Strongest year: {_year_point(detail.get('strongest_year'))}; weakest year: {_year_point(detail.get('weakest_year'))}.",
                    f"Top permit types: {top_types or 'permit type fields are not currently exposed in the compact context'}.",
                    f"Top permit segments: {top_segments or 'permit segment fields are not currently exposed in the compact context'}.",
                    f"Top geography bucket ({detail.get('top_geography_type') or 'source geography'}): {top_geographies or 'geography fields are not currently exposed in the compact context'}.",
                ]
            ),
        ),
        (
            "Planning interpretation",
            (
                "Rising or concentrated permit activity points to review workload and coordination needs. "
                "Compare active areas with school pressure, floodplain review, utility readiness, transportation context, and zoning/land-use context."
            ),
        ),
        (
            "Inspect next",
            _bullets(
                [
                    "Development Hotspots by permit segment and year range.",
                    "School Utilization + Permit Pressure for attendance-area overlap.",
                    "Floodplain Review, Utility Readiness, and Transportation Context around active areas.",
                ]
            ),
        ),
    )
    return _response(
        answer,
        context,
        domains,
        request.mode,
        [
            _evidence(
                "Observed permit activity",
                f"{_fmt(total_records)} permit records across {_fmt(active_parcels)} active parcels.",
                "indicator_intelligence.development_activity_detail",
                "available" if total_records or active_parcels else "limited",
            ),
            _evidence(
                "Permit activity trend",
                _trend_detail_from_detail(detail),
                "indicator_intelligence.development_activity_detail.yearly_counts",
                "available" if detail.get("yearly_counts") else "limited",
            ),
            _evidence(
                "Permit categories and geography",
                f"Top types: {top_types or 'not currently exposed'}; top geographies: {top_geographies or 'not currently exposed'}.",
                "indicator_intelligence.development_activity_detail",
                "available" if detail else "limited",
            ),
        ],
        [
            "Review Development Hotspots by permit segment and year range.",
            "Ask: Which school areas overlap recent permit activity?",
            "Ask: Where is data coverage incomplete for development review?",
        ],
    )


def _school_answer(
    request: CfsAiSearchRequest,
    context: CfsAiContext,
    domains: list[CfsAiDomain],
) -> CfsAiSearchResponse:
    pressure = context.get("school_pressure", {})
    summary = pressure.get("summary", {})
    intelligence = context.get("indicator_intelligence", {})
    detail = intelligence.get("school_pressure_detail", {}) if isinstance(intelligence, dict) else {}
    answer = _briefing(
        (
            "Executive summary",
            (
                "Start with attendance areas where preliminary utilization context overlaps observed permit activity. "
                f"CFS reviewed {_fmt(detail.get('areas_reviewed') or summary.get('areas_analyzed'))} areas and found "
                f"{_fmt(detail.get('elevated_review_count') or summary.get('elevated_review_count'))} elevated review signals."
            ),
        ),
        (
            "Key findings",
            _bullets(
                [
                    f"Utilization coverage: {detail.get('utilization_data_coverage') or _fmt(summary.get('areas_with_utilization')) + ' areas include utilization context'}.",
                    f"Permit pressure overlap: {detail.get('permit_pressure_overlap') or _fmt(summary.get('areas_with_recent_permits')) + ' areas include recent permit activity'}.",
                    f"Top watch areas: {_school_area_list(detail.get('top_areas') or []) or 'top attendance-area rows are not available in the compact context'}.",
                ]
            ),
        ),
        (
            "Planning interpretation",
            (
                "This is a preliminary school capacity watch. It helps staff decide where to compare enrollment/capacity, "
                "approved subdivisions, housing mix, and permit activity. It is not an official enrollment forecast."
            ),
        ),
        (
            "Inspect next",
            _bullets(
                [
                    "School Utilization + Permit Pressure.",
                    "Development Hotspots filtered to recent residential permit segments.",
                    "Data Still Needed for official enrollment, capacity, and student-generation assumptions.",
                ]
            ),
        ),
    )
    return _response(
        answer,
        context,
        domains,
        request.mode,
        [
            _evidence(
                "School pressure summary",
                (
                    f"{_fmt(summary.get('areas_with_utilization'))} areas include utilization context; "
                    f"{_fmt(summary.get('areas_with_recent_permits'))} include recent permit activity."
                ),
                "school_pressure_summary",
                "available" if pressure.get("features") else "limited",
            ),
            _evidence(
                "Recent permit activity in watched areas",
                f"{_fmt(summary.get('recent_residential_permits_in_watched_areas'))} recent residential permits in watched areas.",
                "school_pressure_summary",
                "available" if summary else "not_available",
            ),
        ],
        [
            "Open Explore Countywide -> School Utilization + Permit Pressure.",
            "Ask: What changed in observed development activity?",
            "Ask: Where is data coverage incomplete?",
        ],
    )


def _flood_answer(
    request: CfsAiSearchRequest,
    context: CfsAiContext,
    domains: list[CfsAiDomain],
) -> CfsAiSearchResponse:
    summary = context.get("indicator_summary", {})
    intelligence = context.get("indicator_intelligence", {})
    detail = intelligence.get("floodplain_detail", {}) if isinstance(intelligence, dict) else {}
    constraint = _monitor_metrics(summary, "constraint_monitor")
    answer = _briefing(
        (
            "Executive summary",
            (
                "Floodplain Review flags parcels that need planning review against mapped floodplain context. "
                f"CFS shows {_fmt(detail.get('review_required_count') or constraint.get('review_parcels'))} review parcels."
            ),
        ),
        (
            "Key findings",
            _bullets(
                [
                    f"Special Flood Hazard Area parcels: {_fmt(detail.get('special_flood_hazard_area_count') or constraint.get('special_flood_hazard_area_parcels'))}.",
                    f"Floodway parcels: {_fmt(detail.get('floodway_count') or constraint.get('floodway_parcels'))}.",
                    f"Permit overlap count: {_fmt(detail.get('permit_overlap_count'))}.",
                ]
            ),
        ),
        (
            "Planning interpretation",
            "Use floodplain review before evaluating active development areas. This is a planning screen, not a permitting determination.",
        ),
        (
            "Inspect next",
            _bullets(["Floodplain Review.", "Development Hotspots near constrained parcels.", "Methodology for floodplain caveats."]),
        ),
    )
    return _response(
        answer,
        context,
        domains,
        request.mode,
        [
            _evidence(
                "Floodplain Review",
                f"{_fmt(constraint.get('high_severe_impact'))} high/severe review attention parcels if available.",
                "indicator_summary.constraint_monitor",
            ),
        ],
        [
            "Review Floodplain Review before planning around constrained parcels.",
            "Ask: What layers should I review before planning around this area?",
        ],
    )


def _model_answer(
    request: CfsAiSearchRequest,
    context: CfsAiContext,
    domains: list[CfsAiDomain],
) -> CfsAiSearchResponse:
    answer = _briefing(
        (
            "Executive summary",
            "Model Lab is internal research context. It compares relative research signals and planning features; it does not make official determinations.",
        ),
        (
            "Key findings",
            _bullets(
                [
                    "Use bands such as Very Strong Research Signal or Moderate Research Signal as review prompts.",
                    "Factors can include zoning context, transportation access, observed permit activity, parcel context, and data readiness.",
                    "No exact probabilities, raw model values, or official classifications are shown.",
                ]
            ),
        ),
        (
            "Planning interpretation",
            "Treat Model Lab as a way to prioritize questions, not as a decision engine. Always verify source records before drawing conclusions.",
        ),
        (
            "Inspect next",
            _bullets(["Model Lab Research Signals.", "Methodology.", "Related parcel, zoning, transportation, and permit layers."]),
        ),
    )
    return _response(
        answer,
        context,
        domains,
        request.mode,
        [
            _evidence(
                "Model status",
                "Current public-facing status is internal research only and not production-ready.",
                "model_status",
            ),
        ],
        ["Use Model Lab for research context, then verify source records before conclusions."],
    )


def _data_readiness_answer(
    request: CfsAiSearchRequest,
    context: CfsAiContext,
    domains: list[CfsAiDomain],
) -> CfsAiSearchResponse:
    readiness = context.get("indicator_summary", {}).get("data_readiness", [])
    intelligence = context.get("indicator_intelligence", {})
    readiness_rows = intelligence.get("domain_readiness", []) if isinstance(intelligence, dict) else []
    readiness_detail = intelligence.get("data_readiness_detail", []) if isinstance(intelligence, dict) else []
    labels = [item.get("dataset", "Unknown dataset") for item in readiness[:4]]
    if readiness_rows:
        labels = [
            row.get("domain", "Unknown domain")
            for row in readiness_rows
            if row.get("data_available") != "yes"
        ][:4]
    detail_lines = [
        f"{row.get('domain')}: needs {row.get('next_data_need')}"
        for row in readiness_detail[:5]
    ]
    answer = _briefing(
        (
            "Executive summary",
            "Data coverage gaps are the items that most limit confidence beyond planning review signals.",
        ),
        (
            "Key findings",
            _bullets(
                [
                    f"Priority domains: {', '.join(labels) if labels else 'not available from current context'}.",
                    *(detail_lines or ["Detailed next-data-need rows are not available in the current context."]),
                ]
            ),
        ),
        (
            "Planning interpretation",
            "Use data readiness to decide what to request before moving from exploratory monitoring to official review support.",
        ),
        (
            "Inspect next",
            _bullets(["Data Still Needed.", "Methodology.", "Utility Readiness, Schools, Zoning / Land Use, and Transportation Context."]),
        ),
    )
    return _response(
        answer,
        context,
        domains,
        request.mode,
        [
            _evidence(
                "Data Still Needed",
                f"{len(readiness)} priority missing datasets are tracked.",
                "indicator_summary.data_readiness",
                "available" if readiness else "not_available",
            ),
        ],
        [
            "Request official data sources listed in the Data Still Needed board.",
            "Ask: What should I inspect first?",
        ],
    )


def _transportation_answer(request, context, domains):
    return _simple_domain_answer(
        "Transportation Context",
        "Transportation context is available as a planning layer where source data exists; use it with observed permit activity and parcel context.",
        "Review Transportation Context with Development Hotspots before staff follow-up.",
        request,
        context,
        domains,
    )


def _utility_answer(request, context, domains):
    return _simple_domain_answer(
        "Utility Readiness",
        "Utility readiness is proxy-only until true capacity data is received. Proximity does not confirm available capacity.",
        "Request WSACC service area, available capacity, committed capacity, and update date.",
        request,
        context,
        domains,
    )


def _zoning_answer(request, context, domains):
    return _simple_domain_answer(
        "Zoning / Land Use",
        "Zoning and land-use context help explain parcel planning context, but official rezoning case records and future land-use GIS remain data needs where unavailable.",
        "Review zoning context with permit activity and data readiness caveats.",
        request,
        context,
        domains,
    )


def _methodology_answer(request, context, domains):
    return _simple_domain_answer(
        "Methodology",
        "CFS combines observed activity, constraints, preliminary school context, and data readiness notes. Missing data is shown as unavailable rather than inferred.",
        "Open Methodology for source notes, caveats, and safe-use boundaries.",
        request,
        context,
        domains,
    )


def _general_answer(
    request: CfsAiSearchRequest,
    context: CfsAiContext,
    domains: list[CfsAiDomain],
) -> CfsAiSearchResponse:
    intelligence = context.get("indicator_intelligence", {})
    watchlist = intelligence.get("watchlist", []) if isinstance(intelligence, dict) else []
    top = [
        f"{item.get('title', 'review signal')} ({str(item.get('status_band', 'review')).replace('_', ' ')})"
        for item in watchlist[:5]
    ]
    answer = _briefing(
        (
            "Executive summary",
            "Inspect the highest-priority watchlist items first, then move to data-needed blockers that limit confidence.",
        ),
        (
            "Priority order",
            _bullets(
                top
                or [
                    "Development Activity.",
                    "School Utilization + Permit Pressure.",
                    "Floodplain Review.",
                    "Data Still Needed.",
                ]
            ),
        ),
        (
            "Planning interpretation",
            "This order puts elevated review and review signals ahead of lower-intensity monitoring, while keeping missing official data visible.",
        ),
        (
            "Inspect next",
            _bullets(["Operational Watchlist.", "Development Hotspots.", "School Utilization + Permit Pressure.", "Floodplain Review.", "Data Still Needed."]),
        ),
    )
    return _response(
        answer,
        context,
        domains,
        request.mode,
        [
            _evidence(
                "Mission Control",
                "CFS summarizes countywide monitoring signals from existing CFS intelligence.",
                "indicator_center",
            ),
        ],
        [
            "Inspect the Operational Watchlist first.",
            "Open related Explore Countywide layers for map context.",
        ],
    )


def _simple_domain_answer(title, answer, action, request, context, domains):
    return _response(
        answer,
        context,
        domains,
        request.mode,
        [_evidence(title, answer, title.lower().replace(" ", "_"))],
        [action],
    )


def _briefing(*sections: tuple[str, str]) -> str:
    return "\n\n".join(f"{title}\n{body}" for title, body in sections if body)


def _bullets(items: list[str]) -> str:
    return "\n".join(f"- {item}" for item in items if item)


def _named_counts(rows: list[dict[str, Any]]) -> str:
    return ", ".join(
        f"{row.get('label') or row.get('value') or 'Unknown'} ({_fmt(row.get('count'))})"
        for row in rows[:4]
    )


def _normalize_yearly_counts(rows: Any) -> list[dict[str, int]]:
    if not isinstance(rows, list):
        return []
    normalized: list[dict[str, int]] = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        year = _as_int(row.get("year") or row.get("label"))
        count = _as_int(row.get("count") or row.get("value") or row.get("permit_count"))
        if year is not None and count is not None:
            normalized.append({"year": year, "count": count})
    return sorted(normalized, key=lambda item: item["year"])


def _parse_permit_totals(text: str) -> tuple[int | None, int | None]:
    match = re.search(
        r"([\d,]+)\s+permit records\s+across\s+([\d,]+)\s+active parcels",
        text,
        flags=re.IGNORECASE,
    )
    if not match:
        return None, None
    return _as_int(match.group(1)), _as_int(match.group(2))


def _label_count_from_text(text: str) -> dict[str, Any]:
    match = re.match(r"(.+?)\s+\(([\d,]+)\)", text)
    if not match:
        return {"count": None, "label": text}
    return {"count": _as_int(match.group(2)), "label": match.group(1)}


def _as_int(value: Any) -> int | None:
    if value is None or value == "":
        return None
    if isinstance(value, (int, float)):
        return int(value)
    try:
        return int(str(value).replace(",", ""))
    except ValueError:
        return None


def _recent_change_text(detail: dict[str, Any]) -> str:
    recent = detail.get("recent_window")
    previous = detail.get("previous_window")
    delta = detail.get("delta")
    pct = detail.get("pct_change")
    if recent and previous and delta is not None:
        pct_text = f" ({pct:+.1f}%)" if isinstance(pct, (int, float)) else ""
        return f"The latest comparison is {previous} to {recent}: {_fmt(detail.get('previous_count'))} to {_fmt(detail.get('recent_count'))} permits, a {delta:+,} permit change{pct_text}."
    return "Recent year comparison is not available from the current context."


def _range_text(values: list[Any]) -> str:
    cleaned = [value for value in values if value not in (None, "")]
    if not cleaned:
        return "not available"
    return f"{cleaned[0]}-{cleaned[-1]}" if len(cleaned) > 1 else str(cleaned[0])


def _year_point(value: Any) -> str:
    if not isinstance(value, dict) or not value:
        return "not available"
    return f"{value.get('year', 'year not available')} ({_fmt(value.get('count'))} permits)"


def _school_area_list(rows: list[dict[str, Any]]) -> str:
    return "; ".join(
        f"{row.get('school_name') or 'Attendance area'} - {row.get('watch_band') or 'review'} with {_fmt(row.get('recent_permits'))} recent permits"
        for row in rows[:4]
    )


def _provider_answer_is_useful(provider_answer: str, fallback_answer: str) -> bool:
    return len(provider_answer.strip()) >= min(500, max(240, len(fallback_answer) // 3))


def _response(
    answer: str,
    context: CfsAiContext,
    domains: list[CfsAiDomain],
    mode: str,
    evidence: list[CfsAiEvidenceItem],
    actions: list[str],
) -> CfsAiSearchResponse:
    active_domains = domains or ["general"]
    caveats = list(dict.fromkeys(SAFE_CAVEATS + context.get("caveats", [])))[:6]
    if mode == "demo":
        caveats.insert(0, "Portfolio Demo uses a cached demo extract.")
    return CfsAiSearchResponse(
        answer=answer,
        as_of=context.get("as_of") or datetime.now(UTC).isoformat(),
        caveats=caveats,
        dashboard_actions=dashboard_actions_for_domains(active_domains, None),
        data_mode=mode,  # type: ignore[arg-type]
        domains=active_domains,
        evidence=evidence,
        provider="none",
        related_layers=_related_layers(active_domains),
        suggested_actions=actions,
    )


def _evidence(title, detail, source, confidence="available") -> CfsAiEvidenceItem:
    return CfsAiEvidenceItem(
        confidence=confidence,
        detail=detail,
        source=source,
        title=title,
    )


def _related_layers(domains: list[CfsAiDomain]) -> list[str]:
    layers: list[str] = []
    for domain in domains:
        layers.extend(RELATED_LAYERS.get(domain, []))
    return list(dict.fromkeys(layers))[:6]


def _monitor_metrics(summary: dict[str, Any], card_id: str) -> dict[str, Any]:
    for card in summary.get("monitoring_cards", []):
        if card.get("id") == card_id:
            return card.get("metrics", {})
    return {}


def _chart(summary: dict[str, Any], chart_id: str) -> list[dict[str, Any]]:
    chart_data = summary.get("chart_data", {})
    value = chart_data.get(chart_id, [])
    return value if isinstance(value, list) else []


def _first_signal(context: dict[str, Any], domain: str) -> dict[str, Any]:
    signals = context.get("signals", []) if isinstance(context, dict) else []
    for signal in signals:
        if isinstance(signal, dict) and signal.get("domain") == domain:
            return signal
    return {}


def _trend_detail(trend: list[dict[str, Any]]) -> str:
    if not trend:
        return "Trend data is not available from current CFS context."
    first = trend[0]
    latest = trend[-1]
    return (
        f"{first.get('label', 'First available')}: {_fmt(first.get('value'))}; "
        f"{latest.get('label', 'latest')}: {_fmt(latest.get('value'))}."
    )


def _trend_detail_from_detail(detail: dict[str, Any]) -> str:
    yearly_counts = detail.get("yearly_counts")
    if not isinstance(yearly_counts, list) or not yearly_counts:
        return "Yearly trend fields are not currently exposed in the compact context."
    first = next(
        (row for row in yearly_counts if isinstance(row, dict) and _as_int(row.get("year")) and _as_int(row.get("year")) >= 2020),
        yearly_counts[0],
    )
    latest = yearly_counts[-1]
    return (
        f"{first.get('year', 'First available')}: {_fmt(first.get('count'))}; "
        f"{latest.get('year', 'latest')}: {_fmt(latest.get('count'))}."
    )


def _fmt(value: Any) -> str:
    if value is None or value == "":
        return "not available"
    if isinstance(value, (int, float)):
        return f"{value:,.0f}"
    return str(value)


def _sanitize_value(value: Any) -> Any:
    if isinstance(value, str):
        return sanitize_text(value)
    if isinstance(value, list):
        return [_sanitize_value(item) for item in value]
    if isinstance(value, dict):
        return {key: _sanitize_value(item) for key, item in value.items()}
    return value


def _string_list(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    return [str(item) for item in value if item is not None][:8]


def _evidence_items(value: Any) -> list[CfsAiEvidenceItem]:
    if not isinstance(value, list):
        return []
    items = []
    for item in value[:6]:
        if isinstance(item, dict):
            items.append(
                CfsAiEvidenceItem(
                    confidence=item.get("confidence", "available"),
                    detail=str(item.get("detail", "")),
                    source=str(item.get("source", "provider")),
                    title=str(item.get("title", "CFS evidence")),
                ),
            )
    return items


def _dashboard_actions_from_payload(value: Any) -> CfsAiDashboardActions | None:
    if not isinstance(value, dict):
        return None
    try:
        return CfsAiDashboardActions.model_validate(value)
    except Exception:
        return None


def _provider_system_prompt() -> str:
    return (
        "You are the CFS planning intelligence assistant. Answer only from the supplied CFS context. "
        "Return valid JSON only. Do not invent data. Do not expose owner names, mailing addresses, secrets, "
        "exact probabilities, raw model scores, official prediction classes, official school overcrowding claims, "
        "or database connection details. Use safe planning language. Distinguish observed permit activity from "
        "prediction. Distinguish preliminary school capacity watch from official school capacity findings. "
        "Use conversation_context only to resolve references like 'those areas' or 'that signal'; do not invent "
        "new data from it. If selected_signal is supplied, prioritize explaining that signal with evidence, "
        "why it matters, caveats, and what to inspect next. "
        "dashboard_actions are UI suggestions only and do not create official claims. Return JSON with answer, "
        "evidence, related_layers, caveats, suggested_actions, and dashboard_actions."
    )


def _post_provider_json(
    url: str,
    payload: dict[str, Any],
    headers: dict[str, str],
    content_path: list[Any],
) -> dict[str, Any] | None:
    data = json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(url, data=data, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(request, timeout=3) as response:
            provider_payload = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        if error.code == 429:
            return {"_provider_unavailable_reason": "rate_limit_quota"}
        return None
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError):
        return None

    content: Any = provider_payload
    for key in content_path:
        if isinstance(key, int) and isinstance(content, list) and len(content) > key:
            content = content[key]
        elif isinstance(key, str) and isinstance(content, dict):
            content = content.get(key)
        else:
            return None

    if not isinstance(content, str):
        return None
    try:
        parsed = json.loads(content)
    except json.JSONDecodeError:
        return None
    return parsed if isinstance(parsed, dict) else None
