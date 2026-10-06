import { z } from "zod";

const envSchema = z.object({
  WHATSAPP_TOKEN: z.string().min(1, "WHATSAPP_TOKEN is required"),
  WHATSAPP_PHONE_NUMBER_ID: z.string().min(1, "WHATSAPP_PHONE_NUMBER_ID is required"),
  WHATSAPP_BUSINESS_ACCOUNT_ID: z.string().min(1, "WHATSAPP_BUSINESS_ACCOUNT_ID is required"),
  META_APP_ID: z.string().min(1, "META_APP_ID is required"),
  META_APP_SECRET: z.string().min(1, "META_APP_SECRET is required"),
  WHATSAPP_VERIFY_TOKEN: z.string().min(1, "WHATSAPP_VERIFY_TOKEN is required"),
  OPENAI_API_KEY: z.string().min(1, "OPENAI_API_KEY is required"),
  OPENAI_MODEL: z.string().default("gpt-4o-mini"),
  OPENAI_TRANSCRIBE_MODEL: z.string().default("whisper-1"),
  GOOGLE_CLIENT_ID: z.string().min(1, "GOOGLE_CLIENT_ID is required"),
  GOOGLE_CLIENT_SECRET: z.string().min(1, "GOOGLE_CLIENT_SECRET is required"),
  GOOGLE_REFRESH_TOKEN: z.string().optional().default(""),
  GOOGLE_CALENDAR_ID: z.string().default("primary"),
  GOOGLE_BUSY_CALENDAR_IDS: z.string().default("primary"),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url("NEXT_PUBLIC_SUPABASE_URL must be a valid URL"),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1, "NEXT_PUBLIC_SUPABASE_ANON_KEY is required"),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1, "SUPABASE_SERVICE_ROLE_KEY is required"),
  GRAPH_API_VERSION: z.string().default("v25.0"),
  APP_TIMEZONE: z.string().default("America/Bogota"),
  MESSAGE_DEBOUNCE_MS: z.coerce.number().default(6000),
  WHATSAPP_DRY_RUN: z.preprocess((val) => val === "true" || val === true, z.boolean()).default(false),
  CALENDAR_DRY_RUN: z.preprocess((val) => val === "true" || val === true, z.boolean()).default(false),
});

export function getConfig() {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const missingKeys = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(`Config validation failed for environment variables: ${missingKeys}`);
  }
  return parsed.data;
}

export type AppConfig = ReturnType<typeof getConfig>;
