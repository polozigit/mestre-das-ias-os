import {
  Activity, Bot, CalendarRange, GraduationCap, Home, KanbanSquare, Network, Palette, Settings, Users,
  type LucideIcon,
} from "lucide-react";
import type { Modulo } from "@/lib/auth/permissoes";
import type { GrupoTarefas } from "@/lib/tarefas/grupos";

/**
 * Fonte ÚNICA da navegação (sidebar no desktop, gaveta no celular).
 * Módulo novo = 1 item aqui + rota + entrada em PERMISSAO_MODULO/MODULO_ROTA.
 *
 * O menu é agrupado por diretoria da empresa. O primeiro grupo não tem título (só o Início).
 * Todo item continua filtrado pela permissão do módulo (`filtrarNav`): esconder link é cosmético,
 * a defesa de verdade é a RLS no banco e o guard de cada página.
 */
export type NavItem = {
  /** Pode levar query: "/tarefas?trilha=curso". */
  href: string;
  label: string;
  modulo: Modulo;
  icone: LucideIcon;
  /**
   * Presente nos dois itens que dividem a página /tarefas ("Tarefas do curso" e "Tarefas"):
   * eles só acendem quando a lista aberta é a do próprio grupo (ver `itemAtivo`).
   */
  grupoTarefas?: GrupoTarefas;
};
export type NavGrupo = { id: string; titulo: string | null; itens: NavItem[] };

export const NAV_GRUPOS: NavGrupo[] = [
  {
    id: "inicio",
    titulo: null,
    itens: [{ href: "/inicio", label: "Início", modulo: "inicio", icone: Home }],
  },
  {
    id: "mestre-das-ias",
    titulo: "Mestre das IAs",
    itens: [
      { href: "/cronograma", label: "Cronograma", modulo: "cronograma", icone: CalendarRange },
      {
        href: "/tarefas?trilha=curso",
        label: "Tarefas do curso",
        modulo: "tarefas",
        icone: GraduationCap,
        grupoTarefas: "curso",
      },
    ],
  },
  {
    id: "gestao",
    titulo: "Gestão",
    itens: [
      { href: "/tarefas", label: "Tarefas", modulo: "tarefas", icone: KanbanSquare, grupoTarefas: "trabalho" },
      { href: "/organograma", label: "Organograma", modulo: "organograma", icone: Network },
    ],
  },
  {
    id: "marketing",
    titulo: "Marketing",
    itens: [{ href: "/marca", label: "Marca", modulo: "marca", icone: Palette }],
  },
  {
    id: "tecnologia",
    titulo: "Tecnologia",
    itens: [
      { href: "/agentes", label: "Agentes e skills", modulo: "agentes", icone: Bot },
      { href: "/atividade", label: "Atividade", modulo: "atividade", icone: Activity },
      { href: "/usuarios", label: "Usuários", modulo: "usuarios", icone: Users },
      { href: "/configuracoes", label: "Configurações", modulo: "configuracoes", icone: Settings },
    ],
  },
];

/** Remove item sem permissão e grupo que ficou vazio. */
export function filtrarNav(grupos: NavGrupo[], podeFn: (m: Modulo) => boolean): NavGrupo[] {
  return grupos
    .map((g) => ({ ...g, itens: g.itens.filter((i) => podeFn(i.modulo)) }))
    .filter((g) => g.itens.length > 0);
}

/** Caminho do item sem a query: "/tarefas?trilha=curso" vira "/tarefas". */
export function caminhoDoItem(item: Pick<NavItem, "href">): string {
  return item.href.split("?")[0];
}

/**
 * O item está aceso? Pelo CAMINHO (a página aberta é a do item ou uma subpágina dela) e, nos dois
 * itens de tarefas, TAMBÉM pela query `trilha`: `grupoAberto` é o grupo que a URL atual pede
 * (`grupoDaBusca(?trilha=)`). Assim "Tarefas" e "Tarefas do curso" nunca acendem juntos, nem no
 * detalhe de uma tarefa (o link do detalhe leva a trilha, ver `hrefTarefa`).
 */
export function itemAtivo(
  item: Pick<NavItem, "href" | "grupoTarefas">,
  pathname: string,
  grupoAberto: GrupoTarefas,
): boolean {
  const rota = caminhoDoItem(item);
  const noCaminho = pathname === rota || pathname.startsWith(`${rota}/`);
  if (!noCaminho) return false;
  return item.grupoTarefas === undefined || item.grupoTarefas === grupoAberto;
}
