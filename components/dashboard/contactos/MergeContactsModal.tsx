"use client";

import { useState, useMemo } from "react";
import { X, AlertTriangle, ArrowRight } from "lucide-react";
import { mergeContactsAction } from "@/app/dashboard/actions";
import {
  formatContactDisplayName,
  formatContactSubtitle,
  formatBsuidShort,
} from "@/lib/contacts/format";

export interface SimpleContactOption {
  id: string;
  name: string | null;
  username: string | null;
  phone: string | null;
  bsuid: string | null;
  company: string | null;
}

interface MergeContactsModalProps {
  contacts: SimpleContactOption[];
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (mergedId: string) => void;
}

export function MergeContactsModal({
  contacts,
  isOpen,
  onClose,
  onSuccess,
}: MergeContactsModalProps) {
  const [primaryId, setPrimaryId] = useState<string>("");
  const [secondaryId, setSecondaryId] = useState<string>("");
  const [searchPrimary, setSearchPrimary] = useState("");
  const [searchSecondary, setSearchSecondary] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const primaryContact = useMemo(
    () => contacts.find((c) => c.id === primaryId),
    [contacts, primaryId]
  );
  const secondaryContact = useMemo(
    () => contacts.find((c) => c.id === secondaryId),
    [contacts, secondaryId]
  );

  const filteredPrimaryOptions = useMemo(() => {
    if (!searchPrimary.trim()) return contacts.slice(0, 50);
    const q = searchPrimary.toLowerCase();
    return contacts
      .filter((c) => {
        return (
          c.name?.toLowerCase().includes(q) ||
          c.username?.toLowerCase().includes(q) ||
          c.phone?.toLowerCase().includes(q) ||
          c.bsuid?.toLowerCase().includes(q) ||
          c.company?.toLowerCase().includes(q)
        );
      })
      .slice(0, 50);
  }, [contacts, searchPrimary]);

  const filteredSecondaryOptions = useMemo(() => {
    if (!searchSecondary.trim()) return contacts.slice(0, 50);
    const q = searchSecondary.toLowerCase();
    return contacts
      .filter((c) => {
        return (
          c.name?.toLowerCase().includes(q) ||
          c.username?.toLowerCase().includes(q) ||
          c.phone?.toLowerCase().includes(q) ||
          c.bsuid?.toLowerCase().includes(q) ||
          c.company?.toLowerCase().includes(q)
        );
      })
      .slice(0, 50);
  }, [contacts, searchSecondary]);

  if (!isOpen) return null;

  async function handleMerge() {
    if (!primaryId || !secondaryId) {
      setError("Debes seleccionar ambos contactos.");
      return;
    }
    if (primaryId === secondaryId) {
      setError("No puedes fusionar un contacto consigo mismo.");
      return;
    }
    if (!confirmed) {
      setError("Debes marcar la casilla de confirmación para proceder.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await mergeContactsAction(primaryId, secondaryId);
      if (res.error) {
        setError(res.error);
      } else {
        onSuccess(primaryId);
        onClose();
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error inesperado al fusionar.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg bg-white rounded-[6px] border border-[#E5E5E5] flex flex-col max-h-[90vh] shadow-none">
        {/* Cabecera */}
        <div className="p-4 border-b border-[#E5E5E5] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="text-[14px] font-semibold text-[#0A0A0A]">
              Fusionar contactos
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-[6px] hover:bg-[#FAFAFA] text-[#525252]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Contenido */}
        <div className="p-4 space-y-4 overflow-y-auto flex-1 text-[13px]">
          {error && (
            <div className="p-2.5 rounded-[6px] bg-[#FEF2F2] border border-[#FEE2E2] text-[#B91C1C] flex items-center gap-2 text-[12px]">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="p-3 bg-[#FAFAFA] border border-[#E5E5E5] rounded-[6px] text-[12px] text-[#525252] space-y-1">
            <p className="font-medium text-[#0A0A0A]">¿Cómo funciona la fusión?</p>
            <p>
              El contacto <strong>principal</strong> conservará su identificador y recibirá
              todas las conversaciones, mensajes, leads y citas del contacto{" "}
              <strong>secundario</strong>. El contacto secundario será eliminado de forma segura.
            </p>
          </div>

          {/* Contacto Principal */}
          <div className="space-y-1.5">
            <label className="font-medium text-[#0A0A0A] block">
              1. Contacto Principal (Conservar)
            </label>
            <input
              type="text"
              value={searchPrimary}
              onChange={(e) => setSearchPrimary(e.target.value)}
              placeholder="Buscar por nombre, username o teléfono..."
              className="w-full h-8 px-2.5 text-[12px] bg-white border border-[#E5E5E5] rounded-[6px] text-[#0A0A0A] focus:outline-none focus:border-[#0A0A0A]"
            />
            <select
              value={primaryId}
              onChange={(e) => setPrimaryId(e.target.value)}
              className="w-full h-8 px-2 text-[12px] bg-white border border-[#E5E5E5] rounded-[6px] text-[#0A0A0A] focus:outline-none focus:border-[#0A0A0A]"
            >
              <option value="">Seleccionar contacto principal...</option>
              {filteredPrimaryOptions.map((c) => (
                <option key={c.id} value={c.id} disabled={c.id === secondaryId}>
                  {formatContactDisplayName(c)} — {formatContactSubtitle(c)} (BSUID: {formatBsuidShort(c.bsuid)})
                </option>
              ))}
            </select>
            {primaryContact && (
              <div className="text-[11px] text-[#525252] bg-[#FAFAFA] p-2 rounded-[6px] border border-[#E5E5E5]">
                Seleccionado: <strong className="text-[#0A0A0A]">{formatContactDisplayName(primaryContact)}</strong> · {formatContactSubtitle(primaryContact)}
              </div>
            )}
          </div>

          <div className="flex justify-center text-[#A3A3A3]">
            <ArrowRight className="w-4 h-4 rotate-90" />
          </div>

          {/* Contacto Secundario */}
          <div className="space-y-1.5">
            <label className="font-medium text-[#0A0A0A] block">
              2. Contacto Secundario (Fusionar y eliminar)
            </label>
            <input
              type="text"
              value={searchSecondary}
              onChange={(e) => setSearchSecondary(e.target.value)}
              placeholder="Buscar por nombre, username o teléfono..."
              className="w-full h-8 px-2.5 text-[12px] bg-white border border-[#E5E5E5] rounded-[6px] text-[#0A0A0A] focus:outline-none focus:border-[#0A0A0A]"
            />
            <select
              value={secondaryId}
              onChange={(e) => setSecondaryId(e.target.value)}
              className="w-full h-8 px-2 text-[12px] bg-white border border-[#E5E5E5] rounded-[6px] text-[#0A0A0A] focus:outline-none focus:border-[#0A0A0A]"
            >
              <option value="">Seleccionar contacto a fusionar...</option>
              {filteredSecondaryOptions.map((c) => (
                <option key={c.id} value={c.id} disabled={c.id === primaryId}>
                  {formatContactDisplayName(c)} — {formatContactSubtitle(c)} (BSUID: {formatBsuidShort(c.bsuid)})
                </option>
              ))}
            </select>
            {secondaryContact && (
              <div className="text-[11px] text-[#525252] bg-[#FAFAFA] p-2 rounded-[6px] border border-[#E5E5E5]">
                Seleccionado: <strong className="text-[#0A0A0A]">{formatContactDisplayName(secondaryContact)}</strong> · {formatContactSubtitle(secondaryContact)}
              </div>
            )}
          </div>

          {/* Confirmación */}
          <div className="pt-2">
            <label className="flex items-start gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
                className="mt-0.5 rounded-[4px] border-[#E5E5E5] text-[#0A0A0A] focus:ring-0"
              />
              <span className="text-[12px] text-[#525252]">
                Confirmo que deseo fusionar permanentemente estos dos contactos y consolidar sus registros.
              </span>
            </label>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-[#E5E5E5] flex items-center justify-end gap-2 bg-white">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-[6px] border border-[#E5E5E5] text-[13px] font-medium text-[#525252] hover:bg-[#FAFAFA] transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleMerge}
            disabled={loading || !primaryId || !secondaryId || !confirmed}
            className="px-3 py-1.5 rounded-[6px] bg-[#0A0A0A] text-white text-[13px] font-medium hover:bg-[#262626] transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
          >
            {loading ? "Fusionando..." : "Confirmar fusión"}
          </button>
        </div>
      </div>
    </div>
  );
}
