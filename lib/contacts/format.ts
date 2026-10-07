export interface ContactDisplaySource {
  name?: string | null;
  username?: string | null;
  phone?: string | null;
  bsuid?: string | null;
  wa_id?: string | null;
}

export function formatContactDisplayName(
  contact?: ContactDisplaySource | null
): string {
  if (!contact) return "Contacto desconocido";
  const name = contact.name?.trim();
  const username = contact.username?.trim();
  const phone = contact.phone?.trim();

  if (name) {
    if (username) return `${name} (@${username})`;
    if (phone) return `${name} (${phone})`;
    return name;
  }

  if (username) return `@${username}`;
  if (phone) return phone;
  return "Usuario de WhatsApp";
}

export function formatContactSubtitle(
  contact?: ContactDisplaySource | null
): string {
  if (!contact) return "Sin datos";
  const username = contact.username?.trim();
  const phone = contact.phone?.trim();

  if (phone && username) return `${phone} · @${username}`;
  if (phone) return phone;
  if (username) return `@${username}`;
  return "Sin teléfono";
}

export function formatBsuidShort(bsuid?: string | null): string {
  if (!bsuid) return "—";
  if (bsuid.length <= 10) return bsuid;
  return `${bsuid.slice(0, 6)}...${bsuid.slice(-4)}`;
}
