import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { blocosDaAtividade, type TextosAtividade } from "@/lib/plano-textos";
import { BotaoCopiar } from "./BotaoCopiar";

const ROTULO = "text-[10px] font-bold uppercase tracking-wider text-fg-4";

/**
 * O "Como fazer" de uma atividade: o que fazer, por que importa, passo a passo, o texto pronto pra
 * colar na IA (com botão Copiar) e como saber que ficou pronto. Cada bloco só aparece se a atividade
 * trouxer o campo. Usado no detalhe da tarefa e, recolhível, no Cronograma.
 */
export function ComoFazer({ textos, className }: { textos: TextosAtividade; className?: string }) {
  const blocos = blocosDaAtividade(textos);
  if (blocos.length === 0) return null;
  return (
    <div className={cn("min-w-0 space-y-4", className)}>
      {blocos.map((bloco) => {
        switch (bloco.tipo) {
          case "instrucao":
            return (
              <p key={bloco.tipo} className="whitespace-pre-wrap break-words text-sm text-fg-2">
                {bloco.texto}
              </p>
            );
          case "passos":
            return (
              <div key={bloco.tipo}>
                <p className={ROTULO}>{bloco.titulo}</p>
                <ol className="mt-1 list-decimal space-y-1 pl-5 text-sm text-fg-2">
                  {bloco.itens.map((passo, i) => (
                    <li key={i} className="break-words pl-1">
                      {passo}
                    </li>
                  ))}
                </ol>
              </div>
            );
          case "comando":
            return (
              <div key={bloco.tipo} className="min-w-0">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className={ROTULO}>{bloco.titulo}</p>
                  <BotaoCopiar texto={bloco.texto} />
                </div>
                <pre className="mt-1 max-w-full overflow-x-auto whitespace-pre-wrap break-words rounded-md border border-borda bg-bg-sutil p-3 font-mono text-xs text-fg-1">
                  <code>{bloco.texto}</code>
                </pre>
              </div>
            );
          default:
            return (
              <div key={bloco.tipo}>
                <p className={ROTULO}>{bloco.titulo}</p>
                <p className="mt-1 whitespace-pre-wrap break-words text-sm text-fg-2">{bloco.texto}</p>
              </div>
            );
        }
      })}
    </div>
  );
}

/**
 * O mesmo "Como fazer" dentro de um recolhível, pra listar o passo sem ocupar a tela toda.
 * `aberto` abre já na tela (usado no próximo passo do aluno). Sem nenhum texto, não desenha nada.
 */
export function ComoFazerRecolhivel({
  textos,
  aberto = false,
  className,
}: {
  textos: TextosAtividade;
  aberto?: boolean;
  className?: string;
}) {
  if (blocosDaAtividade(textos).length === 0) return null;
  return (
    <details open={aberto} className={cn("group min-w-0", className)}>
      <summary className="flex min-h-11 w-fit cursor-pointer list-none items-center gap-1.5 text-xs font-semibold text-acento-texto md:min-h-8 [&::-webkit-details-marker]:hidden">
        <ChevronRight size={14} aria-hidden className="shrink-0 transition-transform group-open:rotate-90" />
        Como fazer
      </summary>
      <ComoFazer textos={textos} className="pb-3 pt-1" />
    </details>
  );
}
