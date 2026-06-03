/**
 * Central API configuration.
 * Uses NEXT_PUBLIC_API_URL env var if set, otherwise falls back to localhost for local dev.
 */
export const API_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

/**
 * Helper to build an API URL from a path.
 * @example apiUrl("/api/competitions") => "http://localhost:8000/api/competitions"
 */
export function apiUrl(path: string): string {
  return `${API_URL}${path}`;
}
