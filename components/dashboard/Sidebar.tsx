"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MessageSquare, Columns3, Calendar, Settings, LogOut } from "lucide-react";
import { logoutAction } from "@/app/auth/actions";

interface SidebarProps {
  userEmail?: string;
}

const navItems = [
  {
    name: "Conversaciones",
    href: "/dashboard/conversaciones",
    icon: MessageSquare,
  },
  {
    name: "Pipeline",
    href: "/dashboard/pipeline",
    icon: Columns3,
  },
  {
    name: "Agenda",
    href: "/dashboard/agenda",
    icon: Calendar,
  },
  {
    name: "Agente IA",
    href: "/dashboard/agente",
    icon: Settings,
  },
];

export function Sidebar({ userEmail }: SidebarProps) {
  const pathname = usePathname();

  return (
    <aside className="w-[230px] border-r border-[#E5E5E5] bg-white flex flex-col justify-between shrink-0 h-screen sticky top-0">
      <div>
        <div className="h-14 border-b border-[#E5E5E5] px-5 flex items-center">
          <Link href="/dashboard/conversaciones" className="flex items-center gap-2">
            <span className="text-[16px] font-semibold text-[#0A0A0A] tracking-tight">
              Stakeholders
            </span>
          </Link>
        </div>

        <nav className="p-3 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname.startsWith(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-[6px] text-[13px] font-medium transition-colors ${
                  isActive
                    ? "bg-[#FAFAFA] text-[#0A0A0A] border border-[#E5E5E5]"
                    : "text-[#525252] hover:bg-[#FAFAFA] hover:text-[#0A0A0A]"
                }`}
              >
                <Icon size={16} strokeWidth={1.5} />
                <span>{item.name}</span>
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="p-3 border-t border-[#E5E5E5] bg-[#FAFAFA]">
        <div className="px-2 py-1 mb-2">
          <p className="text-[12px] text-[#A3A3A3] truncate">Usuario</p>
          <p className="text-[13px] font-medium text-[#0A0A0A] truncate">
            {userEmail || "Asesor"}
          </p>
        </div>
        <form action={logoutAction}>
          <button
            type="submit"
            className="w-full flex items-center gap-2 px-2 py-1.5 rounded-[6px] text-[13px] text-[#525252] hover:text-[#B91C1C] hover:bg-white transition-colors"
          >
            <LogOut size={16} strokeWidth={1.5} />
            <span>Cerrar sesión</span>
          </button>
        </form>
      </div>
    </aside>
  );
}
