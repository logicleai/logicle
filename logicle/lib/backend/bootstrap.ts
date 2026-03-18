import { initializeTelemetryFromProcessEnv } from '@/lib/bootstrap/telemetry'
import { setRuntime } from '@logicle/file-analyzer'
import { WorkerRuntime } from '@logicle/file-analyzer/worker'
import { getLogger, initializeLogger } from '@/lib/logging'
import { migrateToLatest } from '@/db/migrations'
import { provision } from '@/lib/provision'

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

  await migrateToLatest()
  await provision()

  setRuntime(new WorkerRuntime(getLogger()))
  backendBootstrapped = true
}
