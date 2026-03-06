"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useToast } from "@/components/Toast";

/* ── Types ── */
interface LetterRow {
  id: string;
  companyname: string;
  contactname?: string;
  contact_title?: string;
  contact_email?: string;
  custom_paragraph?: string;
  body_final?: string;
  status: string;
  printed_at?: string;
  sent_at?: string;
  emailed_at?: string;
  created_at?: string;
}

interface Template {
  subject_template: string;
  body_template: string;
}

interface Contact {
  id?: number;
  contactname: string;
  title: string;
  email: string;
  email_searched?: boolean;
}

interface CompanyRow {
  companyname: string;
  tier: number;
  city: string;
  contactname?: string;
  contact_title?: string;
  company_about?: string;
  niche?: string;
  email?: string;
  contact_count?: number;
  email_count?: number;
}

/* ── Remove duplicate paragraphs from a letter body ── */
function deduplicateParagraphs(text: string): string {
  const paras = text.split(/\n\n+/);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of paras) {
    const key = p.trim().toLowerCase().replace(/\s+/g, " ");
    if (!key || !seen.has(key)) {
      if (key) seen.add(key);
      out.push(p);
    }
  }
  return out.join("\n\n");
}

/* ── Clean company name for letter body ── */
function cleanCompanyName(name: string): string {
  // First strip legal suffixes
  let clean = name
    .replace(/\s*,?\s*(Corp\.?|Corporation|Inc\.?|Incorporated|LLC|L\.L\.C\.|Ltd\.?|Limited|Co\.?|Company|SE\s*&\s*Co\.\s*KG|PLC|LP|L\.P\.)$/i, "")
    .trim();
  
  // Strip product/category suffixes that sound awkward in "the work you're doing at [X]"
  // But only if the name has 2+ words (don't strip single-word names)
  const words = clean.split(/\s+/);
  // Special overrides
  const overrides: Record<string, string> = { "York Space Systems": "York", "H5 Data Centers": "H5", "Blue Canyon Technologies": "Blue Canyon", "Alchemy Bikes": "Alchemy" };
  if (overrides[clean]) return overrides[clean];
  
  const keepFull = ["YG Acoustics", "Boulder Amplifiers", "Blue Origin", "Air Squared", "Acoustical Elements", "Wave Engineering"];
  if (words.length >= 2 && !keepFull.some(k => k.toLowerCase() === clean.toLowerCase())) {
    const productSuffixes = [
      "Skis", "Ski", "Cycles", "Bikes", "Vehicles", "Motors", "Acoustics",
      "Amplifiers", "Technologies", "Systems", "Solutions", "Industries",
      "Products", "Services", "Metals", "Engineering", "Robotics", "Centers", "Designs",
    ];
    const lastWord = words[words.length - 1];
    if (productSuffixes.some(s => s.toLowerCase() === lastWord.toLowerCase())) {
      clean = words.slice(0, -1).join(" ");
    }
  }
  
  // Strip brand suffixes that don't belong in "the work you're doing at [X]"
  const brandSuffixes = ["bp", "BP"];
  const lastWord2 = clean.split(/\s+/).pop() || "";
  if (clean.split(/\s+/).length >= 2 && brandSuffixes.includes(lastWord2)) {
    clean = clean.split(/\s+/).slice(0, -1).join(" ");
  }
  
  return clean;
}

/* ── Assemble a letter from template + data ── */
function assembleLetter(
  template: Template,
  companyname: string,
  customParagraph: string,
  contactName?: string,
  contactTitle?: string,
  companyAddress?: string,
  niche?: string
) {
  const today = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const displayName = cleanCompanyName(companyname);

  // Use niche-specific template if available, otherwise fall back to default
  const bodyTemplate = (niche && NICHE_BODY_TEMPLATES[niche]) || template.body_template;

  let body = bodyTemplate
    .replace(/\{\{COMPANY\}\}/g, displayName)
    .replace(/\{\{TODAY_DATE\}\}/g, today)
    .replace(/\{\{COMPANY_ADDRESS\}\}/g, companyAddress || "");

  if (contactName) {
    const firstName = contactName.split(" ")[0];
    const titleLine = contactTitle ? `${contactTitle}\n` : "";
    body = body.replace("Hiring Manager\n", `${contactName}\n${titleLine}`);
    body = body.replace("Hello Hiring Manager", `Hello ${firstName}`);
  }

  // Standardize wording across all templates (including database default)
  body = body.replace(
    "If you are considering an entry-level BSME/EIT, I would love to interview with your team.",
    "If you are considering an entry-level BSME/EIT, I would love to interview with your team."
  );

  // Remove exclamation mark from closing
  body = body.replace("I hope to hear from you!", "I hope to hear from you.");

  // Fix dash before "which links" in old drafts
  body = body.replace("résumé and card — which links", "résumé and card, which links");

  // Ensure "with my skill set" in closing
  body = body.replace(
    "entry-level BSME/EIT, I would love to interview",
    "entry-level BSME/EIT with my skill set, I would love to interview"
  );

  // Remove duplicate paragraphs (safety net)
  body = deduplicateParagraphs(body);

  // Only collapse excessive blank lines in the body, preserve signature space
  const signIdx = body.indexOf("Sincerely,");
  if (signIdx > 0) {
    const before = body.substring(0, signIdx).replace(/\n{3,}/g, "\n\n");
    const after = body.substring(signIdx);
    // Ensure 4 blank lines between Sincerely and Kohler Wood for handwritten signature
    body = before + after.replace(/Sincerely,\n*Kohler Wood/, "Sincerely,\n\n\n\nKohler Wood")
                        .replace(/Sincerely,\n{2,6}Kohler Wood/, "Sincerely,\n\n\n\nKohler Wood");
  } else {
    body = body.replace(/\n{3,}/g, "\n\n");
  }

  const subject = template.subject_template
    .replace(/\{\{COMPANY\}\}/g, companyname);

  return { subject, body };
}

const NICHE_ORDER = [
  "TEST",
  "Skiing",
  "Acoustics / Audio / Musical Instruments",
  "Outdoor Recreation & Equipment",
  "Woodworking / Furniture / Cabinetry / Prototyping",
  "Automotive / Vehicles",
  "Energy / Renewables / Power",
  "Manufacturing / Automation / Product Design",
  "Metals / Material Science",
  "Quantum / Deep Tech / Electronics / Robotics",
  "Construction / Civil / Heavy Industry",
  "MEP / HVAC / Building Systems",
  "Water / Environmental / Geotech",
  "Aerospace / Space",
  "Medical / Biotech",
  "Food / Beverage Manufacturing",
];

/* ── Niche color themes ── */
const NICHE_COLORS: Record<string, { bg: string; headerBg: string; border: string; accent: string; descBg: string; descText: string }> = {
  "TEST": {
    bg: "from-slate-50 to-blue-50",
    headerBg: "from-slate-700 via-slate-800 to-slate-900",
    border: "border-slate-300/40",
    accent: "text-slate-700",
    descBg: "from-slate-50/80 to-slate-100/60 border-slate-200/50",
    descText: "text-slate-700",
  },
  "Acoustics / Audio / Musical Instruments": {
    bg: "from-slate-50 to-gray-50",
    headerBg: "",
    border: "border-rose-400/40",
    accent: "text-rose-950",
    descBg: "from-rose-50/80 to-pink-50/60 border-rose-300/50",
    descText: "text-rose-900",
  },
  "Skiing": {
    bg: "from-slate-50 to-gray-50",
    headerBg: "from-sky-800 to-slate-900",
    border: "border-sky-300/60",
    accent: "text-sky-900",
    descBg: "from-sky-50/80 to-indigo-50/60 border-sky-200/50",
    descText: "text-sky-900",
  },
  "Outdoor Recreation & Equipment": {
    bg: "from-slate-50 to-gray-50",
    headerBg: "from-emerald-900 to-green-950",
    border: "border-emerald-300/60",
    accent: "text-emerald-900",
    descBg: "from-emerald-50/80 to-green-50/60 border-emerald-200/50",
    descText: "text-emerald-900",
  },
  "Automotive / Vehicles": {
    bg: "from-slate-50 to-gray-50",
    headerBg: "from-zinc-800 to-neutral-900",
    border: "border-zinc-300/60",
    accent: "text-zinc-900",
    descBg: "from-zinc-50/80 to-gray-100/60 border-zinc-200/50",
    descText: "text-zinc-800",
  },
  "Woodworking / Furniture / Cabinetry / Prototyping": {
    bg: "from-slate-50 to-gray-50",
    headerBg: "from-amber-800 to-yellow-950",
    border: "border-amber-300/60",
    accent: "text-amber-900",
    descBg: "from-amber-50/80 to-yellow-50/60 border-amber-200/50",
    descText: "text-amber-900",
  },
  "Energy / Renewables / Power": {
    bg: "from-slate-50 to-gray-50",
    headerBg: "from-orange-800 to-amber-950",
    border: "border-orange-300/60",
    accent: "text-orange-900",
    descBg: "from-orange-50/80 to-amber-50/60 border-orange-200/50",
    descText: "text-orange-900",
  },
  "MEP / HVAC / Building Systems": {
    bg: "from-slate-50 to-gray-50",
    headerBg: "from-teal-800 to-teal-950",
    border: "border-teal-300/60",
    accent: "text-teal-900",
    descBg: "from-teal-50/80 to-cyan-50/60 border-teal-200/50",
    descText: "text-teal-900",
  },
  "Construction / Civil / Heavy Industry": {
    bg: "from-slate-50 to-gray-50",
    headerBg: "from-stone-700 to-stone-900",
    border: "border-stone-300/60",
    accent: "text-stone-800",
    descBg: "from-stone-50/80 to-gray-100/60 border-stone-200/50",
    descText: "text-stone-800",
  },
  "Manufacturing / Automation / Product Design": {
    bg: "from-slate-50 to-gray-50",
    headerBg: "from-indigo-900 to-blue-950",
    border: "border-indigo-300/60",
    accent: "text-indigo-900",
    descBg: "from-indigo-50/80 to-blue-50/60 border-indigo-200/50",
    descText: "text-indigo-900",
  },
  "Water / Environmental / Geotech": {
    bg: "from-slate-50 to-gray-50",
    headerBg: "from-cyan-800 to-cyan-950",
    border: "border-cyan-300/60",
    accent: "text-cyan-900",
    descBg: "from-cyan-50/80 to-sky-50/60 border-cyan-200/50",
    descText: "text-cyan-900",
  },
  "Quantum / Deep Tech / Electronics / Robotics": {
    bg: "from-slate-50 to-gray-50",
    headerBg: "from-rose-900 to-pink-950",
    border: "border-rose-300/60",
    accent: "text-rose-900",
    descBg: "from-rose-50/80 to-pink-50/60 border-rose-200/50",
    descText: "text-rose-900",
  },
  "Aerospace / Space": {
    bg: "from-slate-50 to-gray-50",
    headerBg: "from-blue-900 to-indigo-950",
    border: "border-blue-300/60",
    accent: "text-blue-900",
    descBg: "from-blue-50/80 to-indigo-50/60 border-blue-200/50",
    descText: "text-blue-900",
  },
  "Medical / Biotech": {
    bg: "from-slate-50 to-gray-50",
    headerBg: "from-red-800 to-rose-950",
    border: "border-red-300/60",
    accent: "text-red-900",
    descBg: "from-red-50/80 to-rose-50/60 border-red-200/50",
    descText: "text-red-900",
  },
  "Food / Beverage Manufacturing": {
    bg: "from-slate-50 to-gray-50",
    headerBg: "from-lime-800 to-green-950",
    border: "border-lime-300/60",
    accent: "text-lime-900",
    descBg: "from-lime-50/80 to-green-50/60 border-lime-200/50",
    descText: "text-lime-900",
  },
  "Staffing / Recruiting": {
    bg: "from-gray-50 to-slate-50",
    headerBg: "from-violet-800 to-purple-950",
    border: "border-violet-300/60",
    accent: "text-violet-900",
    descBg: "from-violet-50/80 to-purple-50/60 border-violet-200/50",
    descText: "text-violet-900",
  },
  "Metals / Material Science": {
    bg: "from-slate-50 to-gray-50",
    headerBg: "from-zinc-700 to-slate-800",
    border: "border-zinc-300/60",
    accent: "text-zinc-900",
    descBg: "from-zinc-50/80 to-gray-100/60 border-zinc-200/50",
    descText: "text-zinc-800",
  },
  "Real Estate / Facilities": {
    bg: "from-gray-50 to-slate-50",
    headerBg: "from-gray-700 to-slate-800",
    border: "border-gray-300/60",
    accent: "text-gray-700",
    descBg: "from-gray-50/80 to-slate-100/60 border-gray-200/50",
    descText: "text-gray-700",
  },
};

