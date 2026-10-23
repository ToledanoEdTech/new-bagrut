import { adminDb } from "@/lib/firebase/admin";
import { cached, invalidateServerCache } from "@/lib/server-cache";
import type {
  Class,
  ExamPath,
  Grade,
  Obligation,
  ObligationClassGradeYearOverride,
  Role,
  StaffPermission,
  QualitativeLevel,
  StaffRecord,
  Student,
  Subject,
  SubmissionStatus,
  Track,
  UserProfile,
} from "@/lib/types";
import { LEGACY_TEACHER_PERMISSIONS } from "@/lib/permissions";
import { shouldDeleteEmptyGrade } from "@/lib/grade-status";
import {
  belongsToInstitution,
  currentInstitutionId,
  ensureInstitutionMigration,
} from "@/lib/institution-scope";
import { FieldValue } from "firebase-admin/firestore";

// ─── helpers ───────────────────────────────────────────────────────────────

function docData<T>(snap: FirebaseFirestore.DocumentSnapshot): T | null {
  if (!snap.exists) return null;
  return { id: snap.id, ...snap.data() } as T;
}

async function activeInstitutionId(): Promise<string> {
  await ensureInstitutionMigration();
  return currentInstitutionId();
}

async function scopedCacheKey(base: string): Promise<string> {
  return `${base}:${await activeInstitutionId()}`;
}

async function scopedCollection(name: string): Promise<FirebaseFirestore.QuerySnapshot> {
  const institutionId = await activeInstitutionId();
  return adminDb.collection(name).where("institutionId", "==", institutionId).get();
}

async function readOwned<T extends { id: string }>(name: string, id: string): Promise<T | null> {
  const institutionId = await activeInstitutionId();
  const snap = await adminDb.collection(name).doc(id).get();
  if (!snap.exists) return null;
  const data = { id: snap.id, ...snap.data() } as T;
  if (!belongsToInstitution(data, institutionId)) return null;
  return data;
}

async function requireOwned(name: string, id: string): Promise<void> {
  const record = await readOwned(name, id);
  if (!record) throw new Error("לא נמצא במוסד הזה");
}

function matchesInstitution(data: object, institutionId: string): boolean {
  return belongsToInstitution(data, institutionId);
}

function docsData<T>(snaps: FirebaseFirestore.QuerySnapshot): T[] {
  return snaps.docs.map((d) => ({ id: d.id, ...d.data() }) as T);
}

function docsMap<T extends { id: string }>(
  snaps: FirebaseFirestore.QuerySnapshot
): Map<string, T> {
  return new Map(
    snaps.docs.map((d) => {
      const item = { id: d.id, ...d.data() } as T;
      return [item.id, item] as const;
    })
  );
}

function newId() {
  return adminDb.collection("_").doc().id;
}

/** Ensure every obligation in a subject has a unique id (fixes sync duplicates). */
export function deduplicateObligations(
  obligations: Obligation[],
  options?: { assignNewIds?: boolean }
): {
  obligations: Obligation[];
  changed: boolean;
} {
  const seenIds = new Set<string>();
  let changed = false;

  const normalized = obligations.map((o, index) => {
    if (!seenIds.has(o.id)) {
      seenIds.add(o.id);
      return o;
    }
    changed = true;
    const id = options?.assignNewIds
      ? newId()
      : `${o.id}__${o.sortOrder ?? index}`;
    const fixed = { ...o, id };
    seenIds.add(fixed.id);
    return fixed;
  });

  return { obligations: normalized, changed };
}

function normalizeSubject(subject: Subject): Subject {
  const { obligations, changed } = deduplicateObligations(subject.obligations ?? []);
  return changed ? { ...subject, obligations } : subject;
}

export function getStudentTrackIds(student: Pick<Student, "trackIds" | "trackId">): string[] {
  if (student.trackIds?.length) return student.trackIds;
  if (student.trackId) return [student.trackId];
  return [];
}

function normalizeStudent(student: Student): Student {
  return { ...student, trackIds: getStudentTrackIds(student) };
}

// ─── users ─────────────────────────────────────────────────────────────────

export async function isStaffEmail(email: string): Promise<boolean> {
  const staff = await getStaffByEmail(email);
  return staff !== null;
}

export async function findStaffInInstitution(
  email: string,
  institutionId: string
): Promise<StaffRecord | null> {
  const normalized = email.toLowerCase().trim();
  const snap = await adminDb.collection("staff").where("email", "==", normalized).get();
  const match = snap.docs.find((doc) => matchesInstitution(doc.data(), institutionId));
  if (!match) return null;
  return { id: match.id, ...match.data() } as StaffRecord;
}

export async function findStudentInInstitution(
  email: string,
  institutionId: string
): Promise<Student | null> {
  const normalized = email.toLowerCase().trim();
  const snap = await adminDb.collection("students").where("email", "==", normalized).get();
  const match = snap.docs.find((doc) => matchesInstitution(doc.data(), institutionId));
  if (!match) return null;
  return normalizeStudent({ id: match.id, ...match.data() } as Student);
}

export async function resolveMembership(
  email: string,
  institutionId: string
): Promise<{
  role: Role;
  studentId: string | null;
  name: string;
  permissions?: StaffPermission[];
} | null> {
  await ensureInstitutionMigration();
  const normalized = email.toLowerCase().trim();
  const staff = await findStaffInInstitution(normalized, institutionId);
  if (staff) {
    if (staff.role === "ADMIN") {
      return { role: "ADMIN", studentId: null, name: staff.name };
    }
    return {
      role: "TEACHER",
      studentId: null,
      name: staff.name,
      permissions: resolveStaffPermissions(staff),
    };
  }

  const student = await findStudentInInstitution(normalized, institutionId);
  if (student) {
    return { role: "STUDENT", studentId: student.id, name: student.name };
  }
  return null;
}

