import { registerOTel, OTLPHttpJsonTraceExporter } from '@vercel/otel'

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
  })
  // Add Winston integration for log↔trace correlation (no log sending)
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
