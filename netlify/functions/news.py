import json
from datetime import datetime
from urllib.parse import parse_qs

def translate_ko(text):
    if not text: return text
    try:
        from deep_translator import GoogleTranslator
        return GoogleTranslator(source='auto', target='ko').translate(text) or text
    except Exception:
        return text

def handler(event, context):
    params = parse_qs(event.get("rawQuery") or "")
    ticker = (params.get("ticker", [""])[0] or "").upper()
    headers = {"Access-Control-Allow-Origin": "*", "Content-Type": "application/json"}
    if not ticker:
        return {"statusCode": 200, "headers": headers, "body": json.dumps({"news": []})}
    try:
        import yfinance as yf
        t = yf.Ticker(ticker)
        news = t.news or []
        result = []
        for n in news[:8]:
            c = n.get("content") or n
            title = c.get("title") or c.get("headline") or n.get("title") or ""
            link = (
                (c.get("canonicalUrl") or {}).get("url") or
                (c.get("clickThroughUrl") or {}).get("url") or
                c.get("link") or n.get("link") or "#"
            )
            publisher = (c.get("provider") or {}).get("displayName") or c.get("publisher") or ""
            pub_at = c.get("pubDate") or c.get("providerPublishTime") or n.get("providerPublishTime") or 0
            if isinstance(pub_at, str):
                try:
                    pub_at = int(datetime.fromisoformat(pub_at.replace("Z", "+00:00")).timestamp())
                except Exception:
                    pub_at = 0
            if title:
                result.append({
                    "title": translate_ko(title),
                    "titleOrig": title,
                    "link": link,
                    "publisher": publisher,
                    "publishedAt": pub_at,
                })
        return {"statusCode": 200, "headers": headers, "body": json.dumps({"news": result})}
    except Exception as e:
        return {"statusCode": 200, "headers": headers, "body": json.dumps({"news": [], "error": str(e)})}