export async function getStaffByEmail(email: string): Promise<StaffRecord | null> {
  const normalized = email.toLowerCase().trim();
  const institutionId = await activeInstitutionId();
  return cached(`staff:email:${institutionId}:${normalized}`, 120_000, async () =>
    findStaffInInstitution(normalized, institutionId)
  );
}

export async function listStaff(): Promise<StaffRecord[]> {
  const key = await scopedCacheKey("staff");
  return cached(key, 120_000, async () => {
    const snap = await scopedCollection("staff");
    return docsData<StaffRecord>(snap).sort((a, b) => a.email.localeCompare(b.email));
  });
}

export async function listAllGrades(): Promise<Grade[]> {
  const key = await scopedCacheKey("grades");
  return cached(key, 60_000, async () => {
    const snap = await scopedCollection("grades");
    return docsData<Grade>(snap);
  });
}

/** מורים קיימים ללא שדה permissions מקבלים גישה מלאה (תאימות לאחור) */
export function resolveStaffPermissions(staff: StaffRecord | null): StaffPermission[] | undefined {
  if (!staff) return undefined;
  if (staff.role === "ADMIN") return undefined;
  if (staff.permissions === undefined) {
    return LEGACY_TEACHER_PERMISSIONS;
  }
  return staff.permissions;
}

export async function resolveUserRole(email: string): Promise<{
  role: Role | null;
  studentId: string | null;
  permissions?: StaffPermission[];
}> {
  const membership = await resolveMembership(email, await activeInstitutionId());
  if (!membership) return { role: null, studentId: null };
  return {
    role: membership.role,
    studentId: membership.studentId,
    permissions: membership.permissions,
  };
}

export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  return docData<UserProfile>(await adminDb.collection("users").doc(uid).get());
}

export async function getOrCreateUserProfile(input: {
  uid: string;
  email: string;
  name: string;
  photoURL: string | null;
}): Promise<UserProfile> {
  const ref = adminDb.collection("users").doc(input.uid);
  const snap = await ref.get();

  if (snap.exists) {
    const data = snap.data() as UserProfile;
    await ref.update({
      name: input.name,
      photoURL: input.photoURL,
      email: input.email,
      updatedAt: FieldValue.serverTimestamp(),
    });
    return { ...data, uid: input.uid, name: input.name, photoURL: input.photoURL, email: input.email };
  }

  const profile: UserProfile = {
    uid: input.uid,
    email: input.email,
    name: input.name,
    photoURL: input.photoURL,
    role: "STUDENT",
    studentId: null,
  };

  await ref.set({ ...profile, createdAt: FieldValue.serverTimestamp() });
  return profile;
}

export async function setUserRole(uid: string, role: Role) {
  await adminDb.collection("users").doc(uid).update({ role });
}

// ─── students ──────────────────────────────────────────────────────────────

export async function getStudentByEmail(email: string): Promise<Student | null> {
  return findStudentInInstitution(email, await activeInstitutionId());
}

export async function getStudentById(id: string): Promise<Student | null> {
  const student = await readOwned<Student>("students", id);
  return student ? normalizeStudent(student) : null;
}

export async function listStudents(): Promise<Student[]> {
  const key = await scopedCacheKey("students");
  return cached(key, 60_000, async () => {
    const snap = await scopedCollection("students");
    return docsData<Student>(snap)
      .map(normalizeStudent)
      .sort((a, b) => a.name.localeCompare(b.name, "he"));
  });
}

export async function createStudent(data: Omit<Student, "id" | "uid">) {
  const cls = await getClassById(data.classId);
  if (!cls) throw new Error("הכיתה לא נמצאה במוסד הזה");
  const institution = await activeInstitutionId();
  const id = newId();
  const trackIds = getStudentTrackIds(data);
  const student: Student = {
    id,
    uid: null,
    email: data.email.toLowerCase().trim(),
    name: data.name,
    classId: data.classId,
    trackIds,
    mathUnits: data.mathUnits,
    englishUnits: data.englishUnits,
    extensions: data.extensions ?? null,
    ...(data.mandatorySubjectIds !== undefined && {
      mandatorySubjectIds: data.mandatorySubjectIds,
    }),
  };
  await adminDb.collection("students").doc(id).set({
    ...student,
    institutionId: institution,
    createdAt: FieldValue.serverTimestamp(),
  });
  await invalidateServerCache("students");
  return student;
}

export async function updateStudent(
  id: string,
  data: Partial<Omit<Student, "id">>
) {
  const updates: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined) updates[key] = value;
  }
  if (data.mandatorySubjectIds === null) {
    updates.mandatorySubjectIds = FieldValue.delete();
  }
  await requireOwned("students", id);
  if (data.classId) {
    const cls = await getClassById(data.classId);
    if (!cls) throw new Error("הכיתה לא נמצאה במוסד הזה");
  }
  if (data.email) updates.email = data.email.toLowerCase().trim();
  if (data.trackIds !== undefined) {
    updates.trackIds = data.trackIds;
    updates.trackId = FieldValue.delete();
  }
  await adminDb.collection("students").doc(id).update(updates);
  await invalidateServerCache("students");
  return getStudentById(id);
}

