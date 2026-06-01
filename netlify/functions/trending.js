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

exports.handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Content-Type": "application/json",
  };
  const KEY = process.env.FINNHUB_API_KEY || process.env.finnhub_api_key;
  if (!KEY)
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ items: [], error: "FINNHUB_API_KEY not set" }),
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
        get(`https://finnhub.io/api/v1/quote?symbol=${sym}&token=${KEY}`).then(
          (q) => ({
            ticker: sym,
            name: sym,
            price: safe(q.c),
            change: safe(q.c && q.pc ? ((q.c - q.pc) / q.pc) * 100 : null),
          }),
        ),
      ),
    );
    const items = results
      .filter((r) => r.status === "fulfilled" && r.value.price)
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
