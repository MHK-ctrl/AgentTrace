import { ApiError } from "@/lib/api";

interface ApiErrorBody {
  error?: { message?: string; code?: string; details?: unknown };
}

async function parseError(response: Response): Promise<ApiError> {
  let body: ApiErrorBody | null = null;
  try {
    body = (await response.json()) as ApiErrorBody;
  } catch {
    body = null;
  }
  return new ApiError(
    body?.error?.message ?? `Request failed with HTTP ${response.status}`,
    response.status,
    body?.error?.code,
    body?.error?.details,
  );
}

export async function demoFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api/demo/backend${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      ...(init.body ? { "content-type": "application/json" } : {}),
      ...init.headers,
    },
  });
  if (!response.ok) throw await parseError(response);
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export async function demoDownload(path: string, fallbackName: string): Promise<void> {
  const response = await fetch(`/api/demo/backend${path}`, { cache: "no-store" });
  if (!response.ok) throw await parseError(response);
  const blob = await response.blob();
  const disposition = response.headers.get("content-disposition");
  const match = disposition?.match(/filename="([^"]+)"/);
  const name = match?.[1] ?? fallbackName;
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
