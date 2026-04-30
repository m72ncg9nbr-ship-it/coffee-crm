import { Router, type IRouter, type RequestHandler } from "express";
import multer from "multer";
import { db, deliveriesTable, deliveryDocumentsTable, accountingApprovalsTable, ordersTable, orderItemsTable, productsTable, customersTable, customerAddressesTable, usersTable } from "@workspace/db";
import { eq, and, inArray, sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { logActivity } from "../lib/activity";
import {
  CreateDeliveryBody,
  UpdateDeliveryBody,
  GetDeliveryParams,
  UpdateDeliveryParams,
  ListDeliveriesQueryParams,
  UploadDeliveryDocumentParams,
  UploadDeliveryDocumentBody,
  GetDriverDeliveriesParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

const ALLOWED_DOCUMENT_MIME_PREFIXES = ["image/"];
const ALLOWED_DOCUMENT_MIME_EXACT = new Set(["application/pdf"]);
const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_DOCUMENT_BYTES },
  fileFilter: (_req, file, cb) => {
    const m = file.mimetype.toLowerCase();
    const ok =
      ALLOWED_DOCUMENT_MIME_EXACT.has(m) ||
      ALLOWED_DOCUMENT_MIME_PREFIXES.some(p => m.startsWith(p));
    if (ok) {
      cb(null, true);
    } else {
      // @types/multer older signature only allows `null` for the error slot,
      // so cast the Error through to signal an unsupported file type.
      (cb as unknown as (err: Error, acceptFile: boolean) => void)(
        new Error("UNSUPPORTED_FILE_TYPE"),
        false,
      );
    }
  },
});

const uploadSingle: RequestHandler = upload.single("file") as unknown as RequestHandler;

async function nextDeliveryNumber(): Promise<string> {
  const rows = await db.execute<{ next: number }>(sql`
    SELECT COALESCE(MAX(NULLIF(regexp_replace(delivery_number, '[^0-9]', '', 'g'), '')::int), 0) + 1 AS next
    FROM deliveries
  `);
  const n = Number((rows as any).rows?.[0]?.next ?? (rows as any)[0]?.next ?? 1);
  return `DEL-${String(n).padStart(4, "0")}`;
}

async function enrichDeliveries(deliveries: (typeof deliveriesTable.$inferSelect)[]) {
  if (deliveries.length === 0) return [];

  const customerIds = [...new Set(deliveries.map(d => d.customerId))];
  const driverIds = [...new Set(deliveries.filter(d => d.driverId).map(d => d.driverId!))];
  const addressIds = [...new Set(deliveries.filter(d => d.deliveryAddressId).map(d => d.deliveryAddressId!))];
  const orderIds = [...new Set(deliveries.map(d => d.orderId))];

  const customers = customerIds.length > 0
    ? await db.select().from(customersTable).where(inArray(customersTable.id, customerIds))
    : [];
  const drivers = driverIds.length > 0
    ? await db.select().from(usersTable).where(inArray(usersTable.id, driverIds))
    : [];
  const addresses = addressIds.length > 0
    ? await db.select().from(customerAddressesTable).where(inArray(customerAddressesTable.id, addressIds))
    : [];
  const orders = orderIds.length > 0
    ? await db.select().from(ordersTable).where(inArray(ordersTable.id, orderIds))
    : [];

  const customerMap = Object.fromEntries(customers.map(c => [c.id, c]));
  const driverMap = Object.fromEntries(drivers.map(u => [u.id, u.fullName]));
  const addressMap = Object.fromEntries(addresses.map(a => [a.id, a]));
  const orderMap = Object.fromEntries(orders.map(o => [o.id, o]));

  return deliveries.map(d => {
    const c = customerMap[d.customerId];
    const a = d.deliveryAddressId ? addressMap[d.deliveryAddressId] : null;
    const o = orderMap[d.orderId];
    return {
      ...d,
      customerName: c?.companyName ?? "Unknown",
      customerPriority: c?.priorityClass ?? "C",
      contactPerson: c?.contactPerson ?? null,
      contactPhone: c?.phone ?? null,
      driverName: d.driverId ? (driverMap[d.driverId] ?? null) : null,
      orderNumber: o?.orderNumber ?? null,
      orderNotes: o?.notes ?? null,
      deliveryAddress: a ? {
        street: a.street,
        postalCode: a.postalCode,
        city: a.city,
        country: a.country,
        district: a.district ?? null,
        label: a.label ?? null,
        notes: a.notes ?? null,
      } : null,
      arrivalMarkedAt: d.arrivalMarkedAt?.toISOString() ?? null,
      documentationUploadedAt: d.documentationUploadedAt?.toISOString() ?? null,
      invoiceTriggeredAt: d.invoiceTriggeredAt?.toISOString() ?? null,
      createdAt: d.createdAt.toISOString(),
      updatedAt: d.updatedAt.toISOString(),
    };
  });
}

