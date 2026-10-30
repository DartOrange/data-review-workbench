export async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(15000) });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(
      body?.message ?? `Request failed (${response.status}). Check the local server and retry.`,
    );
  }
  return response.json();
}
export function message(error: unknown) {
  return error instanceof Error
    ? error.message
    : 'Request failed. Check the local server and retry.';
}
