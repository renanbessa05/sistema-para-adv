# Fornecedores e transferência internacional

Fatos verificados em 28/10/2026 (fontes no escopo, Apêndice A). Rever antes de ir ao ar com dados reais.

| Fornecedor | Para quê | Onde processa | Instrumento | Pendência |
|---|---|---|---|---|
| Supabase | banco, auth, storage | São Paulo (sa-east-1) | Termos + DPA do Supabase | Marcar a região São Paulo na criação do projeto |
| Vercel | app e rotinas | funções em gru1 (São Paulo); rede global | Termos + DPA da Vercel | — |
| Anthropic (API do Claude) | classificação de publicações, roteamento de mensagens; Fase 2: peças | EUA (dados armazenados nos EUA; inferência global por padrão) | Termos Comerciais (não treina com dados de clientes), DPA com SCCs da UE; retenção padrão 30 dias | **O DPA não traz as cláusulas-padrão da ANPD (Res. CD/ANPD 19/2024).** Pedir incorporação; enquanto isso, fundamentar no art. 33, IX c/c art. 7º, VI, registrando a análise aqui. Minimização: só o texto da publicação vai para a IA. Não usar Files API nem Batch com processos em segredo. |
| Meta (WhatsApp Cloud API) | canal com a equipe | EUA | Termos da WhatsApp Business Platform | Opt-in de cada membro (código de verificação). Proibido pedir documento ou dado bancário pelo chat. |
| Resend | e-mail transacional | EUA/UE conforme região da conta | Termos + DPA | Escolher região da UE se disponível; e-mails trazem só números de processo e atos |
| CNJ (DJEN e DataJud) | fontes públicas | Brasil | Termos de uso da API pública do DataJud v1.2; Portaria CNJ 374/2026 | Uso não comercial; não coletar dados pessoais de terceiros além do necessário; dar ciência ao CNJ de publicações feitas com os dados |

## Recomendação CFOAB 001/2024

Antes de usar IA em qualquer caso: comunicar por escrito ao cliente que o escritório usa IA como apoio, com revisão humana, e obter consentimento (cláusula no contrato de honorários). Modelo de cláusula: "O escritório utiliza ferramentas de inteligência artificial como apoio à triagem de publicações, cálculo de prazos e redação preliminar, sempre com revisão e decisão por advogado. Os dados do caso podem ser processados por fornecedores de tecnologia, no Brasil e no exterior, sob contrato que veda o uso para treinamento de modelos. O cliente pode, a qualquer tempo, pedir que seu caso não seja tratado com essas ferramentas."
