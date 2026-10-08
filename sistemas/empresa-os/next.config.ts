import type { NextConfig } from "next";
import { envPublicoDoBuild } from "./config/supabase-env.mjs";

const nextConfig: NextConfig = {
  // A integração Supabase -> Vercel grava SUPABASE_URL e SUPABASE_PUBLISHABLE_KEY, sem o prefixo NEXT_PUBLIC_,
  // e o navegador só enxerga NEXT_PUBLIC_. Na hora do build, copia o valor pros nomes que o código do navegador
  // lê. Só entram URL e chave PÚBLICA: chave secreta nunca vira NEXT_PUBLIC_ (config/supabase-env.mjs, regra C4).
  env: envPublicoDoBuild(process.env),
};

export default nextConfig;
