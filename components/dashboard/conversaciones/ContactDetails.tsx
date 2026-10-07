"use client";

import { useState } from "react";
import {
  updateContactAction,
  toggleConversationBotAction,
  resolveHumanHandoffAction,
} from "@/app/dashboard/actions";
import { formatDateBogota, formatTimeBogota } from "@/lib/calendar/availability";
import { ExternalLink, Check } from "lucide-react";

export interface ContactDetailsData {
  id: string;
  wa_id: string;
  phone: string | null;
  bsuid?: string | null;
  name: string | null;
  email: string | null;
  company: string | null;
}

export interface LeadDetailsData {
  id: string;
  stage_name: string;
  service_interest: string | null;
  temperature: string | null;
  invoices_per_month: number | null;
  suggested_plan: string | null;
  summary: string | null;
}

export interface AppointmentDetailsData {
  id: string;
  service: string;
  start_at: string;
  modality: string;
  meet_link: string | null;
  status: string;
}

interface ContactDetailsProps {
  conversationId: string;
  botEnabled: boolean;
  needsHuman: boolean;
  contact: ContactDetailsData;
  lead?: LeadDetailsData | null;
  appointments: AppointmentDetailsData[];
  onContactUpdated?: () => void;
  onBotToggled?: (newStatus: boolean) => void;
  onHumanResolved?: () => void;
}

