from http.server import BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
from datetime import datetime
import json

def translate_ko(text):
    if not text: return text
    try:
        from deep_translator import GoogleTranslator
        return GoogleTranslator(source='auto', target='ko').translate(text) or text
    except Exception:
        return text

class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        params = parse_qs(urlparse(self.path).query)
        ticker = (params.get('ticker', [''])[0] or '').upper()
        self.send_response(200)
        self.send_header('Content-type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        if not ticker:
            self.wfile.write(json.dumps({"news": []}).encode())
            return
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
            self.wfile.write(json.dumps({"news": result}).encode())
        except Exception as e:
            self.wfile.write(json.dumps({"news": [], "error": str(e)}).encode())
