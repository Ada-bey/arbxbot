// netlify/functions/market.js
// Public market data proxy — imza gerektirmez (depth, ticker)

const https = require("https");

const BASE = "open-api.bingx.com";

function httpsGet(path, query) {
  return new Promise((resolve, reject) => {
    const fullPath = query ? `${path}?${query}` : path;
    https.get({ hostname: BASE, path: fullPath }, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => {
        try { resolve(JSON.parse(data)); }
        catch { resolve({ code: -1, msg: data }); }
      });
    }).on("error", reject);
  });
}

exports.handler = async (event) => {
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: cors, body: "" };
  }

  const { path, symbol, limit } = event.queryStringParameters || {};

  const allowed = [
    "/openApi/spot/v1/market/depth",
    "/openApi/spot/v1/ticker/24hr",
    "/openApi/spot/v1/common/symbols",
  ];

  if (!path || !allowed.includes(path)) {
    return {
      statusCode: 400,
      headers: cors,
      body: JSON.stringify({ code: -1, msg: "Geçersiz path" }),
    };
  }

  const parts = [];
  if (symbol) parts.push(`symbol=${encodeURIComponent(symbol)}`);
  if (limit)  parts.push(`limit=${encodeURIComponent(limit)}`);
  const query = parts.join("&");

  try {
    const result = await httpsGet(path, query);
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
