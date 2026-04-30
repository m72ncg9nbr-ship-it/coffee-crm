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
    actionType: "customer_created",
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

// Fields whose changes we summarise in the activity-log description.
// `notes` is intentionally excluded from the headline so multi-line note edits
// do not produce noisy descriptions.
const TRACKED_CUSTOMER_FIELDS = [
  "priorityClass",
  "paymentTerms",
  "discountLevel",
  "businessChannel",
  "customerChannel",
  "segment",
  "companyName",
  "contactPerson",
  "phone",
  "email",
  "active",
] as const;

function formatCustomerChange(field: string, before: unknown, after: unknown): string {
  if (field === "active") return after ? "activated" : "deactivated";
  if (field === "discountLevel") {
    const b = before == null ? "none" : `${before}%`;
    const a = after == null ? "none" : `${after}%`;
    return `discount ${b}→${a}`;
  }
  if (field === "priorityClass") return `priority ${before ?? "?"}→${after ?? "?"}`;
  if (field === "paymentTerms") return `payment terms ${before ?? "?"}→${after ?? "?"}`;
  return `${field} ${before ?? "?"}→${after ?? "?"}`;
}

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

  const [previous] = await db.select().from(customersTable).where(eq(customersTable.id, params.data.id));
  if (!previous) {
    res.status(404).json({ error: "Customer not found" });
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

  const previousDiscount = previous.discountLevel ? parseFloat(previous.discountLevel) : null;
  const nextDiscount = customer.discountLevel ? parseFloat(customer.discountLevel) : null;

  const changes: { field: string; before: unknown; after: unknown }[] = [];
  for (const field of TRACKED_CUSTOMER_FIELDS) {
    const before = field === "discountLevel" ? previousDiscount : (previous as any)[field];
    const after = field === "discountLevel" ? nextDiscount : (customer as any)[field];
    if (before !== after) changes.push({ field, before, after });
  }

  if (changes.length > 0) {
    const user = (req as any).user;
    const activeChange = changes.find(c => c.field === "active");
    const otherChanges = changes.filter(c => c.field !== "active");
    let description: string;
    if (activeChange && otherChanges.length === 0) {
      description = `Customer "${customer.companyName}" ${activeChange.after ? "activated" : "deactivated"}`;
    } else {
      const summary = otherChanges
        .map(c => formatCustomerChange(c.field, c.before, c.after))
        .join(", ");
      description = `Customer "${customer.companyName}" updated (${summary})`;
    }

    const priorityChange = changes.find(c => c.field === "priorityClass");
    await logActivity({
      actionType: priorityChange ? "customer_priority_changed" : "customer_updated",
      entityType: "customer",
      entityId: customer.id,
      description,
      performedBy: user?.id,
      metadata: {
        changes: changes.reduce<Record<string, { before: unknown; after: unknown }>>((acc, c) => {
          acc[c.field] = { before: c.before, after: c.after };
          return acc;
        }, {}),
      },
    });
  }

  res.json({
    ...customer,
    discountLevel: nextDiscount,
    createdAt: customer.createdAt.toISOString(),
    updatedAt: customer.updatedAt.toISOString(),
  });
});

router.post("/customers/check-duplicates", requireAuth as any, async (req, res): Promise<void> => {
  const { companyName, phone, email } = (req.body ?? {}) as { companyName?: string; phone?: string; email?: string };
  const conditions: any[] = [];
  if (companyName && companyName.trim().length >= 3) {
    conditions.push(ilike(customersTable.companyName, `%${companyName.trim()}%`));
  }
  if (phone && phone.trim().length >= 4) {
    conditions.push(ilike(customersTable.phone, `%${phone.trim()}%`));
  }
  if (email && email.trim().length >= 3) {
    conditions.push(ilike(customersTable.email, `%${email.trim()}%`));
  }
  if (conditions.length === 0) { res.json({ matches: [] }); return; }

  const matches = await db.select().from(customersTable).where(or(...conditions)).limit(10);
  res.json({
    matches: matches.map(c => ({
      id: c.id,
      companyName: c.companyName,
      contactPerson: c.contactPerson,
      phone: c.phone,
      email: c.email,
      priorityClass: c.priorityClass,
      active: c.active,
    })),
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
