"use client";

import { useMemo, useState } from "react";
import { Plus, Trash2, UserCog, Pencil } from "lucide-react";
import { useApi } from "@/hooks/useApi";
import { PageLoader } from "@/components/ui/PageLoader";
import { PageHeader } from "@/components/ui/PageHeader";
import { ExportButton } from "@/components/ui/ExportButton";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Alert } from "@/components/ui/Alert";
import { EmptyState } from "@/components/ui/EmptyState";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import {
  buildStaffSheet,
  downloadExcel,
  exportTimestamp,
} from "@/lib/excel-export";
import {
  buildPermissionsFromForm,
  parsePermissionsToForm,
  summarizePermissions,
  type PermissionFormInput,
  type PermissionScopeKind,
} from "@/lib/permissions";
import type { StaffPermission, StaffRole } from "@/lib/types";
import { formatSubjectWithPathLinks } from "@/lib/subject-display";

type StaffMember = {
  id: string;
  email: string;
  name: string;
  role: StaffRole;
  permissions?: StaffPermission[];
  gradeReminderOptOut?: boolean;
};

type ClassItem = { id: string; name: string; gradeYear: string | null };
type SubjectItem = {
  id: string;
  name: string;
  units: number | null;
  category: string;
  pathLinks?: Array<{ path: { label: string } }>;
};

type SubjectPickerItem = { id: string; name: string };

type PermissionForm = PermissionFormInput;

const emptyPermissionForm = (): PermissionForm => ({
  scopes: ["all"],
  gradeYears: [],
  classIds: [],
  subjectIds: [],
  includeStudentView: true,
  includeStudentEdit: false,
});

const SCOPE_OPTIONS: { value: PermissionScopeKind; label: string; hint: string }[] = [
  { value: "all", label: "כל המערכת", hint: "גישה מלאה (בלעדי)" },
  { value: "gradeYear", label: "רכז שכבה", hint: "לפי שכבה" },
  { value: "class", label: "מחנך כיתה", hint: "לפי כיתה" },
  { value: "subject", label: "מורה מקצועי", hint: "לפי מקצוע" },
];

function PermissionFields({
  form,
  setForm,
  classes,
  subjects,
  gradeYears,
}: {
  form: PermissionForm;
  setForm: (f: PermissionForm) => void;
  classes: ClassItem[];
  subjects: SubjectPickerItem[];
  gradeYears: string[];
}) {
  const scopes = new Set(form.scopes);
  const hasAll = scopes.has("all");
  const hasNonSubject =
    scopes.has("gradeYear") || scopes.has("class") || scopes.has("all");

  function toggleScope(value: PermissionScopeKind, checked: boolean) {
    if (value === "all") {
      setForm({
        ...form,
        scopes: checked ? ["all"] : [],
        gradeYears: [],
        classIds: [],
        subjectIds: [],
      });
      return;
    }

    let next = form.scopes.filter((s) => s !== "all" && s !== value);
    if (checked) next = [...next, value];
    setForm({
      ...form,
      scopes: next,
      ...(value === "gradeYear" && !checked ? { gradeYears: [] } : {}),
      ...(value === "class" && !checked ? { classIds: [] } : {}),
      ...(value === "subject" && !checked ? { subjectIds: [] } : {}),
    });
  }

  return (
    <div className="mt-4 space-y-4 rounded-xl border border-slate-100 bg-slate-50 p-4">
      <div>
        <label className="label">היקף הרשאות</label>
        <p className="mt-1 text-xs text-slate-500">
          ניתן לשלב כמה תפקידים יחד (למשל מחנך + מורה מקצועי + רכז שכבה)
        </p>
        <div className="mt-2 flex flex-wrap gap-3">
          {SCOPE_OPTIONS.map(({ value, label, hint }) => (
            <label key={value} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={scopes.has(value)}
                disabled={hasAll && value !== "all"}
                onChange={(e) => toggleScope(value, e.target.checked)}
              />
              <span>
                {label}
                <span className="mr-1 text-xs text-slate-400">({hint})</span>
              </span>
            </label>
          ))}
        </div>
      </div>

      {scopes.has("gradeYear") && (
        <div>
          <label className="label">שכבות (רכז שכבה)</label>
          <div className="mt-2 flex flex-wrap gap-2">
            {gradeYears.map((gy) => (
              <label key={gy} className="flex items-center gap-2 rounded-lg border bg-white px-3 py-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.gradeYears.includes(gy)}
                  onChange={(e) => {
                    const next = e.target.checked
                      ? [...form.gradeYears, gy]
                      : form.gradeYears.filter((g) => g !== gy);
                    setForm({ ...form, gradeYears: next });
                  }}
                />
                {gy}
              </label>
            ))}
          </div>
        </div>
      )}

      {scopes.has("class") && (
        <div>
          <label className="label">כיתות (מחנך)</label>
          <div className="mt-2 max-h-40 space-y-1 overflow-y-auto rounded-lg border bg-white p-2">
            {classes.map((c) => (
              <label key={c.id} className="flex items-center gap-2 px-2 py-1 text-sm">
                <input
                  type="checkbox"
                  checked={form.classIds.includes(c.id)}
                  onChange={(e) => {
                    const next = e.target.checked
                      ? [...form.classIds, c.id]
                      : form.classIds.filter((id) => id !== c.id);
                    setForm({ ...form, classIds: next });
                  }}
                />
                {c.name}
                {c.gradeYear ? ` (${c.gradeYear})` : ""}
              </label>
            ))}
          </div>
        </div>
      )}

      {scopes.has("subject") && (
        <div>
          <label className="label">מקצועות (מורה מקצועי)</label>
          <div className="mt-2 max-h-40 space-y-1 overflow-y-auto rounded-lg border bg-white p-2">
            {subjects.map((s) => (
              <label key={s.id} className="flex items-center gap-2 px-2 py-1 text-sm">
                <input
                  type="checkbox"
                  checked={form.subjectIds.includes(s.id)}
                  onChange={(e) => {
                    const next = e.target.checked
                      ? [...form.subjectIds, s.id]
                      : form.subjectIds.filter((id) => id !== s.id);
                    setForm({ ...form, subjectIds: next });
                  }}
                />
                {s.name}
              </label>
            ))}
          </div>
          <p className="mt-2 text-sm text-slate-600">
            למקצועות שנבחרו: הזנת ציונים + צפייה בתלמידים הרלוונטיים (ללא עריכת נתוני תלמידים).
          </p>
        </div>
      )}

      {hasNonSubject && (
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.includeStudentView}
              onChange={(e) => setForm({ ...form, includeStudentView: e.target.checked })}
            />
            גישה לצפייה בתלמידים (בהיקף שכבה/כיתה)
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.includeStudentEdit}
              onChange={(e) => setForm({ ...form, includeStudentEdit: e.target.checked })}
            />
            הרשאה לעריכת נתוני תלמידים (בהיקף שכבה/כיתה)
          </label>
        </div>
      )}
    </div>
  );
}

