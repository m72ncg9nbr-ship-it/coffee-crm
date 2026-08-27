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

const PRODUCT_CATEGORY_DICT_KEY: Record<string, DictKey> = {
  "Ampoule":         "catAmpoule",
  "Body Care":       "catBodyCare",
  "Cleanser":        "catCleanser",
  "Color Cosmetics": "catColorCosmetics",
  "Skin Care":       "catSkinCare",
  "Hair Care":       "catHairCare",
  "Foot Care":       "catFootCare",
  "Serum":           "catSerum",
  "Tonic":           "catTonic",
  "Cream":           "catCream",
  "Mask":            "catMask",
};

export function productCategoryDisplayLabel(category: string, lang: Lang): string {
  const key = PRODUCT_CATEGORY_DICT_KEY[category ?? ""];
  if (!key) return (category ?? "").replace(/_/g, " ");
  return t(key, lang);
}

const ACTIVITY_TYPE_DICT_KEY: Record<string, DictKey> = {
  order_created:           "actOrderCreated",
  order_updated:           "actOrderUpdated",
  delivery_created:        "actDeliveryCreated",
  delivery_assigned:       "actDeliveryAssigned",
  driver_arrived:          "actDriverArrived",
  documentation_uploaded:  "actDocumentationUploaded",
  accounting_approved:     "actAccountingApproved",
  accounting_rejected:     "actAccountingRejected",
  invoice_triggered:       "actInvoiceTriggered",
  customer_created:        "actCustomerCreated",
  lead_created:            "actLeadCreated",
};

export function activityTypeDisplayLabel(actionType: string, lang: Lang): string {
  const key = ACTIVITY_TYPE_DICT_KEY[(actionType ?? "").toLowerCase()];
  if (!key) return (actionType ?? "").replace(/_/g, " ");
  return t(key, lang);
}

export function activityMessageDisplayLabel(description: string, lang: Lang): string {
  if (lang === "en" || !description) return description ?? "";
  const patterns: Array<[RegExp, (...g: string[]) => string]> = [
    [/^Delivery (\S+) approved by accounting$/, (n) => `${n} numaralı teslimat muhasebe tarafından onaylandı`],
    [/^Delivery (\S+) rejected by accounting$/, (n) => `${n} numaralı teslimat muhasebe tarafından reddedildi`],
    [/^Delivery (\S+) assigned to (.+)$/, (n, d) => `${n} numaralı teslimat ${d} adlı sürücüye atandı`],
    [/^Delivery (\S+) created for order (\S+)$/, (del, ord) => `${ord} siparişi için ${del} numaralı teslimat oluşturuldu`],
    [/^Driver arrived for delivery (\S+)$/, (n) => `${n} numaralı teslimat için sürücü ulaştı`],
    [/^Documentation uploaded for delivery (\S+)$/, (n) => `${n} numaralı teslimat için belge yüklendi`],
    [/^Invoice triggered for order (\S+)$/, (n) => `${n} numaralı sipariş için fatura tetiklendi`],
    [/^Order (\S+) created$/, (n) => `${n} numaralı sipariş oluşturuldu`],
    [/^Order (\S+) updated$/, (n) => `${n} numaralı sipariş güncellendi`],
    [/^Customer (.+) created$/, (name) => `${name} müşterisi oluşturuldu`],
    [/^Lead (.+) created$/, (name) => `${name} potansiyeli oluşturuldu`],
  ];
  for (const [pattern, render] of patterns) {
    const m = description.match(pattern);
    if (m) return render(...m.slice(1));
  }
  return description;
}

const DEVIATION_TYPE_DICT_KEY: Record<string, DictKey> = {
  qty_short:       "devQtyShort",
  qty_excess:      "devQtyExcess",
  wrong_product:   "devWrongProduct",
  damaged:         "devDamaged",
  late_delivery:   "devLateDelivery",
  customer_return: "devCustomerReturn",
  price_mismatch:  "devPriceMismatch",
  other:           "devOther",
};

export function deviationTypeDisplayLabel(devType: string, lang: Lang): string {
  const key = DEVIATION_TYPE_DICT_KEY[(devType ?? "").toLowerCase()];
  if (!key) return (devType ?? "").replace(/_/g, " ");
  return t(key, lang);
}
