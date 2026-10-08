import { redirect } from "next/navigation";
import { getSessao } from "./sessao";
import { pode, type Modulo, type Sessao } from "./permissoes";

/**
 * Guard de PÁGINA/LAYOUT: redireciona quem não pode. Uso típico: 1 linha no
 * layout.tsx de cada módulo. (Camada 2 — a 1 é RLS no banco, a 3 é o
 * middleware; UI escondendo link é cosmético, não segurança.)
 */
export async function requireAcesso(modulo: Modulo): Promise<Sessao> {
  const sessao = await getSessao();
  if (!sessao) redirect("/login");
  if (!pode(sessao, modulo))
    redirect(`/sem-acesso?modulo=${encodeURIComponent(modulo)}`);
  return sessao;
}

/**
 * Guard de SERVER ACTION: lança em vez de redirecionar (action não deve
 * responder com redirect de permissão).
 */
export async function assertAcesso(modulo: Modulo): Promise<Sessao> {
  const sessao = await getSessao();
  if (!sessao || !pode(sessao, modulo)) {
    throw new Error("sem acesso");
  }
  return sessao;
}
