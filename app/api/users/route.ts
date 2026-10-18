import { withCaller } from '../../../src/server/auth/require-user';
import { readJsonObject, readString } from '../../../src/server/http/request';
import { createUser } from '../../../src/server/users/create-user';

/**
 * Admin-only account creation (Task 2.5). There is no self-signup endpoint anywhere in this app, and
 * nothing here is a step towards one: ADR-0013's answer to "how do I get an account" is that an admin
 * makes it. A `role` in the body is ignored — `createUser` does not take one.
 */
export const POST = withCaller(async (request, { caller }) => {
  const body = await readJsonObject(request);

  const created = await createUser({
    actor: caller,
    name: readString(body, 'name'),
    email: readString(body, 'email'),
    password: readString(body, 'password'),
    primaryCurrencyId: readString(body, 'primaryCurrencyId'),
  });

  return Response.json(created, { status: 201 });
});
