import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_BASE_URL =
  "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer";
const DEFAULT_LABELS_URL =
  "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer";
const OPTIONAL_NETWORK_ERRORS = new Set([
  "cors",
  "net::ERR_ABORTED",
  "net::ERR_FAILED",
  "net::ERR_NETWORK_ACCESS_DENIED",
]);
const AUTHENTICATION_HTTP_STATUSES = new Set([401, 403, 498, 499]);
export const REQUIRED_CFS_BASEMAP_ID = "cfs-same-origin-basemap";
export const REQUIRED_CFS_CONTEXT_LAYER_IDS = Object.freeze([
  "county-boundary",
  "cfs-local-hydrography",
  "cfs-local-municipalities",
  "transportation-context",
]);
export const REQUIRED_CFS_FALLBACK_LABEL_LAYER_ID = "cfs-local-place-labels";

export function optionalPublicMapResources({
  baseUrl = process.env.NEXT_PUBLIC_CFS_REFERENCE_BASEMAP_URL?.trim() || DEFAULT_BASE_URL,
  labelsUrl = process.env.NEXT_PUBLIC_CFS_REFERENCE_LABELS_URL?.trim() || DEFAULT_LABELS_URL,
} = {}) {
  return [
    {
      id: "cfs-public-reference-basemap",
      kind: "base",
      serviceUrl: normalizeServiceUrl(baseUrl),
      title: "Public dark-gray reference basemap",
    },
    {
      id: "cfs-public-reference-labels",
      kind: "reference",
      serviceUrl: normalizeServiceUrl(labelsUrl),
      title: "Public dark-gray reference labels",
    },
  ];
}

export function isApprovedOptionalPublicMapResource(
  value,
  resources = optionalPublicMapResources(),
) {
  const url = toUrl(value);
  if (!url) return null;
  if (
    hasAuthenticationQuery(url) ||
    !hasOnlyExpectedPublicQuery(url) ||
    url.hash ||
    url.username ||
    url.password
  ) {
    return null;
  }
  for (const resource of resources) {
    const service = new URL(resource.serviceUrl);
    if (!approvedServiceOrigins(service).has(url.origin)) continue;
    const suffix = url.pathname.slice(service.pathname.length);
    if (
      url.pathname.startsWith(service.pathname) &&
      (/^\/?$/.test(suffix) ||
        /^\/tile\/\d+\/\d+\/\d+\/?$/i.test(suffix) ||
        /^\/tilemap\/\d+\/\d+\/\d+\/\d+\/\d+\/?$/i.test(suffix))
    ) {
      return resource;
    }
  }
  return null;
}

export function isApprovedPublicArcgisRequest(
  value,
  resources = optionalPublicMapResources(),
  headers = {},
) {
  const url = toUrl(value);
  if (
    !url ||
    hasArcgisCredentialHeaders(headers) ||
    hasAuthenticationQuery(url) ||
    !hasOnlyExpectedPublicQuery(url) ||
    url.hash ||
    url.username ||
    url.password
  ) {
    return false;
  }
  if (isApprovedOptionalPublicMapResource(url, resources)) return true;
  if (url.hostname !== "static.arcgis.com") return false;
  return resources.some((resource) => {
    const serviceName = configuredServiceName(resource);
    return (
      serviceName &&
      new RegExp(`^/attribution/${escapeRegExp(serviceName)}/?$`, "i").test(url.pathname)
    );
  });
}

export function isExternalArcgisRequest(value, { apiOrigin, appOrigin } = {}) {
  const url = toUrl(value);
  return Boolean(
    url &&
      url.origin !== apiOrigin &&
      url.origin !== appOrigin &&
      (/(?:arcgis|esri)/i.test(url.hostname) ||
        /\/(?:sharing\/rest|rest\/services)(?:\/|$)|\/MapServer(?:\/|$)|\/oauth2\/|\/signin(?:\/|$)/i.test(
          url.pathname,
        )),
  );
}

export function isMapDiagnosticRequest(
  value,
  { apiOrigin, appOrigin, resources = optionalPublicMapResources() } = {},
) {
  const url = toUrl(value);
  return Boolean(
    url &&
      (url.origin === apiOrigin ||
        (url.origin === appOrigin &&
          (url.searchParams.has("_rsc") ||
            /^\/(?:api\/v1|arcgis-assets|demo-data\/map|intelligence\/parcel-search-index\.json|parcels)(?:\/|_|$)/i.test(
              url.pathname,
            ))) ||
        isApprovedPublicArcgisRequest(url, resources) ||
        isExternalArcgisRequest(url, { apiOrigin, appOrigin })),
  );
}

export function hasArcgisCredentialHeaders(headers = {}) {
  return Object.keys(headers).some((key) =>
    /^(?:authorization|proxy-authorization|api-key|x-api-key|x-esri-authorization|x-arcgis-authorization)$/i.test(
      key,
    ),
  );
}

export function redactMapDiagnosticUrl(value) {
  const url = toUrl(value);
  return url ? sanitizedUrl(url) : "invalid-url";
}

export function redactMapDiagnosticText(value) {
  return String(value)
    .replace(
      /(["']?)(api[-_]?key|access[-_]?token|refresh[-_]?token|id[-_]?token|token|client[-_]?secret|authorization|proxy-authorization|credential|password|code)\1\s*[:=]\s*"(?:\\.|[^"\\])*"/gi,
      '$1$2$1:"REDACTED"',
    )
    .replace(
      /(["']?)(api[-_]?key|access[-_]?token|refresh[-_]?token|id[-_]?token|token|client[-_]?secret|authorization|proxy-authorization|credential|password|code)\1\s*[:=]\s*'(?:\\.|[^'\\])*'/gi,
      "$1$2$1:'REDACTED'",
    )
    .replace(
      /\b(authorization|proxy-authorization)\s*[:=]\s*[^\r\n,;)}\]]+/gi,
      "$1=REDACTED",
    )
    .replace(/https?:\/\/[^\s'"<>]+/gi, (match) => {
      const suffix = /[),.;]+$/.exec(match)?.[0] ?? "";
      const url = toUrl(suffix ? match.slice(0, -suffix.length) : match);
      return `${url ? sanitizedUrl(url) : "[REDACTED URL]"}${suffix}`;
    })
    .replace(
      /\b(api[-_]?key|access[-_]?token|refresh[-_]?token|id[-_]?token|token|client[-_]?secret|authorization|proxy-authorization|credential|password|code)\s*[:=]\s*(?:bearer\s+)?([^\s,;)}\]]+)/gi,
      "$1=REDACTED",
    );
}

