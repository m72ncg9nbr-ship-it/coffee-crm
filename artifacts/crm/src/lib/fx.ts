import type { FxRatesResponse } from "@workspace/api-client-react";

export const SUPPORTED_CURRENCIES = ["TRY", "EUR", "USD"] as const;
export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number];

export const CURRENCY_SYMBOLS: Record<SupportedCurrency, string> = {
  TRY: "₺",
  EUR: "€",
  USD: "$",
};

export function currencySymbol(code: string): string {
  return CURRENCY_SYMBOLS[code as SupportedCurrency] ?? code;
}

/**
 * Convert an amount in `fromCurrency` to TRY using the cached TCMB rates.
 * Returns null if no rate is available (unavailable or currency is already TRY).
 * When fromCurrency is TRY the input is returned as-is.
 */
export function convertToTRY(
  amount: number,
  fromCurrency: string,
  rates: FxRatesResponse | undefined,
): number | null {
  if (!fromCurrency || fromCurrency === "TRY") return amount;
  if (!rates || rates.unavailable || rates.rates.length === 0) return null;

  const entry = rates.rates.find(r => r.pair === `${fromCurrency}/TRY`);
  if (!entry) return null;

  return amount * entry.rateBuying;
}

/**
 * Format an amount with its currency symbol/code.
 * Used for price display in product dialogs.
 */
export function formatWithCurrency(amount: number, currencyCode: string): string {
  const sym = currencySymbol(currencyCode);
  return `${sym}${amount.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
