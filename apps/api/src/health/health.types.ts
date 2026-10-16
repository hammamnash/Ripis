/** The health response shape. Narrow on purpose: `status` is the only value that may ever be `ok`. */
export interface HealthResponse {
  status: 'ok';
}
