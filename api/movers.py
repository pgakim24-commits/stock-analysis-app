from http.server import BaseHTTPRequestHandler
import json, math

def safe(val):
    if val is None: return None
    if isinstance(val, float) and (math.isnan(val) or math.isinf(val)): return None
    return val

class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.send_header('Content-type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        try:
            import yfinance as yf
            symbols = ["NVDA","TSLA","AMD","COIN","PLTR","MSTR","SMCI","IONQ","RKLB","SHOP"]
            result = []
            for sym in symbols:
                try:
                    info = yf.Ticker(sym).info or {}
                    price = safe(info.get("regularMarketPrice") or info.get("currentPrice"))
                    prev = safe(info.get("regularMarketPreviousClose") or info.get("previousClose"))
                    chg = ((price-prev)/prev*100) if price and prev else None
                    result.append({"ticker":sym,"name":info.get("shortName") or sym,"price":price,"change":safe(chg)})
                except: pass
            result.sort(key=lambda x: x["change"] or 0, reverse=True)
            gainers = [r for r in result if (r["change"] or 0) > 0][:5]
            losers = sorted([r for r in result if (r["change"] or 0) < 0], key=lambda x: x["change"] or 0)[:5]
            self.wfile.write(json.dumps({"gainers": gainers, "losers": losers}).encode())
        except Exception as e:
            self.wfile.write(json.dumps({"gainers":[],"losers":[],"error":str(e)}).encode())
