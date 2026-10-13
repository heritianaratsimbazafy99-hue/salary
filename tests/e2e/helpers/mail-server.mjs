// Local HTTP transport for the real Resend SDK. No application bypass is needed.
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";

const messages = [];
const server = createServer(async (request, response) => {
  const url = new URL(request.url, "http://127.0.0.1:55428");
  response.setHeader("Content-Type", "application/json");
  if (request.method === "GET" && url.pathname === "/health") {
    response.end(JSON.stringify({ ok: true }));
    return;
  }
  if (request.method === "GET" && url.pathname === "/messages") {
    const to = url.searchParams.get("to");
    response.end(JSON.stringify(messages.filter((message) => message.to.includes(to))));
    return;
  }
  if (request.method === "POST" && url.pathname === "/emails") {
    try {
      let body = "";
      for await (const chunk of request) {
        body += chunk;
        if (body.length > 1_000_000) throw new Error("Message too large");
      }
      const email = JSON.parse(body);
      const id = randomUUID();
      messages.push({ ...email, id, to: Array.isArray(email.to) ? email.to : [email.to] });
      response.end(JSON.stringify({ id }));
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
