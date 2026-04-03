// netlify/functions/api.js
// Tek proxy — hem public (market) hem private (trade) istekleri karşılar
// CORS sorununu sunucu tarafında çözer

const https = require("https");
const crypto = require("crypto");

const BINGX_HOST = "open-api.bingx.com";

// İzinli endpoint listesi
const ALLOWED = [
  "/openApi/spot/v1/common/symbols",
  "/openApi/spot/v1/ticker/24hr",
  "/openApi/spot/v1/market/depth",
  "/openApi/spot/v1/account/balance",
  "/openApi/spot/v1/user/commissionRate",
  "/openApi/spot/v1/trade/order",
  "/openApi/spot/v1/trade/query",
];

function sign(secret, queryString) {
  return crypto.createHmac("sha256", secret).update(queryString).digest("hex");
}

function buildQuery(params) {
  return Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join("&");
}

function httpsRequest(method, path, queryString, apiKey) {
  return new Promise((resolve, reject) => {
    const fullPath = `${path}?${queryString}`;
    const options = {
      hostname: BINGX_HOST,
      path: fullPath,
      method: method,
      headers: {
        "X-BX-APIKEY": apiKey,
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0",
      },
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve({ code: -1, msg: "Parse error: " + data.slice(0, 200) });
        }
      });
    });

    req.on("error", (e) => reject(e));
    req.setTimeout(10000, () => {
      req.destroy();
      reject(new Error("Timeout"));
    });
    req.end();
  });
}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json",
};

exports.handler = async (event) => {
  // OPTIONS preflight
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: CORS, body: "" };
  }

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return {
      statusCode: 400,
      headers: CORS,
      body: JSON.stringify({ code: -1, msg: "Invalid JSON body" }),
    };
  }

  const {
    apiKey = "",
    secretKey = "",
    method = "GET",
    path = "",
    params = {},
    signed = false,
  } = body;

  // Path kontrolü
  if (!path || !ALLOWED.includes(path)) {
    return {
      statusCode: 403,
      headers: CORS,
      body: JSON.stringify({ code: -1, msg: `Endpoint izinsiz: ${path}` }),
    };
  }

  // Parametreleri hazırla
  const allParams = { ...params };

  if (signed) {
    // İmzalı istek (account, trade)
    if (!apiKey || !secretKey) {
      return {
        statusCode: 400,
        headers: CORS,
        body: JSON.stringify({ code: -1, msg: "apiKey ve secretKey gerekli" }),
      };
    }
    allParams.timestamp = Date.now();
    const qs = buildQuery(allParams);
    const sig = sign(secretKey, qs);
    const fullQs = `${qs}&signature=${sig}`;

    try {
      const result = await httpsRequest(method, path, fullQs, apiKey);
      return {
        statusCode: 200,
        headers: CORS,
        body: JSON.stringify(result),
      };
    } catch (e) {
      return {
        statusCode: 500,
        headers: CORS,
        body: JSON.stringify({ code: -1, msg: String(e) }),
      };
    }
  } else {
    // Public istek (market data) — imza gerekmez
    const qs = buildQuery(allParams);
    try {
      const result = await httpsRequest(method, path, qs, apiKey || "");
      return {
        statusCode: 200,
        headers: CORS,
        body: JSON.stringify(result),
      };
    } catch (e) {
      return {
        statusCode: 500,
        headers: CORS,
        body: JSON.stringify({ code: -1, msg: String(e) }),
      };
    }
  }
};
