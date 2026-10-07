import dotenv from "dotenv";
import path from "path";

// Load .env explicitly for vitest test runs
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

// SEGURIDAD: las pruebas nunca envían mensajes reales de WhatsApp ni escriben
// eventos reales en Google Calendar, aunque el .env tenga valores de producción.
// Solo tests/calendar-real.test.ts escribe (y borra) un evento "[TEST]" a propósito.
process.env.WHATSAPP_DRY_RUN = "true";
process.env.CALENDAR_DRY_RUN = "true";

import "@testing-library/jest-dom/vitest";
