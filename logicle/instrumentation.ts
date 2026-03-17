import { initializeTelemetryFromProcessEnv } from './lib/bootstrap/telemetry'

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const initialized = await initializeTelemetryFromProcessEnv()
    if (initialized) {
      console.log(
        `Next instrumentation confirmed opentelemetry endpoint ${process.env.OTEL_EXPORTER_OTLP_ENDPOINT}`
      )
    }

    const sd = await import('./db/migrations')
    await sd.migrateToLatest()
    const provision = await import('./lib/provision')
    await provision.provision()
  }
}
