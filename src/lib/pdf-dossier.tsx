import fs from "node:fs";
import path from "node:path";
import React from "react";
import {
  Document,
  Font,
  Image,
  Page,
  renderToBuffer,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer";
import { exportTimestamp } from "@/lib/excel-export";
import type { StudentDossier } from "@/lib/student-dossier";
import { HEEBO_400_BASE64, HEEBO_700_BASE64 } from "@/lib/pdf-fonts";

let fontsRegistered = false;

function resolveExistingFile(candidates: string[]): string | null {
  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) return candidate;
    } catch {
      // ignore and try next candidate
    }
  }
  return null;
}

function ensurePdfFonts() {
  if (fontsRegistered) return;
  // @react-pdf/font v4 accepts data URLs (strings), file paths, or HTTP URLs —
  // but NOT Buffers. We pass the fonts as base64 data URLs so no filesystem or
  // network I/O is required at runtime; guarantees identical behaviour locally
  // and on Vercel serverless functions.
  const regularDataUrl = `data:font/woff;base64,${HEEBO_400_BASE64}`;
  const boldDataUrl = `data:font/woff;base64,${HEEBO_700_BASE64}`;
  Font.register({
    family: "Heebo",
    fonts: [
      { src: regularDataUrl, fontWeight: 400 },
      { src: boldDataUrl, fontWeight: 700 },
    ],
  });
  // Disable hyphenation for Hebrew — it does not apply.
  Font.registerHyphenationCallback((word) => [word]);
  fontsRegistered = true;
}

