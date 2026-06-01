const https = require("https");

function get(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { timeout: 12000 }, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          reject(new Error("JSON parse error"));
        }
      });
    });
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("timeout"));
    });
  });
}

function safe(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === "number" && (!isFinite(v) || isNaN(v))) return null;
  return v;
}

function calcRSI(closes, period = 14) {
  if (closes.length < period + 1) return null;
  let gains = 0,
    losses = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    d > 0 ? (gains += d) : (losses -= d);
  }
  let ag = gains / period,
    al = losses / period;
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    if (d > 0) {
      ag = (ag * (period - 1) + d) / period;
      al = (al * (period - 1)) / period;
    } else {
      ag = (ag * (period - 1)) / period;
      al = (al * (period - 1) - d) / period;
    }
  }
  return al === 0 ? 100 : 100 - 100 / (1 + ag / al);
}

function avg(arr, n) {
  if (arr.length < n) return null;
  return arr.slice(-n).reduce((a, b) => a + b, 0) / n;
}

exports.handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Content-Type": "application/json",
  };
  const ticker = (event.queryStringParameters?.ticker || "").toUpperCase();
  const KEY = process.env.FINNHUB_API_KEY || process.env.finnhub_api_key;

  if (!ticker)
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: "ticker required" }),
    };
  if (!KEY)
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: "FINNHUB_API_KEY not set" }),
    };

  try {
    // Finnhub: quote + profile + metrics + recommendation
    const [quote, profile, metrics, rec] = await Promise.all([
      get(`https://finnhub.io/api/v1/quote?symbol=${ticker}&token=${KEY}`),
      get(
        `https://finnhub.io/api/v1/stock/profile2?symbol=${ticker}&token=${KEY}`,
      ),
      get(
        `https://finnhub.io/api/v1/stock/metric?symbol=${ticker}&metric=all&token=${KEY}`,
      ),
      get(
        `https://finnhub.io/api/v1/stock/recommendation?symbol=${ticker}&token=${KEY}`,
      ),
    ]);

    if (!quote.c)
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({
          error: "티커를 찾을 수 없습니다: " + ticker,
          debug: { quote, keyLen: KEY?.length },
        }),
      };

    // Candle data for chart + MA + RSI (1년치, 일봉)
    const to = Math.floor(Date.now() / 1000);
    const from = to - 365 * 24 * 3600;
    const candle = await get(
      `https://finnhub.io/api/v1/stock/candle?symbol=${ticker}&resolution=D&from=${from}&to=${to}&token=${KEY}`,
    );

    const closes = candle.s === "ok" ? candle.c : [];
    const timestamps = candle.s === "ok" ? candle.t : [];
    const rsi = calcRSI(closes);

    const m = metrics.metric || {};
    const r = rec?.[0] || {};

    // analyst consensus
    const total =
      (r.strongBuy || 0) +
      (r.buy || 0) +
      (r.hold || 0) +
      (r.sell || 0) +
      (r.strongSell || 0);
    const recMean =
      total > 0
        ? ((r.strongBuy || 0) * 1 +
            (r.buy || 0) * 2 +
            (r.hold || 0) * 3 +
            (r.sell || 0) * 4 +
            (r.strongSell || 0) * 5) /
          total
        : null;

    const result = {
      ticker,
      name: profile.name || ticker,
      exchange: profile.exchange || "",
      sector: profile.finnhubIndustry || "",
      industry: profile.finnhubIndustry || "",
      currency: profile.currency || "USD",
      price: safe(quote.c),
      prev: safe(quote.pc),
      high52: safe(m["52WeekHigh"]),
      low52: safe(m["52WeekLow"]),
      marketCap: safe(
        profile.marketCapitalization
          ? profile.marketCapitalization * 1e6
          : null,
      ),
      pe: safe(m.peBasicExclExtraTTM || m.peTTM),
      forwardPe: safe(m.peNormalizedAnnual),
      pb: safe(m.pbAnnual || m.pbQuarterly),
      ps: safe(m.psAnnual || m.psTTM),
      evEbitda: safe(m.currentEv_freeCashFlowTTM),
      revenueGrowth: safe(
        m.revenueGrowthTTMYoy ? m.revenueGrowthTTMYoy / 100 : null,
      ),
      operatingMargin: safe(
        m.operatingMarginTTM ? m.operatingMarginTTM / 100 : null,
      ),
      profitMargin: safe(
        m.netProfitMarginTTM ? m.netProfitMarginTTM / 100 : null,
      ),
      roe: safe(m.roeTTM ? m.roeTTM / 100 : null),
      rsi: safe(rsi),
      ma20: safe(avg(closes, 20)),
      ma60: safe(avg(closes, 60)),
      ma120: safe(avg(closes, 120)),
      recMean: safe(recMean),
      recKey: "",
      targetMeanPrice: safe(m.targetPrice),
      analystCount: safe(total || null),
      shortRatio: safe(m.shortInterestRatio),
      beta: safe(m.beta),
      dividendYield: safe(
        m.dividendYieldIndicatedAnnual
          ? m.dividendYieldIndicatedAnnual / 100
          : null,
      ),
      closes,
      timestamps,
    };

    return { statusCode: 200, headers, body: JSON.stringify(result) };
  } catch (e) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: e.message }),
    };
  }
};
