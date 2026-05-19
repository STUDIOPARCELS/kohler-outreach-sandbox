-- Denver Data-Center / AI-Infrastructure Contact Targeting import
-- Source: 0231594b-denver_data_center_contact_targeting.xlsx -> 'Contact Targets' sheet
-- Scope: 90 named individuals. Excluded from the 200-row workbook: 75 '[Find named person]'
--   placeholders, 34 team/inbox/hiring-lane rows, and 1 partial name (CT-112).
-- Target DB: Kohler Outreach Sandbox project (nwsjgppkfducaikxsyvk).
-- Emails left blank and email_searched=false => queued for RocketReach enrichment via the app.
-- Idempotent: VALUES + NOT EXISTS anti-joins; safe to re-run.

-- ===== COMPANIES (19 new; 7 pre-existing skipped by anti-join) =====
INSERT INTO companies (companyname, niche, careers_url, notes)
SELECT v.companyname, v.niche, v.careers_url, v.notes FROM (VALUES
  ('Albireo Energy', 'Building automation / controls / energy services', 'https://albireoenergy.com/careers/', '[Denver DC Targeting] Tier A | Rank 27 | Category: Building automation / controls / energy services | 80226 fit: Good: local metro'),
  ('BCER Engineering', 'Local MEP / technology / life-safety engineer', 'https://bcer.com/careers/', '[Denver DC Targeting] Tier A | Rank 3 | Category: Local MEP / technology / life-safety engineer | 80226 fit: Ideal: Golden / west metro'),
  ('Cator Ruma & Associates', 'Local MEP / commissioning engineer', 'https://catorruma.com/careers/', '[Denver DC Targeting] Tier A | Rank 1 | Category: Local MEP / commissioning engineer | 80226 fit: Ideal: Lakewood/Golden corridor'),
  ('DPR Construction', 'General contractor / mission critical builder', 'https://www.dpr.com/careers', '[Denver DC Targeting] Tier A | Rank 15 | Category: General contractor / mission critical builder | 80226 fit: Good: Denver-market'),
  ('Fleet Data Centers', 'Data-center developer / build-to-suit provider', 'https://fleetdatacenters.com/careers/', '[Denver DC Targeting] Tier A | Rank 30 | Category: Data-center developer / build-to-suit provider | 80226 fit: Good: Cherry Creek / Denver'),
  ('Flexential', 'Data-center owner/operator / developer', 'https://www.flexential.com/careers', '[Denver DC Targeting] Tier B | Rank 41 | Category: Data-center owner/operator / developer | 80226 fit: Outer for Parker; Englewood closer'),
  ('Haynes Mechanical Systems', 'Mechanical contractor / design-build HVAC', 'https://www.haynesmech.com/careers/', '[Denver DC Targeting] Tier A | Rank 26 | Category: Mechanical contractor / design-build HVAC | 80226 fit: Good: local metro'),
  ('Holder Construction', 'General contractor / data-center builder', 'https://www.holderconstruction.com/careers/', '[Denver DC Targeting] Tier A | Rank 19 | Category: General contractor / data-center builder | 80226 fit: Good: south metro'),
  ('IMEG', 'National MEP / data-center engineer', 'https://www.imegcorp.com/careers/', '[Denver DC Targeting] Tier A | Rank 5 | Category: National MEP / data-center engineer | 80226 fit: Good: south metro within practical range'),
  ('LONG Building Technologies', 'Building automation / HVAC / controls', 'https://www.long.com/careers/', '[Denver DC Targeting] Tier A | Rank 25 | Category: Building automation / HVAC / controls | 80226 fit: Good: local metro'),
  ('Murphy Company', 'Mechanical contractor / data-center services', 'https://www.murphynet.com/careers/', '[Denver DC Targeting] Tier A | Rank 24 | Category: Mechanical contractor / data-center services | 80226 fit: Good: Denver-market'),
  ('NEI Electric Power Engineering', 'Power engineering / data-center infrastructure', 'https://neiengineering.com/careers/', '[Denver DC Targeting] Tier B | Rank 47 | Category: Power engineering / data-center infrastructure | 80226 fit: Ideal: Lakewood'),
  ('NREL / National Renewable Energy Laboratory', 'Research lab / data-center energy systems', 'https://www.nrel.gov/careers/', '[Denver DC Targeting] Tier B | Rank 46 | Category: Research lab / data-center energy systems | 80226 fit: Ideal: Golden'),
  ('Olsson', 'Data-center engineering consultant', 'https://www.olsson.com/current-openings', '[Denver DC Targeting] Tier A | Rank 6 | Category: Data-center engineering consultant | 80226 fit: Good: Denver-market roles'),
  ('PCL Construction', 'General contractor / data-center builder', 'https://www.pcl.com/careers', '[Denver DC Targeting] Tier A | Rank 16 | Category: General contractor / data-center builder | 80226 fit: Good: southeast Denver'),
  ('RK Industries / RK Mechanical / RK Mission Critical', 'Mechanical contractor / modular data-center infrastructure', 'https://rkindustries.com/careers/', '[Denver DC Targeting] Tier A | Rank 21 | Category: Mechanical contractor / modular data-center infrastructure | 80226 fit: Outer but local metro'),
  ('Salas O’Brien', 'MEP / commissioning / architecture-engineering', 'https://salasobrien.com/careers/', '[Denver DC Targeting] Tier A | Rank 10 | Category: MEP / commissioning / architecture-engineering | 80226 fit: Ideal/Good: Lakewood office plus south-metro MEP office'),
  ('Vantage Data Centers', 'Data-center owner/operator / developer', 'https://vantage-dc.com/careers/', '[Denver DC Targeting] Tier A | Rank 33 | Category: Data-center owner/operator / developer | 80226 fit: Good: Denver-market'),
  ('WSP / kW Mission Critical Engineering', 'Data-center-focused MEP consultant', 'https://www.wsp.com/en-us/careers', '[Denver DC Targeting] Tier A | Rank 9 | Category: Data-center-focused MEP consultant | 80226 fit: Good: Denver-market')
) AS v(companyname, niche, careers_url, notes)
WHERE NOT EXISTS (SELECT 1 FROM companies c WHERE c.companyname = v.companyname);

