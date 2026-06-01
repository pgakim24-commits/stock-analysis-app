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
      body: JSON.stringify({
        gainers: [],
        losers: [],
        error: "FINNHUB_API_KEY not set",
      }),
    };

  try {
    const symbols = [
      "NVDA",
      "TSLA",
      "AMD",
      "COIN",
      "PLTR",
      "MSTR",
      "SMCI",
      "IONQ",
      "RKLB",
      "SHOP",
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
    const all = results
      .filter((r) => r.status === "fulfilled" && r.value.price)
      .map((r) => r.value);
    const gainers = all
      .filter((r) => (r.change || 0) > 0)
      .sort((a, b) => b.change - a.change)
      .slice(0, 5);
    const losers = all
      .filter((r) => (r.change || 0) < 0)
      .sort((a, b) => a.change - b.change)
      .slice(0, 5);
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ gainers, losers }),
    };
  } catch (e) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ gainers: [], losers: [], error: e.message }),
    };
  }
};
