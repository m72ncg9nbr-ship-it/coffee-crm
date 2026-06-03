import { Router, type IRouter } from "express";
import { db, ordersTable, orderItemsTable, customersTable, customerAddressesTable, productsTable, usersTable } from "@workspace/db";
import { eq, inArray, and, gte, lte, sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { ReportFilters } from "@workspace/api-zod";
import { getRegionForCity } from "../lib/turkey-regions";
import { dateDiffDays } from "../lib/paymentTerms";

const router: IRouter = Router();

const VALOR_RATE_MONTHLY = 0.04; // 4% monthly financing/valor rate

const SAMPLE_SOURCES = ["sample", "free_issue"];

// ── helpers ───────────────────────────────────────────────────────────────────

function toDate(s: string | null | undefined): Date | null {
  if (!s) return null;
  const d = new Date(s + "T00:00:00Z");
  return isNaN(d.getTime()) ? null : d;
}

function today(): string {
  return new Date().toISOString().split("T")[0];
}

function computeDelayDays(dueDate: string | null | undefined, paidAt: string | null | undefined): number {
  if (!dueDate) return 0;
  const referenceDate = paidAt ? paidAt.split("T")[0] : today();
  const diff = dateDiffDays(dueDate, referenceDate);
  return Math.max(0, diff);
}

async function loadApprovedOrders(filters: any) {
  // Load all approved orders matching filters
  let orders = await db.select().from(ordersTable)
    .where(eq(ordersTable.status, "approved"));

  if (filters.dateFrom) {
    orders = orders.filter(o => o.createdAt.toISOString().split("T")[0] >= filters.dateFrom);
  }
  if (filters.dateTo) {
    orders = orders.filter(o => o.createdAt.toISOString().split("T")[0] <= filters.dateTo);
  }
  if (filters.channel) {
    orders = orders.filter(o => o.businessChannel === filters.channel);
  }
  if (filters.customerId) {
    orders = orders.filter(o => o.customerId === Number(filters.customerId));
  }
  if (filters.createdBy) {
    orders = orders.filter(o => o.createdBy === Number(filters.createdBy));
  }
  if (filters.orderSource) {
    orders = orders.filter(o => o.orderSource === filters.orderSource);
  }
  if (filters.paymentStatus) {
    orders = orders.filter(o => (o as any).paymentStatus === filters.paymentStatus);
  }
  return orders;
}

async function loadOrderItems(orderIds: number[]) {
  if (orderIds.length === 0) return [];
  return db.select().from(orderItemsTable).where(inArray(orderItemsTable.orderId, orderIds));
}

async function loadCustomers(customerIds: number[]) {
  if (customerIds.length === 0) return [];
  return db.select().from(customersTable).where(inArray(customersTable.id, customerIds));
}

async function loadDefaultAddresses(customerIds: number[]) {
  if (customerIds.length === 0) return [];
  const addrs = await db.select().from(customerAddressesTable)
    .where(and(
      inArray(customerAddressesTable.customerId, customerIds),
      eq(customerAddressesTable.isDeliveryAddress, true),
    ));
  // prefer default, fall back to first per customer
  const best = new Map<number, typeof addrs[0]>();
  for (const a of addrs) {
    const existing = best.get(a.customerId);
    if (!existing || (a.isDefault && !existing.isDefault)) best.set(a.customerId, a);
  }
  return [...best.values()];
}

async function loadProducts(productIds: number[]) {
  if (productIds.length === 0) return [];
  return db.select().from(productsTable).where(inArray(productsTable.id, productIds));
}

async function loadUsers(userIds: number[]) {
  if (userIds.length === 0) return [];
  return db.select({ id: usersTable.id, fullName: usersTable.fullName }).from(usersTable)
    .where(inArray(usersTable.id, userIds));
}

function parseFilters(query: unknown) {
  const result = ReportFilters.safeParse(query);
  return result.success ? result.data : {};
}

// ── GET /api/reports/sales ────────────────────────────────────────────────────
router.get("/reports/sales", requireAuth as any, async (req, res): Promise<void> => {
  const filters = parseFilters(req.query);

  const orders = await loadApprovedOrders(filters);
  if (orders.length === 0) {
    res.json({ totalRevenue: 0, totalOrders: 0, totalUnits: 0, avgOrderValue: 0,
      byChannel: [], byOrderSource: [], byProduct: [], byCustomer: [], bySalesperson: [], byMonth: [] });
    return;
  }

  const orderIds = orders.map(o => o.id);
  const customerIds = [...new Set(orders.map(o => o.customerId))];
  const creatorIds  = [...new Set(orders.filter(o => o.createdBy).map(o => o.createdBy!))];

  const [items, customers, users] = await Promise.all([
    loadOrderItems(orderIds),
    loadCustomers(customerIds),
    loadUsers(creatorIds),
  ]);

  const customerMap = new Map(customers.map(c => [c.id, c.companyName]));
  const userMap     = new Map(users.map(u => [u.id, u.fullName]));
  const productIds  = [...new Set(items.map(i => i.productId))];
  const products    = await loadProducts(productIds);
  const productMap  = new Map(products.map(p => [p.id, p.productName]));

  // Filter items by product / city if needed (city handled via addresses — skip for sales)
  let filteredItems = items;
  if (filters.productId) filteredItems = filteredItems.filter(i => i.productId === filters.productId);

  // Build maps
  const orderItemMap = new Map<number, typeof items>();
  for (const item of filteredItems) {
    if (!orderItemMap.has(item.orderId)) orderItemMap.set(item.orderId, []);
    orderItemMap.get(item.orderId)!.push(item);
  }

  const totals = { revenue: 0, orders: 0, units: 0 };
  const byChannel    = new Map<string, { revenue: number; orders: number; units: number }>();
  const bySource     = new Map<string, { revenue: number; orders: number; units: number }>();
  const byProduct    = new Map<number, { label: string; revenue: number; orders: number; units: number }>();
  const byCustomer   = new Map<number, { label: string; revenue: number; orders: number; units: number }>();
  const bySalesperson = new Map<number | string, { label: string; revenue: number; orders: number; units: number }>();
  const byMonth      = new Map<string, { revenue: number; orders: number; units: number }>();

  function inc(map: Map<any, any>, key: any, label: string, revenue: number, units: number) {
    if (!map.has(key)) map.set(key, { label, revenue: 0, orders: 0, units: 0 });
    const e = map.get(key)!;
    e.revenue += revenue;
    e.orders += 1;
    e.units += units;
  }

  for (const order of orders) {
    const orderItems = orderItemMap.get(order.id) ?? [];
    const revenue = orderItems.reduce((s, i) => s + parseFloat(i.lineTotal), 0);
    const units   = orderItems.reduce((s, i) => s + i.quantity, 0);
    if (filters.productId && units === 0) continue; // skip if product filter applied but no items match

    totals.revenue += revenue;
    totals.orders  += 1;
    totals.units   += units;

    const month = order.createdAt.toISOString().substring(0, 7); // YYYY-MM
    inc(byChannel, order.businessChannel, order.businessChannel, revenue, units);
    inc(bySource, order.orderSource, order.orderSource, revenue, units);
    const custName = customerMap.get(order.customerId) ?? "Unknown";
    inc(byCustomer, order.customerId, custName, revenue, units);
    const spKey  = order.createdBy ?? "unknown";
    const spName = order.createdBy ? (userMap.get(order.createdBy) ?? `User ${order.createdBy}`) : "Unknown";
    inc(bySalesperson, spKey, spName, revenue, units);
    if (!byMonth.has(month)) byMonth.set(month, { revenue: 0, orders: 0, units: 0 });
    const me = byMonth.get(month)!;
    me.revenue += revenue; me.orders += 1; me.units += units;

    for (const item of orderItems) {
      if (!byProduct.has(item.productId)) byProduct.set(item.productId, { label: productMap.get(item.productId) ?? `#${item.productId}`, revenue: 0, orders: 0, units: 0 });
      const pe = byProduct.get(item.productId)!;
      pe.revenue += parseFloat(item.lineTotal);
      pe.orders  += 1;
      pe.units   += item.quantity;
    }
  }

  function toArr(map: Map<any, any>): any[] {
    return [...map.entries()]
      .map(([key, v]) => ({ key: String(key), label: v.label ?? String(key), ...v }))
      .sort((a, b) => b.revenue - a.revenue);
  }
  function toMonthArr(): any[] {
    return [...byMonth.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, v]) => ({ key, label: key, ...v }));
  }

  res.json({
    totalRevenue:  Math.round(totals.revenue * 100) / 100,
    totalOrders:   totals.orders,
    totalUnits:    totals.units,
    avgOrderValue: totals.orders > 0 ? Math.round((totals.revenue / totals.orders) * 100) / 100 : 0,
    byChannel:     toArr(byChannel),
    byOrderSource: toArr(bySource),
    byProduct:     toArr(byProduct).slice(0, 20),
    byCustomer:    toArr(byCustomer).slice(0, 20),
    bySalesperson: toArr(bySalesperson),
    byMonth:       toMonthArr(),
  });
});

