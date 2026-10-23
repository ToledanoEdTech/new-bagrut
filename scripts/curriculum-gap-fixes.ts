/**
 * Completes questionnaire numbers, names, and grade years that were filled
 * in on the source site. Obligation ids are preserved so existing grades
 * stay attached. Two equal tasks that became one task are reported in `merges`.
 */

export const GRADE_YEAR_10 = "שכבת י";
export const GRADE_YEAR_11 = "שכבת יא";
export const GRADE_YEAR_12 = "שכבת יב";

export class CurriculumConflict extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CurriculumConflict";
  }
}

export type WeightedPart = {
  name: string;
  weightPercent: number;
  sortOrder: number;
  gradeYear?: string | null;
  gradeEntryDueDate?: string | null;
};

export type ObligationShape = {
  id: string;
  questionnaireNumber: string | null;
  name: string | null;
  weightPercent: number;
  examType: string;
  studyMaterial: string | null;
  examEvent: string | null;
  gradeYear: string | null;
  sortOrder: number;
  components: WeightedPart[];
  subItems: WeightedPart[];
  gradeEntryDueDate?: string | null;
};

export type MergePlan = {
  keptId: string;
  removedId: string;
  mode: "average" | "separate";
  keptSlot: number;
  removedSlot: number;
};

export type FixResult = {
  obligations: ObligationShape[];
  merges: MergePlan[];
  conflict?: string;
};

type ParsedObligation = {
  questionnaireNumber: string | null;
  weightPercent: number;
  eventName: string | null;
  examType: string;
  studyMaterial: string | null;
  examEvent: string | null;
  gradeYear: string | null;
  components?: Array<{ name: string; weightPercent: number }>;
  subItems?: Array<{ name: string; weightPercent: number; gradeYear?: string | null }>;
};

type ParsedCurriculum = {
  paths: Array<{
    key: string;
    subjects: Array<{
      name: string;
      units: number | null;
      obligations: ParsedObligation[];
    }>;
  }>;
};

function reindex(obligations: ObligationShape[]): ObligationShape[] {
  return obligations.map((obligation, index) => ({
    ...obligation,
    sortOrder: index,
    components: obligation.components.map((component, componentIndex) => ({
      ...component,
      sortOrder: componentIndex,
    })),
    subItems: obligation.subItems.map((subItem, subIndex) => ({
      ...subItem,
      sortOrder: subIndex,
    })),
  }));
}

function cloneObligations(obligations: ObligationShape[]): ObligationShape[] {
  return obligations.map((obligation) => ({
    ...obligation,
    components: obligation.components.map((component) => ({ ...component })),
    subItems: obligation.subItems.map((subItem) => ({ ...subItem })),
  }));
}

export function weightSum(obligations: ObligationShape[]): number {
  return (
    Math.round(obligations.reduce((sum, obligation) => sum + obligation.weightPercent, 0) * 100) /
    100
  );
}

export function obligationSignature(obligations: ObligationShape[]): string {
  return JSON.stringify(
    obligations.map((obligation) => ({
      q: obligation.questionnaireNumber,
      n: obligation.name,
      w: obligation.weightPercent,
      t: obligation.examType,
      y: obligation.gradeYear,
      e: obligation.examEvent,
      m: obligation.studyMaterial,
      c: obligation.components.map((component) => [component.name, component.weightPercent]),
      s: obligation.subItems.map((subItem) => [
        subItem.name,
        subItem.weightPercent,
        subItem.gradeYear ?? null,
      ]),
    }))
  );
}

function done(obligations: ObligationShape[]): FixResult {
  return { obligations: reindex(obligations), merges: [] };
}

function requireOne(obligations: ObligationShape[], label: string): ObligationShape {
  if (obligations.length !== 1) {
    throw new CurriculumConflict(`${label}: נמצאו ${obligations.length} מטלות`);
  }
  return obligations[0]!;
}

function renameSubmission(obligation: ObligationShape): ObligationShape {
  return {
    ...obligation,
    components: obligation.components.map((component) =>
      component.name === "ציון פנימי" && component.weightPercent === 30
        ? { ...component, name: "ציון הגשה" }
        : component
    ),
  };
}

function withQuestionnaire(
  obligations: ObligationShape[],
  eventName: string,
  questionnaireNumber: string,
  gradeYear?: string
): ObligationShape[] {
  const matches = obligations.filter((obligation) => obligation.name === eventName);
  const target = requireOne(matches, eventName);
  return obligations.map((obligation) =>
    obligation.id === target.id
      ? {
          ...obligation,
          questionnaireNumber,
          ...(gradeYear !== undefined ? { gradeYear } : {}),
        }
      : obligation
  );
}

