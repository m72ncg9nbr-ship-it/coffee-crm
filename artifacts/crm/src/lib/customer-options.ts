import { t, type DictKey, type Lang } from "@/lib/i18n";

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

const SEGMENT_DICT_KEY: Record<string, DictKey> = {
  cafe: "segmentCafe",
  cafe_chain: "segmentCafeChain",
  bar: "segmentBar",
  restaurant: "segmentRestaurant",
  hotel: "segmentHotel",
  bakery: "segmentBakery",
  catering: "segmentCatering",
  kiosk: "segmentKiosk",
  coworking: "segmentCoworking",
  corporate: "segmentCorporate",
  education: "segmentEducation",
};

export function segmentDisplayLabel(seg: string, lang: Lang): string {
  const key = SEGMENT_DICT_KEY[seg.toLowerCase()];
  if (!key) return seg.replace(/_/g, " ");
  return t(key, lang);
}

const CHANNEL_DICT_KEY: Record<string, DictKey> = {
  horeca: "channelHoreca",
  office: "channelOffice",
  retail: "channelRetail",
  coffee: "coffee",
  cosmetics: "cosmetics",
};

export function channelDisplayLabel(ch: string, lang: Lang): string {
  const key = CHANNEL_DICT_KEY[(ch ?? "").toLowerCase()];
  if (!key) return ch;
  return t(key, lang);
}

const PAYMENT_TERMS_DICT_KEY: Record<string, DictKey> = {
  net_14: "termsNet14",
  net_21: "termsNet21",
  net_30: "termsNet30",
  net_45: "termsNet45",
  net_60: "termsNet60",
  cash_on_delivery: "termsCashOnDelivery",
};

export function paymentTermsDisplayLabel(terms: string, lang: Lang): string {
  const key = PAYMENT_TERMS_DICT_KEY[(terms ?? "").toLowerCase()];
  if (!key) return terms.replace(/_/g, " ");
  return t(key, lang);
}
