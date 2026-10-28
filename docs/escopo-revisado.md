# Plano de desenvolvimento: Assistente Jurídica com IA

## Contexto

**Por que este plano existe.** O escritório (Costa Abdo Advocacia, Mato Grosso) escreveu um documento de concepção em 27/10/2026 ("Assistente Jurídica com IA — Concepção do Sistema") descrevendo uma assistente central com IA que capta publicações do DJEN, sugere prazos, distribui tarefas, acompanha a carteira pelo DataJud, conversa pelo WhatsApp e, nas fases seguintes, redige e revisa peças, pesquisa jurisprudência, faz cálculos e atende clientes. Tudo com aprovação humana antes de sair.

**Estado atual.** O repositório `renanbessa05/sistema-para-adv` está vazio (zero commits, zero branches). O trabalho acontece na branch `claude/confident-darwin-5z65s7`. Não há código a reaproveitar; há seis skills em Markdown já escritas pelo escritório (petições TJ-MT, conferência de petição, varredura de oportunidades, julgador TJ-MT, contratação e honorários, análise em outros tribunais) que viram agentes na Fase 2.

**O que este plano entrega.** Duas partes. A Parte 1 é a revisão do escopo: o que precisa mudar no documento e o que falta nele para dar para construir. A Parte 2 é o plano de construção, da Fase 0 à Fase 3, já incorporando a Parte 1. O plano é para a dona do projeto analisar e aprovar antes de qualquer código.

**Como foi feito.** Leitura integral do documento (texto e figuras), das seis skills e do repositório; duas lentes de análise automatizadas (produto e modelo de dados) com 28 achados; análise direta das demais áreas (captação, integrações, IA, jurídico, gestão); três verificações de fatos na web (DJEN/DataJud/prazos; WhatsApp/Supabase/Google/Claude; LGPD/OAB/CNJ); um agente arquiteto desenhou a Parte 2 sobre a Parte 1 e apontou nove inconsistências, resolvidas no texto. Onde um fato ainda não foi verificado, está marcado "(a confirmar)".

**Como ler.** Com pouco tempo: 1.1 (resumo executivo), 1.4 (decisões), 1.5 (insumos) e 2.4 (as duas primeiras semanas). O resto é referência para executar: 1.2 e 1.3 dizem o que muda no escopo e por quê; 2.3 é o modelo de dados; 2.5 a 2.7 são as semanas e entregas; 2.9 os critérios de aceite; 2.10 a primeira sessão; Apêndice A as fontes.

## Premissas confirmadas pela dona do projeto (28/10/2026)

| Pergunta | Resposta | Consequência no plano |
|---|---|---|
| Quem desenvolve | Ela mesma, com o Claude Code | Etapas pequenas e executáveis neste repositório, cada uma com critério de "pronto" verificável e aprovação dela ao fim |
| Profundidade | Todas as quatro fases em detalhe | Fases 0 e 1 semana a semana; Fases 2 e 3 por entrega, com dependências e decisões |
| Justiças em que atua | Só TJ-MT (cível, família, consumidor, servidores) | Motor de prazos do MVP cobre apenas CPC em dias úteis + calendário forense do TJ-MT por comarca + recesso; sem Juizados, Trabalho ou Federal |
| Controle atual de prazos e carteira | Só pelo PJe e e-mails de intimação | Não há base para importar; a carteira é levantada do zero e o teste de captação compara o DJEN com o PJe e os e-mails |

---

# Parte 1. Revisão do escopo: o que muda e o que falta

## 1.1 Resumo executivo

O documento acerta no essencial: começar pelo que dói (publicações, prazos, tarefas), aprovação humana para tudo que sai, multi-escritório desde o banco, conectores por adaptador e medir uso desde o início. Está frágil onde o erro custa um prazo: a regra de contagem não está escrita, o calendário forense não existe no modelo, o fluxo da publicação não tem estados, as permissões por papel não existem e o modelo de dados tem um terço das tabelas necessárias. A arquitetura "assistente central + 8 agentes" foi importada de um vídeo e é mais do que o MVP precisa; o MVP é um pipeline: captar, classificar, calcular, confirmar, criar tarefa, avisar.

**Os oito pontos que mais mudam o jogo**

1. **Escrever a regra de prazo antes de qualquer tela.** Termo inicial (disponibilização → publicação no 1º dia útil seguinte → contagem a partir do dia útil seguinte), dias úteis, dobro, recesso, feriado da comarca. O documento resume isso a "dias úteis, feriados do TJ-MT".
2. **Calendário forense é dado, não código.** Tabela de feriados por tribunal e comarca, alimentada pela Portaria anual do TJ-MT; processo precisa saber sua comarca. Prazo sem calendário completo não pode ser confirmado sem aviso.
3. **O DJEN é a fonte oficial, e isso simplifica o MVP.** Desde 16/05/2025 os prazos de advogado são contados exclusivamente pela publicação no DJEN (Res. CNJ 455/2022, art. 11, §3º, com a redação da Res. 569/2024); o expediente no PJe tem valor só informativo e o Domicílio Judicial Eletrônico não intima advogado. O risco real é outro: publicação que sai sem o nome ou a OAB do advogado, e a dupla intimação (portal e diário) ainda em julgamento no STJ (Tema 1.180). O teste da Fase 0 mede o primeiro; a regra "vale a data mais conservadora" trata o segundo.
4. **Publicação, prazo e tarefa precisam de máquina de estados.** Hoje o modelo não tem "publicação sem processo", "prazo rejeitado", "prazo vencido", "tarefa concluída", nem quem confirmou o quê.
5. **Permissões por papel antes das telas.** Estagiário não confirma prazo (Lei 8.906, art. 3º, §2º); administrativo não vê intimação de processo sigiloso; sócio vê tudo. Vira RLS dentro do escritório.
6. **MVP sem orquestrador.** Classificador com saída estruturada no modelo barato, cálculo determinístico, roteador de intents fechado no WhatsApp. Orquestrador com tool use e agentes entram na Fase 2, quando existirem peças.
7. **WhatsApp tem regra de plataforma que molda o produto.** Mensagem iniciada pelo sistema (resumo do dia, alerta) só sai como template aprovado pela Meta e é cobrada por envio; só a API oficial. Ação de escrita pelo WhatsApp (reatribuir, confirmar) exige eco e confirmação.
8. **Segredo de justiça e LGPD são regra de produto, não só infraestrutura.** Processo sigiloso não está na API pública do DataJud, sai com iniciais no DJEN e não pode ter texto respondido pelo WhatsApp.

**O que bloqueia começar hoje:** a lista de processos ativos com cliente, polo, comarca, responsável e sigilo (só o escritório tem), e os números de OAB/UF de cada advogado. Sem isso não há teste de captação nem carteira.

## 1.2 O que precisa mudar no escopo

| Seção do documento | O que diz hoje | O que deve ficar | Por quê |
|---|---|---|---|
| Módulo Prazos | "sugere o prazo (dias úteis, feriados do TJ-MT)" | Especificação do cálculo: entrada = data de disponibilização + tribunal + comarca + tipo de ato (sugerido pela IA, editável) + dobro s/n; saída = data de publicação, início, data final e lista de dias pulados, com memória visível na tela de confirmação | Lei 11.419/2006, art. 4º, §§3º e 4º; CPC arts. 219, 220, 224 §§2º e 3º, 229 §2º, 231. Sem isso a tela de confirmação não tem o que mostrar |
| Tabelas principais: `prazos` | "(data final, contagem, status: sugerido, confirmado, cumprido)" | Quatro datas (disponibilização, publicação, início, final), data interna, origem, tipo de contagem, multiplicador com fundamento, quem confirmou/rejeitou, estados terminais (rejeitado, vencido, suspenso/prorrogado) | O controle de risco prometido ("nenhum prazo perdido") não é auditável com três status |
| Tabelas principais: `processos` | "(número CNJ, tribunal, fase, responsável)" | + comarca, órgão julgador, grau, classe, assuntos, sigilo, status, colaboradores, partes com polo (`processo_partes`) | O DataJud público não traz partes nem advogados; comarca define o feriado; "processo da Marina" exige saber quem é cliente de qual processo |
| Tabelas principais: `publicacoes` | "(origem, texto, data, processo ligado)" | + id externo (hash do DJEN), payload bruto, número CNJ extraído, tipo original e classificado, destinatários, status de tratamento, tratada por/em | Deduplicação, alerta de 24 h e teste de captação dependem disso |
| Tabelas principais: `log_ia` | "cada ação da IA, custo e quem aprovou" | Três tabelas: `aprovacoes` (objeto, snapshot do conteúdo aprovado, decisão, quem, quando), `ia_execucoes` (modelo, tokens dos quatro contadores, custo, latência, versão do prompt), `auditoria_acessos` (quem viu o quê, LGPD art. 37) | São três ciclos de vida distintos; a prova de aprovação precisa do conteúdo exato aprovado |
| "Todas com escritorio_id" | Inclui jurisprudência, modelos, feriados | `escritorio_id` só no que o escritório produz. Jurisprudência, feriados, tribunais, comarcas, TPU, índices econômicos e preços de IA são globais (schema `ref`, leitura para todos, escrita só pela rotina de ingestão) | Evita duplicar milhões de acórdãos e embeddings por escritório quando virar produto |
| Multi-escritório + RLS | "Toda tabela leva escritorio_id, com isolamento por linha" | `escritorio_membros (usuario, escritorio, papel)`, claim `escritorio_id` e `papel` no JWT via Custom Access Token Hook, policy padrão única por tabela, e regra para rotinas (service role) que ignoram RLS | Uma frase não é um desenho; policies com subselect por linha não escalam e rotinas sem regra vazam entre tenants |
| Arquitetura | "assistente central aciona 8 agentes como ferramentas" já no MVP | MVP: pipeline (captar → classificar → calcular → confirmar → tarefa → avisar) + roteador de intents no WhatsApp. Orquestrador com tool use na Fase 2 | O valor do MVP é não perder prazo; orquestrador adiciona custo, latência e superfície de erro sem ganho nessa fase |
| Exemplos de conversa (WhatsApp) | "Faz a minuta da contestação", "Passa a réplica para o Bruno" sem confirmação | Lista fechada de intents do MVP, cada um marcado leitura ou escrita; escrita exige eco + "Confirma?"; "faz a minuta" sai do MVP e, na Fase 2, segue as etapas da skill, não one-shot | "Faz a minuta" contradiz a própria skill `tjmt-peticoes` (seis etapas com aprovação); reatribuir sem confirmar é ação de escrita por referência ambígua |
| Módulo Peças (Fase 2) | "Gera a minuta a partir dos modelos" | "Conduz o caso pelas etapas da skill no painel, com aprovação por etapa; só na última gera o .docx" | É o método documentado pelo escritório. Pré-requisito explícito: os modelos reais (contestação, réplica, agravo, apelação, cumprimento) com papel timbrado, que o documento admite ainda não ter |
| Carteira: kanban por fase | "mostra um kanban por fase" | Lista filtrável (responsável, prazo fatal mais próximo, última movimentação) como tela principal; kanban secundário com lista de fases do escritório e regra: fase sugerida por mapeamento TPU → fase, confirmada pelo advogado quando divergir | Para um escritório pequeno a pergunta é "o que tenho que fazer e quando", não "quantos estão em instrução"; fases do vídeo (Poly) não são as do escritório |
| Referência Poly.AI | Ancora arquitetura, "8 agentes", Projudi, "nome e rosto" | Mover para "ideias para produto". TJ-MT não usa Projudi. Nome e rosto não condicionam o início | Produto não verificado; puxa complexidade que não cabe num escritório de uma advogada |
| Contratos e honorários (Fase 3) | Fase 3 | Candidato a entrar no fim do MVP ou início da Fase 2 | A skill `contratacao-e-honorarios` já traz contrato, procuração, declaração e Tabela OAB/MT; é formulário + .docx + aprovação |
| Riscos: "Alerta se uma publicação ficar 24 h sem tratamento" | Sem definir "tratada", destinatário, canal ou horas úteis | Evento → destinatário → canal → horário → template, em horas úteis (America/Cuiaba), com escalonamento ao sócio em 48 h | Hoje não há estado "tratada" nem regra de notificação |
| Stack: fuso horário | Não mencionado | `timezone` por escritório (America/Cuiaba, UTC-4, sem horário de verão); prazos como DATE; crons escritos em UTC com deslocamento fixo de 4 h (7h30 Cuiabá = 11h30 UTC); hora local no painel e no WhatsApp | Vercel, Supabase e cron rodam em UTC; "vence hoje" em UTC vira ontem às 20h em Cuiabá |

## 1.3 O que falta, por área

### 1.3.1 Produto e fluxos do MVP

- **Estados da publicação.** nova → classificada → vinculada ou sem_processo → com_prazo_sugerido ou sem_prazo → tratada (prazo confirmado, "sem prazo" com motivo, ignorada com motivo, duplicada) → arquivada. "Sem processo" abre as ações "cadastrar na carteira" ou "não é nosso" (motivo registrado, para medir homônimos). Captação por OAB + UF de cada advogado; nome só como segunda rede. Uma publicação pode gerar N prazos.
- **Estados do prazo.** sugerido → confirmado ou rejeitado (motivo) → cumprido ou vencido; confirmado aceita suspenso/prorrogado (nova data + ato). Guardar `data_sugerida_ia` e `data_confirmada` separadas para medir acerto da IA. Como um prazo vira "cumprido": ao concluir a tarefa de protocolo o sistema pergunta "protocolado? marcar prazo como cumprido" e, na Fase 2, confirma pela juntada no DataJud ou no PJe.
- **Estados da tarefa.** a_fazer → em_andamento → pronta_para_revisao → concluida ou cancelada. "Atrasada" = data interna passou sem conclusão; "crítica" = data fatal é hoje ou passou. Data interna = data final menos N dias úteis (N configurável por tipo de ato, padrão 2). Histórico de reatribuição com quem/de quem/para quem/quando.
- **Matriz papel × ação** (ver, confirmar prazo, criar/reatribuir/concluir tarefa, aprovar minuta, editar configurações e calendário, ver sigilosos, ver custos, usar WhatsApp). Mínimo: confirmar prazo e aprovar minuta = advogado responsável ou sócio; estagiário cria rascunho e marca "pronta para revisão"; administrativo vê agenda e tarefas, não vê texto de intimação sigilosa; sócio vê tudo. Gravar `confirmado_por`, `aprovado_por`.
- **Glossário operacional.** "Semana" = dias úteis restantes da semana corrente + próxima segunda (configurável); "amanhã" = próximo dia útil; "prazos da semana" listam data fatal e data interna; "painel do dia" = visão do usuário, com alternância "escritório" para sócios; "processo ativo" = não arquivado e não baixado.
- **Regras de notificação.** Tabela evento → destinatário → canal → horário → template: nova publicação vinculada (responsável; painel + WhatsApp imediato); publicação sem tratamento 24 h úteis (responsável; 48 h sócios); prazo D-3, D-1, D0 (responsável; sócio em D0); tarefa atrasada (no resumo do dia); resumo do dia (cada usuário ativo, 7h30 Cuiabá, dias úteis). Cadastro de ausências (férias, licença) com substituto, que redireciona notificações.
- **Onboarding.** Três passos: escritório (razão social, timezone, telefones autorizados), equipe (papel, OAB/UF, nomes alternativos para captação, telefone), carteira (importador CSV com validação do dígito verificador do CNJ e enriquecimento pelo DataJud).
- **Critérios de aceite por módulo** (hoje só existe o critério de venda). Propostos na seção 2.9.
- **Processos sigilosos.** `segredo_justica` e `nivel_sigilo` no processo (sugerido pela IA quando a publicação vier com iniciais). Vinculação por número do processo + nome do advogado, nunca só por nome de parte. Kanban mostra "sem acompanhamento automático pelo DataJud; conferir no PJe" e gera tarefa periódica de conferência. Pelo WhatsApp, só "há publicação nova no processo X, veja no painel", sem texto. Acesso ao texto restrito a responsável e sócios, com registro de acesso.
- **Múltiplos responsáveis.** `responsavel_id` (dono) + `processo_colaboradores` (n:n); tarefa tem seu próprio executor.

### 1.3.2 Modelo de dados e multi-escritório

- **Vínculo usuário ↔ escritório.** `escritorio_membros (usuario_id, escritorio_id, papel, oab_numero, oab_uf, oab_sufixo, nomes_alternativos, ativo)`, UNIQUE(usuario_id, escritorio_id). No MVP, um vínculo por usuário por regra de aplicação, não por schema (suporte da Cerrado Hub e advogado correspondente vão precisar de dois).
- **Claims no JWT (padrão oficial do Supabase, verificado).** Custom Access Token Hook grava `escritorio_id` e `papel` como claims a partir de `escritorio_membros` (a tabela é a fonte da verdade; o claim serve ao desempenho); policy padrão: `escritorio_id = (select (auth.jwt()->>'escritorio_id')::uuid)`; nunca usar `user_metadata` em policy (o usuário consegue editá-lo); lembrar que o JWT fica defasado até o próximo refresh (troca de papel exige refresh); índice `(escritorio_id, ...)` em toda tabela de tenant; policies de papel para confirmar prazo, aprovar, ver sigiloso; MFA exigido por policy restritiva com `aal2` para sócios e advogados.
- **Rotinas e service role.** Captação e alertas rodam com service role (ignoram RLS) e precisam iterar escritório a escritório com `escritorio_id` explícito em toda escrita; teste automatizado de isolamento (dois escritórios de teste, nenhuma linha cruza).
- **Dados de referência globais (schema `ref`).** `tribunais (sigla, codigo_cnj '8.11', uf, timezone, sistema)`, `comarcas (tribunal_id, nome, codigo_ibge)`, `feriados (tribunal_id ou nulo, comarca_id ou nulo, data, descricao, abrangencia: nacional|estadual|municipal|forense|recesso|suspensao_ad_hoc, suspende_prazo, ato_normativo, url_fonte, vigencia)`, `tpu_movimentos`, `indices_economicos` (Fase 2), `ia_precos`.
- **Tabelas de tenant que faltam no MVP.** `usuario_telefones` (E.164, verificado, UNIQUE global), `clientes` com CPF/CNPJ e telefone, `processo_partes` (nome, polo, cliente_id ou nulo), `processo_colaboradores`, `fases_kanban` (por escritório, com regra TPU → fase), `movimentacoes` (origem datajud|pje|manual, código TPU, data, id externo), `aprovacoes`, `ia_execucoes`, `auditoria_acessos`, `conversas`, `mensagens` (id externo wamid UNIQUE, direção, template, status de entrega), `webhooks_inbox` (payload bruto, idempotência), `notificacoes` (fila com canal, template, status), `ausencias`, `integracoes` (config sem segredos + referência ao Vault), `escritorio_configuracoes`, `tarefa_eventos`, `prazos_eventos`.
- **Segredos.** Tokens do WhatsApp, chave do DataJud, chave de embeddings e, na Fase 2, refresh tokens do Google por usuário vão para o Supabase Vault (criptografia autenticada com chave raiz fora do banco), lidos por função `security definer` restrita; nunca em coluna texto. A criptografia de coluna via pgsodium/TCE está em "pending deprecation" na documentação do Supabase e não deve ser usada. Chaves de serviço (Claude, Resend, Meta app secret) ficam em variáveis de ambiente da Vercel.
- **Fase 2.** `documentos` (Storage, bucket privado por escritório, tipo, hash, origem; entra já no fim da Fase 1 se Contratos for antecipado, decisão 1.4.6), `minutas` + `minuta_versoes` + `minuta_revisoes` (checklist OK/Atenção/Crítico da skill de conferência), `modelos_peca` + chunks, `ref.jurisprudencia` + chunks, `audiencias`, `usuario_oauth_tokens`, `calculos` + itens.
- **Fase 3.** `tabelas_honorarios` versionadas por vigência (URH), `contratos`, `metricas_diarias` (view materializada), `planos`/`assinaturas`.
- **Embeddings (verificado).** A API do Claude não gera embeddings e a Anthropic indica a Voyage AI; decidir provedor e dimensão antes da migration da Fase 2 (a coluna `vector(N)` trava o schema; HNSW indexa até 2.000 dimensões em `vector`, 4.000 em `halfvec`). Candidatos: `voyage-law-2` (1024, treinado para direito, contexto 16k), `voyage-4` (1024 por padrão, 32k), `gemini-embedding-001` (3072, reduzível a 768/1536), OpenAI `text-embedding-3-large` com `dimensions=1024` (não verificado nesta rodada). O `gte-small` embutido no Supabase (384 dims, inglês, 512 tokens) não serve para peças em português. Teste cego com 50 consultas reais do escritório; fixar 1024.
- **Métricas.** Definir "tempo economizado" antes do código: baseline de minutos por tipo de tarefa (configurável) + tempo de revisão humana medido na fila + campo opcional auto-relatado na aprovação. Custo de IA por execução com os quatro contadores de tokens e preços versionados.

### 1.3.3 Captação (DJEN, DataJud) e motor de prazos

