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
  if (!ticker)
    return { statusCode: 200, headers, body: JSON.stringify({ news: [] }) };

  try {
    const data = await get(
      `https://query1.finance.yahoo.com/v2/finance/news?tickers=${ticker}&count=8`,
    );
    const items = data?.items?.result || data?.news || [];

    const news = await Promise.all(
      items.slice(0, 8).map(async (n) => {
        const c = n.content || n;
        const title = c.title || c.headline || n.title || "";
        const link =
          c.canonicalUrl?.url ||
          c.clickThroughUrl?.url ||
          c.link ||
          n.link ||
          "#";
        const publisher =
          c.provider?.displayName || c.publisher || n.publisher || "";
        let pubAt =
          c.pubDate || c.providerPublishTime || n.providerPublishTime || 0;
        if (typeof pubAt === "string") {
          pubAt = Math.floor(new Date(pubAt).getTime() / 1000) || 0;
        }
        if (!title) return null;
        const titleKo = await translateKo(title);
        return {
          title: titleKo,
          titleOrig: title,
          link,
          publisher,
          publishedAt: pubAt,
        };
      }),
    );

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ news: news.filter(Boolean) }),
    };
  } catch (e) {
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ news: [], error: e.message }),
    };
  }
};
