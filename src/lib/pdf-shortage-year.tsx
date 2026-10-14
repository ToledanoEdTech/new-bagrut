import fs from "node:fs";
import path from "node:path";
import React from "react";
import { Document, Font, Image, Page, renderToBuffer, StyleSheet, Text, View } from "@react-pdf/renderer";
import { exportTimestamp } from "@/lib/excel-export";
import { HEEBO_400_BASE64, HEEBO_700_BASE64 } from "@/lib/pdf-fonts";
import type { ShortageYearReport } from "@/lib/shortage-year-report";
import { shortageYearFilenameBase } from "@/lib/shortage-year-report";

let fontsRegistered = false;

function resolveExistingFile(candidates: string[]): string | null {
  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) return candidate;
    } catch {
      // ignore
    }
  }
  return null;
}

function ensurePdfFonts() {
  if (fontsRegistered) return;
  Font.register({
    family: "Heebo",
    fonts: [
      { src: `data:font/woff;base64,${HEEBO_400_BASE64}`, fontWeight: 400 },
      { src: `data:font/woff;base64,${HEEBO_700_BASE64}`, fontWeight: 700 },
    ],
  });
  Font.registerHyphenationCallback((word) => [word]);
  fontsRegistered = true;
}

function resolveLogoDataUrl(): string | null {
  const candidate = resolveExistingFile([
    path.join(process.cwd(), "public", "logos", "logo-2.png"),
    path.join(process.cwd(), "public", "logo-2.png"),
    path.join(process.cwd(), "public", "logos", "logo-1.png"),
  ]);
  if (!candidate) return null;
  try {
    return `data:image/png;base64,${fs.readFileSync(candidate).toString("base64")}`;
  } catch {
    return null;
  }
}

const COLORS = {
  primary: "#0d9488",
  primaryDark: "#115e59",
  primaryLight: "#f0fdfa",
  slate900: "#0f172a",
  slate700: "#334155",
  slate500: "#64748b",
  slate200: "#e2e8f0",
  slate100: "#f1f5f9",
  slate50: "#f8fafc",
  success: "#065f46",
  successBg: "#d1fae5",
  danger: "#991b1b",
  dangerBg: "#fee2e2",
  warning: "#92400e",
  warningBg: "#fef3c7",
  info: "#1e40af",
  infoBg: "#dbeafe",
};

