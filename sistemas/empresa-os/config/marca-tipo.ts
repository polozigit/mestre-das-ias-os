/** Formato de config/marca.ts. Este arquivo NÃO é gerado: muda só com o template. */
export type Marca = {
  /** true depois que a skill tecnologia-aplicar-marca aplicou a marca da empresa. */
  aplicada: boolean;
  /** Caminhos dentro de public/, começando por /marca/. Iguais = o mesmo logo nos dois temas. */
  logo: { fundoClaro: string; fundoEscuro: string };
  /** URL css2 do Google Fonts, ou null quando a fonte é do sistema. */
  fontesGoogle: string | null;
  /** Cor da barra do navegador (#RRGGBB maiúsculo) = --bg claro e --bg escuro do theme.css. */
  corDoNavegador: { claro: string; escuro: string };
};
