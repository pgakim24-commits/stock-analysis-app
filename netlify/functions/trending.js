const https = require("https");

function get(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      {
        headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" },
        timeout: 10000,
      },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new Error("JSON parse failed"));
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

function safe(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === "number" && (!isFinite(v) || isNaN(v))) return null;
  return v;
}

exports.handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Content-Type": "application/json",
  };
  try {
    const symbols = [
      "NVDA",
      "AAPL",
      "MSFT",
      "TSLA",
      "AMD",
      "META",
      "AMZN",
      "GOOGL",
      "PLTR",
      "COIN",
    ];
    const results = await Promise.allSettled(
      symbols.map((sym) =>
        get(
          `https://query1.finance.yahoo.com/v8/finance/chart/${sym}?interval=1d&range=5d`,
        ).then((d) => {
          const meta = d?.chart?.result?.[0]?.meta || {};
          const price = safe(meta.regularMarketPrice);
          const prev = safe(meta.chartPreviousClose);
          const change = price && prev ? ((price - prev) / prev) * 100 : null;
          return {
            ticker: sym,
            name: meta.shortName || sym,
            price: safe(price),
            change: safe(change),
          };
        }),
      ),
    );
    const items = results
      .filter((r) => r.status === "fulfilled")
      .map((r) => r.value);
    return { statusCode: 200, headers, body: JSON.stringify({ items }) };
  } catch (e) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ items: [], error: e.message }),
    };
  }
};
