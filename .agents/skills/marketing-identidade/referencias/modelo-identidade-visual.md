# Identidade da marca - <Nome da empresa>

- Estado: rascunho
- Versão: 1.0 (<AAAA-MM-DD>)
- Fonte: dossiê da empresa, registro <AAAA-MM-DD_HHMMSS>; persona <aprovada em AAAA-MM-DD, ou ainda não feita>; materiais do dono: os da seção 9. Fontes, ou nenhum
- Como ler as marcas: (dossiê 4.2) é o que o dono respondeu na pergunta 4.2; (persona) vem da persona aprovada; (site [1]), (instagram [2]), (apresentação [3]) e (logo [4]) vêm do material do próprio dono, e o número aponta a linha da seção 9. Fontes; (pesquisa [5]) é referência pública, também na seção 9; (proposta do time) é escolha que o dono pode trocar; (hipótese) é dedução que ainda precisa de confirmação.
- Dados para o sistema: o bloco no fim do documento é lido pela tela Marca e pelos tokens do sistema; ele é conferido por marca_dados.py e não se edita à mão sem conferir de novo.

## 1. Plataforma da marca

- Propósito (por que a empresa existe, além de vender): <o que o dono disse> (dossiê 4.2)
- Posicionamento, alternativas que o cliente tem hoje: <o que o dono disse> (dossiê 4.5)
- Posicionamento, o que só esta empresa tem: <atributo e prova> (dossiê 4.2)
- Posicionamento, valor que isso entrega ao cliente: <valor> (dossiê 5.1)
- Posicionamento, para quem é: <resumo da persona aprovada> (persona)
- Posicionamento, categoria em que a empresa quer ser comparada: <categoria> (proposta do time)
- Frase de posicionamento: <uma frase que junta os cinco itens> (proposta do time)
- Promessa: <garantia que o dono deu> (dossiê 5.1)
- O que a marca nunca promete: <o que o dono disse> (dossiê 5.2)
- Valores (até 4): <valores> (dossiê 10.1)
- O que a marca não é: <contraste com o que o dono recusa> (hipótese)

## 2. Personalidade e arquétipo

- Personalidade em 3 a 5 palavras: <palavras> (dossiê 4.2 e 10.1)
- Arquétipo principal: <um dos 12 arquétipos> (proposta do time: linguagem para descrever a personalidade, não um fato sobre a empresa)
- Arquétipo secundário: <um dos 12, ou "nenhum"> (proposta do time)
- Por quê: <1 frase ligada ao que o dono disse> (hipótese)

## 3. Logo

- Arquivos e regras de uso: <ver empresa/marca/logo/logo.md, ou "o dono ainda não entregou o logo"> (logo [4])
- Área de proteção: deixar ao redor uma margem livre de pelo menos a altura de uma letra do próprio logo (proposta do time).
- Tamanho mínimo: <tamanho em que o desenho ainda se lê, conferido olhando o arquivo> (proposta do time)
- Versões: <principal, ícone, para fundo claro e para fundo escuro, as que existem> (logo [4])
- Usos proibidos: não esticar, não girar, não trocar as cores, não colocar sobre foto que atrapalhe a leitura (proposta do time).
- Certo: <o logo em uso correto, descrito> (proposta do time)
- Errado: <o logo em uso errado, descrito> (proposta do time)

## 4. Cores

| Cor | HEX | Função | Origem |
|---|---|---|---|
| <nome> | <#RRGGBB> | <principal, apoio, destaque, fundo, texto ou neutro> | (logo [4]) ou (proposta do time: <um motivo ligado ao dossiê>) |

Contraste (saída do paleta.py, colada sem mudar):

<tabela de cores e de pares gerada pelo paleta.py>

- Pares usados como texto sobre fundo: <lista dos pares que passaram de 4,5> (proposta do time)
- Pares que só servem de destaque, nunca de texto: <lista> (proposta do time)
- Proporção de uso como orientação: cerca de 60% a cor de fundo, 30% a de apoio e 10% a de destaque (pesquisa [5])

## 5. Tipografia

| Uso | Família | Pesos | Tamanho | Origem e licença |
|---|---|---|---|---|
| Títulos | <família> | <pesos> | <tamanho em pt> | (site [1]) ou (proposta do time: Google Fonts, licença aberta) |
| Texto | <família> | <pesos> | <tamanho em pt> | (site [1]) ou (proposta do time: Google Fonts, licença aberta) |
| Reserva de sistema | <Arial, Georgia ou similar> | normal e negrito | igual ao texto | (proposta do time: vem com o computador) |

- Hierarquia: <como título, subtítulo e texto se diferenciam em tamanho e peso> (proposta do time)

## 6. Imagem e elementos

- Estilo de foto: <o que mostrar e como, com exemplo certo e errado> (hipótese)
- Ícones e grafismos: <estilo> (proposta do time)
- Imagem feita por IA: só como rascunho de ideia, nunca para o logo (proposta do time).

## 7. Aplicações

- Post e story: <regra com exemplo certo e errado> (proposta do time)
- WhatsApp (foto de perfil e mensagens): <regra> (proposta do time)
- Apresentação: <regra> (proposta do time)
- Assinatura de e-mail e cartão: <regra> (proposta do time)

## 8. Regras de ouro

| Faça | Não faça |
|---|---|
| <regra verificável com exemplo> (proposta do time) | <regra verificável com exemplo> (proposta do time) |

## 9. Fontes

- [1] site: <https://endereço> Visto em <AAAA-MM-DD>.

## Anexo

### O que o dono disse

- <AAAA-MM-DD> | Pergunta do time: <pergunta> | Resposta do dono: "<frase literal>"

### Trechos dos materiais

- [1] "<trecho literal do material, com 4 palavras ou mais, que sustenta uma linha do documento>"

## Dados para o sistema

```marca-dados
{"documento":"identidade","versao":1,
 "personalidade":{"palavras":["<palavra>"],"arquetipo":{"principal":"<arquétipo>","secundario":null}},
 "cores":[{"nome":"<nome da cor>","hex":"<#RRGGBB>","funcao":"<função>","origem":"<origem>"}],
 "pares":[{"texto":"<nome da cor do texto>","fundo":"<nome da cor do fundo>","razao":0,"uso":"<texto ou destaque>"}],
 "tipografia":[{"uso":"<titulos, texto ou reserva>","familia":"<família>","pesos":[400],"fonte":"<google, sistema ou outra>","licenca":"<OFL, Apache ou sistema>","origem":"<origem>"}],
 "materiais":[{"n":1,"tipo":"<site, instagram, apresentacao, logo ou pesquisa>","alvo":"<endereço ou arquivo>","visto_em":"<AAAA-MM-DD>"}]}
```
