import { KeyRound } from "lucide-react";
import { BotaoCopiar } from "@/components/cronograma/BotaoCopiar";

/**
 * Texto pronto pra quem administra mandar pra pessoa (WhatsApp, por exemplo):
 * endereço, e-mail e senha provisória. Só aparece depois de a server action
 * passar na checagem de permissão; nada disso fica gravado.
 */
export function MensagemDeAcesso({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <div className="space-y-3" role="status">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-md bg-ok-suave text-ok">
          <KeyRound size={16} aria-hidden />
        </span>
        <div>
          <p className="text-sm font-semibold text-fg-1">{titulo}</p>
          <p className="mt-0.5 text-sm text-fg-3">
            Copie a mensagem abaixo e mande pra pessoa. Ela não recebe nada por e-mail.
          </p>
        </div>
      </div>
      <pre className="whitespace-pre-wrap break-words rounded-md border border-borda bg-bg-sutil px-3 py-3 font-sans text-sm leading-relaxed text-fg-1">
        {texto}
      </pre>
      <BotaoCopiar texto={texto} />
    </div>
  );
}
