import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
const subjects = await p.subject.findMany({
  where: { category: { in: ["MATH", "ENGLISH", "TRACK"] } },
  select: { name: true, units: true, category: true, _count: { select: { obligations: true } } },
  orderBy: [{ category: "asc" }, { name: "asc" }, { units: "asc" }],
});
console.log(JSON.stringify(subjects, null, 2));
await p.$disconnect();
