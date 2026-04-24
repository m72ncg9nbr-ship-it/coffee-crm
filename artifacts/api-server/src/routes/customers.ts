import { Router, type IRouter } from "express";
import { db, customersTable, customerAddressesTable } from "@workspace/db";
import { eq, and, ilike, or } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { logActivity } from "../lib/activity";
import {
  CreateCustomerBody,
  UpdateCustomerBody,
  GetCustomerParams,
  UpdateCustomerParams,
  ListCustomerAddressesParams,
  CreateCustomerAddressParams,
  CreateCustomerAddressBody,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/customers", requireAuth as any, async (req, res): Promise<void> => {
  const { search, priority, active, channel } = req.query as Record<string, string>;
  let query = db.select().from(customersTable).$dynamic();

  const conditions = [];
  if (search) {
    conditions.push(or(
      ilike(customersTable.companyName, `%${search}%`),
      ilike(customersTable.contactPerson, `%${search}%`),
      ilike(customersTable.email, `%${search}%`),
    ));
  }
  if (priority) {
    conditions.push(eq(customersTable.priorityClass, priority));
  }
  if (active !== undefined) {
    conditions.push(eq(customersTable.active, active === "true"));
  }
  if (channel) {
    conditions.push(eq(customersTable.businessChannel, channel));
  }

  if (conditions.length > 0) {
    query = query.where(and(...conditions));
  }

  const customers = await query.orderBy(customersTable.priorityClass, customersTable.companyName);
  res.json(customers.map(c => ({
    ...c,
    discountLevel: c.discountLevel ? parseFloat(c.discountLevel) : null,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  })));
});

router.post("/customers", requireAuth as any, async (req, res): Promise<void> => {
  const parsed = CreateCustomerBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const user = (req as any).user;
  const [customer] = await db.insert(customersTable).values({
    ...parsed.data,
    discountLevel: parsed.data.discountLevel?.toString(),
  }).returning();

  await logActivity({
    action: "customer_created",
    entityType: "customer",
    entityId: customer.id,
    description: `Customer "${customer.companyName}" created`,
    performedBy: user.id,
  });

  res.status(201).json({
    ...customer,
    discountLevel: customer.discountLevel ? parseFloat(customer.discountLevel) : null,
    createdAt: customer.createdAt.toISOString(),
    updatedAt: customer.updatedAt.toISOString(),
  });
});

router.get("/customers/:id", requireAuth as any, async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = GetCustomerParams.safeParse({ id: rawId });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [customer] = await db.select().from(customersTable).where(eq(customersTable.id, params.data.id));
  if (!customer) {
    res.status(404).json({ error: "Customer not found" });
    return;
  }

  const addresses = await db.select().from(customerAddressesTable).where(eq(customerAddressesTable.customerId, customer.id));

  res.json({
    ...customer,
    discountLevel: customer.discountLevel ? parseFloat(customer.discountLevel) : null,
    createdAt: customer.createdAt.toISOString(),
    updatedAt: customer.updatedAt.toISOString(),
    addresses,
  });
});

router.patch("/customers/:id", requireAuth as any, async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = UpdateCustomerParams.safeParse({ id: rawId });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateCustomerBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const updateData: Record<string, unknown> = { ...parsed.data };
  if (parsed.data.discountLevel !== undefined) {
    updateData.discountLevel = parsed.data.discountLevel?.toString();
  }

  const [customer] = await db.update(customersTable).set(updateData).where(eq(customersTable.id, params.data.id)).returning();
  if (!customer) {
    res.status(404).json({ error: "Customer not found" });
    return;
  }

  res.json({
    ...customer,
    discountLevel: customer.discountLevel ? parseFloat(customer.discountLevel) : null,
    createdAt: customer.createdAt.toISOString(),
    updatedAt: customer.updatedAt.toISOString(),
  });
});

router.get("/customers/:id/addresses", requireAuth as any, async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = ListCustomerAddressesParams.safeParse({ id: rawId });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const addresses = await db.select().from(customerAddressesTable).where(eq(customerAddressesTable.customerId, params.data.id));
  res.json(addresses);
});

router.post("/customers/:id/addresses", requireAuth as any, async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = CreateCustomerAddressParams.safeParse({ id: rawId });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = CreateCustomerAddressBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [address] = await db.insert(customerAddressesTable).values({
    ...parsed.data,
    customerId: params.data.id,
    isDefault: parsed.data.isDefault ?? false,
  }).returning();

  res.status(201).json(address);
});

export default router;