export async function deleteStudent(id: string) {
  await requireOwned("students", id);
  const grades = await adminDb.collection("grades").where("studentId", "==", id).get();
  const batch = adminDb.batch();
  grades.docs.forEach((d) => batch.delete(d.ref));
  batch.delete(adminDb.collection("students").doc(id));
  await batch.commit();
  await invalidateServerCache("students");
  await invalidateServerCache("grades");
}

type EnrichLookup = {
  classes: Map<string, Class>;
  tracks: Map<string, Track>;
  examPaths: Map<string, ExamPath>;
};

function enrichStudentFromLookup(student: Student, lookup: EnrichLookup) {
  const cls = lookup.classes.get(student.classId) ?? null;
  const trackIds = getStudentTrackIds(student);
  const tracks = trackIds
    .map((id) => lookup.tracks.get(id))
    .filter(Boolean) as Track[];
  const examPath = cls ? lookup.examPaths.get(cls.examPathId) ?? null : null;

  return {
    id: student.id,
    mathUnits: student.mathUnits,
    englishUnits: student.englishUnits,
    extensions: student.extensions,
    mandatorySubjectIds: student.mandatorySubjectIds ?? null,
    user: { id: student.uid ?? student.id, name: student.name, email: student.email },
    class: cls
      ? { id: cls.id, name: cls.name, gradeYear: cls.gradeYear, examPath: examPath ?? { id: "", label: "", key: "" } }
      : null,
    tracks,
    track: tracks[0] ?? null,
  };
}

export async function enrichStudent(student: Student) {
  const trackIds = getStudentTrackIds(student);
  const cls = await readOwned<Class>("classes", student.classId);
  const tracks = (
    await Promise.all(trackIds.map((id) => readOwned<Track>("tracks", id)))
  ).filter((track): track is Track => track !== null);
  const examPath = cls ? await readOwned<ExamPath>("examPaths", cls.examPathId) : null;

  return enrichStudentFromLookup(student, {
    classes: cls ? new Map([[cls.id, cls]]) : new Map(),
    tracks: new Map(tracks.map((t) => [t.id, t])),
    examPaths: examPath ? new Map([[examPath.id, examPath]]) : new Map(),
  });
}

export async function listStudentsEnriched() {
  const key = await scopedCacheKey("students:enriched");
  return cached(key, 60_000, async () => {
    const [students, classesSnap, tracksSnap, pathsSnap] = await Promise.all([
      listStudents(),
      scopedCollection("classes"),
      scopedCollection("tracks"),
      scopedCollection("examPaths"),
    ]);

    const lookup: EnrichLookup = {
      classes: docsMap<Class>(classesSnap),
      tracks: docsMap<Track>(tracksSnap),
      examPaths: docsMap<ExamPath>(pathsSnap),
    };

    return students.map((student) => enrichStudentFromLookup(student, lookup));
  });
}

// ─── classes ───────────────────────────────────────────────────────────────

export async function getClassById(id: string): Promise<Class | null> {
  return readOwned<Class>("classes", id);
}

export async function listClasses() {
  const key = await scopedCacheKey("classes");
  return cached(key, 60_000, async () => {
    const [classesSnap, students, examPaths, staff] = await Promise.all([
      scopedCollection("classes"),
      listStudents(),
      listExamPaths(),
      listStaff(),
    ]);

    const classes = docsData<Class>(classesSnap).sort((a, b) =>
      a.name.localeCompare(b.name, "he")
    );
    const examPathsById = new Map<string, ExamPath>(
      examPaths.map((p) => {
        const { _count: _ignored, ...path } = p;
        return [path.id, path];
      })
    );
    const staffById = new Map(
      staff.map((s) => [
        s.id,
        { id: s.id, name: s.name ?? "", email: s.email ?? "" },
      ])
    );
    const studentCounts = new Map<string, number>();
    for (const student of students) {
      studentCounts.set(
        student.classId,
        (studentCounts.get(student.classId) ?? 0) + 1
      );
    }

    return classes.map((cls) => ({
      ...cls,
      examPath: examPathsById.get(cls.examPathId) ?? null,
      homeroomTeacher: cls.homeroomTeacherId
        ? staffById.get(cls.homeroomTeacherId) ?? null
        : null,
      _count: { students: studentCounts.get(cls.id) ?? 0 },
    }));
  });
}

export async function createClass(data: Omit<Class, "id">) {
  const name = data.name?.trim() ?? "";
  if (!name) throw new Error("יש להזין שם כיתה");
  const examPathId = data.examPathId?.trim() ?? "";
  const path = examPathId ? await getExamPathById(examPathId) : null;
  if (examPathId && !path) throw new Error("תוכנית הבחינות לא נמצאה במוסד הזה");
  const institution = await activeInstitutionId();
  const id = newId();
  const gradeYear = data.gradeYear?.trim() ? data.gradeYear.trim() : null;
  const homeroomTeacherId = data.homeroomTeacherId || null;
  await adminDb.collection("classes").doc(id).set({
    id,
    name,
    gradeYear,
    examPathId,
    homeroomTeacherId,
    institutionId: institution,
    createdAt: FieldValue.serverTimestamp(),
  });
  await invalidateServerCache("examPaths");
  await invalidateServerCache("classes");
  const homeroomTeacher: { id: string; name: string; email: string } | null = null;
  return {
    id,
    name,
    gradeYear,
    examPathId,
    homeroomTeacherId,
    examPath: path,
    homeroomTeacher,
    _count: { students: 0 },
  };
}

