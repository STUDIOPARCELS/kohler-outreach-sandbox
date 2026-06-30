"use client";

import { useMemo, useState } from "react";
import { useToast } from "@/components/Toast";
import {
  PROJECT_BUILDS,
  PROJECT_BUILD_SUMMARY,
  REAL_WORLD_RANKING,
  COMPLEXITY_RANKING,
  BUILD_SEQUENCE,
  SKILL_COVERAGE,
  UNIVERSAL_DELIVERABLES,
  PROJECT_FILTERS,
  type ProjectBuild,
  type SkillCategory,
} from "@/lib/projectBuilds";

/* ── In-page section anchors (engineering command-center nav) ── */
const SECTIONS: { id: string; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "project-cards", label: "Project Cards" },
  { id: "real-world-value", label: "Real-World Value" },
  { id: "build-complexity", label: "Build Complexity" },
  { id: "time-estimate", label: "Time Estimate" },
  { id: "skill-coverage", label: "Skill Coverage" },
  { id: "universal-deliverables", label: "Deliverables" },
  { id: "build-sequence", label: "Build Sequence" },
  { id: "project-detail", label: "Project Detail" },
  { id: "portfolio-positioning", label: "Positioning" },
];

const MAX_HOURS = Math.max(...PROJECT_BUILDS.map((p) => p.hoursHigh));

function categoryFor(project: ProjectBuild): SkillCategory[] {
  return project.categories;
}

/** Skills (from the coverage matrix) that include a given project. */
function skillsForProject(projectId: string): string[] {
  return SKILL_COVERAGE.filter((s) => s.projectIds.includes(projectId)).map((s) => s.skill);
}

/** Build a single searchable haystack for a project. */
function haystack(project: ProjectBuild): string {
  return [
    project.title,
    project.shortTitle,
    project.bestSignal,
    project.hiringSignal,
    ...project.categories,
    ...project.engineeringPrinciples,
    ...skillsForProject(project.id),
  ]
    .join(" ")
    .toLowerCase();
}

function ratingClass(rating: string): string {
  switch (rating) {
    case "Very high":
    case "Highest":
    case "Strong":
      return "bg-emerald-100 text-emerald-700";
    case "High":
      return "bg-blue-100 text-blue-700";
    case "Medium-high":
    case "Moderate":
      return "bg-amber-100 text-amber-700";
    default:
      return "bg-slate-100 text-slate-600";
  }
}

