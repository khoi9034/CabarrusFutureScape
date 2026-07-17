import type { Configuration } from "@azure/msal-browser";

export const CFS_AUTH_MODE = process.env.NEXT_PUBLIC_CFS_AUTH_MODE ?? "off";
export const CFS_ENTRA_TENANT_ID =
  process.env.NEXT_PUBLIC_CFS_ENTRA_TENANT_ID ?? "";
export const CFS_ENTRA_CLIENT_ID =
  process.env.NEXT_PUBLIC_CFS_ENTRA_CLIENT_ID ?? "";
export const CFS_ENTRA_API_SCOPE =
  process.env.NEXT_PUBLIC_CFS_ENTRA_API_SCOPE ?? "";

export function entraAuthEnabled() {
  return CFS_AUTH_MODE === "entra";
}

export function entraConfigComplete() {
  return Boolean(CFS_ENTRA_TENANT_ID && CFS_ENTRA_CLIENT_ID && CFS_ENTRA_API_SCOPE);
}

export function msalConfig(redirectUri: string): Configuration {
  return {
    auth: {
      authority: `https://login.microsoftonline.com/${CFS_ENTRA_TENANT_ID}`,
      clientId: CFS_ENTRA_CLIENT_ID,
      redirectUri,
    },
    cache: {
      cacheLocation: "sessionStorage",
    },
  };
}
