// src/tracing/root-registry.ts
import { context, trace } from '@opentelemetry/api'
import type { Context } from '@opentelemetry/api'
import type { SpanProcessor, ReadableSpan, Span } from '@opentelemetry/sdk-trace-base'

const GLOBAL_KEY = 'logicle.rootSpanRegistry.v1'

type RootRegistryState = Map<string, Span> // store SDK spans; they support setAttribute

const globalState: RootRegistryState = (() => {
  const g = globalThis as any
  if (!g[GLOBAL_KEY]) {
    g[GLOBAL_KEY] = new Map<string, Span>()
  }
  return g[GLOBAL_KEY] as RootRegistryState
})()

export const roots = globalState

export class RootServerSpanRegistry implements SpanProcessor {
  onStart(span: Span, _parent: Context): void {
    if (!span.parentSpanContext) {
      roots.set(span.spanContext().traceId, span)
    }
  }

  onEnd(span: ReadableSpan): void {
    if (!span.parentSpanContext) {
      roots.delete(span.spanContext().traceId)
    }
  }

  forceFlush(): Promise<void> {
    return Promise.resolve()
  }
  shutdown(): Promise<void> {
    roots.clear()
    return Promise.resolve()
  }
}

// Helper: set attributes on the *root* server span for the current trace
export function setRootSpanAttrs(attrs: Record<string, unknown>) {
  const active = trace.getSpan(context.active())
  if (!active) return
  const root = roots.get(active.spanContext().traceId)
  if (root) {
    for (const [k, v] of Object.entries(attrs)) root.setAttribute(k, v as any)
  } else {
    console.log("Can't find root span")
  }
}

export const setRootSpanUser = (userId: string) => setRootSpanAttrs({ 'enduser.id': userId })
