import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
const users = await p.user.findMany({ select: { id: true, email: true, role: true, created_at: true } });
for (const u of users) {
  const [w, t, b] = await Promise.all([
    p.wallet.count({ where: { user_id: u.id, deleted_at: null } }),
    p.transaction.count({ where: { user_id: u.id, deleted_at: null } }),
    p.budget.count({ where: { user_id: u.id } }),
  ]);
  console.log(`${u.email} [${u.role}] wallets=${w} tx=${t} budgets=${b}`);
}
await p.$disconnect();
