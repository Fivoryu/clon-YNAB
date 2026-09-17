export function formatMoney(minor: number): string {
  return new Intl.NumberFormat('es-BO', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(minor / 100);
}

export function minorToInput(minor: number): string {
  return (minor / 100).toFixed(2);
}

export function parseMoneyToMinor(value: string): number {
  const normalized = value.trim().replace(/\s/g, '').replace(',', '.');
  if (!/^\d+(?:\.\d{0,2})?$/.test(normalized)) throw new Error('Ingresa un monto válido con hasta 2 decimales.');
  const amount = Number(normalized);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('El monto debe ser mayor a 0.');
  const minor = Math.round(amount * 100);
  if (!Number.isSafeInteger(minor)) throw new Error('El monto es demasiado grande.');
  return minor;
}

export function parseOptionalMoneyToMinor(value: string): number | undefined {
  if (!value.trim()) return undefined;
  const normalized = value.trim().replace(/\s/g, '').replace(',', '.');
  if (!/^\d+(?:\.\d{0,2})?$/.test(normalized)) throw new Error('Ingresa un monto válido con hasta 2 decimales.');
  const amount = Number(normalized);
  const minor = Math.round(amount * 100);
  if (!Number.isSafeInteger(minor)) throw new Error('El monto es demasiado grande.');
  return minor;
}
