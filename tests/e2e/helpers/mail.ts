import { expect, type APIRequestContext } from "@playwright/test";

type MailpitSummary = { ID: string; To: Array<{ Address: string }> };

export async function readInvitationEmail(request: APIRequestContext, recipient: string) {
  let html = "";
  await expect.poll(async () => {
    const response = await request.get(`http://127.0.0.1:55428/messages?to=${encodeURIComponent(recipient)}`);
    const messages = await response.json() as Array<{ html: string }>;
    html = messages.at(-1)?.html ?? "";
    return html.includes("/auth/invitation?");
  }, { message: "Publication must send an activation link through Resend", timeout: 15_000 }).toBe(true);
  const link = extractLinks(html).find((candidate) => new URL(candidate).pathname === "/auth/invitation");
  if (!link) throw new Error("The invitation email has no activation link");
  expect(new URL(link).hostname).toBe("127.0.0.1");
  expect(html).not.toContain("1 250 000");
  return link;
}

export async function readActivationEmail(request: APIRequestContext, recipient: string) {
  let link: string | undefined;
  await expect.poll(async () => {
    const response = await request.get(`http://127.0.0.1:55428/messages?to=${encodeURIComponent(recipient)}`);
    const messages = await response.json() as Array<{ html: string; subject: string }>;
    const message = messages.find((candidate) => candidate.subject === "Confirmez votre accès à MadajobPay");
    link = message && extractLinks(message.html).find((candidate) => new URL(candidate).pathname === "/auth/callback");
    return Boolean(link);
  }, { message: "Activation must deliver the email proving mailbox ownership", timeout: 15_000 }).toBe(true);
  if (!link) throw new Error("The verification email has no confirmation link");
  expect(new URL(link).hostname).toBe("127.0.0.1");
  return link;
}

export async function readAuthEmail(
  request: APIRequestContext,
  recipient: string,
  previousMessageId?: string,
) {
  let messageId = "";
  await expect.poll(async () => {
    const response = await request.get("http://127.0.0.1:55424/api/v1/messages");
    const result = await response.json() as { messages: MailpitSummary[] };
    const message = result.messages.find((item) =>
      item.ID !== previousMessageId && item.To.some((to) => to.Address === recipient),
    );
    messageId = message?.ID ?? "";
    return Boolean(messageId);
  }, { message: "Supabase Auth must deliver the real email", timeout: 15_000 }).toBe(true);
  const response = await request.get(`http://127.0.0.1:55424/api/v1/message/${messageId}`);
  const message = await response.json() as { HTML: string; Text: string };
  const link = extractLinks(message.HTML).find((candidate) => new URL(candidate).pathname === "/auth/v1/verify");
  if (!link) throw new Error("Supabase Auth email has no verification link");
  expect(["127.0.0.1", "localhost"]).toContain(new URL(link).hostname);
  return { id: messageId, link };
}

function extractLinks(html: string) {
  return [...html.matchAll(/href=["'](https?:\/\/[^"']+)["']/g)]
    .map((match) => match[1].replaceAll("&amp;", "&").replaceAll("&#x3D;", "="));
}
