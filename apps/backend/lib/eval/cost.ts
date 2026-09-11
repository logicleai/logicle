/**
 * Model pricing, used to turn token counts into the number the comparison is actually about.
 *
 * Prices are USD per million tokens. Prices drift: an unknown or stale model must degrade to
 * "no cost", never to a wrong cost, so every consumer treats `undefined` as "report tokens only"
 * rather than as zero.
 */

export interface ModelPriceRates {
  /** USD per million input tokens. */
  input: number
  /** USD per million output tokens. */
  output: number
  /** Provider prompt-cache read price. Omitted when it is the same as ordinary input. */
  cacheReadInput?: number
  /** Provider prompt-cache write price. Omitted when it is the same as ordinary input. */
  cacheWriteInput?: number
}

export interface ModelPrice extends ModelPriceRates {
  longContext?: ModelPriceRates
}

export const LONG_CONTEXT_INPUT_TOKENS = 272_000

export const modelPrices: Record<string, ModelPrice> = {
  // OpenAI
  'gpt-4o-mini': { input: 0.15, output: 0.6, cacheReadInput: 0.075 },
  'gpt-4o': { input: 2.5, output: 10.0, cacheReadInput: 1.25 },
  'gpt-4.1-mini': { input: 0.4, output: 1.6, cacheReadInput: 0.1 },
  'gpt-4.1': { input: 2.0, output: 8.0, cacheReadInput: 0.5 },
  'gpt-5.6-terra': { input: 2.0, output: 12.0, cacheReadInput: 0.2 },
  'gpt-5-latest': { input: 2.0, output: 12.0, cacheReadInput: 0.2 },
  'gpt-5.6-luna': {
    input: 0.2,
    output: 1.2,
    cacheReadInput: 0.02,
    cacheWriteInput: 0.25,
    longContext: {
      input: 0.4,
      output: 1.8,
      cacheReadInput: 0.04,
      cacheWriteInput: 0.5,
    },
  },
  'gpt-4-turbo': { input: 10.0, output: 30.0 },
  'gpt-4': { input: 30.0, output: 60.0 },
  'gpt-3.5-turbo': { input: 0.5, output: 1.5 },
  'o1-mini': { input: 1.1, output: 4.4 },
  o1: { input: 15.0, output: 60.0 },
  'o3-mini': { input: 1.1, output: 4.4 },
  o3: { input: 10.0, output: 40.0 },

  // Anthropic
  'claude-3-haiku': { input: 0.25, output: 1.25, cacheReadInput: 0.025, cacheWriteInput: 0.3125 },
  'claude-3-5-haiku': { input: 0.8, output: 4.0, cacheReadInput: 0.08, cacheWriteInput: 1.0 },
  'claude-3-5-sonnet': { input: 3.0, output: 15.0, cacheReadInput: 0.3, cacheWriteInput: 3.75 },
  'claude-3-7-sonnet': { input: 3.0, output: 15.0, cacheReadInput: 0.3, cacheWriteInput: 3.75 },
  'claude-3-opus': { input: 15.0, output: 75.0, cacheReadInput: 1.5, cacheWriteInput: 18.75 },
  'claude-haiku-4': { input: 0.8, output: 4.0, cacheReadInput: 0.08, cacheWriteInput: 1.0 },
  'claude-sonnet-4': { input: 3.0, output: 15.0, cacheReadInput: 0.3, cacheWriteInput: 3.75 },
  'claude-opus-4': { input: 15.0, output: 75.0, cacheReadInput: 1.5, cacheWriteInput: 18.75 },
  'claude-opus-4-5': { input: 5.0, output: 25.0, cacheReadInput: 0.5, cacheWriteInput: 6.25 },
  'claude-sonnet-5': { input: 2.0, output: 10.0, cacheReadInput: 0.2, cacheWriteInput: 2.5 },
  'claude-sonnet-latest': {
    input: 2.0,
    output: 10.0,
    cacheReadInput: 0.2,
    cacheWriteInput: 2.5,
  },

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
  outputTokens: number,
  inputTokenDetails?: {
    noCacheTokens?: number
    cacheReadTokens?: number
    cacheWriteTokens?: number
  }
): number | undefined => {
  const price = resolveModelPrice(modelId)
  if (!price) return undefined
  const rates =
    price.longContext && inputTokens > LONG_CONTEXT_INPUT_TOKENS ? price.longContext : price
  const hasCacheDetails =
    inputTokenDetails?.cacheReadTokens !== undefined ||
    inputTokenDetails?.cacheWriteTokens !== undefined
  if (!hasCacheDetails) {
    return (inputTokens * rates.input + outputTokens * rates.output) / 1_000_000
  }
  const cacheReadTokens = inputTokenDetails?.cacheReadTokens ?? 0
  const cacheWriteTokens = inputTokenDetails?.cacheWriteTokens ?? 0
  const noCacheTokens =
    inputTokenDetails?.noCacheTokens ??
    Math.max(inputTokens - cacheReadTokens - cacheWriteTokens, 0)
  return (
    (noCacheTokens * rates.input +
      cacheReadTokens * (rates.cacheReadInput ?? rates.input) +
      cacheWriteTokens * (rates.cacheWriteInput ?? rates.input) +
      outputTokens * rates.output) /
    1_000_000
  )
}

/** Full-price counterfactual, ignoring provider prompt-cache discounts. */
export const computeUndiscountedCostUsd = (
  modelId: string,
  inputTokens: number,
  outputTokens: number
): number | undefined => computeCostUsd(modelId, inputTokens, outputTokens)

/** Formats a cost for the report, keeping small numbers readable rather than rounding them to 0. */
export const formatCostUsd = (cost: number | undefined): string => {
  if (cost === undefined) return 'n/a'
  if (cost === 0) return '$0'
  if (cost < 0.01) return `$${cost.toFixed(5)}`
  return `$${cost.toFixed(4)}`
}
