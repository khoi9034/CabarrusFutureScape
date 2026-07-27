"use client";

import { EconomicsShell } from "@/components/economics/EconomicsShell";
import type { InitialCaseStudyUrlState } from "@/components/investment/InvestmentCaseStudies";
import type { InvestmentPageId } from "@/components/investment/InvestmentShell";

export function ConsultingShell({
  initialCaseStudyUrlState,
  initialInvestmentPage,
}: {
  initialCaseStudyUrlState?: InitialCaseStudyUrlState;
  initialInvestmentPage?: InvestmentPageId;
}) {
  return (
    <EconomicsShell
      initialCaseStudyUrlState={initialCaseStudyUrlState}
      initialInvestmentPage={initialInvestmentPage}
      mode="consulting"
    />
  );
}
