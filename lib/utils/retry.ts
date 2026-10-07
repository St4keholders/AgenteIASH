/**
 * Utilidad de reintento con retroceso exponencial (exponential backoff) y variación aleatoria (jitter).
 * Soporta detección de errores 429 (Rate Limit), 5xx (Server Error) y fallos de red transitorios.
 */

export interface RetryOptions {
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  isRetryable?: (error: unknown) => boolean;
}

export function isTransientError(error: unknown): boolean {
  if (!error) return false;

  // Si es un error con status numérico (APIError de OpenAI o HTTP fetch)
  const errObj = error as { status?: number; statusCode?: number; code?: string; message?: string };
  const status = errObj.status ?? errObj.statusCode;

  if (typeof status === "number") {
    // 429: Too Many Requests / Rate Limit
    if (status === 429) return true;
    // 5xx: Server Errors transitorios
    if (status >= 500 && status <= 599) return true;
  }

  // Errores de red Node/fetch comunes
  const code = errObj.code;
  if (code && ["ECONNRESET", "ETIMEDOUT", "EAI_AGAIN", "UND_ERR_CONNECT_TIMEOUT"].includes(code)) {
    return true;
  }

  const msg = errObj.message?.toLowerCase() || "";
  if (
    msg.includes("rate limit") ||
    msg.includes("too many requests") ||
    msg.includes("econnreset") ||
    msg.includes("etimedout") ||
    msg.includes("fetch failed") ||
    msg.includes("network error")
  ) {
    return true;
  }

  return false;
}

export async function withExponentialBackoff<T>(
  operation: (attempt: number) => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const maxRetries = options.maxRetries ?? 3;
  const baseDelayMs = options.baseDelayMs ?? 500;
  const maxDelayMs = options.maxDelayMs ?? 4000;
  const isRetryable = options.isRetryable ?? isTransientError;

  let attempt = 0;

  while (true) {
    try {
      return await operation(attempt + 1);
    } catch (error: unknown) {
      attempt++;

      if (attempt > maxRetries || !isRetryable(error)) {
        throw error;
      }

      // Backoff exponencial: baseDelayMs * 2^(attempt - 1)
      const expDelay = Math.min(baseDelayMs * Math.pow(2, attempt - 1), maxDelayMs);
      // Jitter aleatorio: entre 0% y 50% del retraso calculado
      const jitter = Math.random() * (expDelay * 0.5);
      const totalDelay = Math.round(expDelay + jitter);

      await new Promise((resolve) => setTimeout(resolve, totalDelay));
    }
  }
}
