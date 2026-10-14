"use client";

import { useState, type FormEvent } from "react";
import { Landmark, LogIn, Pencil, Plus, Trash2 } from "lucide-react";
import { useApi } from "@/hooks/useApi";
import { useAuth } from "@/components/AuthProvider";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageLoader } from "@/components/ui/PageLoader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Alert } from "@/components/ui/Alert";
import { EmptyState } from "@/components/ui/EmptyState";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import { invalidateCache } from "@/lib/api-cache";
import type { EducationalInstitution } from "@/lib/institutions";

async function readError(res: Response): Promise<string> {
  const body = await res.json().catch(() => ({}));
  return (body as { error?: string }).error ?? "שגיאה בשמירה";
}

export default function InstitutionsPage() {
  const { session } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const { data: institutions = [], loading, error, mutate } = useApi<EducationalInstitution[]>(
    session?.platformAdmin ? "/api/institutions" : null
  );
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [adminDrafts, setAdminDrafts] = useState<Record<string, { name: string; email: string }>>(
    {}
  );

  async function refresh() {
    invalidateCache("/api/institutions");
    await mutate();
  }

  async function addInstitution(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/institutions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) {
        toast.error(await readError(res));
        return;
      }
      setName("");
      toast.success("המוסד נוסף, עם מקצועות ומטלות");
      await refresh();
    } finally {
      setSaving(false);
    }
  }

  async function saveName(id: string) {
    setSaving(true);
    try {
      const res = await fetch("/api/institutions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, name: editName }),
      });
      if (!res.ok) {
        toast.error(await readError(res));
        return;
      }
      setEditingId(null);
      toast.success("השם עודכן");
      await refresh();
    } finally {
      setSaving(false);
    }
  }

  async function enterInstitution(institution: EducationalInstitution) {
    setSaving(true);
    try {
      const res = await fetch("/api/institutions/enter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ institutionId: institution.id }),
      });
      if (!res.ok) {
        toast.error(await readError(res));
        return;
      }
      window.location.assign("/admin");
    } finally {
      setSaving(false);
    }
  }

  async function appointAdmin(institution: EducationalInstitution) {
    const draft = adminDrafts[institution.id] ?? { name: "", email: "" };
    setSaving(true);
    try {
      const res = await fetch("/api/institutions/admins", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          institutionId: institution.id,
          name: draft.name,
          email: draft.email,
        }),
      });
      if (!res.ok) {
        toast.error(await readError(res));
        return;
      }
      setAdminDrafts((current) => ({ ...current, [institution.id]: { name: "", email: "" } }));
      toast.success("המנהל מונה. הוא יוכל להיכנס רק למוסד הזה.");
    } finally {
      setSaving(false);
    }
  }

  async function remove(institution: EducationalInstitution) {
    const ok = await confirm({
      title: "מחיקת מוסד",
      description: `למחוק את "${institution.name}"? הוא לא יופיע יותר בדף הכניסה.`,
      confirmLabel: "מחק",
      variant: "danger",
    });
    if (!ok) return;

    const res = await fetch(`/api/institutions?id=${encodeURIComponent(institution.id)}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      toast.error(await readError(res));
      return;
    }
    toast.success("המוסד נמחק");
    await refresh();
  }

  if (session && !session.platformAdmin) {
    return <Alert variant="error">ניהול מוסדות פתוח רק למנהל המערכת.</Alert>;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="מוסדות חינוך"
        subtitle="מוסד חדש מקבל את המקצועות והמטלות של ישיבה תיכונית צביה אלישיב. את המסלולים בונים אחר כך בתוך המוסד."
      />

      <Card className="p-5 sm:p-6">
        <form onSubmit={addInstitution} className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <Input
            label="שם המוסד"
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="לדוגמה: תיכון חדש"
            wrapperClassName="min-w-0 flex-1"
            maxLength={80}
          />
          <Button type="submit" disabled={saving || name.trim().length < 2}>
            <Plus className="h-4 w-4" />
            הוספת מוסד
          </Button>
        </form>
      </Card>

      {error && <Alert variant="error">{error}</Alert>}

      {loading ? (
        <PageLoader />
      ) : institutions.length === 0 ? (
        <EmptyState
          icon={Landmark}
          title="אין עדיין מוסדות"
          description="הוסיפו את המוסד הראשון, והוא יופיע בדף הכניסה."
        />
      ) : (
        <Card className="divide-y divide-slate-100">
          {institutions.map((institution) => {
            const editing = editingId === institution.id;
            return (
              <div
                key={institution.id}
                className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
              >
                {editing ? (
                  <Input
                    value={editName}
                    onChange={(event) => setEditName(event.target.value)}
                    aria-label={`שם המוסד ${institution.name}`}
                    wrapperClassName="min-w-0 flex-1"
                    maxLength={80}
                  />
                ) : (
                  <p className="min-w-0 truncate font-medium text-slate-900">{institution.name}</p>
                )}
                <form
                  className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void appointAdmin(institution);
                  }}
                >
                  <Input
                    value={adminDrafts[institution.id]?.name ?? ""}
                    onChange={(event) =>
                      setAdminDrafts((current) => ({
                        ...current,
                        [institution.id]: {
                          name: event.target.value,
                          email: current[institution.id]?.email ?? "",
                        },
                      }))
                    }
                    placeholder="שם המנהל"
                    aria-label={`שם מנהל עבור ${institution.name}`}
                    wrapperClassName="min-w-0 flex-1"
                  />
                  <Input
                    type="email"
                    value={adminDrafts[institution.id]?.email ?? ""}
                    onChange={(event) =>
                      setAdminDrafts((current) => ({
                        ...current,
                        [institution.id]: {
                          name: current[institution.id]?.name ?? "",
                          email: event.target.value,
                        },
                      }))
                    }
                    placeholder="אימייל Google"
                    aria-label={`אימייל מנהל עבור ${institution.name}`}
                    wrapperClassName="min-w-0 flex-1"
                  />
                  <Button type="submit" size="sm" variant="secondary" disabled={saving}>
                    מינוי מנהל
                  </Button>
                </form>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    disabled={saving}
                    onClick={() => enterInstitution(institution)}
                  >
                    <LogIn className="h-4 w-4" />
                    {session?.institutionId === institution.id ? "המשך במוסד" : "כניסה למוסד"}
                  </Button>
                  {editing ? (
                    <>
                      <Button
                        type="button"
                        size="sm"
                        disabled={saving || editName.trim().length < 2}
                        onClick={() => saveName(institution.id)}
                      >
                        שמירה
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => setEditingId(null)}
                      >
                        ביטול
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          setEditingId(institution.id);
                          setEditName(institution.name);
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                        עריכה
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="text-red-600 hover:bg-red-50 hover:text-red-700"
                        onClick={() => remove(institution)}
                      >
                        <Trash2 className="h-4 w-4" />
                        מחיקה
                      </Button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </Card>
      )}
    </div>
  );
}