async function enrichDeliveriesWithItems(deliveries: (typeof deliveriesTable.$inferSelect)[]) {
  const enriched = await enrichDeliveries(deliveries);
  if (enriched.length === 0) return enriched;
  const orderIds = [...new Set(deliveries.map(d => d.orderId))];
  const items = await db.select().from(orderItemsTable).where(inArray(orderItemsTable.orderId, orderIds));
  const productIds = [...new Set(items.map(i => i.productId))];
  const products = productIds.length > 0
    ? await db.select().from(productsTable).where(inArray(productsTable.id, productIds))
    : [];
  const productMap = Object.fromEntries(products.map(p => [p.id, p.productName]));
  const itemsByOrder: Record<number, any[]> = {};
  for (const it of items) {
    (itemsByOrder[it.orderId] ??= []).push({
      id: it.id,
      productId: it.productId,
      productName: productMap[it.productId] ?? "Unknown",
      quantity: it.quantity,
    });
  }
  return enriched.map(d => ({ ...d, items: itemsByOrder[d.orderId] ?? [] }));
}

router.get("/deliveries", requireAuth as any, async (req, res): Promise<void> => {
  const qp = ListDeliveriesQueryParams.safeParse(req.query);
  const { status, driverId, channel } = qp.success ? qp.data : {} as any;
  const user = (req as any).user;

  let query = db.select().from(deliveriesTable).$dynamic();
  const conditions = [];

  if (status) conditions.push(eq(deliveriesTable.status, status as string));
  if (driverId) conditions.push(eq(deliveriesTable.driverId, Number(driverId)));
  if (channel) conditions.push(eq(deliveriesTable.businessChannel, channel as string));

  // Drivers may only ever list their own deliveries
  if (user?.role === "driver") {
    conditions.push(eq(deliveriesTable.driverId, user.id));
  }

  if (conditions.length > 0) query = query.where(and(...conditions));

  const deliveries = await query.orderBy(deliveriesTable.scheduledDate, deliveriesTable.plannedSequence, deliveriesTable.createdAt);
  res.json(await enrichDeliveries(deliveries));
});

router.post("/deliveries", requireAuth as any, async (req, res): Promise<void> => {
  const parsed = CreateDeliveryBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const user = (req as any).user;
  const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, parsed.data.orderId));
  if (!order) {
    res.status(404).json({ error: "Order not found" });
    return;
  }

  // Pick delivery address: explicit, or customer's default delivery address
  let deliveryAddressId = (parsed.data as any).deliveryAddressId ?? null;
  if (!deliveryAddressId) {
    const addrs = await db.select().from(customerAddressesTable)
      .where(eq(customerAddressesTable.customerId, order.customerId));
    const def = addrs.find(a => a.isDefault && a.isDeliveryAddress) ?? addrs.find(a => a.isDeliveryAddress) ?? addrs[0];
    deliveryAddressId = def?.id ?? null;
  }

  const deliveryNumber = await nextDeliveryNumber();
  const [delivery] = await db.insert(deliveriesTable).values({
    deliveryNumber,
    orderId: parsed.data.orderId,
    customerId: order.customerId,
    deliveryAddressId,
    driverId: parsed.data.driverId ?? null,
    scheduledDate: parsed.data.scheduledDate ?? null,
    plannedByUserId: user.id,
    status: parsed.data.driverId ? "assigned" : "unassigned",
    urgency: order.urgency,
    businessChannel: order.businessChannel,
  }).returning();

  // Move the order to "planned" once a delivery is created
  if (order.status === "new") {
    await db.update(ordersTable).set({ status: "planned" }).where(eq(ordersTable.id, order.id));
  }

  await logActivity({
    actionType: "delivery_created",
    entityType: "delivery",
    entityId: delivery.id,
    description: `Delivery ${delivery.deliveryNumber} created for order ${order.orderNumber ?? `#${order.id}`}`,
    performedBy: user.id,
  });

  const enriched = await enrichDeliveries([delivery]);
  res.status(201).json(enriched[0]);
});

router.get("/deliveries/driver/:driverId", requireAuth as any, async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.driverId) ? req.params.driverId[0] : req.params.driverId;
  const params = GetDriverDeliveriesParams.safeParse({ driverId: rawId });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const deliveries = await db.select().from(deliveriesTable)
    .where(and(
      eq(deliveriesTable.driverId, params.data.driverId),
      inArray(deliveriesTable.status, ["assigned", "arrived"])
    ))
    .orderBy(deliveriesTable.scheduledDate, deliveriesTable.plannedSequence);

  res.json(await enrichDeliveries(deliveries));
});