const DEFAULT_COLORS = { ...NICHE_COLORS["Real Estate / Facilities"] };

/* ── Niche-specific letter body templates ── */
/* ── Helper to build a full letter body from a niche paragraph ── */
function nicheTemplate(nicheParagraph: string): string {
  return `{{TODAY_DATE}}

Hiring Manager
{{COMPANY}}
{{COMPANY_ADDRESS}}

Hello Hiring Manager,

I hope you're doing well. My name is Kohler Wood, EIT and recent BSME graduate from Colorado School of Mines.

I'm writing because I'm interested in the work you're doing at {{COMPANY}}. ${nicheParagraph}

I've included my résumé and card, which links to my projects and interests. If you are considering an entry-level BSME/EIT with my skill set, I would love to interview with your team.

Thank you for your time, and I hope to hear from you.

Sincerely,




Kohler Wood
208-720-4635
Lakewood, CO
akwood1@mines.edu`;
}

const NICHE_BODY_TEMPLATES: Record<string, string> = {
  "Energy / Renewables / Power": nicheTemplate(
    "I have experience taking CAD designs from concept through prototype and fabrication, and I'd welcome the chance to apply that to energy infrastructure."
  ),
  "MEP / HVAC / Building Systems": nicheTemplate(
    "I have coursework and project experience in CFD and heat transfer simulation using SolidWorks Flow Simulation."
  ),
  "Construction / Civil / Heavy Industry": nicheTemplate(
    "I interned at a fabrication shop in Sun Valley where I assisted with layout, fabrication, and installation of steel railings for residential projects."
  ),
  "Water / Environmental / Geotech": nicheTemplate(
    "I have experience taking CAD designs from concept through prototype and fabrication, and I'd welcome the chance to contribute to your team."
  ),
  "Aerospace / Space": nicheTemplate(
    "My father owns a Cessna 172 — an experience that shaped my engineering interest today."
  ),
  "Quantum / Deep Tech / Electronics / Robotics": nicheTemplate(
    "I've designed electromechanical systems with 3D-printed interfaces for my senior capstone, and I'd welcome the chance to contribute to your team."
  ),
  "Automotive / Vehicles": nicheTemplate(
    "I've had an interest in automobiles since I was young, and I'd jump at the chance to contribute to your team."
  ),
  "Manufacturing / Automation / Product Design": nicheTemplate(
    "I have experience operating CNC routers, mills, and 3D printers to take SolidWorks designs from concept through fabrication."
  ),
  "Acoustics / Audio / Musical Instruments": nicheTemplate(
    "I've studied and performed classical piano for three years. I also built an adaptive bass guitar for my senior capstone, and I'd jump at the chance to engineer in this industry."
  ),
  "Skiing": nicheTemplate(
    "I grew up in Sun Valley, ID and have skied all my life, and the chance to engineer products I'd love to use would be a dream come true."
  ),
  "Outdoor Recreation & Equipment": nicheTemplate(
    "I grew up in Sun Valley, ID and have spent my life in the outdoors, and the chance to engineer products I'd love to use would be a dream come true."
  ),
  "Woodworking / Furniture / Cabinetry / Prototyping": nicheTemplate(
    "I spent the last year designing and fabricating woodworking projects, including a Frank Lloyd Wright-style record cabinet."
  ),
  "Medical / Biotech": nicheTemplate(
    "My senior capstone was an adaptive bass guitar designed for a musician with physical disabilities, and I'd welcome the chance to apply that experience in medical device engineering."
  ),
  "Food / Beverage Manufacturing": nicheTemplate(
    "I have experience selecting food-safe materials and adhesives for fabrication projects and operating CNC equipment for production work."
  ),
  "Metals / Material Science": nicheTemplate(
    "I have hands-on experience with materials processing, taking SolidWorks designs from concept through prototype, and I'd welcome the chance to contribute to your team."
  ),
};

