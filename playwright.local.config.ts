import base from './playwright.config';

/* Temporary harness: runs the suite against the `next dev` server already listening on 3001 instead of
   starting a production server on 3100. Delete after use. */
export default {
  ...base,
  use: { ...base.use, baseURL: 'http://127.0.0.1:3001' },
  webServer: undefined,
};
