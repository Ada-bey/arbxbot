const https = require("https");
const crypto = require("crypto");

const HOST = "open-api.bingx.com";
const ALLOWED = [
  "/openApi/spot/v1/common/symbols",
  "/openApi/spot/v1/ticker/24hr",
  "/openApi/spot/v1/market/depth",
  "/openApi/spot/v1/account/balance",
  "/openApi/spot/v1/user/commissionRate",
  "/openApi/spot/v1/trade/order",
  "/openApi/spot/v1/trade/query",
];

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json",
};

function buildQS(params) {
  return Object.keys(params).sort().map(k => `${k}=${params[k]}`).join("&");
}

function sign(secret, qs) {
  return crypto.createHmac("sha256", secret).update(qs).digest("hex");
}

function request(method, path, qs, apiKey) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: HOST, path: `${path}?${qs}`, method,
      headers: { "X-BX-APIKEY": apiKey, "Content-Type": "application/json" },
    }, res => {
      let d = "";
      res.on("data", c => d += c);
      res.on("end", () => {
        try { resolve(JSON.parse(d)); }
        catch { resolve({ code: -1, msg: d.slice(0, 300) }); }
      });
    });
    req.on("error", e => reject(e));
    req.setTimeout(12000, () => { req.destroy(); reject(new Error("timeout")); });
    req.end();
  });
}

exports.handler = async event => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers: CORS, body: "" };

  let body;
  try { body = JSON.parse(event.body || "{}"); }
  catch { return { statusCode: 400, headers: CORS, body: JSON.stringify({ code: -1, msg: "bad json" }) }; }

  const { apiKey = "", secretKey = "", method = "GET", path = "", params = {}, signed = false } = body;

  if (!ALLOWED.includes(path))
    return { statusCode: 403, headers: CORS, body: JSON.stringify({ code: -1, msg: `forbidden: ${path}` }) };

  const p = { ...params };
  if (signed) {
    if (!apiKey || !secretKey)
      return { statusCode: 400, headers: CORS, body: JSON.stringify({ code: -1, msg: "keys required" }) };
    p.timestamp = Date.now();
  }

  const qs = buildQS(p);
  const fullQS = signed ? `${qs}&signature=${sign(secretKey, qs)}` : qs;

  try {
    const result = await request(method, path, fullQS, apiKey);
    return { statusCode: 200, headers: CORS, body: JSON.stringify(result) };
  } catch (e) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ code: -1, msg: String(e) }) };
  }
};
