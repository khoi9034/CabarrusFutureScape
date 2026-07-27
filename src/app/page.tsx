import { redirect } from "next/navigation";
import { EntraAuthGate } from "@/components/auth/EntraAuthGate";
import type { InitialCaseStudyUrlState } from "@/components/investment/InvestmentCaseStudies";
import type { InvestmentPageId } from "@/components/investment/InvestmentShell";
import { AppShell } from "@/components/layout/AppShell";
import type { CfsAppMode } from "@/types";

type HomeSearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

export default async function Home({ searchParams }: { searchParams: HomeSearchParams }) {
  const params = await searchParams;
  const appMode = firstSearchParam(params.app);
  const initialAppMode: CfsAppMode | undefined =
    appMode === "planning" || appMode === "economics" || appMode === "consulting"
      ? appMode
      : undefined;
  const investmentPage = firstSearchParam(params.investmentPage);
  const caseStudy = firstSearchParam(params.caseStudy);
  const initialInvestmentPage: InvestmentPageId | undefined =
    initialAppMode === "consulting"
      ? isInvestmentPageId(investmentPage)
        ? investmentPage
        : caseStudy
          ? "engagements"
          : undefined
      : undefined;
  const initialCaseStudyUrlState: InitialCaseStudyUrlState | undefined =
    initialAppMode === "consulting"
      ? {
          item: firstSearchParam(params.caseItem) ?? null,
          panel: firstSearchParam(params.casePanel) ?? null,
          slug: caseStudy ?? null,
          step: firstSearchParam(params.caseStep) ?? null,
        }
      : undefined;

  if (
    !initialAppMode &&
    (params.app !== undefined ||
      params.investmentPage !== undefined ||
      params.caseStudy !== undefined ||
      params.caseStep !== undefined)
  ) {
    redirect("/");
  }

  return (
    <EntraAuthGate>
      <AppShell
        initialAppMode={initialAppMode}
        initialCaseStudyUrlState={initialCaseStudyUrlState}
        initialInvestmentPage={initialInvestmentPage}
      />
    </EntraAuthGate>
  );
}

function firstSearchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function isInvestmentPageId(value: string | undefined): value is InvestmentPageId {
  return Boolean(
    value &&
      [
        "overview",
        "opportunity-feed",
        "area-radar",
        "opportunity",
        "intake",
        "research",
        "compare",
        "market",
        "underwriting",
        "due-diligence",
        "report-studio",
        "engagements",
        "report-bucket",
        "methodology",
      ].includes(value),
  );
}
