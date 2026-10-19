import { withCaller } from '../../../../src/server/auth/require-user';
import { readJsonObject, readString, rejectUnknownFields } from '../../../../src/server/http/request';
import { importCashbook } from '../../../../src/server/import/apply';

/**
 * `POST /import/cashbook` (FR-12, §12, Task 6.5).
 *
 * The one endpoint that writes a ledger from a file, and the other half of ADR-0008: the cashbook export is
 * only a format this application can read back because this route exists, and the round-trip spec is what
 * holds the two definitions against each other.
 *
 * The body is the file itself, base64 encoded, and not a link to one. There is no bucket, no worker and no
 * second process to hold a spreadsheet between two requests (ADR-0011, ADR-0039), and a file that arrived by
 * upload is the one this application can be sure it read. The two fields are the file and the name it arrived
 * under — the name goes in the audit row, because "which file" is the question an import has to answer later.
 *
 * The answer is a summary rather than the rows: what the file held, what was created, and the span of dates it
 * covered. A person importing five years of history wants to know that it landed, and a response carrying
 * 9,174 rows would be a second copy of the file.
 */
const IMPORT_FIELDS = ['filename', 'contentBase64'];

export const POST = withCaller(async (request, { caller }) => {
  const body = await readJsonObject(request);

  rejectUnknownFields(body, IMPORT_FIELDS);

  const summary = await importCashbook(caller, {
    filename: readString(body, 'filename'),
    contentBase64: readString(body, 'contentBase64'),
  });

  return Response.json(summary, { status: 200 });
});
