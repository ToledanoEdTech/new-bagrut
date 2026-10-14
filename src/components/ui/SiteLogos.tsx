"use client";

import Image from "next/image";
import clsx from "clsx";
import { useBranding } from "@/components/BrandingProvider";

const LOGO_1 = {
  src: "/logos/logo-1.png",
  alt: "Toledano EdTech",
  width: 1397,
  height: 768,
};

export function SchoolMark({
  className,
}: {
  className?: string;
  priority?: boolean;
}) {
  const { schoolName, schoolLogoUrl } = useBranding();

  if (!schoolLogoUrl) return null;

  return <img src={schoolLogoUrl} alt={schoolName} className={className} />;
}

export function SiteLogos({
  size = "header",
  className,
  showPartner = false,
}: {
  size?: "hero" | "header" | "login" | "partner";
  className?: string;
  showPartner?: boolean;
}) {
  if (size === "partner") {
    return (
      <Image
        src={LOGO_1.src}
        alt={LOGO_1.alt}
        width={LOGO_1.width}
        height={LOGO_1.height}
        className={clsx("h-5 w-auto opacity-75", className)}
      />
    );
  }

  const isHero = size === "hero";
  const isLogin = size === "login";

  return (
    <div
      className={clsx(
        "flex items-center",
        isHero || isLogin ? "flex-col gap-4" : "gap-2",
        className
      )}
    >
      {!isLogin && (
        <Image
          src={LOGO_1.src}
          alt={LOGO_1.alt}
          width={LOGO_1.width}
          height={LOGO_1.height}
          className={clsx(
            "w-auto object-contain",
            isHero ? "h-24" : "h-8 max-w-[7.5rem]"
          )}
          priority={isHero}
        />
      )}
      <SchoolMark
        priority={isHero || isLogin}
        className={clsx(
          "w-auto object-contain",
          isHero && "h-20 rounded-xl bg-white p-2",
          isLogin &&
            "h-20 max-w-[15rem] rounded-2xl bg-white p-2 shadow-[0_18px_50px_-24px_rgba(0,0,0,0.65)] ring-1 ring-white/70 sm:h-24",
          !isHero && !isLogin && "h-8 max-w-[9rem]"
        )}
      />
      {isLogin && showPartner && (
        <Image
          src={LOGO_1.src}
          alt={LOGO_1.alt}
          width={LOGO_1.width}
          height={LOGO_1.height}
          className="h-5 w-auto opacity-70"
        />
      )}
    </div>
  );
}