const COLORS = {
  primary: "#4338ca",
  primaryDark: "#312e81",
  primaryLight: "#eef2ff",
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
    fontSize: 9,
    color: COLORS.slate900,
    paddingTop: 22,
    paddingBottom: 30,
    paddingHorizontal: 22,
    backgroundColor: "#ffffff",
    textAlign: "right",
  },
  // Header (cover)
  header: {
    flexDirection: "row-reverse",
    alignItems: "center",
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    color: "#ffffff",
  },
  headerTextWrap: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    paddingLeft: 12,
    paddingRight: 0,
  },
  brand: {
    fontSize: 9,
    color: "#c7d2fe",
    marginBottom: 4,
    textAlign: "right",
    width: "100%",
  },
  studentName: {
    fontSize: 18,
    fontWeight: 700,
    color: "#ffffff",
    textAlign: "right",
    marginBottom: 2,
    width: "100%",
  },
  headerMeta: {
    fontSize: 9,
    color: "#e0e7ff",
    textAlign: "right",
    width: "100%",
  },
  logo: {
    width: 110,
    height: 62,
    objectFit: "contain",
    flexShrink: 0,
  },
  // Identity strip
  identityStrip: {
    flexDirection: "row-reverse",
    flexWrap: "wrap",
    backgroundColor: COLORS.slate50,
    borderWidth: 1,
    borderColor: COLORS.slate200,
    borderRadius: 8,
    padding: 8,
    marginBottom: 10,
    gap: 8,
  },
  identityChip: {
    flexDirection: "row-reverse",
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: COLORS.slate200,
    borderRadius: 999,
    paddingVertical: 3,
    paddingHorizontal: 8,
  },
  identityChipLabel: {
    fontSize: 8,
    color: COLORS.slate500,
    marginLeft: 4,
    textAlign: "right",
  },
  identityChipValue: {
    fontSize: 9,
    color: COLORS.slate900,
    fontWeight: 700,
    textAlign: "right",
  },
  // Section
  section: {
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: 700,
    color: COLORS.primaryDark,
    marginBottom: 6,
    textAlign: "right",
  },
  // KPI cards
  kpiRow: {
    flexDirection: "row-reverse",
    flexWrap: "wrap",
    gap: 6,
  },
  kpiCard: {
    width: "32%",
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: COLORS.slate200,
    borderRadius: 8,
    padding: 8,
  },
  kpiLabel: {
    fontSize: 8,
    color: COLORS.slate500,
    marginBottom: 3,
    textAlign: "right",
  },
  kpiValue: {
    fontSize: 15,
    fontWeight: 700,
    color: COLORS.primaryDark,
    textAlign: "right",
  },
  kpiSubtitle: {
    fontSize: 7.5,
    color: COLORS.slate500,
    marginTop: 2,
    textAlign: "right",
  },
  kpiAccentBar: {
    height: 3,
    borderRadius: 2,
    backgroundColor: COLORS.primary,
    marginBottom: 6,
  },
  // Badges row (candidate status)
  badgeRow: {
    flexDirection: "row-reverse",
    gap: 6,
    marginTop: 8,
  },
  badge: {
    borderRadius: 6,
    paddingVertical: 4,
    paddingHorizontal: 8,
    fontSize: 8.5,
    fontWeight: 700,
  },
  badgeSuccess: {
    backgroundColor: COLORS.successBg,
    color: COLORS.success,
  },
  badgeInfo: {
    backgroundColor: COLORS.infoBg,
    color: COLORS.info,
  },
  badgeWarning: {
    backgroundColor: COLORS.warningBg,
    color: COLORS.warning,
  },
  badgeDanger: {
    backgroundColor: COLORS.dangerBg,
    color: COLORS.danger,
  },
  badgeMuted: {
    backgroundColor: COLORS.slate100,
    color: COLORS.slate700,
  },
  // Alerts
  alertBox: {
    borderRadius: 8,
    padding: 8,
    marginTop: 6,
    borderRightWidth: 3,
  },
  alertDanger: {
    backgroundColor: COLORS.dangerBg,
    borderRightColor: COLORS.danger,
  },
  alertWarning: {
    backgroundColor: COLORS.warningBg,
    borderRightColor: COLORS.warning,
  },
  alertInfo: {
    backgroundColor: COLORS.infoBg,
    borderRightColor: COLORS.info,
  },
  alertTitle: {
    fontSize: 9.5,
    fontWeight: 700,
    marginBottom: 3,
    textAlign: "right",
  },
  alertItem: {
    fontSize: 8.5,
    lineHeight: 1.4,
    textAlign: "right",
  },
  // Subject table on page 2
  subjectBlock: {
    marginBottom: 8,
    borderWidth: 1,
    borderColor: COLORS.slate200,
    borderRadius: 6,
    overflow: "hidden",
  },
  subjectHeaderRow: {
    flexDirection: "row-reverse",
    backgroundColor: COLORS.primaryLight,
    paddingVertical: 4,
    paddingHorizontal: 8,
    alignItems: "center",
  },
  subjectHeaderTitle: {
    fontSize: 10,
    fontWeight: 700,
    color: COLORS.primaryDark,
    width: "60%",
    textAlign: "right",
  },
  subjectHeaderMeta: {
    fontSize: 8,
    color: COLORS.slate700,
    width: "40%",
    textAlign: "left",
  },
  tableHeaderRow: {
    flexDirection: "row-reverse",
    backgroundColor: COLORS.slate100,
    paddingVertical: 3,
    paddingHorizontal: 4,
    borderTopWidth: 1,
    borderTopColor: COLORS.slate200,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.slate200,
  },
  tableRow: {
    flexDirection: "row-reverse",
    paddingVertical: 3,
    paddingHorizontal: 4,
    borderBottomWidth: 0.5,
    borderBottomColor: COLORS.slate200,
  },
  tableAlt: {
    backgroundColor: COLORS.slate50,
  },
  th: {
    fontSize: 7.5,
    fontWeight: 700,
    color: COLORS.slate700,
    textAlign: "right",
    paddingHorizontal: 2,
  },
  td: {
    fontSize: 7.5,
    color: COLORS.slate900,
    textAlign: "right",
    paddingHorizontal: 2,
    lineHeight: 1.3,
  },
  colTask: {
    width: "38%",
    paddingHorizontal: 4,
    alignItems: "flex-end",
  },
  colWeight: { width: "9%", textAlign: "center" },
  colType: { width: "15%" },
  colStatus: { width: "12%", alignItems: "flex-end" },
  colScore: { width: "10%", textAlign: "center" },
  colDetail: { width: "16%" },
  taskName: {
    fontSize: 7.5,
    color: COLORS.slate900,
    textAlign: "right",
    width: "100%",
    lineHeight: 1.3,
  },
  taskDetail: {
    fontSize: 7,
    color: COLORS.slate500,
    textAlign: "right",
    width: "100%",
    lineHeight: 1.3,
    marginTop: 2,
  },
  // Subjects section wrapper
  subjectsSection: {
    marginTop: 4,
  },
  subjectsSectionTitle: {
    fontSize: 11,
    fontWeight: 700,
    color: COLORS.primaryDark,
    marginBottom: 6,
    textAlign: "right",
  },
});

