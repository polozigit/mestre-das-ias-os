/**
 * Copiar texto pra área de transferência (botão "Copiar" do texto pronto pra colar na IA).
 * A lógica e os textos do botão vivem aqui, separados do componente, pra rodar no node --test
 * com ambientes falsos.
 */

/** Estados do botão: parado, deu certo, o navegador recusou. */
export type EstadoDaCopia = "parado" | "copiado" | "falhou";

/** O que o botão diz em cada estado. */
export const ROTULO_DO_BOTAO: Record<EstadoDaCopia, string> = {
  parado: "Copiar",
  copiado: "Copiado",
  falhou: "Não consegui copiar",
};

/** O que o leitor de tela anuncia em cada estado (parado não anuncia nada). */
export const AVISO_DO_BOTAO: Record<EstadoDaCopia, string> = {
  parado: "",
  copiado: "Texto copiado",
  falhou: "Não foi possível copiar. Selecione o texto e copie.",
};

/** Quanto tempo o aviso "Copiado" fica na tela antes de o botão voltar a dizer "Copiar". */
export const MS_DO_AVISO_DE_COPIA = 2000;
export type AmbienteDeCopia = {
  /** API moderna (`navigator.clipboard`); só existe em página segura (https ou localhost). */
  clipboard?: { writeText(texto: string): Promise<void> } | null;
  /** Plano B quando a API moderna não existe ou o navegador recusa: seleciona o texto e copia. */
  copiarPorSelecao?: ((texto: string) => boolean) | null;
};

/** Devolve `true` se o texto foi pra área de transferência. Nunca lança: falha vira `false`. */
export async function copiarTexto(texto: string, ambiente: AmbienteDeCopia = ambienteDoNavegador()): Promise<boolean> {
  if (ambiente.clipboard) {
    try {
      await ambiente.clipboard.writeText(texto);
      return true;
    } catch {
      /* permissão negada ou página sem https: tenta o plano B */
    }
  }
  if (ambiente.copiarPorSelecao) {
    try {
      return ambiente.copiarPorSelecao(texto);
    } catch {
      return false;
    }
  }
  return false;
}

function copiarPorSelecaoNoDocumento(texto: string): boolean {
  const area = document.createElement("textarea");
  area.value = texto;
  area.setAttribute("readonly", "");
  area.style.position = "fixed";
  area.style.top = "0";
  area.style.opacity = "0";
  document.body.appendChild(area);
  try {
    area.select();
    return document.execCommand("copy");
  } finally {
    document.body.removeChild(area);
  }
}

function ambienteDoNavegador(): AmbienteDeCopia {
  return {
    clipboard: typeof navigator !== "undefined" ? (navigator.clipboard ?? null) : null,
    copiarPorSelecao: typeof document !== "undefined" ? copiarPorSelecaoNoDocumento : null,
  };
}
