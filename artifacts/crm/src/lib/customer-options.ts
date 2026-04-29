export const SEGMENT_OPTIONS = [
  "cafe",
  "cafe_chain",
  "bar",
  "restaurant",
  "hotel",
  "bakery",
  "catering",
  "kiosk",
  "coworking",
  "corporate",
  "education",
] as const;

export const PAYMENT_TERMS_OPTIONS = [
  "net_14",
  "net_21",
  "net_30",
  "net_45",
  "net_60",
  "cash_on_delivery",
] as const;

export const CHANNEL_OPTIONS = ["horeca", "office", "retail"] as const;

export type PriorityClass = "A" | "B" | "C";

export function inferSegment(businessType: string | null | undefined): string {
  const lower = (businessType ?? "").trim().toLowerCase();
  if ((SEGMENT_OPTIONS as readonly string[]).includes(lower)) return lower;
  return "cafe";
}

export function normalisePaymentTerms(requested: string | null | undefined): string {
  const lower = (requested ?? "").trim().toLowerCase();
  if ((PAYMENT_TERMS_OPTIONS as readonly string[]).includes(lower)) return lower;
  return "net_30";
}

export function normaliseChannel(channel: string | null | undefined): string {
  const lower = (channel ?? "").trim().toLowerCase();
  if ((CHANNEL_OPTIONS as readonly string[]).includes(lower)) return lower;
  return "horeca";
}
