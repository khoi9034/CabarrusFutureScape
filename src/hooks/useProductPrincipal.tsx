"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { IS_DEMO_MODE } from "@/lib/api/client";
import {
  getProductPrincipal,
  toProductApiError,
} from "@/lib/product/apiClient";
import type {
  ProductPermission,
  ProductPrincipal,
} from "@/lib/product/types";

type ProductPrincipalStatus = "demo" | "error" | "loading" | "ready";

interface ProductPrincipalContextValue {
  can: (permission: ProductPermission) => boolean;
  error: string | null;
  principal: ProductPrincipal | null;
  reload: () => void;
  requestId: string | null;
  status: ProductPrincipalStatus;
}

const ProductPrincipalContext = createContext<ProductPrincipalContextValue | null>(null);
const DEMO_PRINCIPAL: ProductPrincipal = {
  authenticated: false,
  organization_id: null,
  permissions: ["ask_cfs:use", "data:read", "reports:read", "sources:read"],
  roles: ["Viewer"],
  subject: "demo-session",
  user_id: null,
};

export function ProductPrincipalProvider({ children }: { children: ReactNode }) {
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [principal, setPrincipal] = useState<ProductPrincipal | null>(
    IS_DEMO_MODE ? DEMO_PRINCIPAL : null,
  );
  const [requestId, setRequestId] = useState<string | null>(null);
  const [status, setStatus] = useState<ProductPrincipalStatus>(
    IS_DEMO_MODE ? "demo" : "loading",
  );

  useEffect(() => {
    if (IS_DEMO_MODE) return;
    const controller = new AbortController();
    void getProductPrincipal({ signal: controller.signal })
      .then((result) => {
        if (controller.signal.aborted) return;
        setPrincipal(result.data);
        setRequestId(result.requestId);
        setStatus("ready");
      })
      .catch((caught: unknown) => {
        if (controller.signal.aborted) return;
        const productError = toProductApiError(caught);
        setPrincipal(null);
        setRequestId(productError.requestId);
        setError(productError.displayMessage);
        setStatus("error");
      });
    return () => controller.abort();
  }, [attempt]);

  const reload = useCallback(() => {
    setStatus("loading");
    setError(null);
    setAttempt((current) => current + 1);
  }, []);
  const value = useMemo<ProductPrincipalContextValue>(
    () => ({
      can: (permission) => Boolean(principal?.permissions.includes(permission)),
      error,
      principal,
      reload,
      requestId,
      status,
    }),
    [error, principal, reload, requestId, status],
  );

  return (
    <ProductPrincipalContext.Provider value={value}>
      {children}
    </ProductPrincipalContext.Provider>
  );
}

export function useProductPrincipal() {
  const context = useContext(ProductPrincipalContext);
  if (!context) {
    throw new Error("useProductPrincipal must be used inside ProductPrincipalProvider.");
  }
  return context;
}
