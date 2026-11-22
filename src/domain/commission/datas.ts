/**
 * Datas de negócio como strings ISO "YYYY-MM-DD" (sem hora, sem fuso).
 * Competência = "YYYY-MM". Comparar strings ISO de mesmo formato é seguro.
 */

const RE_COMPETENCIA = /^\d{4}-(0[1-9]|1[0-2])$/;
const RE_DATA = /^\d{4}-\d{2}-\d{2}$/;

export function validarCompetencia(competencia: string): void {
  if (!RE_COMPETENCIA.test(competencia)) {
    throw new Error(`Competência inválida: "${competencia}" (esperado YYYY-MM)`);
  }
}

export function validarData(data: string): void {
  if (!RE_DATA.test(data) || Number.isNaN(Date.parse(`${data}T00:00:00Z`))) {
    throw new Error(`Data inválida: "${data}" (esperado YYYY-MM-DD)`);
  }
}

export function primeiroDia(competencia: string): string {
  validarCompetencia(competencia);
  return `${competencia}-01`;
}

export function ultimoDia(competencia: string): string {
  validarCompetencia(competencia);
  const [ano, mes] = competencia.split("-").map(Number);
  const dia = new Date(Date.UTC(ano, mes, 0)).getUTCDate(); // dia 0 do mês seguinte
  return `${competencia}-${String(dia).padStart(2, "0")}`;
}

export function competenciaDe(data: string): string {
  validarData(data);
  return data.slice(0, 7);
}

export function estaNaCompetencia(data: string | null, competencia: string): boolean {
  return data !== null && data >= primeiroDia(competencia) && data <= ultimoDia(competencia);
}

/** Dias corridos de `de` até `ate` (positivo se `ate` for depois). */
export function diasEntre(de: string, ate: string): number {
  validarData(de);
  validarData(ate);
  const ms = Date.parse(`${ate}T00:00:00Z`) - Date.parse(`${de}T00:00:00Z`);
  return Math.round(ms / 86_400_000);
}

/** Competência seguinte ("2026-12" → "2027-01"). */
export function proximaCompetencia(competencia: string): string {
  validarCompetencia(competencia);
  const [ano, mes] = competencia.split("-").map(Number);
  return mes === 12 ? `${ano + 1}-01` : `${ano}-${String(mes + 1).padStart(2, "0")}`;
}

/** Data → "YYYY-MM-DD" usando a parte UTC (Prisma devolve @db.Date à meia-noite UTC). */
export function paraISO(data: Date): string {
  return data.toISOString().slice(0, 10);
}
