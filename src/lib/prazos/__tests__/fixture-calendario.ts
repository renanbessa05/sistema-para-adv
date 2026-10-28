import { montarCalendario } from "../calendario";
import type { DiaSemExpediente } from "../tipos";

export const COMARCA_CUIABA = "comarca-cuiaba";

/**
 * Calendário de teste para o TJ-MT em 2026 e 2027.
 * Feriados nacionais: Lei 662/1949, Lei 10.607/2002, Lei 6.802/1980 (12/10), Lei 14.759/2023 (20/11).
 * Dias forenses (Carnaval, Cinzas, Corpus Christi, Servidor Público, Dia da Justiça): a Portaria TJMT/PRES 1915/2025
 * suspende expediente e prazos nos feriados e pontos facultativos; datas de 2027 são previsão (a confirmar na Portaria de 2027).
 */
export const DIAS_TJMT: DiaSemExpediente[] = [
  { data: "2026-01-01", descricao: "Confraternização Universal", abrangencia: "nacional", suspendePrazo: true },
  { data: "2026-02-16", descricao: "Carnaval", abrangencia: "forense", suspendePrazo: true },
  { data: "2026-02-17", descricao: "Carnaval", abrangencia: "forense", suspendePrazo: true },
  { data: "2026-02-18", descricao: "Quarta-feira de Cinzas (ponto facultativo)", abrangencia: "forense", suspendePrazo: true },
  { data: "2026-04-03", descricao: "Sexta-feira Santa", abrangencia: "nacional", suspendePrazo: true },
  { data: "2026-04-08", descricao: "Aniversário de Cuiabá", abrangencia: "municipal", comarcaId: COMARCA_CUIABA, suspendePrazo: true },
  { data: "2026-04-21", descricao: "Tiradentes", abrangencia: "nacional", suspendePrazo: true },
  { data: "2026-05-01", descricao: "Dia do Trabalho", abrangencia: "nacional", suspendePrazo: true },
  { data: "2026-06-04", descricao: "Corpus Christi (ponto facultativo)", abrangencia: "forense", suspendePrazo: true },
  { data: "2026-09-07", descricao: "Independência do Brasil", abrangencia: "nacional", suspendePrazo: true },
  { data: "2026-10-12", descricao: "Nossa Senhora Aparecida", abrangencia: "nacional", suspendePrazo: true },
  { data: "2026-10-30", descricao: "Dia do Servidor Público (ponto facultativo transferido)", abrangencia: "forense", suspendePrazo: true },
  { data: "2026-11-02", descricao: "Finados", abrangencia: "nacional", suspendePrazo: true },
  { data: "2026-11-15", descricao: "Proclamação da República", abrangencia: "nacional", suspendePrazo: true },
  { data: "2026-11-20", descricao: "Dia Nacional de Zumbi e da Consciência Negra", abrangencia: "nacional", suspendePrazo: true },
  { data: "2026-12-08", descricao: "Dia da Justiça (ponto facultativo)", abrangencia: "forense", suspendePrazo: true },
  { data: "2026-12-25", descricao: "Natal", abrangencia: "nacional", suspendePrazo: true },
  // Dia com expediente reduzido que NÃO suspende prazo (serve para testar protração sem pulo)
  { data: "2026-06-24", descricao: "Expediente reduzido (jogo da Copa)", abrangencia: "suspensao_ad_hoc", suspendePrazo: false },
  // 2027 (previsão)
  { data: "2027-01-01", descricao: "Confraternização Universal", abrangencia: "nacional", suspendePrazo: true },
  { data: "2027-02-08", descricao: "Carnaval", abrangencia: "forense", suspendePrazo: true },
  { data: "2027-02-09", descricao: "Carnaval", abrangencia: "forense", suspendePrazo: true },
  { data: "2027-02-10", descricao: "Quarta-feira de Cinzas (ponto facultativo)", abrangencia: "forense", suspendePrazo: true },
  { data: "2027-03-26", descricao: "Sexta-feira Santa", abrangencia: "nacional", suspendePrazo: true },
  { data: "2027-04-21", descricao: "Tiradentes", abrangencia: "nacional", suspendePrazo: true },
  { data: "2027-05-01", descricao: "Dia do Trabalho", abrangencia: "nacional", suspendePrazo: true },
  { data: "2027-05-27", descricao: "Corpus Christi (ponto facultativo)", abrangencia: "forense", suspendePrazo: true },
];

export function calendarioCuiaba() {
  return montarCalendario(DIAS_TJMT, { tribunal: "TJMT", comarcaId: COMARCA_CUIABA, anosCobertos: [2026, 2027] });
}

export function calendarioSemComarca() {
  return montarCalendario(DIAS_TJMT, { tribunal: "TJMT", anosCobertos: [2026, 2027] });
}

/** Só 2026 carregado: serve para provar o aviso de calendário incompleto. */
export function calendarioSo2026() {
  return montarCalendario(
    DIAS_TJMT.filter((d) => d.data.startsWith("2026")),
    { tribunal: "TJMT", comarcaId: COMARCA_CUIABA, anosCobertos: [2026] },
  );
}
