import { createAdminClient } from "@/lib/supabase/server";
import { getBogotaDateParts, formatTimeBogota } from "@/lib/calendar/availability";
import { z } from "zod";

export const AgentConfigZodSchema = z.object({
  identidad: z.object({
    nombre: z.string().min(1, "El nombre del asistente es obligatorio"),
    presentacion: z.string().min(1, "La presentación es obligatoria"),
    trato: z.enum(["tu", "usted"]),
    formalidad: z.string().min(1),
    longitud_maxima: z.string().min(1),
    usar_emojis: z.enum(["no", "moderado", "si"]),
    firma: z.string().optional(),
  }),
  conocimiento: z.object({
    descripcion_negocio: z.string().min(1, "La descripción del negocio es obligatoria"),
    direccion_presencial: z.string().optional(),
    servicios: z.array(
      z.object({
        id: z.string(),
        nombre: z.string().min(1),
        descripcion: z.string().min(1),
        proceso: z.string().optional(),
        planes: z
          .array(
            z.object({
              nombre: z.string(),
              rango_facturas: z.string(),
              precio: z.string(),
              nota: z.string().optional(),
            })
          )
          .optional(),
        precio: z.string().optional(),
        nota_precios: z.string().optional(),
      })
    ),
    preguntas_frecuentes: z
      .array(
        z.object({
          pregunta: z.string().min(1),
          respuesta: z.string().min(1),
        })
      )
      .optional(),
    informacion_adicional: z.string().optional(),
  }),
  embudo: z.object({
    etapas: z.array(
      z.object({
        orden: z.number(),
        nombre: z.string().min(1),
        objetivo: z.string().min(1),
      })
    ),
  }),
  reglas: z.object({
    prohibiciones: z.array(z.string()),
    escalamiento_humano: z.string().min(1),
    temas_ajenos: z.string().min(1),
  }),
  horarios_citas: z.object({
    tipo_cita: z.string(),
    duracion_minutos: z.number(),
    hora_inicio_laboral: z.string(),
    hora_fin_laboral: z.string(),
    dias_laborales: z.array(z.number()),
    anticipacion_minima_horas: z.number(),
    maximo_dias_adelanto: z.number(),
    modalidades: z.array(z.string()),
    max_opciones_ofrecer_por_dia: z.number(),
    zona_horaria: z.string(),
  }),
});

export type AgentConfigData = z.infer<typeof AgentConfigZodSchema>;

export async function getPublishedConfig(supabase = createAdminClient()): Promise<{
  version: number;
  data: AgentConfigData;
}> {
  const { data, error } = await supabase
    .from("agent_configs")
    .select("version, data")
    .eq("status", "published")
    .order("version", { ascending: false });

  if (error || !data || data.length === 0) {
    throw new Error(`Could not load published agent config: ${error?.message || "No published config found"}`);
  }

  // Si la configuración más reciente fuera inválida por Zod, usar la versión anterior válida
  for (const item of data) {
    const parseRes = AgentConfigZodSchema.safeParse(item.data);
    if (parseRes.success) {
      return {
        version: item.version,
        data: parseRes.data,
      };
    } else {
      console.warn(`Published agent config v${item.version} is invalid according to Zod. Falling back to previous valid version.`);
    }
  }

  throw new Error("No valid published agent config found in database.");
}

export async function getDraftConfig(supabase = createAdminClient()): Promise<{
  id: string;
  version: number;
  data: AgentConfigData;
} | null> {
  const { data } = await supabase
    .from("agent_configs")
    .select("id, version, data")
    .eq("status", "draft")
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) return null;

  const parsed = AgentConfigZodSchema.safeParse(data.data);
  if (!parsed.success) return null;

  return {
    id: data.id,
    version: data.version,
    data: parsed.data,
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
- Agendamiento de citas: Toda cita de diagnóstico es gratuita y dura ${config.horarios_citas.duracion_minutos} minutos. Horarios disponibles entre ${config.horarios_citas.hora_inicio_laboral} y ${config.horarios_citas.hora_fin_laboral}. Excluir fines de semana y festivos de Colombia.
- Modalidades disponibles: ${config.horarios_citas.modalidades.join(", ")}.
- NUNCA confirmes una cita sin antes llamar a check_availability para ofrecer opciones reales, pedir la confirmación explícita del cliente y confirmar nombre, servicio, modalidad (${config.horarios_citas.modalidades.includes("virtual") ? "virtual con Google Meet" : ""} ${config.horarios_citas.modalidades.includes("presencial") ? "o presencial en Medellín" : ""}) y correo si es virtual.
- Si el cliente proporciona información relevante (nombre, correo, empresa, número de facturas/mes, plan sugerido), llama a la herramienta update_lead para guardarlo.
`;
}
