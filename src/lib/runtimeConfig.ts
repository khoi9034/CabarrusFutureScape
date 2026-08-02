export type CfsRuntimeMode = "demo" | "enterprise" | "local";
export type CfsDataProvider = "enterprise_api" | "local_api" | "static";
export type CfsAuthMode = "local_dev" | "off" | "oidc";
export type CfsAiProvider = "none" | "openai";
export type CfsArtifactProvider =
  | "local_file"
  | "object_storage"
  | "public_static";
export type CfsJobProvider = "external_worker" | "inline";

export interface CfsRuntimeConfig {
  aiProvider: CfsAiProvider;
  artifactProvider: CfsArtifactProvider;
  authMode: CfsAuthMode;
  dataProvider: CfsDataProvider;
  jobProvider: CfsJobProvider;
  runtimeMode: CfsRuntimeMode;
  useBackendApi: boolean;
}

export interface CfsPublicRuntimeEnvironment {
  aiProvider?: string;
  artifactProvider?: string;
  authMode?: string;
  dataProvider?: string;
  deploymentMode?: string;
  jobProvider?: string;
  runtimeMode?: string;
  useBackendApi?: string;
}

// Canonical server variables are CFS_*; the browser receives only this safe
// NEXT_PUBLIC_CFS_* projection. Legacy aliases stay accepted during migration.
const publicEnvironment: CfsPublicRuntimeEnvironment = {
  aiProvider: process.env.NEXT_PUBLIC_CFS_AI_PROVIDER,
  artifactProvider: process.env.NEXT_PUBLIC_CFS_ARTIFACT_PROVIDER,
  authMode: process.env.NEXT_PUBLIC_CFS_AUTH_MODE,
  dataProvider: process.env.NEXT_PUBLIC_CFS_DATA_PROVIDER,
  deploymentMode: process.env.NEXT_PUBLIC_CFS_DEPLOYMENT_MODE,
  jobProvider: process.env.NEXT_PUBLIC_CFS_JOB_PROVIDER,
  runtimeMode: process.env.NEXT_PUBLIC_CFS_RUNTIME_MODE,
  useBackendApi: process.env.NEXT_PUBLIC_USE_BACKEND_API,
};

const runtimeAliases = {
  demo: "demo",
  enterprise: "enterprise",
  local: "local",
} as const;

const dataProviderAliases = {
  enterprise_api: "enterprise_api",
  enterprise_service: "enterprise_api",
  local_api: "local_api",
  local_postgis: "local_api",
  sanitized_demo_extract: "static",
  static: "static",
} as const;

const authModeAliases = {
  entra: "oidc",
  local_dev: "local_dev",
  off: "off",
  oidc: "oidc",
} as const;

const aiProviderAliases = {
  deterministic: "none",
  none: "none",
  openai: "openai",
} as const;

const artifactProviderAliases = {
  local_file: "local_file",
  object_storage: "object_storage",
  public_static: "public_static",
} as const;

const jobProviderAliases = {
  external_worker: "external_worker",
  inline: "inline",
} as const;

export function resolveRuntimeConfig(
  environment: CfsPublicRuntimeEnvironment,
): CfsRuntimeConfig {
  const runtimeMode = resolveRuntimeMode(environment);
  const legacyUseBackendApi = optionalBoolean(
    "NEXT_PUBLIC_USE_BACKEND_API",
    environment.useBackendApi,
  );
  const dataProvider = optionalAlias(
    "NEXT_PUBLIC_CFS_DATA_PROVIDER",
    environment.dataProvider,
    dataProviderAliases,
  ) ?? defaultDataProvider(runtimeMode, legacyUseBackendApi);
  const config: CfsRuntimeConfig = {
    aiProvider:
      optionalAlias(
        "NEXT_PUBLIC_CFS_AI_PROVIDER",
        environment.aiProvider,
        aiProviderAliases,
      ) ?? "none",
    artifactProvider:
      optionalAlias(
        "NEXT_PUBLIC_CFS_ARTIFACT_PROVIDER",
        environment.artifactProvider,
        artifactProviderAliases,
      ) ?? defaultArtifactProvider(runtimeMode, dataProvider),
    authMode:
      optionalAlias(
        "NEXT_PUBLIC_CFS_AUTH_MODE",
        environment.authMode,
        authModeAliases,
      ) ?? (runtimeMode === "enterprise" ? "oidc" : "off"),
    dataProvider,
    jobProvider:
      optionalAlias(
        "NEXT_PUBLIC_CFS_JOB_PROVIDER",
        environment.jobProvider,
        jobProviderAliases,
      ) ?? (runtimeMode === "enterprise" ? "external_worker" : "inline"),
    runtimeMode,
    useBackendApi: dataProvider !== "static",
  };

  validateCombination(config, legacyUseBackendApi);
  return config;
}