-- ===== CONTACTS (87 new; emails blank, email_searched=false) =====
INSERT INTO contacts (companyname, contactname, title, email, linkedin, phone, notes, email_searched)
SELECT v.companyname, v.contactname, v.title, NULL, v.linkedin, NULL, v.notes, false FROM (VALUES
  ('BCER Engineering', 'Kari Nelson', 'Senior Mechanical Engineer; Associate', NULL, '[Denver DC Targeting CT-001]
Priority: P1 | Outreach score: 125 | Source confidence: Official named source
Target lane: Mechanical PE mentor
Location: Golden 80401 | 80226 fit: Ideal: Golden / west metro
Entry fit: 5/5 | PE-track value: High
Role keywords: Mechanical Designer; Mechanical Engineer; EIT; Technology/MEP Project Engineer
Why: BCER team pages identify this target; BCER’s Golden office is a high-fit west-metro MEP/technology target.
Best ask: Ask where junior Mechanical EIT candidates fit across mechanical design, technology infrastructure, and data-center-adjacent projects.
Source: https://bcer.com/team/kari-nelson/ | Careers: https://bcer.com/careers/'),
  ('BCER Engineering', 'Mike Schroeder', 'Principal-in-Charge over Mechanical Engineering; Director of Quality Engineering', NULL, '[Denver DC Targeting CT-002]
Priority: P1 | Outreach score: 125 | Source confidence: Official named source
Target lane: Mechanical principal / PE mentor
Location: Golden 80401 | 80226 fit: Ideal: Golden / west metro
Entry fit: 5/5 | PE-track value: High
Role keywords: Mechanical Designer; Mechanical Engineer; EIT; Technology/MEP Project Engineer
Why: BCER team pages identify this target; BCER’s Golden office is a high-fit west-metro MEP/technology target.
Best ask: Ask where junior Mechanical EIT candidates fit across mechanical design, technology infrastructure, and data-center-adjacent projects.
Source: https://bcer.com/team/mike-schroeder/ | Careers: https://bcer.com/careers/'),
  ('BCER Engineering', 'Scott Muller', 'Senior Project Manager, Technology team', NULL, '[Denver DC Targeting CT-003]
Priority: P1 | Outreach score: 125 | Source confidence: Official named source
Target lane: Mission-critical / technology PM
Location: Golden 80401 | 80226 fit: Ideal: Golden / west metro
Entry fit: 5/5 | PE-track value: High
Role keywords: Mechanical Designer; Mechanical Engineer; EIT; Technology/MEP Project Engineer
Why: BCER team pages identify this target; BCER’s Golden office is a high-fit west-metro MEP/technology target.
Best ask: Ask where junior Mechanical EIT candidates fit across mechanical design, technology infrastructure, and data-center-adjacent projects.
Source: https://bcer.com/team/scott-muller/ | Careers: https://bcer.com/careers/'),
  ('Cator Ruma & Associates', 'Jedediah Moore, PE, CCP', 'Principal, Commissioning', NULL, '[Denver DC Targeting CT-004]
Priority: P1 | Outreach score: 125 | Source confidence: Official named source
Target lane: Commissioning principal / PE mentor
Location: Lakewood 80401 | 80226 fit: Ideal: Lakewood/Golden corridor
Entry fit: 5/5 | PE-track value: High
Role keywords: Mechanical Engineer; Mechanical EIT; Commissioning Engineer; Project Coordinator
Why: Official leadership page lists this person; Cator Ruma is in Lakewood and has a mission-critical practice for data-center MEP/commissioning.
Best ask: Ask about junior Mechanical EIT support for mission-critical MEP design, commissioning, and PE-track mentoring.
Source: https://catorruma.com/company/ | Careers: https://catorruma.com/careers/'),
  ('Cator Ruma & Associates', 'Josh Harwood, PE', 'Principal, Mechanical & Technology', NULL, '[Denver DC Targeting CT-005]
Priority: P1 | Outreach score: 125 | Source confidence: Official named source
Target lane: Mechanical principal / PE mentor
Location: Lakewood 80401 | 80226 fit: Ideal: Lakewood/Golden corridor
Entry fit: 5/5 | PE-track value: High
Role keywords: Mechanical Engineer; Mechanical EIT; Commissioning Engineer; Project Coordinator
Why: Official leadership page lists this person; Cator Ruma is in Lakewood and has a mission-critical practice for data-center MEP/commissioning.
Best ask: Ask about junior Mechanical EIT support for mission-critical MEP design, commissioning, and PE-track mentoring.
Source: https://catorruma.com/company/ | Careers: https://catorruma.com/careers/'),
  ('Cator Ruma & Associates', 'Lilly Johnson, PE', 'Principal, Mechanical Engineer', NULL, '[Denver DC Targeting CT-006]
Priority: P1 | Outreach score: 125 | Source confidence: Official named source
Target lane: Mechanical principal / PE mentor
Location: Lakewood 80401 | 80226 fit: Ideal: Lakewood/Golden corridor
Entry fit: 5/5 | PE-track value: High
Role keywords: Mechanical Engineer; Mechanical EIT; Commissioning Engineer; Project Coordinator
Why: Official leadership page lists this person; Cator Ruma is in Lakewood and has a mission-critical practice for data-center MEP/commissioning.
Best ask: Ask about junior Mechanical EIT support for mission-critical MEP design, commissioning, and PE-track mentoring.
Source: https://catorruma.com/company/ | Careers: https://catorruma.com/careers/'),
  ('Cator Ruma & Associates', 'Maddie Grego, PE', 'Principal, Mechanical Engineer', NULL, '[Denver DC Targeting CT-007]
Priority: P1 | Outreach score: 125 | Source confidence: Official named source
Target lane: Mechanical principal / PE mentor
Location: Lakewood 80401 | 80226 fit: Ideal: Lakewood/Golden corridor
Entry fit: 5/5 | PE-track value: High
Role keywords: Mechanical Engineer; Mechanical EIT; Commissioning Engineer; Project Coordinator
Why: Official leadership page lists this person; Cator Ruma is in Lakewood and has a mission-critical practice for data-center MEP/commissioning.
Best ask: Ask about junior Mechanical EIT support for mission-critical MEP design, commissioning, and PE-track mentoring.
Source: https://catorruma.com/company/ | Careers: https://catorruma.com/careers/'),
  ('Cator Ruma & Associates', 'Michael Wisdom, PE', 'Principal, Mechanical Engineer', NULL, '[Denver DC Targeting CT-008]
Priority: P1 | Outreach score: 125 | Source confidence: Official named source
Target lane: Mechanical principal / PE mentor
Location: Lakewood 80401 | 80226 fit: Ideal: Lakewood/Golden corridor
Entry fit: 5/5 | PE-track value: High
Role keywords: Mechanical Engineer; Mechanical EIT; Commissioning Engineer; Project Coordinator
Why: Official leadership page lists this person; Cator Ruma is in Lakewood and has a mission-critical practice for data-center MEP/commissioning.
Best ask: Ask about junior Mechanical EIT support for mission-critical MEP design, commissioning, and PE-track mentoring.
Source: https://catorruma.com/company/ | Careers: https://catorruma.com/careers/'),
  ('Cator Ruma & Associates', 'Sam Meints, PE', 'Principal, Mechanical Engineer', NULL, '[Denver DC Targeting CT-009]
Priority: P1 | Outreach score: 125 | Source confidence: Official named source
Target lane: Mechanical principal / PE mentor
Location: Lakewood 80401 | 80226 fit: Ideal: Lakewood/Golden corridor
Entry fit: 5/5 | PE-track value: High
Role keywords: Mechanical Engineer; Mechanical EIT; Commissioning Engineer; Project Coordinator
Why: Official leadership page lists this person; Cator Ruma is in Lakewood and has a mission-critical practice for data-center MEP/commissioning.
Best ask: Ask about junior Mechanical EIT support for mission-critical MEP design, commissioning, and PE-track mentoring.
Source: https://catorruma.com/company/ | Careers: https://catorruma.com/careers/'),
  ('Cator Ruma & Associates', 'Sean Convery, PE', 'Principal, Mechanical Engineer', NULL, '[Denver DC Targeting CT-010]
Priority: P1 | Outreach score: 125 | Source confidence: Official named source
Target lane: Mechanical principal / PE mentor
Location: Lakewood 80401 | 80226 fit: Ideal: Lakewood/Golden corridor
Entry fit: 5/5 | PE-track value: High
Role keywords: Mechanical Engineer; Mechanical EIT; Commissioning Engineer; Project Coordinator
Why: Official leadership page lists this person; Cator Ruma is in Lakewood and has a mission-critical practice for data-center MEP/commissioning.
Best ask: Ask about junior Mechanical EIT support for mission-critical MEP design, commissioning, and PE-track mentoring.
Source: https://catorruma.com/company/ | Careers: https://catorruma.com/careers/'),
  ('Cator Ruma & Associates', 'Wayne Trader, PE', 'Principal, Mechanical Engineer', NULL, '[Denver DC Targeting CT-011]
Priority: P1 | Outreach score: 125 | Source confidence: Official named source
Target lane: Mechanical principal / PE mentor
Location: Lakewood 80401 | 80226 fit: Ideal: Lakewood/Golden corridor
Entry fit: 5/5 | PE-track value: High
Role keywords: Mechanical Engineer; Mechanical EIT; Commissioning Engineer; Project Coordinator
Why: Official leadership page lists this person; Cator Ruma is in Lakewood and has a mission-critical practice for data-center MEP/commissioning.
Best ask: Ask about junior Mechanical EIT support for mission-critical MEP design, commissioning, and PE-track mentoring.
Source: https://catorruma.com/company/ | Careers: https://catorruma.com/careers/'),
  ('IMEG', 'Ken Urbanek', 'Client Executive, MEP (Denver)', NULL, '[Denver DC Targeting CT-013]
Priority: P1 | Outreach score: 125 | Source confidence: Official named source
Target lane: Denver MEP practice lead
Location: Denver / Greenwood Village | 80226 fit: Good: south metro within practical range
Entry fit: 5/5 | PE-track value: High
Role keywords: Mechanical Engineering New Grad; Mechanical Project Engineer; Mission Critical Mechanical EIT
Why: Public IMEG data-center and job sources identify this as a strong Denver MEP/data-center target.
Best ask: Ask about Mechanical Project Engineer/New Grad fit for data centers, central utility plants, and mission-critical HVAC.
Source: https://imegcorp.com/markets/data-centers/ | Careers: https://www.imegcorp.com/careers/'),
  ('The RMH Group', 'Alberto Barrios Marquez, PE', 'Associate, Mission Critical Market Leader', NULL, '[Denver DC Targeting CT-017]
Priority: P1 | Outreach score: 125 | Source confidence: Official named source
Target lane: Mission-critical practice lead
Location: Lakewood 80215 | 80226 fit: Ideal: near 80226
Entry fit: 5/5 | PE-track value: High
Role keywords: Mechanical Engineer; Mechanical EIT; Mission Critical Engineer; Project Engineer
Why: Official RMH people/contact pages identify this target; RMH is near 80226 and has mission-critical/data-center cooling and power work.
Best ask: Ask who leads junior Mechanical EIT hiring for mission-critical/data-center HVAC, cooling, and construction support.
Source: https://www.rmhgroup.com/people/alberto-barrios-marquez/ | Careers: https://www.rmhgroup.com/careers/'),
  ('The RMH Group', 'Bill Green, PE', 'Principal, Mechanical Engineer', NULL, '[Denver DC Targeting CT-018]
Priority: P1 | Outreach score: 125 | Source confidence: Official named source
Target lane: Mechanical principal / PE mentor
Location: Lakewood 80215 | 80226 fit: Ideal: near 80226
Entry fit: 5/5 | PE-track value: High
Role keywords: Mechanical Engineer; Mechanical EIT; Mission Critical Engineer; Project Engineer
Why: Official RMH people/contact pages identify this target; RMH is near 80226 and has mission-critical/data-center cooling and power work.
Best ask: Ask who leads junior Mechanical EIT hiring for mission-critical/data-center HVAC, cooling, and construction support.
Source: https://www.rmhgroup.com/people/ | Careers: https://www.rmhgroup.com/careers/'),
  ('The RMH Group', 'Dave Yeingst', 'Chief Mechanical Engineer', NULL, '[Denver DC Targeting CT-019]
Priority: P1 | Outreach score: 125 | Source confidence: Official named source
Target lane: Mechanical technical lead
Location: Lakewood 80215 | 80226 fit: Ideal: near 80226
Entry fit: 5/5 | PE-track value: High
Role keywords: Mechanical Engineer; Mechanical EIT; Mission Critical Engineer; Project Engineer
Why: Official RMH people/contact pages identify this target; RMH is near 80226 and has mission-critical/data-center cooling and power work.
Best ask: Ask who leads junior Mechanical EIT hiring for mission-critical/data-center HVAC, cooling, and construction support.
Source: https://www.rmhgroup.com/people/ | Careers: https://www.rmhgroup.com/careers/'),
  ('The RMH Group', 'Hung Dang, PE', 'Principal, Mechanical Engineer', NULL, '[Denver DC Targeting CT-020]
Priority: P1 | Outreach score: 125 | Source confidence: Official named source
Target lane: Mechanical principal / PE mentor
Location: Lakewood 80215 | 80226 fit: Ideal: near 80226
Entry fit: 5/5 | PE-track value: High
Role keywords: Mechanical Engineer; Mechanical EIT; Mission Critical Engineer; Project Engineer
Why: Official RMH people/contact pages identify this target; RMH is near 80226 and has mission-critical/data-center cooling and power work.
Best ask: Ask who leads junior Mechanical EIT hiring for mission-critical/data-center HVAC, cooling, and construction support.
Source: https://www.rmhgroup.com/people/ | Careers: https://www.rmhgroup.com/careers/'),
  ('The RMH Group', 'Jeff Elsner, PE', 'Associate Principal, Mechanical Engineer', NULL, '[Denver DC Targeting CT-021]
Priority: P1 | Outreach score: 125 | Source confidence: Official named source
Target lane: Mechanical principal / PE mentor
Location: Lakewood 80215 | 80226 fit: Ideal: near 80226
Entry fit: 5/5 | PE-track value: High
Role keywords: Mechanical Engineer; Mechanical EIT; Mission Critical Engineer; Project Engineer
Why: Official RMH people/contact pages identify this target; RMH is near 80226 and has mission-critical/data-center cooling and power work.
Best ask: Ask who leads junior Mechanical EIT hiring for mission-critical/data-center HVAC, cooling, and construction support.
Source: https://www.rmhgroup.com/people/ | Careers: https://www.rmhgroup.com/careers/'),
  ('The RMH Group', 'Sheila Zappanti, PHR, SPHR', 'Human Resources Director', NULL, '[Denver DC Targeting CT-022]
Priority: P1 | Outreach score: 125 | Source confidence: Official named source
Target lane: Recruiter / HR
Location: Lakewood 80215 | 80226 fit: Ideal: near 80226
Entry fit: 5/5 | PE-track value: High
Role keywords: Mechanical Engineer; Mechanical EIT; Mission Critical Engineer; Project Engineer
Why: Official RMH people/contact pages identify this target; RMH is near 80226 and has mission-critical/data-center cooling and power work.
Best ask: Ask who leads junior Mechanical EIT hiring for mission-critical/data-center HVAC, cooling, and construction support.
Source: https://www.rmhgroup.com/people/ | Careers: https://www.rmhgroup.com/careers/'),
  ('Fleet Data Centers', 'Mislav Crnogorac', 'Vice President, Data Center Engineering', NULL, '[Denver DC Targeting CT-024]
Priority: P1 | Outreach score: 120 | Source confidence: Official named source
Target lane: Owner/developer engineering executive
Location: Denver 80209 | 80226 fit: Good: Cherry Creek / Denver
Entry fit: 4/5 | PE-track value: Medium
Role keywords: Associate Mechanical Engineer; Project Engineer; Design Engineer; Technical Project Coordinator
Why: Fleet leadership page identifies the engineering executive; Fleet is a Denver-based build-to-suit data-center provider.
Best ask: Ask about mechanical design engineering support and owner-side project engineering routes.
Source: https://fleetdatacenters.com/who-we-are/ | Careers: https://fleetdatacenters.com/careers/'),
  ('NREL / National Renewable Energy Laboratory', 'Gilbert Moreno', 'Senior Research Engineer; data-center cooling efficiency project lead', NULL, '[Denver DC Targeting CT-025]
Priority: P1 | Outreach score: 120 | Source confidence: Official named source
Target lane: Research / thermal systems lead
Location: Golden | 80226 fit: Ideal: Golden
Entry fit: 4/5 | PE-track value: Medium
Role keywords: Research Engineer; Data Center Energy Systems Engineer; Thermal/Mechanical Engineer
Why: Public NREL sources connect this target to data-center cooling, energy systems, thermal science, and Golden-area hiring.
Best ask: Ask about entry-level or early-career mechanical/thermal roles supporting data-center cooling and energy systems research.
Source: https://www.nrel.gov/grid/news/program/2023/nrel-joins-effort-to-advance-data-center-cooling-efficiency | Careers: https://www.nrel.gov/careers/'),
  ('PCL Construction', 'Tyler Kautz', 'Vice President, Data Centers; Mission Critical Center of Excellence lead', NULL, '[Denver DC Targeting CT-027]
Priority: P1 | Outreach score: 120 | Source confidence: Official named source
Target lane: Mission-critical executive
Location: Denver / Parker / U.S. | 80226 fit: Good: southeast Denver
Entry fit: 4/5 | PE-track value: Medium
Role keywords: Project Engineer; Field Engineer; MEP Coordinator; Estimating/Preconstruction Engineer
Why: PCL public sources identify a data-center business lead and Denver recruiting/project lanes; PCL has live Colorado data-center construction exposure.
Best ask: Ask where an entry-level BSME/EIT can enter as project engineer or MEP/commissioning support on data-center projects.
Source: https://www.pcl.com/us/en/newsroom/press-releases/pcl-construction-appoints-tyler-kautz-to-lead-data-center-expansion-amid-market-boom | Careers: https://www.pcl.com/careers'),
  ('Enabled Energy', 'Kian Jost', 'Project Engineer / Project Manager path', 'https://www.linkedin.com/in/kian-jost-9a316268', '[Denver DC Targeting CT-029]
Priority: P1 | Outreach score: 118 | Source confidence: Public LinkedIn/source
Target lane: Project engineer / PM
Location: Denver / Lakewood market | 80226 fit: Good: southwest/south metro
Entry fit: 5/5 | PE-track value: Medium
Role keywords: Energy Engineer; Project Engineer; Mechanical Engineer; Controls Engineer
Why: Public Enabled Energy sources connect this target to data-center capacity, reliability, and energy engineering.
Best ask: Ask about junior engineering support for data-center capacity studies, HVAC optimization, retrofits, and commissioning.
Source: https://www.linkedin.com/in/kian-jost-9a316268 | Careers: https://enabledenergy.net/careers/'),
  ('Enabled Energy', 'Phil Staib, PE, DCEP', 'Data-center capacity/energy engineering leader', 'https://www.linkedin.com/in/philstaib', '[Denver DC Targeting CT-030]
Priority: P1 | Outreach score: 118 | Source confidence: Public LinkedIn/source
Target lane: Data-center energy/mechanical lead
Location: Denver / Lakewood market | 80226 fit: Good: southwest/south metro
Entry fit: 5/5 | PE-track value: Medium
Role keywords: Energy Engineer; Project Engineer; Mechanical Engineer; Controls Engineer
Why: Public Enabled Energy sources connect this target to data-center capacity, reliability, and energy engineering.
Best ask: Ask about junior engineering support for data-center capacity studies, HVAC optimization, retrofits, and commissioning.
Source: https://www.linkedin.com/in/philstaib | Careers: https://enabledenergy.net/careers/'),
  ('Olsson', 'Chris Ward, PE', 'Mechanical Engineering Group Leader - Data Centers', 'https://www.linkedin.com/in/chris-ward-p-e-656a2325', '[Denver DC Targeting CT-032]
Priority: P1 | Outreach score: 118 | Source confidence: Public LinkedIn/source
Target lane: Mechanical data-center lead
Location: Denver market / remote | 80226 fit: Good: Denver-market roles
Entry fit: 5/5 | PE-track value: High
Role keywords: Mechanical Engineer EIT - Data Center; Mechanical Project Engineer - Data Center; Design Engineer
Why: Public Olsson roles and profiles connect this target to data-center engineering.
Best ask: Ask whether a Mechanical EIT/new graduate path exists in the data-center group or a related mechanical design team.
Source: https://www.linkedin.com/in/chris-ward-p-e-656a2325 | Careers: https://www.olsson.com/current-openings'),
  ('Olsson', 'Mark Montano, PE, LEED AP', 'Senior Mechanical Engineer - Data Centers', 'https://www.linkedin.com/in/mark-montano-p-e-leed-ap-88ab768', '[Denver DC Targeting CT-033]
Priority: P1 | Outreach score: 118 | Source confidence: Public LinkedIn/source
Target lane: Mechanical data-center lead
Location: Denver market / remote | 80226 fit: Good: Denver-market roles
Entry fit: 5/5 | PE-track value: High
Role keywords: Mechanical Engineer EIT - Data Center; Mechanical Project Engineer - Data Center; Design Engineer
Why: Public Olsson roles and profiles connect this target to data-center engineering.
Best ask: Ask whether a Mechanical EIT/new graduate path exists in the data-center group or a related mechanical design team.
Source: https://www.linkedin.com/in/mark-montano-p-e-leed-ap-88ab768 | Careers: https://www.olsson.com/current-openings'),
  ('RK Industries / RK Mechanical / RK Mission Critical', 'Adam Michel', 'RK Mission Critical leadership target', 'https://www.linkedin.com/in/adam-michel-95a49811', '[Denver DC Targeting CT-034]
Priority: P1 | Outreach score: 118 | Source confidence: Public LinkedIn/source
Target lane: Mission-critical/modular infrastructure lead
Location: Denver / Aurora | 80226 fit: Outer but local metro
Entry fit: 5/5 | PE-track value: Medium
Role keywords: Project Engineer; Mechanical Project Engineer; Manufacturing/Modular Engineer; BIM/VDC
Why: Public RK sources identify mission-critical modular infrastructure and recruiting/leadership channels.
Best ask: Ask about entry-level project engineer, mechanical coordinator, commissioning, and modular data-center infrastructure roles.
Source: https://www.linkedin.com/in/adam-michel-95a49811 | Careers: https://rkindustries.com/careers/'),
  ('RK Industries / RK Mechanical / RK Mission Critical', 'Jesse Davern', 'RK Mission Critical leadership target', 'https://www.linkedin.com/in/jessedavern', '[Denver DC Targeting CT-035]
Priority: P1 | Outreach score: 118 | Source confidence: Public LinkedIn/source
Target lane: Mission-critical/modular infrastructure lead
Location: Denver / Aurora | 80226 fit: Outer but local metro
Entry fit: 5/5 | PE-track value: Medium
Role keywords: Project Engineer; Mechanical Project Engineer; Manufacturing/Modular Engineer; BIM/VDC
Why: Public RK sources identify mission-critical modular infrastructure and recruiting/leadership channels.
Best ask: Ask about entry-level project engineer, mechanical coordinator, commissioning, and modular data-center infrastructure roles.
Source: https://www.linkedin.com/in/jessedavern | Careers: https://rkindustries.com/careers/'),
  ('RK Industries / RK Mechanical / RK Mission Critical', 'Joe Suardi', 'Recruiter / talent acquisition', 'https://www.linkedin.com/in/joe-suardi', '[Denver DC Targeting CT-036]
Priority: P1 | Outreach score: 118 | Source confidence: Public LinkedIn/source
Target lane: Recruiter / talent acquisition
Location: Denver / Aurora | 80226 fit: Outer but local metro
Entry fit: 5/5 | PE-track value: Medium
Role keywords: Project Engineer; Mechanical Project Engineer; Manufacturing/Modular Engineer; BIM/VDC
Why: Public RK sources identify mission-critical modular infrastructure and recruiting/leadership channels.
Best ask: Ask about entry-level project engineer, mechanical coordinator, commissioning, and modular data-center infrastructure roles.
Source: https://www.linkedin.com/in/joe-suardi | Careers: https://rkindustries.com/careers/'),
  ('Burns & McDonnell', 'Danielle Stetzenbach', 'Recruiter', 'https://www.linkedin.com/in/daniellestetzenbach', '[Denver DC Targeting CT-040]
Priority: P1 | Outreach score: 113 | Source confidence: Public LinkedIn/source
Target lane: Recruiter / talent acquisition
Location: Denver | 80226 fit: Good: Denver-market
Entry fit: 4/5 | PE-track value: High
Role keywords: Assistant Mechanical Engineer; Mechanical Engineer; Project Engineer - Mission Critical
Why: Public recruiter profiles and careers sources connect Burns & McDonnell to Denver mission-critical hiring.
Best ask: Ask where an entry-level BSME/EIT candidate fits in the Denver mission-critical/global facilities group.
Source: https://www.linkedin.com/in/daniellestetzenbach | Careers: https://www.burnsmcd.com/careers'),
  ('Burns & McDonnell', 'Eric Heidenreich', 'Staff Recruiter', 'https://www.linkedin.com/in/eric-kinder-heidenreich', '[Denver DC Targeting CT-041]
Priority: P1 | Outreach score: 113 | Source confidence: Public LinkedIn/source
Target lane: Recruiter / talent acquisition
Location: Denver | 80226 fit: Good: Denver-market
Entry fit: 4/5 | PE-track value: High
Role keywords: Assistant Mechanical Engineer; Mechanical Engineer; Project Engineer - Mission Critical
Why: Public recruiter profiles and careers sources connect Burns & McDonnell to Denver mission-critical hiring.
Best ask: Ask where an entry-level BSME/EIT candidate fits in the Denver mission-critical/global facilities group.
Source: https://www.linkedin.com/in/eric-kinder-heidenreich | Careers: https://www.burnsmcd.com/careers'),
  ('Burns & McDonnell', 'Madison Hewitt', 'Recruitment Manager', 'https://www.linkedin.com/in/madisonhewitt1218', '[Denver DC Targeting CT-042]
Priority: P1 | Outreach score: 113 | Source confidence: Public LinkedIn/source
Target lane: Recruiter / talent acquisition
Location: Denver | 80226 fit: Good: Denver-market
Entry fit: 4/5 | PE-track value: High
Role keywords: Assistant Mechanical Engineer; Mechanical Engineer; Project Engineer - Mission Critical
Why: Public recruiter profiles and careers sources connect Burns & McDonnell to Denver mission-critical hiring.
Best ask: Ask where an entry-level BSME/EIT candidate fits in the Denver mission-critical/global facilities group.
Source: https://www.linkedin.com/in/madisonhewitt1218 | Careers: https://www.burnsmcd.com/careers'),
  ('DPR Construction', 'Kyle Alexander', 'Project Manager, DPR Denver', 'https://www.linkedin.com/in/kyle-alexander-7805abb4', '[Denver DC Targeting CT-045]
Priority: P1 | Outreach score: 113 | Source confidence: Public LinkedIn/source
Target lane: Project manager / construction lead
Location: Denver | 80226 fit: Good: Denver-market
Entry fit: 4/5 | PE-track value: Medium
Role keywords: Project Engineer; MEP Project Engineer; Field Engineer; Recent Graduate - Mission Critical
Why: Public DPR sources connect this target to mission-critical construction and Denver recruiting/project leadership.
Best ask: Ask about project engineer paths on data-center, advanced technology, commissioning, and mechanical trade coordination work.
Source: https://www.linkedin.com/in/kyle-alexander-7805abb4 | Careers: https://www.dpr.com/careers'),
  ('DPR Construction', 'Matthew Moses', 'Talent acquisition / recruiter', 'https://www.linkedin.com/in/thematthewmoses', '[Denver DC Targeting CT-046]
Priority: P1 | Outreach score: 113 | Source confidence: Public LinkedIn/source
Target lane: Recruiter / talent acquisition
Location: Denver | 80226 fit: Good: Denver-market
Entry fit: 4/5 | PE-track value: Medium
Role keywords: Project Engineer; MEP Project Engineer; Field Engineer; Recent Graduate - Mission Critical
Why: Public DPR sources connect this target to mission-critical construction and Denver recruiting/project leadership.
Best ask: Ask about project engineer paths on data-center, advanced technology, commissioning, and mechanical trade coordination work.
Source: https://www.linkedin.com/in/thematthewmoses | Careers: https://www.dpr.com/careers'),
  ('HDR', 'Eric Howell', 'Recruiter / talent acquisition', 'https://www.linkedin.com/in/erichowell1', '[Denver DC Targeting CT-048]
Priority: P1 | Outreach score: 113 | Source confidence: Public LinkedIn/source
Target lane: Recruiter / talent acquisition
Location: Denver | 80226 fit: Good: Denver-market
Entry fit: 4/5 | PE-track value: High
Role keywords: Mechanical EIT; Associate Mechanical Engineer; Mission Critical Project Engineer
Why: Public profiles/postings connect HDR Denver to data-center project-management and recruiting channels.
Best ask: Ask for the recruiter or engineering manager handling assistant PM/EIT-level mission-critical roles.
Source: https://www.linkedin.com/in/erichowell1 | Careers: https://www.hdrinc.com/careers'),
  ('Haynes Mechanical Systems', 'Trina M.', 'Recruiter / talent acquisition', 'https://www.linkedin.com/in/trina-m-943152151', '[Denver DC Targeting CT-050]
Priority: P1 | Outreach score: 113 | Source confidence: Public LinkedIn/source
Target lane: Recruiter / talent acquisition
Location: Greenwood Village / Denver | 80226 fit: Good: local metro
Entry fit: 4/5 | PE-track value: Medium
Role keywords: Mechanical Design Engineer; Project Engineer; Lead Mechanical Engineer; HVAC Controls Engineer
Why: Public Haynes sources identify recruiter, executive, and mechanical engineering hiring channels.
Best ask: Ask about entry-level mechanical project engineer/designer roles under PE supervision in HVAC/critical systems.
Source: https://www.linkedin.com/in/trina-m-943152151 | Careers: https://www.haynesmech.com/careers/'),
  ('Murphy Company', 'Wes Johnston', 'Project Manager; hyperscale data-center construction/commissioning experience', 'https://www.linkedin.com/in/wes-m-johnston', '[Denver DC Targeting CT-052]
Priority: P1 | Outreach score: 113 | Source confidence: Public LinkedIn/source
Target lane: Data-center PM / commissioning
Location: Denver / national | 80226 fit: Good: Denver-market
Entry fit: 4/5 | PE-track value: Medium
Role keywords: Project Engineer; Mechanical Project Engineer; Design-Build Engineer; Service Engineer
Why: Public Murphy profiles identify data-center service, project, and recruiting channels.
Best ask: Ask about mechanical project engineer roles tied to data-center service, commissioning, and critical facility upgrades.
Source: https://www.linkedin.com/in/wes-m-johnston | Careers: https://www.murphynet.com/careers/'),
  ('Salas O’Brien', 'Craig Petersen, PE, P.Eng, ATD, CEM', 'Principal; mission-critical mechanical engineering', 'https://www.linkedin.com/in/craig-petersen-pe-p-eng-atd-cem-8bb0448', '[Denver DC Targeting CT-056]
Priority: P1 | Outreach score: 113 | Source confidence: Public LinkedIn/source
Target lane: Mechanical data-center principal
Location: Lakewood / Greenwood Village | 80226 fit: Ideal/Good: Lakewood office plus south-metro MEP office
Entry fit: 4/5 | PE-track value: High
Role keywords: Mechanical Engineer; Mechanical Designer; Commissioning Engineer; Project Engineer
Why: Public Salas O’Brien sources connect this target to data centers, telecom, commissioning, and mechanical engineering.
Best ask: Ask about a junior Mechanical EIT route into data-center/telecom design or commissioning.
Source: https://www.linkedin.com/in/craig-petersen-pe-p-eng-atd-cem-8bb0448 | Careers: https://salasobrien.com/careers/'),
  ('Vantage Data Centers', 'Angel Perry', 'Vantage talent/recruiting target', 'https://www.linkedin.com/in/angel-perry-6a536163', '[Denver DC Targeting CT-060]
Priority: P1 | Outreach score: 113 | Source confidence: Public LinkedIn/source
Target lane: Recruiter / talent acquisition
Location: Denver / Parker | 80226 fit: Good: Denver-market
Entry fit: 4/5 | PE-track value: Medium
Role keywords: Data Center Facilities Engineer; Mechanical Engineer; Project Engineer; Operations Engineer
Why: Public Vantage profiles/postings identify local Denver/Parker channels and mechanical engineering leadership lanes.
Best ask: Ask about early-career critical facilities, project engineer, or mechanical design coordination roles.
Source: https://www.linkedin.com/in/angel-perry-6a536163 | Careers: https://vantage-dc.com/careers/'),
  ('Vantage Data Centers', 'Kristie Fuentes', 'Vantage Parker/Denver talent or operations target', 'https://www.linkedin.com/in/kristie-fuentes-0a27181b', '[Denver DC Targeting CT-061]
Priority: P1 | Outreach score: 113 | Source confidence: Public LinkedIn/source
Target lane: Recruiter / Denver/Parker routing
Location: Denver / Parker | 80226 fit: Good: Denver-market
Entry fit: 4/5 | PE-track value: Medium
Role keywords: Data Center Facilities Engineer; Mechanical Engineer; Project Engineer; Operations Engineer
Why: Public Vantage profiles/postings identify local Denver/Parker channels and mechanical engineering leadership lanes.
Best ask: Ask about early-career critical facilities, project engineer, or mechanical design coordination roles.
Source: https://www.linkedin.com/in/kristie-fuentes-0a27181b | Careers: https://vantage-dc.com/careers/'),
  ('WSP / kW Mission Critical Engineering', 'Austin Brewer, PE', 'Senior Mechanical Engineer at kW/WSP', 'https://www.linkedin.com/in/austin-brewer-pe-b810b211b', '[Denver DC Targeting CT-062]
Priority: P1 | Outreach score: 113 | Source confidence: Public LinkedIn/source
Target lane: Mechanical data-center lead
Location: Denver | 80226 fit: Good: Denver-market
Entry fit: 4/5 | PE-track value: High
Role keywords: Associate Mechanical Engineer; Mechanical Designer; Mission Critical Engineer
Why: Public kW/WSP sources identify a dedicated mission-critical/data-center engineering practice.
Best ask: Ask who manages associate mechanical/data-center openings and whether Denver has junior mechanical capacity needs.
Source: https://www.linkedin.com/in/austin-brewer-pe-b810b211b | Careers: https://www.wsp.com/en-us/careers'),
  ('LONG Building Technologies', 'Brennan Newbrough', 'Technical Recruiter', 'https://www.linkedin.com/in/brennannewbrough', '[Denver DC Targeting CT-076]
Priority: P1 | Outreach score: 108 | Source confidence: Public LinkedIn/source
Target lane: Recruiter / talent acquisition
Location: Littleton / Colorado | 80226 fit: Good: local metro
Entry fit: 3/5 | PE-track value: Medium
Role keywords: Controls Engineer; BAS Engineer; HVAC Project Engineer; Mechanical Controls Specialist
Why: Public LONG sources identify controls/HVAC recruiting and Colorado controls construction leadership paths.
Best ask: Ask about BAS/controls project engineer or applications roles that support mission-critical HVAC and data-center environments.
Source: https://www.linkedin.com/in/brennannewbrough | Careers: https://www.long.com/careers/'),
  ('LONG Building Technologies', 'David Poor', 'Recruiter / talent acquisition', 'https://www.linkedin.com/in/david-poor-b28977105', '[Denver DC Targeting CT-077]
Priority: P1 | Outreach score: 108 | Source confidence: Public LinkedIn/source
Target lane: Recruiter / talent acquisition
Location: Littleton / Colorado | 80226 fit: Good: local metro
Entry fit: 3/5 | PE-track value: Medium
Role keywords: Controls Engineer; BAS Engineer; HVAC Project Engineer; Mechanical Controls Specialist
Why: Public LONG sources identify controls/HVAC recruiting and Colorado controls construction leadership paths.
Best ask: Ask about BAS/controls project engineer or applications roles that support mission-critical HVAC and data-center environments.
Source: https://www.linkedin.com/in/david-poor-b28977105 | Careers: https://www.long.com/careers/'),
  ('MTech Mechanical', 'David Kowalski, PE', 'Preconstruction & Project Manager', 'https://www.linkedin.com/in/davidkowalski-pe', '[Denver DC Targeting CT-078]
Priority: P1 | Outreach score: 108 | Source confidence: Public LinkedIn/source
Target lane: Mechanical preconstruction / PE mentor
Location: Westminster / Denver | 80226 fit: Good: northwest metro
Entry fit: 3/5 | PE-track value: High
Role keywords: Project Engineer; Mechanical EIT; HVAC Design Engineer; Assistant Project Manager
Why: Public MTech profiles identify mechanical preconstruction and project-delivery contacts.
Best ask: Ask about junior project engineer/mechanical engineer roles with design-build HVAC exposure and critical facilities work.
Source: https://www.linkedin.com/in/davidkowalski-pe | Careers: https://mtechg.com/careers/'),
  ('BCER Engineering', 'Chris Schroeder', 'Chief Growth Officer; Associate Principal', NULL, '[Denver DC Targeting CT-090]
Priority: P2 | Outreach score: 105 | Source confidence: Official named source
Target lane: Executive / growth leader
Location: Golden 80401 | 80226 fit: Ideal: Golden / west metro
Entry fit: 5/5 | PE-track value: High
Role keywords: Mechanical Designer; Mechanical Engineer; EIT; Technology/MEP Project Engineer
Why: BCER team pages identify this target; BCER’s Golden office is a high-fit west-metro MEP/technology target.
Best ask: Ask where junior Mechanical EIT candidates fit across mechanical design, technology infrastructure, and data-center-adjacent projects.
Source: https://bcer.com/team/chris-schroeder/ | Careers: https://bcer.com/careers/'),
  ('BCER Engineering', 'David Hughes', 'President; Managing Principal', NULL, '[Denver DC Targeting CT-091]
Priority: P2 | Outreach score: 105 | Source confidence: Official named source
Target lane: Executive / principal
Location: Golden 80401 | 80226 fit: Ideal: Golden / west metro
Entry fit: 5/5 | PE-track value: High
Role keywords: Mechanical Designer; Mechanical Engineer; EIT; Technology/MEP Project Engineer
Why: BCER team pages identify this target; BCER’s Golden office is a high-fit west-metro MEP/technology target.
Best ask: Ask where junior Mechanical EIT candidates fit across mechanical design, technology infrastructure, and data-center-adjacent projects.
Source: https://bcer.com/team/david-hughes/ | Careers: https://bcer.com/careers/'),
  ('BCER Engineering', 'Keith Jones', 'Principal; Business Development Manager', NULL, '[Denver DC Targeting CT-092]
Priority: P2 | Outreach score: 105 | Source confidence: Official named source
Target lane: Business development / internal routing
Location: Golden 80401 | 80226 fit: Ideal: Golden / west metro
Entry fit: 5/5 | PE-track value: High
Role keywords: Mechanical Designer; Mechanical Engineer; EIT; Technology/MEP Project Engineer
Why: BCER team pages identify this target; BCER’s Golden office is a high-fit west-metro MEP/technology target.
Best ask: Ask where junior Mechanical EIT candidates fit across mechanical design, technology infrastructure, and data-center-adjacent projects.
Source: https://bcer.com/team/keith-jones/ | Careers: https://bcer.com/careers/'),
  ('BCER Engineering', 'Travis McNair', 'Director of Technology Operations; Associate', NULL, '[Denver DC Targeting CT-093]
Priority: P2 | Outreach score: 105 | Source confidence: Official named source
Target lane: Technology operations lead
Location: Golden 80401 | 80226 fit: Ideal: Golden / west metro
Entry fit: 5/5 | PE-track value: High
Role keywords: Mechanical Designer; Mechanical Engineer; EIT; Technology/MEP Project Engineer
Why: BCER team pages identify this target; BCER’s Golden office is a high-fit west-metro MEP/technology target.
Best ask: Ask where junior Mechanical EIT candidates fit across mechanical design, technology infrastructure, and data-center-adjacent projects.
Source: https://bcer.com/team/travis-mcnair/ | Careers: https://bcer.com/careers/'),
  ('Cator Ruma & Associates', 'Blake Winter, PE', 'Principal, President', NULL, '[Denver DC Targeting CT-094]
Priority: P2 | Outreach score: 105 | Source confidence: Official named source
Target lane: Executive / principal
Location: Lakewood 80401 | 80226 fit: Ideal: Lakewood/Golden corridor
Entry fit: 5/5 | PE-track value: High
Role keywords: Mechanical Engineer; Mechanical EIT; Commissioning Engineer; Project Coordinator
Why: Official leadership page lists this person; Cator Ruma is in Lakewood and has a mission-critical practice for data-center MEP/commissioning.
Best ask: Ask about junior Mechanical EIT support for mission-critical MEP design, commissioning, and PE-track mentoring.
Source: https://catorruma.com/company/ | Careers: https://catorruma.com/careers/'),
  ('Cator Ruma & Associates', 'Michael Meints, PE', 'Principal, Chief Executive Officer', NULL, '[Denver DC Targeting CT-095]
Priority: P2 | Outreach score: 105 | Source confidence: Official named source
Target lane: Executive / principal
Location: Lakewood 80401 | 80226 fit: Ideal: Lakewood/Golden corridor
Entry fit: 5/5 | PE-track value: High
Role keywords: Mechanical Engineer; Mechanical EIT; Commissioning Engineer; Project Coordinator
Why: Official leadership page lists this person; Cator Ruma is in Lakewood and has a mission-critical practice for data-center MEP/commissioning.
Best ask: Ask about junior Mechanical EIT support for mission-critical MEP design, commissioning, and PE-track mentoring.
Source: https://catorruma.com/company/ | Careers: https://catorruma.com/careers/'),
  ('The RMH Group', 'Jason Beu, PE', 'Associate, Mechanical Engineer', NULL, '[Denver DC Targeting CT-098]
Priority: P2 | Outreach score: 105 | Source confidence: Official named source
Target lane: Mechanical PE mentor
Location: Lakewood 80215 | 80226 fit: Ideal: near 80226
Entry fit: 5/5 | PE-track value: High
Role keywords: Mechanical Engineer; Mechanical EIT; Mission Critical Engineer; Project Engineer
Why: Official RMH people/contact pages identify this target; RMH is near 80226 and has mission-critical/data-center cooling and power work.
Best ask: Ask who leads junior Mechanical EIT hiring for mission-critical/data-center HVAC, cooling, and construction support.
Source: https://www.rmhgroup.com/people/ | Careers: https://www.rmhgroup.com/careers/'),
  ('The RMH Group', 'Matt Guerin, PE', 'Associate, Marketing/Business Development Manager', NULL, '[Denver DC Targeting CT-099]
Priority: P2 | Outreach score: 105 | Source confidence: Official named source
Target lane: Business development / internal routing
Location: Lakewood 80215 | 80226 fit: Ideal: near 80226
Entry fit: 5/5 | PE-track value: High
Role keywords: Mechanical Engineer; Mechanical EIT; Mission Critical Engineer; Project Engineer
Why: Official RMH people/contact pages identify this target; RMH is near 80226 and has mission-critical/data-center cooling and power work.
Best ask: Ask who leads junior Mechanical EIT hiring for mission-critical/data-center HVAC, cooling, and construction support.
Source: https://www.rmhgroup.com/people/ | Careers: https://www.rmhgroup.com/careers/'),
  ('The RMH Group', 'Michelle Swanson, PE', 'Principal, District Energy Market Leader', NULL, '[Denver DC Targeting CT-100]
Priority: P2 | Outreach score: 105 | Source confidence: Official named source
Target lane: Mechanical / energy systems leader
Location: Lakewood 80215 | 80226 fit: Ideal: near 80226
Entry fit: 5/5 | PE-track value: High
Role keywords: Mechanical Engineer; Mechanical EIT; Mission Critical Engineer; Project Engineer
Why: Official RMH people/contact pages identify this target; RMH is near 80226 and has mission-critical/data-center cooling and power work.
Best ask: Ask who leads junior Mechanical EIT hiring for mission-critical/data-center HVAC, cooling, and construction support.
Source: https://www.rmhgroup.com/people/ | Careers: https://www.rmhgroup.com/careers/'),
  ('The RMH Group', 'Mike Watkins, PE', 'Principal, President', NULL, '[Denver DC Targeting CT-101]
Priority: P2 | Outreach score: 105 | Source confidence: Official named source
Target lane: Executive / principal
Location: Lakewood 80215 | 80226 fit: Ideal: near 80226
Entry fit: 5/5 | PE-track value: High
Role keywords: Mechanical Engineer; Mechanical EIT; Mission Critical Engineer; Project Engineer
Why: Official RMH people/contact pages identify this target; RMH is near 80226 and has mission-critical/data-center cooling and power work.
Best ask: Ask who leads junior Mechanical EIT hiring for mission-critical/data-center HVAC, cooling, and construction support.
Source: https://www.rmhgroup.com/people/ | Careers: https://www.rmhgroup.com/careers/'),
  ('NREL / National Renewable Energy Laboratory', 'Jiazhen Ling', 'Data-center cooling efficiency research support/lead', NULL, '[Denver DC Targeting CT-104]
Priority: P2 | Outreach score: 100 | Source confidence: Official named source
Target lane: Research / thermal systems lead
Location: Golden | 80226 fit: Ideal: Golden
Entry fit: 4/5 | PE-track value: Medium
Role keywords: Research Engineer; Data Center Energy Systems Engineer; Thermal/Mechanical Engineer
Why: Public NREL sources connect this target to data-center cooling, energy systems, thermal science, and Golden-area hiring.
Best ask: Ask about entry-level or early-career mechanical/thermal roles supporting data-center cooling and energy systems research.
Source: https://www.nrel.gov/news/detail/program/2023/nrel-joins-effort-to-advance-data-center-cooling-efficiency | Careers: https://www.nrel.gov/careers/'),
  ('IMEG', 'Craig Watts', 'Senior Principal / Project Executive', 'https://www.linkedin.com/in/craig-watts-2150a4a', '[Denver DC Targeting CT-105]
Priority: P2 | Outreach score: 98 | Source confidence: Public LinkedIn/source
Target lane: Project executive / principal
Location: Denver / Greenwood Village | 80226 fit: Good: south metro within practical range
Entry fit: 5/5 | PE-track value: High
Role keywords: Mechanical Engineering New Grad; Mechanical Project Engineer; Mission Critical Mechanical EIT
Why: Public IMEG data-center and job sources identify this as a strong Denver MEP/data-center target.
Best ask: Ask about Mechanical Project Engineer/New Grad fit for data centers, central utility plants, and mission-critical HVAC.
Source: https://www.linkedin.com/in/craig-watts-2150a4a | Careers: https://www.imegcorp.com/careers/'),
  ('Olsson', 'Eric Granzow, PE, LEED AP, HFDP, CEM, SASHE', 'Technical Lead, Mechanical/Electrical', 'https://www.linkedin.com/in/eric-granzow-pe-leed-ap-hfdp-cem-sashe-40365b13', '[Denver DC Targeting CT-106]
Priority: P2 | Outreach score: 98 | Source confidence: Public LinkedIn/source
Target lane: Technical MEP lead
Location: Denver market / remote | 80226 fit: Good: Denver-market roles
Entry fit: 5/5 | PE-track value: High
Role keywords: Mechanical Engineer EIT - Data Center; Mechanical Project Engineer - Data Center; Design Engineer
Why: Public Olsson roles and profiles connect this target to data-center engineering.
Best ask: Ask whether a Mechanical EIT/new graduate path exists in the data-center group or a related mechanical design team.
Source: https://www.linkedin.com/in/eric-granzow-pe-leed-ap-hfdp-cem-sashe-40365b13 | Careers: https://www.olsson.com/current-openings'),
  ('Olsson', 'Tim Danner, PE', 'Team Leader - Mechanical/Electrical Engineering', 'https://www.linkedin.com/in/timdannerpe', '[Denver DC Targeting CT-107]
Priority: P2 | Outreach score: 98 | Source confidence: Public LinkedIn/source
Target lane: MEP team leader
Location: Denver market / remote | 80226 fit: Good: Denver-market roles
Entry fit: 5/5 | PE-track value: High
Role keywords: Mechanical Engineer EIT - Data Center; Mechanical Project Engineer - Data Center; Design Engineer
Why: Public Olsson roles and profiles connect this target to data-center engineering.
Best ask: Ask whether a Mechanical EIT/new graduate path exists in the data-center group or a related mechanical design team.
Source: https://www.linkedin.com/in/timdannerpe | Careers: https://www.olsson.com/current-openings'),
  ('RK Industries / RK Mechanical / RK Mission Critical', 'Rick Kinning', 'RK executive leadership target', 'https://www.linkedin.com/in/rick-l-kinning-8a2a5333', '[Denver DC Targeting CT-108]
Priority: P2 | Outreach score: 98 | Source confidence: Public LinkedIn/source
Target lane: Executive / operations
Location: Denver / Aurora | 80226 fit: Outer but local metro
Entry fit: 5/5 | PE-track value: Medium
Role keywords: Project Engineer; Mechanical Project Engineer; Manufacturing/Modular Engineer; BIM/VDC
Why: Public RK sources identify mission-critical modular infrastructure and recruiting/leadership channels.
Best ask: Ask about entry-level project engineer, mechanical coordinator, commissioning, and modular data-center infrastructure roles.
Source: https://www.linkedin.com/in/rick-l-kinning-8a2a5333 | Careers: https://rkindustries.com/careers/'),
  ('Swanson Rink', 'Dustin Mahoney', 'Senior Project Manager', NULL, '[Denver DC Targeting CT-109]
Priority: P2 | Outreach score: 98 | Source confidence: Public LinkedIn/source
Target lane: Mission-critical/project management
Location: Denver 80203 | 80226 fit: Good: central Denver
Entry fit: 5/5 | PE-track value: High
Role keywords: Mechanical Engineer; Mechanical Engineer EIT; Technology Integration Mechanical Engineer; Entry-Level Engineer
Why: Public Swanson Rink sources identify this target; the firm explicitly hires mechanical engineers and does data-center MEP/technology infrastructure.
Best ask: Ask about Mechanical Engineer/EIT roles supporting data-center mechanical systems, CFD, controls, and project delivery.
Source: https://www.linkedin.com/jobs/view/senior-project-manager-at-swanson-rink-4395384073 | Careers: https://swansonrink.com/careers/'),
  ('U.S. Engineering', 'Marcello Baltierra', 'U.S. Engineering project/preconstruction target', 'https://www.linkedin.com/in/marcello-baltierra-88a738167', '[Denver DC Targeting CT-110]
Priority: P2 | Outreach score: 98 | Source confidence: Public LinkedIn/source
Target lane: Mechanical project/preconstruction lead
Location: Denver / Westminster | 80226 fit: Good: northwest metro
Entry fit: 5/5 | PE-track value: Medium
Role keywords: Project Engineer; Mechanical Project Engineer; Preconstruction Engineer; BIM/VDC Engineer
Why: Public U.S. Engineering sources show Denver project engineer and mechanical contracting pathways.
Best ask: Ask about MEP project engineer roles that touch data-center, prefabrication, commissioning, and critical systems.
Source: https://www.linkedin.com/in/marcello-baltierra-88a738167 | Careers: https://www.usengineering.com/careers/'),
  ('U.S. Engineering', 'Ryan Purdy', 'U.S. Engineering project/preconstruction target', 'https://www.linkedin.com/in/ryan-purdy-47494a197', '[Denver DC Targeting CT-111]
Priority: P2 | Outreach score: 98 | Source confidence: Public LinkedIn/source
Target lane: Mechanical project/preconstruction lead
Location: Denver / Westminster | 80226 fit: Good: northwest metro
Entry fit: 5/5 | PE-track value: Medium
Role keywords: Project Engineer; Mechanical Project Engineer; Preconstruction Engineer; BIM/VDC Engineer
Why: Public U.S. Engineering sources show Denver project engineer and mechanical contracting pathways.
Best ask: Ask about MEP project engineer roles that touch data-center, prefabrication, commissioning, and critical systems.
Source: https://www.linkedin.com/in/ryan-purdy-47494a197 | Careers: https://www.usengineering.com/careers/'),
  ('DPR Construction', 'Brad Claussen', 'DPR Denver project/construction leader', 'https://www.linkedin.com/in/brad-claussen-89571241', '[Denver DC Targeting CT-113]
Priority: P2 | Outreach score: 93 | Source confidence: Public LinkedIn/source
Target lane: Project executive / operations
Location: Denver | 80226 fit: Good: Denver-market
Entry fit: 4/5 | PE-track value: Medium
Role keywords: Project Engineer; MEP Project Engineer; Field Engineer; Recent Graduate - Mission Critical
Why: Public DPR sources connect this target to mission-critical construction and Denver recruiting/project leadership.
Best ask: Ask about project engineer paths on data-center, advanced technology, commissioning, and mechanical trade coordination work.
Source: https://www.linkedin.com/in/brad-claussen-89571241 | Careers: https://www.dpr.com/careers'),
  ('Flexential', 'Jeffrey Rogers, PMP, CxA, CDCPM', 'Data-center operations/commissioning target', 'https://www.linkedin.com/in/jeffrey-rogers-pmp-cxa-cdcpm-b08644288', '[Denver DC Targeting CT-114]
Priority: P2 | Outreach score: 93 | Source confidence: Public LinkedIn/source
Target lane: Critical facilities / commissioning
Location: Denver / Parker | 80226 fit: Outer for Parker; Englewood closer
Entry fit: 4/5 | PE-track value: Medium
Role keywords: Critical Facilities Engineer; Data Center Engineer; Project Engineer; Mechanical Facilities Engineer
Why: Public Flexential profile connects this target to data-center operations/commissioning credentials.
Best ask: Ask about critical facilities engineer and project support paths at the Parker/Denver facility.
Source: https://www.linkedin.com/in/jeffrey-rogers-pmp-cxa-cdcpm-b08644288 | Careers: https://www.flexential.com/careers'),
  ('HDR', 'Cheryl Rountree', 'Human resources / talent', 'https://www.linkedin.com/in/cheryl-rountree-29805a12', '[Denver DC Targeting CT-115]
Priority: P2 | Outreach score: 93 | Source confidence: Public LinkedIn/source
Target lane: Recruiter / HR
Location: Denver | 80226 fit: Good: Denver-market
Entry fit: 4/5 | PE-track value: High
Role keywords: Mechanical EIT; Associate Mechanical Engineer; Mission Critical Project Engineer
Why: Public profiles/postings connect HDR Denver to data-center project-management and recruiting channels.
Best ask: Ask for the recruiter or engineering manager handling assistant PM/EIT-level mission-critical roles.
Source: https://www.linkedin.com/in/cheryl-rountree-29805a12 | Careers: https://www.hdrinc.com/careers'),
  ('HDR', 'Kevin Decker', 'Denver HDR contact / leader', 'https://www.linkedin.com/in/kevin-decker-38b7235a', '[Denver DC Targeting CT-117]
Priority: P2 | Outreach score: 93 | Source confidence: Public LinkedIn/source
Target lane: Local office routing
Location: Denver | 80226 fit: Good: Denver-market
Entry fit: 4/5 | PE-track value: High
Role keywords: Mechanical EIT; Associate Mechanical Engineer; Mission Critical Project Engineer
Why: Public profiles/postings connect HDR Denver to data-center project-management and recruiting channels.
Best ask: Ask for the recruiter or engineering manager handling assistant PM/EIT-level mission-critical roles.
Source: https://www.linkedin.com/in/kevin-decker-38b7235a | Careers: https://www.hdrinc.com/careers'),
  ('Haynes Mechanical Systems', 'Mark Hermanson', 'Vice President', 'https://www.linkedin.com/in/markrhermanson', '[Denver DC Targeting CT-119]
Priority: P2 | Outreach score: 93 | Source confidence: Public LinkedIn/source
Target lane: Executive / operations
Location: Greenwood Village / Denver | 80226 fit: Good: local metro
Entry fit: 4/5 | PE-track value: Medium
Role keywords: Mechanical Design Engineer; Project Engineer; Lead Mechanical Engineer; HVAC Controls Engineer
Why: Public Haynes sources identify recruiter, executive, and mechanical engineering hiring channels.
Best ask: Ask about entry-level mechanical project engineer/designer roles under PE supervision in HVAC/critical systems.
Source: https://www.linkedin.com/in/markrhermanson | Careers: https://www.haynesmech.com/careers/'),
  ('Holder Construction', 'Callie Short Alexander', 'Holder talent/recruiting target', 'https://www.linkedin.com/in/callie-short-alexander-8826aa117', '[Denver DC Targeting CT-120]
Priority: P2 | Outreach score: 93 | Source confidence: Public LinkedIn/source
Target lane: Recruiter / talent acquisition
Location: Denver / national | 80226 fit: Good: south metro
Entry fit: 4/5 | PE-track value: Medium
Role keywords: MEP Engineer; Project Engineer; Assistant Superintendent; Preconstruction Engineer
Why: Public Holder profiles identify project executive/recruiting channels for a major data-center builder.
Best ask: Ask about project engineer and MEP-coordination roles on mission-critical/data-center projects.
Source: https://www.linkedin.com/in/callie-short-alexander-8826aa117 | Careers: https://www.holderconstruction.com/careers/'),
  ('Holder Construction', 'Tom Dobson', 'Senior Vice President at Holder Construction', 'https://www.linkedin.com/in/tomdobson', '[Denver DC Targeting CT-121]
Priority: P2 | Outreach score: 93 | Source confidence: Public LinkedIn/source
Target lane: Project executive / operations
Location: Denver / national | 80226 fit: Good: south metro
Entry fit: 4/5 | PE-track value: Medium
Role keywords: MEP Engineer; Project Engineer; Assistant Superintendent; Preconstruction Engineer
Why: Public Holder profiles identify project executive/recruiting channels for a major data-center builder.
Best ask: Ask about project engineer and MEP-coordination roles on mission-critical/data-center projects.
Source: https://www.linkedin.com/in/tomdobson | Careers: https://www.holderconstruction.com/careers/'),
  ('Murphy Company', 'Paige Theby', 'Murphy recruiting/talent target', 'https://www.linkedin.com/in/paige-theby', '[Denver DC Targeting CT-122]
Priority: P2 | Outreach score: 93 | Source confidence: Public LinkedIn/source
Target lane: Recruiter / talent acquisition
Location: Denver / national | 80226 fit: Good: Denver-market
Entry fit: 4/5 | PE-track value: Medium
Role keywords: Project Engineer; Mechanical Project Engineer; Design-Build Engineer; Service Engineer
Why: Public Murphy profiles identify data-center service, project, and recruiting channels.
Best ask: Ask about mechanical project engineer roles tied to data-center service, commissioning, and critical facility upgrades.
Source: https://www.linkedin.com/in/paige-theby | Careers: https://www.murphynet.com/careers/'),
  ('Murphy Company', 'Tim Brimer', 'Account Manager; data-center manager experience', 'https://www.linkedin.com/in/tim-brimer-67869510', '[Denver DC Targeting CT-123]
Priority: P2 | Outreach score: 93 | Source confidence: Public LinkedIn/source
Target lane: Data-center account/project lead
Location: Denver / national | 80226 fit: Good: Denver-market
Entry fit: 4/5 | PE-track value: Medium
Role keywords: Project Engineer; Mechanical Project Engineer; Design-Build Engineer; Service Engineer
Why: Public Murphy profiles identify data-center service, project, and recruiting channels.
Best ask: Ask about mechanical project engineer roles tied to data-center service, commissioning, and critical facility upgrades.
Source: https://www.linkedin.com/in/tim-brimer-67869510 | Careers: https://www.murphynet.com/careers/'),
  ('NREL / National Renewable Energy Laboratory', 'Dane Christensen', 'NREL buildings/data-center energy research target', 'https://www.linkedin.com/in/danetchristensen', '[Denver DC Targeting CT-124]
Priority: P2 | Outreach score: 93 | Source confidence: Public LinkedIn/source
Target lane: Research / energy systems lead
Location: Golden | 80226 fit: Ideal: Golden
Entry fit: 4/5 | PE-track value: Medium
Role keywords: Research Engineer; Data Center Energy Systems Engineer; Thermal/Mechanical Engineer
Why: Public NREL sources connect this target to data-center cooling, energy systems, thermal science, and Golden-area hiring.
Best ask: Ask about entry-level or early-career mechanical/thermal roles supporting data-center cooling and energy systems research.
Source: https://www.linkedin.com/in/danetchristensen | Careers: https://www.nrel.gov/careers/'),
  ('NREL / National Renewable Energy Laboratory', 'Michael Martin', 'NREL fluid flow/heat transfer research target', 'https://www.linkedin.com/in/martinm2', '[Denver DC Targeting CT-125]
Priority: P2 | Outreach score: 93 | Source confidence: Public LinkedIn/source
Target lane: Thermal/fluids research lead
Location: Golden | 80226 fit: Ideal: Golden
Entry fit: 4/5 | PE-track value: Medium
Role keywords: Research Engineer; Data Center Energy Systems Engineer; Thermal/Mechanical Engineer
Why: Public NREL sources connect this target to data-center cooling, energy systems, thermal science, and Golden-area hiring.
Best ask: Ask about entry-level or early-career mechanical/thermal roles supporting data-center cooling and energy systems research.
Source: https://www.linkedin.com/in/martinm2 | Careers: https://www.nrel.gov/careers/'),
  ('PCL Construction', 'Ankit Sanghvi', 'PCL project leadership target', 'https://www.linkedin.com/in/ankit-sanghvi-66b6487', '[Denver DC Targeting CT-126]
Priority: P2 | Outreach score: 93 | Source confidence: Public LinkedIn/source
Target lane: Project manager / operations
Location: Denver / Parker / U.S. | 80226 fit: Good: southeast Denver
Entry fit: 4/5 | PE-track value: Medium
Role keywords: Project Engineer; Field Engineer; MEP Coordinator; Estimating/Preconstruction Engineer
Why: PCL public sources identify a data-center business lead and Denver recruiting/project lanes; PCL has live Colorado data-center construction exposure.
Best ask: Ask where an entry-level BSME/EIT can enter as project engineer or MEP/commissioning support on data-center projects.
Source: https://www.linkedin.com/in/ankit-sanghvi-66b6487 | Careers: https://www.pcl.com/careers'),
  ('PCL Construction', 'Kate McGhee', 'PCL talent/recruiting target', 'https://www.linkedin.com/in/katemcghee1', '[Denver DC Targeting CT-127]
Priority: P2 | Outreach score: 93 | Source confidence: Public LinkedIn/source
Target lane: Recruiter / talent acquisition
Location: Denver / Parker / U.S. | 80226 fit: Good: southeast Denver
Entry fit: 4/5 | PE-track value: Medium
Role keywords: Project Engineer; Field Engineer; MEP Coordinator; Estimating/Preconstruction Engineer
Why: PCL public sources identify a data-center business lead and Denver recruiting/project lanes; PCL has live Colorado data-center construction exposure.
Best ask: Ask where an entry-level BSME/EIT can enter as project engineer or MEP/commissioning support on data-center projects.
Source: https://www.linkedin.com/in/katemcghee1 | Careers: https://www.pcl.com/careers'),
  ('PCL Construction', 'Kyle Chism', 'PCL construction/project leadership target', 'https://www.linkedin.com/in/kyle-chism', '[Denver DC Targeting CT-128]
Priority: P2 | Outreach score: 93 | Source confidence: Public LinkedIn/source
Target lane: Project executive / operations
Location: Denver / Parker / U.S. | 80226 fit: Good: southeast Denver
Entry fit: 4/5 | PE-track value: Medium
Role keywords: Project Engineer; Field Engineer; MEP Coordinator; Estimating/Preconstruction Engineer
Why: PCL public sources identify a data-center business lead and Denver recruiting/project lanes; PCL has live Colorado data-center construction exposure.
Best ask: Ask where an entry-level BSME/EIT can enter as project engineer or MEP/commissioning support on data-center projects.
Source: https://www.linkedin.com/in/kyle-chism | Careers: https://www.pcl.com/careers'),
  ('PCL Construction', 'Michelle D. Curry', 'PCL talent/recruiting target', 'https://www.linkedin.com/in/michelledcurry', '[Denver DC Targeting CT-129]
Priority: P2 | Outreach score: 93 | Source confidence: Public LinkedIn/source
Target lane: Recruiter / talent acquisition
Location: Denver / Parker / U.S. | 80226 fit: Good: southeast Denver
Entry fit: 4/5 | PE-track value: Medium
Role keywords: Project Engineer; Field Engineer; MEP Coordinator; Estimating/Preconstruction Engineer
Why: PCL public sources identify a data-center business lead and Denver recruiting/project lanes; PCL has live Colorado data-center construction exposure.
Best ask: Ask where an entry-level BSME/EIT can enter as project engineer or MEP/commissioning support on data-center projects.
Source: https://www.linkedin.com/in/michelledcurry | Careers: https://www.pcl.com/careers'),
  ('Salas O’Brien', 'Fred Miller', 'Data-center / critical infrastructure leader', 'https://www.linkedin.com/in/fred-miller-btn', '[Denver DC Targeting CT-130]
Priority: P2 | Outreach score: 93 | Source confidence: Public LinkedIn/source
Target lane: Mission-critical practice lead
Location: Lakewood / Greenwood Village | 80226 fit: Ideal/Good: Lakewood office plus south-metro MEP office
Entry fit: 4/5 | PE-track value: High
Role keywords: Mechanical Engineer; Mechanical Designer; Commissioning Engineer; Project Engineer
Why: Public Salas O’Brien sources connect this target to data centers, telecom, commissioning, and mechanical engineering.
Best ask: Ask about a junior Mechanical EIT route into data-center/telecom design or commissioning.
Source: https://www.linkedin.com/in/fred-miller-btn | Careers: https://salasobrien.com/careers/'),
  ('WSP / kW Mission Critical Engineering', 'Taha Ahmed, PE', 'WSP/kW mission-critical mechanical engineering target', 'https://www.linkedin.com/in/taha-ahmed-pe-2366b7a6', '[Denver DC Targeting CT-132]
Priority: P2 | Outreach score: 93 | Source confidence: Public LinkedIn/source
Target lane: Mechanical data-center lead
Location: Denver | 80226 fit: Good: Denver-market
Entry fit: 4/5 | PE-track value: High
Role keywords: Associate Mechanical Engineer; Mechanical Designer; Mission Critical Engineer
Why: Public kW/WSP sources identify a dedicated mission-critical/data-center engineering practice.
Best ask: Ask who manages associate mechanical/data-center openings and whether Denver has junior mechanical capacity needs.
Source: https://www.linkedin.com/in/taha-ahmed-pe-2366b7a6 | Careers: https://www.wsp.com/en-us/careers'),
  ('LONG Building Technologies', 'Stephen Clark', 'Service Manager', 'https://www.linkedin.com/in/stephen-lane-clark', '[Denver DC Targeting CT-143]
Priority: P2 | Outreach score: 88 | Source confidence: Public LinkedIn/source
Target lane: Controls/HVAC service leader
Location: Littleton / Colorado | 80226 fit: Good: local metro
Entry fit: 3/5 | PE-track value: Medium
Role keywords: Controls Engineer; BAS Engineer; HVAC Project Engineer; Mechanical Controls Specialist
Why: Public LONG sources identify controls/HVAC recruiting and Colorado controls construction leadership paths.
Best ask: Ask about BAS/controls project engineer or applications roles that support mission-critical HVAC and data-center environments.
Source: https://www.linkedin.com/in/stephen-lane-clark | Careers: https://www.long.com/careers/'),
  ('MTech Mechanical', 'Connor Hart', 'MTech project/engineering target', 'https://www.linkedin.com/in/connor-hart-1a3682162', '[Denver DC Targeting CT-144]
Priority: P2 | Outreach score: 88 | Source confidence: Public LinkedIn/source
Target lane: Project engineer / operations
Location: Westminster / Denver | 80226 fit: Good: northwest metro
Entry fit: 3/5 | PE-track value: High
Role keywords: Project Engineer; Mechanical EIT; HVAC Design Engineer; Assistant Project Manager
Why: Public MTech profiles identify mechanical preconstruction and project-delivery contacts.
Best ask: Ask about junior project engineer/mechanical engineer roles with design-build HVAC exposure and critical facilities work.
Source: https://www.linkedin.com/in/connor-hart-1a3682162 | Careers: https://mtechg.com/careers/'),
  ('MTech Mechanical', 'Justin Schmidt', 'MTech project/operations target', 'https://www.linkedin.com/in/justin-schmidt-16348975', '[Denver DC Targeting CT-145]
Priority: P2 | Outreach score: 88 | Source confidence: Public LinkedIn/source
Target lane: Project manager / operations
Location: Westminster / Denver | 80226 fit: Good: northwest metro
Entry fit: 3/5 | PE-track value: High
Role keywords: Project Engineer; Mechanical EIT; HVAC Design Engineer; Assistant Project Manager
Why: Public MTech profiles identify mechanical preconstruction and project-delivery contacts.
Best ask: Ask about junior project engineer/mechanical engineer roles with design-build HVAC exposure and critical facilities work.
Source: https://www.linkedin.com/in/justin-schmidt-16348975 | Careers: https://mtechg.com/careers/'),
  ('NEI Electric Power Engineering', 'Clifton Oertli', 'President', 'https://www.linkedin.com/in/coertli', '[Denver DC Targeting CT-146]
Priority: P2 | Outreach score: 88 | Source confidence: Public LinkedIn/source
Target lane: Executive / power engineering leadership
Location: Lakewood / Denver | 80226 fit: Ideal: Lakewood
Entry fit: 2/5 | PE-track value: Medium
Role keywords: Project Engineer; Power Engineer; Data Center Infrastructure Engineer
Why: Public NEI sources identify power engineering and talent acquisition lanes relevant to data-center infrastructure.
Best ask: Ask who handles EIT-level engineering hiring for data-center power infrastructure and utility-side projects.
Source: https://www.linkedin.com/in/coertli | Careers: https://neiengineering.com/careers/'),
  ('NEI Electric Power Engineering', 'Jim Scolaro', 'NEI leadership/business development target', 'https://www.linkedin.com/in/jimscolaro', '[Denver DC Targeting CT-147]
Priority: P2 | Outreach score: 88 | Source confidence: Public LinkedIn/source
Target lane: Power infrastructure leadership
Location: Lakewood / Denver | 80226 fit: Ideal: Lakewood
Entry fit: 2/5 | PE-track value: Medium
Role keywords: Project Engineer; Power Engineer; Data Center Infrastructure Engineer
Why: Public NEI sources identify power engineering and talent acquisition lanes relevant to data-center infrastructure.
Best ask: Ask who handles EIT-level engineering hiring for data-center power infrastructure and utility-side projects.
Source: https://www.linkedin.com/in/jimscolaro | Careers: https://neiengineering.com/careers/'),
  ('NEI Electric Power Engineering', 'Megan Mario', 'NEI talent / operations target', 'https://www.linkedin.com/in/meganmario', '[Denver DC Targeting CT-148]
Priority: P2 | Outreach score: 88 | Source confidence: Public LinkedIn/source
Target lane: Recruiter / people operations
Location: Lakewood / Denver | 80226 fit: Ideal: Lakewood
Entry fit: 2/5 | PE-track value: Medium
Role keywords: Project Engineer; Power Engineer; Data Center Infrastructure Engineer
Why: Public NEI sources identify power engineering and talent acquisition lanes relevant to data-center infrastructure.
Best ask: Ask who handles EIT-level engineering hiring for data-center power infrastructure and utility-side projects.
Source: https://www.linkedin.com/in/meganmario | Careers: https://neiengineering.com/careers/'),
  ('Albireo Energy', 'Larry Wash', 'CEO / Chairman', NULL, '[Denver DC Targeting CT-168]
Priority: P3 | Outreach score: 80 | Source confidence: Official named source
Target lane: Executive / controls leader
Location: Denver / national | 80226 fit: Good: local metro
Entry fit: 4/5 | PE-track value: Medium
Role keywords: Associate Controls Engineer; BAS Project Engineer; Application Engineer; Commissioning Technician/Engineer
Why: Public leadership source identifies Albireo’s executive channel; Albireo postings show project engineer/BMS roles.
Best ask: Ask to route to the Denver/Colorado recruiter or project executive for BMS controls roles in critical facilities.
Source: https://albireoenergy.com/leadership/ | Careers: https://albireoenergy.com/careers/'),
  ('Murphy Company', 'Cody White', 'Murphy project/operations target', 'https://www.linkedin.com/in/cody-white-62a4481b0', '[Denver DC Targeting CT-169]
Priority: P3 | Outreach score: 73 | Source confidence: Public LinkedIn/source
Target lane: Project manager / operations
Location: Denver / national | 80226 fit: Good: Denver-market
Entry fit: 4/5 | PE-track value: Medium
Role keywords: Project Engineer; Mechanical Project Engineer; Design-Build Engineer; Service Engineer
Why: Public Murphy profiles identify data-center service, project, and recruiting channels.
Best ask: Ask about mechanical project engineer roles tied to data-center service, commissioning, and critical facility upgrades.
Source: https://www.linkedin.com/in/cody-white-62a4481b0 | Careers: https://www.murphynet.com/careers/'),
  ('Murphy Company', 'Eleanor Skinner', 'Murphy people/talent target', 'https://www.linkedin.com/in/skinnerec', '[Denver DC Targeting CT-170]
Priority: P3 | Outreach score: 73 | Source confidence: Public LinkedIn/source
Target lane: Recruiter / HR
Location: Denver / national | 80226 fit: Good: Denver-market
Entry fit: 4/5 | PE-track value: Medium
Role keywords: Project Engineer; Mechanical Project Engineer; Design-Build Engineer; Service Engineer
Why: Public Murphy profiles identify data-center service, project, and recruiting channels.
Best ask: Ask about mechanical project engineer roles tied to data-center service, commissioning, and critical facility upgrades.
Source: https://www.linkedin.com/in/skinnerec | Careers: https://www.murphynet.com/careers/')
) AS v(companyname, contactname, title, linkedin, notes)
WHERE NOT EXISTS (SELECT 1 FROM contacts c WHERE c.companyname=v.companyname AND c.contactname=v.contactname);

-- ===== EXISTING CONTACTS: tag with workbook targeting reference =====
UPDATE contacts SET notes = COALESCE(notes,'') || ' | [Denver DC Targeting CT-015] P:P1 Score:125 Lane:Mechanical/engineering principal'
  WHERE companyname='Swanson Rink' AND contactname='Gary Orazio' AND notes NOT LIKE '%CT-015%';
UPDATE contacts SET notes = COALESCE(notes,'') || ' | [Denver DC Targeting CT-016] P:P1 Score:125 Lane:Mission-critical engineering executive'
  WHERE companyname='Swanson Rink' AND contactname='Tim Chiddix' AND notes NOT LIKE '%CT-016%';
UPDATE contacts SET notes = COALESCE(notes,'') || ' | [Denver DC Targeting CT-096] P:P2 Score:105 Lane:Executive / principal'
  WHERE companyname='Swanson Rink' AND contactname='Rachel Barrett' AND notes NOT LIKE '%CT-096%';
