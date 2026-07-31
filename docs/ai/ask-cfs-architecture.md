# Ask CFS Architecture

## Shared system

Planning and Economics use one `AskCfsPanel`, one TypeScript client, one
`POST /ai/search` contract, and one backend service. Product mode, current
filters, selected parcel/signal, active layers, and scenario scope select the
domain-specific deterministic answer path. The UI never sends the entire
application state.

Conversation memory is limited to five compact turns containing the user
question, answer summary, focused domain, related layers, and UI actions.
Changing product, parcel, scenario, project, or selected signal clears stale
memory. Private owner/contact fields are removed at the API boundary.

## Response contract

Responses provide:

- direct `answer` and `executive_summary`
- `key_findings`, structured `evidence`, and `interpretation`
- `limitations` and `official_data_still_needed`
- `recommended_next_actions` and follow-up questions
- answer/provider/fallback mode
- prompt version, request ID, latency, and provenance

Evidence supports source, source type, value/unit, as-of date, status, caveat,
geography, and methodology. Missing metadata remains blank; citations are never
invented.

## Deterministic baseline

`CFS_AI_ENABLED=false` and `CFS_AI_PROVIDER=none` is the normal grounded mode,
not an emergency fallback. It works without internet or a key. Routing covers
Planning, Economics, methodology, data readiness, selected signals, scenarios,
and Power BI guidance.

## Optional provider

An OpenAI provider is optional and backend-only. The deterministic answer is
built first. Provider timeout, quota/rate limit, network failure, invalid JSON,
or sparse output returns the deterministic answer with `fallback_used=true`.
The provider never receives credentials, owner/contact fields, or unlimited
conversation history.

## Prompt registry

`backend/app/ai/prompt_registry.py` owns the version, global safety rules,
Planning rules, Economics rules, provider prompt, and adversarial-query
classification. Long provider instructions do not live in UI components or
routers.
