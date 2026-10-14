export const DEFAULT_SCHOOL_NAME = "ישיבה תיכונית צביה אלישיב";

/** Binary size cap. Base64 in Firestore must stay under the 1MB document limit. */
export const SCHOOL_LOGO_MAX_BYTES = 450 * 1024;

export type SchoolLogoContentType = "image/png" | "image/jpeg" | "image/webp";

export interface SchoolBrandingRecord {
  logoBase64?: string | null;
  contentType?: SchoolLogoContentType | null;
  updatedAt?: string | null;
  updatedBy?: string | null;
}

export interface PublicBranding {
  schoolName: string;
  hasCustomLogo: boolean;
  updatedAt: string | null;
}

export function schoolLogoUrl(updatedAt: string | null | undefined): string {
  const version = updatedAt ? encodeURIComponent(updatedAt) : "1";
  return `/api/branding/logo?v=${version}`;
}
