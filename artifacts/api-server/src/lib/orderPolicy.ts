import { db, ordersTable, customersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { addDaysToDateStr } from "./paymentTerms";

export type PolicyStatus = "allowed" | "warning" | "blocked";

export interface OrderPolicyResult {
  status: PolicyStatus;
  reasonCode: string;
  overdueAmount: number;
  overdueThreshold: number | null;
  gracePeriodDays: number;
  overdueInvoiceCount: number;
  canOverride: boolean;
  messageEn: string;
  messageTr: string;
}

export async function evaluateCustomerOrderPolicy(
  customer: typeof customersTable.$inferSelect
): Promise<OrderPolicyResult> {
  const mode = customer.paymentOrderRuleMode ?? "no_block";
  const graceDays = customer.gracePeriodDays ?? 0;
  const threshold = customer.overdueThresholdAmount != null ? parseFloat(customer.overdueThresholdAmount) : null;
  const canOverride = customer.allowAdminGmOverride ?? false;

  const base = { gracePeriodDays: graceDays, canOverride, overdueThreshold: threshold };

  if (mode === "no_block") {
    return { ...base, status: "allowed", reasonCode: "no_block", overdueAmount: 0, overdueInvoiceCount: 0, messageEn: "", messageTr: "" };
  }

  const orders = await db
    .select({
      totalAmount: ordersTable.totalAmount,
      invoiceDate: ordersTable.invoiceDate,
      dueDate: ordersTable.dueDate,
      paymentStatus: ordersTable.paymentStatus,
    })
    .from(ordersTable)
    .where(eq(ordersTable.customerId, customer.id));

  const today = new Date().toISOString().split("T")[0];
  let overdueAmount = 0;
  let overdueCount = 0;

  for (const order of orders) {
    if (order.paymentStatus === "paid") continue;
    if (!order.invoiceDate || !order.dueDate) continue;
    const effectiveDue = graceDays > 0 ? addDaysToDateStr(order.dueDate, graceDays) : order.dueDate;
    if (today <= effectiveDue) continue;
    overdueAmount += parseFloat(order.totalAmount);
    overdueCount++;
  }

  if (mode === "warning_only") {
    if (overdueCount === 0) {
      return { ...base, status: "allowed", reasonCode: "no_block", overdueAmount: 0, overdueInvoiceCount: 0, messageEn: "", messageTr: "" };
    }
    return {
      ...base,
      status: "warning",
      reasonCode: "overdue_warning",
      overdueAmount,
      overdueInvoiceCount: overdueCount,
      messageEn: "This customer has overdue payments. You may continue, but please review payment status.",
      messageTr: "Bu müşterinin vadesi geçmiş ödemeleri var. Devam edebilirsiniz, ancak ödeme durumunu kontrol edin.",
    };
  }

  if (mode === "block_any_overdue") {
    if (overdueCount === 0) {
      return { ...base, status: "allowed", reasonCode: "no_block", overdueAmount: 0, overdueInvoiceCount: 0, messageEn: "", messageTr: "" };
    }
    return {
      ...base,
      status: "blocked",
      reasonCode: "any_overdue_block",
      overdueAmount,
      overdueInvoiceCount: overdueCount,
      messageEn: "New order is blocked: this customer has overdue payments.",
      messageTr: "Yeni sipariş engellendi: bu müşterinin vadesi geçmiş ödemeleri var.",
    };
  }

  if (mode === "block_overdue_threshold") {
    const thr = threshold ?? 0;
    if (overdueCount === 0 || overdueAmount <= thr) {
      return { ...base, status: "allowed", reasonCode: "no_block", overdueAmount, overdueInvoiceCount: overdueCount, messageEn: "", messageTr: "" };
    }
    return {
      ...base,
      status: "blocked",
      reasonCode: "threshold_exceeded",
      overdueAmount,
      overdueInvoiceCount: overdueCount,
      messageEn: `New order is blocked: overdue amount (${overdueAmount.toFixed(2)}) exceeds the allowed threshold (${thr.toFixed(2)}).`,
      messageTr: `Yeni sipariş engellendi: vadesi geçmiş tutar (${overdueAmount.toFixed(2)}) izin verilen limiti (${thr.toFixed(2)}) aşıyor.`,
    };
  }

  return { ...base, status: "allowed", reasonCode: "no_block", overdueAmount: 0, overdueInvoiceCount: 0, messageEn: "", messageTr: "" };
}
