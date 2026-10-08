import { requireAcesso } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { EmpresaForm } from "@/components/admin/EmpresaForm";
import { nomeSistema } from "../../../../config/empresa";

/** Versão do template (acompanha package.json — as duas viajam juntas no release). */
const VERSAO_TEMPLATE = "1.0.0";

/** Amostras de cor do tema ativo — só tokens, nunca cor literal. */
const SWATCHES: { classe: string; label: string }[] = [
  { classe: "bg-acento", label: "Marca" },
  { classe: "bg-ok", label: "Ok" },
  { classe: "bg-alerta", label: "Alerta" },
  { classe: "bg-erro", label: "Erro" },
];

/**
 * Configurações — dados da empresa (o dono, ou quem tem `configuracoes.write`, edita; com só `configuracoes.read` a tela é de leitura), prévia do
 * tema e informações do sistema.
 */
export default async function ConfiguracoesPage() {
  const sessao = await requireAcesso("configuracoes");
  const podeEditar = sessao.eDono || sessao.permissoes.includes("configuracoes.write");

  const supabase = await createClient();
  const { data: org, error } = await supabase
    .from("empresa")
    .select("nome, descricao")
    .eq("id", 1)
    .maybeSingle();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-fg-1">Configurações</h1>
        <p className="mt-1 text-sm text-fg-3">
          Dados da empresa, aparência do sistema e informações da instalação.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Dados da empresa</CardTitle>
          {!podeEditar && <Pill tone="neutral">Somente leitura</Pill>}
        </CardHeader>
        <CardBody>
          {error || !org ? (
            <p className="text-sm text-erro">
              Não deu pra carregar os dados da empresa agora.
              {error ? ` (${error.message})` : ""}
            </p>
          ) : podeEditar ? (
            <EmpresaForm nome={org.nome} descricao={org.descricao} />
          ) : (
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="font-medium text-fg-3">Nome</dt>
                <dd className="text-fg-1">{org.nome}</dd>
              </div>
              <div>
                <dt className="font-medium text-fg-3">Descrição</dt>
                <dd className="text-fg-1">{org.descricao ?? "Sem descrição."}</dd>
              </div>
              <p className="text-xs text-fg-4">
                Só quem tem a permissão de editar as configurações muda estes dados.
              </p>
            </dl>
          )}
          <p className="mt-4 border-t border-borda-suave pt-3 text-xs text-fg-4">
            Nome do sistema: <span className="font-medium text-fg-3">{nomeSistema}</span>{" "}
            (vem do arquivo de identidade da instalação, não do banco).
          </p>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Aparência</CardTitle>
        </CardHeader>
        <CardBody className="space-y-5">
          <div>
            <p className="mb-2 text-sm font-medium text-fg-2">Cores do tema</p>
            <div className="flex flex-wrap gap-4">
              {SWATCHES.map((s) => (
                <div key={s.label} className="flex items-center gap-2">
                  <span
                    aria-hidden="true"
                    className={`size-8 rounded-md border border-borda-suave ${s.classe}`}
                  />
                  <span className="text-sm text-fg-2">{s.label}</span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-2 text-sm font-medium text-fg-2">Tipografia</p>
            <p className="font-display text-xl font-bold text-fg-1">
              Aa — Títulos do sistema
            </p>
            <p className="text-sm text-fg-2">
              Aa — Texto corrido, como este parágrafo de amostra.
            </p>
          </div>

          <p className="rounded-md bg-bg-sutil px-3 py-2.5 text-sm text-fg-3">
            Pra mudar a marca (cores, fonte), peça pra IA editar o arquivo{" "}
            <code className="text-fg-2">src/app/theme.css</code> — o passo a passo
            está no DESIGN.md do sistema. Nenhuma tela usa cor fixa: trocou o
            tema, trocou tudo.
          </p>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Sistema</CardTitle>
        </CardHeader>
        <CardBody>
          <dl className="space-y-3 text-sm">
            <div className="flex items-center justify-between gap-3">
              <dt className="font-medium text-fg-3">Versão do template</dt>
              <dd>
                <Pill tone="brand">{VERSAO_TEMPLATE}</Pill>
              </dd>
            </div>
            <div>
              <dt className="font-medium text-fg-3">Repositório da empresa</dt>
              <dd className="text-fg-2">
                O código deste sistema vive no repositório criado na instalação —
                o endereço está no LEIA-ME.md do projeto.
              </dd>
            </div>
            <div>
              <dt className="font-medium text-fg-3">Módulos novos</dt>
              <dd className="text-fg-2">
                Telas e módulos novos chegam pelo time de sistema (as IAs abrem a
                mudança e você aprova) — nada é instalado por aqui.
              </dd>
            </div>
          </dl>
        </CardBody>
      </Card>
    </div>
  );
}
