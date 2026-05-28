import { Request, Response, NextFunction } from "express";
import { getUserById } from "../lib/auth";

// ─── Role constants ────────────────────────────────────────────────────────────
// owner_admin and general_manager are identical in system capability.
export const FULL_ACCESS            = ["owner_admin", "general_manager"] as const;
export const FULL_ACCESS_ACCOUNTING = [...FULL_ACCESS, "accounting"]     as const;
export const CHANNEL_OPS            = [...FULL_ACCESS, "channel_manager"] as const;
export const SALES_CAPABLE          = [...FULL_ACCESS, "channel_manager", "sales"] as const;

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const userId = req.session?.userId;
  if (!userId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  const user = await getUserById(userId);
  if (!user || !user.active) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  (req as any).user = user;
  next();
}

export function requireRole(...roles: string[]) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    await requireAuth(req, res, async () => {
      const user = (req as any).user;
      if (!roles.includes(user.role)) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
      next();
    });
  };
}