export function mapDiagnosticRequestKey(
  value,
  resources = optionalPublicMapResources(),
  method = "GET",
) {
  const url = toUrl(value);
  if (!url) return null;
  const optional =
    isApprovedOptionalPublicMapResource(url, resources) ??
    approvedAttributionResource(url, resources);
  const prefix = String(method).toUpperCase();
  if (optional) return `${prefix}:optional:${optional.id}`;
  if (url.searchParams.has("_rsc")) {
    const route = new URLSearchParams();
    for (const key of ["app", "investmentPage"]) {
      if (url.searchParams.has(key)) route.set(key, url.searchParams.get(key));
    }
    return `${prefix}:${url.origin}${url.pathname}:_rsc${route.size ? `?${route}` : ""}`;
  }
  if (/^\/parcels\/CFS-PARCEL-[^/]+\/?$/i.test(url.pathname)) {
    return `${prefix}:${url.origin}/parcels/:detail`;
  }
  return `${prefix}:${url.origin}${url.pathname.replace(/\/$/, "") || "/"}`;
}

export function classifyArcGISRequestFailure(
  { error = "failed", headers = {}, method = "GET", url: value },
  { apiOrigin, appOrigin, resources = optionalPublicMapResources() } = {},
) {
  const url = toUrl(value);
  if (!url) return fatal("unexpected_request_failure", "Request failure URL is invalid.", { error });
  if (hasAuthenticationQuery(url) || url.hash || url.username || url.password || hasArcgisCredentialHeaders(headers)) {
    return fatal(
      "private_arcgis_authentication_failure",
      "An ArcGIS request contained an authentication credential, header, or token query.",
      { error, method, url: sanitizedUrl(url) },
    );
  }

  const resource = isApprovedOptionalPublicMapResource(url, resources);
  const attribution = approvedAttributionResource(url, resources);
  if (
    resource &&
    String(method).toUpperCase() === "GET" &&
    OPTIONAL_NETWORK_ERRORS.has(normalizeNetworkError(error)) &&
    url.origin !== appOrigin &&
    url.origin !== apiOrigin
  ) {
    return optionalCandidate("requestfailed", resource, {
      error,
      reason: `Exact configured optional ${resource.kind} service failed with ${error}; required fallback health is pending.`,
      request_key: mapDiagnosticRequestKey(url, resources, method),
      url: sanitizedUrl(url),
    });
  }

  if (
    attribution &&
    String(method).toUpperCase() === "GET" &&
    OPTIONAL_NETWORK_ERRORS.has(normalizeNetworkError(error)) &&
    url.origin !== appOrigin &&
    url.origin !== apiOrigin
  ) {
    return optionalCandidate("requestfailed", attribution, {
      error,
      reason: `Exact optional ${attribution.kind} attribution resource failed with ${error}; required fallback health is pending.`,
      request_key: mapDiagnosticRequestKey(url, resources, method),
      url: sanitizedUrl(url),
    });
  }

  const classified = classifyRequiredOrUnexpectedUrl(url, {
    apiOrigin,
    appOrigin,
    error,
    method,
  });
  if (
    ["GET", "HEAD"].includes(String(method).toUpperCase()) &&
    normalizeNetworkError(error) === "net::ERR_ABORTED" &&
    classified.classification.startsWith("required_")
  ) {
    return {
      ...classified,
      classification: "required_request_cancellation_candidate",
      fallback_healthy: null,
      fatal: null,
      request_key: mapDiagnosticRequestKey(url, resources, method),
      required_classification: classified.classification,
      stale_lifecycle_eligible: [
        "required_arcgis_sdk_failure",
        "required_same_origin_context_failure",
      ].includes(classified.classification),
      reason: `A required idempotent request was cancelled; lifecycle or successful-replacement proof is pending (${classified.reason})`,
    };
  }
  return classified;
}

export function classifyArcGISHttpFailure(
  { headers = {}, method = "GET", status, url: value },
  { apiOrigin, appOrigin, resources = optionalPublicMapResources() } = {},
) {
  const numericStatus = Number(status);
  assert(Number.isInteger(numericStatus) && numericStatus >= 400, "HTTP failure status must be >= 400.");
  const url = toUrl(value);
  if (!url) {
    return fatal("unexpected_http_failure", "HTTP failure URL is invalid.", {
      status: numericStatus,
    });
  }
  if (
    AUTHENTICATION_HTTP_STATUSES.has(numericStatus) &&
    (isExternalArcgisRequest(url, { apiOrigin, appOrigin }) ||
      isApprovedPublicArcgisRequest(url, resources) ||
      hasArcgisCredentialHeaders(headers))
  ) {
    return fatal(
      "private_arcgis_authentication_failure",
      `An ArcGIS request returned authentication or authorization status ${numericStatus}.`,
      { method, status: numericStatus, url: sanitizedUrl(url) },
    );
  }
  const optional =
    isApprovedOptionalPublicMapResource(url, resources) ??
    approvedAttributionResource(url, resources);
  if (
    optional &&
    ["GET", "HEAD"].includes(String(method).toUpperCase()) &&
    !AUTHENTICATION_HTTP_STATUSES.has(numericStatus)
  ) {
    return optionalCandidate("response", optional, {
      error: `HTTP_${numericStatus}`,
      reason: `Exact optional ${optional.kind} service returned HTTP ${numericStatus}; required fallback health is pending.`,
      request_key: mapDiagnosticRequestKey(url, resources, method),
      status: numericStatus,
      url: sanitizedUrl(url),
    });
  }
  return {
    ...classifyArcGISRequestFailure(
      { error: `HTTP_${numericStatus}`, headers, method, url: url.href },
      { apiOrigin, appOrigin, resources },
    ),
    status: numericStatus,
  };
}

