/**
 * parsePaymentTermsDays
 * Converts a payment terms text value (stored on customers) to integer days.
 * Defaults to 30 if the value is unrecognised — logs a warning.
 */
export function parsePaymentTermsDays(paymentTerms: string | null | undefined): number {
  switch ((paymentTerms ?? "").toLowerCase().trim()) {
    case "net_7":             return 7;
    case "net_14":            return 14;
    case "net_21":            return 21;
    case "net_30":            return 30;
    case "net_45":            return 45;
    case "net_60":            return 60;
    case "net_90":            return 90;
    case "cash_on_delivery":  return 0;
    case "immediate":         return 0;
    default:
      console.warn(`[paymentTerms] Unrecognised value "${paymentTerms}" — defaulting to 30 days`);
      return 30;
  }
}

/**
 * addDaysToDateStr
 * Takes a YYYY-MM-DD string, adds `days`, returns a YYYY-MM-DD string.
 */
export function addDaysToDateStr(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split("T")[0];
}

/**
 * dateDiffDays
 * Returns the number of whole days between two YYYY-MM-DD strings.
 * Positive = b is after a.
 */
export function dateDiffDays(a: string, b: string): number {
  const msPerDay = 86400000;
  return Math.round((new Date(b + "T00:00:00Z").getTime() - new Date(a + "T00:00:00Z").getTime()) / msPerDay);
}