// ── GET /api/reports/profitability ────────────────────────────────────────────
router.get("/reports/profitability", requireAuth as any, async (req, res): Promise<void> => {
  const filters = parseFilters(req.query);
  const orders = await loadApprovedOrders(filters);

  if (orders.length === 0) {
    const empty = { key: "total", label: "Total", grossRevenue: 0, discountAmount: 0, netRevenue: 0, productCost: null, grossProfit: null, valorCost: 0, collectionAdjustedProfit: null };
    res.json({ totals: empty, byProduct: [], byCustomer: [], byChannel: [] });
    return;
  }

  const orderIds   = orders.map(o => o.id);
  const customerIds = [...new Set(orders.map(o => o.customerId))];
  const [items, customers] = await Promise.all([loadOrderItems(orderIds), loadCustomers(customerIds)]);

  const customerMap    = new Map(customers.map(c => [c.id, c.companyName]));
  const productIds     = [...new Set(items.map(i => i.productId))];
  const products       = await loadProducts(productIds);
  const productNameMap = new Map(products.map(p => [p.id, p.productName]));

  // Build order lookup
  const orderMap = new Map(orders.map(o => [o.id, o]));

  function calcProfit(order: typeof orders[0], orderItems: typeof items) {
    let grossRevenue = 0, discountAmount = 0, productCost = 0;
    let costKnown = true;

    for (const item of orderItems) {
      const rev = parseFloat(item.unitPriceSnapshot) * item.quantity;
      const disc = item.discountPercentSnapshot != null
        ? rev * (parseFloat(item.discountPercentSnapshot) / 100) : 0;
      grossRevenue  += rev;
      discountAmount += disc;
      if (item.costPriceSnapshot != null) {
        productCost += parseFloat(item.costPriceSnapshot) * item.quantity;
      } else {
        costKnown = false;
      }
    }

    const netRevenue  = grossRevenue - discountAmount;
    const gp          = costKnown ? netRevenue - productCost : null;
    const o           = order as any;
    const delay       = computeDelayDays(o.dueDate, o.paidAt?.toISOString?.());
    const valorCost   = netRevenue * VALOR_RATE_MONTHLY * (delay / 30);
    const adjProfit   = gp != null ? gp - valorCost : null;

    return { grossRevenue, discountAmount, netRevenue, productCost: costKnown ? productCost : null, grossProfit: gp, valorCost, collectionAdjustedProfit: adjProfit };
  }

  const byProduct  = new Map<number, any>();
  const byCustomer = new Map<number, any>();
  const byChannel  = new Map<string, any>();
  let totals = { grossRevenue: 0, discountAmount: 0, netRevenue: 0, productCost: 0 as number | null, grossProfit: 0 as number | null, valorCost: 0, collectionAdjustedProfit: 0 as number | null };
  let allCostKnown = true;

  const itemsByOrder = new Map<number, typeof items>();
  for (const item of items) {
    if (!itemsByOrder.has(item.orderId)) itemsByOrder.set(item.orderId, []);
    itemsByOrder.get(item.orderId)!.push(item);
  }

  for (const order of orders) {
    const orderItems = itemsByOrder.get(order.id) ?? [];
    const p = calcProfit(order, orderItems);
    if (p.productCost == null) allCostKnown = false;

    totals.grossRevenue   += p.grossRevenue;
    totals.discountAmount += p.discountAmount;
    totals.netRevenue     += p.netRevenue;
    if (totals.productCost != null && p.productCost != null) totals.productCost += p.productCost; else totals.productCost = null;
    if (totals.grossProfit != null && p.grossProfit != null) totals.grossProfit += p.grossProfit; else totals.grossProfit = null;
    totals.valorCost += p.valorCost;
    if (totals.collectionAdjustedProfit != null && p.collectionAdjustedProfit != null) totals.collectionAdjustedProfit += p.collectionAdjustedProfit; else totals.collectionAdjustedProfit = null;

    // by customer
    const custKey  = order.customerId;
    const custLabel = customerMap.get(order.customerId) ?? `#${order.customerId}`;
    if (!byCustomer.has(custKey)) byCustomer.set(custKey, { label: custLabel, grossRevenue: 0, discountAmount: 0, netRevenue: 0, productCost: 0 as number | null, grossProfit: 0 as number | null, valorCost: 0, collectionAdjustedProfit: 0 as number | null, _costKnown: true });
    const ce = byCustomer.get(custKey)!;
    ce.grossRevenue += p.grossRevenue; ce.discountAmount += p.discountAmount; ce.netRevenue += p.netRevenue;
    ce.valorCost += p.valorCost;
    if (ce.productCost != null && p.productCost != null) ce.productCost += p.productCost; else { ce.productCost = null; ce._costKnown = false; }
    if (ce.grossProfit != null && p.grossProfit != null) ce.grossProfit += p.grossProfit; else ce.grossProfit = null;
    if (ce.collectionAdjustedProfit != null && p.collectionAdjustedProfit != null) ce.collectionAdjustedProfit += p.collectionAdjustedProfit; else ce.collectionAdjustedProfit = null;

    // by channel
    const ch = order.businessChannel;
    if (!byChannel.has(ch)) byChannel.set(ch, { label: ch, grossRevenue: 0, discountAmount: 0, netRevenue: 0, productCost: 0 as number | null, grossProfit: 0 as number | null, valorCost: 0, collectionAdjustedProfit: 0 as number | null });
    const che = byChannel.get(ch)!;
    che.grossRevenue += p.grossRevenue; che.discountAmount += p.discountAmount; che.netRevenue += p.netRevenue;
    che.valorCost += p.valorCost;
    if (che.productCost != null && p.productCost != null) che.productCost += p.productCost; else che.productCost = null;
    if (che.grossProfit != null && p.grossProfit != null) che.grossProfit += p.grossProfit; else che.grossProfit = null;
    if (che.collectionAdjustedProfit != null && p.collectionAdjustedProfit != null) che.collectionAdjustedProfit += p.collectionAdjustedProfit; else che.collectionAdjustedProfit = null;

    // by product (per item)
    for (const item of orderItems) {
      const pid = item.productId;
      if (!byProduct.has(pid)) byProduct.set(pid, { label: productNameMap.get(pid) ?? `#${pid}`, grossRevenue: 0, discountAmount: 0, netRevenue: 0, productCost: 0 as number | null, grossProfit: 0 as number | null, valorCost: 0, collectionAdjustedProfit: 0 as number | null });
      const pe = byProduct.get(pid)!;
      const itemRev  = parseFloat(item.unitPriceSnapshot) * item.quantity;
      const itemDisc = item.discountPercentSnapshot != null ? itemRev * (parseFloat(item.discountPercentSnapshot) / 100) : 0;
      const itemNet  = itemRev - itemDisc;
      const itemCost = item.costPriceSnapshot != null ? parseFloat(item.costPriceSnapshot) * item.quantity : null;
      const itemGP   = itemCost != null ? itemNet - itemCost : null;
      pe.grossRevenue += itemRev; pe.discountAmount += itemDisc; pe.netRevenue += itemNet;
      pe.valorCost += 0; // valor is order-level, not allocated per item
      if (pe.productCost != null && itemCost != null) pe.productCost += itemCost; else pe.productCost = null;
      if (pe.grossProfit != null && itemGP != null) pe.grossProfit += itemGP; else pe.grossProfit = null;
      pe.collectionAdjustedProfit = pe.grossProfit; // simplified for product dimension
    }
  }

  const round2 = (n: number | null) => n != null ? Math.round(n * 100) / 100 : null;
  function serializeEntry(key: string, v: any): any {
    return {
      key,
      label: v.label ?? key,
      grossRevenue: round2(v.grossRevenue) ?? 0,
      discountAmount: round2(v.discountAmount) ?? 0,
      netRevenue: round2(v.netRevenue) ?? 0,
      productCost: round2(v.productCost),
      grossProfit: round2(v.grossProfit),
      valorCost: round2(v.valorCost) ?? 0,
      collectionAdjustedProfit: round2(v.collectionAdjustedProfit),
    };
  }

  res.json({
    totals: serializeEntry("total", { label: "Total", ...totals }),
    byProduct:  [...byProduct.entries()].map(([k, v]) => serializeEntry(String(k), v)).sort((a, b) => (b.grossRevenue ?? 0) - (a.grossRevenue ?? 0)).slice(0, 20),
    byCustomer: [...byCustomer.entries()].map(([k, v]) => serializeEntry(String(k), v)).sort((a, b) => (b.grossRevenue ?? 0) - (a.grossRevenue ?? 0)).slice(0, 20),
    byChannel:  [...byChannel.entries()].map(([k, v]) => serializeEntry(k, v)).sort((a, b) => (b.grossRevenue ?? 0) - (a.grossRevenue ?? 0)),
  });
});

