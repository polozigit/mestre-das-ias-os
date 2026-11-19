import type { NextRequest } from "next/server";
import { autorizado, tocarBanco, tocarHomologacao } from "@/lib/keep-alive";
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
  // A homologação (banco do preview) é tocada DEPOIS da produção e nunca muda o status da resposta.
  const homologacao = await tocarHomologacao(
    process.env.NEXT_PUBLIC_SUPABASE_URL_HOMOLOG,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY_HOMOLOG,
  );
  return Response.json({ ...resultado.corpo, homologacao }, { status: resultado.status });
}
