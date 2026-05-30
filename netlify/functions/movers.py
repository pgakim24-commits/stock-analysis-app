import json, math

def safe(val):
    if val is None: return None
    if isinstance(val, float) and (math.isnan(val) or math.isinf(val)): return None
    return val

def handler(event, context):
    headers = {"Access-Control-Allow-Origin": "*", "Content-Type": "application/json"}
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
        return {"statusCode": 200, "headers": headers, "body": json.dumps({"gainers":gainers,"losers":losers})}
    except Exception as e:
        return {"statusCode": 500, "headers": headers, "body": json.dumps({"gainers":[],"losers":[],"error":str(e)})}
