export const TODAY_EXCLUDED_NICHES = [
  "Skiing",
  "Woodworking / Furniture / Cabinetry / Prototyping",
  "Acoustics / Audio / Musical Instruments",
  "Outdoor Recreation & Equipment",
  "Food / Beverage Manufacturing",
] as const;

const EXCLUDED_NICHE_PATTERNS = [
  /\bski(?:ing)?\b/i,
  /\bwoodworking\b|\bfurniture\b|\bcabinetry\b|\bmillwork\b/i,
  /\bacoustics?\b|\baudio\b|\bmusical\s+instruments?\b/i,
  /\boutdoor\s+recreation\b|\boutdoor\s+equipment\b/i,
  /\bfood\b|\bbeverage\b/i,
];

const STAFFING_AGENCY_PATTERNS = [
  /\bactalent\b/i,
  /\baerotek\b/i,
  /\bapproach\s+venture\b/i,
  /\bbabich\b/i,
  /\bbelcan\b/i,
  /\bbradley\s*&\s*associates\b/i,
  /\bc4\s+technical\b/i,
  /\bcybercoders\b/i,
  /\bepc\s+staff\b/i,
  /\bfutures\s+consulting\b/i,
  /\binsight\s+global\b/i,
  /\bjcsi\b/i,
  /\bjobot\b/i,
  /\bjohnson\s+service\s+group\b/i,
  /\bjpi\b/i,
  /\bkronos\s+consulting\b/i,
  /\bliberty\s+personnel\b/i,
  /\bnetgroup\b/i,
  /\bpacer\b/i,
  /\brandstad\b/i,
  /\brobert\s+half\b/i,
  /\bsoftcom\s+systems\b/i,
  /\bthree\s+point\s+solutions\b/i,
  /\bzobility\b/i,
  /\bharrison\s+consulting\s+solutions\b/i,
  /\bstaffing\b|\brecruit(?:er|ing)\b|\bpersonnel\b|\btalent\s+acquisition\b/i,
];

const SENIORITY_TITLE_PATTERNS = [
  /\b(?:senior|sr\.?)\b/i,
  /\bmid[-\s]?career\b|\bmid[-\s]?level\b|\bexperienced\b/i,
  /\b(?:lead|principal|staff)\b/i,
  /\b(?:manager|director|supervisor|vp|vice\s+president|chief|head)\b/i,
  /\b(?:ii|iii|iv|v)\b/i,
  /\b(?:level\s*)?[2-9]\b/i,
];

const NON_ENGINEERING_TITLE_PATTERNS = [
  /\btechnician\b/i,
  /\boperator\b/i,
  /\bassembler\b/i,
  /\bmachinist\b/i,
  /\bmechanic\b/i,
  /\bwarehouse\b/i,
  /\bforklift\b/i,
  /\bpicker\b/i,
  /\bclerk\b/i,
  /\bcustomer\s+service\b/i,
  /\badministrative\b/i,
  /\brecruiter\b/i,
  /\b(?:inside\s+)?sales\b/i,
  /\bbusiness\s+development\b/i,
  /\bcoordinator\b/i,
  /\bscheduler\b/i,
  /\bestimator\b/i,
  /\bdrafter\b/i,
];

export function isTodayExcludedNiche(niche?: string | null): boolean {
  if (!niche) return false;
  return EXCLUDED_NICHE_PATTERNS.some((pattern) => pattern.test(niche));
}

export function isExcludedStaffingCompany(companyname?: string | null): boolean {
  if (!companyname) return false;
  return STAFFING_AGENCY_PATTERNS.some((pattern) => pattern.test(companyname));
}

export function isExcludedTodayJobTitle(title?: string | null): boolean {
  if (!title) return false;
  return SENIORITY_TITLE_PATTERNS.some((pattern) => pattern.test(title));
}

export function isNonEngineeringJobTitle(title?: string | null): boolean {
  if (!title) return false;
  return NON_ENGINEERING_TITLE_PATTERNS.some((pattern) => pattern.test(title));
}

export function isGenericJobUrl(url?: string | null): boolean {
  if (!url) return true;
  const lower = url.toLowerCase();
  return [
    /indeed\.com\/jobs\?/,
    /linkedin\.com\/jobs\/search/,
    /blueorigin\.com\/careers\/search(?:\?|$)/,
    /\/careers\/?($|[?#])/,
    /\/jobs\/?($|[?#])/,
    /\/job-search\/?($|[?#])/,
  ].some((pattern) => pattern.test(lower));
}

export function isTodayTargetJob(job: {
  title?: string | null;
  companyname?: string | null;
  niche?: string | null;
  is_relevant?: boolean | null;
  job_url?: string | null;
  apply_url?: string | null;
}): boolean {
  if (job.is_relevant === false) return false;
  if (isTodayExcludedNiche(job.niche)) return false;
  if (isExcludedStaffingCompany(job.companyname)) return false;
  if (isExcludedTodayJobTitle(job.title)) return false;
  if (isNonEngineeringJobTitle(job.title)) return false;
  if ("job_url" in job || "apply_url" in job) {
    const url = job.job_url || job.apply_url || "";
    if (isGenericJobUrl(url)) return false;
  }
  return true;
}
