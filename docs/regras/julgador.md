# Regras do julgador (mapa e minuta de previsão)

- Escopo: somente processos do TJ-MT (número CNJ `8.11`). Outros tribunais estaduais usam o agente `outros_tribunais`.
- Posição neutra: o agente não recebe polo nem objetivo. O foco opcional da advogada entra como dado delimitado e não muda a análise.
- Modo B: sem pesquisa na web. Não se citam números de acórdão, súmula ou tema; a orientação é descrita em tese e marcada para conferência.
- Pronunciamento pela fase real dos autos: decisão interlocutória, saneamento, sentença, acórdão ou nenhum (aguarda ato da parte). Sentença só quando o feito estiver maduro.
- O aviso de previsão judicial é acrescentado pelo código (`src/lib/analises/julgador.ts`), mesmo que o modelo o omita.
- Resultado gravado em `analises` com tipo `mapa_julgador`, sem efeito de aprovação: é estudo, não peça de parte.
- Índices, custas e prazos eventualmente citados no mapa seguem as regras de `docs/regras/calculos.md` e `docs/regras/prazos.md`; quando ausentes dos autos, viram lacuna.
