# Prompt to Create the Mechanical Portfolio Dashboard

Create a clean, minimal, professional static HTML dashboard for 6 mechanical engineering build projects.

## Overall Requirements
- Single self-contained HTML file (embed CSS and JS).
- Dark background (#0f172a or similar deep slate).
- Light bento-style project cards (white or #f8fafc background).
- No extra sections, tabs, rankings, skills matrices, complexity charts, or "universal deliverables".
- Only a simple header + grid of project cards.
- Serious engineering aesthetic — no bright colors, no gradients that look playful, no "AI slop" language.
- Plain, direct English. Every word must earn its place.
- Focus exclusively on what an engineer needs to actually build or test the projects.

## Header
- Title: "Project Builds"
- Subtitle: "Parts • Materials • Tools • Time • Principles • Real-World Use"
- Small "Print" button

## Project Cards (Bento Boxes)
Each card must show, in this order:
1. Photo area at the top (real-world photo of the built item if available; otherwise a clear placeholder saying "[Real-world photo of built item]")
2. Project title (full title)
3. Short purpose (one sentence)
4. Key metrics in a clean row: 
   - Parts: X
   - Materials: X  
   - Tools: X
   - Time: XX h
5. Real-world use (e.g. "4/5 practical use")
6. Short build description (what the physical thing actually is)
7. Engineering principles (comma or bullet list, keep short)

Clicking a card opens a simple modal with the full details:
- Title
- Photo (larger if available)
- Purpose
- Real-world use + Time + Cost
- Full Parts list (with quantities where known)
- Full Materials list
- Full Tools list
- Engineering Principles
- Build description
- Proof / Deliverables

## Data Structure (use this exact clean format)
Each project must contain:
- title
- shortTitle
- purpose (one clear sentence)
- physicalBuild (description of the actual thing built)
- proofOutput (what the proof looks like)
- cost (range)
- estimatedHours
- realWorldUse (e.g. "4/5 practical use")
- image (filename for photo in assets/photos/ or placeholder)
- requiredParts (array with quantities where possible)
- requiredMaterials (array)
- requiredTools (array)
- principles (array)

Remove any fields that are not directly useful for building: no "difficulty", no "hiringSignal", no "portfolioVersion", no "simplestVersion", no "dataFields", no "panels", no "codeOutputs", no "niceParts", no "finalDeliverables", no categories.

## Projects (use these 6)
1. Suspension Pickup-Point Measurement Study
2. Tool Tray — Sized to Your Wrench Set
3. Rigid vs Rubber Phone Mount — Drive Test
4. Bottle Jack Press Fixture
5. Brake Rotor Temperature Study
6. OBD-II Drive Logger

Use the exact cleaned content from the current clean data (parts with quantities, specific measurements, 7-step assembly logic where relevant, etc.).

## Technical Requirements
- Fully static (no build step).
- Works when opened directly as a file (use embedded data as fallback).
- Responsive but simple grid.
- Cards are clickable and open a clean modal.
- Include a small print button.
- Keep text minimal and scannable.
- No Chart.js or external dependencies unless already removed.

## Tone
- Serious and professional.
- Engineer-to-engineer language.
- Focus on "what do I need to buy and do" information.
- Every sentence must help someone build, test, buy parts, or understand the actual work.

Output the complete single HTML file ready to save and open.