import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'node:fs';
const p = new PrismaClient();
const id = readFileSync('C:/Users/ATDSOL/Working Directory/Personal Project/Ripis/.ui-audit/audit-session.txt', 'utf8').trim();
const before = await p.session.count({ where: { id } });
await p.session.deleteMany({ where: { id } });
const after = await p.session.count({ where: { id } });
console.log(JSON.stringify({ sessionId: id, before, after }));
await p.$disconnect();
