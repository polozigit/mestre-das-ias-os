export type DadosRPC = Record<string, unknown>;
export type TransporteRPC = (nome: string, parametros: { p_operacao: string; p_dados: DadosRPC }) => PromiseLike<{ data: unknown; error: { message: string } | null }>;

/** O JWT do operador vai no cliente; quem autoriza cada operação é a RPC. */
export function criarApi(transporte: TransporteRPC) {
  return async function executar<T>(operacao: string, dados: DadosRPC = {}): Promise<T> {
    const resultado = await transporte("mensageria_api", { p_operacao: operacao, p_dados: dados });
    if (resultado.error) throw new Error(resultado.error.message);
    if (resultado.data === null || resultado.data === undefined) throw new Error("O banco não confirmou a operação. Atualize a conversa antes de tentar novamente.");
    return resultado.data as T;
  };
}
