import "server-only";

import { z } from "zod";

import { requireCanManageAgencies } from "./auth";
import { createClient } from "../supabase/server";

export type Agency = {
  id: string;
  name: string;
  code: string;
  is_active: boolean;
};

const CreateAgencyInputSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1)
    .max(32)
    .transform((code) => code.toUpperCase()),
  name: z.string().trim().min(1).max(160),
});

export async function listAgencies(): Promise<Agency[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("agencies")
    .select("id,name,code,is_active")
    .order("name");

  if (error) {
    throw new Error("Impossible de charger les agences.");
  }

  return data ?? [];
}

export async function createAgency(input: { name: string; code: string }): Promise<Agency> {
  const parsedInput = CreateAgencyInputSchema.safeParse(input);

  if (!parsedInput.success) {
    throw new Error("Champs invalides.");
  }

  await requireCanManageAgencies();

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("agencies")
    .insert({
      code: parsedInput.data.code,
      name: parsedInput.data.name,
    })
    .select("id,name,code,is_active")
    .single();

  if (error || !data) {
    throw new Error("Impossible de creer l'agence.");
  }

  return data;
}