function fixEnglish(units: number | null, obligations: ObligationShape[]): ObligationShape[] {
  if (units === 3) {
    return reindex(
      withQuestionnaire(
        withQuestionnaire(
          withQuestionnaire(obligations, "COBE", "16387", GRADE_YEAR_12),
          "A",
          "16381"
        ),
        "C",
        "16382"
      )
    );
  }
  if (units === 4) {
    let next = withQuestionnaire(obligations, "C", "16382", GRADE_YEAR_12);
    next = withQuestionnaire(next, "COBE", "16486", GRADE_YEAR_12);
    next = withQuestionnaire(next, "E", "16471");
    const moduleD = requireOne(
      next.filter((obligation) => obligation.name === "D"),
      "D"
    );
    const reportIndexes = moduleD.subItems
      .map((subItem, index) => (subItem.name === "דוח" ? index : -1))
      .filter((index) => index >= 0);
    const markedReports = new Set(reportIndexes.slice(-2));
    next = next.map((obligation) => {
      if (obligation.id !== moduleD.id) return obligation;
      return {
        ...obligation,
        gradeYear: GRADE_YEAR_12,
        subItems: obligation.subItems.map((subItem, index) => {
          const grandmother = /grandmother|gandmother/i.test(subItem.name);
          if (grandmother || subItem.name === "מבחן" || markedReports.has(index)) {
            return { ...subItem, gradeYear: GRADE_YEAR_12 };
          }
          return subItem;
        }),
      };
    });
    return reindex(next);
  }
  if (units === 5) {
    let next = withQuestionnaire(obligations, "E", "16471");
    next = withQuestionnaire(next, "COBE", "16586", GRADE_YEAR_12);
    next = withQuestionnaire(next, "G", "16582");
    const moduleF = requireOne(
      next.filter((obligation) => obligation.name === "F"),
      "F"
    );
    let tests = 0;
    next = next.map((obligation) => {
      if (obligation.id !== moduleF.id) return obligation;
      return {
        ...obligation,
        subItems: obligation.subItems.map((subItem) => {
          if (subItem.name === "The Wave" || subItem.name === "דוח") {
            return { ...subItem, gradeYear: GRADE_YEAR_12 };
          }
          if (subItem.name === "מבחן") {
            tests += 1;
            if (tests === 2) return { ...subItem, gradeYear: GRADE_YEAR_12 };
          }
          return subItem;
        }),
      };
    });
    return reindex(next);
  }
  throw new CurriculumConflict(`אנגלית ${units ?? "?"} לא מוכרת`);
}

function distinct(
  parts: Array<ObligationShape | undefined>,
  label: string
): ObligationShape[] {
  if (parts.some((part) => !part)) throw new CurriculumConflict(`${label}: חסרה מטלה`);
  const found = parts as ObligationShape[];
  if (new Set(found.map((part) => part.id)).size !== found.length) {
    throw new CurriculumConflict(`${label}: מטלות זוהו כפול`);
  }
  return found;
}

function fixPhysics(obligations: ObligationShape[]): ObligationShape[] {
  const lab = obligations.find(
    (obligation) => obligation.questionnaireNumber === "36376" || obligation.name === "מעבדה"
  );
  const mechanics = obligations.find(
    (obligation) =>
      obligation.questionnaireNumber === "36361" ||
      obligation.name === "בגרות חיצונית מכניקה יא" ||
      (obligation.weightPercent === 25 && (obligation.name ?? "").includes("בגרות"))
  );
  const electricity = obligations.find(
    (obligation) =>
      obligation.questionnaireNumber === "36283" ||
      obligation.name === "בגרות חיצונית יב חשמל" ||
      (obligation.weightPercent === 30 && obligation.name === "בגרות חיצונית")
  );
  const alternative = obligations.find(
    (obligation) =>
      obligation.questionnaireNumber === "36371" || obligation.name === "הערכה חלופית"
  );
  const [labItem, mechanicsItem, electricityItem, alternativeItem] = distinct(
    [lab, mechanics, electricity, alternative],
    "פיסיקה"
  );
  const next = new Map<string, ObligationShape>([
    [labItem.id, { ...labItem, questionnaireNumber: "36376", gradeYear: GRADE_YEAR_12 }],
    [
      mechanicsItem.id,
      {
        ...mechanicsItem,
        name: "בגרות חיצונית מכניקה יא",
        questionnaireNumber: "36361",
        gradeYear: GRADE_YEAR_11,
      },
    ],
    [
      electricityItem.id,
      {
        ...electricityItem,
        name: "בגרות חיצונית יב חשמל",
        questionnaireNumber: "36283",
        gradeYear: GRADE_YEAR_12,
      },
    ],
    [
      alternativeItem.id,
      { ...alternativeItem, questionnaireNumber: "36371", gradeYear: GRADE_YEAR_10 },
    ],
  ]);
  return reindex(obligations.map((obligation) => next.get(obligation.id) ?? obligation));
}

function fixComputing(obligations: ObligationShape[]): ObligationShape[] {
  const alternative = obligations.find(
    (obligation) =>
      obligation.questionnaireNumber === "791283" || obligation.name === "הערכה חלופית"
  );
  const external = obligations.find(
    (obligation) =>
      obligation.questionnaireNumber === "791381" || obligation.name === "בגרות חיצונית"
  );
  const [alternativeItem, externalItem] = distinct([alternative, external], "תקשוב");
  const next = new Map<string, ObligationShape>([
    [alternativeItem.id, { ...alternativeItem, questionnaireNumber: "791283" }],
    [externalItem.id, { ...externalItem, questionnaireNumber: "791381" }],
  ]);
  return reindex(obligations.map((obligation) => next.get(obligation.id) ?? obligation));
}

