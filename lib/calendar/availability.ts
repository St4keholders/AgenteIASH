import { isColombiaHoliday } from "./colombia-holidays";

export interface TimeSlot {
  start: string; // ISO string with -05:00
  end: string;   // ISO string with -05:00
  timeFormatted: string; // "7:00 a. m."
  dateFormatted: string; // "lun 6 oct"
}

export interface BusyInterval {
  start: Date;
  end: Date;
}

export interface AvailabilityConfig {
  startHour: number; // 7
  endHour: number;   // 19
  durationMinutes: number; // 30
  minNoticeHours: number; // 2
  maxDaysAhead: number; // 30
  timeZone: string; // "America/Bogota"
}

export const DEFAULT_AVAILABILITY_CONFIG: AvailabilityConfig = {
  startHour: 7,
  endHour: 19,
  durationMinutes: 30,
  minNoticeHours: 2,
  maxDaysAhead: 30,
  timeZone: "America/Bogota",
};

/**
 * Convierte una fecha a objeto con componentes en zona horaria de Bogotá (UTC-5).
 */
export function getBogotaDateParts(date: Date) {
  // America/Bogota is always UTC-5 with no daylight saving time
  const bogotaOffsetMs = -5 * 60 * 60 * 1000;
  const bogotaTime = new Date(date.getTime() + bogotaOffsetMs);
  return {
    year: bogotaTime.getUTCFullYear(),
    month: bogotaTime.getUTCMonth() + 1,
    day: bogotaTime.getUTCDate(),
    dayOfWeek: bogotaTime.getUTCDay(), // 0 = Dom, 1 = Lun, ..., 6 = Sab
    hour: bogotaTime.getUTCHours(),
    minute: bogotaTime.getUTCMinutes(),
    second: bogotaTime.getUTCSeconds(),
    dateString: `${bogotaTime.getUTCFullYear()}-${String(bogotaTime.getUTCMonth() + 1).padStart(2, "0")}-${String(bogotaTime.getUTCDate()).padStart(2, "0")}`,
  };
}

/**
 * Crea una fecha en UTC a partir de componentes locales en America/Bogota (UTC-5).
 */
export function createDateFromBogota(year: number, month: number, day: number, hour: number, minute: number): Date {
  return new Date(Date.UTC(year, month - 1, day, hour + 5, minute, 0, 0));
}

/**
 * Formatea una fecha ISO en formato local de Bogotá con offset -05:00
 */
export function toBogotaIsoString(date: Date): string {
  const parts = getBogotaDateParts(date);
  const m = String(parts.month).padStart(2, "0");
  const d = String(parts.day).padStart(2, "0");
  const h = String(parts.hour).padStart(2, "0");
  const min = String(parts.minute).padStart(2, "0");
  const sec = String(parts.second).padStart(2, "0");
  return `${parts.year}-${m}-${d}T${h}:${min}:${sec}-05:00`;
}

/**
 * Formatea una hora en estilo español colombiano: "3:30 p. m." o "7:00 a. m."
 */
export function formatTimeBogota(date: Date): string {
  const parts = getBogotaDateParts(date);
  const period = parts.hour >= 12 ? "p. m." : "a. m.";
  const displayHour = parts.hour % 12 === 0 ? 12 : parts.hour % 12;
  const displayMin = String(parts.minute).padStart(2, "0");
  return `${displayHour}:${displayMin} ${period}`;
}

/**
 * Formatea fecha en español: "lun 6 oct"
 */
export function formatDateBogota(date: Date): string {
  const days = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
  const months = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  const parts = getBogotaDateParts(date);
  return `${days[parts.dayOfWeek]} ${parts.day} ${months[parts.month - 1]}`;
}

/**
 * Valida si un slot propuesto cumple todas las reglas de negocio.
 */
