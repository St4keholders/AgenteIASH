"use client";

import { useState } from "react";
import type { AgentConfigData } from "@/lib/agent/prompt";
import {
  saveAgentDraftAction,
  publishAgentConfigAction,
  restoreAgentVersionAction,
  getSystemPromptPreviewAction,
  getAgentVersionHistoryAction,
} from "@/app/dashboard/actions";
import { AgentSimulator } from "./AgentSimulator";
import { PromptPreviewModal } from "./PromptPreviewModal";
import { VersionHistoryModal } from "./VersionHistoryModal";

interface VersionItem {
  id: string;
  version: number;
  status: string;
  created_by: string | null;
  created_at: string;
  published_at: string | null;
}

interface AgentBrainEditorProps {
  initialDraft: AgentConfigData;
  publishedVersion: number;
  draftVersion: number;
  history: VersionItem[];
}

type TabType = "identidad" | "conocimiento" | "embudo" | "reglas" | "horarios";

export function AgentBrainEditor({
  initialDraft,
  publishedVersion,
  draftVersion,
  history,
}: AgentBrainEditorProps) {
  const [config, setConfig] = useState<AgentConfigData>(initialDraft);
  const [activeTab, setActiveTab] = useState<TabType>("identidad");
  const [isSaving, setIsSaving] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [feedback, setFeedback] = useState<{ message: string; type: "success" | "error" } | null>(null);

  // Modals state
  const [showPromptPreview, setShowPromptPreview] = useState(false);
  const [previewPromptText, setPreviewPromptText] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const [versionsList, setVersionsList] = useState<VersionItem[]>(history);
  const [showPublishConfirm, setShowPublishConfirm] = useState(false);

  const showNotification = (message: string, type: "success" | "error" = "success") => {
    setFeedback({ message, type });
    setTimeout(() => setFeedback(null), 4000);
  };

  const handleSaveDraft = async () => {
    setIsSaving(true);
    try {
      await saveAgentDraftAction(config);
      showNotification("Borrador guardado correctamente.");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error guardando el borrador";
      showNotification(msg, "error");
    } finally {
      setIsSaving(false);
    }
  };

  const handlePublish = async () => {
    setIsPublishing(true);
    setShowPublishConfirm(false);
    try {
      const res = await publishAgentConfigAction(config);
      showNotification(`Configuración publicada con éxito (Versión ${res.version}).`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error publicando la configuración";
      showNotification(msg, "error");
    } finally {
      setIsPublishing(false);
    }
  };

  const handleOpenPromptPreview = async () => {
    const prompt = await getSystemPromptPreviewAction(config);
    setPreviewPromptText(prompt);
    setShowPromptPreview(true);
  };

  const handleRestoreVersion = async (versionId: string) => {
    setIsRestoring(true);
    try {
      const res = await restoreAgentVersionAction(versionId);
      setConfig(res.data);
      setShowHistory(false);
      showNotification(`Versión ${res.restoredVersion} restaurada como borrador activo.`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error restaurando versión";
      showNotification(msg, "error");
    } finally {
      setIsRestoring(false);
    }
  };

  // Helper mutations
  const updateIdentidad = (field: keyof AgentConfigData["identidad"], value: unknown) => {
    setConfig((prev) => ({
      ...prev,
      identidad: { ...prev.identidad, [field]: value },
    }));
  };

  const updateConocimiento = (field: keyof AgentConfigData["conocimiento"], value: unknown) => {
    setConfig((prev) => ({
      ...prev,
      conocimiento: { ...prev.conocimiento, [field]: value },
    }));
  };

  const updateReglas = (field: keyof AgentConfigData["reglas"], value: unknown) => {
    setConfig((prev) => ({
      ...prev,
      reglas: { ...prev.reglas, [field]: value },
    }));
  };

  const updateHorarios = (field: keyof AgentConfigData["horarios_citas"], value: unknown) => {
    setConfig((prev) => ({
      ...prev,
      horarios_citas: { ...prev.horarios_citas, [field]: value },
    }));
  };

  const handleOpenHistory = async () => {
    try {
      const fresh = await getAgentVersionHistoryAction();
      setVersionsList(fresh as VersionItem[]);
    } catch {
      // mantener estado actual si falla
    }
    setShowHistory(true);
  };

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Top Header */}
      <div className="px-6 py-4 border-b border-[#E5E5E5] flex flex-wrap items-center justify-between gap-4 bg-[#FAFAFA]">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-[16px] font-semibold text-[#0A0A0A]">
              Editor del Cerebro del Agente
            </h1>
            <span className="text-[11px] font-medium px-2 py-0.5 rounded-[6px] bg-[#F5F5F5] text-[#525252] border border-[#E5E5E5] tabular-nums">
              Borrador v{draftVersion} • Publicado v{publishedVersion}
            </span>
          </div>
          <p className="text-[12px] text-[#525252] mt-0.5">
            Configura tono, servicios, embudo y horarios. Prueba los cambios en el simulador antes de publicar.
          </p>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleOpenPromptPreview}
            className="px-3 py-1.5 text-[12px] font-medium text-[#0A0A0A] bg-white border border-[#E5E5E5] rounded-[6px] hover:bg-[#F5F5F5]"
          >
            Ver System Prompt
          </button>
          <button
            onClick={handleOpenHistory}
            className="px-3 py-1.5 text-[12px] font-medium text-[#0A0A0A] bg-white border border-[#E5E5E5] rounded-[6px] hover:bg-[#F5F5F5]"
          >
            Historial de versiones
          </button>
          <button
            onClick={handleSaveDraft}
            disabled={isSaving}
            className="px-3 py-1.5 text-[12px] font-medium text-[#0A0A0A] bg-white border border-[#E5E5E5] rounded-[6px] hover:bg-[#F5F5F5] disabled:opacity-50"
          >
            {isSaving ? "Guardando..." : "Guardar borrador"}
          </button>
          <button
            onClick={() => setShowPublishConfirm(true)}
            disabled={isPublishing}
            className="px-3.5 py-1.5 text-[12px] font-medium text-white bg-[#0A0A0A] rounded-[6px] hover:bg-[#262626] disabled:opacity-50 transition-colors"
          >
            {isPublishing ? "Publicando..." : "Publicar cambios"}
          </button>
        </div>
      </div>

      {/* Notification banner */}
      {feedback && (
        <div
          className={`px-6 py-2.5 text-[12px] font-medium border-b flex items-center justify-between ${
            feedback.type === "success"
              ? "bg-[#F0FDF4] text-[#166534] border-[#BBF7D0]"
              : "bg-[#FEF2F2] text-[#991B1B] border-[#FECACA]"
          }`}
        >
          <span>{feedback.message}</span>
          <button
            onClick={() => setFeedback(null)}
            className="text-[11px] underline opacity-80 hover:opacity-100"
          >
            Cerrar
          </button>
        </div>
      )}

      {/* Main 2-column layout */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* Left column: Configuration Editor (60%) */}
        <div className="w-full lg:w-[60%] flex flex-col border-r border-[#E5E5E5] overflow-hidden bg-white">
          {/* Tabs bar */}
          <div className="flex border-b border-[#E5E5E5] px-6 bg-white overflow-x-auto">
            <button
              onClick={() => setActiveTab("identidad")}
              className={`py-3 px-3 text-[13px] font-medium border-b-2 whitespace-nowrap transition-colors ${
                activeTab === "identidad"
                  ? "border-[#0A0A0A] text-[#0A0A0A]"
                  : "border-transparent text-[#525252] hover:text-[#0A0A0A]"
              }`}
            >
              Identidad y tono
            </button>
            <button
              onClick={() => setActiveTab("conocimiento")}
              className={`py-3 px-3 text-[13px] font-medium border-b-2 whitespace-nowrap transition-colors ${
                activeTab === "conocimiento"
                  ? "border-[#0A0A0A] text-[#0A0A0A]"
                  : "border-transparent text-[#525252] hover:text-[#0A0A0A]"
              }`}
            >
              Conocimiento del negocio
            </button>
            <button
              onClick={() => setActiveTab("embudo")}
              className={`py-3 px-3 text-[13px] font-medium border-b-2 whitespace-nowrap transition-colors ${
                activeTab === "embudo"
                  ? "border-[#0A0A0A] text-[#0A0A0A]"
                  : "border-transparent text-[#525252] hover:text-[#0A0A0A]"
              }`}
            >
              Embudo de ventas
            </button>
            <button
              onClick={() => setActiveTab("reglas")}
              className={`py-3 px-3 text-[13px] font-medium border-b-2 whitespace-nowrap transition-colors ${
                activeTab === "reglas"
                  ? "border-[#0A0A0A] text-[#0A0A0A]"
                  : "border-transparent text-[#525252] hover:text-[#0A0A0A]"
              }`}
            >
              Reglas y límites
            </button>
            <button
              onClick={() => setActiveTab("horarios")}
              className={`py-3 px-3 text-[13px] font-medium border-b-2 whitespace-nowrap transition-colors ${
                activeTab === "horarios"
                  ? "border-[#0A0A0A] text-[#0A0A0A]"
                  : "border-transparent text-[#525252] hover:text-[#0A0A0A]"
              }`}
            >
              Horarios y citas
            </button>
          </div>

          {/* Tab content area */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {/* TAB 1: IDENTIDAD Y TONO */}
            {activeTab === "identidad" && (
              <div className="space-y-4 max-w-xl">
                <div>
                  <label className="block text-[12px] font-semibold text-[#0A0A0A] mb-1">
                    Nombre del asistente
                  </label>
                  <input
                    type="text"
                    value={config.identidad.nombre}
                    onChange={(e) => updateIdentidad("nombre", e.target.value)}
                    className="w-full px-3 py-2 text-[13px] border border-[#E5E5E5] rounded-[6px] focus:outline-none focus:border-[#0A0A0A]"
                  />
                </div>

                <div>
                  <label className="block text-[12px] font-semibold text-[#0A0A0A] mb-1">
                    Cómo se presenta
                  </label>
                  <textarea
                    rows={2}
                    value={config.identidad.presentacion}
                    onChange={(e) => updateIdentidad("presentacion", e.target.value)}
                    className="w-full px-3 py-2 text-[13px] border border-[#E5E5E5] rounded-[6px] focus:outline-none focus:border-[#0A0A0A]"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[12px] font-semibold text-[#0A0A0A] mb-1">
                      Trato al usuario
                    </label>
                    <select
                      value={config.identidad.trato}
                      onChange={(e) => updateIdentidad("trato", e.target.value as "tu" | "usted")}
                      className="w-full px-3 py-2 text-[13px] border border-[#E5E5E5] rounded-[6px] bg-white focus:outline-none focus:border-[#0A0A0A]"
                    >
                      <option value="tu">Tú (cercano y directo)</option>
                      <option value="usted">Usted (formal y respetuoso)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[12px] font-semibold text-[#0A0A0A] mb-1">
                      Uso de emojis
                    </label>
                    <select
                      value={config.identidad.usar_emojis}
                      onChange={(e) => updateIdentidad("usar_emojis", e.target.value as "no" | "moderado" | "si")}
                      className="w-full px-3 py-2 text-[13px] border border-[#E5E5E5] rounded-[6px] bg-white focus:outline-none focus:border-[#0A0A0A]"
                    >
                      <option value="no">Sin emojis</option>
                      <option value="moderado">Moderado</option>
                      <option value="si">Frecuente</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-[12px] font-semibold text-[#0A0A0A] mb-1">
                    Nivel de formalidad
                  </label>
                  <input
                    type="text"
                    value={config.identidad.formalidad}
                    onChange={(e) => updateIdentidad("formalidad", e.target.value)}
                    placeholder="Ej: Profesional, cálido y conciso"
                    className="w-full px-3 py-2 text-[13px] border border-[#E5E5E5] rounded-[6px] focus:outline-none focus:border-[#0A0A0A]"
                  />
                </div>

                <div>
                  <label className="block text-[12px] font-semibold text-[#0A0A0A] mb-1">
                    Longitud de respuestas
                  </label>
                  <input
                    type="text"
                    value={config.identidad.longitud_maxima}
                    onChange={(e) => updateIdentidad("longitud_maxima", e.target.value)}
                    placeholder="Ej: Breve (máximo 3 párrafos cortos)"
                    className="w-full px-3 py-2 text-[13px] border border-[#E5E5E5] rounded-[6px] focus:outline-none focus:border-[#0A0A0A]"
                  />
                </div>

                <div>
                  <label className="block text-[12px] font-semibold text-[#0A0A0A] mb-1">
                    Firma opcional
                  </label>
                  <input
                    type="text"
                    value={config.identidad.firma || ""}
                    onChange={(e) => updateIdentidad("firma", e.target.value)}
                    placeholder="Ej: Equipo Stakeholders Contadores"
                    className="w-full px-3 py-2 text-[13px] border border-[#E5E5E5] rounded-[6px] focus:outline-none focus:border-[#0A0A0A]"
                  />
                </div>
              </div>
            )}

            {/* TAB 2: CONOCIMIENTO DEL NEGOCIO */}
            {activeTab === "conocimiento" && (
              <div className="space-y-6 max-w-2xl">
                <div>
                  <label className="block text-[12px] font-semibold text-[#0A0A0A] mb-1">
                    Descripción del negocio
                  </label>
                  <textarea
                    rows={4}
                    value={config.conocimiento.descripcion_negocio}
                    onChange={(e) => updateConocimiento("descripcion_negocio", e.target.value)}
                    className="w-full px-3 py-2 text-[13px] border border-[#E5E5E5] rounded-[6px] focus:outline-none focus:border-[#0A0A0A]"
                  />
                </div>

                <div>
                  <label className="block text-[12px] font-semibold text-[#0A0A0A] mb-1">
                    Dirección para citas presenciales
                  </label>
                  <input
                    type="text"
                    value={config.conocimiento.direccion_presencial || ""}
                    onChange={(e) => updateConocimiento("direccion_presencial", e.target.value)}
                    placeholder="Ej: Carrera 43A # 1-50, El Poblado, Medellín, Colombia"
                    className="w-full px-3 py-2 text-[13px] border border-[#E5E5E5] rounded-[6px] focus:outline-none focus:border-[#0A0A0A]"
                  />
                </div>

                {/* Preguntas frecuentes */}
                <div className="pt-4 border-t border-[#E5E5E5]">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-[13px] font-semibold text-[#0A0A0A]">
                      Preguntas frecuentes ({config.conocimiento.preguntas_frecuentes?.length || 0})
                    </h3>
                    <button
                      type="button"
                      onClick={() => {
                        const current = config.conocimiento.preguntas_frecuentes || [];
                        updateConocimiento("preguntas_frecuentes", [
                          ...current,
                          { pregunta: "Nueva pregunta frecuente", respuesta: "Respuesta clara y concisa" },
                        ]);
                      }}
                      className="px-2.5 py-1 text-[12px] font-medium text-[#0A0A0A] border border-[#E5E5E5] rounded-[6px] bg-white hover:bg-[#F5F5F5]"
                    >
                      Agregar pregunta
                    </button>
                  </div>

                  <div className="space-y-3">
                    {(config.conocimiento.preguntas_frecuentes || []).map((faq, idx) => (
                      <div key={idx} className="p-3 border border-[#E5E5E5] rounded-[6px] bg-[#FAFAFA] space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-semibold text-[#525252]">P {idx + 1}</span>
                          <button
                            type="button"
                            onClick={() => {
                              const updated = (config.conocimiento.preguntas_frecuentes || []).filter((_, i) => i !== idx);
                              updateConocimiento("preguntas_frecuentes", updated);
                            }}
                            className="text-[11px] text-[#991B1B] hover:underline"
                          >
                            Eliminar
                          </button>
                        </div>
                        <input
                          type="text"
                          value={faq.pregunta}
                          onChange={(e) => {
                            const updated = [...(config.conocimiento.preguntas_frecuentes || [])];
                            updated[idx] = { ...updated[idx], pregunta: e.target.value };
                            updateConocimiento("preguntas_frecuentes", updated);
                          }}
                          placeholder="Pregunta"
                          className="w-full px-3 py-1.5 text-[12px] bg-white border border-[#E5E5E5] rounded-[6px] focus:outline-none focus:border-[#0A0A0A]"
                        />
                        <textarea
                          rows={2}
                          value={faq.respuesta}
                          onChange={(e) => {
                            const updated = [...(config.conocimiento.preguntas_frecuentes || [])];
                            updated[idx] = { ...updated[idx], respuesta: e.target.value };
                            updateConocimiento("preguntas_frecuentes", updated);
                          }}
                          placeholder="Respuesta"
                          className="w-full px-3 py-1.5 text-[12px] bg-white border border-[#E5E5E5] rounded-[6px] focus:outline-none focus:border-[#0A0A0A]"
                        />
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-[12px] font-semibold text-[#0A0A0A] mb-1">
                    Información adicional libre
                  </label>
                  <textarea
                    rows={3}
                    value={config.conocimiento.informacion_adicional || ""}
                    onChange={(e) => updateConocimiento("informacion_adicional", e.target.value)}
                    placeholder="Notas internas, promociones temporales, contexto de temporada, etc."
                    className="w-full px-3 py-2 text-[13px] border border-[#E5E5E5] rounded-[6px] focus:outline-none focus:border-[#0A0A0A]"
                  />
                </div>
              </div>
            )}

            {/* TAB 3: EMBUDO DE VENTAS */}
            {activeTab === "embudo" && (
              <div className="space-y-4 max-w-2xl">
                <p className="text-[12px] text-[#525252]">
                  Etapas guiadas de conversación que el asistente debe recorrer con cada contacto.
                </p>

                <div className="space-y-3">
                  {config.embudo.etapas.map((etapa, idx) => (
                    <div key={idx} className="p-3 border border-[#E5E5E5] rounded-[6px] bg-[#FAFAFA] space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="text-[12px] font-bold text-[#0A0A0A] tabular-nums">
                          {etapa.orden}.
                        </span>
                        <input
                          type="text"
                          value={etapa.nombre}
                          onChange={(e) => {
                            const updated = [...config.embudo.etapas];
                            updated[idx] = { ...updated[idx], nombre: e.target.value };
                            setConfig((prev) => ({ ...prev, embudo: { etapas: updated } }));
                          }}
                          className="flex-1 px-3 py-1 text-[13px] font-semibold bg-white border border-[#E5E5E5] rounded-[6px] focus:outline-none focus:border-[#0A0A0A]"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-[#525252] mb-0.5">Objetivo de la etapa</label>
                        <input
                          type="text"
                          value={etapa.objetivo}
                          onChange={(e) => {
                            const updated = [...config.embudo.etapas];
                            updated[idx] = { ...updated[idx], objetivo: e.target.value };
                            setConfig((prev) => ({ ...prev, embudo: { etapas: updated } }));
                          }}
                          className="w-full px-3 py-1.5 text-[12px] bg-white border border-[#E5E5E5] rounded-[6px] focus:outline-none focus:border-[#0A0A0A]"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* TAB 4: REGLAS Y LÍMITES */}
            {activeTab === "reglas" && (
              <div className="space-y-6 max-w-2xl">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-[12px] font-semibold text-[#0A0A0A]">
                      Prohibiciones estrictas
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        updateReglas("prohibiciones", [...config.reglas.prohibiciones, "Nueva prohibición"]);
                      }}
                      className="px-2.5 py-1 text-[12px] font-medium text-[#0A0A0A] border border-[#E5E5E5] rounded-[6px] bg-white hover:bg-[#F5F5F5]"
                    >
                      Agregar prohibición
                    </button>
                  </div>

                  <div className="space-y-2">
                    {config.reglas.prohibiciones.map((prohibicion, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <input
                          type="text"
                          value={prohibicion}
                          onChange={(e) => {
                            const updated = [...config.reglas.prohibiciones];
                            updated[idx] = e.target.value;
                            updateReglas("prohibiciones", updated);
                          }}
                          className="flex-1 px-3 py-1.5 text-[12px] border border-[#E5E5E5] rounded-[6px] focus:outline-none focus:border-[#0A0A0A]"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const updated = config.reglas.prohibiciones.filter((_, i) => i !== idx);
                            updateReglas("prohibiciones", updated);
                          }}
                          className="px-2 py-1 text-[11px] text-[#991B1B] border border-[#E5E5E5] rounded-[6px] hover:bg-[#FEF2F2]"
                        >
                          Eliminar
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-[12px] font-semibold text-[#0A0A0A] mb-1">
                    Escalamiento a humano
                  </label>
                  <textarea
                    rows={3}
                    value={config.reglas.escalamiento_humano}
                    onChange={(e) => updateReglas("escalamiento_humano", e.target.value)}
                    className="w-full px-3 py-2 text-[13px] border border-[#E5E5E5] rounded-[6px] focus:outline-none focus:border-[#0A0A0A]"
                  />
                </div>

                <div>
                  <label className="block text-[12px] font-semibold text-[#0A0A0A] mb-1">
                    Tratamiento de temas ajenos
                  </label>
                  <textarea
                    rows={3}
                    value={config.reglas.temas_ajenos}
                    onChange={(e) => updateReglas("temas_ajenos", e.target.value)}
                    className="w-full px-3 py-2 text-[13px] border border-[#E5E5E5] rounded-[6px] focus:outline-none focus:border-[#0A0A0A]"
                  />
                </div>
              </div>
            )}

            {/* TAB 5: HORARIOS Y CITAS */}
            {activeTab === "horarios" && (
              <div className="space-y-4 max-w-xl">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[12px] font-semibold text-[#0A0A0A] mb-1">
                      Hora inicio atención
                    </label>
                    <input
                      type="text"
                      value={config.horarios_citas.hora_inicio_laboral}
                      onChange={(e) => updateHorarios("hora_inicio_laboral", e.target.value)}
                      placeholder="07:00"
                      className="w-full px-3 py-2 text-[13px] tabular-nums border border-[#E5E5E5] rounded-[6px] focus:outline-none focus:border-[#0A0A0A]"
                    />
                  </div>

                  <div>
                    <label className="block text-[12px] font-semibold text-[#0A0A0A] mb-1">
                      Hora fin atención
                    </label>
                    <input
                      type="text"
                      value={config.horarios_citas.hora_fin_laboral}
                      onChange={(e) => updateHorarios("hora_fin_laboral", e.target.value)}
                      placeholder="19:00"
                      className="w-full px-3 py-2 text-[13px] tabular-nums border border-[#E5E5E5] rounded-[6px] focus:outline-none focus:border-[#0A0A0A]"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[12px] font-semibold text-[#0A0A0A] mb-1">
                      Duración de la cita (minutos)
                    </label>
                    <input
                      type="number"
                      value={config.horarios_citas.duracion_minutos}
                      onChange={(e) => updateHorarios("duracion_minutos", parseInt(e.target.value, 10) || 30)}
                      className="w-full px-3 py-2 text-[13px] tabular-nums border border-[#E5E5E5] rounded-[6px] focus:outline-none focus:border-[#0A0A0A]"
                    />
                  </div>

                  <div>
                    <label className="block text-[12px] font-semibold text-[#0A0A0A] mb-1">
                      Anticipación mínima (horas)
                    </label>
                    <input
                      type="number"
                      value={config.horarios_citas.anticipacion_minima_horas}
                      onChange={(e) => updateHorarios("anticipacion_minima_horas", parseInt(e.target.value, 10) || 2)}
                      className="w-full px-3 py-2 text-[13px] tabular-nums border border-[#E5E5E5] rounded-[6px] focus:outline-none focus:border-[#0A0A0A]"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[12px] font-semibold text-[#0A0A0A] mb-1">
                      Máximo días adelante
                    </label>
                    <input
                      type="number"
                      value={config.horarios_citas.maximo_dias_adelanto}
                      onChange={(e) => updateHorarios("maximo_dias_adelanto", parseInt(e.target.value, 10) || 30)}
                      className="w-full px-3 py-2 text-[13px] tabular-nums border border-[#E5E5E5] rounded-[6px] focus:outline-none focus:border-[#0A0A0A]"
                    />
                  </div>

                  <div>
                    <label className="block text-[12px] font-semibold text-[#0A0A0A] mb-1">
                      Opciones por día a ofrecer
                    </label>
                    <input
                      type="number"
                      value={config.horarios_citas.max_opciones_ofrecer_por_dia}
                      onChange={(e) => updateHorarios("max_opciones_ofrecer_por_dia", parseInt(e.target.value, 10) || 3)}
                      className="w-full px-3 py-2 text-[13px] tabular-nums border border-[#E5E5E5] rounded-[6px] focus:outline-none focus:border-[#0A0A0A]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[12px] font-semibold text-[#0A0A0A] mb-2">
                    Modalidades habilitadas
                  </label>
                  <div className="flex items-center gap-6">
                    <label className="flex items-center gap-2 text-[13px] text-[#0A0A0A] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={config.horarios_citas.modalidades.includes("virtual")}
                        onChange={(e) => {
                          const current = config.horarios_citas.modalidades;
                          const updated = e.target.checked
                            ? [...current, "virtual"]
                            : current.filter((m) => m !== "virtual");
                          updateHorarios("modalidades", updated);
                        }}
                        className="rounded border-[#E5E5E5] text-[#0A0A0A] focus:ring-0"
                      />
                      <span>Virtual (Google Meet)</span>
                    </label>

                    <label className="flex items-center gap-2 text-[13px] text-[#0A0A0A] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={config.horarios_citas.modalidades.includes("presencial")}
                        onChange={(e) => {
                          const current = config.horarios_citas.modalidades;
                          const updated = e.target.checked
                            ? [...current, "presencial"]
                            : current.filter((m) => m !== "presencial");
                          updateHorarios("modalidades", updated);
                        }}
                        className="rounded border-[#E5E5E5] text-[#0A0A0A] focus:ring-0"
                      />
                      <span>Presencial (Medellín)</span>
                    </label>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right column: Simulator (40%) */}
        <div className="w-full lg:w-[40%] flex flex-col p-4 bg-[#FAFAFA]">
          <AgentSimulator draftConfig={config} />
        </div>
      </div>

      {/* Modals */}
      {showPromptPreview && (
        <PromptPreviewModal
          prompt={previewPromptText}
          onClose={() => setShowPromptPreview(false)}
        />
      )}

      {showHistory && (
        <VersionHistoryModal
          versions={versionsList}
          onRestore={handleRestoreVersion}
          onClose={() => setShowHistory(false)}
          isRestoring={isRestoring}
        />
      )}

      {/* Confirm Publish Dialog */}
      {showPublishConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white border border-[#E5E5E5] rounded-[6px] w-full max-w-md p-5 mx-4">
            <h3 className="text-[14px] font-semibold text-[#0A0A0A]">
              ¿Publicar cambios del agente?
            </h3>
            <p className="text-[12px] text-[#525252] mt-2 leading-relaxed">
              Esta acción incrementará la versión publicada. Todos los nuevos mensajes entrantes de WhatsApp responderán inmediatamente usando esta nueva configuración.
            </p>
            <div className="flex justify-end gap-2 mt-5">
              <button
                onClick={() => setShowPublishConfirm(false)}
                className="px-3 py-1.5 text-[12px] font-medium text-[#0A0A0A] bg-white border border-[#E5E5E5] rounded-[6px] hover:bg-[#F5F5F5]"
              >
                Cancelar
              </button>
              <button
                onClick={handlePublish}
                disabled={isPublishing}
                className="px-3.5 py-1.5 text-[12px] font-medium text-white bg-[#0A0A0A] rounded-[6px] hover:bg-[#262626] disabled:opacity-50"
              >
                {isPublishing ? "Publicando..." : "Confirmar y Publicar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
