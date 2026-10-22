"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { criarApi, type DadosRPC, type TransporteRPC } from "./api";
import { mensagemErro } from "./modelo";
import type { Painel } from "./tipos";
import type {Mensagem} from './tipos';
import type {MudancaMensagem} from './thread-state';

export function useMensageria(despachoAutomatico=false) {
  const client = useMemo(() => createClient(), []);
  const api = useMemo(() => criarApi(client.rpc.bind(client) as unknown as TransporteRPC), [client]);
  const [painel, setPainel] = useState<Painel | null>(null);
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [mudanca,setMudanca]=useState<MudancaMensagem|null>(null);
  const active = useRef(true);
  const loading = useRef(false);
  const lastDispatch = useRef(new Map<string, number>());

  const atualizar = useCallback(async () => {
    if (loading.current) return;
    loading.current = true;
    try {
      const result = await api<Painel>("painel");
      if (!Array.isArray(result.contas) || !Array.isArray(result.conversas)) throw new Error("Resposta incompatível da caixa de atendimento. Confira a versão instalada.");
      if (active.current) { setPainel(result); setErro(""); }
      for (const conta of result.contas) {
        if(!despachoAutomatico)continue;
        if (conta.provedor !== "meta" || Date.now() - (lastDispatch.current.get(conta.id) || 0) < 30_000) continue;
        lastDispatch.current.set(conta.id, Date.now());
        // O resultado efetivo continua vindo do banco; este request só acorda o dispatcher.
        void fetch("/api/mensageria/dispatch", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({conta_id:conta.id}) }).catch(() => {});
      }
    } catch (e) { if (active.current) setErro(mensagemErro(e)); }
    finally { loading.current = false; if (active.current) setCarregando(false); }
  }, [api,despachoAutomatico]);

  useEffect(() => {
    active.current = true;
    const first = setTimeout(() => void atualizar(), 0);
    const timer = setInterval(() => { if (document.visibilityState === "visible") void atualizar(); }, 6_000);
    const channel = client.channel("mensageria-caixa")
      .on("postgres_changes", {event:"*",schema:"mensageria",table:"mensagem"}, payload => {
        if(payload.eventType==='DELETE'&&typeof payload.old.id==='string')setMudanca({tipo:'DELETE',id:payload.old.id});
        else if(payload.eventType!=='DELETE'&&typeof payload.new.id==='string'&&typeof payload.new.conversa_id==='string')setMudanca({tipo:payload.eventType,mensagem:payload.new as Mensagem});
        void atualizar();
      })
      .on("postgres_changes", {event:"*",schema:"mensageria",table:"conversa"}, () => void atualizar())
      .on("postgres_changes", {event:"*",schema:"mensageria",table:"conta"}, () => void atualizar())
      .subscribe();
    const focus = () => void atualizar();
    window.addEventListener("focus", focus);
    return () => { active.current=false; clearTimeout(first); clearInterval(timer); window.removeEventListener("focus",focus); void client.removeChannel(channel); };
  }, [atualizar, client]);

  const executar = useCallback(async <T,>(operacao: string, dados: DadosRPC = {}) => {
    const response = await api<T>(operacao, dados);
    await atualizar();
    return response;
  }, [api, atualizar]);
  return { painel, erro, carregando, atualizar, executar, api, mudanca };
}
