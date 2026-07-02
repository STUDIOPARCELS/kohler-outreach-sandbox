const HUMAN_APPROVED_STATUSES = new Set(["human_approved"]);

// Statuses a letter actually has by the time a follow-up email is due:
// "sent" (letter printed/mailed via batch-status), "emailed" (original letter
// emailed, or follow-up #1 recorded), "followup2_sent" (follow-up #2 recorded),
// plus the manual "human_approved" queue status. The explicit Send click in
// /followups is the human approval for follow-up sends — requiring
// "human_approved" here wedged every follow-up behind a manual status flip.
const FOLLOWUP_SENDABLE_STATUSES = new Set([
  "sent",
  "emailed",
  "human_approved",
  "followup2_sent",
]);

export function isLiveSendEnabled(): boolean {
  return process.env.ENABLE_LIVE_SEND === "true";
}

export function isHumanApprovedDraftStatus(status?: string | null): boolean {
  return HUMAN_APPROVED_STATUSES.has((status || "").trim().toLowerCase());
}

export function isFollowupSendableStatus(status?: string | null): boolean {
  return FOLLOWUP_SENDABLE_STATUSES.has((status || "").trim().toLowerCase());
}

export function liveSendDisabledMessage(): string {
  return "Live Gmail send is disabled. Set ENABLE_LIVE_SEND=true and mark the draft human_approved before sending.";
}
