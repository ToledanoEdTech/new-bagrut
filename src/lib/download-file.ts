"use client";

function parseFilename(disposition: string | null): string | null {
  if (!disposition) return null;
  const encoded = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  if (encoded) return decodeURIComponent(encoded);
  const plain = disposition.match(/filename="?([^"]+)"?/i)?.[1];
  return plain ?? null;
}

export async function downloadFromApi(url: string): Promise<void> {
  const res = await fetch(url, { credentials: "same-origin" });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data as { error?: string }).error ?? "הייצוא נכשל");
  }

  const blob = await res.blob();
  const filename =
    parseFilename(res.headers.get("Content-Disposition")) ??
    `download-${Date.now()}`;
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(objectUrl);
}
