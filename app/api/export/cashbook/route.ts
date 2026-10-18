import { withCaller } from '../../../../src/server/auth/require-user';
import { exportCashbook } from '../../../../src/server/export/cashbook';
import { readJsonObject, readString, rejectUnknownFields } from '../../../../src/server/http/request';

/**
 * `POST /export/cashbook` (FR-12, §12, Task 6.4).
 *
 * The route parses and delegates (ADR-0039) — the eleven columns, the two rows a transfer becomes and the
 * audit entry all live in `src/server/export/cashbook.ts`, so the importer (Task 6.5) can read the same
 * definition of the shape it has to write back.
 *
 * The inputs are the same two fields as `/export/xlsx` and nothing else: §12 gives the cashbook a date range,
 * and a field the endpoint has no use for is refused rather than ignored (ADR-0054). The response is the file
 * itself rather than a link, because this application has no bucket, no worker and no second process to hold
 * a spreadsheet between two requests (ADR-0011, ADR-0039).
 */
const EXPORT_FIELDS = ['startDate', 'endDate'];

export const POST = withCaller(async (request, { caller }) => {
  const body = await readJsonObject(request);

  rejectUnknownFields(body, EXPORT_FIELDS);

  const file = await exportCashbook(caller, {
    startDate: readString(body, 'startDate'),
    endDate: readString(body, 'endDate'),
  });

  return new Response(new Uint8Array(file.buffer), {
    headers: {
      'content-type': file.contentType,
      // The filename is the range, so two exports of the same month are recognisable in a downloads folder
      // without opening either.
      'content-disposition': `attachment; filename="${file.filename}"`,
    },
  });
});
