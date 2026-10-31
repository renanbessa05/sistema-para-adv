# Fluxo de trabalho: onde cada coisa mora e para onde cada tela leva

Reorganização de 31/10/2026. O sistema tem **um fio** e tudo o mais é ferramenta chamada de dentro dele. Quem usa são dois advogados; o dia começa pela publicação do DJEN/PJe. A pergunta que cada tela responde é "o que eu faço agora?", e a resposta está na caixa **Próximo passo** no topo das telas de detalhe (`src/components/dominio/ProximoPasso.tsx`).

## 1. O fio

```
Publicação chega (DJEN, ou lançada à mão em Publicações → Lançar intimação)
  → classificada pela IA (job classificar, a cada 5 min)
  → DECISÃO: vincular a processo | cadastrar na carteira | não é nosso | duplicada
  → prazo sugerido pelo motor (nasce na classificação; ou no vínculo manual, se a IA disse que gera prazo)
  → DECISÃO: confirmar (pode ajustar ato/data) | rejeitar | sem prazo
  → tarefa "protocolar" nasce sozinha (trigger app.sincronizar_tarefas_do_prazo), vencimento = data interna
  → da tarefa: "Redigir peça" → minuta ligada a processo + prazo + tarefa
  → minuta: etapas/redação → revisão pela IA (opcional) → aprovação → DECISÃO: protocolada
  → protocolada: tarefa concluída, prazo cumprido, publicação tratada (RPC minuta_marcar_protocolada, migration 0055)
```

Paralelo, o **caso novo**: Cliente → Entrada de caso (Contrato: diagnóstico, honorários, documentos) → Processo → entra no fio acima.

## 2. Encadeamento nas telas (o que acontece depois de cada ação)

| Ação | Onde | Depois |
|---|---|---|
| Vincular publicação | `/publicacoes/[id]` | Se a classificação gera prazo, o prazo sugerido é criado na hora e a tela vai para `/prazos/[id]`. Senão, volta à publicação com o próximo passo "tem prazo?". |
| Confirmar prazo | `/prazos/[id]` | Vai para a tarefa criada (`/tarefas/[id]`), onde está o botão da peça. |
| Redigir peça | `/tarefas/[id]` → `/minutas/nova?processo=&prazo=&tarefa=` | Tipo de peça sugerido pelo ato do prazo (`src/lib/pecas/tipo-por-ato.ts`), modo A por padrão quando há processo. |
| Revisar esta versão com a IA | `/minutas/[id]` | Grava em `minuta_revisoes` ligada à versão e abre o relatório em `/revisor?rev=`; o relatório tem "voltar à peça". |
| Marcar protocolada | `/minutas/[id]` | Fecha tarefa e prazo; a publicação de origem vira tratada. |

## 3. Menu (8 itens) e o que cada tela absorve

| Menu | Rota | Absorve |
|---|---|---|
| Hoje | `/hoje` | Caixa **Decidir agora** (prazos sugeridos, publicações a decidir, aprovações pendentes) + indicadores + prazos da semana + tarefas |
| Publicações | `/publicacoes` | Lançar intimação (`/publicacoes/nova`) |
| Prazos | `/prazos` | Aba Audiências (`/audiencias` continua existindo) |
| Tarefas | `/tarefas` | Quadro por status |
| Processos | `/processos` | Kanban e Importar como botões; detalhe em abas: Visão geral, Andamento, Prazos e tarefas (com audiências), Peças (minutas, análises, cálculos), Documentos, Contrato |
| Clientes | `/clientes` | Contratos e Atendimento como botões; detalhe em abas: Dados e contatos, Processos, Contratos e parcelas, Conversas, Documentos |
| Peças | `/minutas` | Três portas: Nova peça, Revisar peça pronta (`/revisor`), Varrer os autos (`/varreduras/nova`); ferramentas: Cálculos, Jurisprudência, Assistente |
| Configurações | `/configuracoes` | Grade por grupos; Operação reúne Rotinas, Divergências e Relatórios (produtividade, métricas, custo de IA e CSV mensal em abas; `/relatorios`, `/admin/metricas` e `/admin/ia` só redirecionam) |

No cabeçalho: **Assistente** e **Aprovações** (com contador), além do sino de notificações. Nenhuma rota antiga foi apagada; só saíram do menu. Reverter o menu é trocar `src/app/(painel)/menu.ts`.

## 4. Regras de ouro ao mexer em tela

1. Toda tela de detalhe (publicação, prazo, tarefa, minuta) mostra `ProximoPasso` no topo, com um botão só.
2. Toda ação que gera o objeto seguinte do fio redireciona para ele (não fica parada na mesma página).
3. Nova funcionalidade entra como aba ou botão de uma tela-mãe (Processo, Cliente, Peças, Prazos, Configurações), não como item de menu.
4. Ferramenta de IA (varredura, mapa do julgador, outros tribunais, cálculo, revisor) é chamada de dentro do processo ou da peça, com `?processo=` preenchido.
