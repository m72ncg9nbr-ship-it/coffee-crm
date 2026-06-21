import { Router, type IRouter } from "express";
import { db, customersTable, ordersTable, deliveriesTable, accountingApprovalsTable, usersTable, leadsTable } from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { sql } from "drizzle-orm";

const router: IRouter = Router();

router.get("/dashboard/summary", requireAuth as any, async (req, res): Promise<void> => {
  const channel = (req.query.channel as string | undefined) ?? "all";

  function applyChannel<T extends { businessChannel: string | null }>(arr: T[]): T[] {
    if (channel === "all") return arr;
    if (channel === "cosmetics") return arr.filter(x => x.businessChannel === "cosmetics");
    return arr.filter(x => x.businessChannel !== "cosmetics");
  }

  const today = new Date().toISOString().split("T")[0];

  const [allCustomersRaw, allOrdersRaw, allDeliveriesRaw, allApprovalsRaw] = await Promise.all([
    db.select().from(customersTable).where(eq(customersTable.active, true)),
    db.select().from(ordersTable),
    db.select().from(deliveriesTable),
    db.select().from(accountingApprovalsTable),
  ]);

  const customers = applyChannel(allCustomersRaw);
  const orders = applyChannel(allOrdersRaw);
  const deliveries = applyChannel(allDeliveriesRaw);

  const channelDeliveryIds = new Set(deliveries.map(d => d.id));
  const approvals = allApprovalsRaw.filter(a => channelDeliveryIds.has(a.deliveryId));

  const priorityDistribution = { A: 0, B: 0, C: 0 };
  customers.forEach(c => {
    const p = c.priorityClass as "A" | "B" | "C";
    if (p in priorityDistribution) priorityDistribution[p]++;
  });

  const openOrders = orders.filter(o =>
    ["new", "planned", "out_for_delivery", "awaiting_accounting_approval"].includes(o.status)
  );
  const incompleteOrders = orders.filter(o => ["incomplete", "blocked"].includes(o.status));
  const plannedDeliveries = deliveries.filter(d => ["assigned", "unassigned"].includes(d.status));
  const outForDelivery = deliveries.filter(d => ["arrived", "awaiting_accounting_approval"].includes(d.status));
  const delayedDeliveries = deliveries.filter(d =>
    ["assigned", "unassigned"].includes(d.status) && d.scheduledDate && d.scheduledDate < today
  );
  const awaitingApproval = approvals.filter(a => a.status === "pending");
  const approvedToday = approvals.filter(a =>
    a.status === "approved" && a.updatedAt >= new Date(today)
  );
  const readyForInvoicing = orders.filter(o =>
    o.status === "approved" && o.invoiceTriggeredAt != null
  );
  const unresolvedDeviations = deliveries.filter(d =>
    d.deviationType !== null && d.status !== "approved"
  );

  res.json({
    totalCustomers: customers.length,
    aCustomers: priorityDistribution.A,
    openOrders: openOrders.length,
    incompleteOrders: incompleteOrders.length,
    plannedDeliveries: plannedDeliveries.length,
    outForDelivery: outForDelivery.length,
    delayedDeliveries: delayedDeliveries.length,
    awaitingAccountingApproval: awaitingApproval.length,
    approvedToday: approvedToday.length,
    readyForInvoicing: readyForInvoicing.length,
    unresolvedDeviations: unresolvedDeviations.length,
    priorityDistribution,
  });
});

