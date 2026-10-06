import Link from "next/link";

export default function HomePage() {
  return (
    <main className="min-h-screen bg-white text-[#0A0A0A] flex flex-col justify-between p-8">
      <header className="border-b border-[#E5E5E5] pb-4">
        <h1 className="text-[20px] font-semibold text-[#0A0A0A]">
          Stakeholders Contadores Públicos
        </h1>
        <p className="text-[14px] text-[#525252] mt-1">
          Asistente virtual de atención y gestión de citas de diagnóstico.
        </p>
      </header>

      <section className="py-12 max-w-xl">
        <p className="text-[14px] text-[#525252] leading-relaxed">
          Plataforma de comunicación directa y agendamiento de citas de diagnóstico
          gratuito para personas naturales y empresas en Colombia.
        </p>
      </section>

      <footer className="border-t border-[#E5E5E5] pt-4 flex gap-6 text-[13px] text-[#525252]">
        <Link href="/privacidad" className="hover:underline">
          Política de privacidad
        </Link>
        <Link href="/eliminacion-de-datos" className="hover:underline">
          Eliminación de datos
        </Link>
      </footer>
    </main>
  );
}
