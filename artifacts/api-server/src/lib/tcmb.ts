const TCMB_URL = "https://www.tcmb.gov.tr/kurlar/today.xml";
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour — TCMB publishes once daily at 15:30 Istanbul

export interface TcmbFxRate {
  pair: string;        // e.g. "EUR/TRY"
  forexBuying: number;
  forexSelling: number;
  rateDate: string;    // YYYY-MM-DD
}

export interface TcmbCache {
  rates: TcmbFxRate[];
  fetchedAt: Date;
  stale: boolean;      // true = using cached data because live fetch failed
  unavailable: boolean; // true = no data at all (first-fetch failure)
}

let cache: TcmbCache | null = null;

function parseTcmbXml(xml: string): TcmbFxRate[] {
  // Extract bulletin date: <Tarih_Date ... Date="MM/DD/YYYY" ...>
  const dateMatch = xml.match(/Date="(\d{2})\/(\d{2})\/(\d{4})"/);
  const rateDate = dateMatch
    ? `${dateMatch[3]}-${dateMatch[1]}-${dateMatch[2]}`
    : new Date().toISOString().split("T")[0];

  const rates: TcmbFxRate[] = [];

  for (const code of ["USD", "EUR"] as const) {
    const block = xml.match(
      new RegExp(`<Currency[^>]+CurrencyCode="${code}"[^>]*>([\\s\\S]*?)<\\/Currency>`)
    );
    if (!block) continue;

    const buy  = block[1].match(/<ForexBuying>([\d.]+)<\/ForexBuying>/);
    const sell = block[1].match(/<ForexSelling>([\d.]+)<\/ForexSelling>/);
    if (!buy || !sell) continue;

    rates.push({
      pair: `${code}/TRY`,
      forexBuying:  parseFloat(buy[1]),
      forexSelling: parseFloat(sell[1]),
      rateDate,
    });
  }

  return rates;
}

export async function getLatestRates(): Promise<TcmbCache> {
  const now = new Date();

  // Return cache if still within TTL
  if (
    cache &&
    !cache.unavailable &&
    now.getTime() - cache.fetchedAt.getTime() < CACHE_TTL_MS
  ) {
    return cache;
  }

  try {
    const response = await fetch(TCMB_URL, {
      signal: AbortSignal.timeout(10_000),
      headers: { Accept: "application/xml, text/xml, */*" },
    });

    if (!response.ok) throw new Error(`TCMB HTTP ${response.status}`);

    const xml = await response.text();
    const rates = parseTcmbXml(xml);

    cache = { rates, fetchedAt: now, stale: false, unavailable: rates.length === 0 };
    return cache;
  } catch {
    // Serve stale cache if available; otherwise signal unavailable
    if (cache) return { ...cache, stale: true };
    return { rates: [], fetchedAt: now, stale: false, unavailable: true };
  }
}