router.get("/dashboard/today-priorities", requireAuth as any, async (req, res): Promise<void> => {
  const today = new Date().toISOString().split("T")[0];
  const channel = (req.query.channel as string | undefined) ?? "all";

  function applyChannel<T extends { businessChannel: string | null }>(arr: T[]): T[] {
    if (channel === "all") return arr;
    if (channel === "cosmetics") return arr.filter(x => x.businessChannel === "cosmetics");
    return arr.filter(x => x.businessChannel !== "cosmetics");
  }

  const [allCustomers, allOrdersRaw, allDeliveriesRaw, allApprovals] = await Promise.all([
    db.select().from(customersTable),
    db.select().from(ordersTable),
    db.select().from(deliveriesTable),
    db.select().from(accountingApprovalsTable).where(eq(accountingApprovalsTable.status, "pending")),
  ]);

  const allOrders = applyChannel(allOrdersRaw);
  const allDeliveries = applyChannel(allDeliveriesRaw);

  const channelDeliveryIds = new Set(allDeliveries.map(d => d.id));
  const channelApprovals = allApprovals.filter(a => channelDeliveryIds.has(a.deliveryId));

  const customerMap = Object.fromEntries(allCustomers.map(c => [c.id, c]));
  const orderMap = Object.fromEntries(allOrders.map(o => [o.id, o]));
  const fullOrderMap = Object.fromEntries(allOrdersRaw.map(o => [o.id, o]));

  // A customers awaiting delivery
  const aCustomerDeliveries = allDeliveries
    .filter(d => ["unassigned", "assigned", "arrived"].includes(d.status))
    .filter(d => customerMap[d.customerId]?.priorityClass === "A")
    .map(d => ({
      kind: "a_customer_delivery" as const,
      deliveryId: d.id,
      deliveryNumber: d.deliveryNumber,
      orderId: d.orderId,
      orderNumber: orderMap[d.orderId]?.orderNumber ?? null,
      customerName: customerMap[d.customerId]?.companyName ?? "Unknown",
      scheduledDate: d.scheduledDate,
      status: d.status,
    }));

  // Urgent / critical orders not yet approved
  const urgentOrders = allOrders
    .filter(o => ["new", "incomplete", "planned", "out_for_delivery", "awaiting_accounting_approval"].includes(o.status))
    .filter(o => ["high", "critical"].includes(o.urgency ?? ""))
    .map(o => ({
      kind: "urgent_order" as const,
      orderId: o.id,
      orderNumber: o.orderNumber,
      customerName: customerMap[o.customerId]?.companyName ?? "Unknown",
      urgency: o.urgency,
      status: o.status,
    }));

  // Delayed: scheduledDate < today and not approved
  const delayedDeliveries = allDeliveries
    .filter(d => d.scheduledDate && d.scheduledDate < today && d.status !== "approved")
    .map(d => ({
      kind: "delayed_delivery" as const,
      deliveryId: d.id,
      deliveryNumber: d.deliveryNumber,
      customerName: customerMap[d.customerId]?.companyName ?? "Unknown",
      scheduledDate: d.scheduledDate,
      status: d.status,
    }));

  // Unassigned deliveries
  const unassignedDeliveries = allDeliveries
    .filter(d => d.status === "unassigned")
    .map(d => ({
      kind: "unassigned_delivery" as const,
      deliveryId: d.id,
      deliveryNumber: d.deliveryNumber,
      customerName: customerMap[d.customerId]?.companyName ?? "Unknown",
      customerPriority: customerMap[d.customerId]?.priorityClass ?? "C",
      scheduledDate: d.scheduledDate,
    }));

  // Awaiting accounting approval
  const awaitingApproval = channelApprovals.map(a => {
    const delivery = allDeliveries.find(d => d.id === a.deliveryId);
    return {
      kind: "awaiting_approval" as const,
      approvalId: a.id,
      deliveryId: a.deliveryId,
      orderId: a.orderId,
      deliveryNumber: delivery?.deliveryNumber ?? null,
      orderNumber: a.orderId ? (fullOrderMap[a.orderId]?.orderNumber ?? null) : null,
      customerName: delivery ? (customerMap[delivery.customerId]?.companyName ?? "Unknown") : "Unknown",
    };
  });

  // Unresolved deviations
  const unresolvedDeviations = allDeliveries
    .filter(d => d.deviationType !== null && d.status !== "approved")
    .map(d => ({
      kind: "deviation" as const,
      deliveryId: d.id,
      deliveryNumber: d.deliveryNumber,
      customerName: customerMap[d.customerId]?.companyName ?? "Unknown",
      deviationType: d.deviationType,
      deviationNote: d.deviationNote,
    }));

  // Lead follow-ups due (6.9)
  const allLeadsRaw = await db.select().from(leadsTable);
  const allLeads = applyChannel(allLeadsRaw);
  const nowMs = Date.now();
  const overdueLeadFollowUps = allLeads
    .filter(l => !l.followUpCompletedAt && l.followUpDueAt && l.followUpDueAt.getTime() <= nowMs)
    .map(l => ({
      kind: "lead_follow_up" as const,
      leadId: l.id,
      companyName: l.companyName,
      contactPerson: l.contactPerson,
      qualificationResult: l.qualificationResult,
      followUpDueAt: l.followUpDueAt!.toISOString(),
    }));

  res.json({
    aCustomerDeliveries,
    urgentOrders,
    delayedDeliveries,
    unassignedDeliveries,
    awaitingApproval,
    unresolvedDeviations,
    overdueLeadFollowUps,
  });
});

