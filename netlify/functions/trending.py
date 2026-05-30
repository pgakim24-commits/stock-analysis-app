import json, math

def safe(val):
    if val is None: return None
    if isinstance(val, float) and (math.isnan(val) or math.isinf(val)): return None
    return val

def handler(event, context):
    headers = {"Access-Control-Allow-Origin": "*", "Content-Type": "application/json"}
    try:
        import yfinance as yf
        symbols = ["NVDA","AAPL","MSFT","TSLA","AMD","META","AMZN","GOOGL","PLTR","COIN"]
        result = []
        for sym in symbols:
            try:
                info = yf.Ticker(sym).info or {}
                price = safe(info.get("regularMarketPrice") or info.get("currentPrice"))
                prev = safe(info.get("regularMarketPreviousClose") or info.get("previousClose"))
                chg = ((price-prev)/prev*100) if price and prev else None
                result.append({"ticker":sym,"name":info.get("shortName") or sym,"price":price,"change":safe(chg)})
            except: pass
        return {"statusCode": 200, "headers": headers, "body": json.dumps({"items": result})}
    except Exception as e:
        return {"statusCode": 500, "headers": headers, "body": json.dumps({"items":[],"error":str(e)})}