export function validateSlot(
  slotStart: Date,
  busyIntervals: BusyInterval[] = [],
  config: AvailabilityConfig = DEFAULT_AVAILABILITY_CONFIG,
  now: Date = new Date()
): { valid: boolean; reason?: string } {
  const slotEnd = new Date(slotStart.getTime() + config.durationMinutes * 60 * 1000);
  const bogotaStart = getBogotaDateParts(slotStart);
  const bogotaEnd = getBogotaDateParts(slotEnd);

  // 1. No en el pasado y con anticipación mínima
  const minAllowedTime = new Date(now.getTime() + config.minNoticeHours * 60 * 60 * 1000);
  if (slotStart.getTime() < minAllowedTime.getTime()) {
    return {
      valid: false,
      reason: `La cita requiere un mínimo de ${config.minNoticeHours} horas de anticipación y no puede ser en el pasado.`,
    };
  }

  // 2. Máximo hacia adelante
  const maxAllowedTime = new Date(now.getTime() + config.maxDaysAhead * 24 * 60 * 60 * 1000);
  if (slotStart.getTime() > maxAllowedTime.getTime()) {
    return {
      valid: false,
      reason: `No se pueden agendar citas con más de ${config.maxDaysAhead} días de anticipación.`,
    };
  }

  // 3. Días laborales (Lunes = 1 a Viernes = 5)
  if (bogotaStart.dayOfWeek === 0 || bogotaStart.dayOfWeek === 6) {
    return {
      valid: false,
      reason: "Las citas solo están disponibles de lunes a viernes.",
    };
  }

  // 4. Festivos de Colombia
  if (isColombiaHoliday(bogotaStart.dateString)) {
    return {
      valid: false,
      reason: `La fecha ${bogotaStart.dateString} es un día festivo en Colombia.`,
    };
  }

  // 5. Horario laboral (7:00 a 19:00 hora de Bogotá). Última cita empieza a las 18:30
  const startDecimal = bogotaStart.hour + bogotaStart.minute / 60;
  const endDecimal = bogotaEnd.hour + bogotaEnd.minute / 60;

  if (startDecimal < config.startHour || endDecimal > config.endHour) {
    return {
      valid: false,
      reason: `El horario de atención es de ${config.startHour}:00 a ${config.endHour}:00.`,
    };
  }

  // 6. Sin superposición con eventos existentes
  for (const busy of busyIntervals) {
    const bStart = busy.start.getTime();
    const bEnd = busy.end.getTime();
    const sStart = slotStart.getTime();
    const sEnd = slotEnd.getTime();

    // Existe superposición si (sStart < bEnd) && (sEnd > bStart)
    if (sStart < bEnd && sEnd > bStart) {
      return {
        valid: false,
        reason: "El horario seleccionado ya se encuentra ocupado.",
      };
    }
  }

  return { valid: true };
}

/**
 * Genera todos los slots libres disponibles para un día específico (YYYY-MM-DD en Bogotá).
 */
export function getAvailableSlotsForDay(
  dateString: string,
  busyIntervals: BusyInterval[] = [],
  maxOptions = 4,
  config: AvailabilityConfig = DEFAULT_AVAILABILITY_CONFIG,
  now: Date = new Date()
): TimeSlot[] {
  const parts = dateString.split("-").map(Number);
  if (parts.length < 3) return [];
  const [year, month, day] = parts;

  // Si es festivo o fin de semana, no hay slots
  if (isColombiaHoliday(dateString)) return [];

  const tempDate = createDateFromBogota(year, month, day, 12, 0);
  const dayOfWeek = getBogotaDateParts(tempDate).dayOfWeek;
  if (dayOfWeek === 0 || dayOfWeek === 6) return [];

  const slots: TimeSlot[] = [];

  // Recorrer de startHour a endHour en intervalos de durationMinutes
  let currentHour = config.startHour;
  let currentMinute = 0;

  while (true) {
    const slotStart = createDateFromBogota(year, month, day, currentHour, currentMinute);
    const slotEnd = new Date(slotStart.getTime() + config.durationMinutes * 60 * 1000);
    const endBogota = getBogotaDateParts(slotEnd);
    const endDecimal = endBogota.hour + endBogota.minute / 60;

    if (endDecimal > config.endHour) break;

    const validation = validateSlot(slotStart, busyIntervals, config, now);
    if (validation.valid) {
      slots.push({
        start: toBogotaIsoString(slotStart),
        end: toBogotaIsoString(slotEnd),
        timeFormatted: formatTimeBogota(slotStart),
        dateFormatted: formatDateBogota(slotStart),
      });
    }

    // Avanzar
    currentMinute += config.durationMinutes;
    if (currentMinute >= 60) {
      currentHour += Math.floor(currentMinute / 60);
      currentMinute = currentMinute % 60;
    }
  }

  // Si se solicitó un máximo de opciones (ej. 3 o 4 por día), seleccionar distribuidas (mañana, mediodía, tarde)
  if (slots.length <= maxOptions) {
    return slots;
  }

  // Distribución balanceada a lo largo del día
  const step = (slots.length - 1) / (maxOptions - 1);
  const selected: TimeSlot[] = [];
  for (let i = 0; i < maxOptions; i++) {
    const idx = Math.round(i * step);
    selected.push(slots[idx]);
  }
  return selected;
}
