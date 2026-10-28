# Bases legais e decisões de LGPD

- **Dados de clientes e partes em processo**: execução de contrato (art. 7º, V) e exercício regular de direitos em processo judicial (art. 7º, VI). Dados sensíveis (família, saúde) nos autos: art. 11, II, "d". Não se pede consentimento para o tratamento necessário ao mandato.
- **Equipe**: execução de contrato de trabalho/sociedade; o canal WhatsApp exige opt-in próprio (regra da Meta), registrado em `usuario_telefones.opt_in_em`.
- **Transferência internacional (Anthropic, Meta)**: ver `fornecedores.md`. Hipótese usada enquanto não houver cláusulas-padrão da ANPD: art. 33, IX (transferência necessária ao exercício regular de direitos), com minimização e registro.
- **Pequeno porte (Res. CD/ANPD 2/2022)**: o escritório provavelmente NÃO se beneficia das flexibilizações, porque usa tecnologia emergente (IA) com dados sensíveis (art. 4º da resolução): manter registro completo, encarregado e relatório de impacto (RIPD) antes de ir ao ar.
- **Segredo de justiça (CPC art. 189)**: acesso ao texto restrito ao responsável, colaboradores e sócios; leitura registrada em `auditoria_acessos`; nada de texto sigiloso por WhatsApp ou e-mail.
- **Encarregado**: a sócia, com e-mail de contato publicado na política de privacidade (Fase 3).
- **Incidentes**: o DPA da Anthropic prevê notificação em 48 h; o escritório comunica a ANPD e os titulares conforme a Res. CD/ANPD 15/2024 (prazo de 3 dias úteis para a ANPD) quando houver risco relevante.
- **RIPD**: a fazer antes do uso com dados reais; roteiro: descrição do tratamento, necessidade, riscos (prazo perdido, vazamento de texto sigiloso, alucinação da IA), medidas (aprovação humana, RLS, auditoria, minimização, teto de IA), responsável e data.
