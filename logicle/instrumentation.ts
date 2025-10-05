import { registerOTel, OTLPHttpJsonTraceExporter } from '@vercel/otel'
import { logs } from '@opentelemetry/api-logs'
import { LoggerProvider, BatchLogRecordProcessor } from '@opentelemetry/sdk-logs'
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http'
import { resourceFromAttributes } from '@opentelemetry/resources'
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions'
import { RootServerSpanRegistry } from './lib/tracing/root-registry'

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const initOpenTelemetry = async (endPoint: string) => {
      const os = await import('node:os')

      registerOTel({
        serviceName: 'logicle-app',
        traceExporter: new OTLPHttpJsonTraceExporter({
          url: `${endPoint}/v1/traces`,
          headers: {},
        }),
        spanProcessors: [new RootServerSpanRegistry(), 'auto'], // put ours BEFORE 'auto'
        attributes: {
          'host.name': os.hostname(),
        },
        // I'm not sure why it happens, but... it is instrument automatically
        // instrumentations: [new WinstonInstrumentation()],
      })

      // Setup logger provider
      const loggerProvider = new LoggerProvider({
        resource: resourceFromAttributes({
          [ATTR_SERVICE_NAME]: 'logicle-app',
          'host.name': os.hostname(),
        }),
        processors: [
          new BatchLogRecordProcessor(
            new OTLPLogExporter({
              url: `${endPoint}/v1/logs`,
              headers: {},
            })
          ),
        ],
      })
      logs.setGlobalLoggerProvider(loggerProvider)
    }
    const endPoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT
    if (endPoint) {
      console.log(`Initializing opentelemetry endpoint ${endPoint}`)
      await initOpenTelemetry(endPoint)
    }
    const sd = await import('./db/migrations')
    await sd.migrateToLatest()
    const provision = await import('./lib/provision')
    await provision.provision()
  }
}
