import exhibits from "../../../../case-studies/large-development-land/final_diagnostic_exhibits.json";

const funnel = exhibits.candidate_funnel;
const priority = exhibits.priority_site_evidence_summary;
const scenarios = exhibits.scenario_comparison;

export default function LargeDevelopmentLandCaseStudyPage() {
  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <section className="mx-auto max-w-6xl px-6 py-12">
        <p className="text-sm uppercase tracking-[0.2em] text-cyan-300">Portfolio case study</p>
        <h1 className="mt-3 text-4xl font-semibold">Large Development-Land Acquisition Review</h1>
        <p className="mt-4 max-w-3xl text-lg text-slate-300">
          A GIS and underwriting case study for screening large Cabarrus County development-land candidates. The strongest
          screened property does not currently pass the financial-feasibility test.
        </p>
      </section>

      <section className="border-y border-slate-800 bg-slate-900/70">
        <div className="mx-auto grid max-w-6xl gap-4 px-6 py-8 md:grid-cols-6">
          {Object.entries(funnel).map(([label, value]) => (
            <div className="rounded border border-slate-700 bg-slate-950 p-4" key={label}>
              <div className="text-2xl font-semibold text-white">{Number(value).toLocaleString()}</div>
              <div className="mt-1 text-sm capitalize text-slate-400">{label.replaceAll("_", " ")}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-8 px-6 py-10 lg:grid-cols-[1.1fr_0.9fr]">
        <div>
          <h2 className="text-2xl font-semibold">Business Question</h2>
          <p className="mt-3 text-slate-300">
            Which large development-land candidate should move from screening into acquisition pricing? CFS separated the
            physical/planning screen from the residual land-value test so a strong site signal would not become an unsupported
            investment story.
          </p>

          <h2 className="mt-8 text-2xl font-semibold">Methodology</h2>
          <ul className="mt-3 space-y-2 text-slate-300">
            <li>Countywide parcel funnel and candidate shortlist.</li>
            <li>Planning, transportation, utility-proxy, environmental, ACS, and development-activity evidence.</li>
            <li>Preliminary developable-area bridge with overlapping mapped constraints subtracted once.</li>
            <li>Diagnostic finished-lot residual land-value model and sensitivity tables.</li>
          </ul>
        </div>

        <aside className="rounded border border-slate-700 bg-slate-900 p-5">
          <h2 className="text-xl font-semibold">Priority Candidate</h2>
          <dl className="mt-4 space-y-3 text-sm">
            <Metric label="Parcel" value={priority.parcel_id} />
            <Metric label="Gross acres" value={priority.gross_acres.toString()} />
            <Metric label="Developable estimate" value={priority.preliminary_developable_acres.toString()} />
            <Metric label="Screening score" value={priority.screening_score.toString()} />
            <Metric label="Physical/planning conclusion" value={priority.physical_planning_conclusion} />
            <Metric label="Financial conclusion" value={priority.financial_conclusion} />
          </dl>
        </aside>
      </section>

      <section className="mx-auto max-w-6xl px-6 pb-10">
        <h2 className="text-2xl font-semibold">Underwriting Finding</h2>
        <div className="mt-4 overflow-x-auto rounded border border-slate-700">
          <table className="w-full border-collapse text-left text-sm">
            <thead className="bg-slate-900 text-slate-200">
              <tr>
                <th className="p-3">Scenario</th>
                <th className="p-3 text-right">Lots</th>
                <th className="p-3 text-right">Gross revenue</th>
                <th className="p-3 text-right">Residual after selling/carry</th>
                <th className="p-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {scenarios.map((scenario) => (
                <tr className="border-t border-slate-800" key={scenario.scenario}>
                  <td className="p-3 font-medium">{scenario.scenario}</td>
                  <td className="p-3 text-right">{scenario.estimated_lots.toLocaleString()}</td>
                  <td className="p-3 text-right">{currency(scenario.gross_revenue)}</td>
                  <td className="p-3 text-right text-rose-300">{currency(scenario.residual_after_selling_carry)}</td>
                  <td className="p-3 text-slate-300">{scenario.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-6 px-6 pb-14 md:grid-cols-3">
        <Panel title="Recommendation">
          Targeted diligence only; do not advance to acquisition pricing yet. Reconsider only if verified values, density, civil
          costs, off-site scope, utility requirements, or phasing materially improve.
        </Panel>
        <Panel title="Technical Architecture">
          PostGIS-backed parcel screening, cloud-safe evidence package, deterministic JSON artifacts, formula workbook, and
          presentation-ready markdown.
        </Panel>
        <Panel title="Limitations">
          Not an appraisal, market value, fair value, recommended offer, entitlement approval, utility-capacity confirmation, or
          investment advice.
        </Panel>
      </section>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-slate-400">{label}</dt>
      <dd className="mt-1 font-medium text-slate-100">{value}</dd>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: string }) {
  return (
    <article className="rounded border border-slate-700 bg-slate-900 p-5">
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="mt-3 text-sm leading-6 text-slate-300">{children}</p>
    </article>
  );
}

function currency(value: number) {
  return new Intl.NumberFormat("en-US", { currency: "USD", maximumFractionDigits: 0, style: "currency" }).format(value);
}