function fixCommunication(obligations: ObligationShape[]): ObligationShape[] {
  const theory = obligations.find(
    (obligation) =>
      obligation.questionnaireNumber === "56283" || (obligation.name ?? "").includes("עיונ")
  );
  const practical = obligations.find(
    (obligation) =>
      obligation.questionnaireNumber === "56387" || (obligation.name ?? "").includes("מעש")
  );
  const [theoryItem, practicalItem] = distinct([theory, practical], "תקשורת");
  const theoryComponents =
    theoryItem.components.length === 1 && theoryItem.components[0]?.name === "ציון בגרות פנימי"
      ? theoryItem.components
      : [{ name: "ציון בגרות פנימי", weightPercent: 100, sortOrder: 0 }];
  const next = new Map<string, ObligationShape>([
    [
      theoryItem.id,
      {
        ...theoryItem,
        name: "בגרות חיצונית תקשורת עיוני",
        questionnaireNumber: "56283",
        components: theoryComponents,
      },
    ],
    [
      practicalItem.id,
      {
        ...practicalItem,
        name: "בגרות חיצונית תקשורת מעשי",
        questionnaireNumber: "56387",
      },
    ],
  ]);
  return reindex(obligations.map((obligation) => next.get(obligation.id) ?? obligation));
}

function fixComputerScience(obligations: ObligationShape[]): ObligationShape[] {
  const project = obligations.find((obligation) => obligation.name === "פרויקט");
  if (!project) throw new CurriculumConflict("מדעי המחשב: חסר פרויקט");
  const components =
    project.components.length === 1 &&
    project.components[0]?.name === "ציון הגשה" &&
    project.components[0]?.weightPercent === 100
      ? project.components
      : [{ name: "ציון הגשה", weightPercent: 100, sortOrder: 0 }];
  return reindex(
    obligations.map((obligation) =>
      obligation.id === project.id
        ? { ...project, gradeYear: GRADE_YEAR_10, components }
        : obligation
    )
  );
}

function fixExtensionYear(obligations: ObligationShape[], label: string): ObligationShape[] {
  const only = requireOne(obligations, label);
  return [{ ...only, gradeYear: GRADE_YEAR_12 }];
}

function fixNamedInternal(obligations: ObligationShape[], taskName: string): ObligationShape[] {
  const only = requireOne(obligations, taskName);
  return [
    {
      ...only,
      name: taskName,
      gradeYear: GRADE_YEAR_12,
      examType: only.examType || "פנימי",
      examEvent: only.examEvent || "מבחן סוף שנה",
      components:
        only.components.length > 0
          ? only.components
          : [{ name: "ציון פנימי", weightPercent: 100, sortOrder: 0 }],
    },
  ];
}

function fixHistory(obligations: ObligationShape[]): ObligationShape[] {
  const target = obligations.find((obligation) => obligation.questionnaireNumber === "29283");
  if (!target) throw new CurriculumConflict("היסטוריה 2: חסר 29283");
  return reindex(
    obligations.map((obligation) =>
      obligation.id === target.id
        ? {
            ...obligation,
            name: "חמד ועד",
            gradeYear: GRADE_YEAR_10,
            examEvent: obligation.examEvent || "מבחן סוף שנה",
          }
        : obligation
    )
  );
}

function fixOralLaw(obligations: ObligationShape[]): ObligationShape[] {
  const meubar = obligations.some(
    (obligation) =>
      obligation.questionnaireNumber === "5231" ||
      obligation.questionnaireNumber === "5381" ||
      obligation.name === "גמרא בסיס משנה"
  );
  const regular = obligations.some(
    (obligation) =>
      obligation.questionnaireNumber === "5291" ||
      obligation.questionnaireNumber === "5391" ||
      (obligation.questionnaireNumber === "5281" && obligation.name === "גמרא הגבר")
  );
  if (meubar === regular) throw new CurriculumConflict('תושב"ע: לא זוהתה גרסה');

  if (!meubar) {
    return reindex(
      obligations.map((obligation) => {
        if (obligation.questionnaireNumber === "5383") {
          return { ...obligation, name: 'יחידת חובה י\' תושב"ע' };
        }
        if (
          obligation.questionnaireNumber === "5291" ||
          (obligation.questionnaireNumber === "5281" && obligation.name === "גמרא הגבר")
        ) {
          return renameSubmission({
            ...obligation,
            questionnaireNumber: "5281",
            gradeYear: GRADE_YEAR_12,
          });
        }
        if (obligation.questionnaireNumber === "5391") return renameSubmission(obligation);
        if (obligation.questionnaireNumber === "5283") {
          return { ...obligation, gradeYear: GRADE_YEAR_12 };
        }
        return obligation;
      })
    );
  }

  return reindex(
    obligations.map((obligation) => {
      if (
        obligation.questionnaireNumber === "5231" ||
        obligation.name === "גמרא בסיס משנה" ||
        (obligation.weightPercent === 28 && obligation.name === "גמרא הגבר")
      ) {
        return {
          ...obligation,
          questionnaireNumber: "5281",
          name: "גמרא בסיס משנה",
          gradeYear: GRADE_YEAR_12,
        };
      }
      if (obligation.questionnaireNumber === "5383") {
        return { ...obligation, name: 'יחידת חובה י\' תושב"ע (במעגלי ההלכה)' };
      }
      return obligation;
    })
  );
}

function fixTalmud(obligations: ObligationShape[]): ObligationShape[] {
  const target = obligations.find((obligation) => obligation.questionnaireNumber === "6383");
  if (!target) throw new CurriculumConflict("תלמוד: חסר 6383");
  return reindex(
    obligations.map((obligation) =>
      obligation.id === target.id ? { ...obligation, name: 'יחידת חובה י\' תושב"ע' } : obligation
    )
  );
}

function fixBibleThree(obligations: ObligationShape[]): ObligationShape[] {
  const target = obligations.find((obligation) => obligation.questionnaireNumber === "2383");
  if (!target) throw new CurriculumConflict('תנ"ך 3: חסר 2383');
  return reindex(
    obligations.map((obligation) =>
      obligation.id === target.id ? { ...obligation, name: "הערכה חלופית" } : obligation
    )
  );
}

