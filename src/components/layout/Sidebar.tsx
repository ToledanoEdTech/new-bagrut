"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { prefetchRoute } from "@/lib/api-cache";
import clsx from "clsx";
import {
  LayoutDashboard,
  Users,
  School,
  BookOpen,
  ClipboardList,
  Upload,
  LogOut,
  GraduationCap,
  UserCog,
  Bell,
  X,
  Award,
  Cpu,
  CalendarDays,
  FileSpreadsheet,
  CalendarRange,
  AlertTriangle,
  BarChart3,
  ChevronDown,
  FolderKanban,
  Grid3X3,
  History,
} from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { SiteLogos } from "@/components/ui/SiteLogos";
import type { Role } from "@/lib/types";
import { canImportStudents, canManageStructure } from "@/lib/roles";
import { hasAnyGradeWrite, hasAnyStudentView, canViewOutstandingBagrut } from "@/lib/permissions";

type NavLink = {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  exact?: boolean;
};

const primaryLinks: NavLink[] = [
  { href: "/admin", label: "דשבורד", icon: LayoutDashboard, exact: true },
  { href: "/admin/students", label: "תלמידים", icon: Users },
  { href: "/admin/grades", label: "הזנת ציונים", icon: ClipboardList },
  { href: "/admin/reports", label: "מרכז חוסרים", icon: FileSpreadsheet },
];

const bagrutProgramLinks: NavLink[] = [
  { href: "/admin/outstanding-bagrut", label: "בגרות מצטיינת", icon: Award },
  { href: "/admin/hightech-bagrut", label: "בגרות הייטק", icon: Cpu },
];

const reportsLinks: NavLink[] = [
  { href: "/admin/grades-matrix", label: "מטריצת ציונים", icon: Grid3X3 },
  { href: "/admin/analytics", label: "סטטיסטיקות", icon: BarChart3 },
  { href: "/admin/shortage-year", label: "דוח חוסרים לפי שנה", icon: CalendarRange },
  { href: "/admin/missing-entries", label: "מורים ומטלות שלא הוזנו", icon: AlertTriangle },
];

const managementLinks: NavLink[] = [
  { href: "/admin/activity", label: "שינויים אחרונים", icon: History },
  { href: "/admin/classes", label: "כיתות ותוכניות", icon: School },
  { href: "/admin/subjects", label: "מקצועות וחובות", icon: BookOpen },
  { href: "/admin/obligations", label: "לוח מטלות וציונים", icon: CalendarDays },
  { href: "/admin/import", label: "ייבוא תלמידים", icon: Upload },
  { href: "/admin/staff", label: "צוות והרשאות", icon: UserCog },
  { href: "/admin/settings", label: "הגדרות מערכת", icon: Bell },
];

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

function isLinkActive(link: NavLink, pathname: string): boolean {
  return link.exact
    ? pathname === link.href
    : pathname === link.href || pathname.startsWith(link.href + "/");
}

function NavLinkItem({ link, pathname }: { link: NavLink; pathname: string }) {
  const active = isLinkActive(link, pathname);
  const Icon = link.icon;
  return (
    <Link
      href={link.href}
      prefetch
      onMouseEnter={() => prefetchRoute(link.href)}
      onFocus={() => prefetchRoute(link.href)}
      className={clsx(
        "group relative flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-base font-medium transition-all duration-200",
        active
          ? "text-primary-700"
          : "text-slate-600 hover:bg-slate-100/70 hover:text-slate-900"
      )}
    >
      {active && (
        <motion.div
          layoutId="sidebarActive"
          className="absolute inset-0 -z-10 rounded-xl bg-gradient-to-l from-primary-50 to-brand-50 ring-1 ring-inset ring-primary-100"
          transition={{ type: "spring", stiffness: 400, damping: 32 }}
        />
      )}
      {active && (
        <span className="absolute inset-y-2 right-0 w-1 rounded-full bg-gradient-to-b from-primary-500 to-brand-600" />
      )}
      <span
        className={clsx(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-all duration-200",
          active
            ? "bg-white text-primary-600 shadow-soft"
            : "text-slate-400 group-hover:text-slate-600"
        )}
      >
        <Icon className="h-5 w-5" />
      </span>
      <span className={clsx(active && "font-semibold")}>{link.label}</span>
    </Link>
  );
}

