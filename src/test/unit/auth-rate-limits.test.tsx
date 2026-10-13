import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/components/brand/BrandLogo", () => ({ BrandLogo: () => null }));
vi.mock("@/components/marketing/Reveal", () => ({ Reveal: ({ children }: { children: React.ReactNode }) => children }));
vi.mock("@/lib/employees/activation", () => ({ isInvitationToken: () => false, getInvitationAvailability: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: vi.fn() }));

import LoginPage from "@/app/auth/login/page";
import InvitationPage from "@/app/auth/invitation/page";
import { isAuthRateLimitError, magicLinkFailureCode } from "@/lib/auth/errors";

afterEach(cleanup);

describe("Auth throttling feedback", () => {
  it.each([{ status: 429 }, { code: "over_request_rate_limit" }, { code: "over_email_send_rate_limit" }])("classifies provider throttling without relying on raw messages: %j", (error) => {
    expect(isAuthRateLimitError(error)).toBe(true);
    expect(magicLinkFailureCode(error)).toBe("otp_rate_limited");
  });

  it.each([null, { status: 400, code: "otp_expired" }, { status: 500 }, { message: "429 confidential URL" }])("does not misclassify expiry, outages or message text: %j", (error) => {
    expect(isAuthRateLimitError(error)).toBe(false);
    expect(magicLinkFailureCode(error)).toBe("otp_failed");
  });

  it("explains an email sending quota without claiming a message was sent", async () => {
    render(await LoginPage({ searchParams: Promise.resolve({ error: "otp_rate_limited" }) }));
    expect(screen.getByText(/limite temporaire d’envoi ou de demandes/)).toBeInTheDocument();
    expect(screen.queryByText("Lien envoyé. Vérifiez votre boîte mail.")).not.toBeInTheDocument();
  });

  it("asks the user to reopen the same confirmation after a throttled activation", async () => {
    render(await InvitationPage({ searchParams: Promise.resolve({ error: "callback_rate_limited" }) }));
    expect(screen.getByRole("alert")).toHaveTextContent("rouvrez le même email de confirmation dans ce navigateur");
    expect(screen.getByRole("alert")).not.toHaveTextContent("Le lien de vérification a expiré");
    expect(screen.queryByRole("button", { name: /Recevoir/ })).not.toBeInTheDocument();
  });

  it("requests a new normal login link after a throttled exchange, since its email redirect may already have consumed the original", async () => {
    render(await LoginPage({ searchParams: Promise.resolve({ error: "callback_rate_limited" }) }));
    expect(screen.getByText(/demandez un nouveau lien depuis cette page/)).toBeInTheDocument();
    expect(screen.queryByText("Le lien de connexion a expiré ou n’est plus valide.")).not.toBeInTheDocument();
  });

  it("retains the expired-proof guidance for actual activation failures", async () => {
    render(await InvitationPage({ searchParams: Promise.resolve({ error: "activation_failed" }) }));
    expect(screen.getByRole("alert")).toHaveTextContent("Le lien de vérification a expiré");
  });
});
