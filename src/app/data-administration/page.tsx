import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Database } from "lucide-react";
import { EntraAuthGate } from "@/components/auth/EntraAuthGate";
import { DataAdministrationPanel } from "@/components/admin/DataAdministrationPanel";

export const metadata: Metadata = {
  description: "Read-only CFS source, ingestion, quality, and runtime status.",
  title: "Data Administration | Cabarrus FutureScape",
};

export default function DataAdministrationPage() {
  return (
    <EntraAuthGate>
      <main
        aria-labelledby="data-administration-title"
        className="min-h-screen bg-[#03070d] px-4 py-6 text-slate-100 sm:px-6 lg:px-8"
        data-testid="data-administration-page"
      >
        <div className="mx-auto w-full max-w-7xl">
          <header className="flex flex-col gap-4 border-b border-white/10 pb-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-[#68d8ff]/25 bg-[#68d8ff]/10 text-[#9be9ff]">
                <Database aria-hidden="true" className="h-5 w-5" />
              </span>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#8fe7ff]">
                  Authorized operations view
                </p>
                <h1
                  className="mt-1 text-2xl font-semibold text-white"
                  id="data-administration-title"
                >
                  Data Administration
                </h1>
                <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-400">
                  Read-only source freshness, quality, ingestion, migration,
                  job, and audit status. Changes are performed through governed
                  operational workflows outside this page.
                </p>
              </div>
            </div>
            <Link
              className="inline-flex w-fit items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm font-semibold text-slate-200 transition hover:border-[#68d8ff]/35 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#68d8ff]/75"
              href="/"
            >
              <ArrowLeft aria-hidden="true" className="h-4 w-4" />
              Return to CFS
            </Link>
          </header>

          <DataAdministrationPanel />
        </div>
      </main>
    </EntraAuthGate>
  );
}
