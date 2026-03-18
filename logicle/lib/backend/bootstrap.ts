import { initializeTelemetryFromProcessEnv } from '@/lib/bootstrap/telemetry'
import { setRuntime } from '@logicle/file-analyzer'
import { WorkerRuntime } from '@logicle/file-analyzer/worker'
import { getLogger, initializeLogger } from '@/lib/logging'

let backendBootstrapped = false

export async function bootstrapBackendRuntime() {
  if (backendBootstrapped) {
    return
  }

  const telemetryInitialized = await initializeTelemetryFromProcessEnv()
  if (telemetryInitialized) {
    console.log(`Initialized opentelemetry endpoint ${process.env.OTEL_EXPORTER_OTLP_ENDPOINT}`)
  }

  initializeLogger()

  const migrations = await import('@/db/migrations')
  await migrations.migrateToLatest()

  const provision = await import('@/lib/provision')
  await provision.provision()

  setRuntime(new WorkerRuntime(getLogger()))
  backendBootstrapped = true
}
