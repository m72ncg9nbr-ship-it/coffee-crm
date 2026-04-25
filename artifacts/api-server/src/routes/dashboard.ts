import { Router, type IRouter } from "express";
import { db, customersTable, ordersTable, deliveriesTable, accountingApprovalsTable, usersTable } from "@workspace/db";
import { eq, and, gte, inArray, isNotNull } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { sql } from "drizzle-orm";

const router: IRouter = Router();

router.get("/dashboard/summary", requireAuth as any, async (req, res): Promise<void> => {
  const [totalCustomersResult] = await db.select({ count: sql<number>`count(*)` }).from(customersTable).where(eq(customersTable.active, true));
  const totalCustomers = Number(totalCustomersResult?.count ?? 0);

  const openOrders = await db.select().from(ordersTable).where(
    inArray(ordersTable.status, ["new", "planned", "out_for_delivery", "awaiting_accounting_approval"])
  );

  const plannedDeliveries = await db.select().from(deliveriesTable).where(
    inArray(deliveriesTable.status, ["assigned", "unassigned"])
  );

  const outForDelivery = await db.select().from(deliveriesTable).where(
    inArray(deliveriesTable.status, ["arrived", "awaiting_accounting_approval"])
  );

  const today = new Date().toISOString().split("T")[0];

  const allDeliveries = await db.select().from(deliveriesTable);
  const delayedDeliveries = allDeliveries.filter(d =>
    ["assigned", "unassigned"].includes(d.status) &&
    d.scheduledDate &&
    d.scheduledDate < today
  );

  const awaitingApproval = await db.select().from(accountingApprovalsTable).where(
    eq(accountingApprovalsTable.status, "pending")
  );

  const approvedToday = await db.select().from(accountingApprovalsTable).where(
    and(
      eq(accountingApprovalsTable.status, "approved"),
      gte(accountingApprovalsTable.updatedAt, new Date(today))
    )
  );

  const allCustomers = await db.select({ priority: customersTable.priorityClass }).from(customersTable).where(eq(customersTable.active, true));
  const priorityDistribution = { A: 0, B: 0, C: 0 };
  allCustomers.forEach(c => {
    const p = c.priority as "A" | "B" | "C";
    if (p in priorityDistribution) priorityDistribution[p]++;
  });

  // Spec additions
  const incompleteOrders = await db.select().from(ordersTable).where(
    inArray(ordersTable.status, ["incomplete", "blocked"])
  );

  const readyForInvoicing = await db.select().from(ordersTable).where(
    and(eq(ordersTable.status, "approved"), isNotNull(ordersTable.invoiceTriggeredAt))
  );

  const unresolvedDeviations = allDeliveries.filter(d =>
    d.deviationType !== null && d.status !== "approved"
  );

  res.json({
    totalCustomers,
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

router.get("/dashboard/today-priorities", requireAuth as any, async (_req, res): Promise<void> => {
  const today = new Date().toISOString().split("T")[0];

  const [allCustomers, allOrders, allDeliveries, allApprovals] = await Promise.all([
    db.select().from(customersTable),
    db.select().from(ordersTable),
    db.select().from(deliveriesTable),
    db.select().from(accountingApprovalsTable).where(eq(accountingApprovalsTable.status, "pending")),
  ]);

  const customerMap = Object.fromEntries(allCustomers.map(c => [c.id, c]));
  const orderMap = Object.fromEntries(allOrders.map(o => [o.id, o]));

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
  const awaitingApproval = allApprovals.map(a => {
    const delivery = allDeliveries.find(d => d.id === a.deliveryId);
    return {
      kind: "awaiting_approval" as const,
      approvalId: a.id,
      deliveryId: a.deliveryId,
      orderId: a.orderId,
      deliveryNumber: delivery?.deliveryNumber ?? null,
      orderNumber: a.orderId ? (orderMap[a.orderId]?.orderNumber ?? null) : null,
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

  res.json({
    aCustomerDeliveries,
    urgentOrders,
    delayedDeliveries,
    unassignedDeliveries,
    awaitingApproval,
    unresolvedDeviations,
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