const styles = StyleSheet.create({
  page: {
    fontFamily: "Heebo",
    fontSize: 8,
    color: COLORS.slate900,
    paddingTop: 16,
    paddingBottom: 16,
    paddingHorizontal: 18,
    backgroundColor: "#ffffff",
    textAlign: "right",
  },
  header: {
    flexDirection: "row-reverse",
    alignItems: "center",
    backgroundColor: COLORS.primary,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  headerText: {
    flexGrow: 1,
    flexShrink: 1,
    paddingLeft: 10,
  },
  brand: {
    fontSize: 8,
    color: "#ccfbf1",
    textAlign: "right",
    marginBottom: 2,
  },
  title: {
    fontSize: 15,
    fontWeight: 700,
    color: "#ffffff",
    textAlign: "right",
  },
  meta: {
    fontSize: 8,
    color: "#e6fffa",
    textAlign: "right",
    marginTop: 2,
  },
  logo: {
    width: 88,
    height: 46,
    objectFit: "contain",
  },
  kpiRow: {
    flexDirection: "row-reverse",
    gap: 6,
    marginBottom: 8,
  },
  kpi: {
    flexGrow: 1,
    flexBasis: 0,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: COLORS.slate200,
    padding: 6,
  },
  kpiLabel: {
    fontSize: 7,
    color: COLORS.slate500,
    textAlign: "right",
    marginBottom: 2,
  },
  kpiValue: {
    fontSize: 14,
    fontWeight: 700,
    textAlign: "right",
  },
  sectionTitle: {
    fontSize: 10,
    fontWeight: 700,
    color: COLORS.primaryDark,
    textAlign: "right",
    marginBottom: 4,
  },
  table: {
    borderWidth: 1,
    borderColor: COLORS.slate200,
    borderRadius: 6,
    overflow: "hidden",
  },
  thead: {
    flexDirection: "row-reverse",
    backgroundColor: COLORS.primaryDark,
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  th: {
    color: "#ffffff",
    fontSize: 7,
    fontWeight: 700,
    textAlign: "right",
  },
  tr: {
    flexDirection: "row-reverse",
    paddingVertical: 3,
    paddingHorizontal: 4,
    borderTopWidth: 1,
    borderTopColor: COLORS.slate200,
  },
  td: {
    fontSize: 7.5,
    textAlign: "right",
    color: COLORS.slate700,
  },
  footer: {
    position: "absolute",
    bottom: 10,
    left: 18,
    right: 18,
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    color: COLORS.slate500,
    fontSize: 7,
  },
  note: {
    marginTop: 6,
    fontSize: 7.5,
    color: COLORS.slate500,
    textAlign: "right",
  },
});

function Kpi({
  label,
  value,
  color,
  bg,
}: {
  label: string;
  value: string | number;
  color: string;
  bg: string;
}) {
  return (
    <View style={[styles.kpi, { backgroundColor: bg }]}>
      <Text style={styles.kpiLabel}>{label}</Text>
      <Text style={[styles.kpiValue, { color }]}>{String(value)}</Text>
    </View>
  );
}

function Col({
  width,
  children,
  bold,
  color,
}: {
  width: string;
  children: React.ReactNode;
  bold?: boolean;
  color?: string;
}) {
  return (
    <Text
      style={[
        styles.td,
        { width, fontWeight: bold ? 700 : 400, color: color ?? COLORS.slate700 },
      ]}
    >
      {children}
    </Text>
  );
}

function HeadCol({ width, children }: { width: string; children: string }) {
  return <Text style={[styles.th, { width }]}>{children}</Text>;
}

function ShortageYearPage({
  report,
  logoSrc,
}: {
  report: ShortageYearReport;
  logoSrc: string | null;
}) {
  const { totals, filter } = report;
  const isStudent = filter.groupBy === "student";
  const remaining = report.entries.filter((e) => !e.isComplete);
  const maxGroupRows = isStudent ? 8 : 18;
  const visibleGroups = report.groups.slice(0, maxGroupRows);
  const hiddenGroups = Math.max(0, report.groups.length - visibleGroups.length);

  const groupFirst =
    filter.groupBy === "gradeYear" ? "כיתה" : filter.groupBy === "class" ? "תלמיד" : "מקצוע";
  const groupSecond =
    filter.groupBy === "gradeYear" ? "שכבה" : filter.groupBy === "class" ? "כיתה" : "שכבת מטלה";

  const remainingPreview = isStudent ? remaining.slice(0, 12) : remaining.slice(0, 0);
  const hiddenRemaining = Math.max(0, remaining.length - remainingPreview.length);

  return (
    <Page size="A4" orientation="landscape" style={styles.page} wrap={false}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.brand}>ישיבה תיכונית צביה אלישיב · מערכת מעקב בגרות</Text>
          <Text style={styles.title}>{`דוח חוסרים — ${report.filterLabel}`}</Text>
          <Text style={styles.meta}>
            {`${report.groupByLabel} · ${report.yearScopeLabel} · הופק ב־${report.generatedAt} · עמוד אחד`}
          </Text>
        </View>
        {logoSrc ? <Image src={logoSrc} style={styles.logo} /> : null}
      </View>

      <View style={styles.kpiRow}>
        <Kpi label="סה״כ מטלות" value={totals.total} color={COLORS.primaryDark} bg={COLORS.primaryLight} />
        <Kpi label="הושלמו" value={totals.done} color={COLORS.success} bg={COLORS.successBg} />
        <Kpi label="נותרו" value={totals.remaining} color={COLORS.danger} bg={COLORS.dangerBg} />
        <Kpi label="באיחור" value={totals.overdue} color={COLORS.warning} bg={COLORS.warningBg} />
        <Kpi label="אחוז השלמה" value={`${totals.donePercent}%`} color={COLORS.info} bg={COLORS.infoBg} />
        <Kpi
          label="כיסוי"
          value={`${totals.studentCount} תלמידים`}
          color={COLORS.slate700}
          bg={COLORS.slate50}
        />
      </View>

      <Text style={styles.sectionTitle}>
        {filter.groupBy === "gradeYear"
          ? "סיכום לפי כיתה"
          : filter.groupBy === "class"
            ? "סיכום לפי תלמיד"
            : "סיכום לפי מקצוע"}
      </Text>

      <View style={styles.table}>
        <View style={styles.thead}>
          <HeadCol width="22%">{groupFirst}</HeadCol>
          <HeadCol width="14%">{groupSecond}</HeadCol>
          <HeadCol width="10%">סה״כ</HeadCol>
          <HeadCol width="10%">הושלם</HeadCol>
          <HeadCol width="10%">נותר</HeadCol>
          <HeadCol width="10%">באיחור</HeadCol>
          <HeadCol width="12%">השלמה</HeadCol>
          <HeadCol width="12%">תלמידים</HeadCol>
        </View>
        {visibleGroups.length === 0 ? (
          <View style={styles.tr}>
            <Col width="100%" color={COLORS.slate500}>
              אין מטלות בטווח שנבחר
            </Col>
          </View>
        ) : (
          visibleGroups.map((g, idx) => (
            <View
              key={g.key}
              style={[
                styles.tr,
                { backgroundColor: g.remaining > 0 ? "#fff7f7" : idx % 2 ? COLORS.slate50 : "#ffffff" },
              ]}
            >
              <Col width="22%" bold>
                {g.label}
              </Col>
              <Col width="14%">{g.subtitle ?? "—"}</Col>
              <Col width="10%">{String(g.total)}</Col>
              <Col width="10%" color={COLORS.success}>
                {String(g.done)}
              </Col>
              <Col width="10%" color={g.remaining ? COLORS.danger : COLORS.slate700} bold={g.remaining > 0}>
                {String(g.remaining)}
              </Col>
              <Col width="10%" color={g.overdue ? COLORS.warning : COLORS.slate700}>
                {String(g.overdue)}
              </Col>
              <Col width="12%" bold>
                {`${g.donePercent}%`}
              </Col>
              <Col width="12%">{String(g.studentCount)}</Col>
            </View>
          ))
        )}
      </View>

      {hiddenGroups > 0 ? (
        <Text style={styles.note}>{`ועוד ${hiddenGroups} שורות בסיכום — הפירוט המלא בקובץ האקסל.`}</Text>
      ) : null}

      {isStudent && remainingPreview.length > 0 ? (
        <View style={{ marginTop: 8 }}>
          <Text style={styles.sectionTitle}>מטלות שנותרו</Text>
          <View style={styles.table}>
            <View style={styles.thead}>
              <HeadCol width="28%">מקצוע</HeadCol>
              <HeadCol width="36%">מטלה</HeadCol>
              <HeadCol width="12%">שכבה</HeadCol>
              <HeadCol width="12%">יעד</HeadCol>
              <HeadCol width="12%">סטטוס</HeadCol>
            </View>
            {remainingPreview.map((e, idx) => (
              <View
                key={`${e.obligationId}-${e.taskLabel}-${idx}`}
                style={[styles.tr, { backgroundColor: e.isOverdue ? "#fff1f2" : idx % 2 ? COLORS.slate50 : "#ffffff" }]}
              >
                <Col width="28%">{e.subjectLabel}</Col>
                <Col width="36%" bold>
                  {e.taskLabel}
                </Col>
                <Col width="12%">{e.obligationGradeYear ?? "—"}</Col>
                <Col width="12%">{e.dueDate || "—"}</Col>
                <Col width="12%" color={e.isOverdue ? COLORS.danger : COLORS.slate700}>
                  {e.isOverdue ? `${e.statusLabel} · איחור` : e.statusLabel}
                </Col>
              </View>
            ))}
          </View>
          {hiddenRemaining > 0 ? (
            <Text style={styles.note}>{`ועוד ${hiddenRemaining} מטלות שנותרו — הפירוט המלא בקובץ האקסל.`}</Text>
          ) : null}
        </View>
      ) : null}

      <View style={styles.footer} fixed>
        <Text>דוח חוסרים · עמוד אחד</Text>
        <Text>ישיבה תיכונית צביה אלישיב</Text>
      </View>
    </Page>
  );
}

export async function buildShortageYearPdfBuffer(report: ShortageYearReport): Promise<Buffer> {
  ensurePdfFonts();
  const logoSrc = resolveLogoDataUrl();
  return renderToBuffer(
    <Document
      title={`דוח חוסרים — ${report.filterLabel} — ${report.yearScopeLabel}`}
      author="מערכת מעקב בגרות"
      language="he"
    >
      <ShortageYearPage report={report} logoSrc={logoSrc} />
    </Document>
  );
}

export function shortageYearPdfFilename(report: ShortageYearReport): string {
  return `${shortageYearFilenameBase(report)}_${exportTimestamp()}.pdf`;
}
