import { Router, type IRouter } from "express";
import { requireAuth } from "../middlewares/auth";
import { getLatestRates } from "../lib/tcmb";

const router: IRouter = Router();

router.get("/fx/rates", requireAuth as any, async (req, res): Promise<void> => {
  const result = await getLatestRates();
  res.json({
    rates: result.rates.map(r => ({
      pair:         r.pair,
      rate:         r.forexBuying,
      rateBuying:   r.forexBuying,
      rateSelling:  r.forexSelling,
      rateDate:     r.rateDate,
      source:       "TCMB",
    })),
    fetchedAt:   result.fetchedAt.toISOString(),
    stale:       result.stale,
    unavailable: result.unavailable,
  });
});

export default router;
