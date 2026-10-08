/** Shape padrão de retorno das server actions (forms/useActionState). */
export type ActionResult = { ok: boolean; error?: string; info?: string };

export function actionError(message: string): ActionResult {
  return { ok: false, error: message };
}
