import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

// Next 16: a convenção `middleware` foi renomeada para `proxy` (arquivo src/proxy.ts, função `proxy`).
export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    // Tudo, exceto estáticos (imagens, ícones, assets do Next). `public/marca/*` (logo, favicon) sai do
    // gate pela EXTENSÃO, não pelo prefixo: a rota /marca (e /marca/...) é página protegida e PRECISA do gate.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
