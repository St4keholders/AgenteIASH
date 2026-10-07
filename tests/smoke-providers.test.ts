import { describe, it, expect } from "vitest";
import { getConfig } from "@/lib/config";
import { createAdminClient } from "@/lib/supabase/server";
import OpenAI from "openai";

describe("Smoke Tests: Read-Only Provider Connectivity", () => {
  it("connects and reads from Supabase", async () => {
    const supabase = createAdminClient();
    const { data, error } = await supabase.from("pipeline_stages").select("key, name");
    expect(error).toBeNull();
    expect(data).toBeDefined();
    expect(data?.length).toBeGreaterThan(0);
  });

  it("verifies OpenAI credentials by listing models", async () => {
    const config = getConfig();
    const openai = new OpenAI({
      apiKey: config.OPENAI_API_KEY,
      dangerouslyAllowBrowser: typeof window !== "undefined",
    });
    const models = await openai.models.list();
    expect(models.data.length).toBeGreaterThan(0);
  });

  it("verifies Meta Graph API phone number endpoint", async () => {
    const config = getConfig();
    if (config.WHATSAPP_DRY_RUN) {
      expect(true).toBe(true);
      return;
    }

    const url = `https://graph.facebook.com/${config.GRAPH_API_VERSION}/${config.WHATSAPP_PHONE_NUMBER_ID}?fields=id,display_phone_number`;
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${config.WHATSAPP_TOKEN}`,
      },
    });
    // Should be 200 or authorized
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.id).toBe(config.WHATSAPP_PHONE_NUMBER_ID);
  });

  it("verifies Google Calendar OAuth credentials exist", async () => {
    const config = getConfig();
    expect(config.GOOGLE_CLIENT_ID).toBeDefined();
    expect(config.GOOGLE_CLIENT_SECRET).toBeDefined();
    expect(config.GOOGLE_REFRESH_TOKEN).toBeDefined();
  });
});
