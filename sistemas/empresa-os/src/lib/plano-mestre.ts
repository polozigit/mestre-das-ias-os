import mestre from "../../config/planos/mestre.json";
import { textosDoPlano, type ModeloPlano } from "./plano-textos";

/**
 * Textos do plano do curso (config/planos/mestre.json) pela chave da tarefa. Só o servidor importa este
 * módulo: o JSON entra no bundle do servidor, nunca no do navegador. A regra de junção com o banco está
 * em plano-textos.ts; este arquivo existe separado porque o node --test não importa JSON sem atributo.
 */
export const TEXTOS_DO_PLANO = textosDoPlano(mestre as unknown as ModeloPlano);
