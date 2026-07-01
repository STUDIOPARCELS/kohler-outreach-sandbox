# Mechanical Build Dashboard

Static, single-file dashboard for 6 mechanical engineering build projects.

## Files

- `index.html` — the dashboard. Fully self-contained (embedded CSS, JS,
  project data, and a dimensioned SVG engineering drawing per project). Open
  it directly in a browser; no build step, no server, no dependencies.
- `CREATE_DASHBOARD_PROMPT.md` — the spec the dashboard was built from.
- `grading/GRADE_PROMPT.md` — the grading rubric (5 criteria, letter grade),
  amended 2026-07-01: dimensioned drawings replace the real-photo requirement.
- `grading/GRADE_REPORT.md` — the most recent grading run against `index.html`.
- `assets/photos/` — optional; see the README in that folder. Drawings are
  embedded in the page, so no image files are needed.

A copy of `index.html` lives at `public/mechanical-dashboard/index.html` so
the Next.js app serves it at `/mechanical-dashboard/index.html` when deployed.
Keep the two in sync (the `mechanical-dashboard/` copy is the source of
truth).

## Re-grading

To re-grade after a change, give an LLM (or a reviewer) the contents of
`grading/GRADE_PROMPT.md` followed by the full source of `index.html`, and
save the output over `grading/GRADE_REPORT.md`. For a stronger signal, run
three independent graders and keep the consensus scores.

## Printing

The Print button produces a compact parts-list sheet for all 6 projects —
one bordered block per project with parts, materials, tools, assembly
sequence, and critical measurements — intended to be taken to the hardware
store or the shop.
