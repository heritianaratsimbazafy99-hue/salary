import { randomBytes } from "node:crypto";

import { expect, test as base } from "@playwright/test";

import { createPayrollE2EFixture, type PayrollE2EFixture } from "./helpers/supabase-fixtures";

type InvitationFixture = PayrollE2EFixture & {
  employeeId: string;
  tokenHash: string;
  createIdentity: (confirmed?: boolean) => Promise<string>;
  accept: (authUserId: string) => ReturnType<PayrollE2EFixture["admin"]["rpc"]>;
};

const test = base.extend<{ invitation: InvitationFixture }>({
  invitation: async ({}, runFixture) => {
    const fixture = await createPayrollE2EFixture();
    const authUserIds: string[] = [];
    const employeeId = `security-${fixture.suffix}`;
    const tokenHash = randomBytes(32).toString("hex");
    try {
      const employee = await fixture.admin.from("employees").insert({
        agency_id: fixture.agencyId,
        employee_id: employeeId,
        email: fixture.employeeEmail,
        full_name: "Verified Employee",
      });
      expect(employee.error).toBeNull();
      const invitation = await fixture.admin.from("employee_invitations").insert({
        agency_id: fixture.agencyId,
        employee_id: employeeId,
        email: fixture.employeeEmail,
        full_name: "Verified Employee",
        invited_by: fixture.manager.id,
        token_hash: tokenHash,
      });
      expect(invitation.error).toBeNull();
      await runFixture({
        ...fixture,
        employeeId,
        tokenHash,
        async createIdentity(confirmed = true) {
          const { data, error } = await fixture.admin.auth.admin.createUser({
            email: fixture.employeeEmail,
            email_confirm: confirmed,
            password: fixture.password,
            // Client-controlled metadata must never grant privileges or supply the profile name.
            user_metadata: { role: "super_admin", full_name: "Untrusted metadata" },
          });
          expect(error).toBeNull();
          expect(data.user?.id).toBeTruthy();
          const id = data.user!.id;
          authUserIds.push(id);
          return id;
        },
        accept: (authUserId) => fixture.admin.rpc("accept_employee_invitation", {
          p_auth_user_id: authUserId,
          p_token_hash: tokenHash,
        }),
      });
    } finally {
      await fixture.cleanup();
      for (const id of authUserIds) {
        // Profile-bearing users are already deleted by the shared fixture; unconfirmed
        // identities have no profile and must be removed explicitly too.
        const { error } = await fixture.admin.auth.admin.deleteUser(id);
        if (error && error.code !== "user_not_found") throw error;
      }
    }
  },
});

async function expectUnchanged(invitation: InvitationFixture, expectedStatus = "PENDING", expectedProfileId: string | null = null) {
  const employee = await invitation.admin.from("employees").select("profile_id")
    .eq("agency_id", invitation.agencyId).eq("employee_id", invitation.employeeId).single();
  expect(employee.error).toBeNull();
  expect(employee.data?.profile_id).toBe(expectedProfileId);
  const record = await invitation.admin.from("employee_invitations").select("status,accepted_by,accepted_at")
    .eq("token_hash", invitation.tokenHash).single();
  expect(record.error).toBeNull();
  expect(record.data).toEqual({ status: expectedStatus, accepted_by: null, accepted_at: null });
}

test("confirmed mailbox owner receives an employee profile without trusting metadata; token cannot replay", async ({ invitation }) => {
  const authUserId = await invitation.createIdentity();
  const { data, error } = await invitation.accept(authUserId);
  expect(error).toBeNull();
  expect(data).toEqual([{ agency_id: invitation.agencyId, employee_id: invitation.employeeId, status: "ACCEPTED" }]);
  const profile = await invitation.admin.from("profiles").select("id,role,email,full_name")
    .eq("auth_user_id", authUserId).single();
  expect(profile.error).toBeNull();
  expect(profile.data).toMatchObject({ role: "employee", email: invitation.employeeEmail, full_name: "Verified Employee" });
  const employee = await invitation.admin.from("employees").select("profile_id")
    .eq("agency_id", invitation.agencyId).eq("employee_id", invitation.employeeId).single();
  expect(employee.data?.profile_id).toBe(profile.data?.id);
  const record = await invitation.admin.from("employee_invitations").select("status,accepted_by,accepted_at")
    .eq("token_hash", invitation.tokenHash).single();
  expect(record.data).toMatchObject({ status: "ACCEPTED", accepted_by: profile.data?.id });
  expect(record.data?.accepted_at).toBeTruthy();
  expect((await invitation.accept(authUserId)).error?.message).toContain("not_found");
});

