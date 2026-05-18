/**
 * Aplica máscara brasileira (XX) XXXXX-XXXX ou (XX) XXXX-XXXX conforme o comprimento.
 * Armazena o valor formatado no estado; use normalizePhone antes de enviar à API.
 */
export function formatPhone(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  const len = digits.length;
  if (len === 0) return '';
  if (len <= 2) return `(${digits}`;
  if (len <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (len <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

/** Remove tudo que não for dígito. Envia este valor à API. */
export function normalizePhone(value: string): string {
  return value.replace(/\D/g, '');
}

/** Retorna true se o número tem 10 ou 11 dígitos (DDD + número). */
export function isValidPhone(value: string): boolean {
  const digits = normalizePhone(value);
  const local = digits.startsWith('55') && digits.length >= 12 ? digits.slice(2) : digits;
  return local.length === 10 || local.length === 11;
}
