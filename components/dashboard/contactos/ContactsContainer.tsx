"use client";

import { useState, useMemo } from "react";
import { Search, Merge } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  formatContactDisplayName,
  formatBsuidShort,
} from "@/lib/contacts/format";
import { ContactDetailDrawer, ContactDetailData } from "./ContactDetailDrawer";
import { MergeContactsModal, SimpleContactOption } from "./MergeContactsModal";

export interface ContactRowItem {
  id: string;
  name: string | null;
  username: string | null;
  phone: string | null;
  bsuid: string | null;
  wa_id: string | null;
  email: string | null;
  company: string | null;
  created_at: string;
  updated_at: string;
  conversation_count: number;
  conversation_id: string | null;
  lead_id: string | null;
  lead_stage: string | null;
  last_message?: {
    body: string | null;
    transcript: string | null;
    created_at: string;
  } | null;
}

interface ContactsContainerProps {
  initialContacts: ContactRowItem[];
}

export function ContactsContainer({ initialContacts }: ContactsContainerProps) {
  const router = useRouter();
  const contacts = initialContacts;
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedContact, setSelectedContact] = useState<ContactDetailData | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isMergeOpen, setIsMergeOpen] = useState(false);

  const filteredContacts = useMemo(() => {
    if (!searchQuery.trim()) return contacts;
    const q = searchQuery.toLowerCase().trim();

    return contacts.filter((c) => {
      const name = (c.name || "").toLowerCase();
      const username = (c.username || "").toLowerCase();
      const phone = (c.phone || "").toLowerCase();
      const bsuid = (c.bsuid || "").toLowerCase();
      const bsuidShort = formatBsuidShort(c.bsuid).toLowerCase();
      const leadStage = (c.lead_stage || "").toLowerCase();
      const company = (c.company || "").toLowerCase();
      const lastMsg = (c.last_message?.body || c.last_message?.transcript || "").toLowerCase();

      return (
        name.includes(q) ||
        username.includes(q) ||
        phone.includes(q) ||
        bsuid.includes(q) ||
        bsuidShort.includes(q) ||
        leadStage.includes(q) ||
        company.includes(q) ||
        lastMsg.includes(q)
      );
    });
  }, [contacts, searchQuery]);

  const simpleContactOptions: SimpleContactOption[] = useMemo(() => {
    return contacts.map((c) => ({
      id: c.id,
      name: c.name,
      username: c.username,
      phone: c.phone,
      bsuid: c.bsuid,
      company: c.company,
    }));
  }, [contacts]);

  function handleRowClick(c: ContactRowItem) {
    setSelectedContact({
      id: c.id,
      name: c.name,
      username: c.username,
      phone: c.phone,
      bsuid: c.bsuid,
      wa_id: c.wa_id,
      email: c.email,
      company: c.company,
      created_at: c.created_at,
      conversation_id: c.conversation_id,
      lead_id: c.lead_id,
      lead_stage: c.lead_stage,
    });
    setIsDrawerOpen(true);
  }

  function handleContactUpdated() {
    router.refresh();
  }

  function handleMerged() {
    router.refresh();
  }

  return (
    <div className="flex-1 flex flex-col h-[calc(100vh-56px)] bg-white overflow-hidden">
      {/* Barra superior de herramientas */}
      <div className="p-4 border-b border-[#E5E5E5] flex items-center justify-between gap-3 bg-white shrink-0">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-[#A3A3A3]" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar por nombre, @username, teléfono, BSUID o etapa..."
            className="w-full h-9 pl-9 pr-3 text-[13px] bg-[#FAFAFA] border border-[#E5E5E5] rounded-[6px] text-[#0A0A0A] placeholder-[#A3A3A3] focus:outline-none focus:border-[#0A0A0A] focus:bg-white"
          />
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsMergeOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-[6px] border border-[#E5E5E5] bg-white text-[13px] font-medium text-[#0A0A0A] hover:bg-[#FAFAFA] transition-colors"
          >
            <Merge className="w-4 h-4 text-[#525252]" />
            Fusionar contactos
          </button>
        </div>
      </div>

      {/* Tabla de contactos */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-left border-collapse text-[13px]">
          <thead className="bg-[#FAFAFA] border-b border-[#E5E5E5] sticky top-0 z-10 text-[12px] text-[#525252] font-medium">
            <tr>
              <th className="py-2.5 px-4 font-medium">Contacto</th>
              <th className="py-2.5 px-3 font-medium">Username</th>
              <th className="py-2.5 px-3 font-medium">Teléfono</th>
              <th className="py-2.5 px-3 font-medium">BSUID</th>
              <th className="py-2.5 px-3 font-medium">Etapa Lead</th>
              <th className="py-2.5 px-3 font-medium">Último mensaje</th>
              <th className="py-2.5 px-3 font-medium text-right tabular-nums">Convs.</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E5E5E5]">
            {filteredContacts.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-8 text-center text-[#A3A3A3] text-[13px]">
                  No se encontraron contactos.
                </td>
              </tr>
            ) : (
              filteredContacts.map((c) => {
                const displayName = formatContactDisplayName(c);
                const phoneText = c.phone || "Sin teléfono";
                const bsuidShort = formatBsuidShort(c.bsuid);
                const lastMsg = c.last_message?.transcript || c.last_message?.body || "—";

                return (
                  <tr
                    key={c.id}
                    onClick={() => handleRowClick(c)}
                    className="hover:bg-[#FAFAFA] cursor-pointer transition-colors group"
                  >
                    <td className="py-2.5 px-4">
                      <div className="font-medium text-[#0A0A0A] group-hover:underline flex items-center gap-2">
                        <span>{displayName}</span>
                        {c.company && (
                          <span className="text-[11px] text-[#525252] font-normal">
                            ({c.company})
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-[#525252]">
                      {c.username ? `@${c.username}` : <span className="text-[#A3A3A3]">—</span>}
                    </td>
                    <td className="py-2.5 px-3 text-[#525252] tabular-nums">
                      {c.phone ? (
                        <span>{c.phone}</span>
                      ) : (
                        <span className="text-[#A3A3A3] italic">{phoneText}</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-[#525252] text-[11px] tabular-nums">
                      {bsuidShort}
                    </td>
                    <td className="py-2.5 px-3">
                      {c.lead_stage ? (
                        <span className="inline-block px-2 py-0.5 rounded-[6px] text-[11px] font-medium bg-[#FAFAFA] border border-[#E5E5E5] text-[#0A0A0A]">
                          {c.lead_stage}
                        </span>
                      ) : (
                        <span className="text-[12px] text-[#A3A3A3]">—</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-[#525252] max-w-[260px] truncate">
                      {lastMsg}
                    </td>
                    <td className="py-2.5 px-3 text-right text-[#0A0A0A] font-medium tabular-nums">
                      {c.conversation_count}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Drawer de Detalle */}
      <ContactDetailDrawer
        contact={selectedContact}
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        onContactUpdated={handleContactUpdated}
      />

      {/* Modal de Fusión */}
      <MergeContactsModal
        contacts={simpleContactOptions}
        isOpen={isMergeOpen}
        onClose={() => setIsMergeOpen(false)}
        onSuccess={handleMerged}
      />
    </div>
  );
}
