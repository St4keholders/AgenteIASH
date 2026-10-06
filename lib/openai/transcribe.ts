import OpenAI, { toFile } from "openai";
import { getConfig } from "@/lib/config";

export async function transcribeAudio(
  audioBuffer: Buffer,
  filename = "audio.ogg"
): Promise<string> {
  const config = getConfig();

  if (config.WHATSAPP_DRY_RUN && audioBuffer.toString() === "mock-audio-data") {
    return "Hola, quisiera agendar una cita de diagnóstico para mañana a las diez de la mañana.";
  }

  const openai = new OpenAI({
    apiKey: config.OPENAI_API_KEY,
    dangerouslyAllowBrowser: true,
  });
  const file = await toFile(audioBuffer, filename);

  const transcription = await openai.audio.transcriptions.create({
    file,
    model: config.OPENAI_TRANSCRIBE_MODEL,
    language: "es",
  });

  return transcription.text;
}