router.get("/deliveries/:id", requireAuth as any, async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = GetDeliveryParams.safeParse({ id: rawId });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const user = (req as any).user;
  const [delivery] = await db.select().from(deliveriesTable).where(eq(deliveriesTable.id, params.data.id));
  if (delivery && user?.role === "driver" && delivery.driverId !== user.id) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  if (!delivery) {
    res.status(404).json({ error: "Delivery not found" });
    return;
  }

  const documents = await db.select().from(deliveryDocumentsTable).where(eq(deliveryDocumentsTable.deliveryId, delivery.id));
  const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, delivery.orderId));
  const [customer] = await db.select().from(customersTable).where(eq(customersTable.id, delivery.customerId));

  const enriched = await enrichDeliveriesWithItems([delivery]);
  const base = enriched[0];

  const uploader_ids = [...new Set(documents.filter(d => d.uploadedBy).map(d => d.uploadedBy!))];
  const uploaders = uploader_ids.length > 0
    ? await db.select().from(usersTable).where(inArray(usersTable.id, uploader_ids))
    : [];
  const uploaderMap = Object.fromEntries(uploaders.map(u => [u.id, u.fullName]));

  const enrichedDocs = documents.map(d => ({
    ...d,
    uploadedByName: d.uploadedBy ? (uploaderMap[d.uploadedBy] ?? null) : null,
    createdAt: d.createdAt.toISOString(),
  }));

  res.json({
    ...base,
    documents: enrichedDocs,
    order: order ? {
      ...order,
      totalAmount: parseFloat(order.totalAmount),
      approvedAt: order.approvedAt?.toISOString() ?? null,
      invoiceTriggeredAt: order.invoiceTriggeredAt?.toISOString() ?? null,
      createdAt: order.createdAt.toISOString(),
      updatedAt: order.updatedAt.toISOString(),
      customerName: customer?.companyName ?? "Unknown",
      createdByName: null,
    } : null,
    customer: customer ? {
      ...customer,
      discountLevel: customer.discountLevel ? parseFloat(customer.discountLevel) : null,
      createdAt: customer.createdAt.toISOString(),
      updatedAt: customer.updatedAt.toISOString(),
    } : null,
  });
});

router.patch("/deliveries/:id", requireAuth as any, async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = UpdateDeliveryParams.safeParse({ id: rawId });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateDeliveryBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const user = (req as any).user;

  // Drivers can only update their own deliveries, and only the status field
  if (user?.role === "driver") {
    const [existing] = await db.select().from(deliveriesTable).where(eq(deliveriesTable.id, params.data.id));
    if (!existing) {
      res.status(404).json({ error: "Delivery not found" });
      return;
    }
    if (existing.driverId !== user.id) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    const allowed: any = {};
    if (parsed.data.status === "arrived") allowed.status = "arrived";
    if (Object.keys(allowed).length === 0) {
      res.status(403).json({ error: "Drivers may only mark delivery as arrived" });
      return;
    }
    parsed.data = allowed;
  }

  const updateValues: any = { ...parsed.data };

  if (parsed.data.status === "arrived") {
    updateValues.arrivalMarkedAt = new Date();
  }
  if (parsed.data.driverId) {
    updateValues.plannedByUserId = user.id;
    if (!parsed.data.status) {
      updateValues.status = "assigned";
    }
  }

  const [delivery] = await db.update(deliveriesTable)
    .set(updateValues)
    .where(eq(deliveriesTable.id, params.data.id))
    .returning();

  if (!delivery) {
    res.status(404).json({ error: "Delivery not found" });
    return;
  }

  // Order status transition: when delivery moves to "arrived" or "documentation_uploaded"
  // mark order as out_for_delivery
  if (parsed.data.status === "arrived") {
    await db.update(ordersTable)
      .set({ status: "out_for_delivery" })
      .where(eq(ordersTable.id, delivery.orderId));
  }

  if (parsed.data.driverId) {
    await logActivity({
      actionType: "delivery_assigned",
      entityType: "delivery",
      entityId: delivery.id,
      description: `Delivery ${delivery.deliveryNumber ?? `#${delivery.id}`} assigned to driver`,
      performedBy: user.id,
    });
  }

  if (parsed.data.status === "arrived") {
    await logActivity({
      actionType: "driver_arrived",
      entityType: "delivery",
      entityId: delivery.id,
      description: `Driver arrived for delivery ${delivery.deliveryNumber ?? `#${delivery.id}`}`,
      performedBy: user.id,
    });
  }

  const enriched = await enrichDeliveries([delivery]);
  res.json(enriched[0]);
});

