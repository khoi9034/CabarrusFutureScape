"use client";

import {
  InteractionRequiredAuthError,
  PublicClientApplication,
  type AccountInfo,
} from "@azure/msal-browser";
import { useEffect, useLayoutEffect, useMemo, useState, type ReactNode } from "react";
import { CFS_API_BASE_URL } from "@/lib/api/client";
import {
  CFS_ENTRA_API_SCOPE,
  entraAuthEnabled,
  entraConfigComplete,
  msalConfig,
} from "@/lib/auth/entra";
import { isCfsApiUrl } from "@/lib/auth/requestBoundary.mjs";
import { ProductPrincipalProvider } from "@/hooks/useProductPrincipal";

type AuthStatus = "checking" | "ready" | "signed-out" | "config-missing";

export function EntraAuthGate({ children }: { children: ReactNode }) {
  const authEnabled = entraAuthEnabled();
  const [account, setAccount] = useState<AccountInfo | null>(null);
  const [status, setStatus] = useState<AuthStatus>(
    !authEnabled ? "ready" : entraConfigComplete() ? "checking" : "config-missing",
  );
  const [message, setMessage] = useState("");
  const msal = useMemo(
    () =>
      authEnabled && entraConfigComplete() && typeof window !== "undefined"
        ? new PublicClientApplication(msalConfig(window.location.origin))
        : null,
    [authEnabled],
  );

  useEffect(() => {
    if (!authEnabled || !msal || !entraConfigComplete()) return;

    let cancelled = false;
    msal
      .initialize()
      .then(() => msal.handleRedirectPromise())
      .then(() => {
        if (cancelled) return;
        const existing = msal.getAllAccounts()[0] ?? null;
        setAccount(existing);
        setStatus(existing ? "ready" : "signed-out");
      })
      .catch(() => {
        if (!cancelled) setStatus("signed-out");
      });
    return () => {
      cancelled = true;
    };
  }, [authEnabled, msal]);

  useLayoutEffect(() => {
    if (!authEnabled || !msal || !account || !entraConfigComplete()) return;

    const originalFetch = window.fetch.bind(window);
    window.fetch = async (input, init = {}) => {
      const url = requestUrl(input);
      if (!url || !isCfsApiUrl(url, CFS_API_BASE_URL)) {
        return originalFetch(input, init);
      }

      const first = await originalFetch(
        input,
        await withBearer(init, () => token(msal, account, false)),
      );
      if (first.status !== 401) return first;
      return originalFetch(
        input,
        await withBearer(init, () => token(msal, account, true)),
      );
    };
    return () => {
      window.fetch = originalFetch;
    };
  }, [account, authEnabled, msal]);

  if (!authEnabled || status === "ready") {
    return (
      <ProductPrincipalProvider>
        {authEnabled && account ? <AccountBar account={account} onSignOut={() => msal?.logoutPopup()} /> : null}
        {children}
      </ProductPrincipalProvider>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#060b12] px-4 text-slate-100">
      <section className="w-full max-w-md rounded-md border border-slate-700 bg-slate-950 p-5 shadow-xl">
        <h1 className="text-lg font-semibold">Cabarrus FutureScape staging</h1>
        <p className="mt-2 text-sm text-slate-300">
          {status === "config-missing"
            ? "Vercel Preview is missing the Microsoft Entra configuration."
            : "Sign in with an authorized Microsoft Entra account to continue."}
        </p>
        {message ? <p className="mt-3 text-sm text-amber-200">{message}</p> : null}
        {status !== "config-missing" ? (
          <button
            className="mt-4 rounded-md bg-emerald-400 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-300"
            type="button"
            onClick={() => signIn(msal, setAccount, setStatus, setMessage)}
          >
            Sign in
          </button>
        ) : null}
      </section>
    </main>
  );
}

function AccountBar({
  account,
  onSignOut,
}: {
  account: AccountInfo;
  onSignOut: () => void;
}) {
  return (
    <div className="fixed right-3 top-3 z-[1000] flex items-center gap-2 rounded-md border border-slate-700 bg-slate-950/95 px-3 py-2 text-xs text-slate-200 shadow-lg">
      <span>{account.name || account.username || "Authorized account"}</span>
      <button className="text-emerald-200 hover:text-emerald-100" type="button" onClick={onSignOut}>
        Sign out
      </button>
    </div>
  );
}

async function signIn(
  msal: PublicClientApplication | null,
  setAccount: (account: AccountInfo) => void,
  setStatus: (status: AuthStatus) => void,
  setMessage: (message: string) => void,
) {
  if (!msal) return;
  try {
    const result = await msal.loginPopup({ scopes: [CFS_ENTRA_API_SCOPE] });
    setAccount(result.account);
    setStatus("ready");
    setMessage("");
  } catch {
    setMessage("Sign-in was cancelled or failed. Try again.");
  }
}

async function token(
  msal: PublicClientApplication,
  account: AccountInfo,
  forceRefresh: boolean,
) {
  try {
    return (
      await msal.acquireTokenSilent({
        account,
        forceRefresh,
        scopes: [CFS_ENTRA_API_SCOPE],
      })
    ).accessToken;
  } catch (error) {
    if (error instanceof InteractionRequiredAuthError) {
      return (await msal.acquireTokenPopup({ account, scopes: [CFS_ENTRA_API_SCOPE] })).accessToken;
    }
    throw error;
  }
}

async function withBearer(init: RequestInit, getToken: () => Promise<string>) {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${await getToken()}`);
  return { ...init, headers };
}

function requestUrl(input: RequestInfo | URL) {
  try {
    if (typeof input === "string" || input instanceof URL) return new URL(input);
    return new URL(input.url);
  } catch {
    return null;
  }
}