function subItemsNamed(
  obligation: ObligationShape,
  names: string[],
  gradeYear: string
): ObligationShape {
  const wanted = new Set(names);
  return {
    ...obligation,
    subItems: obligation.subItems.map((subItem) =>
      wanted.has(subItem.name) ? { ...subItem, gradeYear } : subItem
    ),
  };
}

function fixLiteratureFive(obligations: ObligationShape[], beitMidrash: boolean): ObligationShape[] {
  return reindex(
    obligations.map((obligation) => {
      if (obligation.questionnaireNumber === "9188") {
        if (beitMidrash) return { ...obligation, gradeYear: GRADE_YEAR_10 };
        return subItemsNamed({ ...obligation, gradeYear: GRADE_YEAR_11 }, ["תהילה", "בואי הרוח"], GRADE_YEAR_11);
      }
      if (obligation.questionnaireNumber === "38183" && beitMidrash) {
        return { ...obligation, gradeYear: GRADE_YEAR_12 };
      }
      if (obligation.questionnaireNumber === "38383") {
        const examEvent = (obligation.examEvent ?? "").replace(/חורף\s+יב/, "חורף יב") || null;
        return {
          ...obligation,
          gradeYear: beitMidrash ? GRADE_YEAR_10 : GRADE_YEAR_11,
          examEvent,
        };
      }
      return obligation;
    })
  );
}

function fixLiteratureTwo(obligations: ObligationShape[]): ObligationShape[] {
  return reindex(
    obligations.map((obligation) => {
      if (obligation.questionnaireNumber !== "9188") return obligation;
      return subItemsNamed(
        { ...obligation, gradeYear: GRADE_YEAR_11 },
        ["ישנה בחיק יחדות", "תהילה", "בואי הרוח"],
        GRADE_YEAR_11
      );
    })
  );
}

function fixHebrew(obligations: ObligationShape[], beitMidrash: boolean): ObligationShape[] {
  return reindex(
    obligations.map((obligation) => {
      if (obligation.questionnaireNumber !== "11281") return obligation;
      if (beitMidrash) return { ...obligation, name: "בגרות חיצונית", examEvent: "חורף יא" };
      return { ...obligation, name: "בגרות חיצונית עברית", examEvent: null };
    })
  );
}

function mergeBibleIntro(
  obligations: ObligationShape[],
  beitMidrash: boolean,
  merges: MergePlan[]
): ObligationShape[] {
  const items = obligations.filter((obligation) => obligation.questionnaireNumber === "2383");
  if (items.length === 2) {
    if (!items.every((item) => item.weightPercent === 9)) {
      throw new CurriculumConflict(
        `תנ"ך 2383: משקלים ${items.map((item) => item.weightPercent).join("+")} במקום 9+9`
      );
    }
    const keeper =
      items.find(
        (item) =>
          item.components.some((component) => component.name === "יחידות מבוקרות") ||
          (item.studyMaterial ?? "").includes("מלכים") ||
          item.examType.includes("הרצוג")
      ) ?? items[0]!;
    const removed = items.find((item) => item.id !== keeper.id)!;
    const merged: ObligationShape = beitMidrash
      ? {
          ...keeper,
          name: "פנימי",
          weightPercent: 18,
          gradeYear: GRADE_YEAR_11,
          studyMaterial: "מלכים, במדבר",
          components: keeper.components.some((component) => component.name === "יחידות מבוקרות")
            ? keeper.components
            : [{ name: "יחידות מבוקרות", weightPercent: 100, sortOrder: 0 }],
          subItems: [
            {
              name: "ציון סופי יחידת מלכים במדבר",
              weightPercent: 100,
              sortOrder: 0,
              gradeYear: GRADE_YEAR_10,
            },
          ],
        }
      : {
          ...keeper,
          name: "פנימי יחידת מלכים ויחידת במדבר",
          weightPercent: 18,
          examType: "קורס אקדמי מכללת הרצוג",
          gradeYear: GRADE_YEAR_10,
          studyMaterial: "מלכים, במדבר",
          components: [{ name: "יחידות מבוקרות", weightPercent: 100, sortOrder: 0 }],
          subItems: [
            { name: "ציון משוקלל מלכים במדבר", weightPercent: 100, sortOrder: 0 },
          ],
        };
    merges.push({
      keptId: keeper.id,
      removedId: removed.id,
      mode: "average",
      keptSlot: 0,
      removedSlot: 0,
    });
    return obligations
      .map((obligation) => (obligation.id === keeper.id ? merged : obligation))
      .filter((obligation) => obligation.id !== removed.id);
  }
  if (items.length !== 1 || items[0]!.weightPercent !== 18) {
    throw new CurriculumConflict(`תנ"ך 2383: נמצאו ${items.length} מטלות`);
  }
  const current = items[0]!;
  const subItemName = beitMidrash ? "ציון סופי יחידת מלכים במדבר" : "ציון משוקלל מלכים במדבר";
  const updated: ObligationShape = beitMidrash
    ? {
        ...current,
        name: "פנימי",
        weightPercent: 18,
        gradeYear: GRADE_YEAR_11,
        subItems:
          current.subItems.length === 1
            ? [{ ...current.subItems[0]!, name: subItemName, weightPercent: 100, gradeYear: GRADE_YEAR_10 }]
            : [{ name: subItemName, weightPercent: 100, sortOrder: 0, gradeYear: GRADE_YEAR_10 }],
      }
    : {
        ...current,
        name: "פנימי יחידת מלכים ויחידת במדבר",
        weightPercent: 18,
        examType: "קורס אקדמי מכללת הרצוג",
        gradeYear: GRADE_YEAR_10,
        components: [{ name: "יחידות מבוקרות", weightPercent: 100, sortOrder: 0 }],
        subItems:
          current.subItems.length === 1
            ? [{ ...current.subItems[0]!, name: subItemName, weightPercent: 100 }]
            : [{ name: subItemName, weightPercent: 100, sortOrder: 0 }],
      };
  return obligations.map((obligation) => (obligation.id === current.id ? updated : obligation));
}

