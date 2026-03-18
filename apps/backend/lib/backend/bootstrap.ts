import { initializeTelemetryFromProcessEnv } from '@/lib/bootstrap/telemetry'
import { WorkerRuntime } from '@logicle/file-analyzer/worker'
import { getLogger, initializeLogger } from '@/lib/logging'
import { migrateToLatest } from '@/db/migrations'
import { provision } from '@/lib/provision'
import { setFileAnalyzerRuntime } from '@/lib/file-analysis-runtime'

let backendBootstrapped = false

export async function bootstrapBackendRuntime() {
  if (backendBootstrapped) {
    console.info('Backend runtime already bootstrapped')
    return
  }

  console.info('Bootstrapping backend runtime')

  const telemetryInitialized = await initializeTelemetryFromProcessEnv()
  if (telemetryInitialized) {
    console.log(`Initialized opentelemetry endpoint ${process.env.OTEL_EXPORTER_OTLP_ENDPOINT}`)
  }

  initializeLogger()

  console.info('Running database migrations')
  await migrateToLatest()
  console.info('Running provisioning')
  await provision()

  setFileAnalyzerRuntime(new WorkerRuntime(getLogger()))
  backendBootstrapped = true
  console.info('Backend runtime bootstrapped')
}
