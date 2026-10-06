/**
 * @vitest-environment node
 */
import { describe, it, expect } from "vitest";
import { createAdminClient } from "@/lib/supabase/server";

describe("Realtime connection from Node", () => {
  it("subscribes to Supabase Realtime channel successfully", async () => {
    const supabase = createAdminClient();

    const statusPromise = new Promise<string>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("Realtime subscription timed out after 15s"));
      }, 15000);

      const channel = supabase
        .channel("node-realtime-test")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "messages" },
          () => {}
        )
        .subscribe((status) => {
          if (status === "SUBSCRIBED" || status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            clearTimeout(timeout);
            resolve(status);
            supabase.removeChannel(channel);
          }
        });
    });

    const status = await statusPromise;
    expect(status).toBe("SUBSCRIBED");
  });
});
