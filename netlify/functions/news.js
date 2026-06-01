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

async function translateKo(text) {
  if (!text) return text;
  try {
    const encoded = encodeURIComponent(text);
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=ko&dt=t&q=${encoded}`;
    const data = await get(url);
    return (
      data?.[0]
        ?.map((s) => s?.[0])
        .filter(Boolean)
        .join("") || text
    );
  } catch {
    return text;
  }
}

exports.handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Content-Type": "application/json",
  };
  const ticker = (event.queryStringParameters?.ticker || "").toUpperCase();
  const KEY = process.env.FINNHUB_API_KEY;

  if (!ticker || !KEY)
    return { statusCode: 200, headers, body: JSON.stringify({ news: [] }) };

  try {
    const to = Math.floor(Date.now() / 1000);
    const from = to - 30 * 24 * 3600; // 최근 30일
    const items = await get(
      `https://finnhub.io/api/v1/company-news?symbol=${ticker}&from=${new Date(from * 1000).toISOString().slice(0, 10)}&to=${new Date(to * 1000).toISOString().slice(0, 10)}&token=${KEY}`,
    );

    if (!Array.isArray(items))
      return { statusCode: 200, headers, body: JSON.stringify({ news: [] }) };

    const news = await Promise.all(
      items.slice(0, 8).map(async (n) => {
        const titleKo = await translateKo(n.headline || "");
        return {
          title: titleKo,
          titleOrig: n.headline || "",
          link: n.url || "#",
          publisher: n.source || "",
          publishedAt: n.datetime || 0,
        };
      }),
    );

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ news: news.filter((n) => n.titleOrig) }),
    };
  } catch (e) {
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ news: [], error: e.message }),
    };
  }
};
