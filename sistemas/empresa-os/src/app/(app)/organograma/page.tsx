import { Network } from "lucide-react";
import { Empty } from "@/components/ui/Empty";
import { createClient } from "@/lib/supabase/server";
import { getOcupacao, getOrganograma } from "@/lib/organograma/consultas";
import { OrganogramaView } from "./_components/OrganogramaView";

export const dynamic = "force-dynamic";

function dataCarga(iso: string | undefined): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function OrganogramaPage() {
  const c = await createClient();
  const [{ nos, raias, passos, ondas, apqc, carga, documentos }, ocupacao] = await Promise.all([
    getOrganograma(c),
    getOcupacao(c),
  ]);

  return (
    <div className="flex flex-col gap-6 pb-24">
      <header>
        <p className="eyebrow mb-2">Empresa</p>
        <h1 className="h2 mb-2">Organograma de referência</h1>
        <p className="max-w-2xl text-sm text-fg-3">
          O time completo de uma empresa de referência de aproximadamente 200 pessoas, com todos os cargos
          sênior. Cada cargo mostra quem o ocupa hoje: pessoa, agente ou vaga aberta.
          {carga?.carregado_em && <> Atualizado em {dataCarga(carga.carregado_em)}.</>}
        </p>
      </header>

      {nos.length === 0 ? (
        <Empty
          icon={Network}
          title="O organograma ainda não foi carregado"
          description="Rode `node scripts/setup-inicial.mjs` na pasta do projeto para carregar o organograma de referência e depois recarregue esta página."
        />
      ) : (
        <>
          <OrganogramaView
            nos={nos}
            raias={raias}
            passos={passos}
            ondas={ondas}
            apqc={apqc}
            documentos={documentos}
            ocupacao={ocupacao}
          />
          <footer className="border-t border-borda-suave pt-4 text-xs text-fg-3">
            <h2 className="!font-sans !text-[13px] !font-semibold !text-fg-1 !mb-1">De onde vêm os códigos APQC</h2>
            <p className="max-w-[110ch]">
              A APQC mantém o Process Classification Framework (PCF), um catálogo padrão de processos de
              empresa usado como referência de mercado; aqui usamos a versão 7.4 (2024), numerada em árvore
              (por exemplo 7.1.2.9). O código serve pra provar que o processo existe no catálogo e pra
              comparar o mesmo processo entre empresas diferentes; os nomes em português são tradução nossa.
            </p>
          </footer>
        </>
      )}
    </div>
  );
}
