import { describe, it, expect } from "vitest";
import {
  createCalendarEvent,
  getCalendarClient,
  cancelCalendarEvent,
} from "@/lib/google/calendar";
import { getConfig } from "@/lib/config";

describe("Google Calendar Real Operation (Single Controlled Test)", () => {
  it("creates '[TEST] borrar', confirms existence, and deletes it", async () => {
    const config = getConfig();

    if (!config.GOOGLE_REFRESH_TOKEN) {
      console.warn("GOOGLE_REFRESH_TOKEN not present, skipping real Google Calendar write test.");
      expect(true).toBe(true);
      return;
    }

    const startTime = new Date(Date.now() + 4 * 60 * 60 * 1000); // 4 hours in future
    const endTime = new Date(startTime.getTime() + 30 * 60 * 1000);

    let eventId = "";
    try {
      // 1. Crear evento real
      const created = await createCalendarEvent({
        summary: "[TEST] borrar",
        description: "Evento temporal de prueba automatizada.",
        start: startTime,
        end: endTime,
        modality: "presencial",
        forceReal: true,
      });

      eventId = created.id;
      expect(eventId).toBeDefined();
      expect(eventId.length).toBeGreaterThan(0);

      // 2. Confirmar que existe en Google Calendar
      const calendar = getCalendarClient();
      const fetched = await calendar.events.get({
        calendarId: config.GOOGLE_CALENDAR_ID,
        eventId,
      });

      expect(fetched.data.summary).toBe("[TEST] borrar");
    } finally {
      // 3. Eliminar evento de inmediato
      if (eventId && !eventId.startsWith("mock-")) {
        try {
          await cancelCalendarEvent(eventId, true);
        } catch (delErr) {
          console.warn("Error deleting test event:", delErr);
        }
      }
    }
  });
});