export const CFS_RUNTIME_CONFIG = resolveRuntimeConfig(publicEnvironment);

function resolveRuntimeMode(
  environment: CfsPublicRuntimeEnvironment,
): CfsRuntimeMode {
  const explicitMode = optionalAlias(
    "NEXT_PUBLIC_CFS_RUNTIME_MODE",
    environment.runtimeMode,
    runtimeAliases,
  );

  if (explicitMode) {
    return explicitMode;
  }

  const legacyMode = normalized(environment.deploymentMode);
  if (!legacyMode) {
    return "local";
  }
  if (legacyMode === "demo") {
    return "demo";
  }
  if (legacyMode === "live" || legacyMode === "auto") {
    return "local";
  }

  throw new Error(
    `Invalid NEXT_PUBLIC_CFS_DEPLOYMENT_MODE=${JSON.stringify(environment.deploymentMode)}. Expected demo, live, or legacy auto.`,
  );
}

function defaultDataProvider(
  runtimeMode: CfsRuntimeMode,
  legacyUseBackendApi: boolean | undefined,
): CfsDataProvider {
  if (runtimeMode === "demo") {
    return "static";
  }
  if (runtimeMode === "enterprise") {
    return "enterprise_api";
  }
  return legacyUseBackendApi === false ? "static" : "local_api";
}

function defaultArtifactProvider(
  runtimeMode: CfsRuntimeMode,
  dataProvider: CfsDataProvider,
): CfsArtifactProvider {
  if (runtimeMode === "demo" || dataProvider === "static") {
    return "public_static";
  }
  return runtimeMode === "enterprise" ? "object_storage" : "local_file";
}

function validateCombination(
  config: CfsRuntimeConfig,
  legacyUseBackendApi: boolean | undefined,
) {
  if (legacyUseBackendApi !== undefined) {
    const expected = config.dataProvider !== "static";
    if (legacyUseBackendApi !== expected) {
      throw new Error(
        "NEXT_PUBLIC_USE_BACKEND_API conflicts with NEXT_PUBLIC_CFS_DATA_PROVIDER.",
      );
    }
  }

  if (config.runtimeMode === "demo") {
    const validDemo =
      config.dataProvider === "static" &&
      config.authMode === "off" &&
      config.aiProvider === "none" &&
      config.artifactProvider === "public_static" &&
      config.jobProvider === "inline";
    if (!validDemo) {
      throw new Error(
        "Demo mode requires static data, auth off, AI none, public-static artifacts, and inline jobs.",
      );
    }
  }

  if (
    config.runtimeMode === "local" &&
    config.dataProvider === "enterprise_api"
  ) {
    throw new Error("Local mode cannot use the enterprise_api data provider.");
  }

  if (
    config.runtimeMode === "local" &&
    !["public_static", "local_file"].includes(config.artifactProvider)
  ) {
    throw new Error(
      "Local mode requires the public_static or local_file artifact provider.",
    );
  }

  if (config.runtimeMode === "local" && config.jobProvider !== "inline") {
    throw new Error("Local mode requires inline jobs.");
  }

  if (
    config.runtimeMode === "enterprise" &&
    config.dataProvider !== "enterprise_api"
  ) {
    throw new Error("Enterprise mode requires the enterprise_api data provider.");
  }

  if (config.runtimeMode === "enterprise" && config.authMode !== "oidc") {
    throw new Error("Enterprise mode requires oidc authentication.");
  }

  if (
    config.runtimeMode === "enterprise" &&
    config.artifactProvider !== "object_storage"
  ) {
    throw new Error(
      "Enterprise mode requires the object_storage artifact provider.",
    );
  }

  if (
    config.runtimeMode === "enterprise" &&
    config.jobProvider !== "external_worker"
  ) {
    throw new Error("Enterprise mode requires the external_worker job provider.");
  }
}

function optionalBoolean(name: string, value: string | undefined) {
  const candidate = normalized(value);
  if (!candidate) {
    return undefined;
  }
  if (candidate === "true") {
    return true;
  }
  if (candidate === "false") {
    return false;
  }
  throw new Error(`${name} must be true or false.`);
}

function optionalAlias<TAliases extends Record<string, string>>(
  name: string,
  value: string | undefined,
  aliases: TAliases,
): TAliases[keyof TAliases] | undefined {
  const candidate = normalized(value);
  if (!candidate) {
    return undefined;
  }
  if (candidate in aliases) {
    return aliases[candidate as keyof TAliases];
  }
  throw new Error(
    `Invalid ${name}=${JSON.stringify(value)}. Expected ${Object.keys(aliases).join(", ")}.`,
  );
}

function normalized(value: string | undefined) {
  return value?.trim().toLowerCase() || undefined;
}