export function ContactDetails({
  conversationId,
  botEnabled,
  needsHuman,
  contact,
  lead,
  appointments,
  onContactUpdated,
  onBotToggled,
  onHumanResolved,
}: ContactDetailsProps) {
  const [name, setName] = useState(contact.name || "");
  const [email, setEmail] = useState(contact.email || "");
  const [company, setCompany] = useState(contact.company || "");
  const [savingContact, setSavingContact] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [botStatus, setBotStatus] = useState(botEnabled);
  const [resolvingHuman, setResolvingHuman] = useState(false);

  async function handleSaveContact(e: React.FormEvent) {
    e.preventDefault();
    setSavingContact(true);
    setSavedSuccess(false);

    try {
      await updateContactAction(contact.id, { name, email, company });
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 2000);
      onContactUpdated?.();
    } catch (err) {
      console.error("Error saving contact:", err);
    } finally {
      setSavingContact(false);
    }
  }

  async function handleToggleBot() {
    const nextStatus = !botStatus;
    setBotStatus(nextStatus);
    try {
      await toggleConversationBotAction(conversationId, nextStatus);
      onBotToggled?.(nextStatus);
    } catch (err) {
      setBotStatus(!nextStatus);
      console.error("Error toggling bot in conversation:", err);
    }
  }

  async function handleResolveHuman() {
    setResolvingHuman(true);
    try {
      await resolveHumanHandoffAction(conversationId);
      onHumanResolved?.();
    } catch (err) {
      console.error("Error resolving human handoff:", err);
    } finally {
      setResolvingHuman(false);
    }
  }

  return (
    <div className="w-[300px] border-l border-[#E5E5E5] flex flex-col h-full bg-[#FAFAFA] shrink-0 overflow-y-auto">
      {/* Controles del bot y humano */}
      <div className="p-4 border-b border-[#E5E5E5] bg-white space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-[13px] font-medium text-[#0A0A0A]">
            Bot en este chat
          </span>
          <button
            type="button"
            onClick={handleToggleBot}
            aria-pressed={botStatus}
            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${
              botStatus ? "bg-[#0A0A0A]" : "bg-[#E5E5E5]"
            }`}
          >
            <span
              className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                botStatus ? "translate-x-4" : "translate-x-1"
              }`}
            />
          </button>
        </div>

        {needsHuman && (
          <div className="p-2.5 rounded-[6px] bg-[#FFFBEB] border border-[#FDE68A] space-y-2">
            <p className="text-[12px] text-[#B45309]">
              Este chat requiere atención de un asesor humano.
            </p>
            <button
              type="button"
              disabled={resolvingHuman}
              onClick={handleResolveHuman}
              className="w-full h-7 bg-white border border-[#FDE68A] rounded-[6px] text-[12px] font-medium text-[#B45309] hover:bg-[#FFFBEB] transition-colors"
            >
              {resolvingHuman ? "Marcando..." : "Marcar como resuelto"}
            </button>
          </div>
        )}
      </div>

      {/* Ficha de datos editables del contacto */}
      <form onSubmit={handleSaveContact} className="p-4 border-b border-[#E5E5E5] bg-white space-y-3">
        <h3 className="text-[13px] font-semibold text-[#0A0A0A]">
          Datos del contacto
        </h3>

        <div>
          <label className="block text-[11px] font-medium text-[#525252] mb-1">
            Nombre
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Sin nombre registrado"
            className="w-full h-8 px-2 text-[12px] bg-white border border-[#E5E5E5] rounded-[6px] text-[#0A0A0A] focus:outline-none focus:border-[#0A0A0A]"
          />
        </div>

        <div>
          <label className="block text-[11px] font-medium text-[#525252] mb-1">
            Teléfono o ID
          </label>
          <input
            type="text"
            value={
              contact.phone
                ? contact.phone
                : contact.name
                ? `Usuario de WhatsApp (${contact.name})`
                : "Usuario de WhatsApp"
            }
            title={contact.bsuid || contact.wa_id}
            disabled
            className="w-full h-8 px-2 text-[12px] bg-[#FAFAFA] border border-[#E5E5E5] rounded-[6px] text-[#525252]"
          />
        </div>

        <div>
          <label className="block text-[11px] font-medium text-[#525252] mb-1">
            Correo electrónico
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="correo@ejemplo.com"
            className="w-full h-8 px-2 text-[12px] bg-white border border-[#E5E5E5] rounded-[6px] text-[#0A0A0A] focus:outline-none focus:border-[#0A0A0A]"
          />
        </div>

        <div>
          <label className="block text-[11px] font-medium text-[#525252] mb-1">
            Empresa
          </label>
          <input
            type="text"
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            placeholder="Empresa o negocio"
            className="w-full h-8 px-2 text-[12px] bg-white border border-[#E5E5E5] rounded-[6px] text-[#0A0A0A] focus:outline-none focus:border-[#0A0A0A]"
          />
        </div>

        <button
          type="submit"
          disabled={savingContact}
          className="w-full h-8 bg-[#0A0A0A] text-white text-[12px] font-medium rounded-[6px] hover:bg-[#262626] transition-colors flex items-center justify-center gap-1.5"
        >
          {savedSuccess && <Check size={14} strokeWidth={1.5} />}
          <span>{savingContact ? "Guardando..." : savedSuccess ? "Guardado" : "Guardar cambios"}</span>
        </button>
      </form>

      {/* Información del Lead */}
      {lead && (
        <div className="p-4 border-b border-[#E5E5E5] bg-white space-y-2">
          <h3 className="text-[13px] font-semibold text-[#0A0A0A]">
            Estado comercial (Lead)
          </h3>

          <div className="flex items-center justify-between text-[12px]">
            <span className="text-[#525252]">Etapa:</span>
            <span className="font-medium text-[#0A0A0A] px-2 py-0.5 rounded-[6px] bg-[#FAFAFA] border border-[#E5E5E5]">
              {lead.stage_name}
            </span>
          </div>

          {lead.service_interest && (
            <div className="flex items-center justify-between text-[12px]">
              <span className="text-[#525252]">Interés:</span>
              <span className="text-[#0A0A0A] text-right truncate max-w-[150px]">
                {lead.service_interest}
              </span>
            </div>
          )}

          {lead.temperature && (
            <div className="flex items-center justify-between text-[12px]">
              <span className="text-[#525252]">Temperatura:</span>
              <span
                className={`px-1.5 py-0.5 rounded-[6px] text-[11px] font-medium ${
                  lead.temperature === "caliente"
                    ? "bg-[#FEF2F2] text-[#B91C1C]"
                    : lead.temperature === "tibio"
                    ? "bg-[#FFFBEB] text-[#B45309]"
                    : "bg-[#FAFAFA] text-[#525252]"
                }`}
              >
                {lead.temperature}
              </span>
            </div>
          )}

          {lead.summary && (
            <div className="mt-2 text-[12px] text-[#525252] bg-[#FAFAFA] p-2 rounded-[6px] border border-[#E5E5E5]">
              <p className="font-medium text-[#0A0A0A] mb-0.5 text-[11px]">Resumen IA:</p>
              <p className="leading-relaxed">{lead.summary}</p>
            </div>
          )}
        </div>
      )}

      {/* Citas del contacto */}
      <div className="p-4 bg-white flex-1 space-y-3">
        <h3 className="text-[13px] font-semibold text-[#0A0A0A]">
          Citas de diagnóstico
        </h3>

        {appointments.length === 0 ? (
          <p className="text-[12px] text-[#A3A3A3]">
            No hay citas registradas para este contacto.
          </p>
        ) : (
          <div className="space-y-2">
            {appointments.map((app) => {
              const appDate = new Date(app.start_at);
              return (
                <div
                  key={app.id}
                  className="p-2.5 rounded-[6px] border border-[#E5E5E5] bg-[#FAFAFA] text-[12px] space-y-1.5"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-[#0A0A0A]">
                      {app.service}
                    </span>
                    <span
                      className={`text-[10px] font-medium px-1.5 py-0.2 rounded-[6px] ${
                        app.status === "scheduled" || app.status === "rescheduled"
                          ? "bg-[#F0FDF4] text-[#15803D]"
                          : app.status === "cancelled"
                          ? "bg-[#FEF2F2] text-[#B91C1C]"
                          : "bg-[#FAFAFA] text-[#525252]"
                      }`}
                    >
                      {app.status}
                    </span>
                  </div>

                  <p className="text-[#525252] tabular-nums">
                    {formatDateBogota(appDate)}, {formatTimeBogota(appDate)}
                  </p>

                  <div className="flex items-center justify-between text-[11px] pt-1">
                    <span className="text-[#A3A3A3]">
                      {app.modality === "virtual" ? "Virtual (Meet)" : "Presencial (Medellín)"}
                    </span>

                    {app.meet_link && (
                      <a
                        href={app.meet_link}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[#0A0A0A] hover:underline flex items-center gap-0.5 font-medium"
                      >
                        <span>Meet</span>
                        <ExternalLink size={11} strokeWidth={1.5} />
                      </a>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
