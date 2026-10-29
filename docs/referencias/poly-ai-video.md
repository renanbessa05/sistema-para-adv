# Referência de produto: vídeo da Poly.ai (29/10/2026)

Vídeo de divulgação de um concorrente (Poly.ai, ~80 s, formato Reels) que a dona do projeto trouxe como referência **de funcionalidades**, não de visual. Transcrição automática (Vosk, modelo pt-BR pequeno), corrigida à mão onde o reconhecimento errou.

## Transcrição

> Advogado, pensa em tudo que o seu escritório faz no dia a dia: ler publicação, controlar prazo, montar peça, responder cliente. Agora imagina ter alguém que faz boa parte disso.
>
> Essa é a Poly, uma plataforma de inteligência artificial feita só para escritórios de advocacia. Você usa pelo computador ou direto pelo WhatsApp, como se estivesse falando com uma assistente. Ela funciona como uma chefe de gabinete: você faz um pedido, ela entende e passa para quem sabe fazer. São mais de vinte e quatro funcionários de inteligência artificial, cada um especialista numa tarefa de escritório.
>
> Por exemplo: você pergunta "quais são meus prazos da semana?" e em segundos a Poly responde com a lista organizada e já criou uma tarefa para cada prazo, com responsável da sua equipe.
>
> Isso é só uma parte. A Poly acompanha seus processos pelo DataJud e pelo PJe, escreve peças com os modelos do seu escritório, pesquisa jurisprudência, faz cálculos e organiza o trabalho da equipe num painel conectado ao que você já usa: PJe, Google, Microsoft.
>
> Nada sai sem sua aprovação. A Poly cuida do operacional e você continua decidindo.

## Funcionalidades citadas × sistema (estado em 29/10/2026)

| # | O que o vídeo promete | No nosso sistema | Onde / fase |
|---|---|---|---|
| 1 | Ler publicação | Feito: captação DJEN + classificação por IA + caixa de publicações | Fase 1 |
| 2 | Controlar prazo | Feito: motor de prazos com memória de cálculo, confirmação humana, alertas D-3/D-1/D0 | Fase 1 |
| 3 | Usar pelo WhatsApp como assistente | Feito (templates pendentes na Meta): 10 intents, escrita com eco + "Confirma?" | Fase 1 |
| 4 | Usar pelo computador como assistente (chat no painel) | **Não existe.** Só telas; o roteador de intents só atende o WhatsApp | Proposta: trazer o chat para o painel reaproveitando o roteador |
| 5 | "Chefe de gabinete" que entende o pedido e passa ao especialista | Parcial: roteador fechado de intents. Orquestrador com agentes (tool use) | Fase 2, E1 |
| 6 | "Prazos da semana" → lista + tarefa para cada prazo com responsável | Feito: ao confirmar o prazo nasce a tarefa com responsável; intent `prazos_semana` lista | Fase 1 |
| 7 | Acompanhar processos pelo DataJud | Feito: enriquecimento diário | Fase 1 |
| 8 | Acompanhar pelo PJe | Não. Extensão de navegador só leitura, após spike de 3 dias | Fase 2, E7 |
| 9 | Escrever peças com os modelos do escritório | Não. Seis skills prontas; faltam os modelos .docx timbrados | Fase 2, E0 + E3 + E4 |
| 10 | Pesquisar jurisprudência | Não. Base, ingestão e busca híbrida | Fase 2, E5 |
| 11 | Fazer cálculos | Não. Índices + motor determinístico | Fase 2, E6 |
| 12 | Organizar o trabalho da equipe num painel | Feito: tarefas, kanban, Hoje, métricas | Fase 1 |
| 13 | Conectado a Google e Microsoft | Google Agenda e Drive na Fase 2 (E8); Microsoft fora do escopo | Fase 2 |
| 14 | Nada sai sem aprovação | Feito: fila de aprovações, confirmação de prazo, eco no WhatsApp | Fase 1 |
| 15 | Responder cliente | Não. Atendimento ao cliente | Fase 3 |
| 16 | "+24 funcionários de IA" | Mapa skills → agentes tem 8 | Fase 2 e 3 |

## Leitura

O que a Poly vende como experiência central ("fala com a assistente, ela resolve") o nosso sistema tem como motor, mas não como porta de entrada no painel. A diferença funcional mais barata de fechar é o item 4: chat no painel sobre o roteador que já existe. Os itens 9, 10 e 11 são a Fase 2 inteira e dependem de insumos do escritório (modelos timbrados) e de decisões (embeddings, fontes de índices).
