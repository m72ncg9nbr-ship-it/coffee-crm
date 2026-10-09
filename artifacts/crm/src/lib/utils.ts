import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export function formatDateTime(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function formatCurrency(amount: number | null | undefined): string {
  if (amount == null) return "—";
  return new Intl.NumberFormat("en-EU", { style: "currency", currency: "EUR" }).format(amount);
}

const INTL_LOCALE: Record<string, string> = { TRY: "tr-TR", EUR: "en-EU", USD: "en-US" };
const INTL_CURRENCY: Record<string, string> = { TRY: "TRY", EUR: "EUR", USD: "USD" };

export function formatCurrencyWithCode(
  amount: number | null | undefined,
  currencyCode: string,
): string {
  if (amount == null) return "—";
  const locale   = INTL_LOCALE[currencyCode]   ?? "tr-TR";
  const currency = INTL_CURRENCY[currencyCode] ?? currencyCode;
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(amount);
}
