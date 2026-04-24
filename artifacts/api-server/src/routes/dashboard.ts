import { Router, type IRouter } from "express";
import { db, customersTable, ordersTable, deliveriesTable, accountingApprovalsTable } from "@workspace/db";
import { eq, and, gte, inArray } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { sql } from "drizzle-orm";

const router: IRouter = Router();

router.get("/dashboard/summary", requireAuth as any, async (req, res): Promise<void> => {
  const [totalCustomersResult] = await db.select({ count: sql<number>`count(*)` }).from(customersTable).where(eq(customersTable.active, true));
  const totalCustomers = Number(totalCustomersResult?.count ?? 0);

  const openOrders = await db.select().from(ordersTable).where(
    inArray(ordersTable.status, ["draft", "confirmed", "in_progress"])
  );

  const plannedDeliveries = await db.select().from(deliveriesTable).where(
    inArray(deliveriesTable.status, ["assigned", "unassigned"])
  );

  const outForDelivery = await db.select().from(deliveriesTable).where(
    inArray(deliveriesTable.status, ["in_transit", "arrived"])
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

  res.json({
    totalCustomers,
    openOrders: openOrders.length,
    plannedDeliveries: plannedDeliveries.length,
    outForDelivery: outForDelivery.length,
    delayedDeliveries: delayedDeliveries.length,
    awaitingAccountingApproval: awaitingApproval.length,
    approvedToday: approvedToday.length,
    priorityDistribution,
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
