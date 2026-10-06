import Link from "next/link";

export default function PrivacyPolicyPage() {
  return (
    <main className="min-h-screen bg-white text-[#0A0A0A] p-8 max-w-3xl mx-auto">
      <header className="border-b border-[#E5E5E5] pb-4 mb-8">
        <Link href="/" className="text-[13px] text-[#525252] hover:underline mb-2 inline-block">
          &larr; Volver al inicio
        </Link>
        <h1 className="text-[20px] font-semibold text-[#0A0A0A]">
          Política de Privacidad
        </h1>
        <p className="text-[13px] text-[#525252] mt-1">
          Última actualización: Octubre 2026
        </p>
      </header>

      <div className="space-y-6 text-[14px] text-[#525252] leading-relaxed">
        <section>
          <h2 className="text-[16px] font-medium text-[#0A0A0A] mb-2">
            1. Responsable del tratamiento
          </h2>
          <p>
            El responsable del tratamiento de los datos personales recopilados a través
            de esta plataforma y del canal de WhatsApp es Stakeholders Contadores
            Públicos, con domicilio en Medellín, Colombia. Correo de contacto:
            stakeholdersadm@gmail.com.
          </p>
        </section>

        <section>
          <h2 className="text-[16px] font-medium text-[#0A0A0A] mb-2">
            2. Datos recopilados a través de WhatsApp
          </h2>
          <p>
            Recopilamos únicamente los datos necesarios para brindar atención al
            cliente y gestionar solicitudes de citas:
          </p>
          <ul className="list-disc pl-5 mt-2 space-y-1">
            <li>Número telefónico o identificador de usuario de WhatsApp (BSUID).</li>
            <li>Nombre de perfil proporcionado por WhatsApp.</li>
            <li>Mensajes de texto, notas de voz o imágenes enviadas voluntariamente.</li>
            <li>Información sobre requerimientos contables, facturas emitidas y correo electrónico para el agendamiento.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-[16px] font-medium text-[#0A0A0A] mb-2">
            3. Finalidad del tratamiento
          </h2>
          <p>
            Los datos se utilizan exclusivamente para responder consultas sobre
            servicios contables, calificar solicitudes comerciales, coordinar y
            agendar citas de diagnóstico gratuito en Google Calendar, y mantener el
            historial de atención con la firma.
          </p>
        </section>

        <section>
          <h2 className="text-[16px] font-medium text-[#0A0A0A] mb-2">
            4. Terceros y transferencias
          </h2>
          <p>
            Para operar el servicio, los datos pueden procesarse a través de los
            siguientes proveedores tecnológicos bajo estrictos acuerdos de
            confidencialidad:
          </p>
          <ul className="list-disc pl-5 mt-2 space-y-1">
            <li><strong>Meta Platforms (WhatsApp Cloud API):</strong> transporte y recepción de mensajes.</li>
            <li><strong>OpenAI:</strong> procesamiento del lenguaje natural y transcripción de audios.</li>
            <li><strong>Google Workspace (Google Calendar):</strong> reserva de citas y generación de enlaces de Google Meet.</li>
            <li><strong>Supabase:</strong> almacenamiento seguro de base de datos y archivos multimedia.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-[16px] font-medium text-[#0A0A0A] mb-2">
            5. Derechos y eliminación de datos
          </h2>
          <p>
            Los titulares pueden ejercer sus derechos de conocimiento, actualización,
            rectificación y supresión de datos escribiendo a stakeholdersadm@gmail.com o
            siguiendo las instrucciones en nuestra página de{" "}
            <Link href="/eliminacion-de-datos" className="text-[#0A0A0A] underline">
              Eliminación de datos
            </Link>.
          </p>
        </section>
      </div>
    </main>
  );
}
