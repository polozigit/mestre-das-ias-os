
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "organograma": {
          Tables: {
            "apqc_pcf": {
                  Row: {
                    "codigo": string,"nome_en": string | null,"nome_pt": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "codigo": string,"nome_en"?: string | null,"nome_pt"?: string | null
                  }
                  Update: {
                    "codigo"?: string,"nome_en"?: string | null,"nome_pt"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"inbox": {
                  Row: {
                    "erro": string | null,"evento_id": string,"id": number,"origem": string,"processada_em": string | null,"recebida_em": string,"tentativas": number,"tipo": string
                  }
                  ComputedFields: never
                  Insert: {
                    "erro"?: string | null,"evento_id": string,"id"?: never,"origem": string,"processada_em"?: string | null,"recebida_em"?: string,"tentativas"?: number,"tipo": string
                  }
                  Update: {
                    "erro"?: string | null,"evento_id"?: string,"id"?: never,"origem"?: string,"processada_em"?: string | null,"recebida_em"?: string,"tentativas"?: number,"tipo"?: string
                  }
                  Relationships: [
                    
                  ]
                },"org_area": {
                  Row: {
                    "id": number,"ordem": number,"pai_cargo_id": number | null,"slug": string,"time_total": number | null,"titulo": string
                  }
                  ComputedFields: never
                  Insert: {
                    "id"?: never,"ordem"?: number,"pai_cargo_id"?: number | null,"slug": string,"time_total"?: number | null,"titulo": string
                  }
                  Update: {
                    "id"?: never,"ordem"?: number,"pai_cargo_id"?: number | null,"slug"?: string,"time_total"?: number | null,"titulo"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "org_area_pai_cargo_id_fkey"
      columns: ["pai_cargo_id"]
isOneToOne: false
      referencedRelation: "org_cargo"
      referencedColumns: ["id"]
    }
                  ]
                },"org_area_interface": {
                  Row: {
                    "area_id": number,"id": number,"nota": string | null,"ordem": number,"titulo": string
                  }
                  ComputedFields: never
                  Insert: {
                    "area_id": number,"id"?: never,"nota"?: string | null,"ordem": number,"titulo": string
                  }
                  Update: {
                    "area_id"?: number,"id"?: never,"nota"?: string | null,"ordem"?: number,"titulo"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "org_area_interface_area_id_fkey"
      columns: ["area_id"]
isOneToOne: false
      referencedRelation: "org_area"
      referencedColumns: ["id"]
    }
                  ]
                },"org_carga": {
                  Row: {
                    "ambiente": string | null,"carregado_em": string,"contagens": NonNullable<Json>,"git_sha": string | null,"id": number
                  }
                  ComputedFields: never
                  Insert: {
                    "ambiente"?: string | null,"carregado_em"?: string,"contagens"?: NonNullable<Json>,"git_sha"?: string | null,"id"?: never
                  }
                  Update: {
                    "ambiente"?: string | null,"carregado_em"?: string,"contagens"?: NonNullable<Json>,"git_sha"?: string | null,"id"?: never
                  }
                  Relationships: [
                    
                  ]
                },"org_cargo": {
                  Row: {
                    "antes": string | null,"aparece_a_partir_de": number | null,"area_id": number | null,"cargo_real": string | null,"especialidade": string | null,"id": number,"missao": string | null,"nivel": string,"ordem": number,"reporta_a_id": number | null,"reporta_a_texto": string | null,"salario_nota": string | null,"salario_proxy": string | null,"sigla": string | null,"slug": string,"sub_area": string | null,"time_total": number | null,"tipo": string,"titulo": string,"vagas": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "antes"?: string | null,"aparece_a_partir_de"?: number | null,"area_id"?: number | null,"cargo_real"?: string | null,"especialidade"?: string | null,"id"?: never,"missao"?: string | null,"nivel"?: string,"ordem"?: number,"reporta_a_id"?: number | null,"reporta_a_texto"?: string | null,"salario_nota"?: string | null,"salario_proxy"?: string | null,"sigla"?: string | null,"slug": string,"sub_area"?: string | null,"time_total"?: number | null,"tipo": string,"titulo": string,"vagas"?: number | null
                  }
                  Update: {
                    "antes"?: string | null,"aparece_a_partir_de"?: number | null,"area_id"?: number | null,"cargo_real"?: string | null,"especialidade"?: string | null,"id"?: never,"missao"?: string | null,"nivel"?: string,"ordem"?: number,"reporta_a_id"?: number | null,"reporta_a_texto"?: string | null,"salario_nota"?: string | null,"salario_proxy"?: string | null,"sigla"?: string | null,"slug"?: string,"sub_area"?: string | null,"time_total"?: number | null,"tipo"?: string,"titulo"?: string,"vagas"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "org_cargo_area_id_fkey"
      columns: ["area_id"]
isOneToOne: false
      referencedRelation: "org_area"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "org_cargo_reporta_a_id_fkey"
      columns: ["reporta_a_id"]
isOneToOne: false
      referencedRelation: "org_cargo"
      referencedColumns: ["id"]
    }
                  ]
                },"org_cargo_playbook": {
                  Row: {
                    "cargo_id": number,"id": number,"papel": string | null,"playbook_id": number
                  }
                  ComputedFields: never
                  Insert: {
                    "cargo_id": number,"id"?: never,"papel"?: string | null,"playbook_id": number
                  }
                  Update: {
                    "cargo_id"?: number,"id"?: never,"papel"?: string | null,"playbook_id"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "org_cargo_playbook_cargo_id_fkey"
      columns: ["cargo_id"]
isOneToOne: false
      referencedRelation: "org_cargo"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "org_cargo_playbook_playbook_id_fkey"
      columns: ["playbook_id"]
isOneToOne: false
      referencedRelation: "org_playbook"
      referencedColumns: ["id"]
    }
                  ]
                },"org_cargo_referencia": {
                  Row: {
                    "cargo_id": number,"id": number,"ordem": number,"texto": string
                  }
                  ComputedFields: never
                  Insert: {
                    "cargo_id": number,"id"?: never,"ordem": number,"texto": string
                  }
                  Update: {
                    "cargo_id"?: number,"id"?: never,"ordem"?: number,"texto"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "org_cargo_referencia_cargo_id_fkey"
      columns: ["cargo_id"]
isOneToOne: false
      referencedRelation: "org_cargo"
      referencedColumns: ["id"]
    }
                  ]
                },"org_cargo_salario": {
                  Row: {
                    "auditoria": string | null,"cargo_id": number,"cargo_pesquisado": string | null,"fonte": string | null,"id": number,"maximo": number | null,"mediana": number | null,"minimo": number | null,"moeda": string,"nivel": string | null,"ordem": number,"url": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "auditoria"?: string | null,"cargo_id": number,"cargo_pesquisado"?: string | null,"fonte"?: string | null,"id"?: never,"maximo"?: number | null,"mediana"?: number | null,"minimo"?: number | null,"moeda"?: string,"nivel"?: string | null,"ordem": number,"url"?: string | null
                  }
                  Update: {
                    "auditoria"?: string | null,"cargo_id"?: number,"cargo_pesquisado"?: string | null,"fonte"?: string | null,"id"?: never,"maximo"?: number | null,"mediana"?: number | null,"minimo"?: number | null,"moeda"?: string,"nivel"?: string | null,"ordem"?: number,"url"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "org_cargo_salario_cargo_id_fkey"
      columns: ["cargo_id"]
isOneToOne: false
      referencedRelation: "org_cargo"
      referencedColumns: ["id"]
    }
                  ]
                },"org_documento": {
                  Row: {
                    "caminho": string,"especialista": string | null,"id": number,"markdown": string,"ordem": number,"pacote_id": number | null,"resumo": string | null,"tamanho": number,"tipo": string,"titulo": string
                  }
                  ComputedFields: never
                  Insert: {
                    "caminho": string,"especialista"?: string | null,"id"?: never,"markdown": string,"ordem"?: number,"pacote_id"?: number | null,"resumo"?: string | null,"tamanho"?: number,"tipo": string,"titulo": string
                  }
                  Update: {
                    "caminho"?: string,"especialista"?: string | null,"id"?: never,"markdown"?: string,"ordem"?: number,"pacote_id"?: number | null,"resumo"?: string | null,"tamanho"?: number,"tipo"?: string,"titulo"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "org_documento_pacote_id_fkey"
      columns: ["pacote_id"]
isOneToOne: false
      referencedRelation: "org_pacote"
      referencedColumns: ["id"]
    }
                  ]
                },"org_onda": {
                  Row: {
                    "codigo": string,"depende": string | null,"id": number,"ordem": number,"porque": string | null,"time": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "codigo": string,"depende"?: string | null,"id"?: never,"ordem"?: number,"porque"?: string | null,"time"?: string | null
                  }
                  Update: {
                    "codigo"?: string,"depende"?: string | null,"id"?: never,"ordem"?: number,"porque"?: string | null,"time"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"org_onda_cargo": {
                  Row: {
                    "cargo_id": number | null,"id": number,"onda_id": number,"ordem": number,"texto": string
                  }
                  ComputedFields: never
                  Insert: {
                    "cargo_id"?: number | null,"id"?: never,"onda_id": number,"ordem": number,"texto": string
                  }
                  Update: {
                    "cargo_id"?: number | null,"id"?: never,"onda_id"?: number,"ordem"?: number,"texto"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "org_onda_cargo_cargo_id_fkey"
      columns: ["cargo_id"]
isOneToOne: false
      referencedRelation: "org_cargo"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "org_onda_cargo_onda_id_fkey"
      columns: ["onda_id"]
isOneToOne: false
      referencedRelation: "org_onda"
      referencedColumns: ["id"]
    }
                  ]
                },"org_pacote": {
                  Row: {
                    "aprovou": string | null,"auditoria": string | null,"cargo_id": number,"casos_md": string | null,"data": string | null,"id": number,"marcas": NonNullable<Json>,"modelou": string | null,"pasta": string | null,"slug": string,"validade": string | null,"versao": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "aprovou"?: string | null,"auditoria"?: string | null,"cargo_id": number,"casos_md"?: string | null,"data"?: string | null,"id"?: never,"marcas"?: NonNullable<Json>,"modelou"?: string | null,"pasta"?: string | null,"slug": string,"validade"?: string | null,"versao"?: string | null
                  }
                  Update: {
                    "aprovou"?: string | null,"auditoria"?: string | null,"cargo_id"?: number,"casos_md"?: string | null,"data"?: string | null,"id"?: never,"marcas"?: NonNullable<Json>,"modelou"?: string | null,"pasta"?: string | null,"slug"?: string,"validade"?: string | null,"versao"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "org_pacote_cargo_id_fkey"
      columns: ["cargo_id"]
isOneToOne: true
      referencedRelation: "org_cargo"
      referencedColumns: ["id"]
    }
                  ]
                },"org_pacote_secao": {
                  Row: {
                    "id": number,"markdown": string | null,"ordem": number,"pacote_id": number,"titulo": string
                  }
                  ComputedFields: never
                  Insert: {
                    "id"?: never,"markdown"?: string | null,"ordem": number,"pacote_id": number,"titulo": string
                  }
                  Update: {
                    "id"?: never,"markdown"?: string | null,"ordem"?: number,"pacote_id"?: number,"titulo"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "org_pacote_secao_pacote_id_fkey"
      columns: ["pacote_id"]
isOneToOne: false
      referencedRelation: "org_pacote"
      referencedColumns: ["id"]
    }
                  ]
                },"org_playbook": {
                  Row: {
                    "apqc": string | null,"aprova": string | null,"cargos_citados": (string)[],"frequencia": string | null,"horas_texto": string | null,"id": number,"markdown": string | null,"nivel_minimo": string | null,"ordem": number,"pacote_id": number,"processo": string | null,"slug": string,"validade": string | null,"versao": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "apqc"?: string | null,"aprova"?: string | null,"cargos_citados"?: (string)[],"frequencia"?: string | null,"horas_texto"?: string | null,"id"?: never,"markdown"?: string | null,"nivel_minimo"?: string | null,"ordem"?: number,"pacote_id": number,"processo"?: string | null,"slug": string,"validade"?: string | null,"versao"?: string | null
                  }
                  Update: {
                    "apqc"?: string | null,"aprova"?: string | null,"cargos_citados"?: (string)[],"frequencia"?: string | null,"horas_texto"?: string | null,"id"?: never,"markdown"?: string | null,"nivel_minimo"?: string | null,"ordem"?: number,"pacote_id"?: number,"processo"?: string | null,"slug"?: string,"validade"?: string | null,"versao"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "org_playbook_pacote_id_fkey"
      columns: ["pacote_id"]
isOneToOne: false
      referencedRelation: "org_pacote"
      referencedColumns: ["id"]
    }
                  ]
                },"org_processo": {
                  Row: {
                    "apqc": (string)[],"cargo_id": number,"horas_mes": number | null,"id": number,"notas": string | null,"ordem": number,"titulo": string
                  }
                  ComputedFields: never
                  Insert: {
                    "apqc"?: (string)[],"cargo_id": number,"horas_mes"?: number | null,"id"?: never,"notas"?: string | null,"ordem": number,"titulo": string
                  }
                  Update: {
                    "apqc"?: (string)[],"cargo_id"?: number,"horas_mes"?: number | null,"id"?: never,"notas"?: string | null,"ordem"?: number,"titulo"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "org_processo_cargo_id_fkey"
      columns: ["cargo_id"]
isOneToOne: false
      referencedRelation: "org_cargo"
      referencedColumns: ["id"]
    }
                  ]
                },"org_workflow": {
                  Row: {
                    "fonte": string | null,"id": number,"nome": string,"slug": string
                  }
                  ComputedFields: never
                  Insert: {
                    "fonte"?: string | null,"id"?: never,"nome": string,"slug": string
                  }
                  Update: {
                    "fonte"?: string | null,"id"?: never,"nome"?: string,"slug"?: string
                  }
                  Relationships: [
                    
                  ]
                },"org_workflow_passo": {
                  Row: {
                    "codigo": string,"coluna": number,"entrega": string | null,"faz": string | null,"gate": string | null,"id": number,"lacos": (string)[],"ordem": number,"passa": string | null,"passo": string,"playbook_texto": string | null,"proximos": (string)[],"quem": string | null,"raias": (string)[],"sai_caio": boolean,"workflow_id": number
                  }
                  ComputedFields: never
                  Insert: {
                    "codigo": string,"coluna"?: number,"entrega"?: string | null,"faz"?: string | null,"gate"?: string | null,"id"?: never,"lacos"?: (string)[],"ordem"?: number,"passa"?: string | null,"passo": string,"playbook_texto"?: string | null,"proximos"?: (string)[],"quem"?: string | null,"raias"?: (string)[],"sai_caio"?: boolean,"workflow_id": number
                  }
                  Update: {
                    "codigo"?: string,"coluna"?: number,"entrega"?: string | null,"faz"?: string | null,"gate"?: string | null,"id"?: never,"lacos"?: (string)[],"ordem"?: number,"passa"?: string | null,"passo"?: string,"playbook_texto"?: string | null,"proximos"?: (string)[],"quem"?: string | null,"raias"?: (string)[],"sai_caio"?: boolean,"workflow_id"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "org_workflow_passo_workflow_id_fkey"
      columns: ["workflow_id"]
isOneToOne: false
      referencedRelation: "org_workflow"
      referencedColumns: ["id"]
    }
                  ]
                },"org_workflow_passo_playbook": {
                  Row: {
                    "id": number,"ordem": number,"passo_id": number,"playbook_id": number
                  }
                  ComputedFields: never
                  Insert: {
                    "id"?: never,"ordem"?: number,"passo_id": number,"playbook_id": number
                  }
                  Update: {
                    "id"?: never,"ordem"?: number,"passo_id"?: number,"playbook_id"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "org_workflow_passo_playbook_passo_id_fkey"
      columns: ["passo_id"]
isOneToOne: false
      referencedRelation: "org_workflow_passo"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "org_workflow_passo_playbook_playbook_id_fkey"
      columns: ["playbook_id"]
isOneToOne: false
      referencedRelation: "org_playbook"
      referencedColumns: ["id"]
    }
                  ]
                },"org_workflow_raia": {
                  Row: {
                    "cargo_id": number | null,"chave": string,"id": number,"nome": string,"ordem": number,"workflow_id": number
                  }
                  ComputedFields: never
                  Insert: {
                    "cargo_id"?: number | null,"chave": string,"id"?: never,"nome": string,"ordem"?: number,"workflow_id": number
                  }
                  Update: {
                    "cargo_id"?: number | null,"chave"?: string,"id"?: never,"nome"?: string,"ordem"?: number,"workflow_id"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "org_workflow_raia_cargo_id_fkey"
      columns: ["cargo_id"]
isOneToOne: false
      referencedRelation: "org_cargo"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "org_workflow_raia_workflow_id_fkey"
      columns: ["workflow_id"]
isOneToOne: false
      referencedRelation: "org_workflow"
      referencedColumns: ["id"]
    }
                  ]
                },"outbox": {
                  Row: {
                    "correlacao": string | null,"criada_em": string,"id": string,"payload": NonNullable<Json>,"publicada_em": string | null,"tipo": string,"versao": number
                  }
                  ComputedFields: never
                  Insert: {
                    "correlacao"?: string | null,"criada_em"?: string,"id"?: string,"payload"?: NonNullable<Json>,"publicada_em"?: string | null,"tipo": string,"versao"?: number
                  }
                  Update: {
                    "correlacao"?: string | null,"criada_em"?: string,"id"?: string,"payload"?: NonNullable<Json>,"publicada_em"?: string | null,"tipo"?: string,"versao"?: number
                  }
                  Relationships: [
                    
                  ]
                },"posicao": {
                  Row: {
                    "atualizada_em": string,"cargo_id": number,"criada_em": string,"estado": string,"id": number,"ordem": number,"titulo": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "atualizada_em"?: string,"cargo_id": number,"criada_em"?: string,"estado"?: string,"id"?: never,"ordem"?: number,"titulo"?: string | null
                  }
                  Update: {
                    "atualizada_em"?: string,"cargo_id"?: number,"criada_em"?: string,"estado"?: string,"id"?: never,"ordem"?: number,"titulo"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "posicao_cargo_id_fkey"
      columns: ["cargo_id"]
isOneToOne: false
      referencedRelation: "org_cargo"
      referencedColumns: ["id"]
    }
                  ]
                },"posicao_ocupacao": {
                  Row: {
                    "agente_id": string | null,"id": number,"parte_id": number | null,"posicao_id": number,"vigente_ate": string | null,"vigente_de": string
                  }
                  ComputedFields: never
                  Insert: {
                    "agente_id"?: string | null,"id"?: never,"parte_id"?: number | null,"posicao_id": number,"vigente_ate"?: string | null,"vigente_de"?: string
                  }
                  Update: {
                    "agente_id"?: string | null,"id"?: never,"parte_id"?: number | null,"posicao_id"?: number,"vigente_ate"?: string | null,"vigente_de"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "posicao_ocupacao_posicao_id_fkey"
      columns: ["posicao_id"]
isOneToOne: false
      referencedRelation: "posicao"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "posicao_ocupacao_posicao_id_fkey"
      columns: ["posicao_id"]
isOneToOne: false
      referencedRelation: "v_posicao_ocupante"
      referencedColumns: ["posicao_id"]
    }
                  ]
                }
          }
          Views: {
            "v_org_apqc": {
                  Row: {
                    "codigo": string | null,"nome_en": string | null,"nome_pt": string | null
                  }
                  ComputedFields: never
                  Insert: {
                           "codigo"?: string | null,"nome_en"?: string | null,"nome_pt"?: string | null
                         }
                        Update: {
                           "codigo"?: string | null,"nome_en"?: string | null,"nome_pt"?: string | null
                         }
                        Relationships: [
                    
                  ]
                },"v_org_carga": {
                  Row: {
                    "ambiente": string | null,"carregado_em": string | null,"contagens": Json | null,"git_sha": string | null
                  }
                  ComputedFields: never
                  Relationships: [
                    
                  ]
                },"v_org_cargo_playbook": {
                  Row: {
                    "cargo_slug": string | null,"nivel_minimo": string | null,"ordem": number | null,"pacote_cargo_slug": string | null,"pacote_cargo_titulo": string | null,"pacote_slug": string | null,"papel": string | null,"playbook_slug": string | null,"processo": string | null
                  }
                  ComputedFields: never
                  Relationships: [
                    
                  ]
                },"v_org_documento": {
                  Row: {
                    "caminho": string | null,"cargo_slug": string | null,"especialista": string | null,"markdown": string | null,"ordem": number | null,"pacote_slug": string | null,"resumo": string | null,"tamanho": number | null,"tipo": string | null,"titulo": string | null
                  }
                  ComputedFields: never
                  Relationships: [
                    
                  ]
                },"v_org_no": {
                  Row: {
                    "antes": string | null,"aparece_a_partir_de": number | null,"area_slug": string | null,"cargo_real": string | null,"especialidade": string | null,"interfaces": Json | null,"missao": string | null,"no_id": string | null,"ordem": number | null,"pacote": Json | null,"pai_no_id": string | null,"processos": Json | null,"referencias": Json | null,"reporta_a_slug": string | null,"reporta_a_texto": string | null,"salario_nota": string | null,"salario_proxy": string | null,"salarios": Json | null,"sigla": string | null,"slug": string | null,"sub_area": string | null,"time_total": number | null,"tipo": string | null,"titulo": string | null,"vagas": number | null
                  }
                  ComputedFields: never
                  Relationships: [
                    
                  ]
                },"v_org_onda": {
                  Row: {
                    "cargos": Json | null,"codigo": string | null,"depende": string | null,"ordem": number | null,"porque": string | null,"time": string | null
                  }
                  ComputedFields: never
                  Insert: {
                           "cargos"?: never,"codigo"?: string | null,"depende"?: string | null,"ordem"?: number | null,"porque"?: string | null,"time"?: string | null
                         }
                        Update: {
                           "cargos"?: never,"codigo"?: string | null,"depende"?: string | null,"ordem"?: number | null,"porque"?: string | null,"time"?: string | null
                         }
                        Relationships: [
                    
                  ]
                },"v_org_pacote": {
                  Row: {
                    "aprovou": string | null,"auditoria": string | null,"cargo_slug": string | null,"casos_md": string | null,"data": string | null,"marcas": Json | null,"modelou": string | null,"pasta": string | null,"playbooks": Json | null,"secoes": Json | null,"slug": string | null,"validade": string | null,"versao": string | null
                  }
                  ComputedFields: never
                  Relationships: [
                    
                  ]
                },"v_org_workflow_passo": {
                  Row: {
                    "codigo": string | null,"coluna": number | null,"entrega": string | null,"faz": string | null,"gate": string | null,"lacos": (string)[] | null,"ordem": number | null,"passa": string | null,"passo": string | null,"playbook_texto": string | null,"playbooks": Json | null,"proximos": (string)[] | null,"quem": string | null,"raias": (string)[] | null,"sai_caio": boolean | null,"workflow_slug": string | null
                  }
                  ComputedFields: never
                  Relationships: [
                    
                  ]
                },"v_org_workflow_raia": {
                  Row: {
                    "cargo_slug": string | null,"chave": string | null,"nome": string | null,"ordem": number | null,"workflow_slug": string | null
                  }
                  ComputedFields: never
                  Relationships: [
                    
                  ]
                },"v_posicao_ocupante": {
                  Row: {
                    "agente_id": string | null,"agente_name": string | null,"cargo_slug": string | null,"cargo_titulo": string | null,"estado": string | null,"ocupante_tipo": string | null,"parte_id": number | null,"posicao_id": number | null
                  }
                  ComputedFields: never
                  Relationships: [
                    
                  ]
                }
          }
          Functions: {
            "carregar":
{ Args: { "p": Json }; Returns: Json
                           },
"ocupar_posicao_agente":
{ Args: { "p_agente_id": string,"p_cargo_slug": string }; Returns: string
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "agentes": {
                  Row: {
                    "atualizada_em": string,"criado_em": string,"descricao": string,"descricao_curta": string,"esforco": string | null,"estado": string,"estado_conferido_em": string,"id": string,"modelo": string | null,"name": string,"quando": string | null,"sandbox": string,"skills": (string)[],"tier": string | null,"time": string
                  }
                  ComputedFields: never
                  Insert: {
                    "atualizada_em"?: string,"criado_em"?: string,"descricao": string,"descricao_curta": string,"esforco"?: string | null,"estado": string,"estado_conferido_em": string,"id"?: string,"modelo"?: string | null,"name": string,"quando"?: string | null,"sandbox": string,"skills"?: (string)[],"tier"?: string | null,"time": string
                  }
                  Update: {
                    "atualizada_em"?: string,"criado_em"?: string,"descricao"?: string,"descricao_curta"?: string,"esforco"?: string | null,"estado"?: string,"estado_conferido_em"?: string,"id"?: string,"modelo"?: string | null,"name"?: string,"quando"?: string | null,"sandbox"?: string,"skills"?: (string)[],"tier"?: string | null,"time"?: string
                  }
                  Relationships: [
                    
                  ]
                },"artefato_arquivos": {
                  Row: {
                    "artefato_id": string,"bytes": number,"caminho": string,"conteudo": string | null,"hash": string,"id": number,"linguagem": string
                  }
                  ComputedFields: never
                  Insert: {
                    "artefato_id": string,"bytes": number,"caminho": string,"conteudo"?: string | null,"hash": string,"id"?: never,"linguagem": string
                  }
                  Update: {
                    "artefato_id"?: string,"bytes"?: number,"caminho"?: string,"conteudo"?: string | null,"hash"?: string,"id"?: never,"linguagem"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "artefato_arquivos_artefato_id_fkey"
      columns: ["artefato_id"]
isOneToOne: false
      referencedRelation: "artefatos_ia"
      referencedColumns: ["id"]
    }
                  ]
                },"artefato_playbook": {
                  Row: {
                    "artefato_id": string,"forma": string,"id": number,"pacote_slug": string,"passo_codigo": string | null,"playbook_slug": string
                  }
                  ComputedFields: never
                  Insert: {
                    "artefato_id": string,"forma": string,"id"?: never,"pacote_slug": string,"passo_codigo"?: string | null,"playbook_slug": string
                  }
                  Update: {
                    "artefato_id"?: string,"forma"?: string,"id"?: never,"pacote_slug"?: string,"passo_codigo"?: string | null,"playbook_slug"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "artefato_playbook_artefato_id_fkey"
      columns: ["artefato_id"]
isOneToOne: false
      referencedRelation: "artefatos_ia"
      referencedColumns: ["id"]
    }
                  ]
                },"artefato_relacoes": {
                  Row: {
                    "destino_id": string,"id": number,"origem_id": string,"tipo": string
                  }
                  ComputedFields: never
                  Insert: {
                    "destino_id": string,"id"?: never,"origem_id": string,"tipo": string
                  }
                  Update: {
                    "destino_id"?: string,"id"?: never,"origem_id"?: string,"tipo"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "artefato_relacoes_destino_id_fkey"
      columns: ["destino_id"]
isOneToOne: false
      referencedRelation: "artefatos_ia"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "artefato_relacoes_origem_id_fkey"
      columns: ["origem_id"]
isOneToOne: false
      referencedRelation: "artefatos_ia"
      referencedColumns: ["id"]
    }
                  ]
                },"artefatos_ia": {
                  Row: {
                    "atualizada_em": string,"caminho": string,"conferido_em": string,"conteudo": string,"criado_em": string,"descricao": string | null,"estado": string,"formato": string,"gatilho": string | null,"grava": string | null,"hash": string,"id": string,"le": string | null,"nome": string,"origem": string,"quando": string | null,"resumo": string,"time": string,"tipo": string
                  }
                  ComputedFields: never
                  Insert: {
                    "atualizada_em"?: string,"caminho": string,"conferido_em": string,"conteudo": string,"criado_em"?: string,"descricao"?: string | null,"estado": string,"formato": string,"gatilho"?: string | null,"grava"?: string | null,"hash": string,"id"?: string,"le"?: string | null,"nome": string,"origem": string,"quando"?: string | null,"resumo": string,"time": string,"tipo": string
                  }
                  Update: {
                    "atualizada_em"?: string,"caminho"?: string,"conferido_em"?: string,"conteudo"?: string,"criado_em"?: string,"descricao"?: string | null,"estado"?: string,"formato"?: string,"gatilho"?: string | null,"grava"?: string | null,"hash"?: string,"id"?: string,"le"?: string | null,"nome"?: string,"origem"?: string,"quando"?: string | null,"resumo"?: string,"time"?: string,"tipo"?: string
                  }
                  Relationships: [
                    
                  ]
                },"atividade": {
                  Row: {
                    "agente_id": string | null,"descricao": string,"id": number,"metadata": NonNullable<Json>,"modulo_origem": string | null,"quando": string,"tarefa_id": string | null,"tipo": string,"usuario_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "agente_id"?: string | null,"descricao": string,"id"?: never,"metadata"?: NonNullable<Json>,"modulo_origem"?: string | null,"quando"?: string,"tarefa_id"?: string | null,"tipo": string,"usuario_id"?: string | null
                  }
                  Update: {
                    "agente_id"?: string | null,"descricao"?: string,"id"?: never,"metadata"?: NonNullable<Json>,"modulo_origem"?: string | null,"quando"?: string,"tarefa_id"?: string | null,"tipo"?: string,"usuario_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "atividade_agente_id_fkey"
      columns: ["agente_id"]
isOneToOne: false
      referencedRelation: "agentes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "atividade_modulo_origem_fkey"
      columns: ["modulo_origem"]
isOneToOne: false
      referencedRelation: "modulo"
      referencedColumns: ["slug"]
    },{
      foreignKeyName: "atividade_tarefa_id_fkey"
      columns: ["tarefa_id"]
isOneToOne: false
      referencedRelation: "tarefas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "atividade_usuario_id_fkey"
      columns: ["usuario_id"]
isOneToOne: false
      referencedRelation: "usuarios"
      referencedColumns: ["id"]
    }
                  ]
                },"calendario": {
                  Row: {
                    "atualizada_em": string,"criada_em": string,"dias_uteis": (number)[],"expediente_fim": string,"expediente_inicio": string,"feriados": (string)[],"fuso": string,"id": number,"rotulo": string
                  }
                  ComputedFields: never
                  Insert: {
                    "atualizada_em"?: string,"criada_em"?: string,"dias_uteis"?: (number)[],"expediente_fim"?: string,"expediente_inicio"?: string,"feriados"?: (string)[],"fuso"?: string,"id"?: never,"rotulo": string
                  }
                  Update: {
                    "atualizada_em"?: string,"criada_em"?: string,"dias_uteis"?: (number)[],"expediente_fim"?: string,"expediente_inicio"?: string,"feriados"?: (string)[],"fuso"?: string,"id"?: never,"rotulo"?: string
                  }
                  Relationships: [
                    
                  ]
                },"campo_definicao": {
                  Row: {
                    "ativo": boolean,"atualizada_em": string,"chave": string,"classe_dado": string,"criada_em": string,"entidade": string,"id": number,"obrigatorio": boolean,"opcoes": Json | null,"rotulo": string,"tipo": string
                  }
                  ComputedFields: never
                  Insert: {
                    "ativo"?: boolean,"atualizada_em"?: string,"chave": string,"classe_dado"?: string,"criada_em"?: string,"entidade": string,"id"?: never,"obrigatorio"?: boolean,"opcoes"?: Json | null,"rotulo": string,"tipo": string
                  }
                  Update: {
                    "ativo"?: boolean,"atualizada_em"?: string,"chave"?: string,"classe_dado"?: string,"criada_em"?: string,"entidade"?: string,"id"?: never,"obrigatorio"?: boolean,"opcoes"?: Json | null,"rotulo"?: string,"tipo"?: string
                  }
                  Relationships: [
                    
                  ]
                },"conexao": {
                  Row: {
                    "aplicacao_ref": string | null,"atualizada_em": string,"conta": string,"copias": (string)[],"criada_em": string,"dono_papel": string | null,"dono_usuario_id": string | null,"escopo": string,"estado": string,"id": string,"provado_em": string | null,"rotacionado_em": string | null,"rotacionar_ate": string | null,"segredo_ref": string | null,"servico": string,"ultimo_uso_em": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "aplicacao_ref"?: string | null,"atualizada_em"?: string,"conta": string,"copias"?: (string)[],"criada_em"?: string,"dono_papel"?: string | null,"dono_usuario_id"?: string | null,"escopo"?: string,"estado"?: string,"id"?: string,"provado_em"?: string | null,"rotacionado_em"?: string | null,"rotacionar_ate"?: string | null,"segredo_ref"?: string | null,"servico": string,"ultimo_uso_em"?: string | null
                  }
                  Update: {
                    "aplicacao_ref"?: string | null,"atualizada_em"?: string,"conta"?: string,"copias"?: (string)[],"criada_em"?: string,"dono_papel"?: string | null,"dono_usuario_id"?: string | null,"escopo"?: string,"estado"?: string,"id"?: string,"provado_em"?: string | null,"rotacionado_em"?: string | null,"rotacionar_ate"?: string | null,"segredo_ref"?: string | null,"servico"?: string,"ultimo_uso_em"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "fk_conexao_dono"
      columns: ["dono_usuario_id"]
isOneToOne: false
      referencedRelation: "usuarios"
      referencedColumns: ["id"]
    }
                  ]
                },"consentimento": {
                  Row: {
                    "base_legal": string,"canal": string,"contato_id": number | null,"estado": string,"finalidade": string,"id": number,"parte_id": number,"prova": string | null,"registrado_em": string,"registrado_por_usuario_id": string | null,"versao": number
                  }
                  ComputedFields: never
                  Insert: {
                    "base_legal": string,"canal": string,"contato_id"?: number | null,"estado": string,"finalidade": string,"id"?: never,"parte_id": number,"prova"?: string | null,"registrado_em"?: string,"registrado_por_usuario_id"?: string | null,"versao": number
                  }
                  Update: {
                    "base_legal"?: string,"canal"?: string,"contato_id"?: number | null,"estado"?: string,"finalidade"?: string,"id"?: never,"parte_id"?: number,"prova"?: string | null,"registrado_em"?: string,"registrado_por_usuario_id"?: string | null,"versao"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "consentimento_contato_id_fkey"
      columns: ["contato_id"]
isOneToOne: false
      referencedRelation: "contato"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "consentimento_parte_id_fkey"
      columns: ["parte_id"]
isOneToOne: false
      referencedRelation: "parte"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "consentimento_parte_id_fkey"
      columns: ["parte_id"]
isOneToOne: false
      referencedRelation: "parte_v"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "consentimento_registrado_por_usuario_id_fkey"
      columns: ["registrado_por_usuario_id"]
isOneToOne: false
      referencedRelation: "usuarios"
      referencedColumns: ["id"]
    }
                  ]
                },"contato": {
                  Row: {
                    "atualizada_em": string,"criada_em": string,"finalidade": string,"id": number,"parte_id": number,"principal": boolean,"tipo": string,"valor": string,"valor_mascarado": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "atualizada_em"?: string,"criada_em"?: string,"finalidade"?: string,"id"?: never,"parte_id": number,"principal"?: boolean,"tipo": string,"valor": string,"valor_mascarado"?: never
                  }
                  Update: {
                    "atualizada_em"?: string,"criada_em"?: string,"finalidade"?: string,"id"?: never,"parte_id"?: number,"principal"?: boolean,"tipo"?: string,"valor"?: string,"valor_mascarado"?: never
                  }
                  Relationships: [
                    {
      foreignKeyName: "contato_parte_id_fkey"
      columns: ["parte_id"]
isOneToOne: false
      referencedRelation: "parte"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "contato_parte_id_fkey"
      columns: ["parte_id"]
isOneToOne: false
      referencedRelation: "parte_v"
      referencedColumns: ["id"]
    }
                  ]
                },"documento": {
                  Row: {
                    "caminho": string,"criada_em": string,"hash": string,"id": number,"mime": string | null,"modulo": string,"nome_arquivo": string,"parte_id": number | null,"tamanho_bytes": number | null,"tipo": string
                  }
                  ComputedFields: never
                  Insert: {
                    "caminho": string,"criada_em"?: string,"hash": string,"id"?: never,"mime"?: string | null,"modulo": string,"nome_arquivo": string,"parte_id"?: number | null,"tamanho_bytes"?: number | null,"tipo": string
                  }
                  Update: {
                    "caminho"?: string,"criada_em"?: string,"hash"?: string,"id"?: never,"mime"?: string | null,"modulo"?: string,"nome_arquivo"?: string,"parte_id"?: number | null,"tamanho_bytes"?: number | null,"tipo"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "documento_modulo_fkey"
      columns: ["modulo"]
isOneToOne: false
      referencedRelation: "modulo"
      referencedColumns: ["slug"]
    },{
      foreignKeyName: "documento_parte_id_fkey"
      columns: ["parte_id"]
isOneToOne: false
      referencedRelation: "parte"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "documento_parte_id_fkey"
      columns: ["parte_id"]
isOneToOne: false
      referencedRelation: "parte_v"
      referencedColumns: ["id"]
    }
                  ]
                },"documentos_publicados": {
                  Row: {
                    "caminho_origem": string,"hash": string,"id": string,"imagem_caminho": string | null,"publicado_em": string,"resumo": string | null,"texto": string,"tipo": string,"titulo": string
                  }
                  ComputedFields: never
                  Insert: {
                    "caminho_origem": string,"hash": string,"id"?: string,"imagem_caminho"?: string | null,"publicado_em"?: string,"resumo"?: string | null,"texto": string,"tipo": string,"titulo": string
                  }
                  Update: {
                    "caminho_origem"?: string,"hash"?: string,"id"?: string,"imagem_caminho"?: string | null,"publicado_em"?: string,"resumo"?: string | null,"texto"?: string,"tipo"?: string,"titulo"?: string
                  }
                  Relationships: [
                    
                  ]
                },"empresa": {
                  Row: {
                    "atualizada_em": string,"criada_em": string,"descricao": string | null,"id": number,"nome": string
                  }
                  ComputedFields: never
                  Insert: {
                    "atualizada_em"?: string,"criada_em"?: string,"descricao"?: string | null,"id"?: number,"nome": string
                  }
                  Update: {
                    "atualizada_em"?: string,"criada_em"?: string,"descricao"?: string | null,"id"?: number,"nome"?: string
                  }
                  Relationships: [
                    
                  ]
                },"endereco": {
                  Row: {
                    "atualizada_em": string,"bairro": string | null,"cep": string | null,"cep_prefixo": string | null,"cidade": string,"complemento": string | null,"criada_em": string,"finalidade": string,"id": number,"logradouro": string,"numero": string | null,"pais": string,"parte_id": number,"principal": boolean,"uf": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "atualizada_em"?: string,"bairro"?: string | null,"cep"?: string | null,"cep_prefixo"?: never,"cidade": string,"complemento"?: string | null,"criada_em"?: string,"finalidade"?: string,"id"?: never,"logradouro": string,"numero"?: string | null,"pais"?: string,"parte_id": number,"principal"?: boolean,"uf"?: string | null
                  }
                  Update: {
                    "atualizada_em"?: string,"bairro"?: string | null,"cep"?: string | null,"cep_prefixo"?: never,"cidade"?: string,"complemento"?: string | null,"criada_em"?: string,"finalidade"?: string,"id"?: never,"logradouro"?: string,"numero"?: string | null,"pais"?: string,"parte_id"?: number,"principal"?: boolean,"uf"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "endereco_parte_id_fkey"
      columns: ["parte_id"]
isOneToOne: false
      referencedRelation: "parte"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "endereco_parte_id_fkey"
      columns: ["parte_id"]
isOneToOne: false
      referencedRelation: "parte_v"
      referencedColumns: ["id"]
    }
                  ]
                },"execucoes_agente": {
                  Row: {
                    "agente": string,"custo_estimado_tokens": number | null,"id": number,"iniciado_em": string,"registrado_em": string,"resumo": string | null,"tarefa_id": string | null,"terminado_em": string,"veredito": string
                  }
                  ComputedFields: never
                  Insert: {
                    "agente": string,"custo_estimado_tokens"?: number | null,"id"?: never,"iniciado_em": string,"registrado_em"?: string,"resumo"?: string | null,"tarefa_id"?: string | null,"terminado_em": string,"veredito": string
                  }
                  Update: {
                    "agente"?: string,"custo_estimado_tokens"?: number | null,"id"?: never,"iniciado_em"?: string,"registrado_em"?: string,"resumo"?: string | null,"tarefa_id"?: string | null,"terminado_em"?: string,"veredito"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "execucoes_agente_agente_fkey"
      columns: ["agente"]
isOneToOne: false
      referencedRelation: "agentes"
      referencedColumns: ["name"]
    },{
      foreignKeyName: "execucoes_agente_tarefa_id_fkey"
      columns: ["tarefa_id"]
isOneToOne: false
      referencedRelation: "tarefas"
      referencedColumns: ["id"]
    }
                  ]
                },"inbox": {
                  Row: {
                    "erro": string | null,"evento_id": string,"id": number,"origem": string,"processada_em": string | null,"recebida_em": string,"tentativas": number,"tipo": string
                  }
                  ComputedFields: never
                  Insert: {
                    "erro"?: string | null,"evento_id": string,"id"?: never,"origem": string,"processada_em"?: string | null,"recebida_em"?: string,"tentativas"?: number,"tipo": string
                  }
                  Update: {
                    "erro"?: string | null,"evento_id"?: string,"id"?: never,"origem"?: string,"processada_em"?: string | null,"recebida_em"?: string,"tentativas"?: number,"tipo"?: string
                  }
                  Relationships: [
                    
                  ]
                },"melhorias": {
                  Row: {
                    "agente": string | null,"aplicada_em": string | null,"commit_sha": string | null,"criada_em": string,"decidido_em": string | null,"decidido_por": string | null,"id": string,"justificativa": string | null,"origem": string,"regra_texto": string,"status": string,"titulo": string
                  }
                  ComputedFields: never
                  Insert: {
                    "agente"?: string | null,"aplicada_em"?: string | null,"commit_sha"?: string | null,"criada_em"?: string,"decidido_em"?: string | null,"decidido_por"?: string | null,"id"?: string,"justificativa"?: string | null,"origem": string,"regra_texto": string,"status"?: string,"titulo": string
                  }
                  Update: {
                    "agente"?: string | null,"aplicada_em"?: string | null,"commit_sha"?: string | null,"criada_em"?: string,"decidido_em"?: string | null,"decidido_por"?: string | null,"id"?: string,"justificativa"?: string | null,"origem"?: string,"regra_texto"?: string,"status"?: string,"titulo"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "melhorias_agente_fkey"
      columns: ["agente"]
isOneToOne: false
      referencedRelation: "agentes"
      referencedColumns: ["name"]
    },{
      foreignKeyName: "melhorias_decidido_por_fkey"
      columns: ["decidido_por"]
isOneToOne: false
      referencedRelation: "usuarios"
      referencedColumns: ["id"]
    }
                  ]
                },"modulo": {
                  Row: {
                    "classe": string,"criada_em": string,"descricao": string,"dono": string,"ligado": boolean,"ligado_em": string | null,"ligado_por_usuario_id": string | null,"modulo_pai": string | null,"nome": string,"schema_nome": string | null,"slug": string
                  }
                  ComputedFields: never
                  Insert: {
                    "classe"?: string,"criada_em"?: string,"descricao": string,"dono": string,"ligado"?: boolean,"ligado_em"?: string | null,"ligado_por_usuario_id"?: string | null,"modulo_pai"?: string | null,"nome": string,"schema_nome"?: string | null,"slug": string
                  }
                  Update: {
                    "classe"?: string,"criada_em"?: string,"descricao"?: string,"dono"?: string,"ligado"?: boolean,"ligado_em"?: string | null,"ligado_por_usuario_id"?: string | null,"modulo_pai"?: string | null,"nome"?: string,"schema_nome"?: string | null,"slug"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "modulo_ligado_por_usuario_id_fkey"
      columns: ["ligado_por_usuario_id"]
isOneToOne: false
      referencedRelation: "usuarios"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "modulo_modulo_pai_fkey"
      columns: ["modulo_pai"]
isOneToOne: false
      referencedRelation: "modulo"
      referencedColumns: ["slug"]
    }
                  ]
                },"outbox": {
                  Row: {
                    "correlacao": string | null,"criada_em": string,"id": string,"payload": NonNullable<Json>,"publicada_em": string | null,"tipo": string,"versao": number
                  }
                  ComputedFields: never
                  Insert: {
                    "correlacao"?: string | null,"criada_em"?: string,"id"?: string,"payload"?: NonNullable<Json>,"publicada_em"?: string | null,"tipo": string,"versao"?: number
                  }
                  Update: {
                    "correlacao"?: string | null,"criada_em"?: string,"id"?: string,"payload"?: NonNullable<Json>,"publicada_em"?: string | null,"tipo"?: string,"versao"?: number
                  }
                  Relationships: [
                    
                  ]
                },"papel_parte": {
                  Row: {
                    "criada_em": string,"id": number,"parte_id": number,"tipo": string,"vigente_ate": string | null,"vigente_de": string
                  }
                  ComputedFields: never
                  Insert: {
                    "criada_em"?: string,"id"?: never,"parte_id": number,"tipo": string,"vigente_ate"?: string | null,"vigente_de"?: string
                  }
                  Update: {
                    "criada_em"?: string,"id"?: never,"parte_id"?: number,"tipo"?: string,"vigente_ate"?: string | null,"vigente_de"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "papel_parte_parte_id_fkey"
      columns: ["parte_id"]
isOneToOne: false
      referencedRelation: "parte"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "papel_parte_parte_id_fkey"
      columns: ["parte_id"]
isOneToOne: false
      referencedRelation: "parte_v"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "papel_parte_tipo_fkey"
      columns: ["tipo"]
isOneToOne: false
      referencedRelation: "tipo_papel"
      referencedColumns: ["slug"]
    }
                  ]
                },"parte": {
                  Row: {
                    "atualizada_em": string,"campos": NonNullable<Json>,"criada_em": string,"id": number,"mesclada_em": string | null,"mesclada_em_parte_id": number | null,"tipo": string
                  }
                  ComputedFields: never
                  Insert: {
                    "atualizada_em"?: string,"campos"?: NonNullable<Json>,"criada_em"?: string,"id"?: never,"mesclada_em"?: string | null,"mesclada_em_parte_id"?: number | null,"tipo": string
                  }
                  Update: {
                    "atualizada_em"?: string,"campos"?: NonNullable<Json>,"criada_em"?: string,"id"?: never,"mesclada_em"?: string | null,"mesclada_em_parte_id"?: number | null,"tipo"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "parte_mesclada_em_parte_id_fkey"
      columns: ["mesclada_em_parte_id"]
isOneToOne: false
      referencedRelation: "parte"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "parte_mesclada_em_parte_id_fkey"
      columns: ["mesclada_em_parte_id"]
isOneToOne: false
      referencedRelation: "parte_v"
      referencedColumns: ["id"]
    }
                  ]
                },"parte_organizacao": {
                  Row: {
                    "atualizada_em": string,"cnpj": string | null,"cnpj_exibicao": string | null,"mei": boolean,"nome_fantasia": string | null,"parte_id": number,"razao_social": string,"tipo": string
                  }
                  ComputedFields: never
                  Insert: {
                    "atualizada_em"?: string,"cnpj"?: string | null,"cnpj_exibicao"?: never,"mei"?: boolean,"nome_fantasia"?: string | null,"parte_id": number,"razao_social": string,"tipo"?: string
                  }
                  Update: {
                    "atualizada_em"?: string,"cnpj"?: string | null,"cnpj_exibicao"?: never,"mei"?: boolean,"nome_fantasia"?: string | null,"parte_id"?: number,"razao_social"?: string,"tipo"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "fk_parte_organizacao_parte"
      columns: ["parte_id","tipo"]
isOneToOne: false
      referencedRelation: "parte"
      referencedColumns: ["id","tipo"]
    },{
      foreignKeyName: "fk_parte_organizacao_parte"
      columns: ["parte_id","tipo"]
isOneToOne: false
      referencedRelation: "parte_v"
      referencedColumns: ["id","tipo"]
    }
                  ]
                },"parte_pessoa": {
                  Row: {
                    "atualizada_em": string,"cpf": string | null,"cpf_mascarado": string | null,"data_nascimento": string | null,"nome_civil": string,"nome_social": string | null,"parte_id": number,"tipo": string
                  }
                  ComputedFields: never
                  Insert: {
                    "atualizada_em"?: string,"cpf"?: string | null,"cpf_mascarado"?: never,"data_nascimento"?: string | null,"nome_civil": string,"nome_social"?: string | null,"parte_id": number,"tipo"?: string
                  }
                  Update: {
                    "atualizada_em"?: string,"cpf"?: string | null,"cpf_mascarado"?: never,"data_nascimento"?: string | null,"nome_civil"?: string,"nome_social"?: string | null,"parte_id"?: number,"tipo"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "fk_parte_pessoa_parte"
      columns: ["parte_id","tipo"]
isOneToOne: false
      referencedRelation: "parte"
      referencedColumns: ["id","tipo"]
    },{
      foreignKeyName: "fk_parte_pessoa_parte"
      columns: ["parte_id","tipo"]
isOneToOne: false
      referencedRelation: "parte_v"
      referencedColumns: ["id","tipo"]
    }
                  ]
                },"permissoes": {
                  Row: {
                    "acao": string,"criada_em": string,"descricao": string,"modulo": string,"slug": string
                  }
                  ComputedFields: never
                  Insert: {
                    "acao": string,"criada_em"?: string,"descricao": string,"modulo": string,"slug": string
                  }
                  Update: {
                    "acao"?: string,"criada_em"?: string,"descricao"?: string,"modulo"?: string,"slug"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "fk_permissoes_modulo"
      columns: ["modulo"]
isOneToOne: false
      referencedRelation: "modulo"
      referencedColumns: ["slug"]
    }
                  ]
                },"politica_sla": {
                  Row: {
                    "ativa": boolean,"atualizada_em": string,"calendario_id": number,"criada_em": string,"id": number,"primeira_resposta_min": number,"prioridade": string,"resolucao_min": number,"tipo_item": string
                  }
                  ComputedFields: never
                  Insert: {
                    "ativa"?: boolean,"atualizada_em"?: string,"calendario_id": number,"criada_em"?: string,"id"?: never,"primeira_resposta_min": number,"prioridade": string,"resolucao_min": number,"tipo_item": string
                  }
                  Update: {
                    "ativa"?: boolean,"atualizada_em"?: string,"calendario_id"?: number,"criada_em"?: string,"id"?: never,"primeira_resposta_min"?: number,"prioridade"?: string,"resolucao_min"?: number,"tipo_item"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "politica_sla_calendario_id_fkey"
      columns: ["calendario_id"]
isOneToOne: false
      referencedRelation: "calendario"
      referencedColumns: ["id"]
    }
                  ]
                },"produto": {
                  Row: {
                    "ativo": boolean,"atualizada_em": string,"codigo": string,"criada_em": string,"descricao": string | null,"id": number,"titulo": string
                  }
                  ComputedFields: never
                  Insert: {
                    "ativo"?: boolean,"atualizada_em"?: string,"codigo": string,"criada_em"?: string,"descricao"?: string | null,"id"?: never,"titulo": string
                  }
                  Update: {
                    "ativo"?: boolean,"atualizada_em"?: string,"codigo"?: string,"criada_em"?: string,"descricao"?: string | null,"id"?: never,"titulo"?: string
                  }
                  Relationships: [
                    
                  ]
                },"produto_preco": {
                  Row: {
                    "criada_em": string,"id": number,"moeda": string,"periodicidade": string,"produto_id": number,"valor": number,"vigente_ate": string | null,"vigente_de": string
                  }
                  ComputedFields: never
                  Insert: {
                    "criada_em"?: string,"id"?: never,"moeda"?: string,"periodicidade"?: string,"produto_id": number,"valor": number,"vigente_ate"?: string | null,"vigente_de"?: string
                  }
                  Update: {
                    "criada_em"?: string,"id"?: never,"moeda"?: string,"periodicidade"?: string,"produto_id"?: number,"valor"?: number,"vigente_ate"?: string | null,"vigente_de"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "produto_preco_produto_id_fkey"
      columns: ["produto_id"]
isOneToOne: false
      referencedRelation: "produto"
      referencedColumns: ["id"]
    }
                  ]
                },"tarefas": {
                  Row: {
                    "agente_id": string | null,"atualizada_em": string,"branch": string | null,"chave": string | null,"comando": string | null,"concluida_em": string | null,"criada_em": string,"criterio_pronto": string | null,"depende_de": string | null,"dono_id": string | null,"estimativa_min": number | null,"fase": string | null,"id": string,"metadata": NonNullable<Json>,"objetivo": string | null,"ordem": number | null,"origem": string,"origem_ref": string | null,"origem_tipo": string | null,"prazo": string | null,"projeto_ref": number | null,"prova": string | null,"status": string,"tipo": string,"titulo": string,"trilha": string
                  }
                  ComputedFields: never
                  Insert: {
                    "agente_id"?: string | null,"atualizada_em"?: string,"branch"?: string | null,"chave"?: string | null,"comando"?: string | null,"concluida_em"?: string | null,"criada_em"?: string,"criterio_pronto"?: string | null,"depende_de"?: string | null,"dono_id"?: string | null,"estimativa_min"?: number | null,"fase"?: string | null,"id"?: string,"metadata"?: NonNullable<Json>,"objetivo"?: string | null,"ordem"?: number | null,"origem"?: string,"origem_ref"?: string | null,"origem_tipo"?: string | null,"prazo"?: string | null,"projeto_ref"?: number | null,"prova"?: string | null,"status"?: string,"tipo"?: string,"titulo": string,"trilha"?: string
                  }
                  Update: {
                    "agente_id"?: string | null,"atualizada_em"?: string,"branch"?: string | null,"chave"?: string | null,"comando"?: string | null,"concluida_em"?: string | null,"criada_em"?: string,"criterio_pronto"?: string | null,"depende_de"?: string | null,"dono_id"?: string | null,"estimativa_min"?: number | null,"fase"?: string | null,"id"?: string,"metadata"?: NonNullable<Json>,"objetivo"?: string | null,"ordem"?: number | null,"origem"?: string,"origem_ref"?: string | null,"origem_tipo"?: string | null,"prazo"?: string | null,"projeto_ref"?: number | null,"prova"?: string | null,"status"?: string,"tipo"?: string,"titulo"?: string,"trilha"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "tarefas_agente_id_fkey"
      columns: ["agente_id"]
isOneToOne: false
      referencedRelation: "agentes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tarefas_depende_de_fkey"
      columns: ["depende_de"]
isOneToOne: false
      referencedRelation: "tarefas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tarefas_dono_id_fkey"
      columns: ["dono_id"]
isOneToOne: false
      referencedRelation: "usuarios"
      referencedColumns: ["id"]
    }
                  ]
                },"tipo_papel": {
                  Row: {
                    "ativo": boolean,"criada_em": string,"descricao": string | null,"modulo": string,"rotulo": string,"slug": string
                  }
                  ComputedFields: never
                  Insert: {
                    "ativo"?: boolean,"criada_em"?: string,"descricao"?: string | null,"modulo": string,"rotulo": string,"slug": string
                  }
                  Update: {
                    "ativo"?: boolean,"criada_em"?: string,"descricao"?: string | null,"modulo"?: string,"rotulo"?: string,"slug"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "tipo_papel_modulo_fkey"
      columns: ["modulo"]
isOneToOne: false
      referencedRelation: "modulo"
      referencedColumns: ["slug"]
    }
                  ]
                },"usuarios": {
                  Row: {
                    "ativo": boolean,"atualizada_em": string,"auth_user_id": string | null,"criado_em": string,"e_dono": boolean,"email": string,"id": string,"nome": string,"parte_id": number | null,"senha_trocada_em": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "ativo"?: boolean,"atualizada_em"?: string,"auth_user_id"?: string | null,"criado_em"?: string,"e_dono"?: boolean,"email": string,"id"?: string,"nome": string,"parte_id"?: number | null,"senha_trocada_em"?: string | null
                  }
                  Update: {
                    "ativo"?: boolean,"atualizada_em"?: string,"auth_user_id"?: string | null,"criado_em"?: string,"e_dono"?: boolean,"email"?: string,"id"?: string,"nome"?: string,"parte_id"?: number | null,"senha_trocada_em"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "usuarios_parte_id_fkey"
      columns: ["parte_id"]
isOneToOne: false
      referencedRelation: "parte"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "usuarios_parte_id_fkey"
      columns: ["parte_id"]
isOneToOne: false
      referencedRelation: "parte_v"
      referencedColumns: ["id"]
    }
                  ]
                },"usuarios_permissoes": {
                  Row: {
                    "concedida_em": string,"concedida_por": string | null,"permissao": string,"usuario_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "concedida_em"?: string,"concedida_por"?: string | null,"permissao": string,"usuario_id": string
                  }
                  Update: {
                    "concedida_em"?: string,"concedida_por"?: string | null,"permissao"?: string,"usuario_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "usuarios_permissoes_concedida_por_fkey"
      columns: ["concedida_por"]
isOneToOne: false
      referencedRelation: "usuarios"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "usuarios_permissoes_permissao_fkey"
      columns: ["permissao"]
isOneToOne: false
      referencedRelation: "permissoes"
      referencedColumns: ["slug"]
    },{
      foreignKeyName: "usuarios_permissoes_usuario_id_fkey"
      columns: ["usuario_id"]
isOneToOne: false
      referencedRelation: "usuarios"
      referencedColumns: ["id"]
    }
                  ]
                },"whatsapp_mensagem": {
                  Row: {
                    "atualizada_em": string,"criada_em": string,"destino_tipo": string | null,"direcao": string,"erro": string | null,"id": string,"ocorrida_em": string,"origem": string,"status": string,"status_em": string,"telefone": string,"texto": string,"wa_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "atualizada_em"?: string,"criada_em"?: string,"destino_tipo"?: never,"direcao": string,"erro"?: string | null,"id"?: string,"ocorrida_em"?: string,"origem": string,"status": string,"status_em"?: string,"telefone": string,"texto": string,"wa_id": string
                  }
                  Update: {
                    "atualizada_em"?: string,"criada_em"?: string,"destino_tipo"?: never,"direcao"?: string,"erro"?: string | null,"id"?: string,"ocorrida_em"?: string,"origem"?: string,"status"?: string,"status_em"?: string,"telefone"?: string,"texto"?: string,"wa_id"?: string
                  }
                  Relationships: [
                    
                  ]
                }
          }
          Views: {
            "parte_v": {
                  Row: {
                    "atualizada_em": string | null,"cnpj_exibicao": string | null,"cpf_mascarado": string | null,"criada_em": string | null,"exibicao": string | null,"id": number | null,"mei": boolean | null,"mesclada_em_parte_id": number | null,"tipo": string | null
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "parte_mesclada_em_parte_id_fkey"
      columns: ["mesclada_em_parte_id"]
isOneToOne: false
      referencedRelation: "parte"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "parte_mesclada_em_parte_id_fkey"
      columns: ["mesclada_em_parte_id"]
isOneToOne: false
      referencedRelation: "parte_v"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Functions: {
            "atualizar_status_whatsapp":
{ Args: { "p_status": string,"p_wa_id": string }; Returns: boolean
                           },
"cnpj_valido":
{ Args: { "p": string }; Returns: boolean
                           },
"consentimento_registrar":
{ Args: { "p_base_legal": string,"p_canal": string,"p_contato_id"?: number,"p_estado": string,"p_finalidade": string,"p_parte_id": number,"p_prova"?: string }; Returns: number
                           },
"consentimento_vigente":
{ Args: { "p_canal": string,"p_contato_id"?: number,"p_finalidade": string,"p_parte_id": number }; Returns: string
                           },
"contato_salvar":
{ Args: { "p_finalidade"?: string,"p_parte_id": number,"p_principal"?: boolean,"p_tipo": string,"p_valor": string }; Returns: number
                           },
"cpf_valido":
{ Args: { "p": string }; Returns: boolean
                           },
"criar_outbox_inbox":
{ Args: { "p_schema": string }; Returns: undefined
                           },
"documento_registrar":
{ Args: { "p_caminho": string,"p_hash": string,"p_mime"?: string,"p_modulo": string,"p_nome_arquivo": string,"p_parte_id"?: number,"p_tamanho_bytes"?: number,"p_tipo": string }; Returns: number
                           },
"e_dono":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"endereco_salvar":
{ Args: { "p_bairro"?: string,"p_cep"?: string,"p_cidade": string,"p_complemento"?: string,"p_endereco_id"?: number,"p_finalidade"?: string,"p_logradouro": string,"p_numero"?: string,"p_pais"?: string,"p_parte_id": number,"p_principal"?: boolean,"p_uf"?: string }; Returns: number
                           },
"guardar_segredo":
{ Args: { "p_nome": string,"p_valor": string }; Returns: string
                           },
"ligar_modulo":
{ Args: { "p_ligado": boolean,"p_modulo": string }; Returns: undefined
                           },
"marcar_senha_trocada":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"papel_parte_encerrar":
{ Args: { "p_papel_id": number,"p_vigente_ate"?: string }; Returns: undefined
                           },
"papel_parte_iniciar":
{ Args: { "p_parte_id": number,"p_tipo": string,"p_vigente_de"?: string }; Returns: number
                           },
"parte_atual":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"parte_dados_pessoais":
{ Args: { "p_parte_id": number }; Returns: Json
                           },
"parte_mesclar":
{ Args: { "p_destino": number,"p_origem": number }; Returns: undefined
                           },
"parte_salvar_organizacao":
{ Args: { "p_campos"?: Json,"p_cnpj"?: string,"p_mei"?: boolean,"p_nome_fantasia"?: string,"p_parte_id": number,"p_razao_social": string }; Returns: number
                           },
"parte_salvar_pessoa":
{ Args: { "p_campos"?: Json,"p_cpf"?: string,"p_data_nascimento"?: string,"p_nome_civil": string,"p_nome_social"?: string,"p_parte_id": number }; Returns: number
                           },
"pode_escrever_nucleo":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"produto_preco_definir":
{ Args: { "p_moeda"?: string,"p_periodicidade"?: string,"p_produto_id": number,"p_valor": number,"p_vigente_de"?: string }; Returns: number
                           },
"produto_salvar":
{ Args: { "p_ativo"?: boolean,"p_codigo": string,"p_descricao"?: string,"p_titulo": string }; Returns: number
                           },
"registrar_conexao":
{ Args: { "p_aplicacao_ref"?: string,"p_conta": string,"p_copias"?: (string)[],"p_dono_papel"?: string,"p_dono_usuario_id"?: string,"p_escopo"?: string,"p_estado"?: string,"p_provado_em"?: string,"p_rotacionado_em"?: string,"p_rotacionar_ate"?: string,"p_segredo_ref"?: string,"p_servico": string,"p_ultimo_uso_em"?: string }; Returns: string
                           },
"registrar_mensagem_whatsapp":
{ Args: { "p_direcao": string,"p_erro"?: string,"p_ocorrida_em"?: string,"p_origem": string,"p_status": string,"p_telefone": string,"p_texto": string,"p_wa_id": string }; Returns: string
                           },
"seed_empresa":
{ Args: { "p_email_dono": string,"p_nome": string,"p_nome_dono": string }; Returns: string
                           },
"segredo":
{ Args: { "p_nome": string }; Returns: string
                           },
"semear_tarefas":
{ Args: { "p_itens": Json }; Returns: number
                           },
"sessao_atual":
{ Args: Record<PropertyKey, never>; Returns: {
              "e_dono": boolean,"email": string,"nome": string,"permissoes": (string)[],"senha_trocada_em": string,"usuario_id": string
            }[]
                           },
"sincronizar_agentes":
{ Args: { "p_itens": Json }; Returns: number
                           },
"sincronizar_catalogo_ia":
{ Args: { "p_catalogo": Json }; Returns: Json
                           },
"somar_dias_uteis":
{ Args: { "p_calendario_id": number,"p_dias": number,"p_inicio": string }; Returns: string
                           },
"tem_permissao":
{ Args: { "p_perm": string }; Returns: boolean
                           },
"usuario_atual":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"usuario_vincular_parte":
{ Args: { "p_parte_id": number,"p_usuario_id": string }; Returns: undefined
                           },
"validar_campos":
{ Args: { "p_campos": Json,"p_entidade": string }; Returns: undefined
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"tarefas": {
          Tables: {
            "inbox": {
                  Row: {
                    "erro": string | null,"evento_id": string,"id": number,"origem": string,"processada_em": string | null,"recebida_em": string,"tentativas": number,"tipo": string
                  }
                  ComputedFields: never
                  Insert: {
                    "erro"?: string | null,"evento_id": string,"id"?: never,"origem": string,"processada_em"?: string | null,"recebida_em"?: string,"tentativas"?: number,"tipo": string
                  }
                  Update: {
                    "erro"?: string | null,"evento_id"?: string,"id"?: never,"origem"?: string,"processada_em"?: string | null,"recebida_em"?: string,"tentativas"?: number,"tipo"?: string
                  }
                  Relationships: [
                    
                  ]
                },"outbox": {
                  Row: {
                    "correlacao": string | null,"criada_em": string,"id": string,"payload": NonNullable<Json>,"publicada_em": string | null,"tipo": string,"versao": number
                  }
                  ComputedFields: never
                  Insert: {
                    "correlacao"?: string | null,"criada_em"?: string,"id"?: string,"payload"?: NonNullable<Json>,"publicada_em"?: string | null,"tipo": string,"versao"?: number
                  }
                  Update: {
                    "correlacao"?: string | null,"criada_em"?: string,"id"?: string,"payload"?: NonNullable<Json>,"publicada_em"?: string | null,"tipo"?: string,"versao"?: number
                  }
                  Relationships: [
                    
                  ]
                },"plano_atividade_modelo": {
                  Row: {
                    "agente_padrao_id": string | null,"artigo_ref": string | null,"aula_ref": string | null,"chave": string,"comando": string | null,"depende_de_id": number | null,"duracao_estimada_min": number | null,"etapa_id": number,"executor_padrao": string,"id": number,"instrucao": string,"objetivo": string | null,"ordem": number,"prazo_dias": number | null,"prazo_tipo": string,"prova": string | null,"titulo": string
                  }
                  ComputedFields: never
                  Insert: {
                    "agente_padrao_id"?: string | null,"artigo_ref"?: string | null,"aula_ref"?: string | null,"chave": string,"comando"?: string | null,"depende_de_id"?: number | null,"duracao_estimada_min"?: number | null,"etapa_id": number,"executor_padrao"?: string,"id"?: never,"instrucao": string,"objetivo"?: string | null,"ordem": number,"prazo_dias"?: number | null,"prazo_tipo"?: string,"prova"?: string | null,"titulo": string
                  }
                  Update: {
                    "agente_padrao_id"?: string | null,"artigo_ref"?: string | null,"aula_ref"?: string | null,"chave"?: string,"comando"?: string | null,"depende_de_id"?: number | null,"duracao_estimada_min"?: number | null,"etapa_id"?: number,"executor_padrao"?: string,"id"?: never,"instrucao"?: string,"objetivo"?: string | null,"ordem"?: number,"prazo_dias"?: number | null,"prazo_tipo"?: string,"prova"?: string | null,"titulo"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "plano_atividade_modelo_depende_de_id_fkey"
      columns: ["depende_de_id"]
isOneToOne: false
      referencedRelation: "plano_atividade_modelo"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "plano_atividade_modelo_etapa_id_fkey"
      columns: ["etapa_id"]
isOneToOne: false
      referencedRelation: "plano_etapa_modelo"
      referencedColumns: ["id"]
    }
                  ]
                },"plano_etapa_modelo": {
                  Row: {
                    "chave": string,"fase": string | null,"id": number,"inicio_dias": number,"modelo_id": number,"objetivo": string | null,"ordem": number,"titulo": string,"trilha": string
                  }
                  ComputedFields: never
                  Insert: {
                    "chave": string,"fase"?: string | null,"id"?: never,"inicio_dias"?: number,"modelo_id": number,"objetivo"?: string | null,"ordem": number,"titulo": string,"trilha"?: string
                  }
                  Update: {
                    "chave"?: string,"fase"?: string | null,"id"?: never,"inicio_dias"?: number,"modelo_id"?: number,"objetivo"?: string | null,"ordem"?: number,"titulo"?: string,"trilha"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "plano_etapa_modelo_modelo_id_fkey"
      columns: ["modelo_id"]
isOneToOne: false
      referencedRelation: "plano_modelo"
      referencedColumns: ["id"]
    }
                  ]
                },"plano_instancia": {
                  Row: {
                    "criada_em": string,"dono_id": string | null,"id": number,"inicio_em": string,"modelo_id": number,"parte_id": number | null,"projeto_ref": number | null,"status": string
                  }
                  ComputedFields: never
                  Insert: {
                    "criada_em"?: string,"dono_id"?: string | null,"id"?: never,"inicio_em": string,"modelo_id": number,"parte_id"?: number | null,"projeto_ref"?: number | null,"status"?: string
                  }
                  Update: {
                    "criada_em"?: string,"dono_id"?: string | null,"id"?: never,"inicio_em"?: string,"modelo_id"?: number,"parte_id"?: number | null,"projeto_ref"?: number | null,"status"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "plano_instancia_modelo_id_fkey"
      columns: ["modelo_id"]
isOneToOne: false
      referencedRelation: "plano_modelo"
      referencedColumns: ["id"]
    }
                  ]
                },"plano_modelo": {
                  Row: {
                    "caminho_origem": string,"carregado_em": string,"chave": string,"descricao": string | null,"hash": string,"id": number,"titulo": string,"versao": number
                  }
                  ComputedFields: never
                  Insert: {
                    "caminho_origem": string,"carregado_em"?: string,"chave": string,"descricao"?: string | null,"hash": string,"id"?: never,"titulo": string,"versao": number
                  }
                  Update: {
                    "caminho_origem"?: string,"carregado_em"?: string,"chave"?: string,"descricao"?: string | null,"hash"?: string,"id"?: never,"titulo"?: string,"versao"?: number
                  }
                  Relationships: [
                    
                  ]
                },"tarefa_plano": {
                  Row: {
                    "atividade_modelo_id": number | null,"etapa_modelo_id": number,"instancia_id": number,"prazo_original_em": string | null,"prazo_previsto_em": string | null,"tarefa_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "atividade_modelo_id"?: number | null,"etapa_modelo_id": number,"instancia_id": number,"prazo_original_em"?: string | null,"prazo_previsto_em"?: string | null,"tarefa_id": string
                  }
                  Update: {
                    "atividade_modelo_id"?: number | null,"etapa_modelo_id"?: number,"instancia_id"?: number,"prazo_original_em"?: string | null,"prazo_previsto_em"?: string | null,"tarefa_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "fk_tarefa_plano_tarefa"
      columns: ["tarefa_id"]
isOneToOne: true
      referencedRelation: "v_fila_agente"
      referencedColumns: ["tarefa_id"]
    },{
      foreignKeyName: "fk_tarefa_plano_tarefa"
      columns: ["tarefa_id"]
isOneToOne: true
      referencedRelation: "v_tarefa_com_instrucao"
      referencedColumns: ["tarefa_id"]
    },{
      foreignKeyName: "tarefa_plano_atividade_modelo_id_fkey"
      columns: ["atividade_modelo_id"]
isOneToOne: false
      referencedRelation: "plano_atividade_modelo"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tarefa_plano_etapa_modelo_id_fkey"
      columns: ["etapa_modelo_id"]
isOneToOne: false
      referencedRelation: "plano_etapa_modelo"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tarefa_plano_instancia_id_fkey"
      columns: ["instancia_id"]
isOneToOne: false
      referencedRelation: "plano_instancia"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            "v_fila_agente": {
                  Row: {
                    "agente_id": string | null,"chave": string | null,"criada_em": string | null,"estimativa_min": number | null,"prazo": string | null,"status": string | null,"tarefa_id": string | null,"titulo": string | null,"trilha": string | null
                  }
                  ComputedFields: never
                  Insert: {
                           "agente_id"?: string | null,"chave"?: string | null,"criada_em"?: string | null,"estimativa_min"?: number | null,"prazo"?: string | null,"status"?: string | null,"tarefa_id"?: string | null,"titulo"?: string | null,"trilha"?: string | null
                         }
                        Update: {
                           "agente_id"?: string | null,"chave"?: string | null,"criada_em"?: string | null,"estimativa_min"?: number | null,"prazo"?: string | null,"status"?: string | null,"tarefa_id"?: string | null,"titulo"?: string | null,"trilha"?: string | null
                         }
                        Relationships: [
                    
                  ]
                },"v_tarefa_com_instrucao": {
                  Row: {
                    "agente_id": string | null,"artigo_ref": string | null,"aula_ref": string | null,"comando": string | null,"dono_id": string | null,"fase": string | null,"instancia_id": number | null,"instrucao": string | null,"prazo": string | null,"prazo_original_em": string | null,"prazo_previsto_em": string | null,"prova": string | null,"status": string | null,"tarefa_id": string | null,"titulo": string | null,"trilha": string | null
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "tarefa_plano_instancia_id_fkey"
      columns: ["instancia_id"]
isOneToOne: false
      referencedRelation: "plano_instancia"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Functions: {
            "carregar_modelo_plano":
{ Args: { "p_modelo": Json }; Returns: number
                           },
"fn_instanciar":
{ Args: { "p_dono": string,"p_inicio": string,"p_modelo_id": number,"p_parte_id": number,"p_servico": boolean }; Returns: number
                           },
"instanciar_plano":
{ Args: { "p_inicio": string,"p_modelo_id": number,"p_parte_id"?: number }; Returns: number
                           },
"instanciar_plano_servico":
{ Args: { "p_inicio": string,"p_modelo_id": number,"p_parte_id"?: number }; Returns: number
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "organograma": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            
          }
        },"tarefas": {
          Enums: {
            
          }
        }
} as const