function mergeReward(obligations: ObligationShape[], beitMidrash: boolean, merges: MergePlan[]): ObligationShape[] {
  const items = obligations.filter((obligation) => obligation.questionnaireNumber === "2563");
  const rewardName = beitMidrash ? "תורת הגמול - איוב" : "תורת הגמול איוב";
  const taskName = beitMidrash ? "פנימי 2563" : "פנימי 2563 תורת הגמול ודמויות מופת";
  const subItems: WeightedPart[] = [
    { name: rewardName, weightPercent: 50, sortOrder: 0, gradeYear: GRADE_YEAR_12 },
    { name: "דמויות מופת", weightPercent: 50, sortOrder: 1, gradeYear: GRADE_YEAR_10 },
  ];
  if (items.length === 2) {
    if (!items.every((item) => item.weightPercent === 8)) {
      throw new CurriculumConflict(
        `תנ"ך 2563: משקלים ${items.map((item) => item.weightPercent).join("+")} במקום 8+8`
      );
    }
    const reward = items.find(
      (item) =>
        item.gradeYear === GRADE_YEAR_12 ||
        (item.studyMaterial ?? "").includes("תורת הגמול") ||
        (item.studyMaterial ?? "").includes("איוב")
    );
    const exemplars = items.find(
      (item) =>
        item.id !== reward?.id &&
        (item.gradeYear === GRADE_YEAR_10 || (item.studyMaterial ?? "").includes("דמויות"))
    );
    if (!reward || !exemplars) {
      throw new CurriculumConflict('תנ"ך 2563: לא ניתן להבדיל בין תורת הגמול לדמויות מופת');
    }
    const merged: ObligationShape = {
      ...reward,
      name: taskName,
      weightPercent: 16,
      examType: "פנימי",
      gradeYear: null,
      studyMaterial: null,
      examEvent: null,
      components: [],
      subItems,
    };
    merges.push({
      keptId: reward.id,
      removedId: exemplars.id,
      mode: "separate",
      keptSlot: 0,
      removedSlot: 1,
    });
    return obligations
      .map((obligation) => (obligation.id === reward.id ? merged : obligation))
      .filter((obligation) => obligation.id !== exemplars.id);
  }
  if (items.length !== 1 || items[0]!.weightPercent !== 16) {
    throw new CurriculumConflict(`תנ"ך 2563: נמצאו ${items.length} מטלות`);
  }
  const current = items[0]!;
  return obligations.map((obligation) =>
    obligation.id === current.id
      ? {
          ...current,
          name: taskName,
          weightPercent: 16,
          examType: "פנימי",
          gradeYear: null,
          components: [],
          subItems:
            current.subItems.length === 2
              ? [
                  { ...current.subItems[0]!, name: rewardName, weightPercent: 50, gradeYear: GRADE_YEAR_12 },
                  {
                    ...current.subItems[1]!,
                    name: "דמויות מופת",
                    weightPercent: 50,
                    gradeYear: GRADE_YEAR_10,
                  },
                ]
              : subItems,
        }
      : obligation
  );
}

function fixBibleFive(obligations: ObligationShape[], beitMidrash: boolean): FixResult {
  const merges: MergePlan[] = [];
  let next = mergeBibleIntro(obligations, beitMidrash, merges);
  next = mergeReward(next, beitMidrash, merges);
  next = next.map((obligation) => {
    if (!beitMidrash && ["2585", "2551", "2575"].includes(obligation.questionnaireNumber ?? "")) {
      return renameSubmission(obligation);
    }
    if (beitMidrash && obligation.questionnaireNumber === "2585") {
      return { ...obligation, name: "תנך בסיס יב", gradeYear: GRADE_YEAR_12 };
    }
    return obligation;
  });
  return { obligations: reindex(next), merges };
}

function produce(recipe: string, name: string, units: number | null, obligations: ObligationShape[]): FixResult {
  const source = cloneObligations(obligations);
  if (name === "אנגלית") return done(fixEnglish(units, source));
  if (name === "פיסיקה") return done(fixPhysics(source));
  if (name === "תקשוב") return done(fixComputing(source));
  if (name === "תקשורת") return done(fixCommunication(source));
  if (name === "מדעי המחשב") return done(fixComputerScience(source));
  if (name === "מדעי המחשב הגבר" || name === "תקשוב הגבר" || name === "היסטוריה הגבר") {
    return done(fixExtensionYear(source, name));
  }
  if (name === "תלמוד") return done(fixTalmud(source));
  if (name === 'תושב"ע') return done(fixOralLaw(source));
  if (name === 'תנ"ך' && units === 3) return done(fixBibleThree(source));
  if (name === 'תנ"ך' && units === 5) return fixBibleFive(source, recipe === "beit_midrash");
  if (name === "ספרות ומחשבת ישראל" && units === 2) return done(fixLiteratureTwo(source));
  if (name === "ספרות ומחשבת ישראל" && units === 5) {
    return done(fixLiteratureFive(source, recipe === "beit_midrash"));
  }
  if (name === "היסטוריה" && units === 2) return done(fixHistory(source));
  if (name === "מבוא למדעים" || name === "השכלה כללית א" || name === "השכלה כללית ב") {
    return done(fixNamedInternal(source, name));
  }
  if (name === "חינוך גופני") {
    return done(fixNamedInternal(source, recipe === "meubar_hinuch" ? "בגרות" : "מבחן סוף שנה"));
  }
  if (name === "עברית") return done(fixHebrew(source, recipe === "beit_midrash"));
  return done(source);
}

