/**
 * Model pricing, used to turn token counts into the number the comparison is actually about.
 *
 * Prices are USD per million tokens and are a copy of the table the ops tooling already uses
 * (`libs/admin_lib.py` in logicle-infra-deploy). They drift: an unknown or stale model must
 * degrade to "no cost", never to a wrong cost, so every consumer treats `undefined` as
 * "report tokens only" rather than as zero.
 */

export interface ModelPrice {
  /** USD per million input tokens. */
  input: number
  /** USD per million output tokens. */
  output: number
}

export const modelPrices: Record<string, ModelPrice> = {
  // OpenAI
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
  'gpt-4o': { input: 2.5, output: 10.0 },
  'gpt-4.1-mini': { input: 0.4, output: 1.6 },
  'gpt-4.1': { input: 2.0, output: 8.0 },
  'gpt-4-turbo': { input: 10.0, output: 30.0 },
  'gpt-4': { input: 30.0, output: 60.0 },
  'gpt-3.5-turbo': { input: 0.5, output: 1.5 },
  'o1-mini': { input: 1.1, output: 4.4 },
  o1: { input: 15.0, output: 60.0 },
  'o3-mini': { input: 1.1, output: 4.4 },
  o3: { input: 10.0, output: 40.0 },

  // Anthropic
  'claude-3-haiku': { input: 0.25, output: 1.25 },
  'claude-3-5-haiku': { input: 0.8, output: 4.0 },
  'claude-3-5-sonnet': { input: 3.0, output: 15.0 },
  'claude-3-7-sonnet': { input: 3.0, output: 15.0 },
  'claude-3-opus': { input: 15.0, output: 75.0 },
  'claude-haiku-4': { input: 0.8, output: 4.0 },
  'claude-sonnet-4': { input: 3.0, output: 15.0 },
  'claude-opus-4': { input: 15.0, output: 75.0 },
  'claude-opus-4-5': { input: 5.0, output: 25.0 },

  // Google
  'gemini-1.5-flash': { input: 0.075, output: 0.3 },
  'gemini-2.0-flash': { input: 0.1, output: 0.4 },
  'gemini-2.5-flash': { input: 0.3, output: 2.5 },
  'gemini-2.5-pro': { input: 1.25, output: 10.0 },
}

/**
 * Resolves a price for a model id. Exact match wins; otherwise the longest registered id that the
 * model id starts with, so dated snapshots (`gpt-4o-mini-2024-07-18`) and vendor prefixes
 * (`openai/gpt-4o`) resolve to their base model instead of silently falling off the table.
 */
export const resolveModelPrice = (modelId: string): ModelPrice | undefined => {
  const normalized = modelId.toLowerCase()
  const exact = modelPrices[normalized]
  if (exact) return exact

  const bare = normalized.includes('/')
    ? normalized.slice(normalized.lastIndexOf('/') + 1)
    : normalized
  const exactBare = modelPrices[bare]
  if (exactBare) return exactBare

  let best: { id: string; price: ModelPrice } | undefined
  for (const [id, price] of Object.entries(modelPrices)) {
    if (!bare.startsWith(id)) continue
    if (!best || id.length > best.id.length) best = { id, price }
  }
  return best?.price
}

export const computeCostUsd = (
  modelId: string,
  inputTokens: number,
  outputTokens: number
): number | undefined => {
  const price = resolveModelPrice(modelId)
  if (!price) return undefined
  return (inputTokens * price.input + outputTokens * price.output) / 1_000_000
}

/** Formats a cost for the report, keeping small numbers readable rather than rounding them to 0. */
export const formatCostUsd = (cost: number | undefined): string => {
  if (cost === undefined) return 'n/a'
  if (cost === 0) return '$0'
  if (cost < 0.01) return `$${cost.toFixed(5)}`
  return `$${cost.toFixed(4)}`
}