- **API do DJEN (verificado no Swagger oficial v1.0.4, de 04/03/2026).** `GET https://comunicaapi.pje.jus.br/api/v1/comunicacao` com `numeroOab`, `ufOab`, `nomeAdvogado`, `nomeParte`, `numeroProcesso`, `texto`, `siglaTribunal`, `dataDisponibilizacaoInicio` e `dataDisponibilizacaoFim` (yyyy-mm-dd), `meio` (D = diário, E = edital), `pagina`, `itensPorPagina` (5 ou 100). Sem autenticação para consulta. Limite de taxa por IP (cabeçalhos `x-ratelimit-*`, medido em ~20 requisições por minuto); em 429, esperar 1 minuto; usar vários IPs para contornar é "uso abusivo" e pode gerar bloqueio; teto de 10.000 resultados por consulta. Cada item traz `id`, `hash`, `data_disponibilizacao`, `siglaTribunal`, `tipoComunicacao`, `tipoDocumento`, `nomeOrgao`, `texto` (HTML), `numero_processo`, `numeroprocessocommascara`, `meio`, `link`, `nomeClasse`, `codigoClasse`, `numeroComunicacao`, `ativo`, `status`, `motivo_cancelamento`, `data_cancelamento`, `destinatarios[]` e `destinatarioadvogados[]` (com `numero_oab` e `uf_oab`). Não existe campo de data de publicação: ela é calculada. Há também `GET /api/v1/comunicacao/{hash}/certidao` (certidão em PDF, útil como prova da intimação) e `GET /api/v1/caderno/{sigla}/{data}/{meio}` (caderno diário completo em zip, disponível a partir das 3h).
- **Termo inicial e datas.** Guardar três datas por publicação: disponibilização (vem da API), publicação (1º dia útil seguinte, Lei 11.419 art. 4º §3º e CPC 224 §2º) e início da contagem (dia útil seguinte à publicação, art. 4º §4º e CPC 224 §3º). Memória de contagem lista cada dia pulado e por quê.
- **O que vale para contagem (verificado).** Desde 16/05/2025, "nos casos em que a lei não exigir vista ou intimação pessoal, os prazos processuais serão contados a partir da publicação no DJEN", e a intimação concomitante por outro meio tem "valor meramente informacional" (Res. CNJ 455/2022, art. 11, §3º, redação da Res. 569/2024). O TJ-MT confirmou em 14/05/2025 que conta prazos pelo DJEN e pelo Domicílio desde essa data. O Domicílio Judicial Eletrônico serve a citação e intimação pessoal de entes públicos e empresas; advogado é intimado pelo DJEN. O TJ-MT publica no DJEN desde 21/06/2022 (Res. TJMT/OE 05/2022). Consequências para o escopo: (a) o expediente no PJe sai do caminho crítico do MVP; (b) o risco que fica é a publicação sem o nome ou a OAB do advogado (cadastro errado no processo), que o teste da Fase 0 mede; (c) o STJ julga a dupla intimação no Tema 1.180 (iniciado em 20/08/2025, com pedido de vista; sem tese fixada até 27/09/2026): enquanto isso, se o sistema souber de intimação anterior pelo portal, sugere a data mais conservadora e avisa.
- **DataJud (verificado).** `POST https://api-publica.datajud.cnj.jus.br/api_publica_tjmt/_search` com header `Authorization: APIKey <chave pública>`; a chave fica na wiki do CNJ e "poderá ser alterada pelo CNJ a qualquer momento" (guardar em configuração). Consulta Elasticsearch por `numeroProcesso` (20 dígitos sem máscara), paginação por `search_after`, `size` de 10 a 10.000. Campos: `classe`, `assuntos`, `sistema`, `formato`, `grau`, `dataAjuizamento`, `dataHoraUltimaAtualizacao`, `nivelSigilo`, `orgaoJulgador` (com `codigoMunicipioIBGE` → comarca), `movimentos` (código TPU, nome, data). Não traz partes nem advogados de forma confiável; não permite busca por OAB; sigilosos ficam fora (a wiki fala em "resguardo de processos sigilosos"). Termos de uso v1.1: máximo de 120 requisições por minuto; proibido coletar dados pessoais de terceiros; dar ciência ao CNJ de publicações feitas com os dados. Atraso: envio ao CNJ era mensal; a Portaria CNJ 374/2026 (14/08/2026) torna o envio diário, com 180 dias de adaptação (até cerca de fevereiro de 2027). Medir o atraso real pelo `dataHoraUltimaAtualizacao`.
- **Calendário forense (verificado).** Portaria TJMT/PRES 1915/2025 (Calendário Forense 2026): feriados nacionais, estaduais e municipais **e pontos facultativos** suspendem expediente e prazos; feriado municipal só suspende na comarca; as datas mudam ao longo do ano (em 2026 já houve portarias 245, 509, 752 e 901 e a transferência do ponto facultativo de 28/10 para 30/10). Não há fonte legível por máquina: o calendário é PDF, logo entra por tela de configuração + importação anual + tarefa mensal de conferência pelo administrativo. 20 de novembro é feriado nacional desde 2024 (Lei 14.759/2023). Recesso de 20/12 a 20/01 (CPC art. 220). Exemplo de suspensão ad hoc: incidente de segurança no PJe do TJ-MT em 21/09/2026 suspendeu prazos de 21 a 25/09. Quando faltar calendário do ano ou comarca, o prazo sai marcado "calendário incompleto" e exige reconhecimento ao confirmar.
- **Regras do motor (TJ-MT, cível; artigos verificados).** Dias úteis só para prazos processuais (CPC 219); exclui o dia do começo e inclui o do vencimento (224 caput); adia começo e vencimento se o expediente for reduzido ou houver indisponibilidade do sistema (224 §1º); dobro para MP, Fazenda e Defensoria a partir da intimação pessoal (180, 183, 186), salvo prazo próprio em lei (183 §2º); litisconsortes com advogados distintos: dobro não se aplica a autos eletrônicos (229 §2º); intimação pelo diário conta da data de publicação (231 VII); citação eletrônica do cliente: 5º dia útil seguinte à confirmação (231 IX); 15 dias para recorrer e contrarrazoar, salvo embargos de declaração, 5 dias (1.003 §5º e 1.023); prova de feriado local pode ser corrigida e é dispensada quando já consta do processo eletrônico (1.003 §6º, Lei 14.939/2024). Tabela de atos com prazo padrão (contestação 15, réplica 15, recursos 15, embargos 5, manifestação conforme despacho), sempre editável pelo advogado. Prazos materiais e de audiência em dias corridos.
- **Teste de captação (Fase 0, semanas 2 e 3).** 10 dias úteis, começando no primeiro dia útil da semana 2 e fechando no fim da semana 3 (a Fase 1 começa na semana 3 em paralelo, porque cadastros e motor de prazos não dependem do resultado); a cada manhã o sistema capta por OAB + UF de cada advogado; o administrativo registra todas as intimações vistas no PJe e nos e-mails; cruzamento em três colunas (só DJEN, só PJe/e-mail, ambos). Critério: 100% das intimações a advogado aparecem no DJEN captado até as 9h do dia útil seguinte à disponibilização. Cada "só PJe" é classificada: publicação sem o nome/OAB do advogado (corrigir cadastro no processo), intimação pessoal (não é do advogado), erro de captação (bug). O resultado define quais processos precisam de conferência manual.
- **Bootstrap da carteira.** Consultar o DJEN por OAB nos últimos 180 dias devolve os processos com publicação recente. A consulta processual pública do TJ-MT (consultaprocessual.tjmt.jus.br) busca por OAB e pode complementar (a confirmar se exige login). A advogada completa com cliente, polo, comarca, responsável e sigilo.
- **Rede do ambiente de desenvolvimento.** Nesta sessão a política de rede do ambiente negou `comunicaapi.pje.jus.br`, `api-publica.datajud.cnj.jus.br`, `datajud-wiki.cnj.jus.br`, `planalto.gov.br`, `cnj.jus.br` e `tjmt.jus.br`. Antes da Fase 0, liberar esses hosts: menu do ambiente na barra de título da sessão → Editar → Network access → adicionar em "Allowed domains", mantendo "Allow package managers" marcado (passos em https://code.claude.com/docs/en/cloud-environments#network-access).

### 1.3.4 WhatsApp

- **Só a API oficial (verificado).** Os Termos do WhatsApp proíbem acesso por meios não autorizados ou automatizados e a Meta bane números que usam clientes não oficiais. Reconhecer provedor não oficial: pede QR code do WhatsApp Web, usa número comum, promete "sem aprovação de template" (Baileys, e Evolution API quando em modo Baileys; Z-API e WPPConnect não verificados). Provedor oficial exige portfolio e conta WABA na Meta, templates aprovados e tarifa por mensagem; confirmar no diretório Meta Business Partners. A Cloud API pode ser usada direto, sem BSP, como "direct developer" com token de usuário de sistema (permissões `whatsapp_business_messaging` e `whatsapp_business_management`).
- **Preço vigente (verificado na documentação da Meta de 30/09/2026).** Cobrança por mensagem desde 01/07/2025. Desde **01/10/2026** as mensagens de serviço (respostas sem template dentro da janela) também são cobradas após **1.000 grátis por número por mês**; templates utility dentro da janela voltaram a ser cobrados. Tabela em reais (parcial): utility e authentication ~R$ 0,035; marketing ~R$ 0,32. Faturamento em BRL disponível desde 16/07/2026. Para 5 pessoas (resumo diário + alertas ≈ 300 a 500 mensagens/mês) o custo fica na casa de R$ 10 a 20 por mês; o que pesa é aprovação de template e janela, não preço.
- **Regras que moldam o produto (verificado).** Janela de 24 h aberta por mensagem do usuário, reiniciada a cada mensagem; fora dela só template aprovado (utility não promocional). A Meta pode reclassificar templates sem aviso. Limite de envio por portfolio: começa em 250 destinatários únicos em 24 h e sobe para 2.000 com a verificação da empresa. Número novo, ou número apagado do app comum (perde o histórico); há "coexistência" com o app Business via parceiro, não confirmada para o Brasil. Opt-in obrigatório de cada destinatário, inclusive da equipe: termo assinado + primeira mensagem enviada pela própria pessoa. É **proibido pedir ou enviar número completo de documento de identidade, cartão ou conta bancária** pelo WhatsApp, e há restrições a informações de saúde; cobrança de dívidas é serviço restrito. Desde 15/01/2026 são vedados "AI providers" cuja IA é a função principal; bot do escritório é permitido, desde que exista caminho rápido para um humano.
- **Templates a criar e aprovar antes do MVP ir ao ar.** `resumo_do_dia`, `alerta_prazo`, `nova_publicacao`, `tarefa_reatribuida`, `publicacao_sem_tratamento`. Pedir a verificação da empresa na Meta já na Fase 0.
- **Fase 3.** Vender para outros escritórios exige virar Tech Provider na Meta (verificação da empresa, App Review das duas permissões, Embedded Signup; cada cliente com a própria forma de pagamento).
- **Intents do MVP (lista fechada).** Leitura: resumo do dia; meus prazos da semana; prazos de hoje/amanhã; o que saiu no processo X (por número ou nome do cliente, listando candidatos se ambíguo); tarefas de fulano. Escrita, sempre com eco + "Confirma?": reatribuir tarefa; concluir tarefa; confirmar prazo sugerido. Fora da lista: "isso ainda não faço; abra no painel".
- **Técnica (verificado).** Webhook com verificação por `hub.verify_token`/`hub.challenge` e assinatura `X-Hub-Signature-256` (HMAC-SHA256 do corpo bruto com o app secret); a Meta reenvia por até 7 dias se não receber 200, então a inbox precisa ser idempotente pelo `wamid`; payload de até 3 MB; a mesma mensagem pode receber "delivered" e "failed" quando o usuário tem vários aparelhos. Fila de envio com status de entrega, telefones autorizados em tabela (E.164, verificado), estado da conversa por telefone.
- **Sigilo pelo WhatsApp.** Nunca texto de processo sigiloso; para os demais, texto resumido pela IA e link para o painel.

### 1.3.5 PJe, Google e rotinas agendadas

- **Extensão do Chrome para o PJe (Fase 2).** Fatos verificados: o PJe do TJ-MT aceita certificado digital (A3 ou em nuvem, com PJeOffice), CPF e senha, ou gov.br nível ouro com verificação em duas etapas (Portaria CNJ 140/2024); não há webservice (MNI) aberto a advogados; a Res. CNJ 185/2013, art. 29, permite bloquear usuários que reduzam a disponibilidade do sistema, e em 2026 TRT-4 e TRT-6 passaram a bloquear contas que consultam mais de 1.500 processos de terceiros em 30 dias por robô. Logo: a extensão só opera com a sessão aberta pelo advogado, em baixo volume, nos processos do próprio escritório, só leitura e download de autos para o Storage; protocolo continua manual; certificado e senha nunca saem da máquina. Antes de prometer, um spike de 3 dias para confirmar o que a sessão permite baixar e em que formato.
- **Google Agenda e Drive (Fase 2; verificado).** OAuth por usuário. Em modo "testing" o refresh token expira em 7 dias; app publicado sem verificação tem teto vitalício de 100 usuários e tela de "app não verificado". Escopos de eventos da Agenda são sensíveis: verificação em ~10 dias úteis, exige domínio verificado, página inicial, política de privacidade no domínio e vídeo. `drive` e `drive.readonly` são restritos: verificação de 6+ semanas e avaliação de segurança CASA anual; `drive.file` não é sensível e dá acesso por arquivo. Se o escritório usar Google Workspace, o app "Internal" dispensa verificação e o teto de 100. Decisão: `calendar.events` + `drive.file`; refresh tokens no Vault; publicar e verificar o app (ou Workspace interno) antes da Fase 2.
- **Rotinas agendadas (verificado).** Edge Functions do Supabase: 150 s de tempo total no Free e 400 s nos pagos, 2 s de CPU, 256 MB; pg_cron + pg_net é "dispara e esquece", com timeout a definir explicitamente. Vercel: Cron até 100 por projeto; no Hobby só uma vez por dia e com imprecisão de até 59 minutos; no Pro até uma vez por minuto; funções com 300 s por padrão e até 800 s no Pro. Captação do DJEN é leve; enriquecimento pelo DataJud de centenas de processos leva minutos. Desenho: Vercel Cron (Pro) → rota protegida por segredo → lotes pequenos; trabalho longo vai para fila no Postgres (Supabase Queues/pgmq) drenada a cada execução, idempotente, com retentativa, respeitando 20 req/min no DJEN e 120 req/min no DataJud, e registro por rodada (`captacoes` com início, fim, itens, erros). Regiões: Supabase em sa-east-1 (São Paulo) e funções Vercel em gru1.
- **E-mail transacional.** Não mencionado no documento; necessário para convite, login por link mágico e alerta de fallback. O SMTP padrão do Supabase tem limite baixo; usar provedor (Resend ou similar) desde o MVP.

### 1.3.6 Arquitetura de IA e observabilidade

- **MVP.** Classificador de publicação com saída estruturada (tipo de ato, gera prazo s/n, quantidade de dias sugerida, dobro s/n, número do processo, partes, resumo em linguagem simples) no modelo mais barato; roteador de intents do WhatsApp com saída estruturada; resumos em linguagem simples. Nenhuma ação de escrita executada pelo modelo: o modelo propõe, o código executa após confirmação.
- **Fase 2.** Orquestrador com tool use; cada agente é uma ferramenta com entrada e saída tipadas; a skill vira prompt de sistema versionado no repositório, com prompt caching; regra operacional: consulta (leitura) volta direto; produção (minuta, prazo, mensagem a cliente, contrato) entra em `aprovacoes`.
- **Modelos e preços (verificado em 28/10/2026, US$ por milhão de tokens, entrada/saída).** Haiku 5.5: 0,10/0,50 até 100k tokens de entrada; Sonnet 5.5: 2/10; Opus 5.5: 4/20; Fable 5.1: 10/50. Todos com contexto de 1M e saída de 128k. Prompt caching: escrita 1,25x (5 min) ou 2x (1 h), leitura 0,05x no Opus e Sonnet 5.5 e 0,1x nos demais, mínimo de 512 tokens. Batch API com 50% de desconto. Structured outputs e Files API em GA; tool use acrescenta ~286 tokens por chamada. Escolha: triagem, intents e resumos no Haiku 5.5; peças, revisor e jurisprudência no Sonnet 5.5, subindo para Opus 5.5 só onde a medição justificar; Batch para ingestão em massa. Registrar modelo e versão do prompt em cada execução. Observação: os modelos Fable e Mythos exigem retenção de 30 dias e não aceitam retenção zero; preferir Sonnet/Opus para dados de cliente. Política de Uso da Anthropic (nova versão em vigor em 12/11/2026): aconselhamento jurídico a uma pessoa sobre a situação dela é "alto risco" e exige revisão por humano qualificado e aviso de uso de IA; chatbot voltado ao público deve se identificar como IA.
- **Tokenizador.** Do Claude 4.7 em diante o mesmo texto gera cerca de 30% mais tokens; usar isso nas estimativas de custo.
- **Avaliação.** Conjunto rotulado a partir do teste de captação (publicações reais com tipo e prazo confirmados pela advogada) vira teste de regressão do classificador e do motor; roda a cada mudança de prompt ou de modelo. Meta inicial: tipo de ato certo em 95%, prazo sugerido igual ao confirmado em 95%.
- **Prompt injection.** Texto de publicações e mensagens do WhatsApp são entrada de terceiros: entram sempre como dados (delimitados), nunca como instrução; o modelo não tem ferramentas de escrita no MVP; saídas validadas por schema.
- **Operação.** Ambientes dev e prod (dois projetos Supabase), migrações versionadas, segredos em variáveis de ambiente e Vault, backups diários (plano Pro) e exportação diária dos prazos confirmados em CSV para o Drive do escritório (plano B se o sistema cair), página de status interno das rotinas (última captação, erros).

### 1.3.7 Jurídico, LGPD e OAB

- **Bases legais.** Dados de clientes e terceiros em processo: execução de contrato e exercício regular de direitos em processo judicial (LGPD art. 7º, V e VI; art. 11, II, "d" para dados sensíveis de família e saúde). Registrar as operações (art. 37), nomear encarregado (pode ser a própria sócia), política de retenção e descarte.
- **Transferência internacional (verificado).** Os Termos Comerciais da Anthropic (17/06/2025) vedam treinar modelos com conteúdo de clientes da API; retenção padrão de até 30 dias, com retenção zero negociável por organização (não cobre Batch, Files nem os modelos Fable/Mythos); dados armazenados só nos EUA e inferência "global" por padrão (opção `us` a 1,1x a partir do Claude 4.6); DPA incorporado aos termos, com SCCs da UE, Reino Unido e Suíça, notificação de incidente em 48 h, SOC 2 e ISO 27001/42001. **O DPA não traz as cláusulas-padrão brasileiras.** A Resolução CD/ANPD 19/2024 regula a transferência internacional e o prazo de adequação terminou em 23/08/2025; a adequação mútua com a UE (Res. CD/ANPD 32/2026) não cobre os EUA. Caminho: pedir à Anthropic a incorporação das cláusulas-padrão da ANPD (art. 33, II) e, enquanto isso, fundamentar no art. 33, IX, com o art. 7º, VI (transferência necessária ao exercício regular de direitos em processo), registrando a análise. O mesmo raciocínio vale para Vercel e Meta; Supabase em São Paulo e funções Vercel em gru1 reduzem o problema ao que vai para a IA e ao WhatsApp. Minimizar: enviar à IA só o necessário (texto da publicação, não o cadastro do cliente); pseudonimizar quando possível; não usar Files API nem Batch para processos em segredo.
- **Pequeno porte (verificado).** A Resolução CD/ANPD 2/2022 simplifica obrigações de ME/EPP, mas o art. 3º retira o benefício de quem faz tratamento de alto risco, e o art. 4º considera alto risco o uso de tecnologia emergente combinado com dados sensíveis. Um escritório que usa IA com processos de família e saúde provavelmente não se enquadra: planejar registro completo das operações (art. 37), encarregado nomeado (pode ser a sócia) e relatório de impacto (RIPD) antes de ir ao ar.
- **Segredo de justiça e dados sensíveis.** CPC art. 189 põe em segredo processos de família (divórcio, filiação, alimentos, guarda) e os que envolvem intimidade; base legal para dados sensíveis é o art. 11, II, "d" da LGPD. Regras de produto da seção 1.3.1 + registro de acesso ao texto + exclusão do texto da IA quando o processo for marcado sigiloso depois.
- **OAB (verificado).** Recomendação CFOAB 001/2024 (DEOAB de 14/11/2024): escolher fornecedor que não use os dados para treino; observar a LGPD antes de inserir dados confidenciais; **comunicar por escrito ao cliente, antes de começar, que o escritório usa IA, com consentimento**, oferecendo alternativa se recusar; revisão humana dos resultados; o cliente pode pedir para falar com humano e o bot não pratica atos privativos. Provimento 205/2021 continua em vigor (grupo de trabalho de revisão criado em 2025, sem texto novo): publicidade informativa, sem captação; bot que só responde a quem procurou o escritório é risco baixo, disparo ativo a quem não é cliente é risco de captação. Não há provimento da OAB sobre IA até 28/10/2026 (há um Plano Nacional de IA, sem força normativa). Código de Ética arts. 35 a 38 (sigilo). Estagiário não confirma prazo nem aprova peça (Lei 8.906, art. 3º, §2º). Consequência: cláusula de uso de IA no contrato de honorários da skill de contratação, e aviso de IA em toda mensagem automatizada a cliente.
- **CNJ (verificado).** A Resolução 615/2025 substituiu a 332/2020 e só vincula o Judiciário. O que vincula o escritório: termos de uso da API pública do DataJud (120 req/min; não coletar dados pessoais de terceiros) e a **Portaria CNJ 374/2026, que diz que os dados do DataJud são "exclusivamente para fins legais, não comerciais e autorizados" e veda distribuição, venda e exploração comercial**. Vender o produto usando dados do DataJud exige autorização do CNJ: decisão da Fase 3, com alternativa de o próprio escritório cliente consultar o DataJud com sua chave e seus processos, sem redistribuição.
- **Responsabilidade profissional.** A prova de que a advogada aprovou X em tal hora é o snapshot em `aprovacoes`; retenção de logs por pelo menos 5 anos (prazo prescricional das ações de responsabilidade); termo de uso interno da equipe.
- **Cerrado Hub.** Contrato escrito antes do piloto com escritórios parceiros (critério de passagem da Fase 2), não só antes da Fase 3: quem é dono do código, dos dados e da marca; papéis LGPD (escritório controlador; Cerrado Hub operador quando hospedar para terceiros); DPA modelo e contrato de tratamento de dados com cada escritório cliente, inclusive os do piloto.

### 1.3.8 Gestão, custos e operação

- **Roadmap realista.** Fase 0 em 2 semanas e MVP em 8 semanas só fecham com entregas semanais pequenas e aprovação no fim de cada semana. O critério "2 a 3 meses sem prazo perdido" é cumprido em operação paralela: o PJe e o e-mail continuam como controle oficial até lá, e o sistema é conferido contra eles toda semana.
- **Papéis no projeto.** Dona do produto (Bruna) decide escopo e aprova entregas; administrativo registra o teste de captação e mantém o calendário; cada advogado valida os prazos sugeridos dos próprios processos.
- **Custos mensais (preços verificados em 28/10/2026).** Supabase Pro US$ 25 (backup diário de 7 dias; o Free pausa após 7 dias sem uso e não serve para produção); Vercel Pro US$ 20 por assento, com US$ 20 de crédito de uso (o Hobby é vedado para uso comercial); WhatsApp R$ 10 a 20 para 5 pessoas; API do Claude no MVP: classificar 30 publicações por dia no Haiku 5.5 custa centavos de dólar por dia, menos de US$ 5 por mês; na Fase 2, peças no Sonnet 5.5 com prompt caching ficam na casa de US$ 0,10 a 0,50 por minuta, logo dezenas de dólares por mês no volume de um escritório; e-mail transacional grátis no início; domínio. Ordem de grandeza do MVP: US$ 50 a 60 + R$ 20 por mês, mais IA.
- **Segurança operacional.** MFA obrigatório, senha forte, revogação de acesso no desligamento (checklist), dispositivos pessoais com bloqueio, telefone do WhatsApp vinculado ao usuário e revogável.
- **Continuidade.** Backups diários; exportação diária dos prazos em CSV; runbook "o que fazer se o sistema cair na sexta à noite" (planilha exportada + PJe); contato de suporte.
- **Insumos antes de codar.** Seção 1.5.

## 1.4 Decisões a tomar antes de codar

1. **Orquestrador no MVP?** Opções: (a) pipeline sem orquestrador, intents fechados (recomendado); (b) assistente central com tool use desde o início. Recomendação: (a); (b) entra na Fase 2.
2. **WhatsApp: Cloud API direto ou BSP?** Opções: (a) Cloud API direto como "direct developer", sem mensalidade, só a tarifa por mensagem da Meta, exige conta Meta Business verificada e número novo (recomendado para 5 pessoas); (b) BSP oficial com painel e suporte (Twilio cobra US$ 0,005 por mensagem além da Meta; 360dialog cobra licença mensal por número). Recomendação: (a), com (b) como alternativa se a verificação da Meta travar.
3. **Rotinas: onde rodam?** Opções: (a) Vercel Cron + rotas Next.js + fila no Postgres (recomendado: uma tecnologia a menos); (b) Supabase Cron + Edge Functions; (c) worker separado. Recomendação: (a); migrar para (c) se um job passar do limite da Vercel.
4. **O que fazer com intimações que não saem no DJEN em nome do advogado.** Como o DJEN é a fonte oficial de contagem desde 16/05/2025, o problema se reduz a cadastro errado do advogado no processo e a casos de intimação pessoal (que não são do advogado). Opções: (a) corrigir o cadastro nos processos apontados pelo teste da Fase 0 e manter uma conferência semanal do painel do advogado no PJe, com lançamento manual (recomendado); (b) antecipar a extensão do PJe para automatizar a conferência. Recomendação: (a); (b) fica na Fase 2.
5. **Fase 2 começa quando?** Opções: (a) só após 2 a 3 meses sem prazo perdido (documento); (b) após 4 semanas de operação paralela estável, mantendo o relógio dos 2 a 3 meses correndo, porque a Fase 2 não toca o motor de prazos (recomendado). Recomendação: (b). As 4 semanas contam em período forense normal: o recesso de 20/12 a 20/01 não vale, então contam a partir de 21/01/2027 e a Fase 2 começa, na prática, no fim de fevereiro de 2027; os pré-requisitos dela (E0) são feitos durante a espera.
6. **Contratos e honorários: antecipar?** Opções: (a) manter na Fase 3; (b) trazer para o fim da Fase 1, como primeiro uso do gerador de .docx e da fila de aprovação (recomendado, se a Tabela OAB/MT da skill estiver vigente).
7. **Embeddings (Fase 2).** Provedor e dimensão (1024). Decidir por teste cego antes da migration.
8. **Nome do produto e domínio.** Não bloqueia o MVP interno. Registrar domínio neutro agora (ex.: nome do escritório), decidir marca na Fase 3.
9. **Modelo comercial com a Cerrado Hub.** Não bloqueia o MVP; contrato e DPA modelo antes do piloto com escritórios parceiros (fim da Fase 2), porque o piloto já coloca a Cerrado Hub ou o escritório como operador de dados de terceiros.
10. **Juizados Especiais do TJ-MT.** A premissa exclui Juizados, mas ações de consumidor costumam correr no JEC, com o mesmo código 8.11. Opções: (a) detectar a competência pelo órgão julgador do DataJud e, para juizado, aplicar variantes dos atos (recurso inominado 10 dias, embargos 5, sem dobro para a Fazenda no JEFP, Lei 12.153 art. 7º) com dias úteis pelo art. 12-A da Lei 9.099 (Lei 13.728/2018) (a confirmar); (b) para juizado, não sugerir data e exigir contagem manual até a regra ser confirmada e testada. Recomendação: (b) no MVP, com (a) assim que houver 10 casos reais contados pela advogada; medir na carteira importada quantos processos são de juizado antes da semana 5.

## 1.5 Insumos que o escritório precisa levantar

| Insumo | Para que serve | Quando |
|---|---|---|
| Nome completo, OAB/UF (com sufixo) e nomes alternativos de cada advogado; CPF e e-mail de cada membro da equipe com papel | Captação no DJEN; cadastro de usuários; permissões | Fase 0, semana 1 |
| Planilha da carteira: número CNJ, cliente (nome, CPF/CNPJ, telefone), polo, parte contrária, comarca/vara, responsável, colaboradores, sigiloso (s/n), fase atual | Importador inicial; teste de captação; respostas do WhatsApp | Fase 0, semana 1 (o sistema ajuda com a lista do DJEN por OAB) |
| Registro diário das intimações recebidas pelo PJe e por e-mail durante 10 dias úteis | Teste de captação | Fase 0, semanas 2 e 3 |
| 30 intimações reais já contadas pela advogada (data de disponibilização, ato, prazo, data final) | Testes do motor de prazos e conjunto de avaliação do classificador | Fase 1, semana 3 |
| Lista de fases do escritório e prazo padrão por tipo de ato; N dias de segurança por ato | Kanban, motor de prazos, data interna | Fase 1, semana 3 |
| Conta Meta Business com CNPJ, número de telefone novo para o WhatsApp, lista de telefones autorizados | Canal WhatsApp | Fase 1, até a semana 7 (pedir verificação já na Fase 0; o WhatsApp é construído na semana 8) |
| Calendário forense 2026 do TJ-MT (Portaria), feriados municipais das comarcas da carteira | Motor de prazos | Fase 1, semana 3 |
| Modelos de peça mais usados (.docx com papel timbrado): contestação, réplica, agravo, apelação, cumprimento de sentença | Fase 2 Peças | Antes da Fase 2 |
| Conta Google do escritório (Agenda e Drive) e decisão sobre Workspace | Fase 2 integrações | Antes da Fase 2 |
| Contrato com a Cerrado Hub; DPA modelo; política de privacidade; cláusulas-padrão com fornecedores | LGPD, piloto e Fase 3 | Antes do piloto com escritórios parceiros (fim da Fase 2); cláusulas com a Anthropic: antes do MVP ir ao ar |

## 1.6 Riscos não tratados ou tratados de forma insuficiente

| Risco | O que o documento diz | O que falta |
|---|---|---|
| Publicação sem o nome ou a OAB do advogado (cadastro errado no processo) | "Cruzar DJEN e DataJud; conferência manual no PJe nas primeiras semanas" | DataJud não substitui (atraso de dias, sem sigilosos, sem advogados). Teste da Fase 0 aponta os processos com cadastro errado; conferência semanal do painel do PJe até a extensão; captação também por nome do advogado como segunda rede |
| Dupla intimação (portal do PJe e DJEN) com datas diferentes | Não mencionado | STJ Tema 1.180 em julgamento. Regra: sugerir a data mais conservadora e avisar; guardar as duas |
| Chave pública do DataJud trocada pelo CNJ sem aviso | Não mencionado | Chave em configuração, não no código; alerta quando a API devolver 401/403 |
| Bloqueio por excesso de requisições (DJEN ~20/min por IP; DataJud 120/min) | Não mencionado | Fila com ritmo controlado, retentativa com espera, um único IP de saída, caderno diário em zip como alternativa para volumes maiores |
| Feriado da comarca não cadastrado | "feriados do TJ-MT" | Calendário por comarca, estado "calendário incompleto", conferência mensal |
| Homônimo de advogado em outro estado / de parte | Não mencionado | Captação por OAB+UF; vinculação por número; "não é nosso" com motivo |
| Publicação cancelada ou republicada no DJEN | Não mencionado | Usar os campos `status`, `ativo`, `motivo_cancelamento` e `data_cancelamento` da API (verificados); republicação gera nova publicação ligada à anterior e recalcula prazo com aviso |
| Fuso horário | Não mencionado | America/Cuiaba por escritório; prazos como DATE |
| Ação de escrita pelo WhatsApp sem confirmação | "Regra de ouro" só cobre protocolo e cliente | Eco + confirmação para toda escrita; log |
| Dados do cliente enviados à IA nos EUA | "criptografia e RLS; contrato de tratamento" | DPA da Anthropic não tem cláusulas da ANPD; pedir incorporação, fundamentar no art. 33, IX + art. 7º, VI enquanto isso; minimização; registro de operações; RIPD (alto risco pela Res. ANPD 2/2022) |
| Cliente não informado do uso de IA | Não mencionado | Recomendação CFOAB 001/2024 exige comunicação escrita com consentimento: cláusula no contrato de honorários e aviso nas mensagens automatizadas |
| Uso comercial dos dados do DataJud na Fase 3 | Não mencionado | Portaria CNJ 374/2026 veda exploração comercial; pedir autorização ao CNJ ou cada escritório cliente consulta com a própria chave, sem redistribuição |
| Dados sensíveis pedidos pelo WhatsApp | Não mencionado | Política da Meta proíbe pedir documento, cartão ou conta pelo chat; coleta de dados de cliente só pelo painel ou formulário seguro |
| Bot sem saída para humano ou sem se identificar como IA | Não mencionado | Exigido pela política da Meta e pela Política de Uso da Anthropic; obrigatório na Fase 3 |
| Estagiário confirmando prazo | Não mencionado | Matriz de permissões + RLS |
| Vercel Hobby em uso comercial | Não mencionado | As regras de uso justo da Vercel vedam uso comercial no Hobby; Pro desde o início (também pelo Cron por minuto e funções de até 800 s) |
| Sistema fora do ar com prazo no dia | Não mencionado | Exportação diária de prazos; runbook; PJe como fonte oficial na operação paralela |
| Refresh token do Google expira em "testing" | Não mencionado | Publicar e verificar o app antes da Fase 2 |
| Custo de IA fora de controle na Fase 2 | "medir custo por escritório" | Teto mensal por escritório com alerta; cache de prompt; Batch para ingestão |

## 1.7 Mapa skills → agentes

Leitura integral das seis skills (20 arquivos, ~167 mil caracteres). O documento diz que custas, feriados e o padrão de peças "já estão documentados nas skills". Só o padrão de forma está; não há tabela de custas nem calendário em nenhuma skill, e os únicos modelos completos são o contrato, a procuração e a declaração da skill de contratação.

| Módulo do documento | Skill que cobre | Cobertura | O que falta para virar agente |
|---|---|---|---|
| Publicações, Prazos, Tarefas, Carteira, WhatsApp, Painel (MVP) | Nenhuma | Nenhuma | São regras de produto, não de direito. Fragmentos aproveitáveis: parse do número CNJ (`tribunais-codigos.md`), checagem "publicação sem o nome do advogado" (varredura, eixo B), prazos citados no `checklist-formal.md` §8 e hora-limite "23h59min59s, horário de Cuiabá" (`tjmt-peticoes`, Passo 7) |
| Peças (Fase 2) | `tjmt-peticoes` (+ `varredura-de-oportunidades` para autos em curso) | Parcial, forte em forma | Modelos reais em .docx timbrado; as seis etapas do Modo C (cinco aprovações antes de qualquer texto) viram estados da minuta com dono; a coleta do Passo 2 (nove perguntas) vira formulário pré-preenchido pelo banco; tabela TPU; gerador de .docx no servidor no lugar de "use a skill docx". A varredura exige os autos integrais, que só chegam com a extensão do PJe |
| Revisor de peças (Fase 2) | `analise-e-conferencia-de-peticao` (+ checklist do Passo 4 da `tjmt-peticoes`) | Total no conteúdo, parcial na integração | Adaptar de "peça da advogada" para "minuta da IA"; saída estruturada item × situação (OK, Atenção, Crítico, Não verificável); tempestividade calculada pelo banco (data da publicação + prazo); unificar os dois checklists sobrepostos (18 itens + 13 seções); tabela de custas e preparo do TJ-MT |
| Jurisprudência (Fase 2) | Nenhuma (só regras de citação e hierarquia em `tjmt-peticoes` 3.5) | Nenhuma | Base, ingestão, busca e política "sem registro na base, não cita". As skills se contradizem: `tjmt-skill-cl` manda parafrasear, `tjmt-peticoes` manda transcrever a ementa; decidir |
| Cálculos (Fase 2) | Nenhuma, e as skills divergem | Nenhuma | Índices (INPC, IPCA-E, SELIC) com séries históricas e regras por natureza e período. Hoje: `civel-empresarial.md` diz INPC + 1% ao mês; `administrativo-servidores.md` diz INPC + 0,5%; `tjmt-skill-cl` diz SELIC pela EC 113/2021; nenhuma cita a Lei 14.905/2024 (a confirmar) |
| Atendimento ao cliente (Fase 3) | Nenhuma | Nenhuma | Política do que pode dizer; roteiro antifraude (reaproveitar `regras-honorarios.md` item 11 e a cláusula 6.3 do contrato); verificação do telefone; escalonamento |
| Contratos e honorários (Fase 3) | `contratacao-e-honorarios` | Total | Levar URH (R$ 1.339,07, vigência 12/03/2026, bloqueio após 12 meses), Tabela OAB/MT, dados do escritório e modelos para o banco; definir o fator numérico de complexidade (a skill exige e nenhum arquivo define); as duas perguntas de abertura e a parada obrigatória viram estados; gerador de .docx |
| Relatórios (Fase 3) | Nenhuma | Nenhuma | Métricas dependem de `ia_execucoes` e `aprovacoes` |
| (sem módulo) | `tjmt-skill-cl` | Opcional | Agente "como o juiz vai decidir" dentro do Revisor; exige autos integrais |
| (fora do escopo TJ-MT) | `analise-processual-todos-tribunais` | Referência | `camada-local.md` é o esquema da tabela de configuração por tribunal prevista em "Conectores intercambiáveis" |

**O que as skills exigem e o sistema precisa prover.** Todas supõem uma advogada no chat: param para perguntar ("qual polo representamos?", "confirma o valor de R$ X na modalidade Y?", "Etapa N concluída. Confirma?"). No sistema cada parada vira um estado com papel autorizado a responder e alerta se a resposta não vem. O marcador de lacuna é diferente em cada skill ("(verificar)", "[VERIFICAR]", "[[CAMPO]]"); unificar para o sistema bloquear a aprovação enquanto houver lacuna aberta.

**Regras verificáveis por código** (viram validação determinística, não IA): número CNJ e dígito verificador; presença de endereçamento, qualificação, OAB, valor da causa, pedidos numerados e na ordem; todo "Doc. NN" citado existe nos anexos; tempestividade calculada pelo motor de prazos; preparo anexado; JEFP até 60 salários mínimos; todo o cálculo de honorários (rubrica × URH, maior entre piso e percentual, +50% cautelar, teto do art. 50, alerta acima de 30%, bloqueio por tabela vencida); preenchimento dos campos dos modelos e qualificação idêntica nos três documentos. O que fica para a IA: cronologia, teses, estratégia, redação, classificação de argumentos, mapa dos autos.

**Revisão jurídica antes de virar produto** (lista do relatório, a cargo da advogada): Súmula 469/STJ citada em `consumidor.md` (cancelada; substituída pela 608); rol da ANS após a Lei 14.454/2022; juros entre particulares após a Lei 14.905/2024; "BACEN/JUD" (hoje SISBAJUD); art. 28 da Lei 9.605/98 em `agrario-ambiental.md`; divórcio e inventário extrajudiciais após a Res. CNJ 571/2024; art. 1.003 §6º após a Lei 14.939/2024; composição das Câmaras do TJ-MT (duas versões nas skills); "art. 36 do CED" (no CED de 2015 a moderação está no art. 49); dois e-mails diferentes do escritório no contrato e na procuração; precedentes citados sem verificação em `civel-empresarial.md`, o que contraria a regra "nunca inventar jurisprudência" das próprias skills.

**Custo.** Carregar as seis skills inteiras em cada chamada custa caro; carregar só a skill do agente e a referência da área do caso, com prompt caching, reduz o custo por chamada.

---

# Parte 2. Plano de construção

Premissas de leitura desta parte:

- As datas abaixo assumem início em 28/10/2026 (quarta); se o plano for aprovado depois, deslocar todas as semanas pela mesma diferença. Semana 1 começa em 28/10/2026 (quarta). Semanas são "semanas de trabalho"; as semanas 8 a 12 cruzam o recesso forense (20/12 a 20/01) e as festas, e podem escorregar.
- Cada tarefa cabe numa sessão de Claude Code de 1 a 3 horas e termina com um "pronto quando" verificável. A dona do projeto aprova ao fim de cada semana.
- Numeração: T0.x (Fase 0), T1.x (Fase 1), E0..E10 (Fase 2), P1..P6 (Fase 3).
- Tudo que a Parte 1 já detalhou é referenciado pela seção, não repetido.

## 2.1 Decisões de arquitetura fixadas

| Decisão | Escolha | Por quê | Quando revisitar |
|---|---|---|---|
| Forma do MVP | Pipeline: captar → classificar → calcular → confirmar → tarefa → avisar. WhatsApp com lista fechada de intents. O modelo nunca executa escrita; propõe, o código grava após confirmação | Parte 1, 1.4.1 | Início da Fase 2 (E1) |
| Hospedagem | Um app Next.js (App Router) na Vercel (plano Pro: o Hobby é vedado para uso comercial). Supabase em dois projetos: `dev` e `prod` | Uma tecnologia por camada; preview por PR | Se um job passar de 800 s (teto das funções no plano Pro) → worker separado |
| Organização do código | Sem monorepo. `src/lib/*` = módulos puros (sem Next, sem Supabase). `src/server/*` = casos de uso (server actions e serviços). `src/app/*` = telas e rotas | Motor de prazos e regras testáveis sem banco; fronteiras claras para o Claude Code | Fase 2: se a extensão do PJe precisar compartilhar tipos → repositório separado |
| Rotinas | `vercel.json` crons → `/api/jobs/<nome>` protegida por `Authorization: Bearer $CRON_SECRET` → lotes pequenos. Trabalho longo em filas pgmq (`classificacao_publicacoes`, `enriquecimento_datajud`, `notificacoes`) drenadas a cada 5 min (o Pro permite cron até 1 vez por minuto). Cada rodada registrada em `captacoes` ou `jobs_execucoes`, idempotente | Parte 1, 1.4.3 | Fase 2 (ingestão de jurisprudência) |
| Multi-tenant | Tabelas de tenant em `public` com `escritorio_id`; dados de referência em `ref`; funções auxiliares em `app` (schema não exposto pela API). Claims `escritorio_id` e `papel` no JWT via Custom Access Token Hook. Service role só em jobs, iterando escritório a escritório | Parte 1, 1.3.2 | Fase 3 (N vínculos por usuário, papel suporte) |
| Prazos | Motor em TypeScript puro em `src/lib/prazos`; entrada e saída em datas ISO `YYYY-MM-DD`; calendário entra como dado (array de feriados); cobertura 100% exigida no CI; banco guarda `date` | Parte 1, 1.2 e 1.3.3 | Só com novo conjunto de casos reais aprovado pela advogada |
| Fuso horário | `escritorios.timezone` = America/Cuiaba (UTC-4, sem horário de verão). Eventos em `timestamptz`; prazos em `date`. Crons escritos em UTC com deslocamento fixo (7h30 Cuiabá = 11h30 UTC). Uma única função `hojeNoFuso(tz)` com `Intl`, sem biblioteca de fuso | Parte 1, 1.2 | Fase 3, se entrar escritório em fuso com horário de verão |
| IA | SDK oficial `@anthropic-ai/sdk`. Saídas estruturadas com schema Zod (via `output_config.format` ou `messages.parse()`, conforme a versão do SDK instalada; a confirmar). Modelo por tarefa em variável de ambiente (`IA_MODELO_TRIAGEM=claude-haiku-5-5`). Preços em `ref.ia_precos`. Prompts versionados em `src/lib/ia/prompts/<agente>.vN.md`. Texto de terceiros sempre delimitado como dado. Toda chamada grava `ia_execucoes` | Parte 1, 1.3.6 | Fase 2: `claude-sonnet-5-5` e `claude-opus-5-5` nas peças, tool use, cache de prompt |
| WhatsApp | Cloud API da Meta direto; número novo; templates utility; webhook `/api/whatsapp/webhook`; escrita só com eco e "Confirma?" | Parte 1, 1.4.2 e 1.3.4 | Se a verificação da Meta travar → BSP oficial atrás da mesma interface `src/lib/whatsapp` |
| Autenticação | Supabase Auth: e-mail + senha e link mágico (SMTP via Resend). Convite por e-mail. MFA TOTP obrigatório para sócio e advogado (disponível em todos os planos; exigido por policy restritiva com `aal2`) | Parte 1, 1.3.8 | Fase 3 (login Google por escritório) |
| Segredos | Chaves de plataforma em variáveis de ambiente da Vercel. Tokens de integração (WhatsApp, DataJud) no Vault, lidos por função `security definer` restrita à service role; `integracoes.vault_secret_id` aponta para o segredo | Parte 1, 1.3.2 | Fase 2 (refresh tokens Google por usuário) |
| Sigilo | `publicacoes.texto` e `payload_bruto` sem privilégio SELECT para `authenticated`. Leitura só pela RPC `publicacao_texto(id)`, que checa sigilo e papel e grava `auditoria_acessos` (a confirmar: comportamento do PostgREST com privilégio por coluna; alternativa: tabela 1:1 `publicacoes_textos` com policy própria) | Parte 1, 1.3.1 e 1.3.7 | Fase 2 (autos em PDF no Storage) |
| Testes | Vitest (unidade; `src/lib/prazos` 100%). pgTAP via `supabase test db` (isolamento entre tenants e matriz de papéis). Playwright (fumaça). Regressão do classificador com fixture rotulada; chamada real ao modelo só manual | Parte 1, 1.3.6 e 1.3.8 | Fase 2: avaliação por agente |
| Migrações e deploy | SQL versionado pela CLI do Supabase. CI aplica tudo em banco local a cada PR. Prod recebe `supabase db push` por workflow manual com aprovação. Regra: migração compatível com a versão anterior do app | Parte 1, 1.3.6 | Fase 3 (branches de banco, a confirmar) |
| E-mail | Resend: SMTP do Auth e API para notificações e alertas de falha | Parte 1, 1.3.5 | Volume na Fase 3 |
| Documentos | `.docx` com a biblioteca `docx` a partir de templates (fim da Fase 1, contratos). PDF só na Fase 2 (biblioteca decidida na E6) | Parte 1, 1.4.6 | E6 |
| Observabilidade | `captacoes`, `jobs_execucoes`, `ia_execucoes`, página `/admin/status`, e-mail de alerta se a captação não rodou até 9h; logs da Vercel | Parte 1, 1.3.6 | Semana 9: avaliar Sentry (a confirmar plano gratuito) |
| Embeddings | Nenhum no MVP. Provedor e dimensão (1024) por teste cego na E0 da Fase 2 | Parte 1, 1.4.7 | E0 |

Mudança em relação ao enunciado da stack: nenhuma. Acréscimos justificados: schema `app` para funções auxiliares (não polui `public` nem expõe funções pela API); `jobs_execucoes` ao lado de `captacoes` (um lugar único para "a rotina X rodou?").

## 2.2 Estrutura do repositório

```
sistema-para-adv/
├── .github/workflows/
│   ├── ci.yml                      # lint, tsc, vitest (cobertura), supabase start + db reset + test db, next build
│   ├── e2e.yml                     # Playwright contra app local + Supabase local (PR para main)
│   └── deploy-db.yml               # workflow_dispatch com aprovação: supabase db push no prod
├── CLAUDE.md                       # regras do repo para o Claude Code (ver convenções)
├── docs/
│   ├── escopo-revisado.md          # Parte 1 + Parte 2 deste plano
│   ├── adr/                        # 0001-pipeline-sem-orquestrador.md, 0002-cloud-api-direto.md, 0003-vercel-cron-pgmq.md, 0004-ref-global-e-claims-jwt.md, 0005-prazos-date-cuiaba.md, 0006-fallback-intimacoes (Fase 0)
│   ├── regras/                     # prazos.md (regra de contagem com exemplos), notificacoes.md, permissoes.md (matriz papel x ação), glossario.md, estados.md (publicação, prazo, tarefa)
│   ├── runbooks/                   # sistema-fora-do-ar.md, calendario-forense-anual.md, desligamento-de-membro.md, whatsapp-templates.md, operacao-paralela.md, rotacao-de-segredos.md
│   ├── lgpd/                       # registro-operacoes.md (art. 37), retencao.md, bases-legais.md, fornecedores.md
│   └── fase0/                      # teste-de-captacao.md (protocolo), djen-campos.md, datajud-campos.md, resultado-captacao.md
├── supabase/
│   ├── config.toml                 # schemas expostos: public, ref; hook de JWT local; auth.email
│   ├── migrations/                 # <timestamp>_<nome>.sql, ordem em 2.3
│   ├── seed.sql                    # dev: 2 escritórios sintéticos, 6 usuários, processos e publicações falsos
│   ├── seed/                       # tribunais.csv, comarcas_mt.csv, feriados_2026.csv, tpu_movimentos.csv, ia_precos.csv, atos_prazo_padrao.csv
│   └── tests/                      # pgTAP: 001_isolamento_tenants.sql, 002_papeis.sql, 003_sigilo.sql
├── src/
│   ├── app/
│   │   ├── (auth)/login, convite/[token], mfa
│   │   ├── (painel)/               # layout autenticado com escritório e papel do JWT
│   │   │   ├── hoje/               # painel do dia
│   │   │   ├── publicacoes/        # caixa de entrada, [id], nova (lançamento manual)
│   │   │   ├── prazos/             # lista, [id] (confirmação com memória)
│   │   │   ├── tarefas/            # quadro por pessoa, [id]
│   │   │   ├── processos/          # lista, [id], novo, importar, kanban
│   │   │   ├── clientes/
│   │   │   ├── aprovacoes/         # fila (prazos, reatribuições via WhatsApp, contratos)
│   │   │   ├── contratos/          # fim da Fase 1
│   │   │   └── configuracoes/      # escritorio, equipe, atos, fases, calendario, notificacoes, ausencias, whatsapp, integracoes
│   │   ├── admin/                  # status (rotinas), metricas (sócio)
│   │   └── api/
│   │       ├── jobs/               # captar-djen, classificar, enriquecer-datajud, drenar-notificacoes, alertas-publicacao, alertas-prazo, resumo-do-dia, marcar-vencidos, exportar-prazos, atualizar-metricas (route.ts cada)
│   │       ├── whatsapp/webhook/route.ts
│   │       └── health/route.ts
│   ├── components/ui/              # shadcn
│   ├── components/dominio/         # CartaoPrazo, MemoriaContagem, CaixaPublicacoes, QuadroTarefas...
│   ├── lib/                        # módulos puros, sem Next e sem Supabase
│   │   ├── prazos/                 # calendario.ts, contagem.ts, termo-inicial.ts, tipos.ts, index.ts, __tests__/
│   │   ├── cnj/                    # numero-cnj.ts (dígito verificador, máscara, tribunal, origem)
│   │   ├── djen/                   # cliente.ts, normalizar.ts, tipos.ts (Zod permissivo), hash.ts, mocks/
│   │   ├── datajud/                # cliente.ts, normalizar.ts, comarca-por-ibge.ts, mocks/
│   │   ├── ia/                     # cliente.ts, classificador-publicacao.ts, roteador-intents.ts, resumo.ts, custo.ts, schemas/, prompts/
│   │   ├── whatsapp/               # cliente.ts, assinatura.ts, templates.ts, intents/, conversa.ts
│   │   ├── notificacoes/           # regras.ts, horas-uteis.ts, destinatarios.ts (ausências), templates/
│   │   ├── docx/                   # contrato.ts, procuracao.ts, declaracao.ts (fim da Fase 1)
│   │   ├── fila/                   # pgmq.ts (enfileirar, ler, confirmar, arquivar)
│   │   ├── supabase/               # client.ts (browser), server.ts (cookies), admin.ts (service role), database.types.ts (gerado)
│   │   ├── auth/                   # sessao.ts, permissoes.ts (matriz espelhada do SQL, para esconder botões)
│   │   └── config/env.ts           # variáveis de ambiente validadas com Zod
│   ├── server/                     # casos de uso: publicacoes.ts, prazos.ts, tarefas.ts, processos.ts, notificacoes.ts, whatsapp.ts, jobs/
│   └── tipos/                      # tipos de domínio compartilhados
├── tests/
│   ├── e2e/                        # Playwright: login.spec.ts, tratar-publicacao.spec.ts, confirmar-prazo.spec.ts, concluir-tarefa.spec.ts
│   └── fixtures/                   # prazos-reais.json (30 casos), publicacoes-rotuladas.json, frases-whatsapp.json, carteira-exemplo.csv
├── scripts/                        # djen-consulta.ts, datajud-consulta.ts, bootstrap-carteira-djen.ts, importar-carteira.ts, importar-feriados.ts, teste-captacao-cruzar.ts, exportar-prazos-csv.ts
├── .env.example
├── vercel.json                     # crons
├── vitest.config.ts                # cobertura 100% em src/lib/prazos/**
├── playwright.config.ts
└── package.json, tsconfig.json, tailwind.config.ts, components.json
```

Convenções:

- Domínio em português (tabelas, colunas, enums, rotas, componentes, casos de uso): `publicacoes`, `confirmarPrazo`, `/prazos`. Infraestrutura em inglês (pastas e arquivos técnicos): `lib`, `components`, `api`, `route.ts`, `client.ts`.
- `src/lib/*` não importa Next nem Supabase. Recebe dados e devolve dados. Só `src/server/*` e `src/app/*` tocam o banco.
- Jobs usam `admin.ts` (service role) e sempre escrevem `escritorio_id` explícito, iterando `escritorios where ativo`.
- Migração aplicada em prod nunca é editada; cria-se outra.
- Dados reais só no projeto `prod` do Supabase. `dev` e local usam `seed.sql` sintético. Fixtures com texto real de publicações ficam em `tests/fixtures/` e o repositório é privado; nomes de partes pseudonimizados onde o teste não depender deles.
- `CLAUDE.md` registra: as convenções acima, "rode `pnpm test` e `pnpm typecheck` antes de encerrar", "não invente feriado, prazo legal nem campo de API; marque (a confirmar)", "nunca grave segredo no repositório".

Variáveis de ambiente (`.env.example` documenta todas):

| Variável | Onde | Desde |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (a confirmar nomenclatura atual: anon ou publishable) | Vercel (preview = dev, production = prod), local | Semana 1 |
| `SUPABASE_SERVICE_ROLE_KEY` | Vercel (server), nunca no browser | Semana 1 |
| `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, `SUPABASE_PROJECT_REF_PROD` | Só GitHub Actions (deploy-db) | Semana 1 |
| `CRON_SECRET` | Vercel; a Vercel envia em `Authorization` (a confirmar formato) | Semana 2 |
| `ANTHROPIC_API_KEY`, `IA_MODELO_TRIAGEM=claude-haiku-5-5`, `IA_MODELO_RESUMO=claude-haiku-5-5`, `IA_TETO_MENSAL_USD` | Vercel | Semana 2 |
| `DJEN_BASE_URL`, `DATAJUD_BASE_URL`, `DATAJUD_API_KEY` (até ir para o Vault na semana 9) | Vercel | Semana 1 |
| `RESEND_API_KEY`, `EMAIL_REMETENTE` | Vercel e SMTP do Supabase Auth | Semana 2 |
| `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ACCESS_TOKEN` (token migra para o Vault na semana 9) | Vercel | Semana 8 |
| `APP_URL`, `APP_TIMEZONE_PADRAO=America/Cuiaba` | Vercel | Semana 1 |
| `IA_MODELO_PECAS=claude-sonnet-5-5`, `IA_MODELO_PECAS_FORTE=claude-opus-5-5`, `EMBEDDINGS_*`, `GOOGLE_OAUTH_*` | Vercel | Fase 2 |

Ambientes:

- Local: Supabase CLI (`supabase start`) + `next dev`; dados sintéticos.
- Dev (nuvem): projeto Supabase `dev` + deploys de preview da Vercel por PR; dados sintéticos; usado para testar WhatsApp com número de teste da Meta.
- Prod: projeto Supabase `prod` + deploy de produção da Vercel no merge em `main`; migrações aplicadas antes pelo `deploy-db.yml`.
- Região dos projetos Supabase: sa-east-1 (São Paulo), disponível; funções da Vercel em gru1. O que sai do Brasil fica restrito à API do Claude (EUA) e à Meta.

## 2.3 Modelo de dados

Padrão de RLS (vale para toda tabela de tenant, escrito uma vez em `0001` e repetido por tabela):

- Toda tabela de tenant tem `escritorio_id uuid not null references escritorios(id)`, `criado_em`, `atualizado_em` (trigger `app.set_atualizado_em()`), e índice que começa por `escritorio_id`.
- `alter table ... enable row level security` e uma policy `tenant_isolamento for all to authenticated using (escritorio_id = app.escritorio_atual()) with check (escritorio_id = app.escritorio_atual())`.
- `app.escritorio_atual()` = `(select (auth.jwt()->'app_metadata'->>'escritorio_id')::uuid)`, `stable`; `app.papel_atual()` idem para `papel`; `app.usuario_atual()` = `auth.uid()`.
- Regras de papel que dependem de linha (confirmar prazo, aprovar, concluir tarefa, reatribuir) não ficam em policy de UPDATE genérica: ficam em RPCs `security definer` (`confirmar_prazo`, `rejeitar_prazo`, `reatribuir_tarefa`, `concluir_tarefa`, `decidir_aprovacao`) que checam `app.papel_atual()` e a relação com o objeto, gravam `*_por`/`*_em` e o evento. O UPDATE direto nessas colunas é negado por policy restritiva.
- Service role ignora RLS: todo job filtra e grava `escritorio_id` explicitamente. O teste pgTAP `001_isolamento_tenants.sql` cria dois escritórios e prova que nenhum SELECT como usuário de A vê linha de B.
- Claims só mudam no refresh do token: após alterar `escritorio_membros`, o app chama `auth.refreshSession()`.

Exceções ao padrão:

- `ref.*`: sem `escritorio_id`; policy `select to authenticated`; sem policy de escrita (só service role, via rotina de ingestão ou server action restrita a sócio/administrativo que usa `admin.ts` e grava `criado_por`).
- `escritorios`: SELECT só pela linha do próprio escritório (`id = app.escritorio_atual()`); UPDATE só sócio.
- `escritorio_membros`: SELECT do próprio escritório; INSERT/UPDATE/DELETE só sócio; `usuario_id` nulo até o convidado aceitar (vínculo por `email_convite`, trigger em `auth.users`).
- `usuario_telefones`: `UNIQUE(telefone_e164)` global; SELECT do próprio escritório; UPDATE do próprio telefone ou sócio.
- `webhooks_inbox`: só service role; `escritorio_id` nulo até resolver o telefone.
- `auditoria_acessos`: INSERT só por RPC `security definer`; SELECT só sócio.
- `publicacoes.texto` e `payload_bruto`: privilégio de coluna revogado de `authenticated`; leitura por RPC `publicacao_texto()` (ver 2.1, Sigilo).
- `ia_execucoes` e `metricas_diarias`: SELECT só sócio (custos).
- Storage: bucket `documentos` e `exportacoes` privados; policy por prefixo `escritorio_id/` (Fase 1, semana 7 e 10).

Migrations do MVP, na ordem (a CLI prefixa com timestamp; o nome vai depois):

1. `extensoes_e_schemas`: `create schema ref; create schema app;` extensões `pgcrypto`, `pg_trgm`, `pgmq` (a confirmar habilitação pelo painel do Supabase); enum `papel` (socio, advogado, estagiario, administrativo); funções `app.escritorio_atual()`, `app.papel_atual()`, `app.usuario_atual()`, `app.set_atualizado_em()`, `app.cnj_valido(text)` (dígito verificador módulo 97), `app.cnj_mascara(text)`; `grant usage on schema ref to authenticated`.
2. `ref_tribunais_comarcas_feriados`: `ref.tribunais (id, sigla, codigo_cnj, nome, uf, timezone, sistema_eletronico, url_consulta)`; `ref.comarcas (id, tribunal_id, nome, codigo_ibge, ativa)`; enum `ref.abrangencia_feriado` (nacional, estadual, municipal, forense, recesso, suspensao_ad_hoc); `ref.feriados (id, tribunal_id nulo = nacional, comarca_id nulo = todo o tribunal, data, descricao, abrangencia, suspende_prazo bool, ato_normativo, url_fonte, vigencia_inicio, vigencia_fim, criado_por, UNIQUE(tribunal_id, comarca_id, data, descricao))`; `ref.tpu_movimentos (codigo, nome, pai_codigo)`; `ref.ia_precos (modelo, vigencia_inicio, vigencia_fim, input_por_mtok, output_por_mtok, cache_write_por_mtok, cache_read_por_mtok, fonte_url)`. Policies: SELECT `authenticated`. Dados entram por `scripts/importar-feriados.ts` e `supabase/seed/*.csv`.
3. `escritorios_membros_auth`: `escritorios (id, nome, razao_social, cnpj, timezone default 'America/Cuiaba', dias_seguranca_padrao int default 2, horario_resumo time default '07:30', ativo)`; `escritorio_membros (id, escritorio_id, usuario_id nulo, email_convite, papel, nome_completo, oab_numero, oab_uf, oab_sufixo, nomes_alternativos text[], ativo, convite_token, convite_expira_em, aceito_em, UNIQUE(usuario_id, escritorio_id))`; `usuario_telefones (id, escritorio_id, usuario_id, telefone_e164 UNIQUE, verificado_em, codigo_verificacao_hash, principal, ativo)`; `escritorio_configuracoes (escritorio_id, chave, valor jsonb, atualizado_por, PRIMARY KEY(escritorio_id, chave))`; função `public.custom_access_token_hook(event jsonb)` que lê `escritorio_membros` (vínculo ativo) e grava `app_metadata.escritorio_id` e `app_metadata.papel`; `grant execute ... to supabase_auth_admin`, `revoke ... from authenticated, anon, public`; trigger `app.vincular_membro_por_email()` em `auth.users` (insert). Policies descritas em "Exceções". Ativar o hook no painel (prod) e em `config.toml` (local).
4. `clientes_processos`: enums `tipo_pessoa` (fisica, juridica), `polo` (ativo, passivo, terceiro, outro), `processo_status` (ativo, suspenso, arquivado, baixado), `sistema_processual` (pje, projudi, eproc, esaj, outro), `origem_movimentacao` (datajud, pje, manual), `tipo_relacao_processo` (agravo, cumprimento, incidente, recurso, apenso, outro); `clientes (id, escritorio_id, tipo_pessoa, nome, cpf_cnpj, email, telefone_e164, endereco jsonb, observacoes, UNIQUE(escritorio_id, cpf_cnpj) where cpf_cnpj is not null)`; `fases_kanban (id, escritorio_id, nome, ordem, cor, codigos_tpu int[], ativa)`; `processos (id, escritorio_id, numero_cnj char(20) CHECK app.cnj_valido, numero_cnj_mascara gerada, tribunal_id, comarca_id, orgao_julgador_codigo, orgao_julgador_nome, grau, classe_codigo, classe_nome, sistema, data_ajuizamento, valor_causa, segredo_justica bool default false, nivel_sigilo smallint, status, fase_id, fase_sugerida_id, fase_confirmada_por, fase_confirmada_em, responsavel_id, processo_relacionado_id, tipo_relacao, datajud_ultima_sincronizacao, datajud_indisponivel bool, observacoes, UNIQUE(escritorio_id, numero_cnj))`; `processo_assuntos (processo_id, codigo_tpu, nome)`; `processo_partes (id, escritorio_id, processo_id, nome, polo, cliente_id nulo, eh_cliente bool, documento)`; `processo_colaboradores (escritorio_id, processo_id, usuario_id, UNIQUE)`; `movimentacoes (id, escritorio_id, processo_id, origem, codigo_tpu, nome, complemento, data, id_externo, payload jsonb, UNIQUE(processo_id, origem, id_externo))`. Índices `gin (nome gin_trgm_ops)` em `clientes` e `processo_partes`. Policy padrão; UPDATE de `processos.segredo_justica` só advogado/sócio.
5. `ia_aprovacoes_auditoria`: enums `ia_status` (ok, erro, recusado, invalido_schema, cancelado_teto), `aprovacao_objeto` (prazo, tarefa_reatribuicao, tarefa_conclusao, contrato, minuta, mensagem_cliente), `aprovacao_status` (pendente, aprovada, rejeitada, ajustada, expirada), `acesso_acao` (visualizou_texto, exportou, baixou, visualizou_cliente); `ia_execucoes (id, escritorio_id, agente, agente_versao, modelo, input_tokens, output_tokens, cache_creation_input_tokens, cache_read_input_tokens, custo_estimado numeric(12,6), ia_preco_id, latencia_ms, status, erro, request_id, objeto_tipo, objeto_id, criado_em)`; `aprovacoes (id, escritorio_id, objeto_tipo, objeto_id, solicitada_por_tipo enum ia|usuario, solicitada_por_id, ia_execucao_id, conteudo_snapshot jsonb, status, aprovador_id, decidida_em, comentario, ajustes jsonb, prazo_resposta_em, tempo_revisao_humana_s, tempo_economizado_auto_relatado_min)`; `auditoria_acessos (id, escritorio_id, usuario_id, objeto_tipo, objeto_id, acao, contexto jsonb, criado_em)`; RPC `decidir_aprovacao(id, decisao, comentario, ajustes)`. Policies: `ia_execucoes` SELECT sócio; `aprovacoes` padrão com decisão só por RPC; `auditoria_acessos` conforme exceções.
6. `captacoes_publicacoes`: enums `fonte_publicacao` (djen, pje_manual, email_manual, datajud, pje_extensao), `publicacao_tipo` (intimacao, citacao, despacho, decisao, sentenca, acordao, edital, pauta, outro), `publicacao_status` (nova, classificada, vinculada, sem_processo, com_prazo_sugerido, sem_prazo, tratada, ignorada, duplicada, arquivada), `vinculo_tipo` (automatico_numero, manual, nao_e_nosso), `classificado_por` (ia, humano); `captacoes (id, escritorio_id, fonte, iniciada_em, finalizada_em, parametros jsonb, itens_recebidos, itens_novos, itens_duplicados, erros jsonb, status)`; `publicacoes (id, escritorio_id, captacao_id, fonte, id_externo, hash_dedup, payload_bruto jsonb, tribunal_id, numero_cnj char(20) nulo, numero_processo_texto, processo_id nulo, vinculo_tipo, motivo_nao_e_nosso, tipo_origem, tipo, tipo_classificado_por, orgao, classe, meio, data_disponibilizacao date, data_publicacao date, texto, link, destinatarios jsonb, destinatario_advogados jsonb, resumo_ia, sugere_sigilo bool, status, tratada_por, tratada_em, motivo_tratamento, publicacao_anterior_id, ia_execucao_id, UNIQUE(escritorio_id, fonte, id_externo))`; `publicacao_eventos (id, escritorio_id, publicacao_id, de_status, para_status, usuario_id, dados jsonb, criado_em)`; `revoke select (texto, payload_bruto) on publicacoes from authenticated`; RPC `publicacao_texto(publicacao_id)`; RPC `transicionar_publicacao(id, para_status, dados)`. Índices `(escritorio_id, status, data_disponibilizacao)`, `(escritorio_id, processo_id)`.
7. `prazos`: enums `prazo_origem` (publicacao_djen, pje_manual, email_manual, domicilio_eletronico, audiencia, decisao, manual), `prazo_tipo` (processual, material, interno), `contagem` (dias_uteis, dias_corridos, horas), `prazo_status` (sugerido, confirmado, rejeitado, cumprido, vencido, suspenso, prorrogado, cancelado), `cumprimento_evidencia` (tarefa, manual, datajud, pje); `atos_prazo (id, escritorio_id, nome, sinonimos text[], dias int, contagem, dobro_padrao bool, dias_seguranca int, fundamento_legal, ativo)`; `prazos (id, escritorio_id, processo_id, publicacao_id nulo, origem, tipo, contagem, ato_id, ato_descricao, quantidade int, multiplicador smallint default 1, fundamento_dobro, data_disponibilizacao, data_publicacao, data_inicio_contagem, data_final date not null, hora_limite time default '23:59', timezone_juizo, data_interna date, data_sugerida_ia date, data_confirmada date, memoria_calculo jsonb, calendario_incompleto bool, calendario_reconhecido_por, status, motivo_rejeicao, confirmado_por, confirmado_em, cumprido_em, cumprido_por, cumprimento_evidencia, responsavel_id, ia_execucao_id)`; `prazos_eventos (id, escritorio_id, prazo_id, tipo, de_status, para_status, usuario_id, dados jsonb, criado_em)`; RPCs `confirmar_prazo`, `rejeitar_prazo`, `suspender_ou_prorrogar_prazo`, `cumprir_prazo` (papel advogado responsável, colaborador advogado ou sócio; estagiário e administrativo negados). Índices `(escritorio_id, status, data_final)`, `(escritorio_id, responsavel_id, data_final)`.
8. `tarefas`: enums `tarefa_tipo` (protocolar, redigir, revisar, audiencia, contato_cliente, diligencia, conferencia_pje, outro), `tarefa_origem` (prazo, publicacao, audiencia, whatsapp, manual, ia, sistema), `tarefa_status` (a_fazer, em_andamento, pronta_para_revisao, concluida, cancelada), `prioridade` (baixa, normal, alta, critica); `tarefas (id, escritorio_id, processo_id nulo, prazo_id nulo, publicacao_id nulo, titulo, descricao, tipo, origem, criado_por_tipo, criado_por_id, ia_execucao_id, responsavel_id, executor_id, vencimento date, prioridade, status, concluida_em, concluida_por, cancelada_motivo, recorrencia jsonb)`; `tarefa_eventos (id, escritorio_id, tarefa_id, tipo enum criada|reatribuida|status_alterado|comentario|vencimento_alterado, de_usuario_id, para_usuario_id, usuario_id, dados jsonb, criado_em)`; `tipos_tarefa_baseline (id, escritorio_id nulo, tipo, minutos_manual_estimados, fonte_estimativa, vigencia_inicio)`; RPCs `reatribuir_tarefa`, `concluir_tarefa(id, protocolado bool)`, `alterar_status_tarefa` (estagiário só até `pronta_para_revisao`). Views `tarefas_atrasadas`, `tarefas_criticas` calculadas com `hojeNoFuso` passado como parâmetro (função `app.hoje_local(escritorio_id)`).
9. `notificacoes`: enums `evento_notificacao` (nova_publicacao, publicacao_sem_tratamento_24h, publicacao_sem_tratamento_48h, prazo_d3, prazo_d1, prazo_d0, tarefa_atrasada, tarefa_reatribuida, resumo_do_dia, captacao_falhou, calendario_incompleto, convite), `canal` (painel, whatsapp, email), `notificacao_status` (pendente, enfileirada, enviada, entregue, lida, falhou, cancelada); `regras_notificacao (id, escritorio_id, evento, canal, ativo, horario_local time nulo, destinatario_regra text)`; `notificacoes (id, escritorio_id, evento, destinatario_id, canal, template, variaveis jsonb, objeto_tipo, objeto_id, agendada_para timestamptz, status, mensagem_id, erro, chave_dedup UNIQUE)`; `ausencias (id, escritorio_id, usuario_id, inicio date, fim date, tipo, substituto_id, motivo)`. Policy padrão; `notificacoes` SELECT só do destinatário ou sócio.
10. `conversas_whatsapp`: enums `canal_conversa` (whatsapp, painel), `direcao` (entrada, saida), `entrega_status` (enfileirada, enviada, entregue, lida, falhou), `template_status` (rascunho, submetido, aprovado, rejeitado, pausado); `conversas (id, escritorio_id, canal, usuario_id, cliente_id nulo, telefone_e164, ultima_mensagem_recebida_em, estado_assistente jsonb, aberta)`; `mensagens (id, escritorio_id, conversa_id, direcao, id_externo UNIQUE, tipo, texto, payload jsonb, template_nome, status_entrega, erro, intent, ia_execucao_id, criado_em)`; `webhooks_inbox (id, fonte, id_externo UNIQUE, escritorio_id nulo, payload jsonb, recebido_em, processado_em, erro)`; `whatsapp_templates (id, escritorio_id, nome, categoria, idioma, corpo, variaveis jsonb, status_meta, meta_template_id, atualizado_em)`.
11. `integracoes_fila_jobs`: `integracoes (id, escritorio_id, tipo enum whatsapp|datajud|djen|google_workspace|embeddings, config jsonb, vault_secret_id uuid, status, ultimo_erro, atualizado_em)`; função `app.segredo(escritorio_id, tipo)` `security definer` que lê `vault.decrypted_secrets` e só executa como service role; `select pgmq.create('classificacao_publicacoes'); pgmq.create('enriquecimento_datajud'); pgmq.create('notificacoes')` (a confirmar API exposta do pgmq no Supabase); `jobs_execucoes (id, job, escritorio_id nulo, iniciado_em, finalizado_em, status, itens, erro, detalhes jsonb)`.
12. `metricas_exportacoes`: view materializada `metricas_diarias (escritorio_id, dia, publicacoes_captadas, publicacoes_tratadas, prazos_sugeridos, prazos_confirmados, acerto_data_ia, acerto_tipo_ia, tarefas_criadas, tarefas_concluidas, tarefas_atrasadas, mensagens_whatsapp_enviadas, custo_ia_total, custo_por_agente jsonb, tempo_revisao_medio_s, minutos_economizados_estimados)` com refresh pelo job `atualizar-metricas`; `exportacoes (id, escritorio_id, tipo, caminho_storage, linhas, gerada_em)`; bucket `exportacoes`.
13. `contratos_documentos` (fim da Fase 1, condicional): `documentos (id, escritorio_id, processo_id nulo, cliente_id nulo, tipo enum contrato|procuracao|declaracao|peca|autos|anexo|exportacao, nome, bucket, caminho, mime, tamanho, hash_sha256, origem enum gerado|upload|pje_extensao, criado_por)`; `ref.tabelas_honorarios (id, uf, vigencia_inicio, valor_urh numeric, fonte_url, importada_por)`; `ref.tabela_honorarios_itens (tabela_id, secao, item, multiplo_urh, percentual, minimo_urh, observacao)`; `contratos (id, escritorio_id, cliente_id, processo_id nulo, objeto, polo, fase, complexidade enum baixa|media|alta, proveito_economico numeric, modalidade enum, valor_total numeric, parcelas jsonb, honorarios_memoria jsonb, tabela_honorarios_id, status enum rascunho|aguardando_aprovacao|aprovado|assinado|cancelado, documento_contrato_id, documento_procuracao_id, documento_declaracao_id, aprovacao_id)`; bucket `documentos` com policy por prefixo.

Fase 2 (alto nível, ordem provável):

- `pgvector_jurisprudencia_modelos`: extensão `vector`; `ref.jurisprudencia (tribunal, orgao, numero, relator, data_julgamento, ementa, inteiro_teor_url, hash)`; `ref.jurisprudencia_chunks (jurisprudencia_id, chunk_idx, texto, embedding vector(1024), embedding_modelo, embedding_versao, tsv tsvector gerado 'portuguese')` com índice HNSW e GIN; `modelos_peca (escritorio_id, tipo_peca, area, nome, documento_id, variaveis jsonb, ativo)`; `modelos_peca_chunks`; `jurisprudencia_anotacoes (escritorio_id, jurisprudencia_id, nota, favorita)`. Dimensão só depois da E0.
- `minutas`: `minutas (escritorio_id, processo_id, prazo_id nulo, tipo_peca, area, tribunal_id, modelo_peca_id, titulo, status enum rascunho|em_etapas|em_revisao_ia|aguardando_aprovacao|devolvida|aprovada|protocolada|arquivada|cancelada, etapa_atual smallint, versao_atual_id, responsavel_id, protocolo_numero, protocolada_em)`; `minuta_etapas (minuta_id, numero 1..6, conteudo_md, aprovada_por, aprovada_em, comentarios)`; `minuta_versoes (minuta_id, numero, autor_tipo, autor_id, ia_execucao_id, conteudo_md, documento_id, resumo_alteracoes, UNIQUE(minuta_id, numero))`; `minuta_revisoes (minuta_versao_id, ia_execucao_id, itens jsonb [{item, resultado OK|Atencao|Critico, observacao}], relatorio_md)`.
- `audiencias_google`: `audiencias (escritorio_id, processo_id, data_hora timestamptz, timezone, tipo, modalidade, local, link, responsavel_id, participantes, google_event_id)`; `usuario_oauth_tokens (usuario_id, escritorio_id, provedor, vault_secret_id, scopes text[], conta_email, expira_em, revogado_em)`; `agenda_sincronizacoes`.
- `calculos`: `ref.indices_economicos (indice, competencia date, valor, fonte_url)`; `calculos (escritorio_id, processo_id, tipo, parametros jsonb, resultado jsonb, documento_pdf_id, aprovacao_id)`; `calculo_itens`.
- `autos_extensao`: `documentos.origem = pje_extensao`, `extensao_dispositivos (usuario_id, token_hash, ultimo_uso)`, `expedientes_pje (escritorio_id, processo_id, id_externo, data_ciencia, prazo_pje, payload)`.

Fase 3 (alto nível):

- `multi_escritorio_real`: remover a regra de um vínculo; `escritorio_membros` com N linhas por usuário; claim `escritorio_id` escolhido pelo app e gravado em `app_metadata` via RPC `trocar_escritorio` + refresh; papel `suporte` (Cerrado Hub) com `acessos_suporte (escritorio_id, usuario_id, motivo, inicio, fim)` e auditoria.
- `planos_assinaturas`: `ref.planos`, `assinaturas (escritorio_id, plano_id, inicio, fim, status)`, `escritorio_limites (usuarios_max, processos_max, teto_ia_usd)`.
- `atendimento_cliente`: `clientes_contatos` verificados, `conversas.cliente_id` em uso, `regras_atendimento (escritorio_id, horario, mensagens_permitidas, texto_identificacao)`, `opt_ins_lgpd`.
- `lgpd_produto`: `operacoes_tratamento` (registro art. 37 por escritório), `lgpd_solicitacoes (titular, tipo acesso|exclusao|portabilidade, prazo, status)`, `politicas_retencao`, job de descarte.
- `relatorios`: views materializadas por escritório e por usuário; `relatorios_agendados`.

## 2.4 Fase 0: Validação (semanas 1 e 2)

### Semana 1 (28/10 a 03/11): repositório de pé, dados do escritório, DJEN e DataJud funcionando

Objetivo: provar que o sistema consegue falar com o DJEN e o DataJud com os dados reais do escritório e montar a carteira inicial.

Entregas: app na Vercel com banco em prod e dev; `ref` carregado; cliente DJEN e DataJud; carteira importada em prod.

Tarefas:

- T0.1 Primeira sessão (roteiro literal em 2.10): app, Supabase local e nuvem, Vercel, CI, migrations 1 e 2, deploy. Pronto quando: `GET /api/health` em produção responde 200 com `select 1` no banco; CI verde.
- T0.2 `docs/`: `escopo-revisado.md` (Parte 1 + Parte 2), ADRs 0001 a 0005, `docs/regras/prazos.md` com a regra de contagem em prosa e 5 exemplos resolvidos à mão (disponibilização numa sexta; véspera de feriado municipal; recesso; dobro; prazo em dias corridos), `docs/regras/estados.md`, `docs/regras/glossario.md`. Pronto quando: a advogada aprova os 5 exemplos por escrito.
- T0.3 `src/lib/cnj/numero-cnj.ts` + testes: validação do dígito verificador, máscara, extração de ano, segmento, tribunal (8.11) e origem. Pronto quando: 100% de cobertura; casos reais do escritório passam; número com DV errado é recusado.
- T0.4 `src/lib/djen/cliente.ts` + `normalizar.ts` + `tipos.ts` (Zod permissivo, `passthrough`) + `hash.ts`: consulta por `numeroOab`/`ufOab` e intervalo, paginação, espera em 429, normalização para `PublicacaoNormalizada`. Script `scripts/djen-consulta.ts --oab 20817 --uf MT --dias 180`. Pronto quando: roda contra a API real e lista N publicações; nomes exatos dos campos registrados em `docs/fase0/djen-campos.md` (fecha os "a confirmar" da Parte 1, 1.3.3).
- T0.5 `scripts/bootstrap-carteira-djen.ts`: dos 180 dias de DJEN por OAB, extrai números CNJ distintos e gera `carteira-rascunho.csv` com as colunas da Parte 1, 1.5 (cliente, polo, parte contrária, comarca, responsável, colaboradores, sigiloso, fase) em branco. Pronto quando: CSV entregue à advogada para completar.
- T0.6 `src/lib/datajud/cliente.ts` + `normalizar.ts` + `comarca-por-ibge.ts`: consulta `api_publica_tjmt/_search` por `numeroProcesso`, normaliza classe, assuntos, órgão julgador (IBGE → `ref.comarcas`), grau, nível de sigilo e movimentos. Script `scripts/datajud-consulta.ts <cnj>`. Pronto quando: 10 processos reais consultados; campos em `docs/fase0/datajud-campos.md`; processo sigiloso retorna "indisponível" sem erro.
- T0.7 Migrations 3 e 4 + `seed.sql` com 2 escritórios sintéticos + pgTAP `001_isolamento_tenants.sql`. Hook de JWT ativado em local e prod. Pronto quando: `supabase db reset` e `supabase test db` passam; login em prod devolve JWT com `escritorio_id` e `papel`.
- T0.8 `scripts/importar-carteira.ts`: lê o CSV completado, valida CNJ, cria `clientes`, `processos`, `processo_partes`, `processo_colaboradores`, enriquece pelo DataJud, marca `datajud_indisponivel` nos sigilosos. Roda contra prod com service role. Pronto quando: 100% das linhas importadas ou listadas num relatório de rejeição com motivo.

Insumos do escritório (semana 1): nome completo, OAB/UF com sufixo e nomes alternativos de cada advogado; CPF e e-mail de cada membro com papel; CSV da carteira completado; chave pública do DataJud (wiki do CNJ); pedido de verificação da conta Meta Business e reserva do número (não bloqueia, mas tem fila).

Critério de passagem da semana: DJEN devolve publicações reais por OAB; carteira importada em prod com ao menos 90% enriquecida pelo DataJud ou marcada indisponível/sigilosa; isolamento entre tenants provado.

### Semana 2 (04/11 a 10/11): captação automática rodando e teste de captação iniciado

Objetivo: o sistema capta sozinho todo dia útil, grava sem duplicar e mostra numa tela; o teste de 10 dias úteis começa.

Entregas: job de captação em produção; tela de publicações (leitura); classificador v0 em lote; protocolo e script do teste; matriz de permissões e wireframes aprovados.

Tarefas:

- T0.9 Migrations 5 e 6; `src/server/jobs/captar-djen.ts` + `/api/jobs/captar-djen` (por escritório, por OAB ativa, janela de 3 dias para pegar atraso, dedup por `(fonte, id_externo)` e `hash_dedup`, `captacoes` por rodada); `vercel.json` com `0 10,11,12 * * 1-5` (6h, 7h, 8h Cuiabá). Página mínima `/admin/status` com as rodadas. Pronto quando: três rodadas reais gravadas; segunda rodada do mesmo dia não cria duplicata; falha de rede aparece em `captacoes.erros`.
- T0.10 Autenticação mínima (login por link mágico via Resend, layout `(painel)`) e tela `/publicacoes` só leitura: lista por data com filtro vinculada / sem processo, detalhe com texto e link. Pronto quando: a advogada loga em prod e vê as publicações do dia.
- T0.11 Protocolo do teste em `docs/fase0/teste-de-captacao.md` (quem registra, onde, quando) e planilha compartilhada com colunas: data, processo, tipo, meio (PJe expediente, e-mail, DJEN), horário visto. Script `scripts/teste-captacao-cruzar.ts` cruza a planilha com `publicacoes` e gera tabela só DJEN / só PJe-e-mail / ambos, com latência (horas entre disponibilização e captação). Pronto quando: roda com o registro de um dia.
- T0.12 Classificador v0: `src/lib/ia/classificador-publicacao.ts` com `claude-haiku-5-5`, saída estruturada (schema Zod em `src/lib/ia/schemas/classificacao.ts`: `tipo`, `gera_prazo`, `dias_sugeridos`, `contagem`, `dobro`, `numero_cnj`, `partes[]`, `sugere_sigilo`, `resumo_simples`, `confianca`), prompt `prompts/classificador-publicacao.v0.md` com o texto delimitado como dado; roda em lote por script sobre as publicações captadas e grava `ia_execucoes`. Nenhuma ação dispara. Pronto quando: 100% das publicações da semana classificadas; custo por publicação visível; a advogada rotula acerto numa planilha que vira `tests/fixtures/publicacoes-rotuladas.json`.
- T0.13 `docs/regras/permissoes.md` (matriz papel × ação da Parte 1, 1.3.1, célula a célula), `docs/regras/notificacoes.md` (tabela evento → destinatário → canal → horário → template) e descrição em Markdown das 6 telas do MVP (hoje, publicações, prazos, tarefas, processos, configurações) com os campos e ações de cada uma. Pronto quando: a advogada aprova as três.
- T0.14 Ações fora do código: criar app na Meta for Developers, pedir verificação do negócio, registrar domínio neutro, abrir conta na Resend com domínio verificado, ler e arquivar termos de uso do DJEN e do DataJud em `docs/lgpd/fornecedores.md`. Pronto quando: pedidos protocolados e datas anotadas.

Insumos do escritório (semana 2): registro diário das intimações recebidas pelo PJe e e-mail (administrativo, todo dia até as 18h) durante 10 dias úteis; rótulo de acerto do classificador (advogada, 15 min por dia).

Critério de passagem da Fase 0 (formalizado no fim da semana 3, quando os 10 dias úteis fecham; ver "Inconsistências"):

- Toda intimação dirigida a advogado do escritório que saiu no DJEN foi captada até as 9h do dia útil seguinte à disponibilização.
- Toda ocorrência "só PJe/e-mail" está classificada (publicação sem o nome ou a OAB do advogado, intimação pessoal que não é do advogado, erro de captação) e o fallback está escrito no ADR 0006 (padrão: corrigir o cadastro nos processos apontados e conferência semanal do painel do PJe com lançamento manual, Parte 1, 1.4.4).
- Classificador v0 com tipo de ato correto em ao menos 85% (meta de 95% até a semana 5).
- Nenhuma duplicata sem marcação.

## 2.5 Fase 1: MVP interno (semanas 3 a 10)

### Semana 3 (11/11 a 17/11): cadastro, equipe, carteira nas telas; motor de prazos (código puro)

Objetivo: a equipe entra com papéis, a carteira vive no painel e o motor de prazos existe e passa nos casos reais.

- T1.1 `/configuracoes/escritorio` (razão social, CNPJ, timezone, horário do resumo, dias de segurança padrão) e `/configuracoes/equipe` (convite por e-mail com papel, OAB/UF/sufixo, nomes alternativos, telefone; ativar/desativar). Fluxo `/convite/[token]`. Pronto quando: dois usuários de papéis distintos aceitam convite, logam e o JWT traz o papel certo; usuário desativado perde acesso no próximo refresh.
- T1.2 `/processos` (lista com filtros: responsável, status, sigilo, próximo prazo fatal, última movimentação; busca por número ou nome de parte com `pg_trgm`), `/processos/[id]` (dados, partes, colaboradores, movimentações, publicações, prazos, tarefas), `/processos/novo` (por CNJ com enriquecimento DataJud), `/processos/importar` (CSV com o mesmo validador do script). Pronto quando: a carteira real aparece; "processo da Marina" é encontrado pela busca.
- T1.3 `/clientes` (lista, cadastro, edição, vínculo com partes). Pronto quando: todo cliente da planilha tem ao menos um processo vinculado.
- T1.4 Motor de prazos, parte 1: `src/lib/prazos/calendario.ts` (`ehDiaUtil(data, calendario, comarcaId)`, `proximoDiaUtil`, recesso 20/12 a 20/01), `termo-inicial.ts` (disponibilização → publicação → início), `contagem.ts` (dias úteis, corridos, horas; multiplicador; prorrogação do vencimento pelo art. 224 §1º; `diasPulados[]` com motivo; `avisos[]` quando faltar calendário do ano ou da comarca). Testes com `tests/fixtures/prazos-reais.json` (30 casos da advogada) e casos sintéticos de borda. Pronto quando: 30 de 30 casos reais batem; cobertura 100% em `src/lib/prazos/**` exigida no `vitest.config.ts`.
- T1.5 `scripts/importar-feriados.ts` + `/configuracoes/calendario` (lista por ano, tribunal e comarca; adicionar suspensão ad hoc com ato normativo e URL; só sócio e administrativo). Carregar nacionais, estaduais de MT, Portaria do calendário forense 2026 e municipais das comarcas da carteira. Pronto quando: `ref.feriados` tem 2026 completo para as comarcas da carteira; tela mostra "calendário 2027: pendente".

Insumos: 30 intimações reais já contadas (data de disponibilização, ato, prazo, data final); lista de fases do escritório; prazos padrão por ato e dias de segurança; Portaria do calendário forense 2026 e feriados municipais das comarcas.

### Semana 4 (18/11 a 24/11): captação completa, classificação em produção, fluxo da publicação

Objetivo: toda publicação segue a máquina de estados e a classificação roda sozinha.

- T1.6 `src/server/publicacoes.ts`: transições (vincular por número automático na captação; `cadastrar na carteira`; `não é nosso` com motivo; `duplicada`; `sem prazo` com motivo; `ignorar`; `arquivar`) via RPC `transicionar_publicacao`, com `publicacao_eventos`. Testes de transição permitida/proibida. Pronto quando: tabela de transições em `docs/regras/estados.md` igual ao código e aos testes.
- T1.7 `/publicacoes` completa: caixa de entrada com filtros (status, responsável do processo, data, fonte), detalhe com texto (via RPC, registrando acesso), resumo da IA, destinatários, link do DJEN, botões de transição por papel. Administrativo não vê texto de processo sigiloso. Pronto quando: a advogada trata um dia inteiro só pela tela; `auditoria_acessos` registra cada leitura de texto sigiloso.
- T1.8 Classificador v1 em produção: a captação enfileira em `classificacao_publicacoes`; `/api/jobs/classificar` drena em lotes de 10, grava tipo, `gera_prazo`, `numero_cnj`, resumo, `sugere_sigilo`, `ia_execucoes` com os quatro contadores e custo por `ref.ia_precos`; teste de regressão `src/lib/ia/__tests__/classificador.regressao.test.ts` contra `publicacoes-rotuladas.json` (mock das respostas gravadas; chamada real só com `IA_TESTE_REAL=1`). Pronto quando: tipo de ato correto em ao menos 95% da fixture; publicação com `confianca < 0,7` fica em `classificada` com aviso "revisar classificação".
- T1.9 Lançamento manual (fallback da Fase 0): `/publicacoes/nova` com processo, fonte (`pje_manual`, `email_manual`), data de disponibilização ou ciência, tipo, texto opcional; segue o mesmo fluxo. Pronto quando: o administrativo lança um expediente do PJe e ele aparece na caixa de entrada com prazo sugerido (semana 5).
- T1.10 Republicação e cancelamento: mesma combinação processo + tipo em janela de 10 dias com `hash_dedup` diferente marca `publicacao_anterior_id` e aviso "possível republicação; prazo recalculado"; além da heurística, usar os campos oficiais do DJEN `status`, `ativo`, `motivo_cancelamento` e `data_cancelamento` (verificados na Parte 1, 1.3.3) e recaptar por `numeroComunicacao`. Pronto quando: caso simulado no teste gera o aviso e não duplica prazo confirmado sem revisão.

Insumos: decisão do fallback (ADR 0006) com o resultado do teste.

### Semana 5 (25/11 a 01/12): prazos (sugestão, confirmação, estados)

Objetivo: cada publicação com prazo vira prazo sugerido com memória, confirmado só por quem pode.

- T1.11 Migration 7; `/configuracoes/atos` (ato, sinônimos, dias, contagem, dobro padrão, dias de segurança, fundamento) carregada com a lista do escritório. Pronto quando: a lista do escritório está no banco e o classificador mapeia `tipo` + texto para `ato_id` por sinônimo.
- T1.12 Sugestão de prazo: ao classificar `gera_prazo = true`, `src/server/prazos.ts` monta a entrada do motor com tribunal, comarca do processo, feriados do período e ato, grava `prazos` em `sugerido` com `memoria_calculo` (cada dia pulado e por quê), `data_sugerida_ia`, `data_interna = data_final menos dias_seguranca úteis`, `calendario_incompleto` quando o motor avisar. Uma publicação pode gerar N prazos. Pronto quando: publicação real do DJEN gera prazo sugerido com memória igual à contagem manual da advogada.
- T1.13 `/prazos` (filtros: status, responsável, hoje, amanhã, semana conforme glossário) e `/prazos/[id]`: quatro datas, memória linha a linha, trocar ato, dobro e data antes de confirmar; `confirmar_prazo`, `rejeitar_prazo` (motivo), reconhecer calendário incompleto. Pronto quando: pgTAP `002_papeis.sql` prova que estagiário e administrativo não confirmam; Playwright `confirmar-prazo.spec.ts` confirma um prazo; `data_sugerida_ia` e `data_confirmada` ficam gravadas separadas.
- T1.14 Estados após confirmação: `suspender_ou_prorrogar_prazo` (nova data + ato normativo ou decisão), `cumprir_prazo` (manual ou pela tarefa), job `/api/jobs/marcar-vencidos` às `5 4 * * *` (0h05 Cuiabá) marcando `vencido` o confirmado não cumprido. Pronto quando: testes de transição passam; job idempotente (rodar duas vezes não cria eventos duplicados).
- T1.15 View `ia_acerto` (percentual `data_sugerida_ia = data_confirmada` e tipo correto, por semana) em `/admin/status`. Pronto quando: número aparece e bate com a planilha de rótulos.

Insumos: validação diária dos prazos sugeridos pela advogada (10 min por dia).

### Semana 6 (02/12 a 08/12): tarefas e equipe

Objetivo: toda confirmação vira tarefa com dono, e o quadro mostra o que está atrasado.

- T1.16 Migration 8; criação automática: confirmar prazo cria tarefa `protocolar` com `vencimento = data_interna`, `responsavel_id` = responsável do processo, `executor_id` editável; publicação `sem_prazo` pode gerar tarefa manual; processo sigiloso gera tarefa recorrente `conferencia_pje` semanal. Pronto quando: teste prova 1 confirmação = 1 tarefa; recorrência cria a próxima ao concluir.
- T1.17 `/tarefas` (quadro por pessoa com colunas `a_fazer`, `em_andamento`, `pronta_para_revisao`, `concluida`; destaque atrasada e crítica pelo glossário; filtros por processo e período) e `/tarefas/[id]` (reatribuir com motivo, comentar, alterar vencimento, concluir com pergunta "protocolado? marcar prazo como cumprido"). Pronto quando: estagiário só chega a `pronta_para_revisao` (RPC nega `concluida`); reatribuição grava `tarefa_eventos` com de/para/quem/quando.
- T1.18 `/configuracoes/ausencias`: período, tipo, substituto; `src/lib/notificacoes/destinatarios.ts` resolve o destinatário efetivo; a tela de tarefas sugere reatribuir as do ausente. Pronto quando: teste unitário prova que notificação do ausente vai ao substituto.
- T1.19 `/processos/kanban`: colunas de `fases_kanban`, `fase_sugerida` pelo último movimento do DataJud (`codigos_tpu`), destaque quando diverge da `fase_id`, confirmar fase grava autor e data. Pronto quando: divergência aparece e a confirmação registra quem.

Insumos: baseline de minutos por tipo de tarefa (para `tipos_tarefa_baseline`).

### Semana 7 (09/12 a 15/12): notificações e painel do dia

Objetivo: o sistema avisa as pessoas certas na hora certa, por painel e e-mail; o painel do dia vira a primeira tela.

- T1.20 Migration 9; `src/lib/notificacoes/regras.ts` (tabela da Parte 1, 1.3.1, codificada, com override por `regras_notificacao`), `horas-uteis.ts` (dias úteis do escritório em America/Cuiaba, 8h às 18h), fila `notificacoes`, `/api/jobs/drenar-notificacoes` a cada 5 min, canais `painel` (sininho na UI lendo `notificacoes`) e `email` (Resend). `chave_dedup` impede repetição no mesmo dia. Pronto quando: nova publicação vinculada gera notificação no painel e e-mail ao responsável em até 5 min; testes das regras passam.
- T1.21 Jobs de alerta: `/api/jobs/alertas-publicacao` (de hora em hora em dias úteis, `0 12-22 * * 1-5`; 24h úteis sem tratamento → responsável; 48h → sócios), `/api/jobs/alertas-prazo` (`0 11 * * 1-5`, 7h Cuiabá: D-3, D-1 e D0 ao responsável; D0 também ao sócio), `/api/jobs/resumo-do-dia` (`30 11 * * 1-5`, 7h30 Cuiabá: por usuário ativo, publicações novas, prazos hoje/amanhã/semana com data fatal e interna, tarefas atrasadas; sócio recebe também a visão do escritório). Pronto quando: resumo chega por e-mail às 7h30 e o mesmo texto aparece em `/hoje`.
- T1.22 `/hoje`: cartões (publicações a tratar, prazos hoje/amanhã/semana, tarefas atrasadas e críticas, processos sigilosos sem acompanhamento com a tarefa de conferência, "calendário 2027 pendente"); alternância "meu / escritório" para sócio. Pronto quando: a advogada usa `/hoje` como primeira tela por uma semana e aprova.
- T1.23 `/api/jobs/exportar-prazos` (`0 22 * * 1-5`, 18h Cuiabá): CSV dos prazos confirmados e sugeridos dos próximos 60 dias no bucket `exportacoes` + e-mail para a sócia com o arquivo. `docs/runbooks/sistema-fora-do-ar.md`. Pronto quando: arquivo diário existe; runbook ensaiado uma vez (abrir o CSV e conferir no PJe).

Insumos: Portaria do calendário forense 2027 (publicada normalmente em novembro/dezembro; a confirmar) para importar antes do recesso.

### Semana 8 (16/12 a 22/12): WhatsApp

Objetivo: a equipe pergunta e recebe alertas pelo WhatsApp oficial, com escrita só confirmada.

- T1.24 Migration 10; `/api/whatsapp/webhook` (GET de verificação; POST com `X-Hub-Signature-256`, grava `webhooks_inbox`, responde 200 em menos de 1 s, processa em seguida; idempotência por `wamid`); `src/lib/whatsapp/cliente.ts` (texto livre, template, marcar lida); verificação de telefone em `/configuracoes/equipe` (código enviado pelo WhatsApp). Pronto quando: mensagem do telefone da advogada vira `mensagens` em prod; resposta "Olá, Bruna" sai; telefone não cadastrado recebe texto padrão sem dados.
- T1.25 Roteador de intents: `src/lib/ia/roteador-intents.ts` (`claude-haiku-5-5`, saída estruturada: `intent` em {`resumo_do_dia`, `prazos_semana`, `prazos_hoje_amanha`, `movimentos_processo`, `tarefas_pessoa`, `reatribuir_tarefa`, `concluir_tarefa`, `confirmar_prazo`, `fora_do_escopo`}, entidades: processo por número parcial ou nome, pessoa, período, `confianca`), handlers de leitura em `src/lib/whatsapp/intents/*.ts` com consultas SQL e resumo em linguagem simples; ambiguidade lista candidatos numerados; processo sigiloso responde só "há publicação nova no processo X; veja no painel". Fixture `frases-whatsapp.json` com 30 frases reais da equipe. Pronto quando: 5 intents de leitura acertam ao menos 90% da fixture.
- T1.26 Intents de escrita: eco completo + "Confirma? (sim/não)", estado em `conversas.estado_assistente` com expiração de 10 min, execução pelas mesmas RPCs (papel checado no banco), registro em `aprovacoes` (`tarefa_reatribuicao`, `tarefa_conclusao`, `prazo`). Fora da lista: "isso ainda não faço; abra no painel: <link>". Pronto quando: nenhuma escrita acontece sem "sim"; log mostra quem, o quê, quando.
- T1.27 Templates: `docs/runbooks/whatsapp-templates.md`; criar e submeter `resumo_do_dia`, `alerta_prazo`, `nova_publicacao`, `tarefa_reatribuida`, `publicacao_sem_tratamento`; `whatsapp_templates` com status; canal `whatsapp` na fila (template fora da janela de 24h, texto livre dentro). Pronto quando: templates aprovados pela Meta (a confirmar tempo de aprovação); resumo das 7h30 chega no WhatsApp.
- T1.28 Proteções: limite de 20 mensagens por telefone por hora, telefone revogável em um clique, texto de terceiros nunca vira instrução (delimitado), nenhuma resposta inclui dados de outro escritório (teste com os dois tenants de dev). Pronto quando: testes passam.

Insumos: conta Meta Business verificada, número novo ativo, lista de telefones autorizados.

### Semana 9 (23/12 a 29/12): segurança, LGPD, métricas, operação

Objetivo: fechar o que a Parte 1 (1.3.7 e 1.3.8) exige antes de confiar no sistema.

- T1.29 Migration 11: `integracoes` + Vault; mover token do WhatsApp e chave do DataJud para o Vault; `app.segredo()`; `docs/runbooks/rotacao-de-segredos.md`. Pronto quando: nenhum segredo em coluna texto; `grep` por tokens no banco de dev não encontra nada; rotação ensaiada em dev.
- T1.30 Permissões: pgTAP `002_papeis.sql` cobrindo cada célula de `docs/regras/permissoes.md` e `003_sigilo.sql`; MFA TOTP obrigatório para sócio e advogado; `docs/runbooks/desligamento-de-membro.md` (desativar vínculo, revogar telefone, encerrar sessões, reatribuir tarefas). Pronto quando: pgTAP verde célula a célula; desligamento ensaiado com usuário de teste.
- T1.31 LGPD: `docs/lgpd/registro-operacoes.md` (art. 37), `bases-legais.md`, `retencao.md` (logs e aprovações por 5 anos), `fornecedores.md` (Anthropic: DPA, retenção, cláusulas-padrão da ANPD; Meta; Supabase; Vercel; Resend); minimização verificada no código (só texto da publicação vai à IA; nunca cadastro de cliente); job que apaga `resumo_ia` e bloqueia reenvio quando o processo for marcado sigiloso depois. Pronto quando: documentos aprovados pela advogada; teste prova o apagamento.
- T1.32 Migration 12 e métricas: `metricas_diarias` com refresh em `/api/jobs/atualizar-metricas` (`0 3 * * *`), `tempo_revisao_humana_s` calculado na decisão da aprovação, campo opcional "tempo economizado" na tela, teto mensal `IA_TETO_MENSAL_USD` (ao atingir 80%: e-mail ao sócio; a 100%: classificação pausa, publicações ficam `nova` com aviso). `/admin/metricas`. Pronto quando: custo de IA do mês bate com a fatura da Anthropic dentro de 5%.
- T1.33 Operação: `/admin/status` completo (última rodada de cada job, erros, tamanho das filas, status dos templates), `/api/health`, job `captacao-vigilante` (`0 13 * * 1-5`, 9h Cuiabá: se não houve captação com sucesso hoje, e-mail e WhatsApp ao sócio), backups diários do plano Pro (retidos por 7 dias) e ensaio de restauração em dev com `supabase db dump`. Pronto quando: alerta disparado numa falha simulada; restauração ensaiada.

Insumos: termos comerciais da Anthropic e decisão sobre cláusulas-padrão; nomeação do encarregado.

### Semana 10 (30/12 a 05/01): operação paralela, fumaça, contratos (se houver folga)

Objetivo: começar a operar de verdade, com o PJe como oficial, e fechar o CI de ponta a ponta.

- T1.34 Playwright: `login.spec.ts`, `tratar-publicacao.spec.ts`, `confirmar-prazo.spec.ts`, `concluir-tarefa.spec.ts`, webhook do WhatsApp simulado por `curl` assinado; `e2e.yml` roda em PR para `main`. Pronto quando: verde no CI em app local + Supabase local.
- T1.35 `docs/runbooks/operacao-paralela.md`: PJe e e-mail continuam oficiais; toda sexta o administrativo cruza prazos do sistema com o PJe e registra divergências em `/admin/divergencias` (tabela `divergencias_operacao`: prazo_id, o que divergiu, causa, correção); reunião semanal de 30 min. Pronto quando: a primeira sexta está registrada.
- T1.36 Buffer de correções da primeira semana real.
- T1.37 Contratos e honorários (condicional, Parte 1, 1.4.6): migration 13; importar `tabela-oab-mt.md` da skill para `ref.tabelas_honorarios` (URH e vigência; bloqueio se a tabela passar de 12 meses); `/contratos/novo` em dois passos como a skill (diagnóstico e cálculo → confirmação da modalidade → documentos); `src/lib/docx/{contrato,procuracao,declaracao}.ts` a partir dos `assets/*.md` da skill convertidos em templates com marcadores; entra em `aprovacoes` (`contrato`); arquivos no bucket `documentos`. Pronto quando: um contrato real gerado, aprovado e assinado. Se não couber, vira E0 da Fase 2.

Critério de passagem da Fase 1 para começar a Fase 2 (Parte 1, 1.4.5): 4 semanas consecutivas de operação paralela em período forense normal (ver "Inconsistências") com zero divergência de prazo não explicada; captação 100% nos cruzamentos semanais; acerto de data sugerida igual à confirmada em ao menos 95%; intents do WhatsApp em ao menos 90%; pgTAP de isolamento e papéis verde; custo de IA dentro do teto. O relógio de 2 a 3 meses sem prazo perdido (critério de produto) continua correndo.

## 2.6 Fase 2: IA nas peças

Começo: após 4 semanas estáveis de operação paralela (semanas 11 a 14 no melhor caso; na prática, após 20/01/2027, ver "Inconsistências"). Durante a espera, roda a E0. Entregas em paralelo onde não houver dependência.

| Entrega | O que entrega | Depende de | Decisões que exige | Pronto quando |
|---|---|---|---|---|
| E0 Pré-requisitos | Modelos de peça .docx com timbre (contestação, réplica, agravo, apelação, cumprimento) em `modelos_peca`; teste cego de embeddings (50 consultas reais, 3 candidatos, dimensão 1024); projeto Google Cloud com tela de consentimento e pedido de verificação; spike da extensão do PJe (abaixo); contratos (T1.37) se pendentes; conjunto de avaliação por skill (5 a 10 casos reais com rubrica da advogada) | Passagem da Fase 1 | Provedor de embeddings; escopo da extensão (go/no-go); Sonnet 5.5 ou Opus 5.5 por agente (medir em 5 peças) | ADRs 0007 (embeddings), 0008 (extensão), 0009 (modelos por agente) escritos |
| E1 Orquestrador e agentes | `src/lib/ia/agentes/`: cada skill vira prompt de sistema versionado (`prompts/tjmt-peticoes.v1.md`, `varredura.v1.md`, `conferencia.v1.md`, `julgador.v1.md`, `honorarios.v1.md`, `outros-tribunais.v1.md`) com cache de prompt; ferramentas tipadas de leitura (`consultar_processo`, `listar_publicacoes`, `listar_prazos`, `buscar_jurisprudencia`, `ler_documento`) com `strict: true`; regra: leitura volta direto, produção vai para `aprovacoes`; tela `/assistente` (chat por processo); tratamento de `stop_reason: refusal`; teto por escritório | E0 | Tool Runner do SDK ou laço manual; `effort` por agente; streaming no painel | 10 conversas reais sem ação de escrita fora de `aprovacoes`; `cache_read_input_tokens > 0` nas chamadas repetidas |
| E2 Documentos e Storage | `documentos` completa; upload de autos em PDF; extração de texto; envio de PDF à API como documento (limites de páginas e tamanho a confirmar) ou em trechos; bucket por prefixo de escritório; antivírus não previsto (a confirmar necessidade) | Nenhuma | Biblioteca de extração de texto | Autos de 300 páginas carregados e lidos por um agente |
| E3 Peças | `minutas`, `minuta_etapas` (6 etapas do Modo C de `tjmt-peticoes`, aprovação por etapa), varredura-de-oportunidades (relatório de pontos + peça sobre os aprovados, Passo 0 pergunta o polo), redação final como versão em Markdown e `.docx` sobre `modelos_peca` com timbre; entra em `aprovacoes` (`minuta`); vínculo com prazo e tarefa `redigir` | E1, E2, modelos | Opus 5.5 na redação; `max_tokens`; custo por peça | 5 peças reais conduzidas pelas etapas e aprovadas; custo por peça medido |
| E4 Revisor de peças | `minuta_revisoes` com o checklist formal da skill `analise-e-conferencia-de-peticao` (OK / Atenção / Crítico), roda ao gerar versão e sob demanda para peça colada ou .docx enviado pela advogada | E2 (peça colada) ou E3 | Bloquear aprovação com item Crítico aberto? (recomendado: sim, com justificativa) | 10 peças revisadas; a advogada concorda com ao menos 80% dos itens Crítico |
| E5 Jurisprudência | Ingestão de dados abertos do STJ e base do TJ-MT (fonte a confirmar) em `ref.jurisprudencia` + chunks; busca híbrida (vetor + `tsvector`); ferramenta `buscar_jurisprudencia` devolve id, trecho e link; agentes só citam o que a ferramenta devolveu; Batch API para resumos em massa; `jurisprudencia_anotacoes` | E0 (embeddings), E1 | Volume inicial; frequência de atualização; custo de embedding | 50 consultas do teste cego com precisão aprovada; 0 citação sem id na fixture |
| E6 Cálculos | `ref.indices_economicos` (IPCA-E, INPC, SELIC, TR; fontes BCB/IBGE a confirmar); motor determinístico em `src/lib/calculos` (correção, juros, verbas) 100% testado; `calculos` + itens; memória em PDF | Nenhuma | Biblioteca de PDF; regras de juros por tipo de dívida (insumo jurídico) | 10 cálculos reais batem com a planilha da advogada |
| E7 Extensão do PJe | Se o spike aprovar: extensão MV3 em repositório separado, só leitura e download com a sessão aberta do navegador; lista expedientes do painel do advogado e lança `publicacoes` (`pje_extensao`) e `expedientes_pje`; baixa autos em PDF para `documentos`; autenticação por token de dispositivo (`extensao_dispositivos`); certificado e senha nunca saem da máquina; protocolo continua manual | E2, spike em E0 | Go/no-go; termos de uso do PJe (a confirmar); repositório separado | 10 dias úteis em que 100% dos expedientes do PJe apareceram no sistema sem lançamento manual |
| E8 Google Agenda e Drive | OAuth por usuário (`access_type=offline`, `prompt=consent`), refresh token no Vault (`usuario_oauth_tokens`), escopos `calendar.events` e `drive.file`; prazos e audiências viram eventos; exportação diária e `.docx` aprovados vão para a pasta do escritório; `audiencias` + tela | E0 (app verificado e publicado), E3 para os `.docx` | Agenda por usuário ou agenda do escritório compartilhada | Prazo confirmado aparece na agenda em até 5 min; refresh token sobrevive a 30 dias |
| E9 Julgador e outros tribunais | Agentes `tjmt-skill-cl` (mapa + minuta de decisão, só leitura) e `analise-processual-todos-tribunais` (camada local + varredura; sem motor de prazos para outros TJs, só análise) | E1, E2 | Prioridade baixa; medir uso | 3 casos reais cada |
| E10 Avaliação e custo | Avaliação por agente com rubrica (`tests/avaliacao/<agente>/`), roda a cada mudança de prompt ou modelo; `cache_read_input_tokens` monitorado; teto por escritório com corte; relatório mensal de custo por agente | E1 em diante | Metas por agente | Toda mudança de prompt passa pela avaliação antes de ir a prod |

Spike da extensão do PJe (3 dias, dentro da E0):

- Dia 1: como cada advogado entra no PJe do TJ-MT (certificado A1/A3 via PJe Office, senha, gov.br); o que a sessão do navegador expõe (painel do advogado, expedientes, download de autos); leitura dos termos de uso e das normas do TJ-MT sobre automação (a confirmar). Saída: `docs/fase2/spike-pje-dia1.md`.
- Dia 2: protótipo MV3 que, com a sessão aberta, lista os expedientes pendentes e os envia a uma rota `POST /api/extensao/expedientes` autenticada por token de dispositivo. Saída: lista de expedientes reais em dev.
- Dia 3: download de autos em PDF para `documentos`; medir estabilidade (mudança de layout do PJe quebra o seletor?). Saída: ADR 0008 go/no-go com manutenção estimada por mês.

Critério de passagem da Fase 2: piloto com 1 ou 2 escritórios parceiros (ver "Inconsistências" sobre contrato e papel de operador antes do piloto).

## 2.7 Fase 3: Produto

| Entrega | O que muda | Pré-requisitos |
|---|---|---|
| P1 Multi-escritório real | N vínculos por usuário (`trocar_escritorio` + refresh do token); onboarding self-service em 3 passos (escritório, equipe, carteira por CSV e DJEN); papel `suporte` da Cerrado Hub com acesso temporário, motivo e auditoria; `planos`, `assinaturas`, `escritorio_limites` (usuários, processos, teto de IA); teste automatizado de isolamento com N tenants e Storage por prefixo; `ref` alimentado por ingestão central (feriados de outros tribunais entram aqui); domínio e marca | Contrato Cerrado Hub (dono do código, dados, marca); DPA modelo |
| P2 Atendimento ao cliente | Canal WhatsApp para clientes com intents fechados (andamento em linguagem simples, próxima audiência, documentos pendentes, falar com o advogado); identificação como sistema do escritório; nenhuma promessa de resultado nem captação (Provimento 205/2021); opt-in LGPD; horário e escalonamento ao advogado; `clientes_contatos` verificados; `regras_atendimento` por escritório; número por escritório ou roteamento por número único (a confirmar) | P1, templates próprios aprovados |
| P3 Contratos e cobrança | Contratos (se ainda não feitos) + acompanhamento de parcelas e aditivos; tabela OAB por UF em `ref` | Fase 1 T1.37 ou E0 |
| P4 Relatórios | Produtividade por pessoa, prazos cumpridos e vencidos, tempo economizado (definição da Parte 1, 1.3.2), custo de IA por escritório e por agente, exportação; views materializadas por tenant; relatório mensal por e-mail | `metricas_diarias` (semana 9) |
| P5 LGPD como produto | Política de privacidade pública; DPA com cada escritório (escritório controlador, Cerrado Hub operador); `operacoes_tratamento` por escritório; direitos do titular em `lgpd_solicitacoes` (acesso, exclusão, portabilidade com exportação); retenção e descarte automatizados; logs por 5 anos; residência de dados documentada (a confirmar região); cláusulas-padrão da ANPD com a Anthropic e demais fornecedores | Documentos da semana 9 |
| P6 Operação de produto | Sentry (ou similar), página de status, SLA interno, rotina de suporte, backups testados por tenant, runbook de incidente, processo de atualização do calendário forense para todos os tribunais atendidos | P1 |

## 2.8 Verificação ponta a ponta por fase

Fase 0:

- Automatizado: Vitest em `cnj`, `djen/normalizar`, `datajud/normalizar` com respostas reais gravadas em `mocks/`; pgTAP `001_isolamento_tenants.sql`.
- Dados de teste: respostas reais do DJEN e DataJud gravadas como fixtures; seed sintético em dev.
- Conferência manual: teste de captação de 10 dias úteis (planilha do administrativo cruzada pelo script); rótulo do classificador pela advogada.
- Métricas: cobertura do DJEN (só DJEN / só PJe / ambos), latência de captação, acerto do classificador v0, custo por publicação.

Fase 1:

- Automatizado: Vitest (motor de prazos 100%, regras de notificação, horas úteis, intents, CNJ, hash de dedup); regressão do classificador e do roteador contra fixtures rotuladas (mock por padrão, real sob flag); pgTAP (isolamento, matriz de papéis, sigilo); Playwright (4 fluxos); CI bloqueia merge.
- Dados de teste: `seed.sql` com 2 escritórios, 6 usuários (um por papel mais dois sócios), 20 processos, 50 publicações, feriados 2026; `prazos-reais.json` (30 casos); `publicacoes-rotuladas.json` (cresce toda semana); `frases-whatsapp.json`.
- Conferência manual: validação diária dos prazos sugeridos pela advogada (semana 5 em diante); cruzamento semanal com o PJe (`divergencias_operacao`); ensaio dos runbooks (sistema fora do ar, desligamento, rotação de segredo, restauração).
- Métricas: `/admin/status` e `/admin/metricas`; acerto de data e tipo; percentual de publicações tratadas em 24h úteis; entrega de notificações; custo de IA; divergências por semana.

Fase 2:

- Automatizado: avaliação por agente (`tests/avaliacao/<agente>/casos.json` com rubrica), roda a cada mudança de prompt; testes do motor de cálculos (100%); testes de geração `.docx` (abre sem erro, marcadores todos substituídos); verificação de cache (`cache_read_input_tokens > 0`).
- Dados de teste: 5 a 10 casos reais por skill, autos anonimizados onde possível; 50 consultas de jurisprudência com resposta esperada.
- Conferência manual: a advogada pontua cada peça e revisão (rubrica de 1 a 5 por critério); comparação cega entre Sonnet 5.5 e Opus 5.5 nas 5 primeiras peças.
- Métricas: custo por peça, tempo de revisão humana, itens Crítico por versão, uso da extensão (expedientes captados sem lançamento manual).

Fase 3:

- Automatizado: isolamento com N tenants (pgTAP parametrizado), teste de carga leve nas rotas de jobs, testes dos fluxos de titular (solicitação → exportação → exclusão).
- Conferência manual: ensaio de incidente, ensaio de solicitação de titular ponta a ponta, auditoria de acesso de suporte.
- Métricas: por tenant (uso, custo, prazos), tempo de onboarding, tickets.

## 2.9 Critérios de aceite por módulo do MVP

| Módulo | Critério mensurável | Como medir |
|---|---|---|
| Captação DJEN | 100% das intimações a advogado publicadas no DJEN captadas até 9h do dia útil seguinte; 0 duplicatas sem marcação; captação rodou em 100% dos dias úteis | `scripts/teste-captacao-cruzar.ts` (Fase 0) e cruzamento semanal; `captacoes`; `/admin/status` |
| Fallback manual | 100% dos expedientes "só PJe" lançados no mesmo dia útil | Cruzamento semanal `divergencias_operacao` |
| Classificação | Tipo de ato correto em ao menos 95%; `gera_prazo` correto em ao menos 95%; publicação de baixa confiança sinalizada em 100% | Regressão contra `publicacoes-rotuladas.json`; view `ia_acerto` |
| Motor de prazos | 30 de 30 casos reais corretos; cobertura 100%; memória de contagem presente em 100% dos prazos; `calendario_incompleto` marcado em 100% dos casos sem feriados do ano ou comarca | Vitest com limiar; consulta em `prazos` |
| Confirmação de prazo | Data sugerida igual à confirmada em ao menos 95%; 0 confirmações por estagiário ou administrativo; 100% com `confirmado_por` e evento | `ia_acerto`; pgTAP `002_papeis.sql`; `prazos_eventos` |
| Tarefas | 100% das confirmações criam tarefa com responsável e vencimento = data interna; atrasada e crítica calculadas conforme o glossário; 100% das reatribuições com evento | Teste automatizado; `tarefa_eventos` |
| Notificações | D-1 entregue a 100% dos prazos confirmados até 8h; resumo às 7h30 (até 5 min de atraso) em 100% dos dias úteis; alerta de 24h úteis em 100% das publicações não tratadas | `notificacoes.status`, `agendada_para` vs `enviada` |
| Carteira e DataJud | 100% dos processos do CSV importados; ao menos 95% enriquecidos ou marcados indisponível/sigiloso; movimentação nova do DataJud refletida em até 24h após disponível na API | `processos.datajud_*`; `movimentacoes` |
| WhatsApp | 8 intents com ao menos 90% de acerto na fixture de 30 frases; 100% das escritas com confirmação; 0 texto de processo sigiloso enviado; resposta em até 10 s (a confirmar) | Fixture; `mensagens.intent`; `aprovacoes`; teste de sigilo |
| Multi-tenant e segurança | 0 linhas cruzadas entre tenants; MFA ativo em 100% de sócios e advogados; 0 segredos em coluna texto | pgTAP; relatório do Auth; consulta ao schema |
| Operação | Falha de captação alertada em até 1h após 9h; exportação CSV em 100% dos dias úteis; custo de IA dentro do teto; restauração ensaiada | `jobs_execucoes`; `exportacoes`; `metricas_diarias` |
| Contratos (se feito) | 3 documentos coerentes entre si gerados do mesmo formulário; cálculo recusado quando a tabela passar de 12 meses | Teste de geração; 1 contrato real aprovado |

## 2.10 Primeira sessão de trabalho

Roteiro literal da T0.1 (1 sessão de 2 a 3 horas). Comandos na raiz `/home/user/sistema-para-adv`.

1. Ferramentas (uma vez): Node LTS (versão suportada pela Vercel, a confirmar), `corepack enable` (pnpm), Docker em execução, `npm i -g supabase vercel`, `gh auth status`.
2. App: `pnpm dlx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --use-pnpm`; depois `pnpm dlx shadcn@latest init`; `pnpm add @supabase/supabase-js @supabase/ssr zod @anthropic-ai/sdk`; `pnpm add -D vitest @vitest/coverage-v8 @playwright/test`.
3. Arquivos iniciais: `.env.example` (todas as variáveis de 2.2), `.env.local` (no `.gitignore`), `src/lib/config/env.ts` (Zod), `src/lib/supabase/client.ts`, `server.ts`, `admin.ts`, `src/app/api/health/route.ts`, `CLAUDE.md`, `docs/` com os esqueletos de 2.2, `vitest.config.ts` (limiar 100% em `src/lib/prazos/**`), `vercel.json` (`{"crons": []}`), scripts no `package.json`: `dev`, `build`, `lint`, `typecheck` (`tsc --noEmit`), `test`, `test:e2e`, `db:reset`, `db:types`.
4. Supabase local: `supabase init`; em `supabase/config.toml` expor `schemas = ["public", "ref"]`; `supabase start`; `supabase migration new extensoes_e_schemas` (migration 1); `supabase migration new ref_tribunais_comarcas_feriados` (migration 2); `supabase db reset`; `supabase gen types typescript --local > src/lib/supabase/database.types.ts`.
5. Supabase nuvem: criar projetos `dev` e `prod` (região sa-east-1, São Paulo); `supabase login`; `supabase link --project-ref <ref-dev>`; `supabase db push`; repetir o `push` para `prod` pelo workflow `deploy-db.yml` (ou manualmente só nesta primeira vez). Configurar SMTP da Resend no Auth dos dois projetos.
6. CI: `.github/workflows/ci.yml` (checkout, pnpm, `lint`, `typecheck`, `test`, `supabase start` com a action da CLI, `supabase db reset`, `supabase test db`, `build`); `deploy-db.yml` com `workflow_dispatch` e environment `prod` protegido; segredos `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, `SUPABASE_PROJECT_REF_PROD` no GitHub.
7. Vercel: `vercel login`; `vercel link`; conectar o repositório no painel; variáveis de ambiente por ambiente (preview → dev; production → prod); `main` como branch de produção; primeiro deploy pelo push.
8. Git: `git add -A`; `git commit -m "chore: estrutura inicial do app, Supabase e CI"`; `git push -u origin main` (primeiro push define a branch padrão); a partir daí, trabalho em branches e PR para `main`. Proteger `main` exigindo CI verde.
9. Pronto quando: `https://<app>.vercel.app/api/health` responde 200 com `{"db":"ok"}`; CI verde no primeiro PR; `supabase test db` passa localmente; `ref.tribunais` tem a linha do TJMT em dev e prod.

## Inconsistências que o arquiteto apontou na Parte 1 e como ficaram

Todas as nove já foram incorporadas ao texto da Parte 1 (seções 1.2, 1.3.2, 1.3.3, 1.3.7, 1.4, 1.5 e 1.6). Ficam registradas aqui como memória da decisão.

1. Teste de captação não cabe na semana 2. A Parte 1 (1.3.3 e 1.5) fixa 10 dias úteis de registro na "Fase 0, semana 2", mas a Fase 0 tem 2 semanas e o documento original falava em "uma semana". Resolução adotada: o teste começa no primeiro dia útil da semana 2 e fecha no fim da semana 3; a Fase 1 começa na semana 3 em paralelo (motor de prazos e cadastros não dependem do resultado); o fallback (ADR 0006) é decidido no fim da semana 3 e implementado na semana 4 (T1.9).
2. Critério de 100% do teste de captação. A versão anterior da Parte 1 tratava intimações "pelo sistema" como fonte paralela; a verificação de fatos mostrou que desde 16/05/2025 o DJEN é o meio oficial de contagem para advogados (Parte 1, 1.3.3), e a Parte 1 foi corrigida. O critério fica em duas partes: 100% do que saiu no DJEN foi captado; 100% do "só PJe" explicado (cadastro errado do advogado, intimação pessoal ou erro de captação) e coberto pelo fallback.
3. Operação paralela e recesso forense. A semana 10 (30/12 a 05/01) e as 4 semanas de operação paralela da decisão 1.4.5 caem no recesso (20/12 a 20/01), quando quase não há publicação nem prazo correndo. Quatro semanas "estáveis" nesse período não provam nada. Resolução adotada: contar as 4 semanas a partir de 21/01/2027; a Fase 2 começa realisticamente no fim de fevereiro de 2027; as semanas 11 a 14 absorvem a E0.
4. Piloto com escritórios parceiros antes do contrato com a Cerrado Hub. O critério de passagem da Fase 2 (figura 2 do documento original) é "piloto com 1 ou 2 escritórios parceiros", mas a Parte 1 coloca o contrato com a Cerrado Hub, os papéis LGPD (operador) e o contrato de tratamento com cada escritório "antes da Fase 3" (1.3.7 e 1.5). Um piloto externo já exige isso. Resolução: antecipar contrato e DPA modelo para antes do piloto (fim da Fase 2) ou tratar o piloto como primeira entrega da Fase 3.
5. `documentos` na Fase 2, contratos no fim da Fase 1. A seção 1.3.2 lista `documentos` (Storage) como tabela da Fase 2, mas a decisão 1.4.6 traz contratos e honorários para o fim da Fase 1, e eles geram `.docx` que precisam do Storage. Resolução adotada: `documentos` mínima entra na migration 13 junto com contratos.
6. Juizados Especiais fora do escopo, mas consumidor dentro. A premissa "só TJ-MT (cível, família, consumidor, servidores); sem Juizados" e a regra do motor ("dias úteis, CPC 219") não tratam processos do escritório nos Juizados Especiais do próprio TJ-MT (mesmo código 8.11), comuns em consumidor, onde a contagem em dias úteis é controversa (Enunciado 165 do FONAJE, a confirmar a prática do TJ-MT). Resolução sugerida: `processos.competencia` (vara comum, juizado, outra) deduzida do órgão julgador do DataJud; para juizado, o motor não sugere data e exige contagem manual até a regra ser confirmada e testada; verificar na carteira importada quantos processos são de juizado antes da semana 5.
7. Crons "em horário local". A seção 1.2 pede crons em horário local; a Vercel agenda em UTC (a confirmar). Como America/Cuiaba não tem horário de verão, a conversão é fixa (UTC-4) e os crons são escritos em UTC. Não é erro, mas o texto deve dizer isso para evitar que alguém "corrija" os horários.
8. Insumo do WhatsApp na semana 5. A tabela 1.5 pede conta Meta e número para "Fase 1, semana 5", mas a ordem de construção fixada coloca o WhatsApp na semana 8. Antecipar não prejudica; só ajustar a tabela para "até a semana 7".
9. Sinal de republicação no DJEN. Resolvido: os campos `status`, `ativo`, `motivo_cancelamento` e `data_cancelamento` foram verificados no Swagger oficial (Parte 1, Apêndice A.1); a T1.10 usa esses campos e mantém a heurística como segunda rede.

### Arquivos críticos da implementação

- /home/user/sistema-para-adv/supabase/migrations/<timestamp>_extensoes_e_schemas.sql (padrão de RLS, funções `app.*`, base de tudo)
- /home/user/sistema-para-adv/src/lib/prazos/contagem.ts (motor de prazos puro, 100% testado; o coração do MVP)
- /home/user/sistema-para-adv/docs/regras/prazos.md (regra de contagem escrita e aprovada antes de qualquer tela)
- /home/user/sistema-para-adv/src/server/jobs/captar-djen.ts (captação, dedup e registro de rodada; alimenta o pipeline inteiro)
- /home/user/sistema-para-adv/src/lib/ia/classificador-publicacao.ts (única chamada de IA do MVP com saída estruturada e registro de custo)

---

# Apêndice A. Fatos verificados e fontes

Pesquisa de 28/10/2026. "Verificado" = texto oficial lido ou várias fontes independentes concordam; "parcial" = só fonte secundária ou trecho incompleto. Os sites oficiais do CNJ, TJ-MT e Planalto estavam bloqueados pela rede desta sessão; o texto deles veio de cópias indexadas, cópias do Swagger em repositórios públicos e notícias dos próprios tribunais. Conferir na fonte oficial antes de codar o motor de prazos.

## A.1 DJEN / Comunica PJe

| Fato | Status | Fonte |
|---|---|---|
| Endpoint `GET /api/v1/comunicacao`, parâmetros `numeroOab`, `ufOab`, `nomeAdvogado`, `nomeParte`, `numeroProcesso`, `texto`, `siglaTribunal`, `dataDisponibilizacaoInicio/Fim` (yyyy-mm-dd), `meio` (D/E), `pagina`, `itensPorPagina` (5 ou 100), `orgaoId`, `numeroComunicacao`; pelo menos um filtro obrigatório | Verificado (cópias do Swagger v1.0.4) | https://github.com/thiagoscheidt/intellexia/blob/8e212bfa2fd1830aa6981d180104d7e522dd2985/docs/comunica_pje_djen_openapi.yaml ; https://github.com/franklinbaldo/causaganha/blob/36013b460df31c800bdd3edaec6fac47d2c7fa9d/openapi/pje-comunicaapi-djen.swagger.yml ; oficial: https://comunicaapi.pje.jus.br/swagger/index.html |
| Consulta pública sem chave; limite por IP com cabeçalhos `x-ratelimit-*`; 429 → esperar 1 min; vários IPs = uso abusivo; teto de 10.000 resultados | Verificado (Swagger) | idem |
| Limite medido: ~20 requisições por janela | Parcial | https://github.com/leorochasf/garimpo-mcp/blob/cc956b49363eae9d03200ae66eb38dd68c997863/docs/fontes.md |
| Relato (09/2026) de que a API aceita até 1000 itens por página; Swagger continua em 5 ou 100 | Parcial | https://github.com/rvsanches/skills-datajud-djen/issues/1 |
| Campos do item (id, hash, data_disponibilizacao, siglaTribunal, tipoComunicacao, tipoDocumento, nomeOrgao, texto HTML, numero_processo, numeroprocessocommascara, meio, link, nomeClasse, codigoClasse, numeroComunicacao, ativo, status, motivo_cancelamento, data_cancelamento, destinatarios[], destinatarioadvogados[]); não há campo de data de publicação | Verificado (clientes independentes + resposta real) | https://github.com/NPSaulo/ferramentas-adv-pje/blob/4f9f90a63f6cb33257cc2443c50d7ef9e9f5646e/comunica-pje/comunica_pje.py ; https://github.com/peixoto-ops/dje_cli/blob/8efb2e13ab58ea99ffd2a664982dc5804df4cfdd/docs/api/orienta_documenta_api.md |
| Endpoints `GET /api/v1/comunicacao/{hash}/certidao` (PDF), `GET /api/v1/comunicacao/tribunal`, `GET /api/v1/caderno/{sigla}/{data}/{meio}` (zip, a partir das 3h) | Verificado (Swagger) | cópias do Swagger acima |
| TJ-MT publica no DJEN desde 21/06/2022 (Res. TJMT/OE 05/2022) | Verificado | https://www.tjmt.jus.br/noticias/2022/6/judiciario-mt-adota-diario-justica-nacional-a-partir-desta-terca-21 |
| Desde 16/05/2025 prazos contados pelo DJEN ou Domicílio (Res. CNJ 455/2022 com a 569/2024); TJ-MT confirmou | Verificado | https://www.tjmt.jus.br/noticias/2025/5/prazos-processuais-estao-sendo-contados-pelo-djen-e-domicilio-judicial-desde-o-dia-16-maio ; https://atos.cnj.jus.br/atos/detalhar/4509 |
| Art. 11, §3º da Res. 455: intimação concomitante por outro meio tem "valor meramente informacional" | Verificado | https://atos.cnj.jus.br/atos/detalhar/5691 ; https://www.cnj.jus.br/nova-resolucao-do-cnj-altera-prazos-e-regras-do-domicilio-judicial-eletronico/ |
| Domicílio Judicial Eletrônico: citação e intimação pessoal; obrigatório para entes públicos e empresas; advogado não é intimado por ele; PJ privada: 3 dias úteis para confirmar; prazo corre do 5º dia útil após confirmação | Verificado | https://www.migalhas.com.br/quentes/414786/cnj-altera-regras-do-domicilio-judicial-e-exclui-intimacao-de-advogado |
| STJ Tema 1.180 (dupla intimação portal × diário): julgamento iniciado em 20/08/2025, pedido de vista; sem tese até 27/09/2026 | Parcial | https://conjur.com.br/2025-ago-25/stj-avalia-inicio-do-prazo-recursal-em-caso-de-dupla-intimacao-eletronica/ ; https://tesesesumulas.com.br/tese/stj/1180 |

## A.2 DataJud

| Fato | Status | Fonte |
|---|---|---|
| `POST https://api-publica.datajud.cnj.jus.br/api_publica_tjmt/_search`, header `Authorization: APIKey <chave>`; chave na wiki, pode mudar a qualquer momento | Verificado | https://datajud-wiki.cnj.jus.br/api-publica/acesso/ ; https://www.cnj.jus.br/wp-content/uploads/2023/05/tutorial-api-publica-datajud-beta.pdf |
| Consulta Elasticsearch por `numeroProcesso` (20 dígitos); `size` 10 a 10.000; `search_after` | Verificado | https://datajud-wiki.cnj.jus.br/api-publica/exemplos/exemplo3/ |
| Campos: classe, assuntos, sistema, formato, grau, dataAjuizamento, dataHoraUltimaAtualizacao, nivelSigilo, orgaoJulgador (codigoMunicipioIBGE), movimentos | Parcial (respostas reais publicadas) | https://github.com/jespimentel/api_cnj |
| Termos de uso v1.1: 120 requisições/min; não coletar dados pessoais de terceiros; dar ciência ao CNJ de publicações | Verificado | https://formularios.cnj.jus.br/wp-content/uploads/2023/05/Termos-de-uso-api-publica-V1.1.pdf |
| Portaria CNJ 374/2026 (14/08/2026): envio diário ao DataJud, 180 dias de adaptação | Verificado | https://atos.cnj.jus.br/atos/detalhar/6972 |
| Sigilosos resguardados (fora da base pública) | Parcial | https://datajud-wiki.cnj.jus.br/api-publica/ |

## A.3 Contagem de prazos (textos legais)

| Fato | Status | Fonte canônica |
|---|---|---|
| Lei 11.419/2006, art. 4º §3º (publicação = 1º dia útil seguinte à disponibilização) e §4º (prazo inicia no 1º dia útil seguinte à publicação) | Verificado | https://www.planalto.gov.br/ccivil_03/_ato2004-2006/2006/lei/l11419.htm |
| CPC 219 (dias úteis), 220 (20/12 a 20/01), 224 caput e §§1º a 3º, 229 §2º (sem dobro em autos eletrônicos), 231 V, VII e IX, 180/183/186 (dobro MP, Fazenda, Defensoria), 1.003 §§5º e 6º (Lei 14.939/2024), 1.023 | Verificado | https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2015/lei/l13105.htm |
| Lei 11.419 art. 5º §3º: consulta em 10 dias corridos; intimação tácita no fim (hoje relevante só para intimação pessoal) | Verificado | idem Lei 11.419 |
| CPC 246 (Lei 14.195/2021): citação eletrônica preferencial, confirmação em 3 dias úteis, multa até 5% | Verificado | https://www.tjrj.jus.br/documents/10136/267774841/Dica-da-Semana-Alteracoes-na-Citacao-Eletronica-v1.0.pdf |

## A.4 Calendário forense e PJe do TJ-MT

| Fato | Status | Fonte |
|---|---|---|
| Portaria TJMT/PRES 1915/2025 (Calendário 2026): feriados e pontos facultativos suspendem expediente e prazos; municipal só na comarca; datas podem mudar | Verificado | https://www.tjmt.jus.br/paginas/transparencia-e-prestacao-contas?url=%2FInstitucional%2FC%2F82478 |
| Alterações em 2026: portarias 245, 509, 752, 901; ponto facultativo 28/10 → 30/10 | Parcial | buscador (trechos cortados) |
| 20 de novembro feriado nacional desde 2024 (Lei 14.759/2023) | Verificado | https://www2.camara.leg.br/legin/fed/lei/2023/lei-14759-21-dezembro-2023-795091-publicacaooriginal-170522-pl.html |
| Incidente de segurança no PJe-MT em 21/09/2026: prazos suspensos de 21 a 25/09 | Parcial | https://www.pontonacurva.com.br/justica-estadual/tjmt-prorroga-suspensao-de-prazos-apos-incidente-de-seguranca-nos-sistemas/35102 |
| Acesso ao PJe-MT: certificado (PJeOffice), CPF/senha ou gov.br ouro com 2FA (Portaria CNJ 140/2024) | Parcial | https://www.tjmt.jus.br/pagina/acesso-ao-pje ; https://atos.cnj.jus.br/atos/detalhar/5536 |
| Res. CNJ 185/2013 art. 29: bloqueio de usuários que reduzam disponibilidade; TRT-4/TRT-6 bloqueiam robôs (>1.500 processos de terceiros em 30 dias) | Parcial | https://www.trt6.jus.br/portal/noticias/2026/03/20/trt-6-bloqueara-usuariosas-do-pje-jt-que-realizem-consultas-excessivas-processos |
| Consulta processual pública do TJ-MT por número, CPF/CNPJ, nome e OAB | Parcial | https://www.tjmt.jus.br/noticias/2022/11/tribunal-justica-lanca-nova-ferramenta-consulta-processual |
| Portal de Serviços Judiciários desde 04/05/2026 (substituiu o ClickJud) | Verificado | https://www.tjmt.jus.br/noticias/2026/5/novo-portal-servicos-judiciarios-tjmt-ja-esta-disponivel-para-advogados |

## A.5 WhatsApp Business Platform

| Fato | Status | Fonte |
|---|---|---|
| Cobrança por mensagem desde 01/07/2025; três categorias de template (marketing, utility, authentication) + serviço | Verificado | https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing |
| Desde 01/10/2026 mensagens de serviço cobradas após 1.000 grátis por número/mês; utility dentro da janela voltou a ser cobrado | Verificado (doc atualizada em 30/09/2026) | https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing/non-template-messages |
| Preços BRL: utility/auth ~R$ 0,035; marketing ~R$ 0,32 | Parcial | https://wizebot.com.br/custo-por-mensagens ; https://www.crminer.com.br/en/blog/whatsapp-business-api-cobranca-outubro-2026 |
| Faturamento em BRL desde 16/07/2026; migração de USD até 30/06/2027 | Verificado | página de pricing acima |
| Janela de 24 h; fora dela só template aprovado; reclassificação sem aviso | Verificado | https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/overview ; .../templates/template-categorization |
| Limite de envio por portfolio: 250 → 2.000 com verificação da empresa → automático | Verificado | https://developers.facebook.com/documentation/business-messaging/whatsapp/messaging-limits |
| Número em uso no app precisa ser apagado (perde histórico); PIN de duas etapas obrigatório | Verificado | https://developers.facebook.com/documentation/business-messaging/whatsapp/business-phone-numbers/registration |
| Webhook: verificação por `hub.verify_token`; `X-Hub-Signature-256`; reenvio por até 7 dias; payload até 3 MB | Verificado | https://developers.facebook.com/docs/whatsapp/cloud-api/guides/set-up-webhooks/ ; https://developers.facebook.com/documentation/business-messaging/messenger-platform/webhooks |
| Opt-in obrigatório; proibido pedir documento, cartão ou conta pelo chat; restrições a saúde; caminho para humano obrigatório; "AI providers" genéricos vedados desde 15/01/2026 | Verificado | https://developers.facebook.com/documentation/business-messaging/whatsapp/getting-opt-in ; https://business.whatsapp.com/policy ; https://www.whatsapp.com/legal/business-solution-terms |
| Clientes não oficiais e automação de número comum são conduta abusiva (banimento) | Verificado | https://www.whatsapp.com/legal/terms-of-service ; https://www.whatsapp.com/legal/messaging-guidelines |
| Cloud API direto como "direct developer" com token de usuário de sistema | Verificado | https://developers.facebook.com/documentation/business-messaging/whatsapp/access-tokens/ |
| Fase 3 exige Tech Provider (App Review + Embedded Signup) | Verificado | https://developers.facebook.com/documentation/business-messaging/whatsapp/solution-providers/get-started-for-tech-providers |
| Twilio: US$ 0,005/mensagem além da Meta; 360dialog: licença mensal por número | Parcial | https://support.twilio.com/hc/en-us/articles/53100480177819-Notice-Changes-to-WhatsApp-s-Pricing-October-2026 ; https://docs.360dialog.com/docs/360dialog/prices-plans-and-payment-options |

## A.6 Supabase, Vercel e Google

| Fato | Status | Fonte |
|---|---|---|
| Edge Functions: 150 s (Free) / 400 s (pagos), 2 s CPU, 256 MB, 504 após 150 s ociosa | Verificado | https://supabase.com/docs/guides/functions/limits |
| pg_cron + pg_net: assíncrono; timeout padrão diverge (2 s na doc, 5 s no README; teto 600 s) | Parcial | https://supabase.com/docs/guides/database/extensions/pg_net ; https://github.com/supabase/pg_net |
| Free: 2 projetos, 500 MB, pausa após 7 dias, sem backup; Pro US$ 25 com backup diário de 7 dias | Verificado | https://supabase.com/pricing ; https://supabase.com/docs/guides/platform/free-project-pausing |
| Região sa-east-1 (São Paulo) disponível | Verificado | https://supabase.com/docs/guides/platform/regions |
| MFA TOTP estável; exigência via policy restritiva com `aal2` | Verificado | https://supabase.com/docs/guides/auth/auth-mfa |
| RBAC oficial via Custom Access Token Hook; nunca usar `user_metadata` em RLS; JWT pode ficar defasado até o refresh | Verificado | https://supabase.com/docs/guides/database/postgres/custom-claims-and-role-based-access-control-rbac |
| pgvector: HNSW/IVFFlat indexam até 2.000 dimensões em `vector`, 4.000 em `halfvec` | Verificado | https://supabase.com/docs/guides/ai/vector-indexes ; https://github.com/pgvector/pgvector |
| Anthropic não tem embeddings; indica Voyage (voyage-4: 1024 por padrão; voyage-law-2: 1024); gte-small do Supabase é 384 dims, inglês, 512 tokens | Verificado | https://platform.claude.com/docs/en/build-with-claude/embeddings ; https://supabase.com/docs/guides/functions/ai-models |
| Vercel Cron: 100 por projeto; Hobby 1×/dia (±59 min); Pro 1×/min; funções 300 s padrão, 800 s no Pro | Verificado | https://vercel.com/docs/cron-jobs/usage-and-pricing ; https://vercel.com/docs/functions/limitations |
| Vercel Pro US$ 20/assento + US$ 20 de crédito; Hobby vedado para uso comercial; região gru1 | Verificado | https://vercel.com/docs/plans/pro-plan ; https://vercel.com/docs/limits/fair-use-guidelines ; https://vercel.com/docs/functions/configuring-functions/region |
| Google OAuth: testing expira refresh token em 7 dias; publicado sem verificação tem teto vitalício de 100 usuários; Internal (Workspace) dispensa | Verificado | https://support.google.com/cloud/answer/15549945 ; https://developers.google.com/identity/protocols/oauth2/production-readiness/overview |
| Calendar: escopos sensíveis, ~10 dias úteis; Drive `drive`/`drive.readonly` restritos (6+ semanas + CASA anual); `drive.file` não sensível | Verificado | https://developers.google.com/workspace/drive/api/guides/api-specific-auth ; https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification |

## A.7 Claude API e dados

| Fato | Status | Fonte |
|---|---|---|
| Termos Comerciais (17/06/2025): não treina com conteúdo do cliente | Verificado | https://www.anthropic.com/legal/commercial-terms |
| Retenção padrão ≤ 30 dias; ZDR negociado por organização; Fable/Mythos exigem 30 dias; Batch 29 dias; Files até apagar | Verificado | https://platform.claude.com/docs/en/manage-claude/api-and-data-retention |
| Dados armazenados só nos EUA; inferência global por padrão; opção `us` a 1,1x (Claude 4.6+) | Verificado | https://platform.claude.com/docs/en/manage-claude/data-residency |
| DPA (24/02/2025) com SCCs UE/UK/Suíça, sem cláusulas da ANPD; incidente em 48 h; SOC 2 sob pedido | Verificado | https://www.anthropic.com/legal/data-processing-addendum |
| SOC 2 I/II, ISO 27001:2022, ISO/IEC 42001:2023, HIPAA configurável | Parcial | https://support.claude.com/en/articles/10015870 |
| Política de Uso (nova em 12/11/2026): aconselhamento jurídico individual é alto risco (revisão humana + aviso de IA); chatbot público deve se identificar | Verificado | https://www.anthropic.com/legal/aup ; https://www.anthropic.com/news/2026-usage-policy-update |
| Preços: Haiku 5.5 0,10/0,50; Sonnet 5.5 2/10; Opus 5.5 4/20; Fable 5.1 10/50; contexto 1M; saída 128k; tokenizador +30% desde 4.7 | Verificado | https://platform.claude.com/docs/en/about-claude/pricing ; https://platform.claude.com/docs/en/models/overview |
| Prompt caching (1,25x/2x escrita; 0,05x leitura em Opus/Sonnet 5.5; mínimo 512 tokens); Batch 50%; Files API GA (visível ao workspace inteiro; até 100 workspaces); structured outputs GA; tool use +286 tokens | Verificado | https://platform.claude.com/docs/en/build-with-claude/prompt-caching ; .../batch-processing ; .../files ; .../structured-outputs |

## A.8 LGPD, ANPD, OAB e CNJ

| Fato | Status | Fonte |
|---|---|---|
| Res. CD/ANPD 19/2024: transferência internacional e cláusulas-padrão; prazo de adequação terminou em 23/08/2025 | Parcial (gov.br bloqueado) | https://lefosse.com/noticias/transferencia-internacional-de-dados-prazo-para-adocao-das-clausulas-padrao-da-anpd-se-encerra-em-23-de-agosto/ |
| Res. CD/ANPD 32/2026: adequação mútua com a UE (não cobre EUA) | Verificado | https://www.trenchrossi.com/en/legal-alerts/brazil-and-the-european-union-mutually-recognize-adequacy-in-personal-data-protection-resolution-no-32-dated-january-26-2026/ |
| Res. CD/ANPD 2/2022: pequeno porte; art. 3º exclui alto risco; art. 4º (tecnologia emergente + dados sensíveis) | Parcial | https://www.gov.br/anpd/pt-br/acesso-a-informacao/institucional/atos-normativos/regulamentacoes_anpd/resolucao-cd-anpd-no-2-de-27-de-janeiro-de-2022 |
| LGPD art. 7º VI, art. 11 II "d", art. 33, art. 37, art. 46 | Verificado | https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709compilado.htm |
| Recomendação CFOAB 001/2024 (DEOAB 14/11/2024): fornecedor sem treino, LGPD, comunicação escrita ao cliente com consentimento, revisão humana | Verificado | https://diario.oab.org.br/pages/materia/842347 ; https://www.oab.org.br/noticia/62711/confira-versao-final-da-recomendacao-do-cfoab-sobre-o-uso-de-ia-na-pratica-juridica |
| Provimento 205/2021 em vigor; GT de revisão (Portaria 806/2025) sem texto novo; Plano Nacional de IA (2026) sem força normativa | Parcial | https://www.oabmt.org.br/Admin2/Arquivos/Documentos/202107/PDF49698.pdf ; https://www.oab.org.br/noticia/64268/conselho-federal-da-oab-anuncia-plano-nacional-para-integrar-inteligencia-artificial-a-advocacia |
| Código de Ética (Res. 02/2015) arts. 35 a 38 (sigilo) | Parcial | https://www.oab.org.br/leisnormas/legislacao/resolucoes/02-2015 |
| Res. CNJ 615/2025 substituiu a 332/2020; só Judiciário | Parcial | https://atos.cnj.jus.br/atos/detalhar/6001 |
| Portaria CNJ 374/2026: dados do DataJud "exclusivamente para fins legais, não comerciais"; veda venda e exploração comercial | Parcial | https://atos.cnj.jus.br/files/original144713202608196a85c1f168ce3.pdf |
| CPC art. 189: segredo de justiça em família e intimidade | Parcial | https://www.projuris.com.br/novo-cpc/art-188-a-192-do-novo-cpc/ |
| PL 2338/2023 (marco legal da IA) ainda não é lei | Parcial | https://monitor.lcfconsulting.com.br/proposicoes/pl-2338-2023/ |