export function fixSubject(
  recipe: string,
  name: string,
  units: number | null,
  obligations: ObligationShape[]
): FixResult {
  try {
    const result = produce(recipe, name, units, obligations);
    const before = weightSum(obligations);
    const after = weightSum(result.obligations);
    if (Math.abs(before - after) > 0.05) {
      throw new CurriculumConflict(`סכום משקלים השתנה מ-${before} ל-${after}`);
    }
    return result;
  } catch (error) {
    if (error instanceof CurriculumConflict) {
      return { obligations, merges: [], conflict: error.message };
    }
    throw error;
  }
}

export function tanachVariant(obligations: ObligationShape[]): "legacy" | "regular" | "beit" {
  const intro = obligations.filter((obligation) => obligation.questionnaireNumber === "2383");
  if (intro.length === 2 && intro.every((obligation) => obligation.weightPercent === 9)) return "legacy";
  if (
    obligations.some(
      (obligation) =>
        (obligation.name ?? "").includes("מלכים ויחידת במדבר") ||
        obligation.subItems.some((subItem) => subItem.name.includes("ציון משוקלל"))
    )
  ) {
    return "regular";
  }
  if (
    obligations.some(
      (obligation) =>
        obligation.name === "תנך בסיס יב" ||
        obligation.subItems.some((subItem) => subItem.name.includes("ציון סופי"))
    )
  ) {
    return "beit";
  }
  return "legacy";
}

export function literatureVariant(obligations: ObligationShape[]): "legacy" | "regular" | "beit" {
  const internal = obligations.find((obligation) => obligation.questionnaireNumber === "38183");
  const work = obligations.find((obligation) => obligation.questionnaireNumber === "38383");
  const wind = obligations.find((obligation) => obligation.questionnaireNumber === "9188");
  if (internal?.gradeYear === GRADE_YEAR_12 && work?.gradeYear === GRADE_YEAR_10) return "beit";
  if (wind?.gradeYear === GRADE_YEAR_11 && work?.gradeYear === GRADE_YEAR_11) return "regular";
  return "legacy";
}

export function hebrewVariant(obligations: ObligationShape[]): "legacy" | "regular" | "beit" {
  const external = obligations.find((obligation) => obligation.questionnaireNumber === "11281");
  if (!external?.name) return "legacy";
  if (external.name === "בגרות חיצונית עברית") return "regular";
  if (external.name === "בגרות חיצונית") return "beit";
  return "legacy";
}

export function physicalEducationVariant(obligations: ObligationShape[]): "legacy" | "shared" | "meubar" {
  const name = obligations[0]?.name;
  if (!name) return "legacy";
  if (name === "בגרות") return "meubar";
  if (name === "מבחן סוף שנה") return "shared";
  return "legacy";
}

export function fromParsedObligation(obligation: ParsedObligation, id: string): ObligationShape {
  return {
    id,
    questionnaireNumber: obligation.questionnaireNumber ?? null,
    name: obligation.eventName ?? null,
    weightPercent: obligation.weightPercent,
    examType: obligation.examType,
    studyMaterial: obligation.studyMaterial ?? null,
    examEvent: obligation.examEvent ?? null,
    gradeYear: obligation.gradeYear ?? null,
    sortOrder: 0,
    components: (obligation.components ?? []).map((component, index) => ({
      name: component.name,
      weightPercent: component.weightPercent,
      sortOrder: index,
    })),
    subItems: (obligation.subItems ?? []).map((subItem, index) => ({
      name: subItem.name,
      weightPercent: subItem.weightPercent,
      sortOrder: index,
      ...(subItem.gradeYear ? { gradeYear: subItem.gradeYear } : {}),
    })),
  };
}

export function toParsedObligation(obligation: ObligationShape): ParsedObligation {
  return {
    questionnaireNumber: obligation.questionnaireNumber,
    weightPercent: obligation.weightPercent,
    eventName: obligation.name,
    examType: obligation.examType,
    studyMaterial: obligation.studyMaterial,
    examEvent: obligation.examEvent,
    gradeYear: obligation.gradeYear,
    components: obligation.components.map((component) => ({
      name: component.name,
      weightPercent: component.weightPercent,
    })),
    subItems: obligation.subItems.map((subItem) => ({
      name: subItem.name,
      weightPercent: subItem.weightPercent,
      ...(subItem.gradeYear ? { gradeYear: subItem.gradeYear } : {}),
    })),
  };
}

