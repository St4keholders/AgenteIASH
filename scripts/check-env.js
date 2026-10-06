// scripts/check-env.js
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

// Load .env if present
const envPath = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  const envConfig = dotenv.parse(fs.readFileSync(envPath));
  for (const k in envConfig) {
    if (!process.env[k]) {
      process.env[k] = envConfig[k];
    }
  }
}

const { z } = require('zod');

const envSchema = z.object({
  WHATSAPP_TOKEN: z.string().min(1, 'WHATSAPP_TOKEN is required'),
  WHATSAPP_PHONE_NUMBER_ID: z.string().min(1, 'WHATSAPP_PHONE_NUMBER_ID is required'),
  WHATSAPP_BUSINESS_ACCOUNT_ID: z.string().min(1, 'WHATSAPP_BUSINESS_ACCOUNT_ID is required'),
  META_APP_ID: z.string().min(1, 'META_APP_ID is required'),
  META_APP_SECRET: z.string().min(1, 'META_APP_SECRET is required'),
  WHATSAPP_VERIFY_TOKEN: z.string().min(1, 'WHATSAPP_VERIFY_TOKEN is required'),
  OPENAI_API_KEY: z.string().min(1, 'OPENAI_API_KEY is required'),
  GOOGLE_CLIENT_ID: z.string().min(1, 'GOOGLE_CLIENT_ID is required'),
  GOOGLE_CLIENT_SECRET: z.string().min(1, 'GOOGLE_CLIENT_SECRET is required'),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1, 'SUPABASE_SERVICE_ROLE_KEY is required'),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url('NEXT_PUBLIC_SUPABASE_URL must be a valid URL'),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1, 'NEXT_PUBLIC_SUPABASE_ANON_KEY is required'),
  
  // Optional / defaults
  GOOGLE_REFRESH_TOKEN: z.string().optional(),
  OPENAI_MODEL: z.string().default('gpt-4o-mini'),
  OPENAI_TRANSCRIBE_MODEL: z.string().default('whisper-1'),
  GOOGLE_CALENDAR_ID: z.string().default('primary'),
  GOOGLE_BUSY_CALENDAR_IDS: z.string().default('primary'),
  APP_TIMEZONE: z.string().default('America/Bogota'),
  MESSAGE_DEBOUNCE_MS: z.coerce.number().default(6000),
  WHATSAPP_DRY_RUN: z.preprocess((val) => val === 'true' || val === true, z.boolean()).default(false),
  CALENDAR_DRY_RUN: z.preprocess((val) => val === 'true' || val === true, z.boolean()).default(false),
  GRAPH_API_VERSION: z.string().default('v25.0')
});

const result = envSchema.safeParse(process.env);

if (!result.success) {
  console.error('❌ Environment validation failed!');
  const missingKeys = result.error.issues.map(issue => issue.path.join('.'));
  console.error('Missing or invalid environment variables:', missingKeys.join(', '));
  process.exit(1);
}

console.log('✅ Environment validation passed (all required keys present).');
process.exit(0);