function NavSection({
  title,
  links,
  pathname,
}: {
  title: string;
  links: NavLink[];
  pathname: string;
}) {
  if (links.length === 0) return null;

  return (
    <div className="space-y-1">
      <p className="px-3 pb-1 pt-3 text-xs font-semibold text-slate-400">{title}</p>
      {links.map((link) => (
        <NavLinkItem key={link.href} link={link} pathname={pathname} />
      ))}
    </div>
  );
}

function CollapsibleNavGroup({
  title,
  icon: Icon,
  links,
  pathname,
  defaultOpen = false,
}: {
  title: string;
  icon: typeof LayoutDashboard;
  links: NavLink[];
  pathname: string;
  defaultOpen?: boolean;
}) {
  const hasActive = links.some((l) => isLinkActive(l, pathname));
  const [open, setOpen] = useState(defaultOpen || hasActive);

  useEffect(() => {
    if (hasActive) setOpen(true);
  }, [hasActive]);

  if (links.length === 0) return null;

  return (
    <div className="pt-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={clsx(
          "flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-base font-medium transition-all duration-200",
          hasActive
            ? "text-primary-700"
            : "text-slate-600 hover:bg-slate-100/70 hover:text-slate-900"
        )}
        aria-expanded={open}
      >
        <span
          className={clsx(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
            hasActive ? "bg-primary-50 text-primary-600" : "text-slate-400"
          )}
        >
          <Icon className="h-5 w-5" />
        </span>
        <span className="flex-1 text-start">{title}</span>
        <ChevronDown
          className={clsx(
            "h-4 w-4 shrink-0 text-slate-400 transition-transform",
            open && "rotate-180"
          )}
        />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="mr-3 space-y-0.5 border-r border-slate-100 pr-2 pt-0.5">
              {links.map((link) => (
                <NavLinkItem key={link.href} link={link} pathname={pathname} />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function Sidebar({
  role,
  mobileOpen = false,
  onMobileClose,
}: {
  role: Role;
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}) {
  const pathname = usePathname();
  const { signOut, session } = useAuth();

  const studentLinks: NavLink[] =
    role === "STUDENT"
      ? [{ href: "/student", label: "הדשבורד שלי", icon: GraduationCap, exact: true }]
      : [];

  const filteredPrimary =
    role === "STUDENT"
      ? []
      : primaryLinks.filter((l) => {
          if (l.href === "/admin/grades" && session && !hasAnyGradeWrite(session)) return false;
          if (l.href === "/admin/reports" && session && !hasAnyGradeWrite(session)) return false;
          if (l.href === "/admin/students" && session && !hasAnyStudentView(session)) return false;
          // Teachers land on grades — keep dashboard as overview but de-emphasize via order
          return true;
        });

  const filteredBagrut =
    role === "STUDENT"
      ? []
      : bagrutProgramLinks.filter((l) => {
          if (session && !hasAnyStudentView(session)) return false;
          if (session && !canViewOutstandingBagrut(session)) return false;
          return true;
        });

  const filteredReports =
    role === "STUDENT"
      ? []
      : reportsLinks.filter((l) => {
          if (l.href === "/admin/missing-entries" && role !== "ADMIN") return false;
          if (l.href === "/admin/shortage-year" && session && !hasAnyGradeWrite(session)) return false;
          if (
            (l.href === "/admin/analytics" || l.href === "/admin/grades-matrix") &&
            session &&
            !hasAnyStudentView(session) &&
            !hasAnyGradeWrite(session)
          )
            return false;
          return true;
        });

  const filteredManagement =
    role === "STUDENT" || role === "TEACHER"
      ? []
      : managementLinks.filter((l) => {
          if (l.href === "/admin/import" && session && !canImportStudents(role)) return false;
          if (
            (l.href === "/admin/classes" ||
              l.href === "/admin/subjects" ||
              l.href === "/admin/obligations") &&
            !canManageStructure(role)
          )
            return false;
          if (l.href === "/admin/settings" && role !== "ADMIN") return false;
          return true;
        });

  // Teachers: put grades first in the primary list
  const orderedPrimary =
    role === "TEACHER"
      ? [
          ...filteredPrimary.filter((l) => l.href === "/admin/grades"),
          ...filteredPrimary.filter((l) => l.href !== "/admin/grades"),
        ]
      : filteredPrimary;

  useEffect(() => {
    prefetchRoute(pathname);
  }, [pathname]);

  useEffect(() => {
    onMobileClose?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  const roleLabel =
    role === "ADMIN" ? "מנהל" : role === "TEACHER" ? "מורה" : "תלמיד";

  return (
    <aside
      className={clsx(
        "fixed inset-y-0 right-0 z-50 flex w-72 flex-col border-l border-slate-200/70 bg-white/90 shadow-xl backdrop-blur-xl transition-transform duration-300 ease-out lg:shadow-none",
        mobileOpen ? "translate-x-0" : "translate-x-full lg:translate-x-0"
      )}
    >
      <div className="relative flex items-center justify-between gap-3 overflow-hidden border-b border-slate-100 px-4 py-4">
        <div className="absolute inset-0 bg-gradient-to-l from-primary-50/80 via-white to-slate-50" />
        <div className="relative min-w-0 flex-1">
          <SiteLogos size="header" className="min-w-0" />
          <p className="mt-1 truncate text-[11px] font-medium text-slate-500">
            ישיבה תיכונית צביה אלישיב
          </p>
        </div>
        <button
          type="button"
          onClick={onMobileClose}
          className="relative rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 lg:hidden"
          aria-label="סגור תפריט"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {session && (
        <div className="px-4 pt-4">
          <div className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-slate-50/80 p-3">
            <div className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary-600 to-brand-600 text-sm font-bold text-white shadow-soft">
              {getInitials(session.name)}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold text-slate-800">{session.name}</p>
              <p className="truncate text-xs text-slate-400" dir="ltr">
                {session.email}
              </p>
            </div>
            <span className="badge-info shrink-0">{roleLabel}</span>
          </div>
        </div>
      )}

      <nav className="flex-1 overflow-y-auto p-4">
        {role === "STUDENT" ? (
          <NavSection title="תפריט" links={studentLinks} pathname={pathname} />
        ) : (
          <>
            <NavSection
              title={role === "TEACHER" ? "עבודה שלי" : "עבודה יומית"}
              links={orderedPrimary}
              pathname={pathname}
            />
            <CollapsibleNavGroup
              title="תוכניות בגרות"
              icon={FolderKanban}
              links={filteredBagrut}
              pathname={pathname}
            />
            <CollapsibleNavGroup
              title="דוחות וסטטיסטיקות"
              icon={BarChart3}
              links={filteredReports}
              pathname={pathname}
            />
            {filteredManagement.length > 0 && (
              <NavSection title="ניהול" links={filteredManagement} pathname={pathname} />
            )}
          </>
        )}
      </nav>

      <div className="border-t border-slate-100 p-4">
        <button
          onClick={() => signOut()}
          className="flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-base font-medium text-slate-600 transition-all duration-200 hover:bg-red-50 hover:text-red-600 active:scale-[0.98]"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-400">
            <LogOut className="h-5 w-5" />
          </span>
          התנתקות
        </button>
      </div>
    </aside>
  );
}