export function applyToParsedCurriculum(data: ParsedCurriculum): string[] {
  const conflicts: string[] = [];
  for (const path of data.paths) {
    for (const subject of path.subjects) {
      const input = subject.obligations.map((obligation, index) =>
        fromParsedObligation(obligation, `${path.key}-${subject.name}-${subject.units}-${index}`)
      );
      const result = fixSubject(path.key, subject.name, subject.units, input);
      const label = `${path.key} ${subject.name} ${subject.units ?? ""}`.trim();
      if (result.conflict) {
        conflicts.push(`${label}: ${result.conflict}`);
        continue;
      }
      if (obligationSignature(input) !== obligationSignature(result.obligations)) {
        subject.obligations = result.obligations.map(toParsedObligation);
      }
    }
  }
  return conflicts;
}

function subjectOf(data: ParsedCurriculum, pathKey: string, name: string, units: number | null) {
  const path = data.paths.find((item) => item.key === pathKey);
  const subject = path?.subjects.find((item) => item.name === name && item.units === units);
  if (!subject) throw new Error(`חסר ${pathKey} ${name} ${units}`);
  return subject;
}

function obligationOf(data: ParsedCurriculum, pathKey: string, name: string, units: number | null, eventName: string) {
  const found = subjectOf(data, pathKey, name, units).obligations.find((item) => item.eventName === eventName);
  if (!found) throw new Error(`חסרה מטלה ${pathKey} ${name} ${eventName}`);
  return found;
}

