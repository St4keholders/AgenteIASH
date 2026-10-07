/**
 * Serializador seguro de errores para observabilidad y logs estructurados.
 * Garantiza que los errores de Supabase (PostgrestError con message, code, details, hint),
 * de Meta Graph API / OpenAI (status, code, message) y de JavaScript estándar
 * nunca se serialicen como "[object Object]".
 * Además, enmascara tokens o secretos para evitar fugas en logs de Vercel.
 */

export function formatError(err: unknown): string {
  if (err === null || err === undefined) {
    return "Unknown error";
  }

  if (typeof err === "string") {
    return maskSecrets(err);
  }

  if (typeof err === "object") {
    const obj = err as Record<string, unknown>;
    const parts: string[] = [];

    const nested = (obj.error && typeof obj.error === "object") ? (obj.error as Record<string, unknown>) : null;

    // Errores de Postgrest / Supabase / Meta / OpenAI
    const code = obj.code ?? nested?.code;
    const message = (typeof obj.message === "string" ? obj.message : null) ?? (typeof nested?.message === "string" ? nested.message : null);
    const status = obj.status ?? obj.statusCode ?? nested?.status ?? nested?.statusCode;
    const details = (typeof obj.details === "string" && obj.details.trim().length > 0 ? obj.details : null) ?? (typeof nested?.details === "string" && nested.details.trim().length > 0 ? nested.details : null);
    const hint = (typeof obj.hint === "string" && obj.hint.trim().length > 0 ? obj.hint : null) ?? (typeof nested?.hint === "string" && nested.hint.trim().length > 0 ? nested.hint : null);

    if (code !== undefined && code !== null) {
      parts.push(`code: ${code}`);
    }
    if (status !== undefined && status !== null) {
      parts.push(`status: ${status}`);
    }
    if (message) {
      parts.push(`message: ${message}`);
    }
    if (details) {
      parts.push(`details: ${details}`);
    }
    if (hint) {
      parts.push(`hint: ${hint}`);
    }

    if (parts.length > 0) {
      return maskSecrets(parts.join(" | "));
    }

    if (err instanceof Error) {
      return maskSecrets(err.message || err.name);
    }

    try {
      return maskSecrets(JSON.stringify(err));
    } catch {
      return maskSecrets(String(err));
    }
  }

  return maskSecrets(String(err));
}

function maskSecrets(text: string): string {
  // Enmascarar tokens Bearer, OpenAI keys y tokens largos
  return text
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer ***")
    .replace(/sk-[A-Za-z0-9_-]{20,}/gi, "sk-***")
    .replace(/EA[A-Za-z0-9]{30,}/g, "EA***");
}
