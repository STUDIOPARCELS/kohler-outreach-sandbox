const HUMAN_APPROVED_STATUSES = new Set(["human_approved"]);

export function isLiveSendEnabled(): boolean {
  return process.env.ENABLE_LIVE_SEND === "true";
}

export function isHumanApprovedDraftStatus(status?: string | null): boolean {
  return HUMAN_APPROVED_STATUSES.has((status || "").trim().toLowerCase());
}

export function liveSendDisabledMessage(): string {
  return "Live Gmail send is disabled. Set ENABLE_LIVE_SEND=true and mark the draft human_approved before sending.";
}
