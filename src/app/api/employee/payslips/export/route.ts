import { NextResponse } from "next/server";

import {
  AUTH_REQUIRED_ERROR_MESSAGE,
  FORBIDDEN_ERROR_MESSAGE,
} from "@/lib/admin/permissions";
import { apiError } from "@/lib/errors";
import { loadEmployeePayslips, type EmployeePayslip } from "@/lib/payslips/employee";
import { toCsv } from "@/lib/payroll/csv";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();

  try {
    const payslips = await loadEmployeePayslips(supabase);
    const filename = `employee-payslips-${new Date().toISOString().slice(0, 10)}.csv`;

    return new NextResponse(buildEmployeePayslipsCsv(payslips), {
      headers: {
        "content-disposition": `attachment; filename="${filename}"`,
        "content-type": "text/csv; charset=utf-8",
      },
    });
  } catch (error) {
    if (hasErrorMessage(error, AUTH_REQUIRED_ERROR_MESSAGE)) {
      return NextResponse.json(apiError("UNAUTHORIZED", "Authentication required"), { status: 401 });
    }

    if (hasErrorMessage(error, FORBIDDEN_ERROR_MESSAGE)) {
      return NextResponse.json(apiError("FORBIDDEN", "Forbidden"), { status: 403 });
    }

    return NextResponse.json(apiError("INTERNAL_ERROR", "Unable to export payslips"), { status: 500 });
  }
}

function buildEmployeePayslipsCsv(payslips: EmployeePayslip[]) {
  return toCsv(
    [
      "payslip_id",
      "employee_name",
      "period_start",
      "period_end",
      "gross_amount",
      "deductions_total",
      "net_amount",
      "published_at",
      "pay_items",
    ],
    payslips.map((payslip) => [
      payslip.id,
      payslip.employeeName,
      payslip.periodStart,
      payslip.periodEnd,
      payslip.grossAmount,
      payslip.deductionsTotal,
      payslip.netAmount,
      payslip.publishedAt,
      payslip.payItems.map(formatPayItem).join("; "),
    ]),
  );
}

function formatPayItem(item: EmployeePayslip["payItems"][number]) {
  const value = "amount" in item ? item.amount : item.text;
  return `${item.label}: ${value}`;
}

function hasErrorMessage(error: unknown, message: string): error is Error {
  return error instanceof Error && error.message === message;
}
