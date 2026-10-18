import { withCaller } from '../../../../src/server/auth/require-user';
import { exportXlsx } from '../../../../src/server/export/xlsx';
import { readJsonObject, readString, rejectUnknownFields } from '../../../../src/server/http/request';

/**
 * `POST /export/xlsx` (FR-12, §12, Task 6.3).
 *
 * The route parses and delegates (ADR-0039); the range's meaning, the column order and the audit row all
 * live in `src/server/export/xlsx.ts` so the cashbook export and the importer can share one definition of
 * what a transaction looks like in a file.
 *
 * A `POST` rather than a `GET`: the request carries a range and produces an audited file, and a `GET` with a
 * body is not a thing. The response is the file itself rather than a link to it, because there is nowhere to
 * put a file — this app has no bucket, no worker and no second process (ADR-0011, ADR-0039), and inventing a
 * download table to hold a spreadsheet between two requests would be a cache with a lifetime to manage.
 */
const EXPORT_FIELDS = ['startDate', 'endDate'];

export const POST = withCaller(async (request, { caller }) => {
  const body = await readJsonObject(request);

  rejectUnknownFields(body, EXPORT_FIELDS);

  const file = await exportXlsx(caller, {
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
