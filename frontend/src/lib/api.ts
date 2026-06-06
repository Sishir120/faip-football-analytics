/**
 * Central API configuration.
 * In production (Vercel), set NEXT_PUBLIC_API_URL env var to override.
 * Falls back to the live Render backend so the deployed site always works.
 * For local dev, set NEXT_PUBLIC_API_URL=http://localhost:8000 in .env.local
 */
export const API_URL =
  process.env.NEXT_PUBLIC_API_URL || "https://faip-backend.onrender.com";

/**
 * Helper to build an API URL from a path.
 * @example apiUrl("/api/competitions") => "http://localhost:8000/api/competitions"
 */
export function apiUrl(path: string): string {
  return `${API_URL}${path}`;
}