export async function updateClass(id: string, data: Partial<Omit<Class, "id">>) {
  await requireOwned("classes", id);
  if (data.examPathId) {
    const path = await getExamPathById(data.examPathId);
    if (!path) throw new Error("תוכנית הבחינות לא נמצאה במוסד הזה");
  }
  await adminDb.collection("classes").doc(id).update({ ...data, updatedAt: FieldValue.serverTimestamp() });
  await invalidateServerCache("examPaths");
  await invalidateServerCache("classes");
  const cls = await getClassById(id);
  const examPath = cls ? await getExamPathById(cls.examPathId) : null;
  const students = await listStudents();
  return {
    ...cls,
    examPath,
    _count: { students: students.filter((s) => s.classId === id).length },
  };
}

export async function deleteClass(id: string) {
  await requireOwned("classes", id);
  const students = await listStudents();
  if (students.some((s) => s.classId === id)) {
    throw new Error("לא ניתן למחוק כיתה עם תלמידים");
  }
  await adminDb.collection("classes").doc(id).delete();
  await invalidateServerCache("examPaths");
  await invalidateServerCache("classes");
}

// ─── exam paths ────────────────────────────────────────────────────────────

export async function getExamPathById(id: string): Promise<ExamPath | null> {
  if (!id) return null;
  return readOwned<ExamPath>("examPaths", id);
}

export async function listExamPaths() {
  const key = await scopedCacheKey("examPaths");
  return cached(key, 600_000, async () => {
    const [pathsSnap, classesSnap] = await Promise.all([
      scopedCollection("examPaths"),
      scopedCollection("classes"),
    ]);

    const paths = docsData<ExamPath>(pathsSnap)
      .filter((p) => p.key !== "flexible")
      .sort((a, b) => a.label.localeCompare(b.label, "he"));
    const classCounts = new Map<string, number>();
    for (const doc of classesSnap.docs) {
      const examPathId = (doc.data() as Class).examPathId;
      classCounts.set(examPathId, (classCounts.get(examPathId) ?? 0) + 1);
    }

    return paths.map((p) => ({
      ...p,
      _count: { classes: classCounts.get(p.id) ?? 0 },
    }));
  });
}

function slugifyExamPathKey(label: string): string {
  const ascii = label
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
  if (ascii.length >= 2) return ascii;
  return `path_${Date.now().toString(36)}`;
}

async function ensureUniqueExamPathKey(baseKey: string, excludeId?: string): Promise<string> {
  const paths = await listExamPaths();
  const taken = new Set(
    paths.filter((p) => p.id !== excludeId).map((p) => p.key)
  );
  if (!taken.has(baseKey)) return baseKey;
  let i = 2;
  while (taken.has(`${baseKey}_${i}`)) i += 1;
  return `${baseKey}_${i}`;
}

export async function createExamPath(data: {
  label: string;
  description?: string | null;
  pathType?: ExamPath["pathType"];
  subjectIds?: string[];
  key?: string;
}): Promise<ExamPath & { _count: { classes: number } }> {
  const label = data.label.trim();
  if (!label) throw new Error("שם תוכנית הוא שדה חובה");

  const baseKey = data.key?.trim() || slugifyExamPathKey(label);
  const key = await ensureUniqueExamPathKey(baseKey);
  const id = newId();

  // Attach social involvement automatically when present
  let subjectIds = [...new Set(data.subjectIds ?? [])];
  const subjects = await listSubjects();
  const social = subjects.find((s) => s.category === "SOCIAL");
  if (social && !subjectIds.includes(social.id)) {
    subjectIds = [...subjectIds, social.id];
  }

  const path: ExamPath = {
    id,
    key,
    label,
    pathType: data.pathType ?? "REGULAR",
    description: data.description?.trim() || null,
    subjectIds,
  };

  await adminDb.collection("examPaths").doc(id).set({
    ...path,
    institutionId: await activeInstitutionId(),
    createdAt: FieldValue.serverTimestamp(),
  });
  await invalidateServerCache("examPaths");
  await invalidateServerCache("subjects");
  return { ...path, _count: { classes: 0 } };
}

export async function updateExamPath(
  id: string,
  data: {
    label?: string;
    description?: string | null;
    pathType?: ExamPath["pathType"];
    subjectIds?: string[];
    key?: string;
  }
): Promise<(ExamPath & { _count: { classes: number } }) | null> {
  const existing = await getExamPathById(id);
  if (!existing) return null;

  const updates: Partial<ExamPath> = {};
  if (data.label !== undefined) {
    const label = data.label.trim();
    if (!label) throw new Error("שם תוכנית הוא שדה חובה");
    updates.label = label;
  }
  if (data.description !== undefined) {
    updates.description = data.description?.trim() || null;
  }
  if (data.pathType !== undefined) {
    updates.pathType = data.pathType;
  }
  if (data.subjectIds !== undefined) {
    updates.subjectIds = [...new Set(data.subjectIds)];
  }
  if (data.key !== undefined && data.key.trim()) {
    updates.key = await ensureUniqueExamPathKey(data.key.trim(), id);
  }

  await adminDb.collection("examPaths").doc(id).update({
    ...updates,
    updatedAt: FieldValue.serverTimestamp(),
  });
  await invalidateServerCache("examPaths");
  await invalidateServerCache("subjects");

  const paths = await listExamPaths();
  return paths.find((p) => p.id === id) ?? null;
}