// ── GET /api/reports/collection ───────────────────────────────────────────────
router.get("/reports/collection", requireAuth as any, async (req, res): Promise<void> => {
  const filters = parseFilters(req.query);
  const orders = await loadApprovedOrders(filters);

  const customerIds = [...new Set(orders.map(o => o.customerId))];
  const customers = await loadCustomers(customerIds);
  const customerMap = new Map(customers.map(c => [c.id, c.companyName]));

  const todayStr = today();
  let totalInvoiced = 0, totalCollected = 0, totalOutstanding = 0, totalOverdue = 0;
  let overdueCount = 0, unpaidCount = 0;

  const rows = orders.map(o => {
    const o2 = o as any;
    const amt = parseFloat(o.totalAmount);
    const collected = o2.collectedAmount != null ? parseFloat(o2.collectedAmount) : (o2.paymentStatus === "paid" ? amt : 0);
    const outstanding = amt - collected;
    const isUnpaid = o2.paymentStatus !== "paid";
    const isOverdue = isUnpaid && o2.dueDate && o2.dueDate < todayStr;
    const delay = computeDelayDays(o2.dueDate, o2.paidAt?.toISOString?.());

    totalInvoiced    += amt;
    totalCollected   += collected;
    totalOutstanding += outstanding;
    if (isOverdue) { totalOverdue += outstanding; overdueCount++; }
    if (isUnpaid) unpaidCount++;

    return {
      orderId:         o.id,
      orderNumber:     o.orderNumber ?? null,
      customerName:    customerMap.get(o.customerId) ?? "Unknown",
      channel:         o.businessChannel,
      invoiceDate:     o2.invoiceDate ?? null,
      dueDate:         o2.dueDate ?? null,
      paymentStatus:   o2.paymentStatus ?? "unpaid",
      paidAt:          o2.paidAt?.toISOString?.() ?? null,
      totalAmount:     Math.round(amt * 100) / 100,
      collectedAmount: Math.round(collected * 100) / 100,
      delayDays:       delay,
    };
  });

  res.json({
    totalInvoiced:    Math.round(totalInvoiced * 100) / 100,
    totalCollected:   Math.round(totalCollected * 100) / 100,
    totalOutstanding: Math.round(totalOutstanding * 100) / 100,
    totalOverdue:     Math.round(totalOverdue * 100) / 100,
    overdueCount,
    unpaidCount,
    orders: rows.sort((a, b) => b.delayDays - a.delayDays),
  });
});