test("unconfirmed mailbox cannot accept or create a profile", async ({ invitation }) => {
  const authUserId = await invitation.createIdentity(false);
  expect((await invitation.accept(authUserId)).error?.message).toContain("forbidden");
  const profile = await invitation.admin.from("profiles").select("id").eq("auth_user_id", authUserId).maybeSingle();
  expect(profile.error).toBeNull();
  expect(profile.data).toBeNull();
  await expectUnchanged(invitation);
});

test("a different confirmed mailbox cannot consume the invitation", async ({ invitation }) => {
  expect((await invitation.accept(invitation.manager.authUserId)).error?.message).toContain("forbidden");
  await expectUnchanged(invitation);
});

test("an existing privileged profile is never downgraded or linked as an employee", async ({ invitation }) => {
  const authUserId = await invitation.createIdentity();
  const inserted = await invitation.admin.from("profiles").insert({
    auth_user_id: authUserId, email: invitation.employeeEmail, full_name: "Existing HR", role: "hr_central",
  });
  expect(inserted.error).toBeNull();
  expect((await invitation.accept(authUserId)).error?.message).toContain("forbidden");
  const profile = await invitation.admin.from("profiles").select("role").eq("auth_user_id", authUserId).single();
  expect(profile.data?.role).toBe("hr_central");
  await expectUnchanged(invitation);
});

for (const status of ["REVOKED", "EXPIRED"] as const) {
  test(`${status.toLowerCase()} invitation cannot create a profile or grant access`, async ({ invitation }) => {
    const authUserId = await invitation.createIdentity();
    expect((await invitation.admin.from("employee_invitations").update({ status }).eq("token_hash", invitation.tokenHash)).error).toBeNull();
    expect((await invitation.accept(authUserId)).error?.message).toContain("not_found");
    await expectUnchanged(invitation, status);
    const profile = await invitation.admin.from("profiles").select("id").eq("auth_user_id", authUserId).maybeSingle();
    expect(profile.data).toBeNull();
  });
}

test("pending invitation past its expiration cannot grant access", async ({ invitation }) => {
  const authUserId = await invitation.createIdentity();
  expect((await invitation.admin.from("employee_invitations").update({ expires_at: "2000-01-01T00:00:00Z" })
    .eq("token_hash", invitation.tokenHash)).error).toBeNull();
  expect((await invitation.accept(authUserId)).error?.message).toContain("not_found");
  await expectUnchanged(invitation);
});

test("employee bound to another profile is preserved and new profile creation rolls back", async ({ invitation }) => {
  const authUserId = await invitation.createIdentity();
  expect((await invitation.admin.from("employees").update({ profile_id: invitation.hr.id })
    .eq("agency_id", invitation.agencyId).eq("employee_id", invitation.employeeId)).error).toBeNull();
  expect((await invitation.accept(authUserId)).error?.message).toContain("forbidden");
  await expectUnchanged(invitation, "PENDING", invitation.hr.id);
  const profile = await invitation.admin.from("profiles").select("id").eq("auth_user_id", authUserId).maybeSingle();
  expect(profile.data).toBeNull();
});

test("a profile with the invited email but no matching auth identity is never adopted", async ({ invitation }) => {
  const authUserId = await invitation.createIdentity();
  expect((await invitation.admin.from("profiles").insert({
    email: invitation.employeeEmail, full_name: "Unclaimed profile", role: "employee",
  })).error).toBeNull();
  expect((await invitation.accept(authUserId)).error?.message).toContain("forbidden");
  const profile = await invitation.admin.from("profiles").select("auth_user_id").eq("email", invitation.employeeEmail).single();
  expect(profile.data?.auth_user_id).toBeNull();
  await expectUnchanged(invitation);
});

for (const inactive of ["agency", "employee"] as const) {
  test(`inactive ${inactive} cannot be activated`, async ({ invitation }) => {
    const authUserId = await invitation.createIdentity();
    const update = inactive === "agency"
      ? await invitation.admin.from("agencies").update({ is_active: false }).eq("id", invitation.agencyId)
      : await invitation.admin.from("employees").update({ is_active: false }).eq("agency_id", invitation.agencyId).eq("employee_id", invitation.employeeId);
    expect(update.error).toBeNull();
    expect((await invitation.accept(authUserId)).error?.message).toContain("forbidden");
    await expectUnchanged(invitation);
  });
}

test("banned mailbox owner cannot activate", async ({ invitation }) => {
  const authUserId = await invitation.createIdentity();
  expect((await invitation.admin.auth.admin.updateUserById(authUserId, { ban_duration: "24h" })).error).toBeNull();
  expect((await invitation.accept(authUserId)).error?.message).toContain("forbidden");
  await expectUnchanged(invitation);
});
