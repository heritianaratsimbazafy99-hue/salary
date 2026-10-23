import { redirect } from "next/navigation";
import { AUTH_REQUIRED_ERROR_MESSAGE, FORBIDDEN_ERROR_MESSAGE } from "@/lib/admin/permissions";
import { requireAgencyEmployeeActor } from "@/lib/employees/agency-management";
export async function getAgencyPageActor() {
  try { return await requireAgencyEmployeeActor(); } catch (error) {
    if (error instanceof Error && error.message === AUTH_REQUIRED_ERROR_MESSAGE) redirect("/auth/login");
    if (error instanceof Error && error.message === FORBIDDEN_ERROR_MESSAGE) return null;
    throw error;
  }
}
