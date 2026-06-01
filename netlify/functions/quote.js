const https = require("https");

// Generic HTTP GET — returns parsed JSON and response headers
function get(url, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Accept: "application/json, text/plain, */*",
          "Accept-Language": "en-US,en;q=0.9",
          ...extraHeaders,
        },
        timeout: 12000,
      },
      (res) => {
        let data = "";
        const cookies = res.headers["set-cookie"] || [];
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          try {
            resolve({
              json: JSON.parse(data),
              cookies,
              status: res.statusCode,
            });
          } catch {
            resolve({ text: data, cookies, status: res.statusCode });
          }
        });
      },
    );
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("timeout"));
    });
  });
}

// Fetch Yahoo crumb + cookies
async function getYahooCrumb() {
  try {
    // Step 1: get cookies from Yahoo Finance homepage
    const r1 = await get("https://finance.yahoo.com/");
    const cookieStr = (r1.cookies || []).map((c) => c.split(";")[0]).join("; ");

    // Step 2: get crumb using cookies
    const r2 = await get("https://query2.finance.yahoo.com/v1/test/getcrumb", {
      Cookie: cookieStr,
    });
    const crumb = r2.text?.trim() || r2.json;
    if (typeof crumb === "string" && crumb.length > 0 && crumb.length < 30) {
      return { crumb, cookieStr };
    }
  } catch {}
  return { crumb: null, cookieStr: "" };
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
  if (!ticker)
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: "ticker required" }),
    };

  try {
    // Get crumb for authenticated endpoints
    const { crumb, cookieStr } = await getYahooCrumb();
    const authHeaders = cookieStr ? { Cookie: cookieStr } : {};

    // Fetch chart + summary in parallel
    const chartUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=1y`;
    const summaryUrl = crumb
      ? `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${ticker}?modules=price,financialData,defaultKeyStatistics,summaryDetail,recommendationTrend,summaryProfile&crumb=${encodeURIComponent(crumb)}`
      : `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${ticker}?modules=price,financialData,defaultKeyStatistics,summaryDetail,recommendationTrend,summaryProfile`;

    const [chartRes, summaryRes] = await Promise.all([
      get(chartUrl),
      get(summaryUrl, authHeaders),
    ]);

    const c = chartRes.json?.chart?.result?.[0];
    if (!c)
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ error: "no data for " + ticker }),
      };

    const meta = c.meta;
    const closes = (c.indicators?.quote?.[0]?.close || []).filter(
      (v) => v != null,
    );
    const timestamps = c.timestamp || [];
    const rsi = calcRSI(closes);

    const sum = summaryRes.json?.quoteSummary?.result?.[0] || {};
    const fin = sum.financialData || {};
    const stat = sum.defaultKeyStatistics || {};
    const detail = sum.summaryDetail || {};
    const priceM = sum.price || {};
    const sp = sum.summaryProfile || {};

    const result = {
      ticker,
      name:
        priceM.longName ||
        priceM.shortName ||
        meta.shortName ||
        meta.symbol ||
        ticker,
      exchange: meta.exchangeName || priceM.exchangeName || "",
      sector: sp.sector || "",
      industry: sp.industry || "",
      currency: meta.currency || "USD",
      price: safe(meta.regularMarketPrice),
      prev: safe(meta.chartPreviousClose),
      high52: safe(meta.fiftyTwoWeekHigh),
      low52: safe(meta.fiftyTwoWeekLow),
      marketCap: safe(priceM.marketCap?.raw || detail.marketCap?.raw),
      pe: safe(stat.trailingPE?.raw || detail.trailingPE?.raw),
      forwardPe: safe(stat.forwardPE?.raw),
      pb: safe(stat.priceToBook?.raw),
      ps: safe(stat.priceToSalesTrailingTwelveMonths?.raw),
      evEbitda: safe(stat.enterpriseToEbitda?.raw),
      revenueGrowth: safe(fin.revenueGrowth?.raw),
      operatingMargin: safe(fin.operatingMargins?.raw),
      profitMargin: safe(fin.profitMargins?.raw),
      roe: safe(fin.returnOnEquity?.raw),
      rsi: safe(rsi),
      ma20: safe(avg(closes, 20)),
      ma60: safe(avg(closes, 60)),
      ma120: safe(avg(closes, 120)),
      recMean: safe(fin.recommendationMean?.raw),
      recKey: fin.recommendationKey || "",
      targetMeanPrice: safe(fin.targetMeanPrice?.raw),
      analystCount: safe(fin.numberOfAnalystOpinions?.raw),
      shortRatio: safe(stat.shortRatio?.raw),
      beta: safe(stat.beta?.raw || detail.beta?.raw),
      dividendYield: safe(detail.dividendYield?.raw),
      closes,
      timestamps,
      _crumb: crumb ? "ok" : "none", // debug
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
