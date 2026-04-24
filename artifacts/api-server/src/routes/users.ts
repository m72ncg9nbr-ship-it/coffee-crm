import { Router, type IRouter } from "express";
import { db, usersTable } from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import { serializeUser } from "../lib/auth";

const router: IRouter = Router();

router.get("/users", requireAuth as any, async (req, res): Promise<void> => {
  const users = await db.select().from(usersTable).orderBy(usersTable.fullName);
  res.json(users.map(serializeUser));
});

export default router;
