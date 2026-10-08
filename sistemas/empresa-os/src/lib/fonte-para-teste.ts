import { readFileSync } from "node:fs";

/**
 * SÓ PARA OS TESTES de fiação das telas (o node --test não lê JSX, então a regra de cada tela é conferida
 * no código-fonte). Nenhum código do sistema importa este arquivo.
 *
 * Tira os comentários antes de conferir: a regra tem que estar no CÓDIGO, não numa frase de comentário que
 * só fala dela. Sem isso, um teste do tipo "tem o texto X" continua verde mesmo depois de o texto sumir da
 * tela, porque o comentário ao lado ainda cita X (foi exatamente o que a mutação pegou).
 */
export function semComentarios(fonte: string): string {
  return fonte
    .replace(/\/\*[\s\S]*?\*\//g, "") // bloco e {/* JSX */}
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1"); // linha, sem comer o "//" de https://
}

/** Lê o arquivo-fonte (a partir de `new URL(caminho, import.meta.url)`) já sem comentários. */
export function lerFonte(url: URL): string {
  return semComentarios(readFileSync(url, "utf8"));
}