export default function ProjectBuildsPage() {
  const toast = useToast();
  const [filter, setFilter] = useState<(typeof PROJECT_FILTERS)[number]>("All");
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const visibleProjects = useMemo(() => {
    const q = search.trim().toLowerCase();
    return PROJECT_BUILDS.filter((p) => {
      if (filter !== "All" && !p.categories.includes(filter as SkillCategory)) return false;
      if (q && !haystack(p).includes(q)) return false;
      return true;
    });
  }, [filter, search]);

  function openDetail(id: string) {
    setExpandedId(id);
    if (typeof document !== "undefined") {
      const el = document.getElementById(`detail-${id}`);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  async function copyResume(line: string, title: string) {
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(line);
        toast(`Resume line copied — ${title}`);
      } else {
        throw new Error("clipboard unavailable");
      }
    } catch {
      toast("Could not copy — select the text manually", "error");
    }
  }

  return (
    <div className="space-y-6">
      {/* ── Hero ── */}
      <div
        className="relative overflow-hidden rounded-2xl"
        style={{
          background: "linear-gradient(135deg, #0f172a 0%, #1e293b 45%, #334155 100%)",
          boxShadow: "0 20px 40px -12px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.08)",
        }}
      >
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage:
              "url(\"data:image/svg+xml,%3Csvg width='40' height='40' viewBox='0 0 40 40' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Cpath d='M0 0h1v40H0zM20 0h1v40h-1zM40 0h1v40h-1zM0 0v1h40V0zM0 20v1h40v-1zM0 40v-1h40v1z'/%3E%3C/g%3E%3C/svg%3E\")",
          }}
        />
        <div className="relative px-5 py-7 sm:px-8 sm:py-9">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <p className="text-[10px] sm:text-xs font-bold uppercase tracking-[0.25em] text-emerald-300/80">
                Claude Code–assisted build system
              </p>
              <h1 className="mt-2 text-2xl sm:text-4xl font-bold tracking-tight text-white">
                Mechanical Engineering Portfolio Build System
              </h1>
              <p className="mt-3 max-w-3xl text-xs sm:text-sm leading-relaxed text-slate-300">
                Six practical engineering projects showing automotive systems, thermal testing,
                structural design, vibration analysis, parametric CAD, and suspension modeling.
              </p>
            </div>
            <div className="flex shrink-0 items-stretch gap-2 sm:gap-3">
              <div className="rounded-xl border border-white/15 bg-white/10 px-4 py-3 text-center backdrop-blur-sm">
                <div className="text-2xl sm:text-3xl font-bold text-white">{PROJECT_BUILD_SUMMARY.totalProjects}</div>
                <div className="mt-1 text-[10px] uppercase tracking-wider text-slate-300">Projects</div>
              </div>
              <div className="rounded-xl border border-emerald-300/20 bg-emerald-400/15 px-4 py-3 text-center backdrop-blur-sm">
                <div className="text-2xl sm:text-3xl font-bold text-white">{PROJECT_BUILD_SUMMARY.totalHoursLabel}</div>
                <div className="mt-1 text-[10px] uppercase tracking-wider text-emerald-100">Est. hours</div>
              </div>
            </div>
          </div>

          {/* In-page section nav */}
          <div className="no-print mt-6 flex flex-wrap gap-1.5">
            {SECTIONS.map((s) => (
              <a
                key={s.id}
                href={`#${s.id}`}
                className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-medium text-slate-200 transition-colors hover:bg-white/15"
              >
                {s.label}
              </a>
            ))}
          </div>
        </div>
      </div>

      {/* ── Overview ── */}
      <section id="overview" className="scroll-mt-4">
        <SectionHeading index="01" title="Overview" subtitle="Portfolio snapshot in under 60 seconds" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <MetricCard label="Total projects" value={String(PROJECT_BUILD_SUMMARY.totalProjects)} tone="slate" />
          <MetricCard label="Total estimated hours" value={PROJECT_BUILD_SUMMARY.totalHoursLabel} tone="emerald" />
          <MetricCard label="Highest-value project" value={PROJECT_BUILD_SUMMARY.highestValueProject} tone="blue" small />
          <MetricCard label="Fastest project" value={PROJECT_BUILD_SUMMARY.fastestProject} tone="amber" small />
          <MetricCard label="Strongest fabrication" value={PROJECT_BUILD_SUMMARY.strongestFabricationProject} tone="stone" small />
          <MetricCard label="Strongest thermal" value={PROJECT_BUILD_SUMMARY.strongestThermalProject} tone="red" small />
          <MetricCard label="Strongest modeling" value={PROJECT_BUILD_SUMMARY.strongestModelingProject} tone="indigo" small />
          <MetricCard label="Strongest design-build-test" value={PROJECT_BUILD_SUMMARY.strongestDesignBuildTestProject} tone="cyan" small />
          <MetricCard label="Software / build umbrella" value={PROJECT_BUILD_SUMMARY.softwareUmbrella} tone="violet" small />
          <MetricCard label="Dashboard format" value={PROJECT_BUILD_SUMMARY.dashboardFormat} tone="slate" small />
        </div>
      </section>

      {/* ── Controls ── */}
      <div className="no-print sticky top-2 z-20 rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-sm backdrop-blur">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-1.5">
            {PROJECT_FILTERS.map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                  filter === f
                    ? "bg-slate-900 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {f}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search projects or skills…"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm shadow-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500/20 lg:w-64"
            />
            <button
              onClick={() => typeof window !== "undefined" && window.print()}
              className="shrink-0 rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-700"
            >
              Print summary
            </button>
          </div>
        </div>
      </div>

      {/* ── Project Cards ── */}
      <section id="project-cards" className="scroll-mt-4">
        <SectionHeading
          index="02"
          title="Project Cards"
          subtitle={`${visibleProjects.length} of ${PROJECT_BUILDS.length} projects shown`}
        />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {visibleProjects.map((p) => (
            <article
              key={p.id}
              className="flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition-shadow hover:shadow-md"
            >
              <div className="border-b border-slate-100 bg-gradient-to-r from-slate-900 to-slate-700 px-4 py-3">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-sm font-bold leading-snug text-white">{p.title}</h3>
                  <span className="shrink-0 rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-bold text-white">
                    #{p.originalNumber}
                  </span>
                </div>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {categoryFor(p).map((c) => (
                    <span key={c} className="rounded bg-white/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-slate-200">
                      {c}
                    </span>
                  ))}
                </div>
              </div>
              <div className="flex flex-1 flex-col gap-3 p-4">
                <p className="text-xs leading-relaxed text-slate-600">{p.purpose}</p>
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <Stat label="Est. hours" value={`${p.hoursLow}–${p.hoursHigh}`} />
                  <Stat label="Real-world use" value={p.realWorldUse} />
                  <Stat label="Difficulty" value={p.difficulty} />
                  <Stat label="Cost" value={p.cost} />
                </div>
                <div className="rounded-lg bg-slate-50 px-3 py-2 text-[11px] text-slate-600">
                  <span className="font-semibold text-slate-700">Primary output: </span>
                  {p.primaryOutput}
                </div>
                <div className="mt-auto flex items-center gap-2">
                  <button
                    onClick={() => openDetail(p.id)}
                    className="flex-1 rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-700"
                  >
                    Open details
                  </button>
                  <button
                    onClick={() => copyResume(p.resumeLine, p.shortTitle)}
                    title="Copy resume line"
                    className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Copy resume line
                  </button>
                </div>
              </div>
            </article>
          ))}
          {visibleProjects.length === 0 && (
            <p className="col-span-full py-10 text-center text-sm text-slate-400">
              No projects match this filter and search.
            </p>
          )}
        </div>
      </section>

      {/* ── Real-World Value Ranking ── */}
      <section id="real-world-value" className="scroll-mt-4">
        <SectionHeading index="03" title="Real-World Value Ranking" subtitle="How closely each project mirrors paid engineering work" />
        <RankingTable rows={REAL_WORLD_RANKING} scoreMax={5} onSelect={openDetail} />
      </section>

      {/* ── Build Complexity Ranking ── */}
      <section id="build-complexity" className="scroll-mt-4">
        <SectionHeading index="04" title="Build Complexity Ranking" subtitle="Relative build effort and integration difficulty" />
        <RankingTable rows={COMPLEXITY_RANKING} scoreMax={5} onSelect={openDetail} barTone="amber" />
      </section>

      {/* ── Time Estimate Summary ── */}
      <section id="time-estimate" className="scroll-mt-4">
        <SectionHeading index="05" title="Time Estimate Summary" subtitle={`Estimated hours by project · total ${PROJECT_BUILD_SUMMARY.totalHoursLabel} hours`} />
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="space-y-2.5">
            {[...PROJECT_BUILDS]
              .sort((a, b) => b.hoursHigh - a.hoursHigh)
              .map((p) => (
                <div key={p.id} className="flex items-center gap-3">
                  <button
                    onClick={() => openDetail(p.id)}
                    className="w-40 shrink-0 truncate text-left text-xs font-medium text-slate-700 hover:text-slate-900 sm:w-52"
                    title={p.title}
                  >
                    {p.shortTitle}
                  </button>
                  <div className="relative h-5 flex-1 overflow-hidden rounded bg-slate-100">
                    <div
                      className="h-full rounded bg-gradient-to-r from-emerald-500 to-emerald-400"
                      style={{ width: `${(p.hoursHigh / MAX_HOURS) * 100}%` }}
                    />
                  </div>
                  <span className="w-14 shrink-0 text-right text-[11px] font-semibold tabular-nums text-slate-600">
                    {p.hoursLow}–{p.hoursHigh}
                  </span>
                </div>
              ))}
          </div>
          <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 text-xs">
            <span className="font-semibold text-slate-500 uppercase tracking-wide">Total estimated hours</span>
            <span className="rounded-full bg-slate-900 px-3 py-1 font-bold text-white">{PROJECT_BUILD_SUMMARY.totalHoursLabel}</span>
          </div>
        </div>
      </section>

      {/* ── Skill Coverage Matrix ── */}
      <section id="skill-coverage" className="scroll-mt-4">
        <SectionHeading index="06" title="Skill Coverage Matrix" subtitle="Which projects exercise each engineering skill" />
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full min-w-[640px] border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 text-slate-500">
                <th className="px-3 py-2 text-left font-semibold uppercase tracking-wide">Skill</th>
                {PROJECT_BUILDS.map((p) => (
                  <th key={p.id} className="px-2 py-2 text-center font-semibold" title={p.title}>
                    <span className="block max-w-[72px] truncate text-[10px] text-slate-500">{p.shortTitle}</span>
                  </th>
                ))}
                <th className="px-3 py-2 text-center font-semibold uppercase tracking-wide">#</th>
              </tr>
            </thead>
            <tbody>
              {SKILL_COVERAGE.map((row) => (
                <tr key={row.skill} className="border-t border-slate-100">
                  <td className="px-3 py-2 font-medium text-slate-700">
                    {row.skill}
                    {row.all && <span className="ml-1.5 rounded bg-emerald-100 px-1.5 py-0.5 text-[9px] font-bold text-emerald-700">ALL</span>}
                  </td>
                  {PROJECT_BUILDS.map((p) => {
                    const covered = row.projectIds.includes(p.id);
                    return (
                      <td key={p.id} className="px-2 py-2 text-center">
                        {covered ? (
                          <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 text-[9px] font-bold text-white">
                            ✓
                          </span>
                        ) : (
                          <span className="inline-block h-1 w-1 rounded-full bg-slate-200" />
                        )}
                      </td>
                    );
                  })}
                  <td className="px-3 py-2 text-center font-semibold tabular-nums text-slate-500">{row.projectIds.length}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Skill coverage distribution chart */}
        <div className="mt-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Skill coverage distribution</p>
          <div className="space-y-2">
            {[...SKILL_COVERAGE]
              .sort((a, b) => b.projectIds.length - a.projectIds.length)
              .map((row) => (
                <div key={row.skill} className="flex items-center gap-3">
                  <span className="w-36 shrink-0 truncate text-[11px] text-slate-600 sm:w-44">{row.skill}</span>
                  <div className="relative h-4 flex-1 overflow-hidden rounded bg-slate-100">
                    <div
                      className="h-full rounded bg-gradient-to-r from-indigo-500 to-indigo-400"
                      style={{ width: `${(row.projectIds.length / PROJECT_BUILDS.length) * 100}%` }}
                    />
                  </div>
                  <span className="w-8 shrink-0 text-right text-[11px] font-semibold tabular-nums text-slate-500">
                    {row.projectIds.length}
                  </span>
                </div>
              ))}
          </div>
        </div>
      </section>

      {/* ── Universal Deliverables ── */}
      <section id="universal-deliverables" className="scroll-mt-4">
        <SectionHeading index="07" title="Universal Deliverables" subtitle="Every project detail section documents the same 15 items" />
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <ol className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {UNIVERSAL_DELIVERABLES.map((d, i) => (
              <li key={d} className="flex items-start gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-700">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-900 text-[10px] font-bold text-white">
                  {i + 1}
                </span>
                {d}
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ── Recommended Build Sequence ── */}
      <section id="build-sequence" className="scroll-mt-4">
        <SectionHeading index="08" title="Recommended Build Sequence" subtitle="Order that compounds momentum and reuses the dashboard system" />
        <ol className="relative space-y-3 border-l-2 border-slate-200 pl-5">
          {BUILD_SEQUENCE.map((step) => (
            <li key={step.step} className="relative">
              <span className="absolute -left-[27px] flex h-6 w-6 items-center justify-center rounded-full bg-slate-900 text-[11px] font-bold text-white">
                {step.step}
              </span>
              <button
                onClick={() => openDetail(step.projectId)}
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-left shadow-sm transition-colors hover:border-slate-300 hover:bg-slate-50"
              >
                <p className="text-sm font-semibold text-slate-800">{step.project}</p>
                <p className="mt-0.5 text-xs text-slate-500">{step.rationale}</p>
              </button>
            </li>
          ))}
        </ol>
      </section>

      {/* ── Project Detail ── */}
      <section id="project-detail" className="scroll-mt-4">
        <SectionHeading index="09" title="Project Detail" subtitle="Expand any project for its full engineering brief" />
        <div className="space-y-3">
          {PROJECT_BUILDS.map((p) => (
            <ProjectDetail
              key={p.id}
              project={p}
              expanded={expandedId === p.id}
              onToggle={() => setExpandedId(expandedId === p.id ? null : p.id)}
              onCopyResume={() => copyResume(p.resumeLine, p.shortTitle)}
            />
          ))}
        </div>
      </section>

      {/* ── Final Portfolio Positioning ── */}
      <section id="portfolio-positioning" className="scroll-mt-4">
        <SectionHeading index="10" title="Final Portfolio Positioning" subtitle="How this six-project set reads to a hiring manager" />
        <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-900 to-slate-700 p-5 text-slate-100 shadow-sm sm:p-7">
          <p className="text-sm leading-relaxed text-slate-200">
            This portfolio is a deliberate six-project arc: it opens with a fast parametric CAD win, proves
            design-build-test discipline on a vibration-isolated mount, then layers in measured thermal data, a
            full vehicle data-acquisition system, serious chassis modeling, and finishes with a fabricated,
            load-rated press fixture. Together the set spans{" "}
            <span className="font-semibold text-white">automotive systems, thermal analysis, structural design,
            fabrication, vibration testing, parametric CAD, and instrumentation</span> — every project planned,
            tested, and documented as a Claude Code–assisted HTML dashboard.
          </p>
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <PositioningStat label="Highest value" value={PROJECT_BUILD_SUMMARY.highestValueProject} />
            <PositioningStat label="Strongest fabrication" value={PROJECT_BUILD_SUMMARY.strongestFabricationProject} />
            <PositioningStat label="Strongest thermal" value={PROJECT_BUILD_SUMMARY.strongestThermalProject} />
            <PositioningStat label="Strongest modeling" value={PROJECT_BUILD_SUMMARY.strongestModelingProject} />
          </div>
          <p className="mt-5 text-xs uppercase tracking-[0.2em] text-emerald-300/80">
            {PROJECT_BUILD_SUMMARY.totalProjects} projects · {PROJECT_BUILD_SUMMARY.totalHoursLabel} hours ·{" "}
            {PROJECT_BUILD_SUMMARY.softwareUmbrella}
          </p>
        </div>
      </section>
    </div>
  );
}

/* ── Sub-components ── */

function SectionHeading({ index, title, subtitle }: { index: string; title: string; subtitle: string }) {
  return (
    <div className="mb-3 flex items-end gap-3">
      <span className="text-xs font-bold tabular-nums text-slate-300">{index}</span>
      <div>
        <h2 className="text-lg font-bold tracking-tight text-slate-900 sm:text-xl">{title}</h2>
        <p className="text-xs text-slate-500">{subtitle}</p>
      </div>
    </div>
  );
}

const TONES: Record<string, string> = {
  slate: "border-slate-200 bg-slate-50",
  emerald: "border-emerald-200 bg-emerald-50",
  blue: "border-blue-200 bg-blue-50",
  amber: "border-amber-200 bg-amber-50",
  stone: "border-stone-200 bg-stone-50",
  red: "border-red-200 bg-red-50",
  indigo: "border-indigo-200 bg-indigo-50",
  cyan: "border-cyan-200 bg-cyan-50",
  violet: "border-violet-200 bg-violet-50",
};

function MetricCard({
  label,
  value,
  tone,
  small,
}: {
  label: string;
  value: string;
  tone: string;
  small?: boolean;
}) {
  return (
    <div className={`rounded-xl border p-3 shadow-sm ${TONES[tone] || TONES.slate}`}>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 font-bold text-slate-900 ${small ? "text-xs leading-snug" : "text-xl"}`}>{value}</p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-slate-50 px-2 py-1.5">
      <p className="text-[9px] uppercase tracking-wide text-slate-400">{label}</p>
      <p className="text-[11px] font-semibold text-slate-700">{value}</p>
    </div>
  );
}

function PositioningStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 backdrop-blur-sm">
      <p className="text-[10px] uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-0.5 text-xs font-semibold text-white">{value}</p>
    </div>
  );
}

interface RankingRowLike {
  rank: number;
  projectId: string;
  project: string;
  rating: string;
  score: number;
  note: string;
}

function RankingTable({
  rows,
  scoreMax,
  onSelect,
  barTone = "emerald",
}: {
  rows: RankingRowLike[];
  scoreMax: number;
  onSelect: (id: string) => void;
  barTone?: "emerald" | "amber";
}) {
  const bar = barTone === "amber" ? "from-amber-500 to-amber-400" : "from-emerald-500 to-emerald-400";
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      {rows.map((row) => (
        <button
          key={row.projectId}
          onClick={() => onSelect(row.projectId)}
          className="flex w-full items-center gap-3 border-b border-slate-100 px-4 py-3 text-left last:border-b-0 hover:bg-slate-50"
        >
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-bold text-white">
            {row.rank}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-slate-800">{row.project}</span>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${ratingClass(row.rating)}`}>
                {row.rating}
              </span>
            </div>
            <p className="mt-0.5 text-xs text-slate-500">{row.note}</p>
          </div>
          <div className="hidden w-28 shrink-0 sm:block">
            <div className="h-3 overflow-hidden rounded bg-slate-100">
              <div className={`h-full rounded bg-gradient-to-r ${bar}`} style={{ width: `${(row.score / scoreMax) * 100}%` }} />
            </div>
            <p className="mt-1 text-right text-[10px] font-semibold tabular-nums text-slate-400">{row.score}/{scoreMax}</p>
          </div>
        </button>
      ))}
    </div>
  );
}