function statusBadgeStyle(statusLabel: string) {
  if (statusLabel === "נבדק") return styles.badgeSuccess;
  if (statusLabel === "חסר ציון" || statusLabel === "לא עבר") return styles.badgeDanger;
  if (statusLabel === "בתהליך" || statusLabel === "הוגש") return styles.badgeWarning;
  if (statusLabel === "פטור") return styles.badgeMuted;
  return styles.badgeInfo;
}

function StatusPill({ label }: { label: string }) {
  return (
    <Text style={[styles.badge, statusBadgeStyle(label), { fontSize: 7.5, paddingVertical: 1.5, paddingHorizontal: 5 }]}>
      {label}
    </Text>
  );
}

function IdentityChip({ label, value }: { label: string; value: string | number | null | undefined }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <View style={styles.identityChip}>
      <Text style={styles.identityChipLabel}>{label}</Text>
      <Text style={styles.identityChipValue}>{String(value)}</Text>
    </View>
  );
}

function KpiCard({
  label,
  value,
  subtitle,
  tone = "primary",
}: {
  label: string;
  value: string | number;
  subtitle?: string;
  tone?: "primary" | "success" | "warning" | "danger" | "info";
}) {
  const toneColor =
    tone === "success"
      ? COLORS.success
      : tone === "warning"
        ? COLORS.warning
        : tone === "danger"
          ? COLORS.danger
          : tone === "info"
            ? COLORS.info
            : COLORS.primary;
  return (
    <View style={styles.kpiCard}>
      <View style={[styles.kpiAccentBar, { backgroundColor: toneColor }]} />
      <Text style={styles.kpiLabel}>{label}</Text>
      <Text style={[styles.kpiValue, { color: toneColor }]}>{String(value)}</Text>
      {subtitle ? <Text style={styles.kpiSubtitle}>{subtitle}</Text> : null}
    </View>
  );
}

