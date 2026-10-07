"use client";

import { useState } from "react";
import { X, MessageSquare, Columns3, CheckCircle2, AlertCircle } from "lucide-react";
import Link from "next/link";
import { updateContactAction } from "@/app/dashboard/actions";
import {
  formatContactDisplayName,
  formatContactSubtitle,
} from "@/lib/contacts/format";

export interface ContactDetailData {
  id: string;
  name: string | null;
  username: string | null;
  phone: string | null;
  bsuid: string | null;
  wa_id: string | null;
  email: string | null;
  company: string | null;
  created_at: string;
  conversation_id: string | null;
  lead_id: string | null;
  lead_stage: string | null;
}

interface ContactDetailDrawerProps {
  contact: ContactDetailData | null;
  isOpen: boolean;
  onClose: () => void;
  onContactUpdated: () => void;
}

function ContactForm({
  contact,
  onContactUpdated,
}: {
  contact: ContactDetailData;
  onContactUpdated: () => void;
}) {
  const [name, setName] = useState(contact.name || "");
  const [username, setUsername] = useState(contact.username || "");
  const [phone, setPhone] = useState(contact.phone || "");
  const [email, setEmail] = useState(contact.email || "");
  const [company, setCompany] = useState(contact.company || "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(false);

    try {
      await updateContactAction(contact.id, {
        name: name.trim() || null,
        username: username.trim() || null,
        phone: phone.trim() || null,
        email: email.trim() || null,
        company: company.trim() || null,
      });

      setSuccess(true);
      onContactUpdated();
      setTimeout(() => setSuccess(false), 2500);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error al guardar contacto";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSave} className="flex-1 overflow-y-auto p-4 space-y-4">
      {error && (
        <div className="p-2.5 rounded-[6px] bg-[#FEF2F2] border border-[#FEE2E2] text-[#B91C1C] flex items-center gap-2 text-[12px]">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="p-2.5 rounded-[6px] bg-[#F0FDF4] border border-[#DCFCE7] text-[#15803D] flex items-center gap-2 text-[12px]">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>Contacto actualizado exitosamente.</span>
        </div>
      )}

      <div className="space-y-1">
        <label className="text-[12px] font-medium text-[#525252]">Nombre completo</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ej. Carlos Mendoza"
          className="w-full h-8 px-2.5 text-[13px] bg-[#FAFAFA] border border-[#E5E5E5] rounded-[6px] text-[#0A0A0A] focus:outline-none focus:border-[#0A0A0A] focus:bg-white"
        />
      </div>

      <div className="space-y-1">
        <label className="text-[12px] font-medium text-[#525252]">Username de WhatsApp</label>
        <div className="relative">
          <span className="absolute left-2.5 top-1.5 text-[13px] text-[#A3A3A3]">@</span>
          <input
            type="text"
            value={username.replace(/^@/, "")}
            onChange={(e) => setUsername(e.target.value.replace(/^@/, ""))}
            placeholder="usuario"
            className="w-full h-8 pl-7 pr-2.5 text-[13px] bg-[#FAFAFA] border border-[#E5E5E5] rounded-[6px] text-[#0A0A0A] focus:outline-none focus:border-[#0A0A0A] focus:bg-white"
          />
        </div>
      </div>

      <div className="space-y-1">
        <label className="text-[12px] font-medium text-[#525252]">Teléfono (E.164)</label>
        <input
          type="text"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="Ej. +573001234567"
          className="w-full h-8 px-2.5 text-[13px] bg-[#FAFAFA] border border-[#E5E5E5] rounded-[6px] text-[#0A0A0A] focus:outline-none focus:border-[#0A0A0A] focus:bg-white"
        />
      </div>

      <div className="space-y-1">
        <label className="text-[12px] font-medium text-[#525252]">Correo electrónico</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="cliente@ejemplo.com"
          className="w-full h-8 px-2.5 text-[13px] bg-[#FAFAFA] border border-[#E5E5E5] rounded-[6px] text-[#0A0A0A] focus:outline-none focus:border-[#0A0A0A] focus:bg-white"
        />
      </div>

      <div className="space-y-1">
        <label className="text-[12px] font-medium text-[#525252]">Empresa</label>
        <input
          type="text"
          value={company}
          onChange={(e) => setCompany(e.target.value)}
          placeholder="Nombre de la empresa"
          className="w-full h-8 px-2.5 text-[13px] bg-[#FAFAFA] border border-[#E5E5E5] rounded-[6px] text-[#0A0A0A] focus:outline-none focus:border-[#0A0A0A] focus:bg-white"
        />
      </div>

      {/* Sección técnica / Identidad Meta */}
      <div className="pt-3 border-t border-[#E5E5E5] space-y-2">
        <p className="text-[11px] font-semibold text-[#525252] uppercase tracking-wider">
          Identidad de Meta & Base de Datos
        </p>
        <div className="p-2.5 bg-[#FAFAFA] rounded-[6px] border border-[#E5E5E5] space-y-1.5 text-[11px]">
          <div>
            <span className="text-[#A3A3A3]">ID Contacto: </span>
            <span className="text-[#0A0A0A] break-all">{contact.id}</span>
          </div>
          <div>
            <span className="text-[#A3A3A3]">BSUID: </span>
            <span className="text-[#0A0A0A] break-all">{contact.bsuid || "Ninguno"}</span>
          </div>
          {contact.wa_id && (
            <div>
              <span className="text-[#A3A3A3]">WA ID: </span>
              <span className="text-[#0A0A0A] break-all">{contact.wa_id}</span>
            </div>
          )}
          <div>
            <span className="text-[#A3A3A3]">Registrado: </span>
            <span className="text-[#0A0A0A]">
              {new Date(contact.created_at).toLocaleString("es-CO")}
            </span>
          </div>
        </div>
      </div>

      <div className="pt-2">
        <button
          type="submit"
          disabled={loading}
          className="w-full h-9 rounded-[6px] bg-[#0A0A0A] text-white text-[13px] font-medium hover:bg-[#262626] transition-colors disabled:opacity-40"
        >
          {loading ? "Guardando..." : "Guardar cambios"}
        </button>
      </div>
    </form>
  );
}

export function ContactDetailDrawer({
  contact,
  isOpen,
  onClose,
  onContactUpdated,
}: ContactDetailDrawerProps) {
  if (!isOpen || !contact) return null;

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/30">
      <div className="w-full max-w-[460px] bg-white h-full border-l border-[#E5E5E5] flex flex-col shadow-none">
        {/* Cabecera */}
        <div className="p-4 border-b border-[#E5E5E5] flex items-center justify-between bg-white shrink-0">
          <div>
            <h2 className="text-[15px] font-semibold text-[#0A0A0A]">
              {formatContactDisplayName(contact)}
            </h2>
            <p className="text-[12px] text-[#525252]">
              {formatContactSubtitle(contact)}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-[6px] hover:bg-[#FAFAFA] text-[#525252]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Enlaces directos a Conversación y Lead */}
        <div className="px-4 py-2.5 bg-[#FAFAFA] border-b border-[#E5E5E5] flex items-center gap-2">
          {contact.conversation_id ? (
            <Link
              href={`/dashboard/conversaciones?c=${contact.conversation_id}`}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-[6px] bg-white border border-[#E5E5E5] text-[12px] font-medium text-[#0A0A0A] hover:border-[#0A0A0A] transition-colors"
            >
              <MessageSquare className="w-3.5 h-3.5 text-[#525252]" />
              Ver conversación
            </Link>
          ) : (
            <span className="text-[12px] text-[#A3A3A3] italic">Sin conversación activa</span>
          )}

          {contact.lead_id ? (
            <Link
              href={`/dashboard/pipeline?lead=${contact.lead_id}`}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-[6px] bg-white border border-[#E5E5E5] text-[12px] font-medium text-[#0A0A0A] hover:border-[#0A0A0A] transition-colors"
            >
              <Columns3 className="w-3.5 h-3.5 text-[#525252]" />
              Ver en Pipeline {contact.lead_stage ? `(${contact.lead_stage})` : ""}
            </Link>
          ) : (
            <span className="text-[12px] text-[#A3A3A3] italic">Sin lead asociado</span>
          )}
        </div>

        {/* Formulario con key para reiniciar estado limpiamente */}
        <ContactForm key={contact.id} contact={contact} onContactUpdated={onContactUpdated} />
      </div>
    </div>
  );
}
