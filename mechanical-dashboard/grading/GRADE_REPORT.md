# Grade Report — Mechanical Build Dashboard (`index.html`)

**Overall grade: A-**

Graded 2026-07-01 against `GRADE_PROMPT.md` by a panel of three independent
graders (a plain senior-ME grader, a hostile truth/slop editor, and a UI/design
critic), each reading the full source plus rendered screenshots of the grid,
modal, and print view. All three returned A- independently. Scores below are
the panel median; quotes are from the graders.

## Scores

| Criterion | Score | Panel (plain / slop-hunter / ui-critic) |
|---|---|---|
| Truth | 9/10 | 9 / 9 / 9 |
| Completeness | 8/10 | 8 / 8 / 8 |
| Understandability | 8/10 | 8 / 8 / 9 |
| UI Design | 9/10 | 9 / 9 / 9 |
| Impact | 9/10 | 9 / 9 / 9 |

### 1. Truth — 9/10
The engineering numbers survive independent recomputation: paired C4x5.4
channel section modulus 3.86 in³ giving 14,400 psi at 55,500 in-lb, KL/r = 55
for the 2x2x1/4 press upright, 232 kJ of kinetic energy at 40 mph for a
3,200 lb car (~40 °F per stop into an 8 kg rotor), #25 tap drill for #10-24.
Assumptions are labeled as assumptions ("CG height is an assumption (20 in,
typical sedan)... not a measurement", "the actual relief setting is
unmeasured"), and use ratings argue against the projects' own value ("a $15
store-bought mount does that job"). No OR-options, no padding tools, no
disguised non-materials. Point off: no real photos exist — the placeholders
are honestly labeled per spec, but nothing visual is real yet.

### 2. Completeness — 8/10
Every project specifies quantified parts ("2x #10-24 x 3/4 in stainless
pan-head machine screws (isolated bracket)"), materials with cut plans, tools,
numbered assembly sequences, critical measurements with pass/fail thresholds
("reject the run if the 60 s idle log averages above 0.25 s"), time, cost,
principles, and proof deliverables — actionable same-day. Two points off for
the rubric's hard photo requirement: zero real-world photos of built hardware
exist; every bento box leads with the placeholder.

### 3. Understandability — 8/10
Plain, direct language with jargon expanded at first use ("lower-control-arm
(LCA)", "parameter IDs (PIDs)"); Parts/Materials/Tools/Time/Cost counts sit in
a metrics strip visible without clicking. Points off for a handful of long
single-sentence assembly steps that force re-reading at the bench (the worst
were split after the final panel — see fix log).

### 4. UI Design — 9/10
Spec-exact: dark #0f172a background, light #f8fafc bento cards, muted slate
palette, no gradients, and nothing on the page except the header, six cards, a
detail modal, and a Print button — zero menus, tabs, rankings, or skills
matrices. Modal has a focus trap and Escape handling; the print output is a
dense black-on-white shop sheet. Minor dings: six gray placeholder bands are
dead space until photos exist, and card affordances differ between mouse and
keyboard users.

### 5. Impact — 9/10
"A buy-cut-test document, not documentation for its own sake": exact drill and
tap sizes per hole, stock cut lists that map every inch of the steel order,
numeric acceptance gates, a runnable logging script, and a printable shop
sheet. An engineer opening any card knows the next physical action. Capped
only by proof: no photo, plot, or CSV exists yet, so every deliverable is
still prospective.

## Overall

**Biggest strength:** honest, numerically verifiable engineering content — the
buckling, bending, weld, deflection, and thermal figures all recompute
correctly, and every assumption is labeled as an assumption rather than
dressed up as data.

**Biggest weakness:** no real photograph of built hardware exists anywhere, so
all six bento boxes lead with the placeholder and the site cannot yet prove
any item was actually built. This is the one gap that code changes cannot
close — it closes when the items are built, photographed, and the six JPGs are
dropped into `assets/photos/` (the page swaps them in automatically).

## Method

1. Build per `CREATE_DASHBOARD_PROMPT.md` (data authored by six per-project
   writers, then a critic pass to remove hype, OR-options, padding, and fake
   precision).
2. Grade with three independent graders applying `GRADE_PROMPT.md` verbatim.
3. Fix every actionable finding; re-grade with a fresh panel. Three rounds
   were run in total; the grade held at A- while criterion scores rose
   (Truth 8.5→9 for the hostile grader) and finding severity dropped from
   engineering-truth defects to low-level polish.

## Fix log

Round 1 findings fixed: anti-dive deliverable lacked wheelbase/CG inputs;
strut-top plumb-bob drop was physically implausible (replaced with a
straightedge-offset method); grommet natural-frequency claim lacked a
durometer spec; 23-in press bed pins too short for double nuts (now 24 in);
press cost understated (now $250-320); OBD 4-PID x 5 Hz rate ceiling stated;
cones/clipboard moved out of Parts; cost added to card metrics; card
descriptions clamped; placeholder bands collapsed; invalid `<button>` card
markup replaced; modal focus trap added.

Round 2 findings fixed: 4-bobs/6-points inconsistency (now 3 bobs, method
stated); press safety content added (glasses, gloves, plywood shield, race
shatter note); interference now measurable with the listed tools (micrometer +
telescoping gauge added); relief-valve load claim softened to nominal; bed-pin
shear corrected to ~11%; `log.py` embedded in modal and print sheet; modal
columns rebalanced; body scroll locked behind modal; Real-World Use restored
to the modal; vehicle-spec qualifiers added; "Full spec ▸" affordance added.

Round 3 findings fixed after the final panel (not re-graded): `log.py`
null-response guard (a dropped PID logs a blank cell instead of crashing);
press buckling capacity corrected to ~58,000 lbf (AISC, Fy 46 ksi);
phone-mount proof made outcome-neutral; frame height corrected to 42 in
including feet; OBD cable run described as 4 ft + 6 ft; two overloaded
suspension steps split; markers moved from Materials to Tools; print sheet
gained Build Description and the script listing; noscript notice; text
selection on cards no longer opens the modal.

Known remaining issues (all require hardware, not code): no real photos; no
test vehicle identified; all proof deliverables prospective until the builds
happen.
