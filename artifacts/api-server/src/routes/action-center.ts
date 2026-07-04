import { Router, type IRouter } from "express";
import {
  db,
  ordersTable,
  deliveriesTable,
  accountingApprovalsTable,
  leadsTable,
  productsTable,
  customersTable,
  usersTable,
} from "@workspace/db";
import { inArray, ne } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

const PRIORITY_ORDER: Record<string, number> = { critical: 0, high: 1, normal: 2, low: 3 };

router.get("/action-center", requireAuth as any, async (req, res): Promise<void> => {
  const channelParam = (req.query.channel as string | undefined) ?? "all";
  const today = new Date().toISOString().split("T")[0];
  const nowMs = Date.now();

  function applyChannel<T extends { businessChannel?: string | null }>(arr: T[]): T[] {
    if (channelParam === "all") return arr;
    if (channelParam === "cosmetics") return arr.filter(x => x.businessChannel === "cosmetics");
    return arr.filter(x => x.businessChannel !== "cosmetics");
  }

  function ageDays(date: Date | string | null | undefined): number {
    if (!date) return 0;
    const d = typeof date === "string" ? new Date(date + "T00:00:00Z") : date;
    return Math.max(0, Math.floor((nowMs - d.getTime()) / 86_400_000));
  }

  function paymentPriority(days: number): string {
    if (days >= 30) return "critical";
    if (days >= 14) return "high";
    if (days >= 7) return "normal";
    return "low";
  }

  const [allOrders, allDeliveries, allApprovals, allLeads, allProducts, allUsers] = await Promise.all([
    db.select().from(ordersTable),
    db.select().from(deliveriesTable),
    db.select().from(accountingApprovalsTable),
    db.select().from(leadsTable),
    db.select().from(productsTable),
    db.select().from(usersTable),
  ]);

  const userMap: Record<number, string> = Object.fromEntries(allUsers.map(u => [u.id, u.fullName]));

  const customerIds = [
    ...new Set([
      ...allOrders.map(o => o.customerId),
      ...allDeliveries.map(d => d.customerId),
    ]),
  ];
  const allCustomers =
    customerIds.length > 0
      ? await db
          .select({ id: customersTable.id, companyName: customersTable.companyName })
          .from(customersTable)
          .where(inArray(customersTable.id, customerIds))
      : [];
  const customerMap: Record<number, string> = Object.fromEntries(
    allCustomers.map(c => [c.id, c.companyName]),
  );

  const deliveryMap: Record<number, (typeof allDeliveries)[0]> = Object.fromEntries(
    allDeliveries.map(d => [d.id, d]),
  );

  const items: any[] = [];

  // ── 1. Overdue Payments ─────────────────────────────────────────────────────
  for (const o of applyChannel(allOrders)) {
    if (o.status !== "approved") continue;
    if (o.paymentStatus === "paid") continue;
    if (!o.dueDate || o.dueDate >= today) continue;
    const days = ageDays(o.dueDate);
    items.push({
      id: `overdue_payment_${o.id}`,
      type: "overdue_payment",
      channel: o.businessChannel,
      priority: paymentPriority(days),
      title: o.orderNumber,
      reason: `Payment due ${o.dueDate}`,
      entityType: "order",
      entityId: o.id,
      entityRef: o.orderNumber,
      customerName: customerMap[o.customerId] ?? null,
      ownerName: null,
      dueDate: o.dueDate,
      ageDays: days,
      link: `/orders/${o.id}`,
      createdAt: o.createdAt.toISOString(),
    });
  }

  // ── 2. Pending Accounting Approvals ─────────────────────────────────────────
  const channelDeliveryIds = new Set(applyChannel(allDeliveries).map(d => d.id));
  for (const a of allApprovals) {
    if (a.status !== "pending") continue;
    if (!channelDeliveryIds.has(a.deliveryId)) continue;
    const delivery = deliveryMap[a.deliveryId];
    const days = ageDays(a.createdAt);
    const priority = days >= 3 ? "critical" : days >= 1 ? "high" : "normal";
    items.push({
      id: `pending_approval_${a.id}`,
      type: "pending_approval",
      channel: delivery?.businessChannel ?? channelParam,
      priority,
      title: delivery?.deliveryNumber ?? `Approval #${a.id}`,
      reason: `Awaiting accounting approval`,
      entityType: "approval",
      entityId: a.id,
      entityRef: delivery?.deliveryNumber ?? null,
      customerName: delivery ? (customerMap[delivery.customerId] ?? null) : null,
      ownerName: null,
      dueDate: null,
      ageDays: days,
      link: `/accounting`,
      createdAt: a.createdAt.toISOString(),
    });
  }

  // ── 3. Unresolved Driver Issues ─────────────────────────────────────────────
  for (const d of applyChannel(allDeliveries)) {
    if (!d.issueReportedAt || d.issueResolvedAt) continue;
    const days = ageDays(d.issueReportedAt);
    const priority = days >= 7 ? "critical" : days >= 2 ? "high" : "normal";
    items.push({
      id: `unresolved_issue_${d.id}`,
      type: "unresolved_issue",
      channel: d.businessChannel,
      priority,
      title: d.deliveryNumber,
      reason: d.deviationType ? d.deviationType.replace(/_/g, " ") : "Issue reported",
      entityType: "delivery",
      entityId: d.id,
      entityRef: d.deliveryNumber,
      customerName: customerMap[d.customerId] ?? null,
      ownerName: d.driverId ? (userMap[d.driverId] ?? null) : null,
      dueDate: null,
      ageDays: days,
      link: `/deliveries`,
      createdAt: d.issueReportedAt.toISOString(),
    });
  }

  // ── 4. Low Stock / Out of Stock ─────────────────────────────────────────────
  for (const p of applyChannel(allProducts)) {
    if (!p.active) continue;
    if (!["low_stock", "out_of_stock"].includes(p.stockStatus ?? "")) continue;
    const isOut = p.stockStatus === "out_of_stock";
    items.push({
      id: `low_stock_${p.id}`,
      type: "low_stock",
      channel: p.businessChannel,
      priority: isOut ? "critical" : "normal",
      title: p.productName,
      reason: `SKU: ${p.sku}`,
      entityType: "product",
      entityId: p.id,
      entityRef: p.sku,
      customerName: null,
      ownerName: null,
      dueDate: null,
      ageDays: null,
      link: `/inventory`,
      createdAt: p.createdAt.toISOString(),
    });
  }

  // ── 5. High-Potential Leads — Overdue Follow-up ─────────────────────────────
  for (const l of applyChannel(allLeads)) {
    if (l.importance !== "high_potential") continue;
    if (l.followUpCompletedAt) continue;
    if (!l.followUpDueAt || l.followUpDueAt.getTime() > nowMs) continue;
    const days = ageDays(l.followUpDueAt);
    const priority = days >= 3 ? "critical" : days >= 1 ? "high" : "normal";
    items.push({
      id: `high_potential_${l.id}`,
      type: "high_potential_follow_up",
      channel: l.businessChannel,
      priority,
      title: l.companyName,
      reason: l.contactPerson ?? "Follow-up overdue",
      entityType: "lead",
      entityId: l.id,
      entityRef: null,
      customerName: l.companyName,
      ownerName: l.createdBy ? (userMap[l.createdBy] ?? null) : null,
      dueDate: l.followUpDueAt.toISOString().split("T")[0],
      ageDays: days,
      link: `/leads`,
      createdAt: l.createdAt.toISOString(),
    });
  }

  // ── 6. Delayed Deliveries ───────────────────────────────────────────────────
  const unresolvedIssueDeliveryIds = new Set(
    allDeliveries
      .filter(d => d.issueReportedAt && !d.issueResolvedAt)
      .map(d => d.id),
  );
  for (const d of applyChannel(allDeliveries)) {
    if (!d.scheduledDate || d.scheduledDate >= today) continue;
    if (["approved", "cancelled"].includes(d.status)) continue;
    if (unresolvedIssueDeliveryIds.has(d.id)) continue; // already covered in unresolved_issue
    const days = ageDays(d.scheduledDate);
    items.push({
      id: `delayed_delivery_${d.id}`,
      type: "delayed_delivery",
      channel: d.businessChannel,
      priority: days >= 3 ? "critical" : "high",
      title: d.deliveryNumber,
      reason: `Scheduled ${d.scheduledDate} — status: ${d.status.replace(/_/g, " ")}`,
      entityType: "delivery",
      entityId: d.id,
      entityRef: d.deliveryNumber,
      customerName: customerMap[d.customerId] ?? null,
      ownerName: d.driverId ? (userMap[d.driverId] ?? null) : null,
      dueDate: d.scheduledDate,
      ageDays: days,
      link: `/deliveries`,
      createdAt: d.createdAt.toISOString(),
    });
  }

  // ── 7. Stuck Orders (incomplete / blocked ≥ 1 day) ─────────────────────────
  for (const o of applyChannel(allOrders)) {
    if (!["incomplete", "blocked"].includes(o.status)) continue;
    const days = ageDays(o.updatedAt);
    if (days < 1) continue;
    const priority =
      o.status === "blocked"
        ? days >= 3 ? "critical" : "high"
        : days >= 5 ? "high" : "normal";
    items.push({
      id: `stuck_order_${o.id}`,
      type: "stuck_order",
      channel: o.businessChannel,
      priority,
      title: o.orderNumber,
      reason: `In "${o.status}" for ${days} day(s)`,
      entityType: "order",
      entityId: o.id,
      entityRef: o.orderNumber,
      customerName: customerMap[o.customerId] ?? null,
      ownerName: o.createdBy ? (userMap[o.createdBy] ?? null) : null,
      dueDate: null,
      ageDays: days,
      link: `/orders/${o.id}`,
      createdAt: o.createdAt.toISOString(),
    });
  }

  // ── 8. Payment Rule Blocked Customers ─────────────────────────────────────
  try {
    // Build overdue amount per customer from already-loaded orders
    const overdueByCustomer = new Map<number, number>();
    for (const o of applyChannel(allOrders)) {
      const o2 = o as any;
      if (o2.paymentStatus === "paid") continue;
      if (!o2.invoiceDate || !o2.dueDate) continue;
      if (o2.dueDate >= today) continue;
      overdueByCustomer.set(o.customerId, (overdueByCustomer.get(o.customerId) ?? 0) + parseFloat(o.totalAmount));
    }

    if (overdueByCustomer.size > 0) {
      const overdueCustomerIds = [...overdueByCustomer.keys()];
      const customersWithRules = await db
        .select({
          id: customersTable.id,
          companyName: customersTable.companyName,
          businessChannel: customersTable.businessChannel,
          paymentOrderRuleMode: customersTable.paymentOrderRuleMode,
          overdueThresholdAmount: customersTable.overdueThresholdAmount,
        })
        .from(customersTable)
        .where(inArray(customersTable.id, overdueCustomerIds));

      for (const customer of customersWithRules) {
        const mode = customer.paymentOrderRuleMode;
        if (!mode || mode === "no_block" || mode === "warning_only") continue;
        const overdueAmt = overdueByCustomer.get(customer.id) ?? 0;
        const isBlocked =
          mode === "block_any_overdue" ||
          (mode === "block_overdue_threshold" &&
            customer.overdueThresholdAmount != null &&
            overdueAmt > parseFloat(customer.overdueThresholdAmount));
        if (!isBlocked) continue;
        const priority = overdueAmt > 5000 ? "critical" : "high";
        items.push({
          id: `payment_rule_blocked_${customer.id}`,
          type: "payment_rule_blocked",
          channel: customer.businessChannel,
          priority,
          title: customer.companyName,
          reason: `Orders blocked — overdue: ${overdueAmt.toFixed(2)}`,
          entityType: "customer",
          entityId: customer.id,
          entityRef: null,
          customerName: customer.companyName,
          ownerName: null,
          dueDate: null,
          ageDays: null,
          link: `/customers/${customer.id}`,
          createdAt: new Date().toISOString(),
        });
      }
    }
  } catch {
    // Payment rule columns may not exist if migration hasn't run yet
  }

  // Sort: critical → high → normal → low, then by ageDays desc
  items.sort((a, b) => {
    const pa = PRIORITY_ORDER[a.priority] ?? 4;
    const pb = PRIORITY_ORDER[b.priority] ?? 4;
    if (pa !== pb) return pa - pb;
    return (b.ageDays ?? 0) - (a.ageDays ?? 0);
  });

  res.json(items);
});

export default router;
