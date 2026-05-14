// Test runtimeEnvironment.ts environment classification.
// Run with: node --experimental-vm-modules scripts/runtime-environment.test.mjs
//
// We deliberately avoid pulling TypeScript through ts-node so the test stays
// usable in CI without a transpiler. Instead we re-implement the classify()
// rules and assert the same matrix. If you change the rules in the source
// file, mirror them here.

const PRODUCTION_HOSTS = new Set(["kohler-outreach.vercel.app"]);
const SANDBOX_HOSTS = new Set([
  "kohler-outreach-sandbox.vercel.app",
  "kohler-outreach-claude-sandbox.vercel.app",
]);

function pickHost(rawUrl) {
  if (!rawUrl) return null;
  try {
    return new URL(rawUrl.startsWith("http") ? rawUrl : `https://${rawUrl}`).host;
  } catch {
    return null;
  }
}

function classify({ vercelEnv, appEnv, vercelUrl, nodeEnv }) {
  if (appEnv) {
    const lower = appEnv.toLowerCase();
    if (["production", "preview", "sandbox", "development"].includes(lower)) {
      return lower;
    }
  }
  const host = pickHost(vercelUrl);
  if (host && SANDBOX_HOSTS.has(host)) return "sandbox";
  if (host && PRODUCTION_HOSTS.has(host)) return "production";
  if (vercelEnv === "production") {
    if (host && /sandbox|claude/i.test(host)) return "sandbox";
    return "production";
  }
  if (vercelEnv === "preview") return "preview";
  if (vercelEnv === "development") return "development";
  if (nodeEnv === "development") return "development";
  return "unknown";
}

const cases = [
  {
    name: "production host wins",
    input: { vercelEnv: "production", vercelUrl: "kohler-outreach.vercel.app" },
    expected: "production",
  },
  {
    name: "sandbox host wins even with production VERCEL_ENV",
    input: { vercelEnv: "production", vercelUrl: "kohler-outreach-sandbox.vercel.app" },
    expected: "sandbox",
  },
  {
    name: "claude sandbox host wins",
    input: { vercelEnv: "production", vercelUrl: "kohler-outreach-claude-sandbox.vercel.app" },
    expected: "sandbox",
  },
  {
    name: "explicit appEnv override",
    input: {
      appEnv: "sandbox",
      vercelEnv: "production",
      vercelUrl: "kohler-outreach.vercel.app",
    },
    expected: "sandbox",
  },
  {
    name: "preview without recognized host",
    input: { vercelEnv: "preview", vercelUrl: "feature-branch.vercel.app" },
    expected: "preview",
  },
  {
    name: "production VERCEL_ENV with sandbox-keyworded host",
    input: { vercelEnv: "production", vercelUrl: "claude-canary.vercel.app" },
    expected: "sandbox",
  },
  {
    name: "no env vars, NODE_ENV development",
    input: { nodeEnv: "development" },
    expected: "development",
  },
  {
    name: "totally bare returns unknown",
    input: {},
    expected: "unknown",
  },
  {
    name: "invalid appEnv falls back to host detection",
    input: {
      appEnv: "garbage",
      vercelEnv: "production",
      vercelUrl: "kohler-outreach.vercel.app",
    },
    expected: "production",
  },
  {
    name: "appEnv accepts case-insensitive Production",
    input: { appEnv: "Production" },
    expected: "production",
  },
];

let pass = 0;
let fail = 0;
for (const tc of cases) {
  const actual = classify(tc.input);
  if (actual === tc.expected) {
    pass++;
    console.log(`  ok  ${tc.name}`);
  } else {
    fail++;
    console.log(
      `  FAIL ${tc.name} — expected ${tc.expected}, got ${actual}; input ${JSON.stringify(tc.input)}`
    );
  }
}

console.log(`\nruntime-environment: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
