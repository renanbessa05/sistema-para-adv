# Minutas e varredura: regras que o código implementa

Fonte: skills `tjmt-peticoes` (Modo C em seis etapas; Passos 3 a 8 de forma) e `varredura-de-oportunidades` (Parte I e Parte II). Código: `src/lib/ia/prompts/{peticao,varredura}.v1.ts`, `src/lib/ia/schemas/minutas.ts`, `src/lib/pecas/{intake,validar}.ts` (puros), `src/server/{minutas,varreduras}.ts`, migration 0031.

## Estados da minuta

`rascunho` → `em_etapas` (Modo C; `etapa_atual` 1..6) → `redigida` (existe `versao_atual_id`) → `aguardando_aprovacao` → `aprovada` → `protocolada`. Desvios: `devolvida` (aprovação rejeitada; volta ao editor), `arquivada`, `cancelada`. Só as RPCs e o efeito de aprovação alcançam `aguardando_aprovacao`, `aprovada` e `protocolada` (policy restritiva).

## Seis etapas (Modo C)

| Etapa | Quem | O que o código garante |
|---|---|---|
| 1 Fatos, partes e lacunas | IA gera; advogado/sócio aprova, devolve com comentário ou pula | `minuta_aprovar_etapa` só na ordem; `minuta_devolver_etapa` exige comentário; `minuta_pular_etapas` registra as puladas com motivo |
| 2 Teses | idem | saída estruturada com requisitos, fatos, fragilidades, riscos e solidez |
| 3 Fatos × provas | idem | classificação fechada: documentado / prova frágil / a comprovar |
| 4 Advogado da parte contrária | idem | obriga "o que muda na peça" |
| 5 Estratégia | idem | pedidos em infinitivo e tipo; valor da causa com critério; competência |
| 6 Redação | IA no modelo forte (`IA_MODELO_PECAS_FORTE`) ou edição da advogada | vira `minuta_versoes` (Markdown + .docx com timbre) com `validacao` por código |

Cada geração recebe o intake (nove perguntas do Passo 2 pré-preenchidas pelo banco: partes, comarca, CNJ, documentos "Doc. NN", prazo, advogada), as referências da área e as etapas anteriores aprovadas; as etapas puladas entram como "PULADA" para o modelo saber o que não foi checado. Documentos do processo (PDF inteiro ou páginas extraídas) vão anexados (até 4).

Modos A (redação direta) e B (revisão de rascunho) começam na etapa 6.

## Validação determinística da peça (`validarPeca`)

Endereçamento (1º/2º grau e "ESTADO DE MATO GROSSO"); número CNJ válido e igual ao do processo vinculado; código 8.11; CPF/CNPJ; OAB/MT; e-mail; seções de fatos, direito e pedidos; pedidos numerados em infinitivo; honorários e custas (exceto MS); protesto por provas; valor da causa (inicial); três elementos do art. 300 quando há tutela; "Doc. NN" citado existe nos anexos; lacunas `[[VERIFICAR: …]]`; citações numeradas de jurisprudência só com id da base (`conferirCitacoes` no lote 7 alimenta `citacoesConfirmadas`); tempestividade pelo prazo vinculado; tamanho (até 15 laudas); índices de juros/correção não fixados pela peça.

`minuta_enviar_aprovacao` recusa versão com citação sem id e, com lacunas, exige comentário justificando. A aprovação `ajustada` cria nova versão (autor advogada) com o texto dos ajustes e aprova.

## Varredura dos autos

Passo 0 pelo formulário (polo, objetivo, prazo). A IA recebe os autos anexados ao processo e devolve a Parte I: mapa (linha do tempo com IDs, última peça pendente, teses × impugnação, fatos × prova), pontos por eixo A–F com ficha (fundamento, onde, resposta do adversário, solidez, prioridade, risco), ordem recomendada, descartados com motivo, lacunas e riscos de má-fé/preclusão. A advogada aprova os pontos (ponto `inviavel` não pode ser marcado); a Parte II nasce como minuta modo A com os pontos no intake. Sem marcação, entram os sólidos decisivos e relevantes.

## O que só a advogada decide

Aprovação de cada etapa, pontos da varredura, texto final, protocolo. Modelos `.docx` próprios (Configurações → Modelos) entram hoje como referência de estrutura em texto; a aplicação do timbre do `.docx` próprio fica pendente (os documentos gerados usam o timbre genérico de Configurações → Documentos).
