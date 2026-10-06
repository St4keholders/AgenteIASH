import { describe, it, expect, afterAll } from "vitest";
import { GET, POST } from "@/app/api/webhooks/whatsapp/route";
import { NextRequest } from "next/server";
import crypto from "crypto";
import { getConfig } from "@/lib/config";
import { createAdminClient } from "@/lib/supabase/server";

describe("WhatsApp Webhook Endpoint", () => {
  const config = getConfig();
  const supabase = createAdminClient();
  const testWaIds = ["TEST-webhook-user-1", "TEST-bsuid-user-2"];

  afterAll(async () => {
    // Limpieza de datos de prueba
    for (const waId of testWaIds) {
      await supabase.from("contacts").delete().eq("wa_id", waId);
    }
  });

  it("verifies GET challenge with valid verify token", async () => {
    const url = `http://localhost:3000/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=${config.WHATSAPP_VERIFY_TOKEN}&hub.challenge=11223344`;
    const req = new NextRequest(url);
    const res = await GET(req);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toBe("11223344");
  });

  it("rejects GET request with invalid verify token", async () => {
    const url = `http://localhost:3000/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=wrong_token&hub.challenge=11223344`;
    const req = new NextRequest(url);
    const res = await GET(req);
    expect(res.status).toBe(403);
  });

  it("rejects POST request with invalid or missing HMAC signature", async () => {
    const payload = JSON.stringify({ object: "whatsapp_business_account" });
    const req = new NextRequest("http://localhost:3000/api/webhooks/whatsapp", {
      method: "POST",
      headers: {
        "x-hub-signature-256": "sha256=invalidhash12345",
        "content-type": "application/json",
      },
      body: payload,
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("accepts valid HMAC signature and returns 200", async () => {
    const payload = JSON.stringify({
      object: "whatsapp_business_account",
      entry: [],
    });
    const signature = `sha256=${crypto
      .createHmac("sha256", config.META_APP_SECRET)
      .update(payload)
      .digest("hex")}`;

    const req = new NextRequest("http://localhost:3000/api/webhooks/whatsapp", {
      method: "POST",
      headers: {
        "x-hub-signature-256": signature,
        "content-type": "application/json",
      },
      body: payload,
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
  });

  it("processes incoming message and handles BSUID identifier", async () => {
    const bsuid = "TEST-bsuid-user-2";
    const wamid = `wamid.TEST_${Date.now()}`;
    const payload = JSON.stringify({
      object: "whatsapp_business_account",
      entry: [
        {
          id: "WABA_ID",
          changes: [
            {
              field: "messages",
              value: {
                messaging_product: "whatsapp",
                contacts: [{ profile: { name: "Test BSUID User" }, wa_id: bsuid }],
                messages: [
                  {
                    from: bsuid,
                    id: wamid,
                    timestamp: String(Math.floor(Date.now() / 1000)),
                    type: "text",
                    text: { body: "Hola desde BSUID" },
                  },
                ],
              },
            },
          ],
        },
      ],
    });

    const signature = `sha256=${crypto
      .createHmac("sha256", config.META_APP_SECRET)
      .update(payload)
      .digest("hex")}`;

    const req = new NextRequest("http://localhost:3000/api/webhooks/whatsapp", {
      method: "POST",
      headers: {
        "x-hub-signature-256": signature,
        "content-type": "application/json",
      },
      body: payload,
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
  });
});
