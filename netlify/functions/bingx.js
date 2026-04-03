// netlify/functions/bingx.js
// BingX API proxy — CORS sorununu çözer
// Frontend bu fonksiyonu çağırır, fonksiyon BingX'e istek atar

const https = require("https");
const crypto = require("crypto");

const BASE = "open-api.bingx.com";

function sign(secret, params) {
  const qs = Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join("&");
  return {
    qs,
    sig: crypto.createHmac("sha256", secret).update(qs).digest("hex"),
  };
}

function httpsReq(method, path, query, apiKey) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: BASE,
      path: `${path}?${query}`,
      method,
      headers: {
        "X-BX-APIKEY": apiKey,
        "Content-Type": "application/json",
      },
    };
    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          resolve({ code: -1, msg: data });
        }
      });
    });
    req.on("error", reject);
    req.end();
  });
}

exports.handler = async (event) => {
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: cors, body: "" };
  }

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return {
      statusCode: 400,
      headers: cors,
      body: JSON.stringify({ code: -1, msg: "Invalid JSON" }),
    };
  }

  const { apiKey, secretKey, method, path, params = {} } = body;

  if (!apiKey || !secretKey || !path) {
    return {
      statusCode: 400,
      headers: cors,
      body: JSON.stringify({ code: -1, msg: "apiKey, secretKey, path gerekli" }),
    };
  }

  // İzin verilen endpoint'ler (güvenlik)
  const allowed = [
    "/openApi/spot/v1/common/symbols",
    "/openApi/spot/v1/ticker/24hr",
    "/openApi/spot/v1/market/depth",
    "/openApi/spot/v1/account/balance",
    "/openApi/spot/v1/user/commissionRate",
    "/openApi/spot/v1/trade/order",
    "/openApi/spot/v1/trade/query",
  ];
  if (!allowed.includes(path)) {
    return {
      statusCode: 403,
      headers: cors,
      body: JSON.stringify({ code: -1, msg: `Endpoint izinsiz: ${path}` }),
    };
  }

  // Timestamp ekle ve imzala
  const allParams = { ...params, timestamp: Date.now() };
  const { qs, sig } = sign(secretKey, allParams);
  const fullQuery = `${qs}&signature=${sig}`;

  try {
    const result = await httpsReq(
      method === "POST" ? "POST" : "GET",
      path,
      fullQuery,
      apiKey
    );
    return {
      statusCode: 200,
      headers: { ...cors, "Content-Type": "application/json" },
      body: JSON.stringify(result),
    };
  } catch (e) {
    return {
      statusCode: 500,
      headers: cors,
      body: JSON.stringify({ code: -1, msg: String(e) }),
    };
  }
};