// ── GET /api/reports/samples ──────────────────────────────────────────────────
router.get("/reports/samples", requireAuth as any, async (req, res): Promise<void> => {
  const filters = parseFilters(req.query);

  let orders = await db.select().from(ordersTable)
    .where(sql`${ordersTable.orderSource} IN ('sample', 'free_issue')`);

  if (filters.dateFrom) orders = orders.filter(o => o.createdAt.toISOString().split("T")[0] >= filters.dateFrom!);
  if (filters.dateTo)   orders = orders.filter(o => o.createdAt.toISOString().split("T")[0] <= filters.dateTo!);
  if (filters.channel)  orders = orders.filter(o => o.businessChannel === filters.channel);
  if (filters.createdBy) orders = orders.filter(o => o.createdBy === Number(filters.createdBy));

  const orderIds    = orders.map(o => o.id);
  const customerIds = [...new Set(orders.map(o => o.customerId))];
  const creatorIds  = [...new Set(orders.filter(o => o.createdBy).map(o => o.createdBy!))];

  const [items, customers, users, addresses] = await Promise.all([
    loadOrderItems(orderIds),
    loadCustomers(customerIds),
    loadUsers(creatorIds),
    loadDefaultAddresses(customerIds),
  ]);

  const customerMap = new Map(customers.map(c => [c.id, c.companyName]));
  const userMap     = new Map(users.map(u => [u.id, u.fullName]));
  const addrMap     = new Map(addresses.map(a => [a.customerId, a.city]));
  const productIds  = [...new Set(items.map(i => i.productId))];
  const products    = await loadProducts(productIds);
  const productMap  = new Map(products.map(p => [p.id, { name: p.productName, sku: p.sku }]));

  const itemsByOrder = new Map<number, typeof items>();
  for (const item of items) {
    if (!itemsByOrder.has(item.orderId)) itemsByOrder.set(item.orderId, []);
    itemsByOrder.get(item.orderId)!.push(item);
  }

  // Filter by city/region if requested
  const filteredOrders = orders.filter(o => {
    if (filters.city) {
      const city = addrMap.get(o.customerId);
      if (!city || city.toLowerCase() !== filters.city.toLowerCase()) return false;
    }
    if (filters.region) {
      const city = addrMap.get(o.customerId);
      const region = getRegionForCity(city);
      if (!region || region !== filters.region) return false;
    }
    return true;
  });

  // Aggregations
  const byProductMap = new Map<number, { label: string; revenue: number; orders: number; units: number }>();
  let totalUnits = 0;

  const rows = filteredOrders.map(o => {
    const o2 = o as any;
    const orderItems = itemsByOrder.get(o.id) ?? [];
    const units = orderItems.reduce((s, i) => s + i.quantity, 0);
    totalUnits += units;
    const city = addrMap.get(o.customerId) ?? null;
    const region = getRegionForCity(city) ?? null;

    for (const item of orderItems) {
      if (!byProductMap.has(item.productId)) {
        const p = productMap.get(item.productId);
        byProductMap.set(item.productId, { label: p?.name ?? `#${item.productId}`, revenue: 0, orders: 0, units: 0 });
      }
      const pe = byProductMap.get(item.productId)!;
      pe.units  += item.quantity;
      pe.orders += 1;
      pe.revenue += parseFloat(item.lineTotal);
    }

    return {
      orderId:         o.id,
      orderNumber:     o.orderNumber ?? null,
      orderSource:     o.orderSource,
      customerName:    customerMap.get(o.customerId) ?? "Unknown",
      channel:         o.businessChannel,
      salesperson:     o.createdBy ? (userMap.get(o.createdBy) ?? null) : null,
      city,
      region,
      sampleReason:    o2.sampleReason ?? null,
      sampleEventName: o2.sampleEventName ?? null,
      totalUnits:      units,
      createdAt:       o.createdAt.toISOString(),
      products:        orderItems.map(i => ({
        productName: productMap.get(i.productId)?.name ?? "Unknown",
        sku:         productMap.get(i.productId)?.sku ?? "",
        quantity:    i.quantity,
      })),
    };
  });

  res.json({
    totalSampleOrders: filteredOrders.length,
    totalSampleUnits:  totalUnits,
    uniqueCustomers:   new Set(filteredOrders.map(o => o.customerId)).size,
    byProduct: [...byProductMap.entries()]
      .map(([k, v]) => ({ key: String(k), ...v }))
      .sort((a, b) => b.units - a.units),
    orders: rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  });
});

