import { randomUUID } from 'node:crypto';
import { createBaileysAdapter } from './baileys-adapter.mjs';
import { generateDraft } from './drafts.mjs';
import {prepareMetaMedia} from './meta-media.mjs';

export async function commandResult(work) {
  try { return {estado:'enviado',...(await work())}; }
  catch(error) { return {estado:error?.beforeSend?'falhou':'incerto',erro:String(error?.message||'Operação interrompida.').slice(0,300)}; }
}

export class AccountRunner {
  constructor({account,runtimeId=randomUUID(),key,rpc,spool,inbox=null,media,adapterFactory=createBaileysAdapter,log=()=>{},draftProvider='codex',generate=generateDraft,heartbeatMs=15000}) {
    Object.assign(this,{account,runtimeId,key,rpc,spool,inbox,media,adapterFactory,log,draftProvider,generate,heartbeatMs});
    this.active=false;this.epoca=null;this.adapter=null;this.timer=null;this.ticking=false;this.renewing=null;
  }
  scope() { return {conta_id:this.account.id,runtime_id:this.runtimeId,epoca:this.epoca}; }
  async call(operation,data={}) { return this.rpc(operation,{...data,...this.scope()}); }
  async renew() {
    if(this.renewing) return this.renewing;
    this.renewing=(async()=>{
      const lease=await this.rpc('lease',{conta_id:this.account.id,runtime_id:this.runtimeId});
      if(!Number.isSafeInteger(lease?.epoca)||!lease.ate||Date.parse(lease.ate)<=Date.now()) throw new Error('Lease inválido ou expirado.');
      if(this.epoca!==null&&lease.epoca!==this.epoca) throw new Error('Lease transferido para outra instalação.');
      this.epoca=lease.epoca;this.leaseUntil=Date.parse(lease.ate);
    })();
    try { return await this.renewing; } finally { this.renewing=null; }
  }
  assertActive() {
    if(!this.active||Date.now()>=this.leaseUntil) throw Object.assign(new Error('Conta pausada: lease expirou.'),{beforeSend:true});
  }
  async start() {
    await this.renew(); this.active=true;
    try {
      this.adapter=await this.adapterFactory({account:this.account,key:this.key,inbox:this.inbox,rpc:(op,data)=>this.call(op,data),
        media:(method,data)=>this.media(method,this.scope(),data),scope:()=>this.scope(),
        emit:(op,data)=>this.emit(op,data),onFailure:(error)=>this.stop(error),
        authorize:async(command)=>{this.assertActive();return this.call('validar_comando',{comando_id:command.id});},
      });
      this.timer=setInterval(()=>{void this.renew().catch((error)=>this.stop(error));},this.heartbeatMs);
      this.timer.unref?.();
    } catch(error) { await this.stop(error);throw error; }
  }
  async emit(operation,data) {
    // Eventos de WhatsApp são primeiro duráveis localmente. Só removemos após o ACK SQL.
    await this.spool.push(this.account.id,{operacao:operation,dados:data});
    if(this.active) await this.spool.flush(this.account.id,(op,payload)=>this.call(op,payload));
  }
  async tick() {
    if(!this.active||this.ticking) return;
    this.ticking=true;
    try {
      await this.renew();
      await this.spool.flush(this.account.id,(op,payload)=>this.call(op,payload));
      await this.adapter.recover?.();
      const claimed=await this.call('claim');
      for(const command of claimed.comandos||[]) {
        this.assertActive();
        const checked=await this.call('validar_comando',{comando_id:command.id});
        const current=checked?.comando||checked;
        if(!current?.id) continue; // banco pode cancelar comando revogado, sem rede
        const result=await commandResult(async()=>{
          if(current.tipo==='draft') {
            try {
              const draft=await this.generate({provider:this.draftProvider,contexto:current.contexto});
              this.assertActive();
              await this.call('rascunho',{conversa_id:current.conversa_id,...draft});
              return {};
            } catch(error) { error.beforeSend=true;throw error; }
          }
          return this.adapter.execute(current);
        });
        await this.emit('resultado',{comando_id:current.id,...result});
        if(!this.active) break;
      }
    } catch(error) { await this.stop(error);throw error; }
    finally { this.ticking=false; }
  }
  async stop(error=null) {
    this.active=false;clearInterval(this.timer);this.timer=null;
    if(this.adapter) await this.adapter.close().catch(()=>{});
    if(error&&this.epoca!==null)await this.call('estado',{estado:'pausada',erro:'Conector pausado. Confira a conexão e a persistência da sessão.'}).catch(()=>{});
    if(error) this.log(`Conta ${this.account.id}: pausada. ${String(error.message||'Falha de conexão.').replace(/https?:\/\/\S+/g,'[origem de mídia]').slice(0,160)}`);
  }
}

export class MultiAccountRuntime {
  constructor({client,key,spool,media=client.media,...options}) {Object.assign(this,{client,key,spool,media,options});this.accounts=new Map();this.runtimeId=randomUUID();this.stopped=false;}
  async tick() {
    const {contas=[]}=await this.client.call('contas');
    if(contas.some(account=>account.provedor==='meta'))await prepareMetaMedia(this.client,this.runtimeId);
    const allowed=new Map(contas.filter((account)=>account.provedor==='baileys').map((account)=>[account.id,account]));
    for(const [id,runner] of this.accounts) if(!allowed.has(id)){await runner.stop();this.accounts.delete(id);}
    for(const [id,account] of allowed) {
      let runner=this.accounts.get(id);
      if(!runner?.active) {
        if(runner) await runner.stop();
        runner=new AccountRunner({account,runtimeId:this.runtimeId,key:this.key,rpc:this.client.call,spool:this.spool,media:this.media,...this.options});
        this.accounts.set(id,runner);
        try {await runner.start();}catch{continue;}
      }
      try {await runner.tick();}catch{/* próxima consulta fará nova aquisição explícita */}
    }
  }
  async stop() {this.stopped=true;await Promise.all([...this.accounts.values()].map((runner)=>runner.stop()));}
}