export async function deleteExamPath(id: string): Promise<void> {
  const paths = await listExamPaths();
  const path = paths.find((p) => p.id === id);
  if (!path) throw new Error("תוכנית לא נמצאה");
  if ((path._count?.classes ?? 0) > 0) {
    throw new Error("לא ניתן למחוק תוכנית שמשויכות אליה כיתות");
  }
  await adminDb.collection("examPaths").doc(id).delete();
  await invalidateServerCache("examPaths");
  await invalidateServerCache("subjects");
}

// ─── tracks ───────────────────────────────────────────────────────────────

export async function getTrackById(id: string): Promise<Track | null> {
  return readOwned<Track>("tracks", id);
}

export async function listTracks(): Promise<Track[]> {
  const key = await scopedCacheKey("tracks");
  return cached(key, 600_000, async () => {
    const snap = await scopedCollection("tracks");
    return docsData<Track>(snap).sort((a, b) => a.name.localeCompare(b.name, "he"));
  });
}

// ─── subjects ──────────────────────────────────────────────────────────────

export async function getSubjectById(id: string): Promise<Subject | null> {
  const subject = await readOwned<Subject>("subjects", id);
  return subject ? normalizeSubject(subject) : null;
}

export async function listSubjects(): Promise<Subject[]> {
  const key = await scopedCacheKey("subjects");
  return cached(key, 600_000, async () => {
    const snap = await scopedCollection("subjects");
    return docsData<Subject>(snap).map(normalizeSubject);
  });
}

export async function listSubjectsByPath(pathId: string): Promise<Subject[]> {
  const path = await getExamPathById(pathId);
  if (!path) return [];
  const subjects = await Promise.all(path.subjectIds.map(getSubjectById));
  return subjects.filter(Boolean) as Subject[];
}

export async function createSubject(data: Omit<Subject, "id">) {
  const id = newId();
  const subject = { id, ...data };
  await adminDb.collection("subjects").doc(id).set({
    ...subject,
    institutionId: await activeInstitutionId(),
    createdAt: FieldValue.serverTimestamp(),
  });
  await invalidateServerCache("subjects");
  return subject;
}

/**
 * מוודא שמקצוע "מעורבות חברתית" קיים ומשויך לכל תוכניות הבחינות.
 * בטוח לקריאה חוזרת (idempotent).
 */
export async function ensureSocialInvolvementSubject(): Promise<Subject> {
  const subjects = await listSubjects();
  let social = subjects.find(
    (s) =>
      s.category === "SOCIAL" ||
      s.name.trim() === "מעורבות חברתית"
  );

  if (!social) {
    social = await createSubject({
      name: "מעורבות חברתית",
      units: null,
      category: "SOCIAL",
      trackId: null,
      teacherId: null,
      obligations: [
        {
          id: `ob_social_${Date.now()}`,
          questionnaireNumber: null,
          name: "מעורבות חברתית",
          weightPercent: 100,
          examType: "פנימי",
          studyMaterial: null,
          examEvent: null,
          gradeYear: "שכבת יב",
          gradeEntryDueDate: `${new Date().getFullYear()}-06-01`,
          sortOrder: 0,
          components: [],
          subItems: [],
        },
      ],
    });
  } else if (social.category !== "SOCIAL" || social.units != null) {
    await updateSubject(social.id, {
      category: "SOCIAL",
      units: null,
      name: "מעורבות חברתית",
    });
    social = (await getSubjectById(social.id))!;
  }

  const paths = await listExamPaths();
  for (const path of paths) {
    if (!path.subjectIds.includes(social.id)) {
      await adminDb.collection("examPaths").doc(path.id).update({
        subjectIds: [...path.subjectIds, social.id],
      });
      await invalidateServerCache("examPaths");
    }
  }

  return social;
}

export async function updateSubject(id: string, data: Partial<Omit<Subject, "id">>) {
  await requireOwned("subjects", id);
  await adminDb.collection("subjects").doc(id).update({ ...data, updatedAt: FieldValue.serverTimestamp() });
  await invalidateServerCache("subjects");
  return getSubjectById(id);
}

export async function deleteSubject(id: string) {
  await requireOwned("subjects", id);
  await adminDb.collection("subjects").doc(id).delete();
  await invalidateServerCache("subjects");
  const paths = await listExamPaths();
  for (const p of paths) {
    if (p.subjectIds.includes(id)) {
      await adminDb.collection("examPaths").doc(p.id).update({
        subjectIds: p.subjectIds.filter((sid) => sid !== id),
      });
    }
  }
}

export async function listSubjectsEnriched() {
  const [subjects, paths] = await Promise.all([listSubjects(), listExamPaths()]);
  return subjects.map((s) => ({
    ...s,
    pathLinks: paths
      .filter((p) => p.subjectIds.includes(s.id))
      .map((p) => ({ path: { label: p.label, key: p.key, id: p.id } })),
  }));
}

// ─── obligations (embedded in subjects) ────────────────────────────────────

export async function addObligation(subjectId: string, obligation: Omit<Obligation, "id">) {
  const subject = await getSubjectById(subjectId);
  if (!subject) throw new Error("מקצוע לא נמצא");
  const ob: Obligation = {
    id: newId(),
    ...obligation,
    sortOrder: obligation.sortOrder ?? subject.obligations.length,
  };
  const { obligations } = deduplicateObligations([...subject.obligations, ob]);
  await adminDb.collection("subjects").doc(subjectId).update({ obligations });
  await invalidateServerCache("subjects");
  return ob;
}