export function classifyArcGISConsoleFailure(
  { locationUrl = "", text = "" },
  { apiOrigin, appOrigin, resources = optionalPublicMapResources() } = {},
) {
  const safeText = redactMapDiagnosticText(text);
  const placeholder = /^\[CFS GIS\] (opportunity-extrusions|development-pressure|scenario-envelope): Layer definition is placeholder or disabled until an approved service URL is configured\.$/.exec(
    text,
  );
  if (placeholder) {
    return {
      classification: "expected_cfs_gis_placeholder_warning",
      event_type: "console",
      fallback_healthy: null,
      fatal: false,
      layer_id: placeholder[1],
      message: safeText,
      reason: "A known disabled CFS placeholder layer reported its intentional development readiness warning.",
    };
  }
  if (/Portal|OAuth|IdentityManager|ArcGIS organizational|sign[ -]?in|authentication|authorization|credential|\btoken\b|\b(?:401|403|498|499|Unauthorized|Forbidden)\b/i.test(text)) {
    return fatal(
      "private_arcgis_authentication_failure",
      "Unexpected ArcGIS authentication, authorization, Portal, OAuth, IdentityManager, or sign-in activity was reported.",
      { event_type: "console", message: safeText },
    );
  }
  if (/\b(?:TypeError|ReferenceError|SyntaxError|React error|Unhandled Runtime Error)\b/i.test(text)) {
    return fatal("application_console_error", "Unexpected JavaScript or React console error.", {
      event_type: "console",
      message: safeText,
    });
  }
  const layerIdentity = parseLayerIdentity(text);
  if (layerIdentity) {
    const resource = resources.find(
      (candidate) =>
        candidate.id === layerIdentity.id && candidate.title === layerIdentity.title,
    );
    if (resource) {
      return optionalCandidate("console", resource, {
        message: safeText,
        reason: `Exact approved optional ${layerIdentity.component} identity failed; no companion requestfailed event is required and fallback health is pending.`,
      });
    }
    if (layerIdentity.id === "cfs-same-origin-basemap") {
      return fatal(
        "required_same_origin_basemap_failure",
        "The active CFS same-origin basemap failed.",
        { layer_id: layerIdentity.id, layer_title: layerIdentity.title, message: safeText },
      );
    }
    return fatal(
      "unexpected_arcgis_layer_failure",
      `Unknown ${layerIdentity.component} identity ${layerIdentity.id || "(missing id)"} failed.`,
      { layer_id: layerIdentity.id, layer_title: layerIdentity.title, message: safeText },
    );
  }

  const approvedUrl = extractApprovedUrl(locationUrl, resources) ?? extractApprovedUrl(text, resources);
  const networkError = normalizeConsoleNetworkError(text);
  if (approvedUrl && networkError) {
    return classifyArcGISRequestFailure(
      { error: networkError, method: "GET", url: approvedUrl },
      { apiOrigin, appOrigin, resources },
    );
  }
  const httpStatus = Number(/(?:status(?:\s+of)?|HTTP)\s*(\d{3})/i.exec(text)?.[1]);
  if (approvedUrl && httpStatus >= 400) {
    return classifyArcGISHttpFailure(
      { method: "GET", status: httpStatus, url: approvedUrl },
      { apiOrigin, appOrigin, resources },
    );
  }

  const location = toUrl(locationUrl) ?? extractFirstUrl(text);
  if (location) {
    const urlClassification = classifyRequiredOrUnexpectedUrl(location, {
      apiOrigin,
      appOrigin,
      error: networkError ?? "console error",
      method: "GET",
    });
    if (
      urlClassification.classification !== "unexpected_request_failure" ||
      /Failed to load resource|MapServer|Portal|OAuth|IdentityManager|sign[ -]?in/i.test(text)
    ) {
      return { ...urlClassification, event_type: "console", message: safeText };
    }
  }

  if (/\b(?:TileLayer|Basemap)\b.*(?:#load|Failed)/i.test(text)) {
    return fatal(
      "unexpected_arcgis_layer_failure",
      "An ArcGIS TileLayer or Basemap failure did not match an exact approved optional identity.",
      { event_type: "console", message: safeText },
    );
  }
  return fatal("application_console_error", "Unexpected JavaScript console error or warning.", {
    event_type: "console",
    message: safeText,
  });
}

export function classifyPageError(error) {
  const message = redactMapDiagnosticText(
    error instanceof Error ? error.message : String(error),
  );
  return fatal("page_exception", "An uncaught browser page exception occurred.", {
    event_type: "pageerror",
    message,
  });
}

export function evaluateRequiredFallbackHealth(evidence = {}) {
  const reasons = [];
  for (const [key, label] of [
    ["activeMapInteractive", "active MapView is not interactive"],
    ["currentMapAuthoritative", "current MapView is not authoritative"],
    ["sameOriginBasemapReady", "cfs-same-origin-basemap is not active"],
    ["sameOriginContextReady", "required same-origin context is not ready"],
    ["requiredLayersReady", "required same-origin layers are not ready"],
  ]) {
    if (evidence[key] !== true) reasons.push(label);
  }
  if (evidence.parcelInteractionRequired && evidence.parcelInteractionReady !== true) {
    reasons.push("required parcel interaction is unavailable");
  }
  for (const [key, label] of [
    ["apiFailures", "CFS API failure"],
    ["consoleErrors", "fatal console error"],
    ["pageErrors", "page exception"],
    ["privateArcgisRequests", "private Portal/OAuth request"],
    ["requiredRequestFailures", "required request failure"],
  ]) {
    const value = evidence[key];
    if (value === undefined || value === null) reasons.push(`${label} evidence is missing`);
    else {
      const count = Array.isArray(value) ? value.length : Number(value);
      if (count !== 0) reasons.push(`${label} count is ${count}`);
    }
  }
  return { healthy: reasons.length === 0, reasons };
}

function evaluateDirectDiagnosticHealth(evidence = {}) {
  const reasons = [];
  for (const [key, label] of [
    ["apiFailures", "CFS API failure"],
    ["consoleErrors", "fatal console error"],
    ["pageErrors", "page exception"],
    ["privateArcgisRequests", "private Portal/OAuth request"],
    ["requiredRequestFailures", "required request failure"],
  ]) {
    const value = evidence[key];
    if (value === undefined || value === null) reasons.push(`${label} evidence is missing`);
    else {
      const count = Array.isArray(value) ? value.length : Number(value);
      if (count !== 0) reasons.push(`${label} count is ${count}`);
    }
  }
  return { healthy: reasons.length === 0, reasons };
}

export function resolveMapDiagnostic(candidate, { health, lifecycle = "current" } = {}) {
  if (candidate.classification === "required_request_cancellation_candidate") {
    const fallback = evaluateRequiredFallbackHealth(health);
    const direct = evaluateDirectDiagnosticHealth(health);
    const stale = ["destroyed", "stale"].includes(lifecycle);
    const acceptedTransition =
      stale && candidate.acceptance_transition_succeeded === true;
    const acceptedTeardown =
      lifecycle === "acceptance_teardown" &&
      candidate.acceptance_teardown_succeeded === true;
    const acceptedDownload = candidate.acceptance_download_succeeded === true;
    const replacementSucceeded = candidate.replacement_succeeded === true;
    const completedRequest = replacementSucceeded || acceptedDownload;
    const acceptedLifecycle =
      acceptedTransition ||
      acceptedTeardown ||
      (stale && candidate.stale_lifecycle_eligible === true);
    if ((completedRequest && direct.healthy) || (acceptedLifecycle && fallback.healthy)) {
      return {
        ...candidate,
        classification: "browser_request_cancellation",
        fallback_healthy: fallback.healthy ? true : null,
        fatal: false,
        lifecycle,
        reason: acceptedTransition
          ? "A required idempotent request was cancelled by an acceptance-owned route transition after both routes completed successfully."
          : acceptedTeardown
            ? "A required idempotent request was cancelled by an acceptance-owned teardown after the prior route and required map completed successfully."
          : acceptedDownload
            ? "A required idempotent download request was cancelled after Playwright received and verified the complete artifact."
          : stale
          ? "A required idempotent request was cancelled by a stale or acceptance-owned teardown after the required map was proven healthy."
          : "A required idempotent request was superseded by a successful replacement with no direct acceptance failure evidence.",
      };
    }
    return {
      ...candidate,
      classification: candidate.required_classification,
      fallback_healthy: fallback.healthy,
      fatal: true,
      lifecycle,
      reason: `A required request cancellation lacked safe lifecycle and replacement proof${
        (completedRequest ? direct.reasons : fallback.reasons).length
          ? `: ${(completedRequest ? direct.reasons : fallback.reasons).join("; ")}`
          : ""
      }.`,
    };
  }
  if (candidate.classification !== "optional_public_basemap_candidate") return candidate;
  const fallback = evaluateRequiredFallbackHealth(health);
  const stale = ["destroyed", "stale"].includes(lifecycle);
  if (!fallback.healthy) {
    return {
      ...candidate,
      classification: "optional_public_basemap_failure",
      fallback_healthy: false,
      fatal: true,
      lifecycle,
      reason: `Approved optional identity was observed, but required fallback health failed: ${fallback.reasons.join("; ")}.`,
    };
  }
  return {
    ...candidate,
    classification: "optional_public_basemap_failure",
    fallback_healthy: true,
    fatal: false,
    lifecycle,
    reason: stale
      ? "Late approved optional-layer failure came from a stale or destroyed map; the current required CFS map is healthy."
      : "Approved optional public enhancement failed while the current required CFS map remained healthy.",
  };
}

export function runClassificationSafetyMatrix() {
  const appOrigin = "http://127.0.0.1:3000";
  const apiOrigin = "http://127.0.0.1:8000";
  const resources = optionalPublicMapResources();
  const [base, reference] = resources;
  const healthy = {
    activeMapInteractive: true,
    apiFailures: 0,
    consoleErrors: 0,
    currentMapAuthoritative: true,
    pageErrors: 0,
    parcelInteractionReady: true,
    parcelInteractionRequired: true,
    privateArcgisRequests: 0,
    requiredLayersReady: true,
    requiredRequestFailures: 0,
    sameOriginBasemapReady: true,
    sameOriginContextReady: true,
  };
  const context = { apiOrigin, appOrigin, resources };
  assert.equal(
    isMapDiagnosticRequest(`${appOrigin}/?app=planning&_rsc=acceptance`, context),
    true,
    "Same-origin Next route-data requests must use the shared lifecycle classifier.",
  );
  assert.equal(
    isApprovedPublicArcgisRequest(`${base.serviceUrl}?apiKey=do-not-log-me`, resources),
    false,
    "Credential-bearing optional requests must never be approved.",
  );
  assert.equal(
    isApprovedPublicArcgisRequest(
      "https://static.arcgis.com/attribution/Canvas/World_Dark_Gray_Base?f=json",
      resources,
    ),
    true,
    "The exact public Canvas attribution resource must be approved.",
  );
  const request = (resource, error) =>
    classifyArcGISRequestFailure(
      { error, method: "GET", url: `${resource.serviceUrl}/tile/10/405/280` },
      context,
    );
  const layer = (resource, component = "TileLayer") =>
    classifyArcGISConsoleFailure(
      {
        text: `[@arcgis/core/layers/${component}] #load() Failed to load layer (title: '${resource.title}', id: '${resource.id}') {error: s}`,
      },
      context,
    );
  const nonfatal = [
    ["public Base TileLayer ERR_FAILED", request(base, "ERR_FAILED"), "current"],
    ["public Reference TileLayer ERR_FAILED", request(reference, "net::ERR_FAILED"), "current"],
    ["public Base ERR_NETWORK_ACCESS_DENIED", request(base, "ERR_NETWORK_ACCESS_DENIED"), "current"],
    ["public Reference ERR_NETWORK_ACCESS_DENIED", request(reference, "net::ERR_NETWORK_ACCESS_DENIED"), "current"],
    ["exact Reference TileLayer without requestfailed", layer(reference), "current"],
    ["exact Base TileLayer without requestfailed", layer(base), "current"],
    ["exact Base Basemap without requestfailed", layer(base, "Basemap"), "current"],
    [
      "exact optional HTTP 503",
      classifyArcGISHttpFailure(
        { method: "GET", status: 503, url: `${reference.serviceUrl}?f=json` },
        context,
      ),
      "current",
    ],
    [
      "exact optional HTTP 503 console",
      classifyArcGISConsoleFailure(
        {
          locationUrl: `${reference.serviceUrl}?f=json`,
          text: "Failed to load resource: the server responded with a status of 503",
        },
        context,
      ),
      "current",
    ],
    ["late exact optional error from destroyed map", layer(base), "destroyed"],
  ];
  const results = [];
  for (const [name, candidate, lifecycle] of nonfatal) {
    const result = resolveMapDiagnostic(candidate, { health: healthy, lifecycle });
    assert.equal(result.fatal, false, `${name}: ${result.reason}`);
    assert.equal(result.fallback_healthy, true, name);
    assert(result.reason, `${name} omitted a reason.`);
    results.push({ fatal: result.fatal, name, reason: result.reason });
  }
  const cancellationCandidate = classifyArcGISRequestFailure(
    { error: "ERR_ABORTED", method: "GET", url: `${apiOrigin}/parcels/search?q=test` },
    context,
  );
  const cancellation = resolveMapDiagnostic(
    { ...cancellationCandidate, replacement_succeeded: true },
    {
      health: {
        apiFailures: 0,
        consoleErrors: 0,
        pageErrors: 0,
        privateArcgisRequests: 0,
        requiredRequestFailures: 0,
      },
      lifecycle: "current",
    },
  );
  assert.equal(cancellation.fatal, false, cancellation.reason);
  results.push({
    fatal: cancellation.fatal,
    name: "idempotent CFS browser cancellation",
    reason: cancellation.reason,
  });
  const acceptedDownloadCancellation = resolveMapDiagnostic(
    {
      ...classifyArcGISRequestFailure(
        {
          error: "ERR_ABORTED",
          method: "GET",
          url: `${apiOrigin}/economics/powerbi-export/csv/economics_kpi_fact`,
        },
        context,
      ),
      acceptance_download_succeeded: true,
    },
    {
      health: {
        apiFailures: 0,
        consoleErrors: 0,
        pageErrors: 0,
        privateArcgisRequests: 0,
        requiredRequestFailures: 0,
      },
      lifecycle: "current",
    },
  );
  assert.equal(acceptedDownloadCancellation.fatal, false, acceptedDownloadCancellation.reason);
  results.push({
    fatal: acceptedDownloadCancellation.fatal,
    name: "verified acceptance-owned download cancellation",
    reason: acceptedDownloadCancellation.reason,
  });
  const transitionedApiCancellation = resolveMapDiagnostic(
    {
      ...classifyArcGISRequestFailure(
        {
          error: "ERR_ABORTED",
          method: "GET",
          url: `${apiOrigin}/api/v1/planning/snapshots`,
        },
        context,
      ),
      acceptance_transition_succeeded: true,
    },
    { health: healthy, lifecycle: "stale" },
  );
  assert.equal(transitionedApiCancellation.fatal, false, transitionedApiCancellation.reason);
  results.push({
    fatal: transitionedApiCancellation.fatal,
    name: "idempotent API cancellation during accepted route transition",
    reason: transitionedApiCancellation.reason,
  });
  const acceptedTeardownCancellation = resolveMapDiagnostic(
    {
      ...classifyArcGISRequestFailure(
        {
          error: "ERR_ABORTED",
          method: "GET",
          url: `${apiOrigin}/development/statistics`,
        },
        context,
      ),
      acceptance_teardown_succeeded: true,
    },
    { health: healthy, lifecycle: "acceptance_teardown" },
  );
  assert.equal(acceptedTeardownCancellation.fatal, false, acceptedTeardownCancellation.reason);
  results.push({
    fatal: acceptedTeardownCancellation.fatal,
    name: "idempotent API cancellation during accepted harness teardown",
    reason: acceptedTeardownCancellation.reason,
  });
  const acceptedRouteDataTeardown = resolveMapDiagnostic(
    {
      ...classifyArcGISRequestFailure(
        {
          error: "ERR_ABORTED",
          method: "GET",
          url: `${appOrigin}/?app=planning&_rsc=acceptance`,
        },
        context,
      ),
      acceptance_teardown_succeeded: true,
    },
    { health: healthy, lifecycle: "acceptance_teardown" },
  );
  assert.equal(acceptedRouteDataTeardown.fatal, false, acceptedRouteDataTeardown.reason);
  results.push({
    fatal: acceptedRouteDataTeardown.fatal,
    name: "same-origin route-data cancellation during accepted harness teardown",
    reason: acceptedRouteDataTeardown.reason,
  });
  const staleContextCancellation = resolveMapDiagnostic(
    classifyArcGISRequestFailure(
      {
        error: "ERR_ABORTED",
        method: "GET",
        url: `${appOrigin}/demo-data/map_layers/demo_transportation_context.geojson`,
      },
      context,
    ),
    { health: healthy, lifecycle: "stale" },
  );
  assert.equal(staleContextCancellation.fatal, false, staleContextCancellation.reason);
  results.push({
    fatal: staleContextCancellation.fatal,
    name: "stale same-origin context cancellation",
    reason: staleContextCancellation.reason,
  });
  const placeholder = classifyArcGISConsoleFailure(
    {
      text: "[CFS GIS] scenario-envelope: Layer definition is placeholder or disabled until an approved service URL is configured.",
    },
    context,
  );
  assert.equal(placeholder.fatal, false, placeholder.reason);
  results.push({
    fatal: placeholder.fatal,
    name: "known disabled CFS placeholder warning",
    reason: placeholder.reason,
  });

  const fatalCases = [
    [
      "cfs-same-origin-basemap failure",
      () =>
        classifyArcGISConsoleFailure(
          {
            text: "[@arcgis/core/layers/TileLayer] #load() Failed to load layer (title: 'CFS same-origin basemap', id: 'cfs-same-origin-basemap') {error: s}",
          },
          context,
        ),
    ],
    ["required same-origin context failure", () => classifyArcGISRequestFailure({ error: "net::ERR_FAILED", method: "GET", url: `${appOrigin}/demo-data/map_layers/demo_transportation_context.geojson` }, context)],
    ["ArcGIS SDK asset failure", () => classifyArcGISRequestFailure({ error: "net::ERR_FAILED", method: "GET", url: `${appOrigin}/arcgis-assets/5.0.19/esri/core/workers/RemoteClient.js` }, context)],
    ["parcel API failure", () => classifyArcGISRequestFailure({ error: "net::ERR_FAILED", method: "GET", url: `${apiOrigin}/parcels/search?q=test` }, context)],
    ["CFS api/v1 failure", () => classifyArcGISRequestFailure({ error: "net::ERR_FAILED", method: "GET", url: `${apiOrigin}/api/v1/planning/snapshots` }, context)],
    ["mutating CFS request cancellation", () => classifyArcGISRequestFailure({ error: "net::ERR_ABORTED", method: "POST", url: `${apiOrigin}/api/v1/planning/snapshots` }, context)],
    ["active SDK cancellation", () => resolveMapDiagnostic(classifyArcGISRequestFailure({ error: "ERR_ABORTED", method: "GET", url: `${appOrigin}/arcgis-assets/5.0.19/esri/core/workers/RemoteClient.js` }, context), { health: healthy, lifecycle: "current" })],
    ["active context cancellation", () => resolveMapDiagnostic(classifyArcGISRequestFailure({ error: "ERR_ABORTED", method: "GET", url: `${appOrigin}/demo-data/map_layers/demo_transportation_context.geojson` }, context), { health: healthy, lifecycle: "current" })],
    ["active parcel cancellation", () => resolveMapDiagnostic(classifyArcGISRequestFailure({ error: "ERR_ABORTED", method: "GET", url: `${apiOrigin}/parcels/search?q=test` }, context), { health: healthy, lifecycle: "current" })],
    ["active api/v1 cancellation", () => resolveMapDiagnostic(classifyArcGISRequestFailure({ error: "ERR_ABORTED", method: "GET", url: `${apiOrigin}/api/v1/planning/snapshots` }, context), { health: healthy, lifecycle: "current" })],
    ["active same-origin route-data cancellation", () => resolveMapDiagnostic(classifyArcGISRequestFailure({ error: "ERR_ABORTED", method: "GET", url: `${appOrigin}/?app=planning&_rsc=acceptance` }, context), { health: healthy, lifecycle: "current" })],
    ["same-origin route-data ERR_FAILED", () => classifyArcGISRequestFailure({ error: "ERR_FAILED", method: "GET", url: `${appOrigin}/?app=planning&_rsc=acceptance` }, context)],
    ["current cancellation cannot use a transition flag", () => resolveMapDiagnostic({ ...classifyArcGISRequestFailure({ error: "ERR_ABORTED", method: "GET", url: `${apiOrigin}/api/v1/planning/snapshots` }, context), acceptance_transition_succeeded: true }, { health: healthy, lifecycle: "current" })],
    ["unmarked acceptance teardown remains fatal", () => resolveMapDiagnostic(classifyArcGISRequestFailure({ error: "ERR_ABORTED", method: "GET", url: `${apiOrigin}/development/statistics` }, context), { health: healthy, lifecycle: "acceptance_teardown" })],
    ["stale parcel cancellation without replacement", () => resolveMapDiagnostic(classifyArcGISRequestFailure({ error: "ERR_ABORTED", method: "GET", url: `${apiOrigin}/parcels/search?q=test` }, context), { health: healthy, lifecycle: "stale" })],
    ["stale api/v1 cancellation without replacement", () => resolveMapDiagnostic(classifyArcGISRequestFailure({ error: "ERR_ABORTED", method: "GET", url: `${apiOrigin}/api/v1/planning/snapshots` }, context), { health: healthy, lifecycle: "stale" })],
    ["stale cancellation with unhealthy fallback", () => resolveMapDiagnostic(classifyArcGISRequestFailure({ error: "ERR_ABORTED", method: "GET", url: `${appOrigin}/demo-data/map_layers/demo_transportation_context.geojson` }, context), { health: { ...healthy, sameOriginContextReady: false }, lifecycle: "stale" })],
    ["unknown TileLayer", () => classifyArcGISConsoleFailure({ text: "[@arcgis/core/layers/TileLayer] #load() Failed to load layer (title: 'World imagery', id: 'unexpected-imagery') {error: s}" }, context)],
    ["unknown Basemap", () => classifyArcGISConsoleFailure({ text: "[@arcgis/core/Basemap] #load() Failed to load basemap (title: 'Unknown basemap', id: 'unknown-basemap') {error: s}" }, context)],
    ["exact optional ID with wrong title", () => classifyArcGISConsoleFailure({ text: `[@arcgis/core/layers/TileLayer] #load() Failed to load layer (title: 'Wrong title', id: '${base.id}') {error: s}` }, context)],
    ["exact optional title with wrong ID", () => classifyArcGISConsoleFailure({ text: `[@arcgis/core/layers/TileLayer] #load() Failed to load layer (title: '${base.title}', id: 'wrong-id') {error: s}` }, context)],
    ["unexpected Esri MapServer", () => classifyArcGISRequestFailure({ error: "net::ERR_FAILED", method: "GET", url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer?f=json" }, context)],
    ["private Portal item", () => classifyArcGISRequestFailure({ error: "net::ERR_FAILED", method: "GET", url: "https://www.arcgis.com/sharing/rest/content/items/private-item?f=json" }, context)],
    ["OAuth/sign-in", () => classifyArcGISRequestFailure({ error: "net::ERR_FAILED", method: "GET", url: "https://www.arcgis.com/sharing/rest/oauth2/authorize" }, context)],
    ["public service with API key", () => classifyArcGISRequestFailure({ error: "ERR_FAILED", method: "GET", url: `${base.serviceUrl}?apiKey=do-not-log-me` }, context)],
    ["public service with authorization header", () => classifyArcGISRequestFailure({ error: "ERR_FAILED", headers: { Authorization: "Bearer do-not-log-me" }, method: "GET", url: base.serviceUrl }, context)],
    ["authorization console secret redaction", () => classifyArcGISConsoleFailure({ text: "Authorization: Bearer do-not-log-me" }, context)],
    ["basic authorization console secret redaction", () => classifyArcGISConsoleFailure({ text: "Authorization: Basic do-not-log-me" }, context)],
    ["quoted JSON console secret redaction", () => classifyArcGISConsoleFailure({ text: '{"token":"do-not-log-me","Authorization":"Bearer do-not-log-me"}' }, context)],
    ["request error secret redaction", () => classifyArcGISRequestFailure({ error: '{"token":"do-not-log-me"}', method: "GET", url: `${appOrigin}/required-resource.js` }, context)],
    ["quoted credential with apostrophe redaction", () => classifyArcGISConsoleFailure({ text: '{"credential":"abc\'do-not-log-me"}' }, context)],
    ["quoted credential with escaped delimiter redaction", () => classifyArcGISConsoleFailure({ text: String.raw`{"token":"abc\"do-not-log-me"}` }, context)],
    ["attribution resource with credential", () => classifyArcGISRequestFailure({ error: "ERR_FAILED", method: "GET", url: "https://user:do-not-log-me@static.arcgis.com/attribution/Canvas/World_Dark_Gray_Base?f=json" }, context)],
    ["attribution resource with arbitrary query", () => classifyArcGISRequestFailure({ error: "ERR_FAILED", method: "GET", url: "https://static.arcgis.com/attribution/Canvas/World_Dark_Gray_Base?callback=do-not-log-me" }, context)],
    ["optional service fragment credential", () => classifyArcGISRequestFailure({ error: "ERR_FAILED", method: "GET", url: `${base.serviceUrl}#access_token=do-not-log-me` }, context)],
    ["optional ArcGIS HTTP 403", () => classifyArcGISHttpFailure({ method: "GET", status: 403, url: base.serviceUrl }, context)],
    ["same-origin SDK HTTP 404", () => classifyArcGISHttpFailure({ method: "GET", status: 404, url: `${appOrigin}/arcgis-assets/5.0.19/missing.js` }, context)],
    ["same-origin Demo parcel index HTTP 404", () => classifyArcGISHttpFailure({ method: "GET", status: 404, url: `${appOrigin}/intelligence/parcel-search-index.json` }, context)],
    ["custom-host ArcGIS MapServer", () => classifyArcGISRequestFailure({ error: "ERR_FAILED", method: "GET", url: "https://gis.example.gov/rest/services/private/MapServer?f=json" }, context)],
    ["exact optional identity with token-required error", () => classifyArcGISConsoleFailure({ text: `[@arcgis/core/layers/TileLayer] #load() Failed to load layer (title: '${base.title}', id: '${base.id}') {error: token required}` }, context)],
    ["arbitrary JavaScript console error", () => classifyArcGISConsoleFailure({ text: "TypeError: cannot read properties of undefined" }, context)],
    ["exact optional identity with authorization error", () => classifyArcGISConsoleFailure({ text: `[@arcgis/core/layers/TileLayer] #load() Failed to load layer (title: '${base.title}', id: '${base.id}') {error: 403 Forbidden}` }, context)],
    ["page exception", () => classifyPageError(new Error("page exploded"))],
    ["OAuth console secret redaction", () => classifyArcGISConsoleFailure({ text: "OAuth failed https://gis.example.gov/oauth2/authorize?client_id=do-not-log-me&code=do-not-log-me" }, context)],
    [
      "active map has no required fallback",
      () => resolveMapDiagnostic(layer(base), { health: { ...healthy, sameOriginContextReady: false } }),
    ],
    [
      "active map has no parcel interaction",
      () => resolveMapDiagnostic(layer(base), { health: { ...healthy, parcelInteractionReady: false } }),
    ],
    [
      "active map has fatal console evidence",
      () => resolveMapDiagnostic(layer(base), { health: { ...healthy, consoleErrors: 1 } }),
    ],
  ];
  for (const [name, classify] of fatalCases) {
    const result = classify();
    assert.equal(result.fatal, true, `${name}: ${result.reason}`);
    assert(result.reason, `${name} omitted a reason.`);
    assert(!JSON.stringify(result).includes("do-not-log-me"), `${name} leaked a credential.`);
    results.push({ fatal: result.fatal, name, reason: result.reason });
  }
  return results;
}

function classifyRequiredOrUnexpectedUrl(url, { apiOrigin, appOrigin, error, method }) {
  const details = { error, method, url: sanitizedUrl(url) };
  if (isPrivateArcgisAuthUrl(url)) {
    return fatal(
      "private_arcgis_authentication_failure",
      "Private Portal item, OAuth, or sign-in request failed.",
      details,
    );
  }
  if (url.origin === apiOrigin && /^\/api\/v1(?:\/|$)/i.test(url.pathname)) {
    return fatal("required_cfs_api_failure", "Required CFS /api/v1 request failed.", details);
  }
  if (
    [apiOrigin, appOrigin].includes(url.origin) &&
    /^\/parcels(?:\/|$)/i.test(url.pathname)
  ) {
    return fatal("required_parcel_api_failure", "Required parcel API request failed.", details);
  }
  if (url.origin === appOrigin && /^\/arcgis-assets(?:\/|$)/i.test(url.pathname)) {
    return fatal("required_arcgis_sdk_failure", "Required same-origin ArcGIS SDK asset failed.", details);
  }
  if (url.origin === appOrigin && /^\/demo-data\/map(?:_|\/)/i.test(url.pathname)) {
    return fatal(
      "required_same_origin_context_failure",
      "Required same-origin Cabarrus map context failed.",
      details,
    );
  }
  if (url.origin === apiOrigin) {
    return fatal("required_cfs_api_failure", "Required CFS API request failed.", details);
  }
  if (url.origin === appOrigin) {
    return fatal(
      "required_same_origin_request_failure",
      "A required same-origin application request failed.",
      details,
    );
  }
  if (/\/MapServer(?:\/|$)/i.test(url.pathname)) {
    return fatal(
      "unexpected_arcgis_service_failure",
      "An unapproved ArcGIS MapServer request failed.",
      details,
    );
  }
  return fatal("unexpected_request_failure", "An unapproved request failed.", details);
}

function isPrivateArcgisAuthUrl(url) {
  return /\/sharing\/rest\/(?:content\/items|oauth2)|\/oauth2\/|\/signin(?:\/|$)/i.test(
    url.pathname,
  );
}

function optionalCandidate(eventType, resource, details) {
  return {
    ...sanitizeDiagnosticDetails(details),
    classification: "optional_public_basemap_candidate",
    event_type: eventType,
    fallback_healthy: null,
    fatal: null,
    layer_id: resource.id,
    layer_title: resource.title,
    resource_kind: resource.kind,
    service_url: resource.serviceUrl,
  };
}

function fatal(classification, reason, details = {}) {
  return {
    ...sanitizeDiagnosticDetails(details),
    classification,
    fallback_healthy: false,
    fatal: true,
    reason: redactMapDiagnosticText(reason),
  };
}

function sanitizeDiagnosticDetails(details) {
  return Object.fromEntries(
    Object.entries(details).map(([key, value]) => [
      key,
      typeof value === "string" ? redactMapDiagnosticText(value) : value,
    ]),
  );
}

function parseLayerIdentity(text) {
  const match = /\[@arcgis\/core\/(?:layers\/)?(TileLayer|Basemap)\]\s*#load\(\)\s*Failed[^\n]*?\(title:\s*['"]([^'"]+)['"],\s*id:\s*['"]([^'"]+)['"]\)/i.exec(
    text,
  );
  if (!match) return null;
  return {
    component: match[1],
    id: match[3],
    title: match[2],
  };
}

function extractApprovedUrl(value, resources) {
  const direct = toUrl(value);
  if (
    direct &&
    (isApprovedOptionalPublicMapResource(direct, resources) ||
      approvedAttributionResource(direct, resources))
  ) {
    return direct;
  }
  const extracted = extractFirstUrl(value);
  return extracted &&
    (isApprovedOptionalPublicMapResource(extracted, resources) ||
      approvedAttributionResource(extracted, resources))
    ? extracted
    : null;
}

function approvedAttributionResource(value, resources) {
  const url = toUrl(value);
  if (
    !url ||
    url.hostname !== "static.arcgis.com" ||
    url.hash ||
    url.username ||
    url.password ||
    hasAuthenticationQuery(url) ||
    !hasOnlyExpectedPublicQuery(url)
  ) {
    return null;
  }
  return (
    resources.find((resource) => {
      const serviceName = configuredServiceName(resource);
      return (
        serviceName &&
        new RegExp(`^/attribution/${escapeRegExp(serviceName)}/?$`, "i").test(url.pathname)
      );
    }) ?? null
  );
}

function configuredServiceName(resource) {
  return new URL(resource.serviceUrl).pathname.match(
    /\/services\/(.+)\/MapServer$/i,
  )?.[1];
}

function extractFirstUrl(value) {
  const match = String(value).match(/https:\/\/[^\s'"<>]+/i);
  return match ? toUrl(match[0].replace(/[),.;]+$/, "")) : null;
}

function normalizeConsoleNetworkError(text) {
  const match = /net::(ERR_ABORTED|ERR_FAILED|ERR_NETWORK_ACCESS_DENIED)/i.exec(text);
  if (match) return `net::${match[1].toUpperCase()}`;
  return /blocked by CORS/i.test(text) ? "cors" : null;
}

function normalizeNetworkError(value) {
  if (/blocked by CORS/i.test(value)) return "cors";
  if (/^cors$/i.test(value)) return "cors";
  const upper = String(value).toUpperCase();
  if (/^(?:NET::)?ERR_(?:FAILED|NETWORK_ACCESS_DENIED|ABORTED)$/.test(upper)) {
    return `net::${upper.replace(/^NET::/, "")}`;
  }
  return String(value);
}

function normalizeServiceUrl(value) {
  const url = new URL(value);
  if (url.username || url.password || hasAuthenticationQuery(url)) {
    throw new Error("Optional public ArcGIS service configuration must not contain credentials.");
  }
  if (url.search || url.hash) {
    throw new Error("Optional public ArcGIS service configuration must be a query-free MapServer URL.");
  }
  url.hash = "";
  url.search = "";
  url.pathname = url.pathname.replace(/\/+$/, "");
  return url.href.replace(/\/$/, "");
}

function approvedServiceOrigins(service) {
  const origins = new Set([service.origin]);
  if (["server.arcgisonline.com", "services.arcgisonline.com"].includes(service.hostname)) {
    for (const hostname of ["server.arcgisonline.com", "services.arcgisonline.com"]) {
      const alias = new URL(service.origin);
      alias.hostname = hostname;
      origins.add(alias.origin);
    }
  }
  return origins;
}

function hasAuthenticationQuery(url) {
  return [...url.searchParams.keys()].some((key) =>
    /^(?:api[-_]?key|access[-_]?token|token|auth|authorization)$/i.test(key),
  );
}

function hasOnlyExpectedPublicQuery(url) {
  return [...url.searchParams.entries()].every(
    ([key, value]) => key.toLowerCase() === "f" && /^(?:json|pjson)$/i.test(value),
  );
}

function sanitizedUrl(url) {
  const copy = new URL(url);
  if (copy.username) copy.username = "REDACTED";
  if (copy.password) copy.password = "REDACTED";
  for (const key of [...copy.searchParams.keys()]) {
    copy.searchParams.set(key, "REDACTED");
  }
  if (copy.hash) copy.hash = "#REDACTED";
  return copy.href;
}

function toUrl(value) {
  try {
    return value instanceof URL ? value : new URL(value);
  } catch {
    return null;
  }
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const results = runClassificationSafetyMatrix();
  assert.equal(results.length, 64, "The ArcGIS classification safety matrix lost a required case.");
  for (const result of results) {
    console.log(`PASS ${result.fatal ? "fatal" : "nonfatal"}: ${result.name} - ${result.reason}`);
  }
  console.log(`PASS ArcGIS acceptance classification safety matrix (${results.length}/64)`);
}
