# Estados de publicação, prazo e tarefa

Cada transição abaixo existe como RPC no banco (`transicionar_publicacao`, `confirmar_prazo` etc.), grava um evento na tabela `*_eventos` e é coberta por teste. Transição fora desta tabela é recusada.

## Publicação (`publicacoes.status`)

| De | Para | Quem | Quando |
|---|---|---|---|
| (captada) | `nova` | sistema | ao gravar a publicação captada ou lançada manualmente |
| `nova` | `classificada` | sistema (IA) | classificador devolveu tipo, `gera_prazo`, resumo |
| `classificada` | `vinculada` | sistema | número CNJ bate com processo da carteira |
| `classificada` | `sem_processo` | sistema | nenhum processo da carteira com o número |
| `sem_processo` | `vinculada` | advogado, sócio, administrativo | "cadastrar na carteira" (cria o processo) ou vínculo manual |
| `sem_processo` | `ignorada` | advogado, sócio, administrativo | "não é nosso", com motivo (homônimo, processo de colega, outro) |
| `vinculada` | `com_prazo_sugerido` | sistema | `gera_prazo = true`: cria 1..N prazos em `sugerido` |
| `vinculada` | `sem_prazo` | sistema ou humano | `gera_prazo = false` (despacho de mero expediente) ou decisão humana com motivo |
| `com_prazo_sugerido` | `tratada` | sistema | todos os prazos sugeridos foram confirmados ou rejeitados |
| `sem_prazo` | `tratada` | advogado, sócio | "ciente", com motivo opcional |
| qualquer | `duplicada` | sistema ou humano | mesmo `id_externo` ou mesmo `hash_dedup`; aponta `publicacao_anterior_id` |
| `tratada`, `ignorada`, `duplicada`, `sem_prazo` | `arquivada` | sistema | após 30 dias, para limpar a caixa |

"Sem tratamento" para o alerta de 24 h úteis = status em `nova`, `classificada`, `vinculada`, `sem_processo` ou `com_prazo_sugerido`.

Estagiário vê e comenta; não transiciona. Administrativo trata `sem_processo` e `duplicada`, mas não decide prazo.

## Prazo (`prazos.status`)

| De | Para | Quem | Regra |
|---|---|---|---|
| (criado) | `sugerido` | sistema | motor calculou; guarda `data_sugerida_ia` e `memoria_calculo` |
| `sugerido` | `confirmado` | advogado responsável, colaborador advogado ou sócio | pode alterar ato, multiplicador e data antes; guarda `data_confirmada`, `confirmado_por`, `confirmado_em`; se `calendario_incompleto`, exige reconhecimento explícito; cria a tarefa |
| `sugerido` | `rejeitado` | advogado responsável, colaborador advogado ou sócio | com motivo (não gera prazo, intimação de terceiro, erro de classificação) |
| `confirmado`, `suspenso`, `prorrogado` | `suspenso` ou `prorrogado` | advogado responsável, colaborador advogado ou sócio | `suspender_ou_prorrogar_prazo`: fundamento (ato normativo ou decisão) obrigatório; prorrogar exige nova data final ≥ atual; suspenso pode ser prorrogado, prorrogado pode ser prorrogado de novo ou suspenso; recalcula `data_interna` quando a data muda; mantém histórico |
| `suspenso` | `confirmado` | advogado responsável, colaborador advogado ou sócio | `retomar_prazo`: fundamento obrigatório; nova data final opcional (≥ atual), recalculando `data_interna`; evento `retomado` |
| `suspenso`, `prorrogado` | `confirmado` | advogado responsável, colaborador advogado ou sócio | `confirmar_prazo` (revisão de ato, multiplicador e data, como na confirmação inicial); a tela expõe só `retomar_prazo` para suspenso |
| `confirmado`, `prorrogado` | `cumprido` | advogado, sócio, ou sistema pela tarefa | `cumprido_em`, `cumprimento_evidencia` (tarefa, manual, datajud, pje) |
| `confirmado`, `prorrogado` | `vencido` | sistema (job diário 0h05) | data final passou sem cumprimento; aparece em vermelho até alguém marcar cumprido ou cancelar com motivo. Prazo `suspenso` não vence: precisa ser retomado antes |
| `confirmado`, `prorrogado`, `vencido` | `cancelado` | advogado, sócio | com motivo (prazo não existia, processo encerrado) |

Estagiário e administrativo nunca confirmam, rejeitam ou cumprem prazo (Lei 8.906/94, art. 3º, §2º).

## Tarefa (`tarefas.status`)

| De | Para | Quem |
|---|---|---|
| (criada) | `a_fazer` | sistema (ao confirmar prazo, por publicação sem prazo, audiência, WhatsApp ou manual) |
| `a_fazer` | `em_andamento` | executor, responsável, sócio |
| `em_andamento` | `pronta_para_revisao` | executor (estagiário chega só até aqui) |
| `pronta_para_revisao`, `em_andamento`, `a_fazer` | `concluida` | advogado, sócio; ao concluir tarefa ligada a prazo o sistema pergunta "protocolado? marcar prazo como cumprido" |
| qualquer não terminal | `cancelada` | advogado, sócio, com motivo |
| qualquer não terminal | mesmo status, outro executor | responsável, sócio ou o próprio executor ("reatribuir"); pelo WhatsApp exige confirmação e grava em `aprovacoes` |

"Atrasada" = `vencimento` (data interna) passou e status não é `concluida` nem `cancelada`. "Crítica" = data final do prazo ligado é hoje ou já passou.
