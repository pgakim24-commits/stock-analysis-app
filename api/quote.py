from http.server import BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
import json, math
from typing import Optional

def safe(val):
    if val is None: return None
    if isinstance(val, float) and (math.isnan(val) or math.isinf(val)): return None
    return val

def calc_rsi(closes, period=14):
    if len(closes) < period + 1: return None
    gains, losses = 0.0, 0.0
    for i in range(1, period + 1):
        d = closes[i] - closes[i-1]
        if d > 0: gains += d
        else: losses -= d
    ag, al = gains/period, losses/period
    for i in range(period + 1, len(closes)):
        d = closes[i] - closes[i-1]
        if d > 0:
            ag = (ag*(period-1)+d)/period; al = al*(period-1)/period
        else:
            ag = ag*(period-1)/period; al = (al*(period-1)-d)/period
    return None if al == 0 else 100 - 100/(1+ag/al)

def ma(prices, n):
    if len(prices) < n: return None
    return sum(prices[-n:]) / n

class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        params = parse_qs(urlparse(self.path).query)
        ticker = (params.get('ticker', [''])[0] or '').upper()
        self.send_response(200)
        self.send_header('Content-type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        if not ticker:
            self.wfile.write(json.dumps({"error": "ticker required"}).encode())
            return
        try:
            import yfinance as yf
            t = yf.Ticker(ticker)
            info = t.info or {}
            hist = t.history(period="1y", interval="1d")
            if hist.empty:
                self.wfile.write(json.dumps({"error": "no data"}).encode())
                return
            closes = [safe(v) for v in hist["Close"].tolist() if v is not None]
            timestamps = [int(ts.timestamp()) for ts in hist.index]
            rsi = calc_rsi(closes)
            result = {
                "ticker": ticker,
                "name": info.get("longName") or info.get("shortName") or ticker,
                "exchange": info.get("exchange") or "",
                "sector": info.get("sector") or "",
                "industry": info.get("industry") or "",
                "currency": info.get("currency") or "USD",
                "price": safe(info.get("regularMarketPrice") or info.get("currentPrice") or closes[-1]),
                "prev": safe(info.get("regularMarketPreviousClose") or info.get("previousClose") or closes[-2]),
                "high52": safe(info.get("fiftyTwoWeekHigh")),
                "low52": safe(info.get("fiftyTwoWeekLow")),
                "marketCap": safe(info.get("marketCap")),
                "pe": safe(info.get("trailingPE")),
                "forwardPe": safe(info.get("forwardPE")),
                "pb": safe(info.get("priceToBook")),
                "ps": safe(info.get("priceToSalesTrailingTwelveMonths")),
                "evEbitda": safe(info.get("enterpriseToEbitda")),
                "revenueGrowth": safe(info.get("revenueGrowth")),
                "operatingMargin": safe(info.get("operatingMargins")),
                "profitMargin": safe(info.get("profitMargins")),
                "roe": safe(info.get("returnOnEquity")),
                "rsi": safe(rsi),
                "ma20": safe(ma(closes, 20)),
                "ma60": safe(ma(closes, 60)),
                "ma120": safe(ma(closes, 120)),
                "recMean": safe(info.get("recommendationMean")),
                "recKey": info.get("recommendationKey") or "",
                "targetMeanPrice": safe(info.get("targetMeanPrice")),
                "analystCount": safe(info.get("numberOfAnalystOpinions")),
                "shortRatio": safe(info.get("shortRatio")),
                "beta": safe(info.get("beta")),
                "dividendYield": safe(info.get("dividendYield")),
                "closes": closes,
                "timestamps": timestamps,
            }
            self.wfile.write(json.dumps(result).encode())
        except Exception as e:
            self.wfile.write(json.dumps({"error": str(e)}).encode())