// ── GET /api/reports/regional ─────────────────────────────────────────────────
router.get("/reports/regional", requireAuth as any, async (req, res): Promise<void> => {
  const filters = parseFilters(req.query);
  const orders  = await loadApprovedOrders(filters);

  const orderIds    = orders.map(o => o.id);
  const customerIds = [...new Set(orders.map(o => o.customerId))];

  const [items, addresses] = await Promise.all([
    loadOrderItems(orderIds),
    loadDefaultAddresses(customerIds),
  ]);

  const addrMap    = new Map(addresses.map(a => [a.customerId, a.city]));
  const itemsByOrd = new Map<number, typeof items>();
  for (const i of items) {
    if (!itemsByOrd.has(i.orderId)) itemsByOrd.set(i.orderId, []);
    itemsByOrd.get(i.orderId)!.push(i);
  }

  const cityMap   = new Map<string, { revenue: number; orders: number; units: number }>();
  const regionMap = new Map<string, { revenue: number; orders: number; units: number }>();

  for (const o of orders) {
    const city   = addrMap.get(o.customerId) ?? "Unknown";
    const region = getRegionForCity(city) ?? "Other";
    const oi     = itemsByOrd.get(o.id) ?? [];
    const rev    = oi.reduce((s, i) => s + parseFloat(i.lineTotal), 0);
    const units  = oi.reduce((s, i) => s + i.quantity, 0);

    if (!cityMap.has(city)) cityMap.set(city, { revenue: 0, orders: 0, units: 0 });
    const ce = cityMap.get(city)!; ce.revenue += rev; ce.orders += 1; ce.units += units;

    if (!regionMap.has(region)) regionMap.set(region, { revenue: 0, orders: 0, units: 0 });
    const re = regionMap.get(region)!; re.revenue += rev; re.orders += 1; re.units += units;
  }

  const round2 = (n: number) => Math.round(n * 100) / 100;

  res.json({
    byCity: [...cityMap.entries()]
      .map(([city, v]) => ({ city, region: getRegionForCity(city) ?? null, revenue: round2(v.revenue), orders: v.orders, units: v.units }))
      .sort((a, b) => b.revenue - a.revenue),
    byRegion: [...regionMap.entries()]
      .map(([region, v]) => ({ region, revenue: round2(v.revenue), orders: v.orders, units: v.units }))
      .sort((a, b) => b.revenue - a.revenue),
  });
});

export default router;
