# Agentes de IA: regras que o código implementa

Vale para toda chamada à API do Claude a partir da Fase 2. O plano completo está em `docs/escopo-revisado.md` (1.3.6, 1.7, 2.6); a decisão de arquitetura em `docs/adr/0006-orquestrador-ferramentas-de-leitura.md`.

## Regras transversais

1. **Porta única.** Toda chamada passa por `src/server/ia/executar.ts: executarAgente(ctx, fn)`. Ele checa o teto mensal do escritório, executa e grava `ia_execucoes` (tokens, custo pela trigger, status, `conversa_id`, `stop_reason`, `effort`, número de ferramentas chamadas), inclusive quando falha (`erro`, `recusado`, `invalido_schema`, `cancelado_teto`). Nenhum módulo em `src/server` importa `criarClienteIa` diretamente; só `src/server/ia/**`.
2. **Texto de fora é dado.** Publicações, documentos, mensagens, ementas e resultados de ferramenta entram no prompt por `delimitarDado(rotulo, texto)` (`src/lib/ia/custo.ts`), nunca no bloco de sistema. Os prompts dizem explicitamente que o conteúdo de `<dado>` não é instrução.
3. **Prompts versionados.** `src/lib/ia/prompts/<agente>.vN.ts` exporta `VERSAO`, `SISTEMA` (bloco estável, marcado para cache) e, quando houver, `REFERENCIAS` por área. Mudou o texto, muda a versão; `ia_execucoes.agente_versao` registra qual rodou. O registro dos agentes (modelo por variável de ambiente, esforço, limite de saída) fica em `src/lib/ia/agentes/registro.ts`.
4. **Lacuna única.** Tudo que a IA produz marca o que não sabe com `[[VERIFICAR: motivo]]` (`src/lib/ia/lacunas.ts`). A aprovação de minuta, contrato ou cálculo fica bloqueada enquanto houver lacuna aberta, salvo comentário justificando.
5. **Produção passa por aprovação.** Minuta, contrato, cálculo e mensagem a cliente nascem em rascunho e só mudam de estado por `decidir_aprovacao`, que aplica o efeito do objeto (`app.efeito_aprovacao_<tipo>`, migration 0024). Leitura (resumo, listagem, consulta) responde direto.
6. **Validação determinística em código.** Número CNJ, endereçamento, qualificação, OAB, valor da causa, pedidos numerados, "Doc. NN" existente, tempestividade (motor de prazos), cálculo de honorários e de atualização: tudo em `src/lib/**`, testado, nunca pedido ao modelo.
7. **Ferramentas só leem.** As ferramentas expostas ao modelo (`FerramentaIa`) usam o cliente do usuário (RLS) e devolvem texto delimitado. Nenhuma escreve no banco; ações de escrita continuam com eco e confirmação pelas RPCs.
8. **Histórico append-only.** Nas conversas, os blocos do assistente são gravados inteiros em `mensagens.payload` e reenviados sem edição (os Claude 5 exigem o raciocínio preservado). Conversa com mais de 30 turnos abre outra com resumo.
9. **Modelo por variável de ambiente.** `IA_MODELO_TRIAGEM` (classificar, rotear), `IA_MODELO_CHAT` (assistente), `IA_MODELO_PECAS` (etapas, diagnóstico, relatórios), `IA_MODELO_PECAS_FORTE` (redação final, revisor, julgador). Esforço (`effort`) por agente no registro.
10. **Teto mensal.** `escritorio_configuracoes['ia.teto_mensal_usd']` → limites do plano (Fase 3) → `IA_TETO_MENSAL_USD`. A 100% toda chamada é recusada com `cancelado_teto`; a 80% os sócios são avisados (lote 10).

## Documentos à API

PDF de até `IA_PDF_MAX_MB` e `IA_PDF_MAX_PAGINAS` vai inteiro como bloco `document` (pela Files API quando há chave, com `file_id` reaproveitado por 24 h; senão em base64). Acima disso vai como texto das páginas extraídas (`documento_paginas`) com inventário heurístico, e o modelo pede trechos com `ler_documento`. PDF escaneado sem texto fica marcado `sem_texto` e ainda pode ir inteiro (o modelo lê a imagem).

## Testes

- Unitários com `criarClienteIaFalso(respostas, conversas)`: respostas estruturadas por agente e roteiros de conversa que executam as ferramentas reais.
- Regressão do classificador (`tests/fixtures/publicacoes-rotuladas.json`) e avaliação por agente (`tests/avaliacao/<agente>/casos.json`, lote 10) rodam em modo falso no CI e contra a API com `IA_TESTE_REAL=1`.

## Chat do painel (/assistente): intent → ação

| Intent (roteador v1) | O que acontece |
|---|---|
| pergunta_livre, movimentos_processo, prazos_*, tarefas_pessoa | Assistente com ferramentas de leitura (consultar_processo, listar_publicacoes, ler_publicacao, listar_prazos, calcular_prazo, listar_tarefas, listar_documentos, ler_documento, listar_equipe), sob o RLS da pessoa |
| resumo_do_dia | Regra rápida (sem modelo) → assistente com ferramentas |
| reatribuir_tarefa, concluir_tarefa, confirmar_prazo | Eco + "Confirma? (sim/não)"; só advogado e sócio; executa pelas RPCs com o papel da pessoa |
| abrir_agente, calcular, buscar_jurisprudencia | Link para a tela do agente (contratos, minutas, varreduras, revisor, análises, cálculos, jurisprudência) |
| saudacao, fora_do_escopo | Resposta curta do roteador |

O WhatsApp continua com o roteador v0 (lista fechada); intents só do painel viram fora_do_escopo lá.