function DetailList({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50/60 p-3">
      <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-500">{title}</p>
      <ul className="space-y-1">
        {items.map((it) => (
          <li key={it} className="flex gap-1.5 text-[11px] leading-snug text-slate-600">
            <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-slate-400" />
            {it}
          </li>
        ))}
      </ul>
    </div>
  );
}

function ProjectDetail({
  project,
  expanded,
  onToggle,
  onCopyResume,
}: {
  project: ProjectBuild;
  expanded: boolean;
  onToggle: () => void;
  onCopyResume: () => void;
}) {
  return (
    <div id={`detail-${project.id}`} className="scroll-mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <button onClick={onToggle} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-slate-50">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-500">
            #{project.originalNumber}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-slate-800">{project.title}</p>
            <p className="truncate text-[11px] text-slate-500">
              {project.hoursLow}–{project.hoursHigh} hrs · {project.realWorldUse} value · {project.bestSignal}
            </p>
          </div>
        </div>
        <svg
          className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${expanded ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {expanded && (
        <div className="space-y-4 border-t border-slate-100 px-4 py-4">
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <Field label="Objective" value={project.purpose} />
            <Field label="Real-world use" value={`${project.realWorldUse} — ${project.realWorldNote}`} />
            <Field label="Portfolio-grade build definition" value={project.portfolioVersion} />
            <Field label="Simplest credible version" value={project.simplestVersion} />
            <Field label="Hiring signal" value={project.hiringSignal} />
            <Field label="Estimated hours" value={`${project.hoursLow}–${project.hoursHigh} hours · ${project.difficulty} · ${project.cost} cost`} />
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
            <DetailList title="Engineering principles" items={project.engineeringPrinciples} />
            <DetailList title="Claude Code outputs" items={project.claudeOutputs} />
            <DetailList title="Data fields" items={project.dataFields} />
            <DetailList title="Dashboard panels" items={project.dashboardPanels} />
            <DetailList title="Required parts" items={project.requiredParts} />
            <DetailList title="Required materials" items={project.requiredMaterials} />
            <DetailList title="Required tools" items={project.requiredTools} />
            <DetailList title="Nice-to-have parts" items={project.niceParts} />
            <DetailList title="Nice-to-have materials" items={project.niceMaterials} />
            <DetailList title="Nice-to-have tools" items={project.niceTools} />
            <DetailList title="Final deliverables" items={project.deliverables} />
          </div>

          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-emerald-700">Resume line</p>
                <p className="text-xs leading-relaxed text-slate-700">{project.resumeLine}</p>
              </div>
              <button
                onClick={onCopyResume}
                className="no-print shrink-0 rounded-lg bg-emerald-600 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-emerald-700"
              >
                Copy
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-50 px-3 py-2">
      <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-0.5 text-xs leading-relaxed text-slate-700">{value}</p>
    </div>
  );
}