router.post(
  "/deliveries/:id/documents",
  requireAuth as any,
  (req, res, next) => {
    uploadSingle(req, res, (err: any) => {
      if (!err) return next();
      if (err.code === "LIMIT_FILE_SIZE") {
        return res.status(413).json({ error: "File exceeds 10 MB limit" });
      }
      if (err.message === "UNSUPPORTED_FILE_TYPE") {
        return res.status(415).json({ error: "Only image and PDF uploads are supported" });
      }
      return res.status(400).json({ error: err.message ?? "Upload failed" });
    });
  },
  async (req, res): Promise<void> => {
    const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const params = UploadDeliveryDocumentParams.safeParse({ id: rawId });
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }

    const parsed = UploadDeliveryDocumentBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const file = (req as any).file as Express.Multer.File | undefined;
    if (!file) {
      res.status(400).json({ error: "Missing file upload (form field 'file')" });
      return;
    }

    const user = (req as any).user;
    const now = new Date();

    const [current] = await db.select().from(deliveriesTable).where(eq(deliveriesTable.id, params.data.id));
    if (!current) {
      res.status(404).json({ error: "Delivery not found" });
      return;
    }
    if (user?.role === "driver" && current.driverId !== user.id) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    if (current.status !== "arrived") {
      res.status(409).json({ error: `Cannot upload documentation: delivery status is "${current.status}", expected "arrived"` });
      return;
    }

    const [doc] = await db
      .insert(deliveryDocumentsTable)
      .values({
        deliveryId: params.data.id,
        documentType: parsed.data.documentType,
        fileUrl: "",
        fileMimeType: file.mimetype,
        fileSizeBytes: file.size,
        fileDataBase64: file.buffer.toString("base64"),
        notes: parsed.data.notes ?? null,
        uploadedBy: user.id,
      })
      .returning();

    const fileUrl = `/api/delivery-documents/${doc.id}/file`;
    await db
      .update(deliveryDocumentsTable)
      .set({ fileUrl })
      .where(eq(deliveryDocumentsTable.id, doc.id));

    const [delivery] = await db.update(deliveriesTable)
      .set({
        hasDocument: true,
        status: "awaiting_accounting_approval",
        documentationUploadedAt: now,
        deviationType: parsed.data.deviationType ?? null,
        deviationNote: parsed.data.deviationNote ?? null,
      })
      .where(eq(deliveriesTable.id, params.data.id))
      .returning();

    await db.update(ordersTable)
      .set({ status: "awaiting_accounting_approval" })
      .where(eq(ordersTable.id, delivery.orderId));

    await db.insert(accountingApprovalsTable).values({
      deliveryId: params.data.id,
      orderId: delivery.orderId,
      status: "pending",
    }).onConflictDoNothing();

    await logActivity({
      actionType: "documentation_uploaded",
      entityType: "delivery",
      entityId: params.data.id,
      description: `Delivery proof uploaded for delivery ${delivery.deliveryNumber ?? `#${params.data.id}`}`,
      performedBy: user.id,
    });

    res.status(201).json({
      ...doc,
      fileUrl,
      uploadedByName: user.fullName,
      createdAt: doc.createdAt.toISOString(),
    });
  },
);

router.get("/delivery-documents/:id/file", requireAuth as any, async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const docId = Number(rawId);
  if (!Number.isFinite(docId) || docId <= 0) {
    res.status(400).json({ error: "Invalid document id" });
    return;
  }

  const [doc] = await db
    .select()
    .from(deliveryDocumentsTable)
    .where(eq(deliveryDocumentsTable.id, docId));
  if (!doc) {
    res.status(404).json({ error: "Document not found" });
    return;
  }

  const user = (req as any).user;
  if (user?.role === "driver") {
    const [delivery] = await db
      .select()
      .from(deliveriesTable)
      .where(eq(deliveriesTable.id, doc.deliveryId));
    if (!delivery || delivery.driverId !== user.id) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
  }

  if (!doc.fileDataBase64) {
    res.status(404).json({ error: "No file stored for this document" });
    return;
  }

  const buffer = Buffer.from(doc.fileDataBase64, "base64");
  res.setHeader("Content-Type", doc.fileMimeType ?? "application/octet-stream");
  res.setHeader("Content-Length", String(buffer.byteLength));
  res.setHeader("Cache-Control", "private, max-age=300");
  res.status(200).send(buffer);
});

export default router;
