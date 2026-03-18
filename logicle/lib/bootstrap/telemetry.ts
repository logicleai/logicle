import { logs } from '@opentelemetry/api-logs'
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http'
import { LoggerProvider, BatchLogRecordProcessor } from '@opentelemetry/sdk-logs'
import {
  detectResources,
  envDetector,
  hostDetector,
  resourceFromAttributes,
} from '@opentelemetry/resources'
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions'
import { registerOTel, OTLPHttpJsonTraceExporter } from '@vercel/otel'
import { RootServerSpanRegistry } from '../tracing/root-registry'

let telemetryInitialized = false

export const initializeTelemetryFromProcessEnv = async (): Promise<boolean> => {
  if (telemetryInitialized) {
    console.info('OpenTelemetry already initialized')
    return false
  }

  const endPoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT
  if (!endPoint) {
    console.info('OpenTelemetry disabled: OTEL_EXPORTER_OTLP_ENDPOINT not set')
    return false
  }

  console.info(`Initializing opentelemetry endpoint ${endPoint}`)

  const detected = detectResources({
    detectors: [hostDetector, envDetector],
  })

  registerOTel({
    serviceName: 'logicle-app',
    traceExporter: new OTLPHttpJsonTraceExporter({
      url: `${endPoint}/v1/traces`,
      headers: {},
    }),
    spanProcessors: [new RootServerSpanRegistry(), 'auto'],
    attributes: detected.attributes,
  })

  const loggerProvider = new LoggerProvider({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: 'logicle-app',
      ...detected.attributes,
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
  telemetryInitialized = true
  console.info(`OpenTelemetry initialized for traces and logs at ${endPoint}`)
  return true
}
