import { redirect } from "next/navigation";
import { EntraAuthGate } from "@/components/auth/EntraAuthGate";
import { AppShell } from "@/components/layout/AppShell";
import type { CfsAppMode } from "@/types";

type HomeSearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

export default async function Home({ searchParams }: { searchParams: HomeSearchParams }) {
  const params = await searchParams;
  const appMode = firstSearchParam(params.app);

  if (
    appMode === "consulting" ||
    appMode === "ask-cfs" ||
    [
      "investmentPage",
      "consultingPage",
      "caseStudy",
      "caseStep",
      "casePanel",
      "caseItem",
    ].some((key) => params[key] !== undefined)
  ) {
    redirect("/");
  }

  const initialAppMode: CfsAppMode | undefined =
    appMode === "planning" ||
    appMode === "economics" ||
    appMode === "master-data"
      ? appMode
      : undefined;

  if (!initialAppMode && params.app !== undefined) {
    redirect("/");
  }

  return (
    <EntraAuthGate>
      <AppShell initialAppMode={initialAppMode} />
    </EntraAuthGate>
  );
}

function firstSearchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
