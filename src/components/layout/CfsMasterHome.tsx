"use client";

import {
  ArrowRight,
  BriefcaseBusiness,
  Layers3,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
type ProductCard = {
  action: string;
  accent: "cyan" | "gold";
  description: string;
  href: string;
  icon: typeof Layers3;
  id: "builder" | "management";
  title: string;
};

const productCards: ProductCard[] = [
  {
    action: "Open Management",
    accent: "cyan",
    description:
      "Countywide insights, planning trends, economic conditions, development signals, and executive decision support.",
    href: "/?app=management&section=overview",
    icon: BriefcaseBusiness,
    id: "management",
    title: "CFS Management",
  },
  {
    action: "Open Builder",
    accent: "gold",
    description:
      "Explore maps, investigate parcels, analyze planning conditions, build datasets, run scenarios, and perform detailed staff analysis.",
    href: "/?app=planning",
    icon: Layers3,
    id: "builder",
    title: "CFS Builder",
  },
];

const accentStyles: Record<ProductCard["accent"], string> = {
  cyan: "border-[#68d8ff]/28 bg-[#07111f]/88 hover:border-[#68d8ff]/58 hover:bg-[#102235]/92 focus-visible:outline-[#68d8ff]/75",
  gold: "border-[#d8b86a]/28 bg-[#161207]/88 hover:border-[#d8b86a]/60 hover:bg-[#261f10]/92 focus-visible:outline-[#d8b86a]/75",
};

const iconStyles: Record<ProductCard["accent"], string> = {
  cyan: "border-[#68d8ff]/30 bg-[#68d8ff]/10 text-[#8fe7ff]",
  gold: "border-[#d8b86a]/30 bg-[#d8b86a]/12 text-[#f0cd79]",
};

export function CfsMasterHome() {
  return (
    <main
      className="cfs-county-home relative min-h-screen overflow-x-hidden bg-[#03070d] px-4 py-8 text-slate-100 sm:px-6 lg:px-8"
      data-testid="cfs-master-home"
    >
      <div className="pointer-events-none absolute inset-0 metric-grid opacity-70" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(104,216,255,0.13),transparent_34%),linear-gradient(180deg,rgba(3,7,13,0.22),rgba(3,7,13,0.94))]" />

      <section className="relative z-10 mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-7xl flex-col justify-center gap-8">
        <div className="max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#8fe7ff]">
            Enterprise spatial intelligence
          </p>
          <h1 className="mt-3 text-4xl font-semibold tracking-normal text-white sm:text-5xl">
            Cabarrus FutureScape
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-slate-300 sm:text-lg">
            Planning intelligence for decisions and day-to-day analysis.
          </p>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">
            Portfolio demonstration using sanitized, cached public demo data where applicable; screening outputs are preliminary.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:gap-5" aria-label="CFS experiences">
          {productCards.map((card) => {
            const Icon = card.icon;

            return (
              <a
                className={cn(
                  "group flex min-h-[19rem] w-full flex-col justify-between rounded-lg border p-5 text-left shadow-[0_24px_80px_rgba(0,0,0,0.28)] backdrop-blur-xl transition duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 lg:p-6",
                  accentStyles[card.accent],
                )}
                data-testid={`cfs-home-card-${card.id}`}
                href={card.href}
                key={card.id}
              >
                <span
                  className={cn(
                    "flex h-12 w-12 items-center justify-center rounded-lg border",
                    iconStyles[card.accent],
                  )}
                >
                  <Icon className="h-6 w-6" />
                </span>

                <span className="mt-10 block">
                  <span className="block text-2xl font-semibold tracking-normal text-white">
                    {card.title}
                  </span>
                  <span className="mt-3 block text-sm leading-6 text-slate-300">
                    {card.description}
                  </span>
                </span>

                <span className="mt-8 inline-flex items-center gap-2 text-sm font-semibold text-white">
                  {card.action}
                  <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
                </span>
              </a>
            );
          })}
        </div>

        <div
          className="flex items-center gap-3 rounded-lg border border-[#35c98d]/24 bg-[#071510]/78 px-4 py-3 text-sm text-slate-300"
          data-testid="cfs-home-shared-ask-cfs"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#35c98d]/30 bg-[#35c98d]/12 text-[#35c98d]">
            <Sparkles className="h-4 w-4" />
          </span>
          <p>
            <span className="font-semibold text-white">Ask CFS</span> is available throughout the platform to explain data, analysis, and results in plain language.
          </p>
        </div>
      </section>
    </main>
  );
}
