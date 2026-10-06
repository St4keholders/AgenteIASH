"use client";

interface VersionItem {
  id: string;
  version: number;
  status: string;
  created_by: string | null;
  created_at: string;
  published_at: string | null;
}

interface VersionHistoryModalProps {
  versions: VersionItem[];
  onRestore: (versionId: string) => Promise<void>;
  onClose: () => void;
  isRestoring: boolean;
}

export function VersionHistoryModal({
  versions,
  onRestore,
  onClose,
  isRestoring,
}: VersionHistoryModalProps) {
  const formatDate = (isoString: string) => {
    try {
      const d = new Date(isoString);
      return `${d.toLocaleDateString("es-CO")} ${d.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })}`;
    } catch {
      return isoString;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white border border-[#E5E5E5] rounded-[6px] w-full max-w-2xl max-h-[85vh] flex flex-col mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#E5E5E5]">
          <div>
            <h3 className="text-[14px] font-semibold text-[#0A0A0A]">
              Historial de versiones del agente
            </h3>
            <p className="text-[12px] text-[#525252] mt-0.5">
              Consulta versiones anteriores y restaura cualquier configuración como nuevo borrador.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-[13px] text-[#525252] hover:text-[#0A0A0A] px-2 py-1 border border-[#E5E5E5] rounded-[6px]"
          >
            Cerrar
          </button>
        </div>

        {/* Content */}
        <div className="p-5 flex-1 overflow-y-auto">
          {versions.length === 0 ? (
            <div className="text-center py-8 text-[13px] text-[#525252]">
              No hay versiones registradas.
            </div>
          ) : (
            <div className="divide-y divide-[#E5E5E5] border border-[#E5E5E5] rounded-[6px]">
              {versions.map((v) => {
                const isPublished = v.status === "published";
                const isDraft = v.status === "draft";

                return (
                  <div
                    key={v.id}
                    className="flex items-center justify-between p-4 bg-white hover:bg-[#FAFAFA] transition-colors"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-[13px] font-semibold text-[#0A0A0A]">
                          Versión {v.version}
                        </span>
                        <span
                          className={`text-[11px] font-medium px-2 py-0.5 rounded-[6px] border ${
                            isPublished
                              ? "bg-[#F0FDF4] text-[#166534] border-[#BBF7D0]"
                              : isDraft
                              ? "bg-[#FEFCE8] text-[#854D0E] border-[#FEF08A]"
                              : "bg-[#F5F5F5] text-[#525252] border-[#E5E5E5]"
                          }`}
                        >
                          {isPublished
                            ? "Publicado"
                            : isDraft
                            ? "Borrador activo"
                            : "Archivado"}
                        </span>
                      </div>
                      <div className="text-[12px] text-[#525252] mt-1 tabular-nums">
                        {formatDate(v.published_at || v.created_at)} • Autor:{" "}
                        {v.created_by || "Sistema"}
                      </div>
                    </div>

                    {!isDraft && (
                      <button
                        onClick={() => onRestore(v.id)}
                        disabled={isRestoring}
                        className="px-3 py-1.5 text-[12px] font-medium text-[#0A0A0A] bg-white border border-[#E5E5E5] rounded-[6px] hover:bg-[#F5F5F5] disabled:opacity-50"
                      >
                        {isRestoring ? "Restaurando..." : "Restaurar como borrador"}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end px-5 py-3 border-t border-[#E5E5E5] bg-[#FAFAFA]">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-[13px] font-medium text-[#0A0A0A] bg-white border border-[#E5E5E5] rounded-[6px] hover:bg-[#F5F5F5]"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
