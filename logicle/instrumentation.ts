import { logger } from '@/lib/logging'
import { registerOTel, OTLPHttpJsonTraceExporter } from '@vercel/otel'
import { logs } from '@opentelemetry/api-logs'
import { LoggerProvider, BatchLogRecordProcessor } from '@opentelemetry/sdk-logs'
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http'
//import { WinstonInstrumentation } from '@opentelemetry/instrumentation-winston'
import { OpenTelemetryTransportV3 } from '@opentelemetry/winston-transport'
import { resourceFromAttributes } from '@opentelemetry/resources'
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions'

const initOpenTelemetry = async () => {
  // Enable debug-level logging to console
  //diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.DEBUG)
  registerOTel({
    serviceName: 'logicle-app',
    traceExporter: new OTLPHttpJsonTraceExporter({
      url: 'http://10.0.0.7:4318/v1/traces',
      headers: {},
    }),
    spanProcessors: ['auto'],
    //instrumentations: [new WinstonInstrumentation()],
  })

  // Setup logger provider
  const loggerProvider = new LoggerProvider({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: 'logicle-app',
    }),
    processors: [
      new BatchLogRecordProcessor(
        new OTLPLogExporter({
          url: 'http://10.0.0.7:4318/v1/logs',
          headers: {},
        })
      ),
    ],
  })
  logs.setGlobalLoggerProvider(loggerProvider)
  /*  
  logger.add(new OpenTelemetryTransportV3())
  */
}

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await initOpenTelemetry()
    const sd = await import('./db/migrations')
    await sd.migrateToLatest()
    const provision = await import('./lib/provision')
    await provision.provision()
  }
}