export async function updateObligation(subjectId: string, obligation: Obligation) {
  const subject = await getSubjectById(subjectId);
  if (!subject) throw new Error("מקצוע לא נמצא");
  subject.obligations = subject.obligations.map((o) =>
    o.id === obligation.id ? obligation : o
  );
  await adminDb.collection("subjects").doc(subjectId).update({ obligations: subject.obligations });
  await invalidateServerCache("subjects");
  return obligation;
}

export async function deleteObligation(subjectId: string, obligationId: string) {
  const subject = await getSubjectById(subjectId);
  if (!subject) throw new Error("מקצוע לא נמצא");
  subject.obligations = subject.obligations.filter((o) => o.id !== obligationId);
  await adminDb.collection("subjects").doc(subjectId).update({ obligations: subject.obligations });
  await invalidateServerCache("subjects");
  await deleteObligationGradeYearOverridesForObligation(obligationId);
}

/** עדכון שדות נבחרים על מספר מטלות בבת אחת (ללא נגיעה ברכיבים/תתי-מטלה) */
export async function bulkUpdateObligationFields(
  updates: Array<{
    subjectId: string;
    obligationId: string;
    patch: Partial<
      Pick<
        Obligation,
        | "name"
        | "questionnaireNumber"
        | "weightPercent"
        | "examType"
        | "studyMaterial"
        | "examEvent"
        | "gradeYear"
        | "gradeEntryDueDate"
        | "sortOrder"
      >
    > & { subItems?: Obligation["subItems"] };
  }>
): Promise<number> {
  const bySubject = new Map<string, typeof updates>();
  for (const u of updates) {
    const list = bySubject.get(u.subjectId) ?? [];
    list.push(u);
    bySubject.set(u.subjectId, list);
  }

  let updated = 0;
  for (const [subjectId, subjectUpdates] of bySubject) {
    const subject = await getSubjectById(subjectId);
    if (!subject) continue;
    const patchByObligation = new Map(
      subjectUpdates.map((u) => [u.obligationId, u.patch])
    );
    subject.obligations = subject.obligations.map((o) => {
      const patch = patchByObligation.get(o.id);
      if (!patch) return o;
      updated += 1;
      return { ...o, ...patch };
    });
    await adminDb
      .collection("subjects")
      .doc(subjectId)
      .update({ obligations: subject.obligations });
  }

  if (updated > 0) await invalidateServerCache("subjects");
  return updated;
}

export async function findObligation(obligationId: string) {
  const subjects = await listSubjects();
  for (const s of subjects) {
    const ob = s.obligations.find((o) => o.id === obligationId);
    if (ob) return { subject: s, obligation: ob };
  }
  return null;
}

// ─── grades ────────────────────────────────────────────────────────────────

export async function getGradesByStudent(studentId: string): Promise<Grade[]> {
  const student = await getStudentById(studentId);
  if (!student) return [];
  const institution = await activeInstitutionId();
  const snap = await adminDb.collection("grades").where("studentId", "==", studentId).get();
  return docsData<Grade>(snap).filter((grade) => matchesInstitution(grade, institution));
}

export async function upsertGrades(
  studentId: string,
  grades: Array<{
    obligationId: string;
    score?: number | null;
    qualitativeLevel?: QualitativeLevel | null;
    componentScores?: Record<number, number | null> | null;
    subItemScores?: Record<number, number | null> | null;
    /** undefined = שמור קיים; null = נקה; object = החלף */
    componentWeightOverrides?: Record<number, number> | null;
    subItemWeightOverrides?: Record<number, number> | null;
    status: SubmissionStatus;
    notes?: string;
  }>
) {
  const student = await getStudentById(studentId);
  if (!student) throw new Error("התלמיד לא נמצא במוסד הזה");
  const institution = await activeInstitutionId();
  const results: Grade[] = [];
  for (const g of grades) {
    const score = g.score ?? null;
    const qualitativeLevel = g.qualitativeLevel ?? null;
    const componentScores = g.componentScores ?? null;
    const subItemScores = g.subItemScores ?? null;
    const notes = g.notes ?? null;

    const existing = await adminDb
      .collection("grades")
      .where("studentId", "==", studentId)
      .where("obligationId", "==", g.obligationId)
      .limit(1)
      .get();

    const existingData = existing.empty
      ? null
      : ({ id: existing.docs[0]!.id, ...existing.docs[0]!.data() } as Grade);

    const componentWeightOverrides =
      g.componentWeightOverrides !== undefined
        ? g.componentWeightOverrides
        : (existingData?.componentWeightOverrides ?? null);
    const subItemWeightOverrides =
      g.subItemWeightOverrides !== undefined
        ? g.subItemWeightOverrides
        : (existingData?.subItemWeightOverrides ?? null);

    const cleared = shouldDeleteEmptyGrade({
      status: g.status,
      score,
      qualitativeLevel,
      componentScores,
      subItemScores,
      notes,
    });

    if (existing.empty) {
      if (cleared) continue;
      const id = newId();
      const grade: Grade = {
        id,
        studentId,
        obligationId: g.obligationId,
        score,
        qualitativeLevel,
        componentScores,
        subItemScores,
        componentWeightOverrides,
        subItemWeightOverrides,
        status: g.status,
        notes,
      };
      await adminDb.collection("grades").doc(id).set({ ...grade, institutionId: institution });
      results.push(grade);
    } else {
      const doc = existing.docs[0]!;
      if (cleared) {
        await doc.ref.delete();
        continue;
      }
      const updates = {
        score,
        qualitativeLevel,
        componentScores,
        subItemScores,
        componentWeightOverrides,
        subItemWeightOverrides,
        status: g.status,
        notes,
        updatedAt: FieldValue.serverTimestamp(),
      };
      await doc.ref.update(updates);
      const gradeData = doc.data() as Grade;
      results.push({
        id: doc.id,
        studentId: gradeData.studentId,
        obligationId: gradeData.obligationId,
        score,
        qualitativeLevel,
        componentScores,
        subItemScores,
        componentWeightOverrides,
        subItemWeightOverrides,
        status: g.status,
        notes,
      });
    }
  }
  await invalidateServerCache("grades");
  return results;
}

