import { expect, type Page } from "@playwright/test";
import { createPayrollE2EFixture, signInAsE2EUser, type PayrollE2EFixture } from "./supabase-fixtures";

/** Uses the existing local-only client guard; no production credentials or remote mutations. */
export async function createAgencyEmployeeFixture() {
  const fixture = await createPayrollE2EFixture();
  const extraUsers: { authId: string; profileId: string }[] = [];
  return {
    ...fixture,
    async managerLogin(page: Page, email = fixture.manager.email) {
      await signInAsE2EUser(page, { email, password: fixture.password, targetPath: "/manager/employees", expectedPath: /\/manager\/employees/ });
    },
    async addManager() {
      const email = `codex-agency-second-${fixture.suffix}@example.com`;
      const { data, error } = await fixture.admin.auth.admin.createUser({ email, password: fixture.password, email_confirm: true });
      if (error || !data.user) throw new Error(`Second manager: ${error?.message}`);
      const user = { authId: data.user.id, profileId: "" };
      extraUsers.push(user);
      const profile = await fixture.admin.from("profiles").insert({ auth_user_id: user.authId, email, full_name: "Second responsable", role: "agency_manager" }).select("id").single();
      if (profile.error) throw profile.error;
      user.profileId = profile.data.id;
      const membership = await fixture.admin.from("agency_memberships").insert({ agency_id: fixture.agencyId, profile_id: user.profileId });
      if (membership.error) throw membership.error;
      return { email, id: user.profileId };
    },
    async cleanup() {
      // Extension rows retain actors and imports, so remove them before the shared fixture's users.
      for (const table of ["employee_imports", "agency_employee_events", "agency_employee_change_requests"]) {
        const result = await fixture.admin.from(table).delete().eq("agency_id", fixture.agencyId);
        if (result.error) throw new Error(`Cleanup ${table}: ${result.error.message}`);
      }
      for (const user of extraUsers) {
        if (user.profileId) {
          const result = await fixture.admin.from("profiles").delete().eq("id", user.profileId);
          if (result.error) throw result.error;
        }
        const result = await fixture.admin.auth.admin.deleteUser(user.authId);
        if (result.error) throw result.error;
      }
      await fixture.cleanup();
    },
  };
}

export async function agencyRpc<T>(fixture: PayrollE2EFixture, name: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await fixture.admin.rpc(name, args);
  if (error) throw new Error(`${name}: ${error.message}`);
  return data as T;
}

export async function employeeRow(fixture: PayrollE2EFixture, matricule: string) {
  const result = await fixture.admin.from("employees").select("*").eq("agency_id", fixture.agencyId).eq("employee_id", matricule).single();
  expect(result.error).toBeNull();
  return result.data!;
}

export async function seedMinimalEmployee(fixture: PayrollE2EFixture, matricule: string, fullName: string, email: string) {
  return agencyRpc<string>(fixture, "agency_create_employee", { p_actor_id: fixture.manager.id, p_agency_id: fixture.agencyId, p_matricule: matricule, p_full_name: fullName, p_email: email });
}
