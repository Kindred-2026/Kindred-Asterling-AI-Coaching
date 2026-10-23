// User-facing description for a failed save, keyed on the ApiError status.
export function failureDescription(err: unknown): string {
  const status =
    typeof err === "object" && err !== null && "status" in err
      ? Number((err as { status: unknown }).status)
      : NaN;
  if (status === 401 || status === 403) {
    return "Your session may have expired or your plan doesn't allow this. Sign in again and retry.";
  }
  if (status === 400) {
    return "Please check the details you entered and try again.";
  }
  return Number.isFinite(status)
    ? `Something went wrong (error ${status}). Please try again.`
    : "Something went wrong. Check your connection and try again.";
}
