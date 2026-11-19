/**
 * Clique que vai virar troca de página DENTRO do sistema? É o que liga o fio de progresso do topo
 * (components/shell/NavegacaoProgresso.tsx). Função pura: recebe só os dados do clique e do link.
 *
 * Não liga o fio: clique com tecla (abre em outra aba), botão que não é o principal, link pra fora,
 * link de download ou com `target`, e link pro mesmo endereço em que a pessoa já está (a página não
 * troca, então o fio nunca receberia o aviso de chegada).
 */
export type CliqueEmLink = {
  /** Endereço completo do link (`a.href`, já resolvido pelo navegador). */
  href: string;
  /** Endereço completo da página atual (`location.href`). */
  atual: string;
  target?: string | null;
  download?: boolean;
  botao?: number;
  comTecla?: boolean;
  jaTratado?: boolean;
};

export function iniciaNavegacaoInterna(c: CliqueEmLink): boolean {
  if (c.jaTratado || c.comTecla || (c.botao ?? 0) !== 0) return false;
  if (c.download || (c.target && c.target !== "_self")) return false;
  let destino: URL;
  let agora: URL;
  try {
    destino = new URL(c.href);
    agora = new URL(c.atual);
  } catch {
    return false;
  }
  if (destino.origin !== agora.origin) return false;
  // Só a âncora mudou (ou nada mudou): a página é a mesma.
  return destino.pathname !== agora.pathname || destino.search !== agora.search;
}