function formatPermissionSummary(
  member: StaffMember,
  classes: ClassItem[],
  subjects: SubjectPickerItem[]
): string {
  if (member.role === "ADMIN") return "מנהל — הרשאות מלאות";
  if (!member.permissions?.length) return "ללא הרשאות";

  const parts: string[] = [];
  const grades = member.permissions.filter((p) => p.action === "grades:write");

  if (grades.some((p) => p.scope === "all")) {
    parts.push("ציונים: כל המערכת");
  } else {
    const roleParts: string[] = [];
    const years = [
      ...new Set(
        grades
          .filter((p) => p.scope === "gradeYear")
          .map((p) => (p as { gradeYear: string }).gradeYear)
      ),
    ];
    if (years.length) roleParts.push(`רכז ${years.join(", ")}`);

    const classNames = grades
      .filter((p) => p.scope === "class")
      .map((p) => classes.find((c) => c.id === p.classId)?.name ?? "כיתה");
    if (classNames.length) roleParts.push(`מחנך ${[...new Set(classNames)].join(", ")}`);

    const subjectNames = grades
      .filter((p) => p.scope === "subject")
      .map((p) => subjects.find((s) => s.id === p.subjectId)?.name ?? "מקצוע");
    if (subjectNames.length) {
      roleParts.push(`מקצועי: ${[...new Set(subjectNames)].join(", ")}`);
    }

    if (roleParts.length) parts.push(roleParts.join(" · "));
  }

  if (member.permissions.some((p) => p.action === "students:view" && p.scope !== "subject")) {
    parts.push("צפייה בתלמידים");
  }
  if (member.permissions.some((p) => p.action === "students:edit")) {
    parts.push("עריכת תלמידים");
  }

  return parts.join(" · ") || summarizePermissions(member.role, member.permissions);
}

function validatePermissionForm(form: PermissionForm): string | null {
  if (form.scopes.length === 0) {
    return "יש לבחור לפחות היקף הרשאות אחד";
  }
  if (form.scopes.includes("all")) return null;
  if (form.scopes.includes("gradeYear") && form.gradeYears.length === 0) {
    return "יש לבחור לפחות שכבה אחת";
  }
  if (form.scopes.includes("class") && form.classIds.length === 0) {
    return "יש לבחור לפחות כיתה אחת";
  }
  if (form.scopes.includes("subject") && form.subjectIds.length === 0) {
    return "יש לבחור לפחות מקצוע אחד";
  }
  return null;
}