router.get("/dashboard/recent-deliveries", requireAuth as any, async (req, res): Promise<void> => {
  const { desc: descFn } = await import("drizzle-orm");
  const deliveries = await db.select().from(deliveriesTable)
    .orderBy(descFn(deliveriesTable.updatedAt))
    .limit(10);

  if (deliveries.length === 0) {
    res.json([]);
    return;
  }

  const customerIds = [...new Set(deliveries.map(d => d.customerId))];
  const driverIds = [...new Set(deliveries.filter(d => d.driverId).map(d => d.driverId!))];
  const { usersTable } = await import("@workspace/db");

  const customers = await db.select().from(customersTable).where(inArray(customersTable.id, customerIds));
  const drivers = driverIds.length > 0
    ? await db.select().from(usersTable).where(inArray(usersTable.id, driverIds))
    : [];

  const customerMap = Object.fromEntries(customers.map(c => [c.id, { name: c.companyName, priority: c.priorityClass }]));
  const driverMap = Object.fromEntries(drivers.map(u => [u.id, u.fullName]));

  res.json(deliveries.map(d => ({
    ...d,
    customerName: customerMap[d.customerId]?.name ?? "Unknown",
    customerPriority: customerMap[d.customerId]?.priority ?? "C",
    driverName: d.driverId ? (driverMap[d.driverId] ?? null) : null,
    invoiceTriggeredAt: d.invoiceTriggeredAt?.toISOString() ?? null,
    createdAt: d.createdAt.toISOString(),
    updatedAt: d.updatedAt.toISOString(),
  })));
});

router.get("/dashboard/deviations", requireAuth as any, async (req, res): Promise<void> => {
  const deliveries = await db.select().from(deliveriesTable).where(
    sql`deviation_type IS NOT NULL`
  );

  if (deliveries.length === 0) {
    res.json([]);
    return;
  }

  const customerIds = [...new Set(deliveries.map(d => d.customerId))];
  const driverIds = [...new Set(deliveries.filter(d => d.driverId).map(d => d.driverId!))];
  const { usersTable } = await import("@workspace/db");

  const customers = await db.select().from(customersTable).where(inArray(customersTable.id, customerIds));
  const drivers = driverIds.length > 0
    ? await db.select().from(usersTable).where(inArray(usersTable.id, driverIds))
    : [];

  const customerMap = Object.fromEntries(customers.map(c => [c.id, { name: c.companyName, priority: c.priorityClass }]));
  const driverMap = Object.fromEntries(drivers.map(u => [u.id, u.fullName]));

  res.json(deliveries.map(d => ({
    ...d,
    customerName: customerMap[d.customerId]?.name ?? "Unknown",
    customerPriority: customerMap[d.customerId]?.priority ?? "C",
    driverName: d.driverId ? (driverMap[d.driverId] ?? null) : null,
    invoiceTriggeredAt: d.invoiceTriggeredAt?.toISOString() ?? null,
    createdAt: d.createdAt.toISOString(),
    updatedAt: d.updatedAt.toISOString(),
  })));
});

export default router;