/* ── Main Page ── */
export default function HomePage() {
  const toast = useToast();

  const [template, setTemplate] = useState<Template | null>(null);
  const [lettersMap, setLettersMap] = useState<Map<string, LetterRow[]>>(new Map());
  const [expandedCompany, setExpandedCompany] = useState<string | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [contactLetters, setContactLetters] = useState<Map<string, LetterRow>>(new Map());
  const [selectedContactIdx, setSelectedContactIdx] = useState(0);
  const [companyAddress, setCompanyAddress] = useState("");
  const [currentLetter, setCurrentLetter] = useState<LetterRow | null>(null);
  const [editing, setEditing] = useState(false);
  const [editBody, setEditBody] = useState("");
  const [letterTab, setLetterTab] = useState<"letter" | "email" | "letter_preview">("letter");
  const [showMailedList, setShowMailedList] = useState(false);
  const [showEmailedList, setShowEmailedList] = useState(false);
  const [saving, setSaving] = useState(false);
  const [expandLoading, setExpandLoading] = useState(false);
  const [researching, setResearching] = useState(false);
  const [batchResearching, setBatchResearching] = useState(false);
  const [batchStatus, setBatchStatus] = useState("");
  const [backfilling, setBackfilling] = useState(false);
  const [emailing, setEmailing] = useState(false);
  const [emailConfirm, setEmailConfirm] = useState<{to: string; contactname: string; companyname: string; body: string; editing?: boolean; attachments: string[]; subject?: string; matches?: {job_skill: string; resume_skill: string}[]} | null>(null);
  const [letterConfirm, setLetterConfirm] = useState<{contactname: string; companyname: string; body: string; editing?: boolean; matches?: {job_skill: string; resume_skill: string}[]} | null>(null);
  const [findingEmail, setFindingEmail] = useState(false);
  const [findingEmailIdx, setFindingEmailIdx] = useState<number | null>(null);
  const [addLeadNiche, setAddLeadNiche] = useState<string | null>(null);
  const [addLeadSearch, setAddLeadSearch] = useState("");
  const [addLeadResults, setAddLeadResults] = useState<{name: string; address: string; address1: string; city: string; state: string; zip: string; types: string | null; rating: number | null; place_id: string}[]>([]);
  const [addLeadSearching, setAddLeadSearching] = useState(false);
  const [addLeadAdding, setAddLeadAdding] = useState<string | null>(null);
  const [deletingCompany, setDeletingCompany] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [jobsCompany, setJobsCompany] = useState<string | null>(null);
  const [jobsLoading2, setJobsLoading2] = useState(false);
  const [jobResults2, setJobResults2] = useState<{title: string; salary?: string; location?: string; summary?: string; apply_url: string; source?: string}[]>([]);
  const [jobContactPicker, setJobContactPicker] = useState<{jobIdx: number; action: "email"|"letter"; company: string} | null>(null);
  const [companies, setCompanies] = useState<CompanyRow[]>([]);
  const [compSearch, setCompSearch] = useState("");
  const [contactSearch, setContactSearch] = useState("");
  const [locationSearch, setLocationSearch] = useState("");
  const [keywordSearch, setKeywordSearch] = useState("");
  const [tierFilter, setTierFilter] = useState("");
  const [companiesLoading, setCompaniesLoading] = useState(true);
  const [expandedNiches, setExpandedNiches] = useState<Set<string>>(new Set());
  const gridRef = useRef<HTMLDivElement>(null);
  const orderedNichesRef = useRef<string[]>([]);

  /* ── Multi-letter helpers ── */
  const allLetters = Array.from(lettersMap.values()).flat();
  const totalLetterCount = allLetters.length;
  const getBestLetter = (companyname: string): LetterRow | null => {
    const letters = lettersMap.get(companyname);
    if (!letters || letters.length === 0) return null;
    // Priority: emailed > sent/printed > draft
    return letters.find(l => l.emailed_at) 
      || letters.find(l => l.printed_at)
      || letters[0];
  };
  const getContactLetter = (companyname: string, contactname: string): LetterRow | null => {
    const letters = lettersMap.get(companyname);
    if (!letters) return null;
    return letters.find(l => l.contactname === contactname) || null;
  };
  const upsertLetterInMap = (prev: Map<string, LetterRow[]>, companyname: string, letter: LetterRow): Map<string, LetterRow[]> => {
    const m = new Map(prev);
    const existing = m.get(companyname) || [];
    const idx = existing.findIndex(l => l.id === letter.id);
    if (idx >= 0) {
      const updated = [...existing];
      updated[idx] = letter;
      m.set(companyname, updated);
    } else {
      m.set(companyname, [...existing, letter]);
    }
    return m;
  };

  /* ── Load template + letters + companies ── */
  const loadData = useCallback(async () => {
    try {
      const [tplRes, qRes, compRes] = await Promise.all([
        fetch("/api/template"),
        fetch("/api/queue"),
        fetch("/api/outreach-list"),
      ]);
      const tplData = await tplRes.json();
      const qData = await qRes.json();
      const compData = await compRes.json();

      if (tplData && !tplData.error) setTemplate(tplData);
      if (!qData.error && Array.isArray(qData)) {
        const map = new Map<string, LetterRow[]>();
        for (const l of qData) {
          const existing = map.get(l.companyname) || [];
          existing.push(l);
          map.set(l.companyname, existing);
        }
        setLettersMap(map);
      }
      if (!compData.error) setCompanies(compData);
    } catch (e: unknown) {
      toast((e as Error).message, "error");
    } finally {
      setCompaniesLoading(false);
    }
  }, [toast]);

  useEffect(() => { loadData(); }, [loadData]);

  /* ── Expand a company: load contacts, address, and letter ── */
  async function expandCompany(companyname: string) {
    if (expandedCompany === companyname) {
      setExpandedCompany(null);
      setEditing(false);
      return;
    }
    setExpandedCompany(companyname);
    setEditing(false);
    setSelectedContactIdx(0);
    setExpandLoading(true);
    setCurrentLetter(getBestLetter(companyname));

    try {
      const [contRes, compRes, lettersRes] = await Promise.all([
        fetch(`/api/contacts?companyname=${encodeURIComponent(companyname)}`),
        fetch(`/api/company?companyname=${encodeURIComponent(companyname)}`),
        fetch(`/api/draft?companyname=${encodeURIComponent(companyname)}`),
      ]);
      const contData = await contRes.json();
      const compData = await compRes.json();
      const lettersData = await lettersRes.json();

      // Build per-contact letters map
      const clMap = new Map<string, LetterRow>();
      if (Array.isArray(lettersData)) {
        for (const l of lettersData) {
          if (l.contactname) clMap.set(l.contactname, l);
        }
      }
      setContactLetters(clMap);

      if (Array.isArray(contData)) {
        const realContacts = contData.filter((c: Contact) => c.contactname && c.contactname !== "(no results)");
        setContacts(realContacts);

        // Auto-create draft if contacts exist but no letter
        const existingLetter = getBestLetter(companyname);
        if (!existingLetter && realContacts.length > 0) {
          const bestContact = realContacts.find((c: Contact) => c.email) || realContacts[0];
          try {
            const draftRes = await fetch("/api/draft", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                companyname,
                contactname: bestContact.contactname,
                contact_title: bestContact.title,
                contact_email: bestContact.email || "",
              }),
            });
            const draftData = await draftRes.json();
            if (draftData && draftData.id) {
              const newLetter: LetterRow = {
                id: draftData.id,
                companyname,
                contactname: draftData.contactname || bestContact.contactname,
                contact_title: draftData.contact_title || bestContact.title,
                contact_email: draftData.contact_email || bestContact.email || "",
                status: draftData.status || "draft",
              };
              setCurrentLetter(newLetter);
              setLettersMap((prev) => upsertLetterInMap(prev, companyname, newLetter));
            }
          } catch (err) {
            console.error("Auto-create draft failed:", err);
          }
        }
      } else {
        setContacts([]);
      }
      if (compData && !compData.error) {
        const parts = [
          compData.mailing_address1,
          compData.mailing_address2,
          [compData.mailing_city, compData.mailing_state].filter(Boolean).join(", ") + (compData.mailing_zip ? " " + compData.mailing_zip : ""),
        ].filter(Boolean);
        setCompanyAddress(parts.join("\n"));
      } else {
        setCompanyAddress("");
      }
    } catch {
      setContacts([]);
      setCompanyAddress("");
    } finally {
      setExpandLoading(false);
    }
  }

  /* ── Apply selected contact ── */
  async function applyContact(idx: number) {
    setSelectedContactIdx(idx);
    const c = contacts[idx];
    if (!c || !expandedCompany) return;
    try {
      const res = await fetch("/api/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyname: expandedCompany,
          contactname: c.contactname,
          contact_title: c.title,
          contact_email: c.email,
          body_final: null,
        }),
      });
      const d = await res.json();
      if (d.error) throw new Error(d.error);
      const updated: LetterRow = {
        id: d.id || "",
        companyname: expandedCompany,
        contactname: c.contactname,
        contact_title: c.title,
        contact_email: c.email,
        status: d.status || "draft",
        body_final: d.body_final || undefined,
        sent_at: d.sent_at || undefined,
      };
      setCurrentLetter(updated);
      setLettersMap((prev) => upsertLetterInMap(prev, expandedCompany, updated));
      setContactLetters((prev) => { const m = new Map(prev); m.set(c.contactname, updated); return m; });
      toast(`Contact set: ${c.contactname}`);
    } catch (e: unknown) {
      toast((e as Error).message, "error");
    }
  }

  /* ── Save letter edits ── */
  async function saveLetter() {
    if (!expandedCompany) return;
    setSaving(true);
    try {
      const res = await fetch("/api/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyname: expandedCompany,
          contactname: currentLetter?.contactname || null,
          body_final: editBody,
        }),
      });
      const d = await res.json();
      if (d.error) throw new Error(d.error);
      if (currentLetter) {
        const updated = { ...currentLetter, body_final: editBody };
        setCurrentLetter(updated);
        setLettersMap((prev) => upsertLetterInMap(prev, expandedCompany, updated));
      }
      setEditing(false);
      toast("Letter saved");
    } catch (e: unknown) {
      toast((e as Error).message, "error");
    } finally {
      setSaving(false);
    }
  }

  /* ── Batch research all missing contacts ── */
  async function batchResearchAll() {
    setBatchResearching(true);
    setBatchStatus("Starting batch research...");
    try {
      const res = await fetch("/api/batch-research", { method: "POST" });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setBatchStatus(data.message);
      toast(data.message);
      await loadData();
    } catch (e: unknown) {
      const msg = (e as Error).message;
      setBatchStatus(`Error: ${msg}`);
      toast(msg, "error");
    } finally {
      setBatchResearching(false);
    }
  }

  /* ── Backfill missing emails for existing contacts ── */
  async function backfillEmails() {
    setBackfilling(true);
    setBatchStatus("Backfilling missing emails...");
    try {
      const res = await fetch("/api/backfill-emails", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit: 20 }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      const msg = `Backfill: ${data.updated} emails found out of ${data.processed} contacts. ${data.remaining} still missing.`;
      setBatchStatus(msg);
      toast(msg);
      await loadData();
    } catch (e: unknown) {
      const msg = (e as Error).message;
      setBatchStatus(`Backfill error: ${msg}`);
      toast(msg, "error");
    } finally {
      setBackfilling(false);
    }
  }

  /* ── Research contacts via RocketReach (single company) ── */
  async function researchContacts(companyname: string) {
    setResearching(true);
    try {
      const res = await fetch("/api/research-contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyname }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      toast(data.message || "Research complete");

      // Reload contacts for this company
      const contRes = await fetch(`/api/contacts?companyname=${encodeURIComponent(companyname)}`);
      const contData = await contRes.json();
      if (Array.isArray(contData)) setContacts(contData.filter((c: Contact) => c.contactname && c.contactname !== "(no results)"));

      // Reload letters
      const qRes = await fetch("/api/queue");
      const qData = await qRes.json();
      if (!qData.error && Array.isArray(qData)) {
        const map = new Map<string, LetterRow[]>();
        for (const l of qData) {
          const existing = map.get(l.companyname) || [];
          existing.push(l);
          map.set(l.companyname, existing);
        }
        setLettersMap(map);
        setCurrentLetter(map.get(companyname)?.[0] || null);
      }
    } catch (e: unknown) {
      toast((e as Error).message, "error");
    } finally {
      setResearching(false);
    }
  }

  /* ── Print and auto-log as sent ── */
  function emailLetter() {
    if (!expandedCompany || !currentLetter || !assembled) return;
    const contact = contacts[selectedContactIdx];
    const email = currentLetter.contact_email || contact?.email;
    if (!email) {
      toast("No email address for this contact", "error");
      return;
    }
    // Show confirmation dialog
    setEmailConfirm({
      to: email,
      contactname: currentLetter.contactname || contact?.contactname || "",
      companyname: expandedCompany,
      body: assembled.body,
      attachments: ["resume"],
    });
  }

  const NICHE_SEARCH_TERMS: Record<string, string[]> = {
    "Skiing": ["ski manufacturer Colorado", "snowboard manufacturer Denver", "ski equipment factory Colorado"],
    "Acoustics / Audio / Musical Instruments": ["audio electronics manufacturer Denver", "loudspeaker manufacturer Colorado", "musical instrument maker Denver"],
    "Outdoor Recreation & Equipment": ["outdoor equipment manufacturer Denver", "bicycle frame manufacturer Colorado", "camping gear manufacturer Denver"],
    "Woodworking / Furniture / Cabinetry / Prototyping": ["custom cabinetry manufacturer Denver", "woodworking fabrication shop Colorado", "CNC woodworking Denver"],
    "Automotive / Vehicles": ["custom vehicle fabrication Denver", "van conversion builder Colorado", "automotive fabrication shop Denver"],
    "Energy / Renewables / Power": ["oil gas engineering firm Denver", "solar energy engineering Colorado", "power plant engineering Denver"],
    "Manufacturing / Automation / Product Design": ["CNC machine shop Denver", "industrial automation company Colorado", "product design engineering Denver"],
    "Metals / Material Science": ["metal fabrication shop Denver", "precision machining company Colorado", "welding fabrication Denver"],
    "Quantum / Deep Tech / Electronics / Robotics": ["robotics manufacturer Denver", "electronics engineering company Colorado", "circuit board manufacturer Denver"],
    "Construction / Civil / Heavy Industry": ["civil engineering firm Denver", "structural engineering company Colorado", "heavy construction engineering Denver"],
    "MEP / HVAC / Building Systems": ["mechanical engineering firm Denver", "HVAC engineering company Colorado", "MEP design firm Denver"],
    "Water / Environmental / Geotech": ["water treatment engineering Denver", "environmental engineering firm Colorado", "geotechnical engineering Denver"],
    "Aerospace / Space": ["aerospace manufacturer Denver", "satellite manufacturer Colorado", "rocket propulsion company Denver"],
    "Medical / Biotech": ["medical device manufacturer Denver", "surgical instrument manufacturer Colorado", "biotech engineering Denver"],
    "Food / Beverage Manufacturing": ["food processing plant Denver", "beverage manufacturing facility Colorado", "food production factory Denver"],
  };

  async function openFindLeads(niche: string) {
    const terms = NICHE_SEARCH_TERMS[niche] || ["engineering company Denver"];
    const term = terms[Math.floor(Math.random() * terms.length)];
    setAddLeadNiche(niche);
    setAddLeadSearch(term);
    setAddLeadResults([]);
    setAddLeadSearching(true);
    try {
      const res = await fetch("/api/search-places", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: term }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setAddLeadResults(data.results || []);
      // Fetch company descriptions
      const names = (data.results || []).map((r: {name: string}) => r.name);
      if (names.length > 0) {
      }
    } catch { /* user can still search manually */ }
    finally { setAddLeadSearching(false); }
  }

  async function searchPlaces() {
    if (!addLeadSearch.trim()) return;
    setAddLeadSearching(true);
    setAddLeadResults([]);
    try {
      const res = await fetch("/api/search-places", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: addLeadSearch.trim() }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setAddLeadResults(data.results || []);
      if ((data.results || []).length === 0) toast("No results found for that search", "error");
      // Fetch company descriptions
      const names = (data.results || []).map((r: {name: string}) => r.name);
      if (names.length > 0) {
      }
    } catch (e: unknown) {
      toast((e as Error).message, "error");
    } finally {
      setAddLeadSearching(false);
    }
  }

  async function addLeadFromResult(result: typeof addLeadResults[0]) {
    if (!addLeadNiche) return;
    setAddLeadAdding(result.place_id);
    try {
      const res = await fetch("/api/find-leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          niche: addLeadNiche,
          mode: "manual",
          company: {
            name: result.name,
            city: result.city,
            address1: result.address1,
            state: result.state,
            zip: result.zip,
          },
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      if (data.alreadyExists) {
        toast(`${result.name} already exists`, "error");
      } else {
        toast(data.message || `Added ${result.name}`);
        // Remove from results so it's clear it was added
        setAddLeadResults(prev => prev.filter(r => r.place_id !== result.place_id));
        await loadData();
      }
    } catch (e: unknown) {
      toast((e as Error).message, "error");
    } finally {
      setAddLeadAdding(null);
    }
  }

  async function deleteCompany(companyname: string) {
    setDeletingCompany(companyname);
    try {
      const res = await fetch("/api/delete-company", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyname }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      setDeleteConfirm(null);
      if (expandedCompany === companyname) setExpandedCompany(null);
      // Remove from local state immediately
      setCompanies(prev => prev.filter(c => c.companyname !== companyname));
      setLettersMap(prev => { const m = new Map(prev); m.delete(companyname); return m; });

      // Show undo toast with backup data
      const backup = data.backup;
      toast(`Removed ${companyname}`, {
        action: {
          label: "Undo",
          onClick: async () => {
            try {
              const restoreRes = await fetch("/api/restore-company", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(backup),
              });
              const restoreData = await restoreRes.json();
              if (restoreData.error) throw new Error(restoreData.error);
              toast(`Restored ${companyname}`);
              await loadData();
            } catch (e: unknown) {
              toast((e as Error).message, "error");
            }
          },
        },
        duration: 8000,
      });
    } catch (e: unknown) {
      toast((e as Error).message, "error");
    } finally {
      setDeletingCompany(null);
    }
  }

  async function findEmail(overrideIdx?: number) {
    const idx = overrideIdx !== undefined ? overrideIdx : selectedContactIdx;
    const contact = contacts[idx];
    if (!contact || !expandedCompany) return;
    setFindingEmail(true);
    setFindingEmailIdx(idx);
    try {
      const res = await fetch("/api/find-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contactId: contact.id,
          contactname: contact.contactname,
          companyname: expandedCompany,
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      if (data.email) {
        toast(`Found: ${data.email}`);
        // Update current letter email
        if (currentLetter) {
          const updated = { ...currentLetter, contact_email: data.email };
          setCurrentLetter(updated);
          setLettersMap((prev) => upsertLetterInMap(prev, expandedCompany, updated));
        }
      } else {
        toast(data.message || "No email found", "error");
      }
      // Always reload contacts to get updated email_searched flag
      const contRes = await fetch(`/api/contacts?companyname=${encodeURIComponent(expandedCompany)}`);
      const contData = await contRes.json();
      if (Array.isArray(contData)) {
        setContacts(contData.filter((c: Contact) => c.contactname && c.contactname !== "(no results)"));
      }
    } catch (e: unknown) {
      toast((e as Error).message, "error");
    } finally {
      setFindingEmail(false);
      setFindingEmailIdx(null);
    }
  }

  async function confirmSendEmail() {
    if (!emailConfirm || !expandedCompany) return;
    const letterId = currentLetter?.id;
    setEmailConfirm(null);
    setEmailing(true);
    try {
      const res = await fetch("/api/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: emailConfirm.to,
          companyname: expandedCompany,
          contactname: emailConfirm.contactname,
          subject: emailConfirm.subject || `Mechanical Engineer — CO School of Mines`,
          body: emailConfirm.body || assembled?.body || "",
          letterId,
          attachments: emailConfirm.attachments,
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      toast(`Email sent to ${emailConfirm.to}`);
      if (currentLetter) {
        const updated = { ...currentLetter, status: "emailed", sent_at: new Date().toISOString(), emailed_at: new Date().toISOString() };
        setCurrentLetter(updated);
        setLettersMap((prev) => upsertLetterInMap(prev, expandedCompany, updated));
      }
    } catch (e: unknown) {
      toast((e as Error).message, "error");
    } finally {
      setEmailing(false);
    }
  }

  async function printAndLog() {
    if (!expandedCompany || !currentLetter) { window.print(); return; }
    try {
      await fetch("/api/batch-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [currentLetter.id], status: "sent" }),
      });
      const now = new Date().toISOString();
      const updated = { ...currentLetter, status: "sent", sent_at: now, printed_at: now };
      setCurrentLetter(updated);
      setLettersMap((prev) => upsertLetterInMap(prev, expandedCompany, updated));
      toast("Marked as sent");
    } catch {
      // still print even if logging fails
    }
    window.print();
  }

  /* ── Toggle niche between preview (3) and fully expanded ── */
  /* When one box expands, all boxes in the same grid row expand too */
  function toggleNiche(niche: string) {
    setExpandedNiches((prev) => {
      const next = new Set(prev);
      if (next.has(niche)) next.delete(niche);
      else next.add(niche);
      return next;
    });
  }

  /* ── Filtered companies ── */
  const filteredCompanies = companies.filter((c) => {
    if (compSearch) {
      const q = compSearch.toLowerCase();
      if (!c.companyname?.toLowerCase().includes(q)) return false;
    }
    if (contactSearch) {
      const q = contactSearch.toLowerCase();
      const match = [c.contactname, c.contact_title, c.email].some(f => f && f.toLowerCase().includes(q));
      if (!match) return false;
    }
    if (locationSearch) {
      const q = locationSearch.toLowerCase();
      if (!c.city?.toLowerCase().includes(q)) return false;
    }
    if (keywordSearch) {
      const q = keywordSearch.toLowerCase();
      const match = [c.companyname, c.contactname, c.email, c.city, c.contact_title, c.company_about, c.niche].some(f => f && f.toLowerCase().includes(q));
      if (!match) return false;
    }
    if (tierFilter && c.tier !== Number(tierFilter)) return false;
    return true;
  });

  /* ── Assembled letter for expanded company — always regenerate from template ── */
  const assembled = expandedCompany && template && currentLetter
    ? (currentLetter.body_final
      ? { body: currentLetter.body_final }
      : assembleLetter(
          template,
          expandedCompany,
          "",
          currentLetter.contactname || (contacts.length > 0 ? contacts[selectedContactIdx]?.contactname : undefined),
          currentLetter.contact_title || (contacts.length > 0 ? contacts[selectedContactIdx]?.title : undefined),
          companyAddress,
          companies.find((c) => c.companyname === expandedCompany)?.niche
        ))
    : null;

  const statusBadge = (s: string) => {
    switch (s) {
      case "draft": return "bg-white/60 text-gray-600 border border-gray-200";
      case "ready_to_print": return "bg-yellow-400/20 text-yellow-800 border border-yellow-300";
      case "printed": return "bg-blue-400/20 text-blue-800 border border-blue-300";
      case "sent": return "bg-emerald-400/15 text-emerald-800 border border-emerald-300/50";
      case "emailed": return "bg-sky-400/20 text-sky-800 border border-sky-300";
      default: return "bg-gray-100 text-gray-500 border border-gray-200";
    }
  };


  return (
    <div className="space-y-6">
      <div className="no-print">
        {/* ── ENTRY LEVEL header bento box ── */}
        <div className="relative rounded-2xl mb-0"
          style={{
            background: "linear-gradient(135deg, #1e293b 0%, #334155 40%, #475569 100%)",
            boxShadow: "0 20px 40px -12px rgba(0,0,0,0.35), 0 8px 20px -8px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.1)",
          }}
        >
          <div className="absolute inset-0 opacity-[0.03]"
            style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\")" }}
          />
          <div className="relative px-4 py-6 sm:px-8 sm:py-10">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
              <div>
                <h1 className="text-xl sm:text-3xl font-bold text-white tracking-tight uppercase">
                  OUTREACH | MISSION CONTROL
                </h1>
                <p className="text-slate-300 mt-1 text-xs sm:text-base font-medium uppercase tracking-wide">
                  ENTRY LEVEL BSME / EIT · DENVER METRO
                </p>
              </div>
              <div className="flex items-stretch gap-2 sm:gap-4 flex-wrap">
                <div className="text-center px-3 py-2 sm:px-4 sm:py-3 bg-white/10 rounded-xl border border-white/15 backdrop-blur-sm flex flex-col justify-center min-w-[70px] sm:min-w-[90px]">
                  <div className="text-2xl font-bold text-white">{companies.length}</div>
                  <div className="text-xs text-white/50 uppercase tracking-wider">Companies</div>
                </div>
                <div className="text-center px-3 py-2 sm:px-4 sm:py-3 bg-white/10 rounded-xl border border-white/15 backdrop-blur-sm flex flex-col justify-center min-w-[70px] sm:min-w-[90px] relative">
                  <div className="text-2xl font-bold text-white">{totalLetterCount}</div>
                  <div className="text-xs text-white/50 uppercase tracking-wider">Letters</div>
                  <button onClick={() => { setShowMailedList(!showMailedList); setShowEmailedList(false); }} className="text-xs text-emerald-300/80 font-semibold mt-0.5 hover:text-green-200 cursor-pointer">
                    {allLetters.filter(l => l.printed_at).length} printed
                  </button>
                  {showMailedList && (() => {
                    const mailed = allLetters.filter(l => l.printed_at);
                    return (
                      <div className="absolute top-full mt-2 left-0 z-50 bg-white rounded-xl shadow-2xl border border-gray-200 min-w-[280px] max-h-60 overflow-y-auto">
                        <div className="px-3 py-2 border-b bg-gray-50 rounded-t-xl">
                          <span className="text-xs font-bold text-gray-500 uppercase">{mailed.length} Letters Printed</span>
                        </div>
                        {mailed.length === 0 ? (
                          <p className="text-xs text-gray-400 px-3 py-4 text-center">No letters printed yet</p>
                        ) : mailed.map((l, i) => (
                          <details key={i} className="border-b last:border-0">
                            <summary className="px-3 py-2 hover:bg-gray-50 cursor-pointer flex items-center justify-between">
                              <span className="text-xs font-semibold text-gray-900">{l.companyname}</span>
                              <span className="text-xs text-gray-400">{l.sent_at ? new Date(l.sent_at).toLocaleDateString() : ""}</span>
                            </summary>
                            <div className="px-3 pb-2 text-xs text-gray-500">
                              {l.contactname}{l.contact_title ? ` · ${l.contact_title}` : ""}
                            </div>
                          </details>
                        ))}
                      </div>
                    );
                  })()}
                </div>
                <div className="text-center px-3 py-2 sm:px-4 sm:py-3 bg-sky-500/20 rounded-xl border border-sky-400/30 backdrop-blur-sm flex flex-col justify-center min-w-[70px] sm:min-w-[90px] relative">
                  <div className="text-2xl font-bold text-white">{companies.filter(c => c.email).length}</div>
                  <div className="text-xs text-white/50 uppercase tracking-wider">Emails</div>
                  <button onClick={() => { setShowEmailedList(!showEmailedList); setShowMailedList(false); }} className="text-xs text-sky-300 font-semibold mt-0.5 hover:text-sky-200 cursor-pointer">
                    {allLetters.filter(l => l.emailed_at).length} sent
                  </button>
                  {showEmailedList && (() => {
                    const emailed = allLetters.filter(l => l.emailed_at);
                    return (
                      <div className="absolute top-full mt-2 right-0 z-50 bg-white rounded-xl shadow-2xl border border-gray-200 min-w-[280px] max-h-60 overflow-y-auto">
                        <div className="px-3 py-2 border-b bg-sky-50 rounded-t-xl">
                          <span className="text-xs font-bold text-sky-600 uppercase">{emailed.length} Emails Sent</span>
                        </div>
                        {emailed.length === 0 ? (
                          <p className="text-xs text-gray-400 px-3 py-4 text-center">No emails sent yet</p>
                        ) : emailed.map((l, i) => (
                          <details key={i} className="border-b last:border-0">
                            <summary className="px-3 py-2 hover:bg-sky-50 cursor-pointer flex items-center justify-between">
                              <span className="text-xs font-semibold text-gray-900">{l.companyname}</span>
                              <span className="text-xs text-gray-400">{l.sent_at ? new Date(l.sent_at).toLocaleDateString() : ""}</span>
                            </summary>
                            <div className="px-3 pb-2 text-xs text-gray-500">
                              {l.contactname}{l.contact_title ? ` · ${l.contact_title}` : ""}<br/>
                              {l.contact_email}
                            </div>
                          </details>
                        ))}
                      </div>
                    );
                  })()}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Gray divider line ── */}
        <div className="border-b border-gray-300 my-5" />

        {/* ── March 2026 Mailing Calendar ── */}
        {(() => {
          const calendarLetters = Array.from(lettersMap.values()).flat();
          const sentOrPrinted = calendarLetters.filter(l => l.printed_at || l.emailed_at);

          // Group sent letters by day-of-month for March 2026
          const sentByDay = new Map<number, { companyname: string; contactname?: string }[]>();
          for (const l of sentOrPrinted) {
            const dateStr = l.sent_at || l.printed_at || "";
            if (!dateStr) continue;
            const d = new Date(dateStr);
            if (d.getFullYear() === 2026 && d.getMonth() === 2) {
              const day = d.getDate();
              if (!sentByDay.has(day)) sentByDay.set(day, []);
              sentByDay.get(day)!.push({ companyname: l.companyname, contactname: l.contactname });
            }
          }

          // March 2026 starts on Sunday (day 0), 31 days
          const daysInMonth = 31;
          const startDow = 0; // Sunday
          const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
          const cells: (number | null)[] = [];
          for (let i = 0; i < startDow; i++) cells.push(null);
          for (let d = 1; d <= daysInMonth; d++) cells.push(d);
          while (cells.length % 7 !== 0) cells.push(null);

          const today = new Date();
          const todayDay = today.getFullYear() === 2026 && today.getMonth() === 2 ? today.getDate() : -1;

          return (
            <div className="mb-6 rounded-xl border border-gray-300 bg-white overflow-hidden"
              style={{ boxShadow: "0 10px 30px -8px rgba(0,0,0,0.12), 0 4px 12px -4px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.6)" }}
            >
              <div className="px-5 py-3.5 border-b border-gray-300 bg-gradient-to-r from-gray-100 to-gray-50 flex items-center justify-between">
                <h2 className="text-sm font-bold text-gray-800">March 2026</h2>
                <span className="text-xs font-semibold text-gray-500">{sentOrPrinted.length} letters sent</span>
              </div>
              <div className="p-4 bg-gradient-to-b from-gray-50/50 to-white">
                {/* Day-of-week headers */}
                <div className="grid grid-cols-7 mb-2">
                  {dayNames.map(d => (
                    <div key={d} className="text-center text-xs font-bold text-gray-600 uppercase py-1.5">{d}</div>
                  ))}
                </div>
                {/* Calendar grid */}
                <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
                  {cells.map((day, i) => {
                    if (day === null) return <div key={i} />;
                    const entries = sentByDay.get(day);
                    const count = entries ? entries.length : 0;
                    const isToday = day === todayDay;
                    return (
                      <div
                        key={i}
                        className={`relative rounded-lg text-center py-2 sm:py-2.5 text-xs transition-all group cursor-default ${
                          count > 0
                            ? "bg-emerald-100/60 text-emerald-900 font-bold ring-1 ring-emerald-300/50 shadow-sm"
                            : isToday
                            ? "bg-emerald-50/80 text-emerald-800 font-semibold ring-1 ring-emerald-300/40"
                            : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                        }`}
                      >
                        {day}
                        {count > 0 && (
                          <span className="absolute -top-1 -right-1 min-w-[16px] h-4 flex items-center justify-center rounded-full bg-emerald-600/80 text-white text-xs font-bold px-1">
                            {count}
                          </span>
                        )}
                        {/* Tooltip on hover */}
                        {count > 0 && (
                          <div className="hidden group-hover:block absolute z-20 left-1/2 -translate-x-1/2 top-full mt-1 w-48 bg-gray-900 text-white rounded-lg p-2 text-xs text-left shadow-xl">
                            <div className="font-bold mb-1">March {day} — {count} sent</div>
                            {entries!.slice(0, 5).map((e, j) => (
                              <div key={j} className="truncate text-gray-300">
                                {e.companyname}{e.contactname ? ` → ${e.contactname}` : ""}
                              </div>
                            ))}
                            {count > 5 && <div className="text-gray-500 mt-0.5">+{count - 5} more</div>}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                {sentOrPrinted.length === 0 && (
                  <div className="text-center text-sm text-gray-400 py-3 mt-2">
                    No letters sent yet. Print a letter to start tracking.
                  </div>
                )}
              </div>
            </div>
          );
        })()}


        {/* ── Search Filters ── */}
        <div className="grid grid-cols-4 gap-2 mb-5">
          <input
            type="text" placeholder="Company" value={compSearch}
            onChange={(e) => setCompSearch(e.target.value)}
            className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs bg-white shadow-sm focus:ring-2 focus:ring-green-500/20 focus:border-green-400 transition-all"
          />
          <input
            type="text" placeholder="Contact / Email" value={contactSearch}
            onChange={(e) => setContactSearch(e.target.value)}
            className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs bg-white shadow-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
          />
          <input
            type="text" placeholder="City" value={locationSearch}
            onChange={(e) => setLocationSearch(e.target.value)}
            className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs bg-white shadow-sm focus:ring-2 focus:ring-teal-500/20 focus:border-teal-400 transition-all"
          />
          <input
            type="text" placeholder="Keyword" value={keywordSearch}
            onChange={(e) => setKeywordSearch(e.target.value)}
            className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs bg-white shadow-sm focus:ring-2 focus:ring-gray-500/20 focus:border-gray-400 transition-all"
          />
        </div>

        {companiesLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-4 border-gray-200 border-t-blue-500 rounded-full animate-spin" />
          </div>
        ) : (
          (() => {
            const grouped = new Map<string, CompanyRow[]>();
            for (const c of filteredCompanies) {
              const n = c.niche || "Other";
              if (!grouped.has(n)) grouped.set(n, []);
              grouped.get(n)!.push(c);
            }

            // Build ordered list of niches: follow NICHE_ORDER, then any extras
            const orderedNiches: string[] = [];
            for (const n of NICHE_ORDER) {
              if (grouped.has(n) && grouped.get(n)!.length > 0) {
                orderedNiches.push(n);
              }
            }
            // Add any niches not in NICHE_ORDER (e.g. new categories)
            Array.from(grouped.keys()).forEach((n) => {
              if (!orderedNiches.includes(n) && n !== "Other") {
                orderedNiches.push(n);
              }
            });
            // "Other" always last
            if (grouped.has("Other") && grouped.get("Other")!.length > 0) {
              if (!orderedNiches.includes("Other")) orderedNiches.push("Other");
            }

            orderedNichesRef.current = orderedNiches;

            let globalIdx = 0;

            function renderBentoBox(niche: string, items: CompanyRow[]) {
              const colors = NICHE_COLORS[niche] || DEFAULT_COLORS;
              const PREVIEW_COUNT = 3;
              const isFullyExpanded = expandedNiches.has(niche);
              // Sort: companies with email first, then without
              const sortedItems = [...items].sort((a, b) => {
                // Tier 1: has contact with email (3), Tier 2: has contact no email (2), Tier 3: no contact (1)
                const tierOf = (c: CompanyRow) => c.email ? 3 : c.contactname ? 2 : 1;
                return tierOf(b) - tierOf(a);
              });
              const visibleItems = isFullyExpanded ? sortedItems : sortedItems.slice(0, PREVIEW_COUNT);
              const hiddenCount = items.length - PREVIEW_COUNT;
              const sentCount = items.filter(c => { const letters = lettersMap.get(c.companyname); return letters && letters.some(l => l.printed_at || l.emailed_at); }).length;
              const emailCount = items.filter(c => c.email).length;

              return (
                <div
                  key={niche}
                  className={`rounded-2xl border ${colors.border} overflow-hidden transition-all duration-300 min-w-0`}
                  style={{
                    boxShadow: "0 20px 40px -12px rgba(0,0,0,0.15), 0 8px 20px -8px rgba(0,0,0,0.1), inset 0 1px 0 rgba(255,255,255,0.6)",
                  }}
                >
                  {/* Niche header */}
                  <div
                    className={`relative px-5 py-4 ${colors.headerBg ? `bg-gradient-to-r ${colors.headerBg}` : ""}`}
                    style={{
                      boxShadow: "inset 0 1px 0 rgba(255,255,255,0.15), 0 2px 4px rgba(0,0,0,0.1)",
                      ...(!colors.headerBg ? { background: "linear-gradient(135deg, #5b2333 0%, #3d1522 50%, #2a0e18 100%)" } : {}),
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="font-bold text-sm text-white drop-shadow-sm">
                          {niche}
                        </h3>
                        <p className="text-xs text-white/60 mt-0.5">
                          {items.length} {items.length === 1 ? "company" : "companies"}
                          {(() => { const total = items.reduce((s, x) => s + (x.contact_count || 0), 0); return total > 0 ? <span className="text-white/80 ml-1"> · {total} contacts</span> : null; })()}
                          {(() => { const total = items.reduce((s, x) => s + (x.email_count || 0), 0); return total > 0 ? <span className="text-sky-300 ml-1"> · {total} with email</span> : null; })()}
                          {sentCount > 0 && <span className="text-green-300 ml-1"> · {sentCount} sent</span>}
                        </p>
                      </div>
                      {niche !== "TEST" && (
                        <button
                          onClick={() => openFindLeads(niche)}
                          className="text-white/60 hover:text-white transition-colors p-1.5 rounded-lg hover:bg-white/10"
                          title="Find new companies in this niche"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                          </svg>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Companies list — first 3 always visible, rest on expand */}
                  {(() => {
                    return (
                    <div className={`bg-gradient-to-b ${colors.bg} divide-y divide-black/[0.04]`}>
                      {visibleItems.map((c) => {
                        globalIdx++;
                        const num = globalIdx;
                        const isExpanded = expandedCompany === c.companyname;
                        const letter = getBestLetter(c.companyname);
                        const companyLetters = lettersMap.get(c.companyname) || [];
                        const hasPrinted = companyLetters.some(l => l.printed_at);
                        const hasEmailed = companyLetters.some(l => l.emailed_at);
                        const printedLetter = companyLetters.find(l => l.printed_at);
                        const emailedLetter = companyLetters.find(l => l.emailed_at);
                        const isDraft = letter && !hasPrinted && !hasEmailed;
                        return (
                          <div key={c.companyname}>
                            <button
                              onClick={() => expandCompany(c.companyname)}
                              className={`w-full text-left px-4 py-3 sm:py-2.5 flex items-center justify-between transition-all duration-200 ${
                                isExpanded
                                  ? "bg-white/80 shadow-inner"
                                  : "hover:bg-white/50"
                              }`}
                            >
                              <div className="flex items-center gap-2.5 min-w-0">
                                <span className="shrink-0 w-5 h-5 text-xs rounded-full flex items-center justify-center font-bold bg-black/[0.06] text-gray-400">
                                  {num}
                                </span>
                                <div className="min-w-0">
                                  <span className="font-semibold text-xs truncate block text-gray-800">
                                    {c.companyname}
                                  </span>
                                  <span className="text-xs truncate block text-gray-400">
                                    {c.city}
                                  </span>
                                </div>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                {/* Printed letter icon + month/year */}
                                {hasPrinted && (
                                  <div className="flex items-center gap-1">
                                    <svg className="w-3.5 h-3.5 text-emerald-500/70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                    </svg>
                                    {printedLetter?.printed_at && (
                                      <span className="text-[10px] text-gray-400 tabular-nums">
                                        {new Date(printedLetter.printed_at).toLocaleDateString("en-US", { month: "short", year: "numeric" })}
                                      </span>
                                    )}
                                  </div>
                                )}
                                {/* Emailed icon + month/year */}
                                {hasEmailed && (
                                  <div className="flex items-center gap-1">
                                    <svg className="w-3.5 h-3.5 text-sky-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                                    </svg>
                                    {emailedLetter?.emailed_at && (
                                      <span className="text-[10px] text-gray-400 tabular-nums">
                                        {new Date(emailedLetter.emailed_at).toLocaleDateString("en-US", { month: "short", year: "numeric" })}
                                      </span>
                                    )}
                                  </div>
                                )}
                                {/* Email available indicator (only if no letters sent yet) */}
                                {!hasPrinted && !hasEmailed && (c.email || letter?.contact_email) && (
                                  <svg className="w-3.5 h-3.5 text-sky-300/60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                                  </svg>
                                )}
                                {/* Draft badge */}
                                {isDraft && (
                                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${statusBadge("draft")}`}>
                                    draft
                                  </span>
                                )}
                                <svg
                                  className={`w-3.5 h-3.5 transition-transform duration-200 text-gray-300 ${isExpanded ? "rotate-180" : ""}`}
                                  fill="none"
                                  stroke="currentColor"
                                  viewBox="0 0 24 24"
                                >
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                </svg>
                              </div>
                            </button>

                            {/* Expanded company detail */}
                            {isExpanded && (
                              <div className="border-t border-black/[0.06] bg-white/90 backdrop-blur-sm px-3 sm:px-5 pb-4 sm:pb-5 pt-3 sm:pt-4">
                                {expandLoading ? (
                                  <div className="flex items-center gap-2 py-3">
                                    <div className="w-4 h-4 border-2 border-gray-200 border-t-blue-500 rounded-full animate-spin" />
                                    <span className="text-xs text-gray-400">Loading...</span>
                                  </div>
                                ) : (
                                  <>
                                    {/* Company name + address + delete */}
                                    <div className="mb-3 flex items-start justify-between">
                                      <div>
                                        <h4 className="text-sm font-bold text-gray-900">{c.companyname}</h4>
                                        {companyAddress && <p className="text-xs text-gray-500 mt-0.5 whitespace-pre-line">{companyAddress}</p>}
                                      </div>
                                      {deleteConfirm === c.companyname ? (
                                        <div className="flex items-center gap-1.5 shrink-0">
                                          <span className="text-xs text-red-600 font-semibold">Remove?</span>
                                          <button
                                            onClick={(e) => { e.stopPropagation(); deleteCompany(c.companyname); }}
                                            disabled={deletingCompany === c.companyname}
                                            className="px-2 py-1 text-xs font-bold rounded-md bg-red-500 text-white hover:bg-red-600 disabled:opacity-50 transition-colors"
                                          >
                                            {deletingCompany === c.companyname ? "..." : "Yes"}
                                          </button>
                                          <button
                                            onClick={(e) => { e.stopPropagation(); setDeleteConfirm(null); }}
                                            className="px-2 py-1 text-xs font-semibold rounded-md bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
                                          >
                                            No
                                          </button>
                                        </div>
                                      ) : (
                                        <button
                                          onClick={(e) => { e.stopPropagation(); setDeleteConfirm(c.companyname); }}
                                          className="text-gray-300 hover:text-red-400 transition-colors p-1 rounded-lg hover:bg-red-50 shrink-0"
                                          title="Remove company"
                                        >
                                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                          </svg>
                                        </button>
                                      )}
                                    </div>

                                    {/* Company description */}
                                    {c.company_about && (
                                    <div className={`mb-3 p-3 rounded-xl bg-gradient-to-r ${colors.descBg}`} style={{ boxShadow: "inset 0 1px 2px rgba(0,0,0,0.04)" }}>
                                      <p className={`text-xs ${colors.descText} leading-relaxed font-medium`}>{c.company_about}</p>
                                    </div>
                                    )}

                                    {/* Jobs */}
                                    <div className="mb-3">
                                      <button
                                        onClick={async () => {
                                          if (jobsCompany === c.companyname) { setJobsCompany(null); return; }
                                          setJobsCompany(c.companyname);
                                          setJobsLoading2(true);
                                          setJobResults2([]);
                                          try {
                                            const res = await fetch("/api/search-jobs", {
                                              method: "POST",
                                              headers: { "Content-Type": "application/json" },
                                              body: JSON.stringify({ companyname: c.companyname }),
                                            });
                                            const data = await res.json();
                                            setJobResults2(data.jobs || []);
                                          } catch { setJobResults2([]); }
                                          finally { setJobsLoading2(false); }
                                        }}
                                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${jobsCompany === c.companyname ? "bg-blue-600 text-white" : "bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200/60"}`}
                                      >
                                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                                        </svg>
                                        {jobsLoading2 && jobsCompany === c.companyname ? "Searching..." : "Jobs"}
                                      </button>

                                      {jobsCompany === c.companyname && (
                                        <div className="mt-2 rounded-xl border border-blue-100 bg-blue-50/30 overflow-hidden">
                                          {jobsLoading2 && (
                                            <div className="px-4 py-5 space-y-3">
                                              {[1,2,3].map(i => (
                                                <div key={i} className="animate-pulse flex items-center gap-3">
                                                  <div className="flex-1 space-y-1.5">
                                                    <div className="h-3 bg-blue-100 rounded w-3/4" />
                                                    <div className="h-2 bg-blue-50 rounded w-1/2" />
                                                  </div>
                                                  <div className="h-6 w-14 bg-blue-100 rounded-lg" />
                                                </div>
                                              ))}
                                              <p className="text-[10px] text-blue-400 text-center pt-1">Searching live job boards...</p>
                                            </div>
                                          )}
                                          {!jobsLoading2 && jobResults2.length === 0 && (
                                            <div className="px-4 py-5 text-center">
                                              <p className="text-xs text-gray-400">No current openings found for this company</p>
                                            </div>
                                          )}
                                          {!jobsLoading2 && jobResults2.length > 0 && (
                                            <div className="divide-y divide-blue-100/60">
                                              {jobResults2.map((job, ji) => {
                                                return (
                                                <div key={ji} className="px-4 py-3">
                                                  <p className="text-xs font-bold text-gray-900 leading-tight">{job.title}</p>
                                                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                                                    {job.location && <span className="text-[10px] text-gray-500">{job.location}</span>}
                                                    {job.salary && <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">{job.salary}</span>}
                                                    {job.source && <span className="text-[10px] text-gray-300">{job.source}</span>}
                                                  </div>
                                                  {job.summary && <p className="text-[10px] text-gray-500 mt-1.5 leading-relaxed">{job.summary}</p>}
                                                  <div className="mt-2">
                                                    {(() => {
                                                      const displayName = c.companyname
                                                        .replace(/\s*,?\s*(Corp\.?|Corporation|Inc\.?|LLC|Ltd\.?|Co\.?|Company|SE\s*&\s*Co\.\s*KG)$/i, "").trim();
                                                      // Extract role label directly from the job title
                                                      const roleLabel = (job.title || "mechanical engineer")
                                                        .replace(/\s*[-–—]\s*.+$/, "")  // strip suffixes after dashes
                                                        .replace(/\s*[:(].+$/, "")        // strip parenthetical/colon suffixes
                                                        .replace(/\b(I{1,3}|IV|[1-4])\b/g, "")  // strip level numbers
                                                        .replace(/\b(Entry[- ]Level|Early Career|New Grad|Junior|Associate)\b/gi, "")
                                                        .replace(/\s{2,}/g, " ")
                                                        .trim()
                                                        .toLowerCase() || "mechanical engineer";

                                                      const pickerOpen = jobContactPicker?.jobIdx === ji && jobContactPicker?.company === c.companyname;
                                                      const pickerAction = jobContactPicker?.action;

                                                      async function handleContactAction(ct: typeof contacts[0], action: "email"|"letter") {
                                                        setJobContactPicker(null);
                                                        let skillSentence = "I have hands-on experience taking CAD designs from concept through prototype and fabrication, including SolidWorks, CNC machining, and 3D printing.";
                                                        let matches: {job_skill: string; resume_skill: string}[] = [];
                                                        try {
                                                          const r = await fetch("/api/match-skills", {
                                                            method: "POST",
                                                            headers: { "Content-Type": "application/json" },
                                                            body: JSON.stringify({ jobTitle: job.title, jobSummary: job.summary, companyName: displayName }),
                                                          });
                                                          const d = await r.json();
                                                          if (d.sentence) skillSentence = d.sentence;
                                                          if (d.matches) matches = d.matches;
                                                        } catch { /* fallback */ }

                                                        if (action === "email") {
                                                          const firstName = ct.contactname.split(" ")[0];
                                                          const emailBody = `Hello ${firstName},

I hope you're doing well. My name is Kohler Wood, EIT and recent BSME graduate from Colorado School of Mines.

I'm writing because I'm interested in the work you're doing at ${displayName} and noticed a recent opening for an entry-level ${roleLabel}.

${skillSentence}

I have attached my résumé below. My projects and interests are included here: kohler.solokit.app.

Thank you for your time, and I hope to hear from you.

Kohler Wood
208-720-4635
Lakewood, CO
akwood1@mines.edu`;
                                                          setEmailConfirm({
                                                            to: ct.email,
                                                            contactname: ct.contactname,
                                                            companyname: c.companyname,
                                                            body: emailBody,
                                                            attachments: ["resume"],
                                                            subject: `Mechanical Engineer — CO School of Mines, EIT`,
                                                            matches,
                                                          });
                                                        } else {
                                                          const companyAddr = companyAddress || "";
                                                          const today = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
                                                          const letterBody = `${today}

${ct.contactname}
${c.companyname}
${companyAddr}

Hello ${ct.contactname.split(" ")[0]},

I hope you're doing well. My name is Kohler Wood, EIT and recent BSME graduate from Colorado School of Mines.

I'm writing because I'm interested in the work you're doing at ${displayName} and noticed a recent opening for an entry-level ${roleLabel}.

${skillSentence}

I've included my résumé and card, which links to my projects and interests. If you are considering an entry-level BSME/EIT with my skill set, I would love to interview with your team.

Thank you for your time, and I hope to hear from you.

Sincerely,




Kohler Wood
208-720-4635
Lakewood, CO
akwood1@mines.edu`;
                                                          // Save draft to DB
                                                          try {
                                                            const res = await fetch("/api/draft", {
                                                              method: "POST",
                                                              headers: { "Content-Type": "application/json" },
                                                              body: JSON.stringify({ companyname: c.companyname, contactname: ct.contactname, body_final: letterBody, status: "draft" }),
                                                            });
                                                            const data = await res.json();
                                                            if (data.error) throw new Error(data.error);
                                                            if (data && data.id) {
                                                              setLettersMap(prev => upsertLetterInMap(prev, c.companyname, data));
                                                            }
                                                          } catch (e) { toast((e as Error).message, "error"); }
                                                          // Open letter preview popup
                                                          setLetterConfirm({
                                                            contactname: ct.contactname,
                                                            companyname: c.companyname,
                                                            body: letterBody,
                                                            matches,
                                                          });
                                                        }
                                                      }

                                                      const contactsWithEmail = contacts.filter(ct => ct.email);

                                                      return (
                                                        <>
                                                          <div className="flex items-center gap-2">
                                                            {contactsWithEmail.length > 0 && template && (
                                                              <button
                                                                onClick={() => {
                                                                  if (contactsWithEmail.length === 1) { handleContactAction(contactsWithEmail[0], "email"); return; }
                                                                  setJobContactPicker(pickerOpen && pickerAction === "email" ? null : { jobIdx: ji, action: "email", company: c.companyname });
                                                                }}
                                                                className={`px-3 py-1.5 text-[10px] font-bold rounded-lg transition-colors flex items-center gap-1 ${pickerOpen && pickerAction === "email" ? "bg-blue-700 text-white" : "bg-blue-600 text-white hover:bg-blue-700"}`}
                                                              >
                                                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                                                                Email{contactsWithEmail.length > 1 ? " ▾" : ""}
                                                              </button>
                                                            )}
                                                            {contacts.length > 0 && template && (
                                                              <button
                                                                onClick={() => {
                                                                  if (contacts.length === 1) { handleContactAction(contacts[0], "letter"); return; }
                                                                  setJobContactPicker(pickerOpen && pickerAction === "letter" ? null : { jobIdx: ji, action: "letter", company: c.companyname });
                                                                }}
                                                                className={`px-3 py-1.5 text-[10px] font-bold rounded-lg transition-colors flex items-center gap-1 ${pickerOpen && pickerAction === "letter" ? "bg-gray-800 text-white" : "bg-gray-700 text-white hover:bg-gray-800"}`}
                                                              >
                                                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                                                                Letter{contacts.length > 1 ? " ▾" : ""}
                                                              </button>
                                                            )}
                                                            {contacts.length === 0 && (
                                                              <button
                                                                onClick={() => researchContacts(c.companyname)}
                                                                disabled={researching}
                                                                className="px-3 py-1.5 text-[10px] font-bold rounded-lg bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-50 transition-colors flex items-center gap-1"
                                                              >
                                                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                                                                Find Contacts
                                                              </button>
                                                            )}
                                                            {job.apply_url && (
                                                              <a
                                                                href={job.apply_url}
                                                                target="_blank" rel="noopener noreferrer"
                                                                className="px-3 py-1.5 text-[10px] font-medium rounded-lg bg-white text-gray-500 hover:text-gray-700 hover:bg-gray-50 border border-gray-200 transition-colors flex items-center gap-1"
                                                              >
                                                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                                                                Job Link
                                                              </a>
                                                            )}
                                                          </div>
                                                          {/* Contact picker dropdown */}
                                                          {pickerOpen && (
                                                            <div className="mt-1.5 rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden">
                                                              <div className="px-2.5 py-1.5 bg-gray-50 border-b border-gray-100">
                                                                <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">Choose contact to {pickerAction}</span>
                                                              </div>
                                                              {(pickerAction === "email" ? contactsWithEmail : contacts).map((ct, ci) => (
                                                                <button
                                                                  key={ci}
                                                                  onClick={() => handleContactAction(ct, pickerAction!)}
                                                                  className="w-full text-left px-2.5 py-1.5 hover:bg-blue-50 transition-colors flex items-center justify-between gap-2 border-b border-gray-50 last:border-0"
                                                                >
                                                                  <div className="min-w-0">
                                                                    <p className="text-[10px] font-semibold text-gray-900 truncate">{ct.contactname}</p>
                                                                    <p className="text-[9px] text-gray-400 truncate">{ct.title}{ct.email ? ` · ${ct.email}` : ""}</p>
                                                                  </div>
                                                                  <svg className="w-3 h-3 text-gray-300 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                                                                </button>
                                                              ))}
                                                            </div>
                                                          )}
                                                        </>
                                                      );
                                                    })()}
                                                  </div>
                                                </div>
                                                );
                                              })}
                                            </div>
                                          )}
                                        </div>
                                      )}
                                    </div>

                                    {/* Contacts */}
                                    {contacts.length === 0 && (
                                      <div className="mb-4 p-4 rounded-xl border border-dashed border-amber-300 bg-amber-50/50">
                                        <div className="flex items-center justify-between">
                                          <div className="flex items-center gap-2">
                                            <svg className="w-4 h-4 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                            </svg>
                                            <span className="text-xs font-semibold text-amber-800">No contacts yet</span>
                                          </div>
                                          <button
                                            onClick={() => researchContacts(c.companyname)}
                                            disabled={researching}
                                            className="px-3 py-1.5 text-xs font-bold rounded-lg bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-50 transition-all flex items-center gap-1.5"
                                          >
                                            {researching ? <><div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Researching...</> : <><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg> Research Contacts</>}
                                          </button>
                                        </div>
                                      </div>
                                    )}

                                    {contacts.length > 0 && (
                                      <div className="space-y-1">
                                        <label className="text-xs font-bold text-gray-400 uppercase tracking-wider block mb-2">Contacts</label>
                                        {contacts.map((ct, i) => {
                                          const ctLetter = contactLetters.get(ct.contactname);
                                          return (
                                          <div key={i} className="flex flex-col sm:flex-row sm:items-center gap-2 px-3 py-2.5 rounded-lg border border-gray-100 hover:border-gray-200 bg-white transition-colors">
                                            <div className="flex-1 min-w-0">
                                              <div className="flex items-center gap-2">
                                                <span className="text-sm font-semibold text-gray-900 truncate">{ct.contactname}</span>
                                                {ctLetter?.printed_at && (
                                                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full flex items-center gap-1 bg-emerald-50 text-emerald-700">
                                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                                                    {new Date(ctLetter.printed_at).toLocaleDateString("en-US", { month: "short", year: "numeric" })}
                                                  </span>
                                                )}
                                                {ctLetter?.emailed_at && (
                                                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full flex items-center gap-1 bg-sky-100 text-sky-700">
                                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                                                    {new Date(ctLetter.emailed_at).toLocaleDateString("en-US", { month: "short", year: "numeric" })}
                                                  </span>
                                                )}
                                              </div>
                                              {ct.title && <div className="text-xs text-gray-500 truncate">{ct.title}</div>}
                                              {ct.email && <div className="text-xs text-sky-600 truncate">{ct.email}</div>}
                                            </div>
                                            <div className="flex items-center gap-1.5 shrink-0">
                                            <button
                                              onClick={() => {
                                                applyContact(i);
                                                const freshBody = template ? assembleLetter(template, expandedCompany || "", "", ct.contactname, ct.title, companyAddress, companies.find(co => co.companyname === expandedCompany)?.niche).body : "";
                                                setLetterConfirm({ contactname: ct.contactname, companyname: expandedCompany || "", body: freshBody });
                                              }}
                                              className="px-3 py-1.5 text-xs font-bold rounded-lg bg-green-700 text-white hover:bg-green-800 transition-colors whitespace-nowrap shrink-0"
                                            >
                                              Letter
                                            </button>
                                            {ct.email ? (
                                              <button
                                                onClick={() => {
                                                  applyContact(i);
                                                  const freshBody = template ? assembleLetter(template, expandedCompany || "", "", ct.contactname, ct.title, companyAddress, companies.find(co => co.companyname === expandedCompany)?.niche).body : "";
                                                  setEmailConfirm({ to: ct.email, contactname: ct.contactname, companyname: expandedCompany || "", body: freshBody, attachments: ["resume"] });
                                                }}
                                                className="px-3 py-1.5 text-xs font-bold rounded-lg bg-sky-500 text-white hover:bg-sky-600 transition-colors whitespace-nowrap shrink-0"
                                              >
                                                Email
                                              </button>
                                            ) : ct.email_searched ? (
                                              <button
                                                onClick={() => findEmail(i)}
                                                disabled={findingEmail}
                                                className="px-3 py-1.5 text-xs text-gray-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors whitespace-nowrap shrink-0 disabled:opacity-50"
                                              >
                                                {findingEmailIdx === i ? "Searching..." : "No email · retry"}
                                              </button>
                                            ) : (
                                              <button
                                                onClick={() => findEmail(i)}
                                                disabled={findingEmail}
                                                className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0"
                                              >
                                                {findingEmailIdx === i ? "..." : "Find Email"}
                                              </button>
                                            )}
                                            </div>
                                          </div>
                                          );
                                        })}
                                      </div>
                                    )}


                                  </>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                      {hiddenCount > 0 && (
                        <button
                          onClick={() => toggleNiche(niche)}
                          className="w-full px-4 py-2 text-xs font-semibold text-gray-500 hover:text-gray-700 hover:bg-white/50 transition-colors flex items-center justify-center gap-1"
                        >
                          {isFullyExpanded ? "Show less" : `Show remaining ${hiddenCount} companies`}
                        </button>
                      )}
                    </div>
                    );
                  })()}
                </div>
              );
            }

            return (
              <div ref={gridRef} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-5">
                {orderedNiches.map((niche) => {
                  const items = grouped.get(niche);
                  if (!items || items.length === 0) return null;
                  return renderBentoBox(niche, items);
                })}
              </div>
            );
          })()
        )}
      </div>

      {/* ── Email Confirmation Dialog ── */}
      {emailConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm no-print">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full mx-4 overflow-hidden max-h-[90vh] flex flex-col">
            <div className="px-6 py-4 bg-gradient-to-r from-sky-500 to-sky-600 shrink-0">
              <h3 className="text-white font-bold text-base">Confirm Email</h3>
            </div>
            <div className="px-6 py-5 space-y-3 overflow-y-auto">
              <div className="flex gap-4">
                <div className="flex-1 space-y-2">
                  <div>
                    <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">To</span>
                    <p className="text-sm font-semibold text-gray-900 mt-0.5">{emailConfirm.contactname}</p>
                    <p className="text-sm text-sky-600">{emailConfirm.to}</p>
                  </div>
                  <div>
                    <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Company</span>
                    <p className="text-sm font-semibold text-gray-900 mt-0.5">{emailConfirm.companyname}</p>
                  </div>
                </div>
                {emailConfirm.matches !== undefined && (
                  emailConfirm.matches.length > 0 ? (
                    <div className="w-56 shrink-0 rounded-lg border border-emerald-200 bg-emerald-50/40 p-2.5">
                      <span className="text-[9px] font-bold text-emerald-600 uppercase tracking-wider">Skill Match</span>
                      <div className="mt-1 space-y-1">
                        {emailConfirm.matches.map((m, i) => (
                          <div key={i} className="flex items-center gap-1.5 text-[10px]">
                            <span className="text-gray-500 flex-1 truncate">{m.job_skill}</span>
                            <svg className="w-2.5 h-2.5 text-emerald-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg>
                            <span className="text-emerald-800 font-semibold flex-1 truncate">{m.resume_skill}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="w-56 shrink-0 rounded-lg border border-gray-200 bg-gray-50/40 p-2.5">
                      <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">Skill Match</span>
                      <p className="text-[10px] text-gray-400 mt-1.5">No direct skill overlap — using general intro</p>
                    </div>
                  )
                )}
              </div>
              <div>
                <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Subject</span>
                <p className="text-sm text-gray-700 mt-0.5">{emailConfirm.subject || "Mechanical Engineer — CO School of Mines, EIT"}</p>
              </div>
              <div>
                <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Email Body</span>
                {emailConfirm.editing ? (
                  <textarea
                    value={emailConfirm.body}
                    onChange={(e) => setEmailConfirm({ ...emailConfirm, body: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-sky-200 p-3 focus:ring-2 focus:ring-sky-500/20 focus:border-sky-400 focus:outline-none text-xs text-gray-700 leading-relaxed"
                    style={{ minHeight: "250px", whiteSpace: "pre-wrap" }}
                  />
                ) : (
                  <div className="mt-1 p-3 bg-gray-50 rounded-lg border border-gray-200 max-h-60 overflow-y-auto text-xs text-gray-700 whitespace-pre-wrap leading-relaxed">
                    {(() => {
                      let preview = emailConfirm.body;
                      const dearIdx = preview.indexOf("Hello ");
                      if (dearIdx > 0) preview = preview.substring(dearIdx);
                      preview = preview.replace(
                        "I've included my résumé and card, which links to my projects and interests. If you are considering an entry-level BSME/EIT with my skill set, I would love to interview with your team.",
                        "I've attached my résumé below. My projects and interests are included here: kohler.solokit.app. If you are considering an entry-level BSME/EIT with my skill set, I would love to interview with your team."
                      );
                      return preview.split("kohler.solokit.app").map((part, idx, arr) => (
                        <span key={idx}>{part}{idx < arr.length - 1 && <a href="https://kohler.solokit.app" target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">kohler.solokit.app</a>}</span>
                      ));
                    })()}
                  </div>
                )}
              </div>
              <div>
                <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Attachments</span>
                <div className="flex flex-wrap gap-2 mt-1.5">
                  {emailConfirm.attachments.includes("resume") ? (
                    <div className="flex items-center gap-0 rounded-full border border-purple-300/80 overflow-hidden" style={{ background: "rgba(44,15,56,0.08)" }}>
                      <a
                        href="/KOHLER_WOOD_RESUME.pdf"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs font-medium flex items-center gap-1.5 px-2.5 py-1 hover:underline transition-colors"
                        style={{ color: "#2c0f38" }}
                      >
                        📄 Resume PDF
                      </a>
                      <button
                        onClick={() => setEmailConfirm({...emailConfirm, attachments: emailConfirm.attachments.filter(a => a !== "resume")})}
                        className="px-1.5 py-1 hover:bg-purple-200/40 transition-colors"
                      >
                        <svg className="w-3 h-3" style={{ color: "#2c0f38" }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                      </button>
                    </div>
                  ) : (
                    <button onClick={() => setEmailConfirm({...emailConfirm, attachments: [...emailConfirm.attachments, "resume"]})} className="text-xs bg-gray-50 text-gray-400 border border-dashed border-gray-300 rounded-full px-2.5 py-1 font-medium flex items-center gap-1.5 hover:bg-gray-100 hover:text-gray-600 transition-colors">
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                      <span>Resume PDF</span>
                    </button>
                  )}
                </div>
                {emailConfirm.attachments.length === 0 && (
                  <p className="text-xs text-amber-600 mt-1.5">⚠ No attachments selected — email will send without resume</p>
                )}
              </div>
              <div>
                <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">From</span>
                <p className="text-sm text-gray-700 mt-0.5">Kohler Wood (kwood12802@gmail.com)</p>
                <p className="text-xs text-gray-400">Reply-to: akwood1@mines.edu</p>
              </div>
            </div>
            <div className="px-6 py-4 bg-gray-50 border-t flex justify-end gap-3">
              <button
                onClick={() => setEmailConfirm(null)}
                className="px-4 py-2 text-sm font-semibold rounded-lg bg-white border border-gray-200 text-gray-700 hover:bg-gray-100 transition-colors"
              >
                Cancel
              </button>
              {!emailConfirm.editing && (
                <button
                  onClick={() => setEmailConfirm({ ...emailConfirm, editing: true })}
                  className="px-4 py-2 text-sm font-semibold rounded-lg bg-white border border-gray-200 text-gray-700 hover:bg-gray-100 transition-colors"
                >
                  Edit
                </button>
              )}
              {emailConfirm.editing && (
                <button
                  onClick={() => setEmailConfirm({ ...emailConfirm, editing: false })}
                  className="px-4 py-2 text-sm font-semibold rounded-lg bg-green-600 text-white hover:bg-green-700 transition-colors"
                >
                  Save
                </button>
              )}
              <button
                onClick={confirmSendEmail}
                className="px-5 py-2 text-sm font-bold rounded-lg bg-sky-500 text-white hover:bg-sky-600 transition-colors flex items-center gap-2"
                style={{ boxShadow: "0 2px 6px rgba(0,0,0,0.2)" }}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                Send Email
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Letter Popup ── */}
      {letterConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm no-print">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full mx-4 overflow-hidden max-h-[90vh] flex flex-col">
            <div className="px-6 py-4 bg-gradient-to-r from-green-700 to-green-800 shrink-0">
              <h3 className="text-white font-bold text-base">Physical Letter</h3>
            </div>
            <div className="px-6 py-5 space-y-3 overflow-y-auto">
              <div className="flex gap-4">
                <div className="flex-1 space-y-2">
                  <div>
                    <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">To</span>
                    <p className="text-sm font-semibold text-gray-900 mt-0.5">{letterConfirm.contactname}</p>
                  </div>
                  <div>
                    <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Company</span>
                    <p className="text-sm font-semibold text-gray-900 mt-0.5">{letterConfirm.companyname}</p>
                  </div>
                </div>
                {letterConfirm.matches !== undefined && (
                  letterConfirm.matches.length > 0 ? (
                    <div className="w-56 shrink-0 rounded-lg border border-emerald-200 bg-emerald-50/40 p-2.5">
                      <span className="text-[9px] font-bold text-emerald-600 uppercase tracking-wider">Skill Match</span>
                      <div className="mt-1 space-y-1">
                        {letterConfirm.matches.map((m, i) => (
                          <div key={i} className="flex items-center gap-1.5 text-[10px]">
                            <span className="text-gray-500 flex-1 truncate">{m.job_skill}</span>
                            <svg className="w-2.5 h-2.5 text-emerald-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg>
                            <span className="text-emerald-800 font-semibold flex-1 truncate">{m.resume_skill}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="w-56 shrink-0 rounded-lg border border-gray-200 bg-gray-50/40 p-2.5">
                      <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">Skill Match</span>
                      <p className="text-[10px] text-gray-400 mt-1.5">No direct skill overlap — using general intro</p>
                    </div>
                  )
                )}
              </div>
              <div>
                <span className="text-xs font-bold text-green-600 uppercase tracking-wider">Letter Body</span>
                {letterConfirm.editing ? (
                  <textarea
                    value={letterConfirm.body}
                    onChange={(e) => setLetterConfirm({ ...letterConfirm, body: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-green-200 p-4 focus:ring-2 focus:ring-green-500/20 focus:border-green-400 focus:outline-none"
                    style={{ fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "10pt", lineHeight: "1.6", minHeight: "400px", whiteSpace: "pre-wrap" }}
                  />
                ) : (
                  <div className="mt-1 bg-gray-50 rounded-xl border border-gray-200 p-4 max-h-[50vh] overflow-y-auto" style={{ fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "10pt", lineHeight: "1.6", whiteSpace: "pre-wrap" }}>
                    {letterConfirm.body.split("kohler.solokit.app").map((part, idx, arr) => (
                      <span key={idx}>{part}{idx < arr.length - 1 && <a href="https://kohler.solokit.app" target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">kohler.solokit.app</a>}</span>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="px-6 py-3 border-t border-gray-100" style={{ background: "rgba(44,15,56,0.04)" }}>
              <div className="flex items-center gap-3">
                <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: "#2c0f38" }}>Attachments</span>
                <a href="/KOHLER_WOOD_RESUME.pdf" target="_blank" rel="noopener noreferrer" className="px-2.5 py-1 text-[10px] font-medium rounded-full border hover:underline flex items-center gap-1" style={{ color: "#2c0f38", borderColor: "rgba(44,15,56,0.25)", background: "rgba(44,15,56,0.06)" }}>
                  📄 Resume PDF
                </a>
                <button className="px-2 py-1 text-[10px] rounded-full border border-dashed border-gray-300 text-gray-400 hover:text-gray-600 hover:border-gray-400 transition-colors flex items-center gap-1">
                  <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                  Add
                </button>
              </div>
            </div>
            <div className="px-6 py-4 border-t flex justify-end gap-3 shrink-0">
              <button onClick={() => setLetterConfirm(null)} className="px-5 py-2 text-sm font-semibold rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 transition-colors">Close</button>
              {letterConfirm.editing ? (
                <button onClick={async () => { setEditBody(letterConfirm.body); await saveLetter(); setLetterConfirm({ ...letterConfirm, editing: false }); }} disabled={saving} className="px-5 py-2 text-sm font-bold rounded-lg bg-green-700 text-white hover:bg-green-800 transition-colors">{saving ? "Saving..." : "Save"}</button>
              ) : (
                <>
                  <button onClick={() => setLetterConfirm({ ...letterConfirm, editing: true })} className="px-5 py-2 text-sm font-semibold rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 transition-colors">Edit</button>
                  <button
                    onClick={() => { setLetterConfirm(null); printAndLog(); }}
                    className="px-5 py-2 text-sm font-bold rounded-lg bg-green-700 text-white hover:bg-green-800 transition-colors flex items-center gap-2"
                    style={{ boxShadow: "0 2px 6px rgba(0,0,0,0.2)" }}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                    </svg>
                    Print
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Find New Leads Dialog ── */}
      {addLeadNiche && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm no-print" onClick={() => setAddLeadNiche(null)}>
          <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl max-w-lg w-full sm:mx-4 overflow-hidden max-h-[90vh] sm:max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            {/* Header with close X */}
            <div
              className={`px-5 py-4 ${NICHE_COLORS[addLeadNiche]?.headerBg ? `bg-gradient-to-r ${NICHE_COLORS[addLeadNiche].headerBg}` : ""} shrink-0 flex items-center justify-between`}
              style={!NICHE_COLORS[addLeadNiche]?.headerBg ? { background: "linear-gradient(135deg, #334155, #1e293b)" } : undefined}
            >
              <h3 className="text-white font-bold text-sm flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                Find Companies · {addLeadNiche}
              </h3>
              <button onClick={() => setAddLeadNiche(null)} className="text-white/60 hover:text-white transition-colors p-1 rounded-lg hover:bg-white/10">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            {/* Results list */}
            <div className="overflow-y-auto flex-1 px-2 py-2">
              {addLeadSearching && (
                <div className="flex items-center justify-center py-10 gap-2">
                  <div className="w-5 h-5 border-2 border-gray-200 border-t-sky-500 rounded-full animate-spin" />
                  <span className="text-sm text-gray-400">Finding companies...</span>
                </div>
              )}
              {addLeadResults.length === 0 && !addLeadSearching && (
                <div className="text-center py-8 px-4">
                  <p className="text-sm text-gray-400">No engineering companies found</p>
                  <p className="text-xs text-gray-300 mt-1">Try a specific company name below</p>
                </div>
              )}
              {addLeadResults.map((r) => (
                <div
                  key={r.place_id}
                  className="flex items-start gap-3 px-3 py-3 rounded-xl hover:bg-gray-50 transition-colors group"
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm text-gray-900">{r.name}</div>
                    <div className="text-xs text-gray-500 mt-0.5">{r.address}</div>
                  </div>
                  <button
                    onClick={() => addLeadFromResult(r)}
                    disabled={addLeadAdding === r.place_id}
                    className="shrink-0 px-3 py-1.5 text-xs font-bold rounded-lg bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 transition-all flex items-center gap-1.5 opacity-80 group-hover:opacity-100"
                  >
                    {addLeadAdding === r.place_id ? (
                      <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                    )}
                    Add
                  </button>
                </div>
              ))}
              {/* Compact search bar at bottom */}
              {!addLeadSearching && (
                <div className="px-3 py-3 border-t border-gray-100 mt-2">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={addLeadSearch}
                      onChange={(e) => setAddLeadSearch(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") searchPlaces(); }}
                      placeholder="Search for a specific company..."
                      className="flex-1 rounded-lg border border-gray-200 px-2.5 py-2 text-xs focus:ring-2 focus:ring-sky-500/20 focus:border-sky-400 focus:outline-none transition-all"
                    />
                    <button
                      onClick={searchPlaces}
                      disabled={addLeadSearching || !addLeadSearch.trim()}
                      className="px-3 py-2 text-xs font-bold rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 disabled:opacity-50 transition-colors shrink-0"
                    >
                      Search
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Print-only: full assembled letter ── */}
      {assembled && (
        <div
          className="hidden print:block"
          style={{
            padding: "0.75in 0.65in",
            fontFamily: "'Inter', 'Helvetica Neue', Arial, sans-serif",
            fontSize: "11pt",
            lineHeight: "1.5",
            whiteSpace: "pre-wrap",
            maxHeight: "9.5in",
            overflow: "hidden",
          }}
        >
          {assembled.body}
        </div>
      )}
      <style>{`
        @media print {
          @page { size: letter; margin: 0; }
          body { margin: 0; padding: 0; }
        }
      `}</style>
    </div>
  );
}
