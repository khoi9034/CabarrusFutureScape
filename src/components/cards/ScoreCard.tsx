interface ScoreCardProps {
  label: string;
  score: number;
  caption: string;
  accent?: string;
}

export function ScoreCard({
  label,
  score,
  caption,
  accent = "#d8b86a",
}: ScoreCardProps) {
  const clamped = Math.max(0, Math.min(100, score));

  return (
    <article className="rounded-lg border border-white/10 bg-black/20 p-4">
      <div className="flex items-center gap-4">
        <div
          className="relative grid h-20 w-20 shrink-0 place-items-center rounded-full"
          style={{
            background: `conic-gradient(${accent} ${clamped * 3.6}deg, rgba(255,255,255,0.1) 0deg)`,
          }}
        >
          <div className="grid h-[64px] w-[64px] place-items-center rounded-full bg-[#0b111a] text-xl font-semibold text-white">
            {clamped}
          </div>
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-white">{label}</p>
          <p className="mt-1 text-xs leading-5 text-slate-400">{caption}</p>
        </div>
      </div>
    </article>
  );
}
