// Local HTTP transport for the real Resend SDK. No application bypass is needed.
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";

const messages = [];
const idempotency = new Map();
const requestTimes = [];
const rateLimit = Number(process.env.MAIL_MOCK_RATE_LIMIT ?? 0);
const latencyMs = Number(process.env.MAIL_MOCK_LATENCY_MS ?? 0);
const dailyQuota = Number(process.env.MAIL_MOCK_DAILY_QUOTA ?? 0);
const stats = { requests: 0, rateLimited: 0, quotaRejected: 0, accepted: 0, deduplicated: 0, batchRequests: 0 };
const server = createServer(async (request, response) => {
  const url = new URL(request.url, "http://127.0.0.1:55428");
  response.setHeader("Content-Type", "application/json");
  if (request.method === "GET" && url.pathname === "/health") {
    response.end(JSON.stringify({ ok: true }));
    return;
  }
  if (request.method === "GET" && url.pathname === "/stats") {
    response.end(JSON.stringify({ ...stats, rateLimit, latencyMs, dailyQuota }));
    return;
  }
  if (request.method === "GET" && url.pathname === "/messages") {
    const to = url.searchParams.get("to");
    response.end(JSON.stringify(messages.filter((message) => message.to.includes(to))));
    return;
  }
  if (request.method === "POST" && ["/emails", "/emails/batch"].includes(url.pathname)) {
    try {
      let body = "";
      for await (const chunk of request) {
        body += chunk;
        if (body.length > 1_000_000) throw new Error("Message too large");
      }
      const payload = JSON.parse(body);
      const batch = url.pathname === "/emails/batch";
      const emails = batch ? payload : [payload];
      if (!Array.isArray(emails) || !emails.length || emails.length > 100 || emails.some((email) => !email.to || !email.html)) throw new Error("Invalid messages");
      stats.requests++;
      if (batch) stats.batchRequests++;
      if (latencyMs) await new Promise((resolve) => setTimeout(resolve, latencyMs));
      const now = Date.now();
      while (requestTimes.length && requestTimes[0] <= now - 1000) requestTimes.shift();
      if (rateLimit && requestTimes.length >= rateLimit) {
        stats.rateLimited++;
        response.setHeader("retry-after", "1");
        response.writeHead(429).end(JSON.stringify({ name: "rate_limit_exceeded", message: "Too many requests", statusCode: 429 }));
        return;
      }
      requestTimes.push(now);
      const key = request.headers["idempotency-key"];
      if (key && idempotency.has(key)) {
        const previous = idempotency.get(key);
        if (previous.body !== body || previous.path !== url.pathname) {
          response.writeHead(409).end(JSON.stringify({ name: "invalid_idempotent_request", message: "Payload changed", statusCode: 409 }));
          return;
        }
        stats.deduplicated++;
        response.end(JSON.stringify(previous.result));
        return;
      }
      if (dailyQuota && messages.length + emails.length > dailyQuota) {
        stats.quotaRejected++;
        response.writeHead(429).end(JSON.stringify({ name: "daily_quota_exceeded", message: "Daily quota exhausted", statusCode: 429 }));
        return;
      }
      const ids = emails.map((email) => {
        const id = randomUUID();
        messages.push({ ...email, id, to: Array.isArray(email.to) ? email.to : [email.to] });
        return { id };
      });
      stats.accepted += emails.length;
      const result = batch ? { data: ids } : ids[0];
      if (key) idempotency.set(key, { body, path: url.pathname, result });
      response.end(JSON.stringify(result));
    } catch {
      response.writeHead(400).end(JSON.stringify({ message: "Invalid message" }));
    }
    return;
  }
  response.writeHead(404).end(JSON.stringify({ message: "Not found" }));
});

server.listen(55428, "127.0.0.1");
process.on("SIGTERM", () => server.close());
process.on("SIGINT", () => server.close());