export async function getGradesByStudentsAndObligation(
  studentIds: string[],
  obligationId: string
): Promise<Map<string, Grade>> {
  const result = new Map<string, Grade>();
  if (studentIds.length === 0) return result;

  for (let i = 0; i < studentIds.length; i += 30) {
    const chunk = studentIds.slice(i, i + 30);
    const snap = await adminDb
      .collection("grades")
      .where("studentId", "in", chunk)
      .where("obligationId", "==", obligationId)
      .get();
    const institution = await activeInstitutionId();
    for (const doc of snap.docs) {
      const grade = { id: doc.id, ...doc.data() } as Grade;
      if (!matchesInstitution(grade, institution)) continue;
      result.set(grade.studentId, grade);
    }
  }
  return result;
}

/** All grades for the given students (keyed `${studentId}:${obligationId}`). */
export async function getGradesByStudentIds(
  studentIds: string[]
): Promise<Map<string, Grade>> {
  const result = new Map<string, Grade>();
  if (studentIds.length === 0) return result;

  for (let i = 0; i < studentIds.length; i += 30) {
    const chunk = studentIds.slice(i, i + 30);
    const snap = await adminDb
      .collection("grades")
      .where("studentId", "in", chunk)
      .get();
    const institution = await activeInstitutionId();
    for (const doc of snap.docs) {
      const grade = { id: doc.id, ...doc.data() } as Grade;
      if (!matchesInstitution(grade, institution)) continue;
      result.set(`${grade.studentId}:${grade.obligationId}`, grade);
    }
  }
  return result;
}

export async function upsertGradesBulk(
  entries: Array<{
    studentId: string;
    obligationId: string;
    score?: number | null;
    qualitativeLevel?: QualitativeLevel | null;
    componentScores?: Record<number, number | null> | null;
    subItemScores?: Record<number, number | null> | null;
    componentWeightOverrides?: Record<number, number> | null;
    subItemWeightOverrides?: Record<number, number> | null;
    status: SubmissionStatus;
    notes?: string | null;
  }>
): Promise<Grade[]> {
  if (entries.length === 0) return [];
  const institution = await activeInstitutionId();

  const byObligation = new Map<string, typeof entries>();
  for (const entry of entries) {
    const list = byObligation.get(entry.obligationId) ?? [];
    list.push(entry);
    byObligation.set(entry.obligationId, list);
  }

  const existingMap = new Map<string, Grade>();
  for (const [obligationId, group] of byObligation) {
    const grades = await getGradesByStudentsAndObligation(
      group.map((e) => e.studentId),
      obligationId
    );
    for (const [studentId, grade] of grades) {
      existingMap.set(`${studentId}:${obligationId}`, grade);
    }
  }

  const results: Grade[] = [];
  const batches: FirebaseFirestore.WriteBatch[] = [];
  let batch = adminDb.batch();
  let opCount = 0;

  function commitBatch() {
    if (opCount > 0) {
      batches.push(batch);
      batch = adminDb.batch();
      opCount = 0;
    }
  }

  for (const entry of entries) {
    const key = `${entry.studentId}:${entry.obligationId}`;
    const existing = existingMap.get(key);
    const score = entry.score ?? null;
    const qualitativeLevel = entry.qualitativeLevel ?? null;
    const componentScores = entry.componentScores ?? null;
    const subItemScores = entry.subItemScores ?? null;
    const componentWeightOverrides =
      entry.componentWeightOverrides !== undefined
        ? entry.componentWeightOverrides
        : (existing?.componentWeightOverrides ?? null);
    const subItemWeightOverrides =
      entry.subItemWeightOverrides !== undefined
        ? entry.subItemWeightOverrides
        : (existing?.subItemWeightOverrides ?? null);
    const notes = entry.notes ?? null;
    const cleared = shouldDeleteEmptyGrade({
      status: entry.status,
      score,
      qualitativeLevel,
      componentScores,
      subItemScores,
      notes,
    });

    if (existing) {
      if (cleared) {
        batch.delete(adminDb.collection("grades").doc(existing.id));
      } else {
        batch.update(adminDb.collection("grades").doc(existing.id), {
          institutionId: institution,
          score,
          qualitativeLevel,
          componentScores,
          subItemScores,
          componentWeightOverrides,
          subItemWeightOverrides,
          status: entry.status,
          notes,
          updatedAt: FieldValue.serverTimestamp(),
        });
        results.push({
          ...existing,
          score,
          qualitativeLevel,
          componentScores,
          subItemScores,
          componentWeightOverrides,
          subItemWeightOverrides,
          status: entry.status,
          notes,
        });
      }
    } else if (!cleared) {
      const id = newId();
      const grade: Grade = {
        id,
        studentId: entry.studentId,
        obligationId: entry.obligationId,
        score,
        qualitativeLevel,
        componentScores,
        subItemScores,
        componentWeightOverrides,
        subItemWeightOverrides,
        status: entry.status,
        notes,
      };
      batch.set(adminDb.collection("grades").doc(id), { ...grade, institutionId: institution });
      results.push(grade);
    }

    opCount++;
    if (opCount >= 500) commitBatch();
  }
  commitBatch();

  await Promise.all(batches.map((b) => b.commit()));
  await invalidateServerCache("grades");
  return results;
}

