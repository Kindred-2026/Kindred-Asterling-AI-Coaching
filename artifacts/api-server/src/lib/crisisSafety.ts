import {
  CRISIS_SUPPORT_CONFIG,
  SAFETY_EVENT_POLICY,
} from "../config/crisisSupport";
import { logger } from "./logger";

const CRISIS_PATTERNS = [
  /\bsuicid(e|al)\b/i,
  /\bkill(?:s|ed|ing)?\s*myself\b/i,
  /\bend(?:s|ed|ing)?\s*my\s*life\b/i,
  /\bwant\s*to\s*die\b/i,
  /\bself[- ]?harm(?:s|ed|ing)?\b/i,
  /\bself[- ]?injur(y|ies)\b/i,
];

// Common explicit denials should not interrupt an ordinary coaching turn.
// The UI also receives a false-positive action for less obvious contexts.
const EXPLICIT_DENIALS = [
  /\b(?:i am|i'm|im)\s+not\s+suicidal\b/i,
  /\b(?:i do not|i don't|dont)\s+want\s+to\s+die\b/i,
  /\b(?:i will not|i won't|wont)\s+(?:kill myself|self[- ]?harm)\b/i,
  /\bno\s+(?:suicidal thoughts|thoughts of self[- ]?harm)\b/i,
];

export function detectCrisis(text: string): boolean {
  const stripped = EXPLICIT_DENIALS.reduce(
    (t, pattern) => t.replace(new RegExp(pattern.source, "gi"), " "),
    text,
  );
  return CRISIS_PATTERNS.some((pattern) => pattern.test(stripped));
}

/** Emit only a non-identifying control event. Never add request/user fields. */
export function emitSafetySignalEvent(): void {
  logger.warn(
    {
      event: "safety_signal_detected",
      detectorVersion: CRISIS_SUPPORT_CONFIG.review.version,
      retentionClass: SAFETY_EVENT_POLICY.retentionClass,
      accessClass: SAFETY_EVENT_POLICY.accessClass,
    },
    "Safety interception activated",
  );
}

/**
 * Role of the fixed safety message stored after a user turn that tripped the
 * detector. It is written only by the server (the append contract accepts
 * user/assistant only), shown as Kindred's reply, and rendered by the chat UI
 * as the crisis-resources card.
 */
export const CRISIS_SUPPORT_ROLE = "crisis_support";

export function crisisSupportResponse() {
  return {
    type: "crisis_support",
    message: CRISIS_SUPPORT_CONFIG.response,
    disclaimer: CRISIS_SUPPORT_CONFIG.disclaimer,
    resources: CRISIS_SUPPORT_CONFIG.resources,
    falsePositive: {
      label: CRISIS_SUPPORT_CONFIG.falsePositiveLabel,
      instruction: CRISIS_SUPPORT_CONFIG.falsePositiveInstruction,
    },
    reviewedConfigVersion: CRISIS_SUPPORT_CONFIG.review.version,
  } as const;
}