function StudentPage({
  dossier,
  logoSrc,
}: {
  dossier: StudentDossier;
  logoSrc: string | null;
}) {
  return (
    <Page size="A4" style={styles.page} wrap>
      <View style={styles.header}>
        <View style={styles.headerTextWrap}>
          <Text style={styles.brand}>מערכת מעקב בגרות · ישיבה תיכונית</Text>
          <Text style={styles.studentName}>{`תיק תלמיד — ${dossier.identity.name}`}</Text>
          <Text style={styles.headerMeta}>{`הופק בתאריך ${dossier.exportedAt}`}</Text>
        </View>
        {logoSrc ? <Image src={logoSrc} style={styles.logo} /> : null}
      </View>

      <View style={styles.identityStrip}>
        <IdentityChip label="כיתה" value={dossier.identity.className} />
        <IdentityChip label="שכבה" value={dossier.identity.gradeYear} />
        <IdentityChip label="מסלול" value={dossier.identity.examPathLabel} />
        <IdentityChip label="מגמות" value={dossier.identity.trackLabel} />
        <IdentityChip label='מתמטיקה יח"ל' value={dossier.identity.mathUnits} />
        <IdentityChip label='אנגלית יח"ל' value={dossier.identity.englishUnits} />
        <IdentityChip label="אימייל" value={dossier.identity.email} />
        <IdentityChip label="הרחבות" value={dossier.identity.extensions} />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>סיכום התלמיד</Text>
        <View style={styles.kpiRow}>
          <KpiCard
            label="התקדמות כללית"
            value={`${dossier.summary.overallProgress.toFixed(0)}%`}
            tone="primary"
          />
          <KpiCard
            label="ממוצע בגרות משוקלל"
            value={dossier.summary.weightedAverage != null ? dossier.summary.weightedAverage : "—"}
            subtitle={`${dossier.summary.gradedSubjectsCount} מקצועות · ${dossier.summary.weightedUnits} יח"ל`}
            tone="info"
          />
          <KpiCard
            label="חובות שהושלמו"
            value={`${dossier.summary.completedObligations}/${dossier.summary.totalObligations}`}
            tone="success"
          />
        </View>

        <View style={styles.badgeRow}>
          <Text
            style={[
              styles.badge,
              dossier.summary.outstandingLabel === "מועמד" ? styles.badgeSuccess : styles.badgeMuted,
            ]}
          >
            {`בגרות מצטיינת: ${
              dossier.summary.outstandingTierLabel
                ? `${dossier.summary.outstandingLabel} — ${dossier.summary.outstandingTierLabel}`
                : dossier.summary.outstandingLabel
            }`}
          </Text>
          <Text
            style={[
              styles.badge,
              dossier.summary.hightechLabel === "מועמד" ? styles.badgeInfo : styles.badgeMuted,
            ]}
          >
            {`בגרות הייטק: ${dossier.summary.hightechLabel}`}
          </Text>
        </View>
      </View>

      {dossier.alerts.missingGrades.length > 0 ? (
        <View style={[styles.alertBox, styles.alertDanger]}>
          <Text style={styles.alertTitle}>{`ציונים חסרים (${dossier.alerts.missingGrades.length})`}</Text>
          {dossier.alerts.missingGrades.slice(0, 6).map((entry, index) => (
            <Text key={`missing-${index}`} style={styles.alertItem}>
              {`• ${entry.subjectLabel} — ${entry.obligationLabel}`}
            </Text>
          ))}
          {dossier.alerts.missingGrades.length > 6 ? (
            <Text style={styles.alertItem}>
              {`+ ${dossier.alerts.missingGrades.length - 6} נוספים`}
            </Text>
          ) : null}
        </View>
      ) : null}

      {dossier.alerts.negativeGrades.length > 0 ? (
        <View style={[styles.alertBox, styles.alertWarning]}>
          <Text style={styles.alertTitle}>{`ציונים שליליים (${dossier.alerts.negativeGrades.length})`}</Text>
          {dossier.alerts.negativeGrades.slice(0, 6).map((entry, index) => (
            <Text key={`neg-${index}`} style={styles.alertItem}>
              {`• ${entry.subjectLabel} — ${entry.obligationLabel} — ציון ${entry.score}`}
            </Text>
          ))}
        </View>
      ) : null}

      {dossier.alerts.pendingTasks.length > 0 ? (
        <View style={[styles.alertBox, styles.alertInfo]}>
          <Text style={styles.alertTitle}>
            {`מטלות פתוחות להגשה (${dossier.alerts.pendingTasks.length})`}
          </Text>
          {dossier.alerts.pendingTasks.slice(0, 8).map((task, index) => (
            <Text key={`pending-${index}`} style={styles.alertItem}>
              {`• ${task.subjectLabel} — ${task.taskLabel} — עד ${task.dueDate}${
                task.isOverdue ? " (באיחור)" : ""
              }`}
            </Text>
          ))}
          {dossier.alerts.pendingTasks.length > 8 ? (
            <Text style={styles.alertItem}>
              {`+ ${dossier.alerts.pendingTasks.length - 8} מטלות נוספות`}
            </Text>
          ) : null}
        </View>
      ) : null}

      <View style={styles.subjectsSection}>
        <Text style={styles.subjectsSectionTitle}>מקצועות וציונים</Text>
        {dossier.subjects.map((subject) => (
          <View key={subject.id} style={styles.subjectBlock} wrap={false}>
          <View style={styles.subjectHeaderRow}>
            <Text style={styles.subjectHeaderTitle}>{subject.label}</Text>
            <Text style={styles.subjectHeaderMeta}>
              {[
                subject.qualitativeLevelLabel ??
                  (subject.estimatedGrade != null ? `ציון ${subject.estimatedGrade}` : null),
                `${subject.progressPercent.toFixed(0)}%`,
                subject.isFinal ? "סופי" : "ביניים",
              ]
                .filter(Boolean)
                .join(" · ")}
            </Text>
          </View>

          {subject.obligations.length === 0 ? (
            <View style={styles.tableRow}>
              <Text style={[styles.td, { width: "100%", color: COLORS.slate500 }]}>
                אין מטלות רלוונטיות לשכבה זו
              </Text>
            </View>
          ) : (
            <>
              <View style={styles.tableHeaderRow}>
                <Text style={[styles.th, styles.colTask]}>מטלה</Text>
                <Text style={[styles.th, styles.colWeight]}>משקל</Text>
                <Text style={[styles.th, styles.colType]}>סוג</Text>
                <Text style={[styles.th, styles.colStatus]}>סטטוס</Text>
                <Text style={[styles.th, styles.colScore]}>ציון</Text>
                <Text style={[styles.th, styles.colDetail]}>תאריך יעד</Text>
              </View>

              {subject.obligations.map((obligation, index) => {
                const details: string[] = [];
                if (obligation.components.length > 0) {
                  details.push(
                    `רכיבים: ${obligation.components
                      .map((c) => `${c.name} ${c.score ?? "—"}`)
                      .join(" · ")}`
                  );
                }
                if (obligation.subItems.length > 0) {
                  details.push(
                    `תתי-מטלות: ${obligation.subItems
                      .map((s) => `${s.name} ${s.score ?? "—"}`)
                      .join(" · ")}`
                  );
                }
                if (obligation.notes) details.push(`הערות: ${obligation.notes}`);
                return (
                  <View
                    key={obligation.id}
                    style={[styles.tableRow, index % 2 === 1 ? styles.tableAlt : undefined]}
                  >
                    <View style={styles.colTask}>
                      <Text style={styles.taskName}>{obligation.label}</Text>
                      {details.length > 0 ? (
                        <Text style={styles.taskDetail}>{details.join(" • ")}</Text>
                      ) : null}
                    </View>
                    <Text style={[styles.td, styles.colWeight]}>{`${obligation.weightPercent}%`}</Text>
                    <Text style={[styles.td, styles.colType]}>{obligation.examType}</Text>
                    <View style={styles.colStatus}>
                      <StatusPill label={obligation.statusLabel} />
                    </View>
                    <Text style={[styles.td, styles.colScore, { fontWeight: 700 }]}>
                      {String(obligation.score ?? "—")}
                    </Text>
                    <Text style={[styles.td, styles.colDetail]}>
                      {obligation.dueDate ?? obligation.gradeYear ?? "—"}
                    </Text>
                  </View>
                );
              })}
            </>
          )}
          </View>
        ))}
      </View>
    </Page>
  );
}

