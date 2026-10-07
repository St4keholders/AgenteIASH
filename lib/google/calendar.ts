import { google, calendar_v3 } from "googleapis";
import { getConfig } from "@/lib/config";
import { BusyInterval } from "@/lib/calendar/availability";

export function getGoogleOAuth2Client() {
  const config = getConfig();
  const oauth2Client = new google.auth.OAuth2(
    config.GOOGLE_CLIENT_ID,
    config.GOOGLE_CLIENT_SECRET,
    "http://localhost:3000/oauth2callback"
  );

  if (config.GOOGLE_REFRESH_TOKEN) {
    oauth2Client.setCredentials({
      refresh_token: config.GOOGLE_REFRESH_TOKEN,
    });
  }

  return oauth2Client;
}

export function getCalendarClient() {
  const auth = getGoogleOAuth2Client();
  return google.calendar({ version: "v3", auth });
}

/**
 * Consulta la disponibilidad (freebusy) en Google Calendar para un rango de tiempo.
 */
export async function getCalendarBusyIntervals(
  timeMin: Date,
  timeMax: Date
): Promise<BusyInterval[]> {
  const config = getConfig();
  if (!config.GOOGLE_REFRESH_TOKEN) {
    return [];
  }

  try {
    const calendar = getCalendarClient();
    const calendarIds = config.GOOGLE_BUSY_CALENDAR_IDS.split(",").map((s) => s.trim());

    const res = await calendar.freebusy.query({
      requestBody: {
        timeMin: timeMin.toISOString(),
        timeMax: timeMax.toISOString(),
        items: calendarIds.map((id) => ({ id })),
      },
    });

    const busyList: BusyInterval[] = [];
    const calendars = res.data.calendars;
    if (calendars) {
      for (const calId of Object.keys(calendars)) {
        const busy = calendars[calId]?.busy;
        if (busy) {
          for (const item of busy) {
            if (item.start && item.end) {
              busyList.push({
                start: new Date(item.start),
                end: new Date(item.end),
              });
            }
          }
        }
      }
    }

    return busyList;
  } catch (error) {
    console.warn("Error fetching Google Calendar freebusy, falling back to empty:", error);
    return [];
  }
}

export interface CreateEventParams {
  summary: string;
  description?: string;
  start: Date;
  end: Date;
  modality: "virtual" | "presencial";
  attendeeEmail?: string;
  location?: string;
  forceReal?: boolean;
}

export interface CalendarEventResult {
  id: string;
  meetLink?: string;
}

/**
 * Crea un evento en Google Calendar.
 * Respeta CALENDAR_DRY_RUN salvo que forceReal = true.
 */
export async function createCalendarEvent(
  params: CreateEventParams
): Promise<CalendarEventResult> {
  const config = getConfig();

  if (process.env.NODE_ENV === "test" && !config.CALENDAR_DRY_RUN && !params.forceReal) {
    throw new Error("Hard guard: CALENDAR_DRY_RUN must be active in test environment");
  }

  if (config.CALENDAR_DRY_RUN && !params.forceReal) {
    return {
      id: `mock-event-${Date.now()}`,
      meetLink:
        params.modality === "virtual"
          ? "https://meet.google.com/mock-stakeholders-meet"
          : undefined,
    };
  }

  const calendar = getCalendarClient();
  const requestBody: calendar_v3.Schema$Event = {
    summary: params.summary,
    description: params.description,
    start: {
      dateTime: params.start.toISOString(),
      timeZone: config.APP_TIMEZONE,
    },
    end: {
      dateTime: params.end.toISOString(),
      timeZone: config.APP_TIMEZONE,
    },
  };

  if (params.modality === "virtual") {
    requestBody.conferenceData = {
      createRequest: {
        requestId: `meet-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
        conferenceSolutionKey: { type: "hangoutsMeet" },
      },
    };
  } else {
    requestBody.location = params.location || "Medellín, Colombia";
  }

  if (params.attendeeEmail) {
    requestBody.attendees = [{ email: params.attendeeEmail }];
  }

  const res = await calendar.events.insert({
    calendarId: config.GOOGLE_CALENDAR_ID,
    conferenceDataVersion: params.modality === "virtual" ? 1 : 0,
    sendUpdates: params.attendeeEmail ? "all" : "none",
    requestBody,
  });

  return {
    id: res.data.id || `event-${Date.now()}`,
    meetLink: res.data.hangoutLink || undefined,
  };
}

/**
 * Reprograma un evento existente en Google Calendar.
 */
export async function rescheduleCalendarEvent(
  eventId: string,
  newStart: Date,
  newEnd: Date,
  forceReal = false
): Promise<CalendarEventResult> {
  const config = getConfig();

  if (process.env.NODE_ENV === "test" && !config.CALENDAR_DRY_RUN && !forceReal) {
    throw new Error("Hard guard: CALENDAR_DRY_RUN must be active in test environment");
  }

  if ((config.CALENDAR_DRY_RUN && !forceReal) || eventId.startsWith("mock-")) {
    return { id: eventId };
  }

  const calendar = getCalendarClient();
  const res = await calendar.events.patch({
    calendarId: config.GOOGLE_CALENDAR_ID,
    eventId,
    requestBody: {
      start: {
        dateTime: newStart.toISOString(),
        timeZone: config.APP_TIMEZONE,
      },
      end: {
        dateTime: newEnd.toISOString(),
        timeZone: config.APP_TIMEZONE,
      },
    },
    sendUpdates: "all",
  });

  return {
    id: res.data.id || eventId,
    meetLink: res.data.hangoutLink || undefined,
  };
}

/**
 * Cancela (elimina) un evento en Google Calendar.
 */
export async function cancelCalendarEvent(
  eventId: string,
  forceReal = false
): Promise<void> {
  const config = getConfig();

  if (process.env.NODE_ENV === "test" && !config.CALENDAR_DRY_RUN && !forceReal) {
    throw new Error("Hard guard: CALENDAR_DRY_RUN must be active in test environment");
  }

  if ((config.CALENDAR_DRY_RUN && !forceReal) || eventId.startsWith("mock-")) {
    return;
  }

  const calendar = getCalendarClient();
  await calendar.events.delete({
    calendarId: config.GOOGLE_CALENDAR_ID,
    eventId,
    sendUpdates: "all",
  });
}
