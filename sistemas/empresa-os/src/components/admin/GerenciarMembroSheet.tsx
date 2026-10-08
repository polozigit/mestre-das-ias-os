"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Pill } from "@/components/ui/Pill";
import {
  SheetGrabber,
  sheetBackdropClasses,
  sheetPanelClasses,
} from "@/components/ui/Sheet";
import { formatarData } from "@/lib/format";
import { salvarPermissoes, alternarAtivo } from "@/app/(app)/usuarios/actions";
import { podeEditarUsuario, statusDoMembro } from "@/app/(app)/usuarios/regras";
import type { GrupoPermissoes, Membro } from "./MembrosTable";

const ROTULO_ACAO: Record<string, string> = { read: "Ver", write: "Editar", manage: "Gerir" };

/**
 * Painel de uma pessoa: permissões por módulo (checkbox por slug) e
 * desativar/reativar acesso. A server action revalida tudo (o dono não é
 * editado, `usuarios.manage` é do dono, módulo desligado não concede); aqui a
 * UI só esconde o que não faz sentido oferecer.
 */
export function GerenciarMembroSheet({
  membro,
  grupos,
  sessaoUsuarioId,
  sessaoEDono,
  onClose,
}: {
  /** null = fechado. O último membro fica em cache pra transição de saída. */
  membro: Membro | null;
  grupos: GrupoPermissoes[];
  sessaoUsuarioId: string;
  sessaoEDono: boolean;
  onClose: () => void;
}) {
  const tituloId = useId();
  const panelRef = useRef<HTMLElement>(null);
  const open = membro !== null;

  // Cache do membro exibido (ajuste de estado durante o render, padrão React):
  // ao fechar, membro vira null mas o painel ainda desliza — sem o cache o
  // conteúdo sumiria no meio da animação.
  const [exibido, setExibido] = useState<Membro | null>(membro);
  const [marcadas, setMarcadas] = useState<string[]>(membro?.permissoes ?? []);
  const [erro, setErro] = useState<string | null>(null);
  if (membro && membro !== exibido) {
    setExibido(membro);
    setMarcadas(membro.permissoes);
    setErro(null); // erro é do membro anterior — não pode vazar pro próximo
  }

  const [pendente, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // A11y de dialog: ao abrir, o foco entra no painel (tabIndex -1); ao fechar,
  // volta pra quem estava focado antes (a linha/botão que abriu o sheet).
  useEffect(() => {
    if (!open) return;
    const origem = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    panelRef.current?.focus();
    return () => origem?.focus();
  }, [open]);

  function alternarSlug(slug: string) {
    setMarcadas((atual) => (atual.includes(slug) ? atual.filter((x) => x !== slug) : [...atual, slug]));
  }

  function salvar() {
    if (!exibido) return;
    setErro(null);
    startTransition(async () => {
      const res = await salvarPermissoes(exibido.id, marcadas);
      if (res.ok) onClose();
      else setErro(res.error ?? "Não deu pra salvar as permissões.");
    });
  }

  function alternarAcesso() {
    if (!exibido) return;
    setErro(null);
    startTransition(async () => {
      const res = await alternarAtivo(exibido.id, !exibido.ativo);
      if (res.ok) onClose();
      else setErro(res.error ?? "Não deu pra atualizar o acesso.");
    });
  }

  const ehDono = exibido?.e_dono === true;
  const editavel = exibido ? podeEditarUsuario(exibido, { eDono: sessaoEDono }) : false;
  const mudou =
    exibido !== null &&
    (marcadas.length !== exibido.permissoes.length || marcadas.some((s) => !exibido.permissoes.includes(s)));
  const ehVoceMesmo = exibido?.id === sessaoUsuarioId;
  const status = exibido ? statusDoMembro(exibido) : null;

  return (
    <>
      <div className={sheetBackdropClasses(open)} onClick={onClose} aria-hidden="true" />
      <aside
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={tituloId}
        aria-hidden={!open}
        inert={!open}
        tabIndex={-1}
        className={`${sheetPanelClasses(open)} outline-none`}
      >
        <SheetGrabber />
        <header className="flex items-center justify-between border-b border-borda-suave px-5 py-4">
          <h2 id={tituloId} className="font-display text-lg font-bold text-fg-1">
            {exibido?.nome ?? "Pessoa"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="grid size-11 place-items-center rounded-md text-fg-3 hover:bg-bg-sutil md:size-9"
          >
            <X size={18} />
          </button>
        </header>

        {exibido && (
          <div className="flex flex-col gap-6 px-5 py-5">
            <div className="space-y-2 text-sm">
              <p className="text-fg-3">{exibido.email}</p>
              <div className="flex flex-wrap items-center gap-2">
                {ehDono && <Pill tone="brand">Dono</Pill>}
                {status && (
                  <Pill tone={status.tone} dot>
                    {status.label}
                  </Pill>
                )}
              </div>
              <p className="text-xs text-fg-4">
                No sistema desde {formatarData(exibido.criado_em)}
              </p>
            </div>

            {ehDono || !editavel ? (
              <p className="rounded-md bg-bg-sutil px-3 py-2.5 text-sm text-fg-3">
                Este é o dono da empresa. Ele já tem todas as permissões e o
                acesso dele não pode ser desativado.
              </p>
            ) : (
              <>
                <div>
                  <p className="mb-1 text-sm font-medium text-fg-2">Permissões</p>
                  <p className="mb-3 text-xs text-fg-3">
                    Sem nenhuma marcada, a pessoa só enxerga o Início.
                  </p>
                  {grupos.length === 0 ? (
                    <p className="text-sm text-fg-3">Nenhum módulo ligado tem permissão para dar.</p>
                  ) : (
                    <div className="space-y-4">
                      {grupos.map((g) => (
                        <fieldset key={g.modulo.slug}>
                          <legend className="mb-1 text-sm font-semibold text-fg-1">{g.modulo.nome}</legend>
                          <div className="space-y-1">
                            {g.permissoes.map((p) => (
                              <label
                                key={p.slug}
                                className="flex min-h-11 cursor-pointer items-start gap-3 rounded-md px-2 py-2 hover:bg-bg-sutil md:min-h-0"
                              >
                                <input
                                  type="checkbox"
                                  checked={marcadas.includes(p.slug)}
                                  onChange={() => alternarSlug(p.slug)}
                                  className="mt-0.5 size-4 accent-acento"
                                />
                                <span className="text-sm">
                                  <span className="font-medium text-fg-1">{ROTULO_ACAO[p.acao] ?? p.acao}</span>
                                  {p.descricao && <span className="block text-xs text-fg-3">{p.descricao}</span>}
                                </span>
                              </label>
                            ))}
                          </div>
                        </fieldset>
                      ))}
                    </div>
                  )}
                  <Button
                    variant="primary"
                    size="sm"
                    className="mt-3 min-h-11 md:min-h-0"
                    onClick={salvar}
                    disabled={pendente || !mudou}
                  >
                    {pendente ? "Salvando..." : "Salvar permissões"}
                  </Button>
                </div>

                <div className="border-t border-borda-suave pt-4">
                  <p className="mb-2 text-sm font-medium text-fg-2">Acesso</p>
                  {ehVoceMesmo && exibido.ativo ? (
                    <p className="text-sm text-fg-3">Você não pode desativar o seu próprio acesso.</p>
                  ) : (
                    <>
                      <p className="mb-2 text-xs text-fg-3">
                        {exibido.ativo
                          ? "Desativar tira o acesso sem apagar o histórico da pessoa."
                          : "Reativar devolve o acesso com as mesmas permissões."}
                      </p>
                      <Button
                        variant={exibido.ativo ? "danger" : "secondary"}
                        size="sm"
                        className="min-h-11 md:min-h-0"
                        onClick={alternarAcesso}
                        disabled={pendente}
                      >
                        {pendente ? "Aguarde..." : exibido.ativo ? "Desativar acesso" : "Reativar acesso"}
                      </Button>
                    </>
                  )}
                </div>
              </>
            )}

            {erro && (
              <p className="rounded-md bg-erro-suave px-3 py-2 text-sm text-erro">{erro}</p>
            )}
          </div>
        )}
      </aside>
    </>
  );
}
