/** Shared native transport policy for application queries and migrations. */
export function postgresConfig(connectionString) {
  const url = new URL(connectionString);
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw new Error('A PostgreSQL connection URL is required.');
  const privateHost = url.hostname.endsWith('.railway.internal') || ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  const sslMode = url.searchParams.get('sslmode');
  if (!privateHost) {
    if (sslMode && !['require', 'verify-ca', 'verify-full'].includes(sslMode)) throw new Error('Public PostgreSQL connections require verified TLS.');
    // URL TLS options override pg's ssl object, so enforce verification there too.
    url.searchParams.set('sslmode', 'verify-full');
  }
  return {
    connectionString: url.toString(),
    ssl: privateHost && !sslMode ? false : { rejectUnauthorized: true },
    max: 5,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 10_000,
    statement_timeout: 10_000,
    query_timeout: 15_000,
    idle_in_transaction_session_timeout: 10_000,
    application_name: 'propbrew',
    allowExitOnIdle: true,
  };
}
