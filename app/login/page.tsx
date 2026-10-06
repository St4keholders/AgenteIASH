"use client";

import { useState, Suspense } from "react";
import { loginAction } from "@/app/auth/actions";
import { useSearchParams } from "next/navigation";

function LoginForm() {
  const searchParams = useSearchParams();
  const next = searchParams.get("next") || "/dashboard/conversaciones";
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    formData.set("next", next);

    try {
      const res = await loginAction(formData);
      if (res?.error) {
        setError(res.error);
        setLoading(false);
      }
    } catch {
      // Si Next.js redirige, signInWithPassword lanzará el NEXT_REDIRECT esperado
    }
  }

  return (
    <main className="min-h-screen bg-white flex flex-col justify-center items-center p-4">
      <div className="w-full max-w-[360px] p-8 border border-[#E5E5E5] rounded-[6px] bg-white">
        <div className="mb-6 text-center">
          <h1 className="text-[20px] font-semibold text-[#0A0A0A] tracking-tight">
            Stakeholders
          </h1>
          <p className="text-[13px] text-[#525252] mt-1">
            Panel de control interno
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-[6px] bg-[#FEF2F2] border border-[#FCA5A5] text-[13px] text-[#B91C1C]">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="email"
              className="block text-[13px] font-medium text-[#0A0A0A] mb-1"
            >
              Correo electrónico
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              placeholder="nombre@stakeholders.com"
              className="w-full h-9 px-3 text-[14px] bg-white border border-[#E5E5E5] rounded-[6px] text-[#0A0A0A] placeholder-[#A3A3A3] focus:outline-none focus:border-[#0A0A0A]"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="block text-[13px] font-medium text-[#0A0A0A] mb-1"
            >
              Contraseña
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
              placeholder="••••••••"
              className="w-full h-9 px-3 text-[14px] bg-white border border-[#E5E5E5] rounded-[6px] text-[#0A0A0A] placeholder-[#A3A3A3] focus:outline-none focus:border-[#0A0A0A]"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full h-9 mt-2 bg-[#0A0A0A] text-white text-[13px] font-medium rounded-[6px] hover:bg-[#262626] disabled:opacity-50 transition-colors"
          >
            {loading ? "Iniciando sesión..." : "Iniciar sesión"}
          </button>
        </form>

        <p className="text-center text-[12px] text-[#A3A3A3] mt-6">
          Acceso restringido únicamente para personal autorizado.
        </p>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-white" />}>
      <LoginForm />
    </Suspense>
  );
}