/** Throws when the parsed curriculum does not match the filled-in source site. */
export function assertFixedCurriculum(data: ParsedCurriculum): void {
  const english3 = obligationOf(data, "flexible", "אנגלית", 3, "COBE");
  if (english3.questionnaireNumber !== "16387" || english3.gradeYear !== GRADE_YEAR_12) {
    throw new Error("אנגלית 3 COBE");
  }
  if (obligationOf(data, "flexible", "אנגלית", 3, "A").questionnaireNumber !== "16381") {
    throw new Error("אנגלית 3 A");
  }
  if (obligationOf(data, "flexible", "אנגלית", 3, "B").questionnaireNumber !== null) {
    throw new Error("אנגלית 3 B קיבלה שאלון");
  }

  const moduleD = obligationOf(data, "flexible", "אנגלית", 4, "D");
  if (moduleD.gradeYear !== GRADE_YEAR_12 || moduleD.questionnaireNumber !== null) {
    throw new Error("אנגלית 4 D");
  }
  const grandmother = moduleD.subItems?.find((item) => /gandmother/i.test(item.name));
  const reports = moduleD.subItems?.filter((item) => item.name === "דוח") ?? [];
  if (grandmother?.gradeYear !== GRADE_YEAR_12 || reports.length !== 4) throw new Error("אנגלית 4 תתי-מטלות");
  if (reports[0]?.gradeYear || reports[1]?.gradeYear) throw new Error("אנגלית 4 דוחות ראשונים");
  if (reports[2]?.gradeYear !== GRADE_YEAR_12 || reports[3]?.gradeYear !== GRADE_YEAR_12) {
    throw new Error("אנגלית 4 דוחות אחרונים");
  }

  const moduleF = obligationOf(data, "flexible", "אנגלית", 5, "F");
  if (moduleF.gradeYear !== null) throw new Error("אנגלית 5 F קיבלה שכבת מטלה");
  const wave = moduleF.subItems?.find((item) => item.name === "The Wave");
  const tests = moduleF.subItems?.filter((item) => item.name === "מבחן") ?? [];
  const fReports = moduleF.subItems?.filter((item) => item.name === "דוח") ?? [];
  if (wave?.gradeYear !== GRADE_YEAR_12 || tests[0]?.gradeYear || tests[1]?.gradeYear !== GRADE_YEAR_12) {
    throw new Error("אנגלית 5 תתי-מטלות");
  }
  if (fReports.some((item) => item.gradeYear !== GRADE_YEAR_12)) throw new Error("אנגלית 5 דוחות");

  const mechanics = obligationOf(data, "flexible", "פיסיקה", 5, "בגרות חיצונית מכניקה יא");
  if (mechanics.questionnaireNumber !== "36361" || mechanics.gradeYear !== GRADE_YEAR_11 || mechanics.examType !== "פנימי") {
    throw new Error("פיסיקה מכניקה");
  }
  const electricity = obligationOf(data, "flexible", "פיסיקה", 5, "בגרות חיצונית יב חשמל");
  if (electricity.questionnaireNumber !== "36283" || electricity.gradeYear !== GRADE_YEAR_12) {
    throw new Error("פיסיקה חשמל");
  }

  const theory = obligationOf(data, "flexible", "תקשורת", 5, "בגרות חיצונית תקשורת עיוני");
  if (theory.components?.length !== 1 || theory.components[0]?.name !== "ציון בגרות פנימי") {
    throw new Error("תקשורת עיוני");
  }
  const project = obligationOf(data, "flexible", "מדעי המחשב", 5, "פרויקט");
  if (project.gradeYear !== GRADE_YEAR_10 || project.questionnaireNumber !== null) throw new Error("פרויקט");
  if (project.components?.[0]?.name !== "ציון הגשה" || project.components[0]?.weightPercent !== 100) {
    throw new Error("פרויקט רכיב");
  }

  const regularBible = subjectOf(data, "regular", 'תנ"ך', 5);
  if (regularBible.obligations.length !== 5) throw new Error("תנ\"ך רגילה לא אוחד");
  const intro = regularBible.obligations.find((item) => item.questionnaireNumber === "2383");
  if (intro?.weightPercent !== 18 || intro.eventName !== "פנימי יחידת מלכים ויחידת במדבר") {
    throw new Error("תנ\"ך רגילה 2383");
  }
  if (intro.subItems?.[0]?.name !== "ציון משוקלל מלכים במדבר") throw new Error("תנ\"ך רגילה תת-מטלה");
  const reward = regularBible.obligations.find((item) => item.questionnaireNumber === "2563");
  if (reward?.weightPercent !== 16 || reward.subItems?.[0]?.name !== "תורת הגמול איוב") {
    throw new Error("תנ\"ך רגילה 2563");
  }
  const base = regularBible.obligations.find((item) => item.questionnaireNumber === "2585");
  if (base?.components?.[1]?.name !== "ציון הגשה") throw new Error("תנ\"ך רגילה רכיב הגשה");

  const beitBible = subjectOf(data, "beit_midrash", 'תנ"ך', 5);
  const beitIntro = beitBible.obligations.find((item) => item.questionnaireNumber === "2383");
  if (beitIntro?.gradeYear !== GRADE_YEAR_11 || beitIntro.subItems?.[0]?.gradeYear !== GRADE_YEAR_10) {
    throw new Error("תנ\"ך בית מדרש 2383");
  }
  const beitBase = beitBible.obligations.find((item) => item.questionnaireNumber === "2585");
  if (beitBase?.eventName !== "תנך בסיס יב" || beitBase.gradeYear !== GRADE_YEAR_12) {
    throw new Error("תנ\"ך בית מדרש 2585");
  }
  if (beitBase.components?.[1]?.name !== "ציון פנימי") throw new Error("תנ\"ך בית מדרש רכיב");

  const regularOral = subjectOf(data, "regular", 'תושב"ע', 5);
  if (regularOral.obligations.some((item) => item.questionnaireNumber === "5291")) {
    throw new Error("5291 נשאר");
  }
  const gemara = regularOral.obligations.find((item) => item.questionnaireNumber === "5281");
  if (gemara?.eventName !== "גמרא הגבר" || gemara.gradeYear !== GRADE_YEAR_12) throw new Error("גמרא הגבר");
  if (gemara.components?.[1]?.name !== "ציון הגשה") throw new Error("גמרא הגבר רכיב");

  const meubarOral = subjectOf(data, "meubar_hinuch", 'תושב"ע', 5);
  const meubarGemara = meubarOral.obligations.find((item) => item.questionnaireNumber === "5281");
  if (meubarGemara?.eventName !== "גמרא בסיס משנה" || meubarGemara.gradeYear !== GRADE_YEAR_12) {
    throw new Error("גמרא בסיס משנה");
  }
  const meubarPrayer = meubarOral.obligations.find((item) => item.questionnaireNumber === "5283");
  if (meubarPrayer?.gradeYear !== GRADE_YEAR_11) throw new Error("תפילה במב\"ר השתנתה");

  if (obligationOf(data, "meubar_hinuch", 'תנ"ך', 3, "הערכה חלופית").questionnaireNumber !== "2383") {
    throw new Error("תנ\"ך 3");
  }
  const regularLit = obligationOf(data, "regular", "ספרות ומחשבת ישראל", 5, "גלישת רוח");
  if (regularLit.gradeYear !== GRADE_YEAR_11) throw new Error("גלישת רוח רגילה");
  if (regularLit.subItems?.find((item) => item.name === "תהילה")?.gradeYear !== GRADE_YEAR_11) {
    throw new Error("תהילה");
  }
  const beitWork = obligationOf(data, "beit_midrash", "ספרות ומחשבת ישראל", 5, "מחשבת עבודה");
  if (beitWork.gradeYear !== GRADE_YEAR_10) throw new Error("מחשבת עבודה בית מדרש");
  const meubarWind = obligationOf(data, "meubar_hinuch", "ספרות ומחשבת ישראל", 2, "גלישת רוח");
  if (meubarWind.subItems?.find((item) => item.name === "ישנה בחיק יחדות")?.gradeYear !== GRADE_YEAR_11) {
    throw new Error("ספרות 2");
  }

  for (const pathKey of ["regular", "beit_midrash", "meubar_hinuch"]) {
    const history = obligationOf(data, pathKey, "היסטוריה", 2, "חמד ועד");
    if (history.gradeYear !== GRADE_YEAR_10) throw new Error(`היסטוריה ${pathKey}`);
    const introScience = subjectOf(data, pathKey, "מבוא למדעים", 0).obligations[0];
    if (introScience?.eventName !== "מבוא למדעים" || introScience.gradeYear !== GRADE_YEAR_12) {
      throw new Error(`מבוא למדעים ${pathKey}`);
    }
  }

  const regularHebrew = obligationOf(data, "regular", "עברית", 2, "בגרות חיצונית עברית");
  if (regularHebrew.examEvent !== null) throw new Error("עברית רגילה");
  const beitHebrew = obligationOf(data, "beit_midrash", "עברית", 2, "בגרות חיצונית");
  if (beitHebrew.examEvent !== "חורף יא") throw new Error("עברית בית מדרש");
  if (subjectOf(data, "meubar_hinuch", "חינוך גופני", 0).obligations[0]?.eventName !== "בגרות") {
    throw new Error("חינוך גופני מב\"ר");
  }
  if (subjectOf(data, "regular", "חינוך גופני", 0).obligations[0]?.eventName !== "מבחן סוף שנה") {
    throw new Error("חינוך גופני רגילה");
  }
  const extension = subjectOf(data, "flexible", "היסטוריה הגבר", 5).obligations[0];
  if (extension?.gradeYear !== GRADE_YEAR_12 || extension.questionnaireNumber !== null) {
    throw new Error("היסטוריה הגבר");
  }
}
