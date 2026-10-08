/**
 * Identidade da empresa — ÚNICO arquivo de dados que a IA edita na instalação
 * (junto com src/app/theme.css e public/marca/logo.svg — ver LEIA-ME.md).
 * Os {{PLACEHOLDERS}} são preenchidos na Etapa "aplicar marca"; um teste do CI
 * acusa placeholder esquecido.
 */
export const empresa = {
  /** Nome da empresa, como aparece para as pessoas. Ex.: "Clima Sul" */
  nome: "{{NOME_EMPRESA}}",
  /** Identificador técnico: minúsculas, números e hífen. Ex.: "clima-sul" */
  slug: "{{SLUG}}",
  /** Uma frase sobre a empresa (aparece em Configurações). */
  descricao: "{{DESCRICAO_CURTA}}",
  /** Dono da empresa — vira o usuário master no seed. */
  nomeMaster: "{{NOME_DO_DONO}}",
  emailMaster: "{{EMAIL_DO_DONO}}",
  /** Caminho do logo dentro de public/. */
  logo: "/marca/logo.svg",
} as const;

/** Antes da etapa "aplicar marca" o campo ainda tem {{placeholder}}: a tela mostra o padrão. */
const semMarca = (valor: string) => valor.includes("{{") || valor.trim() === "";

/** Nome do sistema: nome da empresa + sufixo OS (decisão do curso); "Empresa OS" até aplicar a marca. */
export function nomeDoSistema(nome: string): string {
  return semMarca(nome) ? "Empresa OS" : `${nome} OS`;
}

/** Frase da empresa; padrão neutro até aplicar a marca. */
export function descricaoDoSistema(descricao: string): string {
  return semMarca(descricao) ? "Sistema da empresa com time de IA" : descricao;
}

export const nomeSistema = nomeDoSistema(empresa.nome);
export const descricaoSistema = descricaoDoSistema(empresa.descricao);
