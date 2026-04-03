// netlify/functions/bybit.js
// Bybit V5 API proxy — imzalama sunucu tarafında, CORS sorunu yok

const https = require("https");
const crypto = require("crypto");

const HOST = "api.bybit.com";
const RECV_WINDOW = "5000";

const ALLOWED_GET = [
  "/v5/market/orderbook",
  "/v5/market/instruments-info",
  "/v5/market/tickers",
  "/v5/account/wallet-balance",
  "/v5/account/fee-rate",
];
const ALLOWED_POST = [
  "/v5/order/create",
  "/v5/order/realtime",
];

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json",
};

// Bybit V5 imzalama: timestamp + apiKey + recvWindow + queryString
function sign(secret, timestamp, apiKey, recvWindow, payload) {
  const msg = `${timestamp}${apiKey}${recvWindow}${payload}`;
  return crypto.createHmac("sha256", secret).update(msg).digest("hex");
}

function buildQS(params) {
  return Object.keys(params)
    .sort()
    .filter(k => params[k] !== undefined && params[k] !== "")
    .map(k => `${k}=${encodeURIComponent(params[k])}`)
    .join("&");
}

function httpsReq(method, path, qs, body, headers) {
  return new Promise((resolve, reject) => {
    const fullPath = qs ? `${path}?${qs}` : path;
    const bodyStr = body ? JSON.stringify(body) : "";

    const opts = {
      hostname: HOST,
      path: fullPath,
      method,
      headers: {
        ...headers,
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(bodyStr),
      },
    };

    const req = https.request(opts, res => {
      let d = "";
      res.on("data", c => (d += c));
      res.on("end", () => {
        try { resolve(JSON.parse(d)); }
        catch { resolve({ retCode: -1, retMsg: d.slice(0, 300) }); }
      });
    });

    req.on("error", e => reject(e));
    req.setTimeout(10000, () => { req.destroy(); reject(new Error("timeout")); });
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

exports.handler = async event => {
  if (event.httpMethod === "OPTIONS")
    return { statusCode: 200, headers: CORS, body: "" };

  let body;
  try { body = JSON.parse(event.body || "{}"); }
  catch { return { statusCode: 400, headers: CORS, body: JSON.stringify({ retCode: -1, retMsg: "bad json" }) }; }

  const {
    apiKey = "",
    secretKey = "",
    method = "GET",
    path = "",
    params = {},    // GET params or POST body
    signed = false,
  } = body;

  // Endpoint güvenlik kontrolü
  const allowedList = method === "POST" ? ALLOWED_POST : ALLOWED_GET;
  if (!path || !allowedList.some(p => path.startsWith(p)))
    return { statusCode: 403, headers: CORS, body: JSON.stringify({ retCode: -1, retMsg: `forbidden: ${path}` }) };

  const timestamp = String(Date.now());
  let reqHeaders = {};
  let qs = "";
  let postBody = null;

  if (method === "GET") {
    qs = buildQS(params);
    if (signed) {
      if (!apiKey || !secretKey)
        return { statusCode: 400, headers: CORS, body: JSON.stringify({ retCode: -1, retMsg: "keys required" }) };
      const sig = sign(secretKey, timestamp, apiKey, RECV_WINDOW, qs);
      reqHeaders = {
        "X-BAPI-API-KEY": apiKey,
        "X-BAPI-TIMESTAMP": timestamp,
        "X-BAPI-RECV-WINDOW": RECV_WINDOW,
        "X-BAPI-SIGN": sig,
      };
    }
  } else {
    // POST
    postBody = params;
    const bodyStr = JSON.stringify(params);
    if (signed) {
      if (!apiKey || !secretKey)
        return { statusCode: 400, headers: CORS, body: JSON.stringify({ retCode: -1, retMsg: "keys required" }) };
      const sig = sign(secretKey, timestamp, apiKey, RECV_WINDOW, bodyStr);
      reqHeaders = {
        "X-BAPI-API-KEY": apiKey,
        "X-BAPI-TIMESTAMP": timestamp,
        "X-BAPI-RECV-WINDOW": RECV_WINDOW,
        "X-BAPI-SIGN": sig,
      };
    }
  }

  try {
    const result = await httpsReq(method, path, qs, postBody, reqHeaders);
    return { statusCode: 200, headers: CORS, body: JSON.stringify(result) };
  } catch (e) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ retCode: -1, retMsg: String(e) }) };
  }
};
