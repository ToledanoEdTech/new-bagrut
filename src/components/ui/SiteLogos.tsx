import Image from "next/image";
import clsx from "clsx";

const LOGO_1 = {
  src: "/logos/logo-1.png",
  alt: "Toledano EdTech",
  width: 1397,
  height: 768,
};

const LOGO_2 = {
  src: "/logos/logo-2.png",
  alt: "ישיבה תיכונית צביה אלישיב",
  width: 1920,
  height: 1080,
};

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
          className={clsx(isHero ? "h-24 w-auto" : "h-8 w-auto")}
          priority={isHero}
        />
      )}
      <Image
        src={LOGO_2.src}
        alt={LOGO_2.alt}
        width={LOGO_2.width}
        height={LOGO_2.height}
        className={clsx(
          isHero && "h-20 w-auto rounded-xl bg-white p-2",
          isLogin && "h-20 w-auto rounded-xl bg-white p-2 shadow-card ring-1 ring-slate-200/60 sm:h-24",
          !isHero && !isLogin && "h-8 w-auto"
        )}
        priority={isHero || isLogin}
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
