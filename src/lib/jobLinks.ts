const UNRELIABLE_TRACKED_SOURCES = new Set([
  "ziprecruiter_email",
  "dice.com",
]);

const GENERIC_JOB_URL_PATTERNS = [
  /indeed\.com\/jobs\?/i,
  /linkedin\.com\/jobs\/search/i,
  /linkedin\.com\/jobs\/(?!view\/)/i,
  /\/careers\/?($|[?#])/i,
  /\/jobs\/?($|[?#])/i,
  /\/job-search\/?($|[?#])/i,
];

const DIRECT_JOB_URL_PATTERNS = [
  /governmentjobs\.com\/careers\/[^/]+\/jobs\/\d+/i,
  /data\.usajobs\.gov|usajobs\.gov\/job\//i,
  /builtin(?:colorado)?\.com\/(?:job|jobs)\//i,
  /indeed\.com\/viewjob\?jk=/i,
  /linkedin\.com\/jobs\/view\/\d+/i,
  /greenhouse\.io\/.+\/jobs\/\d+/i,
  /boards\.greenhouse\.io\/.+\/jobs\/\d+/i,
  /job-boards\.greenhouse\.io\/.+\/jobs\//i,
  /jobs\.lever\.co\/[^/]+\/[a-f0-9-]{8,}/i,
  /jobs\.ashbyhq\.com\/[^/]+\/[a-f0-9-]{8,}/i,
  /smartrecruiters\.com\/[^/]+\/\d+/i,
  /apply\.workable\.com\/[^/]+\/j\//i,
  /myworkdayjobs\.com\/.+\/job\//i,
  /myworkdaysite\.com\/.+\/job\//i,
  /icims\.com\/jobs\/\d+/i,
  /dayforcehcm\.com\/.+\/Posting\/View\//i,
  /recruiting\.paylocity\.com\/.+\/Jobs\/Details\//i,
  /oraclecloud\.com\/.+\/job\//i,
  /oraclecloud\.com\/hcmUI\/CandidateExperience\/.+\/requisitions\/preview\/\d+/i,
  /successfactors\.[^/]+\/.+\/job\//i,
  /bamboohr\.com\/careers\/\d+/i,
  /breezy\.hr\/p\//i,
  /recruitee\.com\/o\//i,
  /ultipro\.com\/.+\/JobBoard\/.+\/OpportunityDetail/i,
  /paycomonline\.net\/.+\/ats\/web\.php\/jobs\/ViewJobDetails/i,
  /adp\.com\/.+\/recruitment\/recruitment\.html/i,
  /applytojob\.com\/apply\//i,
  /\/jobs\/[^/?#]*\d[^/?#]*/i,
  /\/jobs\/[^/?#]*(?:engineer|engineering|eit|mechanical|electrical|hvac|mep|project|manufacturing|test|quality|civil|water|environmental|controls?|systems)[^/?#]*/i,
  /\/careers\/[^/?#]*\d[^/?#]*/i,
  /\/careers\/[^/?#]*(?:engineer|engineering|eit|mechanical|electrical|hvac|mep|project|manufacturing|test|quality|civil|water|environmental|controls?|systems)[^/?#]*/i,
  /\/job\/[^/?#]+/i,
  /\/job-detail\//i,
  /\/job-posting\//i,
  /\/openings?\/[^/?#]+/i,
  /\/positions?\/[^/?#]+/i,
];

export function isGenericJobUrl(url?: string | null): boolean {
  if (!url) return true;
  return GENERIC_JOB_URL_PATTERNS.some((pattern) => pattern.test(url));
}

export function isDirectJobUrl(url?: string | null): boolean {
  if (!url || !/^https?:\/\//i.test(url)) return false;
  if (isGenericJobUrl(url)) return false;
  return DIRECT_JOB_URL_PATTERNS.some((pattern) => pattern.test(url));
}

export function isReliableTrackedJob(source?: string | null, url?: string | null): boolean {
  if (source && UNRELIABLE_TRACKED_SOURCES.has(source)) return false;
  return isDirectJobUrl(url);
}

export function getReliableJobUrl(job: {
  source?: string | null;
  job_url?: string | null;
  apply_url?: string | null;
  url?: string | null;
}): string | null {
  const candidates = [job.job_url, job.apply_url, job.url].filter(Boolean) as string[];
  return candidates.find((url) => isReliableTrackedJob(job.source, url)) || null;
}
