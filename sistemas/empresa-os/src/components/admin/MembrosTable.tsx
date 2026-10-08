"use client";

import { useState } from "react";
import { UserPlus, Users } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Empty } from "@/components/ui/Empty";
import { Pill } from "@/components/ui/Pill";
import { ResponsiveTable, type ResponsiveColumn } from "@/components/ui/ResponsiveTable";
import { formatarData } from "@/lib/format";
import { statusDoMembro, type ModuloCatalogo, type PermissaoCatalogo } from "@/app/(app)/usuarios/regras";
import { ConvidarMembroSheet } from "./ConvidarMembroSheet";
import { GerenciarMembroSheet } from "./GerenciarMembroSheet";

/** Linha da lista, como sai do SELECT da página (serializável). */
export type Membro = {
  id: string;
  nome: string;
  email: string;
  e_dono: boolean;
  permissoes: string[];
  ativo: boolean;
  auth_user_id: string | null;
  /** Derivado na página via Auth Admin API (last_sign_in_at) — não é coluna. */
  aceitou_convite: boolean;
  criado_em: string;
};

const COLUNAS: ResponsiveColumn<Membro>[] = [
  {
    key: "nome",
    header: "Nome",
    primary: true,
    render: (m) => <span className="font-medium text-fg-1">{m.nome}</span>,
  },
  {
    key: "email",
    header: "E-mail",
    render: (m) => <span className="text-fg-3">{m.email}</span>,
  },
  {
    key: "acesso",
    header: "Acesso",
    width: 140,
    render: (m) =>
      m.e_dono ? (
        <Pill tone="brand">Dono</Pill>
      ) : (
        <span className="text-fg-3">
          {m.permissoes.length === 0 ? "Só o início" : `${m.permissoes.length} permissões`}
        </span>
      ),
  },
  {
    key: "status",
    header: "Status",
    width: 170,
    render: (m) => {
      const status = statusDoMembro(m);
      return (
        <Pill tone={status.tone} dot>
          {status.label}
        </Pill>
      );
    },
  },
  {
    key: "desde",
    header: "Desde",
    width: 140,
    mobileHidden: true,
    render: (m) => <span className="text-fg-4">{formatarData(m.criado_em)}</span>,
  },
];

/**
 * Lista de pessoas + convite + gestão (permissões/acesso). Tocar numa linha abre
 * o painel da pessoa — funciona igual no desktop (painel lateral) e no
 * celular (bottom-sheet).
 */
export type GrupoPermissoes = { modulo: ModuloCatalogo; permissoes: PermissaoCatalogo[] };

export function MembrosTable({
  membros,
  grupos,
  sessaoUsuarioId,
  sessaoEDono,
}: {
  membros: Membro[];
  grupos: GrupoPermissoes[];
  sessaoUsuarioId: string;
  sessaoEDono: boolean;
}) {
  const [convidarAberto, setConvidarAberto] = useState(false);
  const [selecionado, setSelecionado] = useState<Membro | null>(null);

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>
            Pessoas{" "}
            <span className="text-sm font-normal text-fg-4">({membros.length})</span>
          </CardTitle>
          <Button variant="primary" onClick={() => setConvidarAberto(true)}>
            <UserPlus size={16} />
            Convidar pessoa
          </Button>
        </CardHeader>
        <ResponsiveTable
          columns={COLUNAS}
          data={membros}
          getRowKey={(m) => m.id}
          onRowClick={setSelecionado}
          rowClassName={(m) => (m.ativo ? undefined : "opacity-60")}
          empty={
            <Empty
              icon={Users}
              title="Ninguém por aqui ainda"
              description="Convide as pessoas da sua empresa pelo botão acima."
            />
          }
        />
      </Card>

      <ConvidarMembroSheet
        open={convidarAberto}
        onClose={() => setConvidarAberto(false)}
      />
      <GerenciarMembroSheet
        membro={selecionado}
        grupos={grupos}
        sessaoUsuarioId={sessaoUsuarioId}
        sessaoEDono={sessaoEDono}
        onClose={() => setSelecionado(null)}
      />
    </>
  );
}
