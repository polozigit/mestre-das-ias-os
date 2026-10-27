import type { NextRequest } from "next/server";
import { autorizado, tocarBanco } from "@/lib/keep-alive";
import { createServiceClient } from "@/lib/supabase/service";

// Sem cache: cada chamada do Cron precisa chegar no banco.
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!autorizado(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return new Response("Unauthorized", { status: 401 });
  }
  const resultado = await tocarBanco(async () => {
    const { error } = await createServiceClient().from("empresa").select("id").limit(1);
    return { erro: error ? error.message : null };
  });
  return Response.json(resultado.corpo, { status: resultado.status });
}
