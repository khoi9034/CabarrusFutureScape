import { EntraAuthGate } from "@/components/auth/EntraAuthGate";
import { AppShell } from "@/components/layout/AppShell";
import type { CfsAppMode } from "@/types";

type HomeSearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

export default async function Home({ searchParams }: { searchParams: HomeSearchParams }) {
  const params = await searchParams;
  const appMode = firstSearchParam(params.app);
  const initialAppMode: CfsAppMode | undefined =
    appMode === "planning" || appMode === "economics" || appMode === "consulting"
      ? appMode
      : params.investmentPage
        ? "consulting"
        : undefined;
  return (
    <EntraAuthGate>
      <AppShell initialAppMode={initialAppMode} />
    </EntraAuthGate>
  );
}

function firstSearchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
