/**
 * Endereço da API. Em produção o front (Static Site) e a API (Web Service) ficam em
 * domínios diferentes: defina VITE_API_URL no build (ex.: https://agenda-api.onrender.com).
 * Em desenvolvimento fica vazio e o proxy do Vite encaminha /api para o Django.
 */
export const API_BASE = `${(import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '')}/api/v1`;