function resolveLogoDataUrl(): string | null {
  const candidate = resolveExistingFile([
    path.join(process.cwd(), "public", "logos", "logo-2.png"),
    path.join(process.cwd(), "public", "logo-2.png"),
    path.join(process.cwd(), "public", "logos", "logo-1.png"),
  ]);
  if (!candidate) return null;
  try {
    const buffer = fs.readFileSync(candidate);
    return `data:image/png;base64,${buffer.toString("base64")}`;
  } catch {
    return null;
  }
}

function StudentDossierDocument({
  dossiers,
  className,
}: {
  dossiers: StudentDossier[];
  className?: string;
}) {
  ensurePdfFonts();
  const logoSrc = resolveLogoDataUrl();

  return (
    <Document
      title={
        className
          ? `תיקי תלמידים — ${className}`
          : dossiers[0]?.studentName
            ? `תיק תלמיד — ${dossiers[0].studentName}`
            : "תיק תלמיד"
      }
      author="מערכת מעקב בגרות"
      language="he"
    >
      {dossiers.map((dossier) => (
        <StudentPage
          key={dossier.studentId}
          dossier={dossier}
          logoSrc={logoSrc}
        />
      ))}
    </Document>
  );
}

export async function buildStudentDossierPdfBuffer(dossier: StudentDossier) {
  return renderToBuffer(<StudentDossierDocument dossiers={[dossier]} />);
}

export async function buildClassDossiersPdfBuffer(
  className: string,
  dossiers: StudentDossier[]
) {
  return renderToBuffer(
    <StudentDossierDocument dossiers={dossiers} className={className} />
  );
}

export function studentDossierPdfFilename(dossier: StudentDossier) {
  return `${dossier.filenameBase}_${exportTimestamp()}.pdf`;
}

export function classDossiersPdfFilename(className: string) {
  return `תיקי_תלמידים_${className}_${exportTimestamp()}.pdf`;
}
