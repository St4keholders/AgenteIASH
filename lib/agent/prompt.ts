import { createAdminClient } from "@/lib/supabase/server";
import { getBogotaDateParts, formatTimeBogota } from "@/lib/calendar/availability";

export interface AgentConfigData {
  identidad: {
    nombre: string;
    presentacion: string;
    trato: "tu" | "usted";
    formalidad: string;
    longitud_maxima: string;
    usar_emojis: "no" | "moderado" | "si";
    firma?: string;
  };
  conocimiento: {
    descripcion_negocio: string;
    direccion_presencial?: string;
    servicios: Array<{
      id: string;
      nombre: string;
      descripcion: string;
      proceso?: string;
      planes?: Array<{ nombre: string; rango_facturas: string; precio: string; nota?: string }>;
      precio?: string;
      nota_precios?: string;
    }>;
    preguntas_frecuentes?: Array<{ pregunta: string; respuesta: string }>;
    informacion_adicional?: string;
  };
  embudo: {
    etapas: Array<{ orden: number; nombre: string; objetivo: string }>;
  };
  reglas: {
    prohibiciones: string[];
    escalamiento_humano: string;
    temas_ajenos: string;
  };
  horarios_citas: {
    tipo_cita: string;
    duracion_minutos: number;
    hora_inicio_laboral: string;
    hora_fin_laboral: string;
    dias_laborales: number[];
    anticipacion_minima_horas: number;
    maximo_dias_adelanto: number;
    modalidades: string[];
    max_opciones_ofrecer_por_dia: number;
    zona_horaria: string;
  };
}

export async function getPublishedConfig(supabase = createAdminClient()): Promise<{
  version: number;
  data: AgentConfigData;
}> {
  const { data, error } = await supabase
    .from("agent_configs")
    .select("version, data")
    .eq("status", "published")
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    throw new Error(`Could not load published agent config: ${error?.message || "No published config found"}`);
  }

  return {
    version: data.version,
    data: data.data as unknown as AgentConfigData,
  };
}

/**
 * Construye el system prompt del agente inyectando la configuración publicada
 * y la fecha y hora actuales en Bogotá.
 */
export function buildSystemPrompt(config: AgentConfigData, now = new Date()): string {
  const parts = getBogotaDateParts(now);
  const days = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
  const months = [
    "enero", "febrero", "marzo", "abril", "mayo", "junio",
    "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"
  ];
  const dayName = days[parts.dayOfWeek];
  const monthName = months[parts.month - 1];
  const timeStr = formatTimeBogota(now);

  const contextTimeStr = `${dayName} ${parts.day} de ${monthName} de ${parts.year}, ${timeStr} (hora oficial de Colombia / Bogotá, UTC-5). Fecha en formato YYYY-MM-DD: ${parts.dateString}.`;

  const serviciosText = config.conocimiento.servicios
    .map((s) => {
      let details = `- **${s.nombre}**: ${s.descripcion}`;
      if (s.precio) details += ` Precio: ${s.precio}.`;
      if (s.planes && s.planes.length > 0) {
        details += ` Planes: ${s.planes.map((p) => `${p.nombre} (${p.rango_facturas}: ${p.precio})`).join(", ")}.`;
      }
      if (s.nota_precios) details += ` ${s.nota_precios}`;
      return details;
    })
    .join("\n");

  const faqsText = (config.conocimiento.preguntas_frecuentes || [])
    .map((f) => `P: ${f.pregunta}\nR: ${f.respuesta}`)
    .join("\n\n");

  const prohibicionesText = config.reglas.prohibiciones.map((p) => `- ${p}`).join("\n");

  const etapasText = config.embudo.etapas
    .map((e) => `${e.orden}. ${e.nombre}: ${e.objetivo}`)
    .join("\n");

  return `Eres el asistente virtual oficial de Stakeholders Contadores Públicos.
Trato al usuario: Trátalo de "${config.identidad.trato}".
Formalidad: ${config.identidad.formalidad}.
Nombre: ${config.identidad.nombre}.

==================================================
CONTEXTO TEMPORAL ACTUAL (CRÍTICO PARA FECHAS Y CITAS):
Hoy es ${contextTimeStr}
Usa esta fecha como referencia para resolver expresiones como "mañana", "el jueves", "la próxima semana".
==================================================

CONOCIMIENTO DEL NEGOCIO:
${config.conocimiento.descripcion_negocio}
Dirección presencial: ${config.conocimiento.direccion_presencial || "Medellín, Colombia"}

LÍNEAS DE SERVICIO:
${serviciosText}

PREGUNTAS FRECUENTES:
${faqsText}

EMBUDO DE CONVERSACIÓN:
${etapasText}

REGLAS OBLIGATORIAS:
${prohibicionesText}
- Escalamiento: ${config.reglas.escalamiento_humano}
- Temas ajenos: ${config.reglas.temas_ajenos}
- Respuestas para WhatsApp: breves, claras, sin encabezados complejos Markdown (#) ni tablas. Usa *negrita* con moderación. Si te preguntan si eres IA, admítelo con naturalidad y orgullo.
- Agendamiento de citas: Toda cita de diagnóstico es gratuita y dura 30 minutos. Horarios disponibles de lunes a viernes entre 7:00 y 19:00 (última cita a las 18:30). Excluir festivos de Colombia.
- NUNCA confirmes una cita sin antes llamar a check_availability para ofrecer opciones reales, pedir la confirmación explícita del cliente y confirmar nombre, servicio, modalidad (virtual con Google Meet o presencial en Medellín) y correo si es virtual.
- Si el cliente proporciona información relevante (nombre, correo, empresa, número de facturas/mes, plan sugerido), llama a la herramienta update_lead para guardarlo.
`;
}