export default function StaffPage() {
  const confirm = useConfirm();
  const toast = useToast();

  const { data: staff = [], loading, mutate: refreshStaff } = useApi<StaffMember[]>("/api/staff");
  const { data: classes = [] } = useApi<ClassItem[]>("/api/classes");
  const { data: subjects = [] } = useApi<SubjectItem[]>("/api/subjects");

  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<StaffRole>("TEACHER");
  const [permForm, setPermForm] = useState<PermissionForm>(emptyPermissionForm());
  const [formError, setFormError] = useState<string | null>(null);

  const [editing, setEditing] = useState<StaffMember | null>(null);
  const [editName, setEditName] = useState("");
  const [editRole, setEditRole] = useState<StaffRole>("TEACHER");
  const [editPermForm, setEditPermForm] = useState<PermissionForm>(emptyPermissionForm());
  const [editError, setEditError] = useState<string | null>(null);

  const gradeYears = useMemo(() => {
    const years = new Set<string>();
    for (const c of classes) {
      if (c.gradeYear) years.add(c.gradeYear);
    }
    return [...years].sort((a, b) => a.localeCompare(b, "he"));
  }, [classes]);

  const simpleClasses = useMemo(
    () => classes.map((c) => ({ id: c.id, name: c.name, gradeYear: c.gradeYear })),
    [classes]
  );

  const simpleSubjects = useMemo(
    () =>
      subjects.map((s) => ({
        id: s.id,
        name: formatSubjectWithPathLinks(s.name, s.pathLinks, {
          units: s.units,
          category: s.category,
        }),
      })),
    [subjects]
  );

  async function load() {
    await refreshStaff();
  }

  async function addStaff() {
    if (!email) return;
    const validationError =
      role === "TEACHER" ? validatePermissionForm(permForm) : null;
    if (validationError) {
      setFormError(validationError);
      return;
    }

    const permissions =
      role === "TEACHER" ? buildPermissionsFromForm(permForm) : undefined;

    const res = await fetch("/api/staff", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        name: name || email,
        role,
        permissions,
      }),
    });
    if (res.ok) {
      setEmail("");
      setName("");
      setRole("TEACHER");
      setPermForm(emptyPermissionForm());
      setFormError(null);
      toast.success("משתמש הצוות נוסף בהצלחה");
      load();
    } else {
      const data = await res.json();
      setFormError(data.error);
    }
  }

  function openEdit(member: StaffMember) {
    setEditing(member);
    setEditName(member.name);
    setEditRole(member.role);
    setEditPermForm(parsePermissionsToForm(member.permissions));
    setEditError(null);
  }

  async function saveEdit() {
    if (!editing) return;
    const validationError =
      editRole === "TEACHER" ? validatePermissionForm(editPermForm) : null;
    if (validationError) {
      setEditError(validationError);
      return;
    }

    const permissions =
      editRole === "TEACHER" ? buildPermissionsFromForm(editPermForm) : undefined;

    const res = await fetch("/api/staff", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: editing.id,
        name: editName,
        role: editRole,
        permissions,
      }),
    });
    if (res.ok) {
      setEditing(null);
      toast.success("נשמר בהצלחה");
      load();
    } else {
      const data = await res.json();
      setEditError(data.error);
    }
  }

  async function toggleReminderOptOut(member: StaffMember) {
    const res = await fetch("/api/staff", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: member.id,
        gradeReminderOptOut: !member.gradeReminderOptOut,
      }),
    });
    if (res.ok) {
      toast.success(
        member.gradeReminderOptOut
          ? "תזכורות הופעלו למשתמש"
          : "תזכורות הושבתו למשתמש"
      );
      load();
    } else {
      const data = await res.json();
      toast.error(data.error);
    }
  }

  async function remove(id: string) {
    const ok = await confirm({
      title: "הסרת משתמש צוות",
      description: "להסיר משתמש צוות זה מהמערכת?",
      confirmLabel: "הסר",
      variant: "danger",
    });
    if (!ok) return;
    const res = await fetch(`/api/staff?id=${id}`, { method: "DELETE" });
    if (res.ok) {
      toast.success("המשתמש הוסר");
      load();
    } else {
      const data = await res.json();
      toast.error(data.error);
    }
  }

  async function handleExport() {
    await downloadExcel(`צוות_${exportTimestamp()}.xlsx`, [buildStaffSheet(staff)]);
  }

  if (loading && staff.length === 0) {
    return <PageLoader />;
  }

  return (
    <>
      <PageHeader
        title="ניהול צוות והרשאות"
        subtitle="הוספת מנהלים ומורים עם הרשאות מותאמות — כולל שילוב תפקידים"
      >
        <ExportButton onExport={handleExport} disabled={staff.length === 0} />
      </PageHeader>

      <Card className="mt-8 p-6">
        <h2 className="font-semibold">הוספת משתמש צוות</h2>
        {formError && (
          <Alert variant="error" className="mt-4" onClose={() => setFormError(null)}>
            {formError}
          </Alert>
        )}
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Input
            label="אימייל Google"
            dir="ltr"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="teacher@zvialod.com"
          />
          <Input label="שם" value={name} onChange={(e) => setName(e.target.value)} />
        </div>

        <div className="mt-4">
          <label className="label">תפקיד</label>
          <div className="mt-2 flex gap-4">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                checked={role === "ADMIN"}
                onChange={() => setRole("ADMIN")}
              />
              מנהל (הרשאות מלאות)
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                checked={role === "TEACHER"}
                onChange={() => setRole("TEACHER")}
              />
              מורה (הרשאות מותאמות)
            </label>
          </div>
        </div>

        {role === "TEACHER" && (
          <PermissionFields
            form={permForm}
            setForm={setPermForm}
            classes={simpleClasses}
            subjects={simpleSubjects}
            gradeYears={gradeYears}
          />
        )}

        <Button onClick={addStaff} className="mt-4">
          <Plus className="h-4 w-4" />
          הוספה
        </Button>
      </Card>

      <Card variant="flat" className="mt-6 overflow-hidden">
        {loading ? (
          <p className="p-6 text-slate-500">טוען...</p>
        ) : staff.length === 0 ? (
          <EmptyState
            icon={UserCog}
            title="אין משתמשי צוות"
            description="הוסיפו מנהלים ומורים עם הרשאות מותאמות"
            className="border-0 bg-transparent"
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-4 py-3 text-right font-medium">שם</th>
                  <th className="px-4 py-3 text-right font-medium">אימייל</th>
                  <th className="px-4 py-3 text-right font-medium">תפקיד</th>
                  <th className="px-4 py-3 text-right font-medium">הרשאות</th>
                  <th className="px-4 py-3 text-right font-medium">תזכורות מייל</th>
                  <th className="px-4 py-3 text-right font-medium">פעולות</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {staff.map((s) => (
                  <tr key={s.id}>
                    <td className="px-4 py-3 font-medium">{s.name}</td>
                    <td className="px-4 py-3 text-slate-500" dir="ltr">
                      {s.email}
                    </td>
                    <td className="px-4 py-3">
                      {s.role === "ADMIN" ? "מנהל" : "מורה"}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {formatPermissionSummary(s, simpleClasses, simpleSubjects)}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => toggleReminderOptOut(s)}
                        className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                          s.gradeReminderOptOut
                            ? "bg-slate-100 text-slate-500"
                            : "bg-emerald-50 text-emerald-700"
                        }`}
                      >
                        {s.gradeReminderOptOut ? "מושבת" : "פעיל"}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => openEdit(s)}
                          aria-label="עריכה"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => remove(s.id)}
                          className="text-red-500 hover:bg-red-50 hover:text-red-600"
                          aria-label="הסרה"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title="עריכת משתמש צוות"
        size="lg"
      >
        {editError && (
          <Alert variant="error" className="mb-4" onClose={() => setEditError(null)}>
            {editError}
          </Alert>
        )}
        <Input
          label="שם"
          value={editName}
          onChange={(e) => setEditName(e.target.value)}
        />

        <div className="mt-4">
          <label className="label">תפקיד</label>
          <div className="mt-2 flex gap-4">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                checked={editRole === "ADMIN"}
                onChange={() => setEditRole("ADMIN")}
              />
              מנהל
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                checked={editRole === "TEACHER"}
                onChange={() => setEditRole("TEACHER")}
              />
              מורה
            </label>
          </div>
        </div>

        {editRole === "TEACHER" && (
          <PermissionFields
            form={editPermForm}
            setForm={setEditPermForm}
            classes={simpleClasses}
            subjects={simpleSubjects}
            gradeYears={gradeYears}
          />
        )}

        <div className="mt-6 flex gap-3">
          <Button onClick={saveEdit}>שמירה</Button>
          <Button variant="secondary" onClick={() => setEditing(null)}>
            ביטול
          </Button>
        </div>
      </Modal>

      <Alert variant="info" className="mt-6" title="מנהלי-על (לא ניתנים לעריכה מהאתר)">
        <p>
          yossitole@gmail.com, yosseftole@zvialod.com — מוגדרים בקוד עם הרשאות מנהל מלאות
        </p>
      </Alert>
    </>
  );
}
