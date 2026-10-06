import Link from "next/link";

export default function DataDeletionPage() {
  return (
    <main className="min-h-screen bg-white text-[#0A0A0A] p-8 max-w-3xl mx-auto">
      <header className="border-b border-[#E5E5E5] pb-4 mb-8">
        <Link href="/" className="text-[13px] text-[#525252] hover:underline mb-2 inline-block">
          &larr; Volver al inicio
        </Link>
        <h1 className="text-[20px] font-semibold text-[#0A0A0A]">
          Solicitud de Eliminación de Datos
        </h1>
        <p className="text-[13px] text-[#525252] mt-1">
          Instrucciones para titulares de datos personales (WhatsApp)
        </p>
      </header>

      <div className="space-y-6 text-[14px] text-[#525252] leading-relaxed">
        <section>
          <h2 className="text-[16px] font-medium text-[#0A0A0A] mb-2">
            Cómo solicitar la supresión de sus datos
          </h2>
          <p>
            Si interactuó con nuestro agente de WhatsApp y desea que eliminemos
            toda su información de contacto, historial de mensajes, notas de voz
            o registros de citas, puede solicitarlo mediante cualquiera de los
            siguientes canales:
          </p>
          <ul className="list-disc pl-5 mt-2 space-y-1">
            <li>
              <strong>Por correo electrónico:</strong> Envíe un mensaje a{" "}
              <span className="font-medium text-[#0A0A0A]">stakeholdersadm@gmail.com</span>{" "}
              con el asunto &quot;Eliminación de datos WhatsApp&quot;, indicando su
              número de teléfono o identificador de WhatsApp con el que se comunicó.
            </li>
            <li>
              <strong>Por WhatsApp:</strong> Escriba la palabra &quot;ELIMINAR MIS DATOS&quot;
              o solicite a nuestro asesor la eliminación de su ficha.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-[16px] font-medium text-[#0A0A0A] mb-2">
            Plazo de atención y confirmación
          </h2>
          <p>
            Procesaremos su solicitud en un plazo máximo de 48 horas hábiles. Una vez
            eliminados sus registros de nuestras bases de datos y almacenamiento de medios,
            le enviaremos una notificación de confirmación.
          </p>
        </section>
      </div>
    </main>
  );
}