export async function listClassesSimple() {
  const key = await scopedCacheKey("classes:simple");
  return cached(key, 60_000, async () => {
    const snap = await scopedCollection("classes");
    return docsData<Class>(snap)
      .sort((a, b) => a.name.localeCompare(b.name, "he"))
      .map((cls) => ({
      id: cls.id,
      name: cls.name,
      gradeYear: cls.gradeYear,
      examPathId: cls.examPathId,
    }));
  });
}

// ─── obligation grade year overrides ───────────────────────────────────────

const OBLIGATION_GRADE_YEAR_OVERRIDES = "obligationGradeYearOverrides";

export async function listObligationGradeYearOverrides(): Promise<
  ObligationClassGradeYearOverride[]
> {
  const key = await scopedCacheKey("obligationGradeYearOverrides");
  return cached(key, 60_000, async () => {
    const snap = await scopedCollection(OBLIGATION_GRADE_YEAR_OVERRIDES);
    return docsData<ObligationClassGradeYearOverride>(snap);
  });
}

export async function getObligationGradeYearOverridesForObligation(
  obligationId: string
): Promise<ObligationClassGradeYearOverride[]> {
  const all = await listObligationGradeYearOverrides();
  return all.filter((o) => o.obligationId === obligationId);
}

export async function createObligationGradeYearOverride(
  input: Omit<ObligationClassGradeYearOverride, "id" | "createdAt" | "updatedAt">
): Promise<ObligationClassGradeYearOverride> {
  const id = newId();
  const record: ObligationClassGradeYearOverride = {
    id,
    obligationId: input.obligationId,
    subItemSortOrder: input.subItemSortOrder ?? null,
    classIds: [...new Set(input.classIds)],
    effectiveGradeYear: input.effectiveGradeYear,
    note: input.note ?? null,
  };
  await adminDb.collection(OBLIGATION_GRADE_YEAR_OVERRIDES).doc(id).set({
    ...record,
    institutionId: await activeInstitutionId(),
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  await invalidateServerCache("obligationGradeYearOverrides");
  return record;
}

export async function updateObligationGradeYearOverride(
  id: string,
  input: Partial<
    Pick<ObligationClassGradeYearOverride, "classIds" | "effectiveGradeYear" | "note">
  >
): Promise<ObligationClassGradeYearOverride | null> {
  const existing = await readOwned<ObligationClassGradeYearOverride>(
    OBLIGATION_GRADE_YEAR_OVERRIDES,
    id
  );
  if (!existing) return null;
  const ref = adminDb.collection(OBLIGATION_GRADE_YEAR_OVERRIDES).doc(id);

  const updates: Partial<ObligationClassGradeYearOverride> = {};
  if (input.classIds !== undefined) {
    updates.classIds = [...new Set(input.classIds)];
  }
  if (input.effectiveGradeYear !== undefined) {
    updates.effectiveGradeYear = input.effectiveGradeYear;
  }
  if (input.note !== undefined) {
    updates.note = input.note;
  }

  await ref.update({ ...updates, updatedAt: FieldValue.serverTimestamp() });
  await invalidateServerCache("obligationGradeYearOverrides");
  return { ...existing, ...updates };
}

export async function deleteObligationGradeYearOverride(id: string): Promise<boolean> {
  const existing = await readOwned(OBLIGATION_GRADE_YEAR_OVERRIDES, id);
  if (!existing) return false;
  const ref = adminDb.collection(OBLIGATION_GRADE_YEAR_OVERRIDES).doc(id);
  await ref.delete();
  await invalidateServerCache("obligationGradeYearOverrides");
  return true;
}

export async function deleteObligationGradeYearOverridesForObligation(
  obligationId: string
): Promise<number> {
  const snap = await adminDb
    .collection(OBLIGATION_GRADE_YEAR_OVERRIDES)
    .where("obligationId", "==", obligationId)
    .get();
  if (snap.empty) return 0;

  const institution = await activeInstitutionId();
  const owned = snap.docs.filter((doc) => matchesInstitution(doc.data(), institution));
  if (owned.length === 0) return 0;

  const batch = adminDb.batch();
  for (const doc of owned) {
    batch.delete(doc.ref);
  }
  await batch.commit();
  await invalidateServerCache("obligationGradeYearOverrides");
  return owned.length;
}

// ─── counts ────────────────────────────────────────────────────────────────

export async function getAdminDashboardData() {
  const [students, classes, subjects, grades, paths] = await Promise.all([
    listStudents(),
    listClasses(),
    listSubjects(),
    listAllGrades(),
    listExamPaths(),
  ]);
  const obligations = subjects.reduce((sum, subject) => sum + subject.obligations.length, 0);

  return {
    counts: {
      students: students.length,
      classes: classes.length,
      subjects: subjects.length,
      paths: paths.length,
      obligations,
      gradedCount: grades.filter((grade) => grade.status === "GRADED").length,
    },
    paths,
  };
}

export async function getDashboardCounts() {
  const { counts } = await getAdminDashboardData();
  return counts;
}
