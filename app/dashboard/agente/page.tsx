import { createAdminClient } from "@/lib/supabase/server";
import { getPublishedConfig, getDraftConfig, type AgentConfigData } from "@/lib/agent/prompt";
import { AgentBrainEditor } from "@/components/dashboard/agente/AgentBrainEditor";

export const dynamic = "force-dynamic";

export default async function AgentePage() {
  const supabase = createAdminClient();
  const published = await getPublishedConfig(supabase);
  const draft = await getDraftConfig(supabase);

  const initialDraft: AgentConfigData = draft ? draft.data : published.data;
  const draftVersion = draft ? draft.version : published.version + 1;

  const { data: rawHistory } = await supabase
    .from("agent_configs")
    .select("id, version, status, created_by, created_at, published_at")
    .order("version", { ascending: false });

  const history = rawHistory || [];

  return (
    <div className="flex-1 flex flex-col h-full bg-white overflow-hidden">
      <AgentBrainEditor
        initialDraft={initialDraft}
        publishedVersion={published.version}
        draftVersion={draftVersion}
        history={history}
      />
    </div>
  );
}
