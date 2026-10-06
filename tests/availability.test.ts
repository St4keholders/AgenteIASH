import { describe, it, expect } from "vitest";
import { isColombiaHoliday, getColombiaHolidays } from "@/lib/calendar/colombia-holidays";
import {
  validateSlot,
  getAvailableSlotsForDay,
  createDateFromBogota,
  DEFAULT_AVAILABILITY_CONFIG
} from "@/lib/calendar/availability";

describe("Colombia Holidays", () => {
  it("correctly identifies Colombian holidays in 2026", () => {
    const holidays2026 = getColombiaHolidays(2026);

    // Fixed holidays
    expect(holidays2026.has("2026-01-01")).toBe(true); // Año Nuevo
    expect(holidays2026.has("2026-05-01")).toBe(true); // Día del Trabajo
    expect(holidays2026.has("2026-07-20")).toBe(true); // Independencia
    expect(holidays2026.has("2026-08-07")).toBe(true); // Batalla de Boyacá
    expect(holidays2026.has("2026-12-08")).toBe(true); // Inmaculada Concepción
    expect(holidays2026.has("2026-12-25")).toBe(true); // Navidad

    // Emiliani moved holidays (Monday)
    expect(holidays2026.has("2026-01-12")).toBe(true); // Reyes Magos trasladado
    expect(holidays2026.has("2026-03-23")).toBe(true); // San José trasladado
    expect(holidays2026.has("2026-06-29")).toBe(true); // San Pedro y San Pablo
    expect(holidays2026.has("2026-08-17")).toBe(true); // Asunción trasladado
    expect(holidays2026.has("2026-10-12")).toBe(true); // Día de la Raza
    expect(holidays2026.has("2026-11-02")).toBe(true); // Todos los Santos trasladado
    expect(holidays2026.has("2026-11-16")).toBe(true); // Independencia de Cartagena trasladado

    // Easter-dependent
    expect(holidays2026.has("2026-04-02")).toBe(true); // Jueves Santo
    expect(holidays2026.has("2026-04-03")).toBe(true); // Viernes Santo

    // Regular working days
    expect(isColombiaHoliday("2026-10-06")).toBe(false); // Tuesday normal
    expect(isColombiaHoliday("2026-02-10")).toBe(false); // Tuesday normal
  });
});

describe("Availability and Business Rules", () => {
  // Reference base time: Tuesday Oct 6, 2026 at 08:00 AM Bogota
  const mockNow = createDateFromBogota(2026, 10, 6, 8, 0);

  it("accepts a valid appointment during business hours with sufficient notice", () => {
    // Oct 6, 2026 at 11:00 AM (3 hours ahead of mockNow)
    const validSlot = createDateFromBogota(2026, 10, 6, 11, 0);
    const result = validateSlot(validSlot, [], DEFAULT_AVAILABILITY_CONFIG, mockNow);
    expect(result.valid).toBe(true);
  });

  it("rejects appointments with less than 2 hours notice", () => {
    // 09:00 AM is only 1 hour ahead
    const tooSoonSlot = createDateFromBogota(2026, 10, 6, 9, 0);
    const result = validateSlot(tooSoonSlot, [], DEFAULT_AVAILABILITY_CONFIG, mockNow);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("mínimo de 2 horas de anticipación");
  });

  it("rejects appointments in the past", () => {
    const pastSlot = createDateFromBogota(2026, 10, 6, 7, 0);
    const result = validateSlot(pastSlot, [], DEFAULT_AVAILABILITY_CONFIG, mockNow);
    expect(result.valid).toBe(false);
  });

  it("rejects appointments more than 30 days ahead", () => {
    // 35 days ahead
    const farAheadSlot = createDateFromBogota(2026, 11, 15, 10, 0);
    const result = validateSlot(farAheadSlot, [], DEFAULT_AVAILABILITY_CONFIG, mockNow);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("más de 30 días");
  });

  it("rejects weekends (Saturday and Sunday)", () => {
    // Saturday Oct 10, 2026
    const saturdaySlot = createDateFromBogota(2026, 10, 10, 10, 0);
    const satResult = validateSlot(saturdaySlot, [], DEFAULT_AVAILABILITY_CONFIG, mockNow);
    expect(satResult.valid).toBe(false);
    expect(satResult.reason).toContain("lunes a viernes");

    // Sunday Oct 11, 2026
    const sundaySlot = createDateFromBogota(2026, 10, 11, 10, 0);
    const sunResult = validateSlot(sundaySlot, [], DEFAULT_AVAILABILITY_CONFIG, mockNow);
    expect(sunResult.valid).toBe(false);
  });

  it("rejects Colombian holidays", () => {
    // Oct 12, 2026 is Día de la Raza (holiday)
    const holidaySlot = createDateFromBogota(2026, 10, 12, 10, 0);
    const result = validateSlot(holidaySlot, [], DEFAULT_AVAILABILITY_CONFIG, mockNow);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("festivo");
  });

  it("rejects appointments outside 7:00 to 19:00 Bogota time", () => {
    // 06:30 AM
    const earlySlot = createDateFromBogota(2026, 10, 7, 6, 30);
    expect(validateSlot(earlySlot, [], DEFAULT_AVAILABILITY_CONFIG, mockNow).valid).toBe(false);

    // 18:30 is allowed (ends at 19:00)
    const lastValidSlot = createDateFromBogota(2026, 10, 7, 18, 30);
    expect(validateSlot(lastValidSlot, [], DEFAULT_AVAILABILITY_CONFIG, mockNow).valid).toBe(true);

    // 19:00 start would end at 19:30, which is outside
    const lateSlot = createDateFromBogota(2026, 10, 7, 19, 0);
    expect(validateSlot(lateSlot, [], DEFAULT_AVAILABILITY_CONFIG, mockNow).valid).toBe(false);
  });

  it("rejects overlapping appointments", () => {
    const slotStart = createDateFromBogota(2026, 10, 7, 14, 0);
    const busyInterval = {
      start: createDateFromBogota(2026, 10, 7, 14, 15),
      end: createDateFromBogota(2026, 10, 7, 14, 45)
    };
    const result = validateSlot(slotStart, [busyInterval], DEFAULT_AVAILABILITY_CONFIG, mockNow);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("ocupado");
  });

  it("returns up to 4 balanced slots for a day", () => {
    const slots = getAvailableSlotsForDay("2026-10-07", [], 4, DEFAULT_AVAILABILITY_CONFIG, mockNow);
    expect(slots.length).toBe(4);
    // Each slot duration is 30 mins
    slots.forEach(slot => {
      const startMs = new Date(slot.start).getTime();
      const endMs = new Date(slot.end).getTime();
      expect(endMs - startMs).toBe(30 * 60 * 1000);
    });
  });

  it("returns empty array for holidays and weekends", () => {
    const holidaySlots = getAvailableSlotsForDay("2026-10-12", [], 4, DEFAULT_AVAILABILITY_CONFIG, mockNow);
    expect(holidaySlots).toEqual([]);

    const weekendSlots = getAvailableSlotsForDay("2026-10-11", [], 4, DEFAULT_AVAILABILITY_CONFIG, mockNow);
    expect(weekendSlots).toEqual([]);
  });
});
