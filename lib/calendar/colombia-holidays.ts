/**
 * Cálculo exacto de festivos en Colombia según la Ley 51 de 1983 (Ley Emiliani)
 * y cálculo eclesiástico del Domingo de Pascua (algoritmo anónimo de Butcher / Meeus).
 */

function getEasterSunday(year: number): { month: number; day: number } {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return { month, day };
}

function moveToNextMonday(date: Date): Date {
  const dayOfWeek = date.getUTCDay(); // 0 = Sunday, 1 = Monday, ...
  if (dayOfWeek === 1) return date;
  const daysToAdd = dayOfWeek === 0 ? 1 : 8 - dayOfWeek;
  const result = new Date(date.getTime());
  result.setUTCDate(result.getUTCDate() + daysToAdd);
  return result;
}

function formatDateKey(year: number, month: number, day: number): string {
  const m = String(month).padStart(2, "0");
  const d = String(day).padStart(2, "0");
  return `${year}-${m}-${d}`;
}

export function getColombiaHolidays(year: number): Set<string> {
  const holidays = new Set<string>();

  // 1. Festivos Fijos (no se trasladan)
  holidays.add(formatDateKey(year, 1, 1));   // 1 de enero: Año Nuevo
  holidays.add(formatDateKey(year, 5, 1));   // 1 de mayo: Día del Trabajo
  holidays.add(formatDateKey(year, 7, 20));  // 20 de julio: Día de la Independencia
  holidays.add(formatDateKey(year, 8, 7));   // 7 de agosto: Batalla de Boyacá
  holidays.add(formatDateKey(year, 12, 8));  // 8 de diciembre: Inmaculada Concepción
  holidays.add(formatDateKey(year, 12, 25)); // 25 de diciembre: Navidad

  // 2. Festivos Ley Emiliani (se trasladan al siguiente lunes)
  const emilianiFixed = [
    { month: 1, day: 6 },  // Reyes Magos
    { month: 3, day: 19 }, // San José
    { month: 6, day: 29 }, // San Pedro y San Pablo
    { month: 8, day: 15 }, // Asunción de la Virgen
    { month: 10, day: 12 },// Día de la Raza
    { month: 11, day: 1 }, // Todos los Santos
    { month: 11, day: 11 },// Independencia de Cartagena
  ];

  for (const item of emilianiFixed) {
    const rawDate = new Date(Date.UTC(year, item.month - 1, item.day));
    const moved = moveToNextMonday(rawDate);
    holidays.add(formatDateKey(year, moved.getUTCMonth() + 1, moved.getUTCDate()));
  }

  // 3. Festivos dependientes de la Pascua
  const easter = getEasterSunday(year);
  const easterDate = new Date(Date.UTC(year, easter.month - 1, easter.day));

  // Jueves Santo: Pascua - 3 días
  const juevesSanto = new Date(easterDate.getTime());
  juevesSanto.setUTCDate(juevesSanto.getUTCDate() - 3);
  holidays.add(formatDateKey(year, juevesSanto.getUTCMonth() + 1, juevesSanto.getUTCDate()));

  // Viernes Santo: Pascua - 2 días
  const viernesSanto = new Date(easterDate.getTime());
  viernesSanto.setUTCDate(viernesSanto.getUTCDate() - 2);
  holidays.add(formatDateKey(year, viernesSanto.getUTCMonth() + 1, viernesSanto.getUTCDate()));

  // Ascensión del Señor: Pascua + 43 días (trasladado a lunes)
  const ascension = new Date(easterDate.getTime());
  ascension.setUTCDate(ascension.getUTCDate() + 43);
  const ascensionMoved = moveToNextMonday(ascension);
  holidays.add(formatDateKey(year, ascensionMoved.getUTCMonth() + 1, ascensionMoved.getUTCDate()));

  // Corpus Christi: Pascua + 64 días (trasladado a lunes)
  const corpus = new Date(easterDate.getTime());
  corpus.setUTCDate(corpus.getUTCDate() + 64);
  const corpusMoved = moveToNextMonday(corpus);
  holidays.add(formatDateKey(year, corpusMoved.getUTCMonth() + 1, corpusMoved.getUTCDate()));

  // Sagrado Corazón: Pascua + 71 días (trasladado a lunes)
  const sagradoCorazon = new Date(easterDate.getTime());
  sagradoCorazon.setUTCDate(sagradoCorazon.getUTCDate() + 71);
  const sagradoCorazonMoved = moveToNextMonday(sagradoCorazon);
  holidays.add(formatDateKey(year, sagradoCorazonMoved.getUTCMonth() + 1, sagradoCorazonMoved.getUTCDate()));

  return holidays;
}

export function isColombiaHoliday(dateString: string): boolean {
  const parts = dateString.split("-").map(Number);
  if (parts.length < 3 || isNaN(parts[0])) return false;
  const holidays = getColombiaHolidays(parts[0]);
  return holidays.has(dateString);
}
