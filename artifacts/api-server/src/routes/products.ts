import { Router, type IRouter } from "express";
import { db, productsTable } from "@workspace/db";
import { eq, and, ilike } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import {
  CreateProductBody,
  UpdateProductBody,
  GetProductParams,
  UpdateProductParams,
  ListProductsQueryParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/products", requireAuth as any, async (req, res): Promise<void> => {
  const qp = ListProductsQueryParams.safeParse(req.query);
  const { search, category, active } = qp.success ? qp.data : {} as any;

  let query = db.select().from(productsTable).$dynamic();
  const conditions = [];

  if (search) {
    conditions.push(ilike(productsTable.productName, `%${search}%`));
  }
  if (category) {
    conditions.push(eq(productsTable.category, category));
  }
  if (active !== undefined) {
    conditions.push(eq(productsTable.active, active === "true" || active === true));
  }

  if (conditions.length > 0) {
    query = query.where(and(...conditions));
  }

  const products = await query.orderBy(productsTable.category, productsTable.productName);
  res.json(products.map(p => ({
    ...p,
    unitPrice: parseFloat(p.unitPrice),
    createdAt: p.createdAt.toISOString(),
  })));
});

router.post("/products", requireAuth as any, async (req, res): Promise<void> => {
  const parsed = CreateProductBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [product] = await db.insert(productsTable).values({
    ...parsed.data,
    unitPrice: parsed.data.unitPrice.toString(),
  }).returning();

  res.status(201).json({
    ...product,
    unitPrice: parseFloat(product.unitPrice),
    createdAt: product.createdAt.toISOString(),
  });
});

router.get("/products/:id", requireAuth as any, async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = GetProductParams.safeParse({ id: rawId });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [product] = await db.select().from(productsTable).where(eq(productsTable.id, params.data.id));
  if (!product) {
    res.status(404).json({ error: "Product not found" });
    return;
  }

  res.json({
    ...product,
    unitPrice: parseFloat(product.unitPrice),
    createdAt: product.createdAt.toISOString(),
  });
});

router.patch("/products/:id", requireAuth as any, async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = UpdateProductParams.safeParse({ id: rawId });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateProductBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const updateData: Record<string, unknown> = { ...parsed.data };
  if (parsed.data.unitPrice !== undefined) {
    updateData.unitPrice = parsed.data.unitPrice.toString();
  }

  const [product] = await db.update(productsTable).set(updateData).where(eq(productsTable.id, params.data.id)).returning();
  if (!product) {
    res.status(404).json({ error: "Product not found" });
    return;
  }

  res.json({
    ...product,
    unitPrice: parseFloat(product.unitPrice),
    createdAt: product.createdAt.toISOString(),
  });
});

export default router;
