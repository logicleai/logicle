import type { CorpusDocument, ReferenceChatMessage, Scenario } from '../types'

/**
 * Saved, anonymized reference chats for context-compression policy evaluation.
 *
 * No production text, title, user id, tenant id, assistant id, or conversation id is retained.
 * Their turn counts are anchored to aggregate shapes from the 100 most expensive conversations
 * observed over a 30-day window (p25=6, p50=13, p75=33 messages). Facts and prose are synthetic.
 */

const padding = (label: string, paragraphs: number): string =>
  Array.from(
    { length: paragraphs },
    (_, index) =>
      `${label} background note ${
        index + 1
      }: routine operational commentary covering ownership, scheduling, review status, dependencies, and non-binding implementation observations. This paragraph is intentionally ordinary and contains no decision or answer required by the evaluation.`
  ).join('\n\n')

const attachment = (name: string, fact: string, paragraphs = 150): CorpusDocument => ({
  name,
  mimeType: 'text/plain',
  text: [
    `${name}\n`,
    padding(name, paragraphs),
    '\nAuthoritative final record\n',
    fact,
    '\nEnd of record.',
  ].join('\n'),
})

const user = (text: string, attachments?: string[]): ReferenceChatMessage => ({
  role: 'user',
  text,
  attachments,
})
const assistant = (text: string): ReferenceChatMessage => ({ role: 'assistant', text })

const routineTurn = (index: number): ReferenceChatMessage[] => [
  user(`Give me a brief status update for routine workstream ${index}.`),
  assistant(
    `Workstream ${index} remains on schedule. ${padding(
      `Workstream ${index}`,
      4
    )} No exception in this update supersedes a separately approved final record.`
  ),
]

const scenario = (
  id: string,
  description: string,
  corpus: CorpusDocument[],
  history: ReferenceChatMessage[],
  finalUserMessage: string,
  rubric: string,
  answerKey: NonNullable<Scenario['answerKey']>,
  sourceShape: NonNullable<NonNullable<Scenario['referenceChat']>['sourceShape']>,
  compressionExpectation: NonNullable<
    NonNullable<Scenario['referenceChat']>['compressionExpectation']
  > = { triggered: true }
): Scenario => ({
  id,
  description,
  corpus,
  goal: finalUserMessage,
  maxTurns: 1,
  rubric,
  answerKey,
  systemPromptSuffix: [
    'You are continuing a saved company conversation.',
    'Answer the final user message from the exact historical record.',
    'When a historical message says its original content is available through a context retrieval function, call the function before answering if the visible summary does not contain the exact fact.',
    'Do not guess or substitute a similar value from another turn.',
  ].join(' '),
  referenceChat: { history, finalUserMessage, sourceShape, compressionExpectation },
})

const recentAttachmentName = 'release-approval-record.txt'
const recentAttachment = attachment(
  recentAttachmentName,
  'The final release authorization code is ORCHID-7419. The transposed code ORCHID-1749 is invalid.'
)

export const recentAttachmentScenario = scenario(
  'compression-recent-attachment',
  'Single-turn recall from an attachment in the immediately preceding turn (n-1).',
  [recentAttachment],
  [
    ...routineTurn(1),
    ...routineTurn(2),
    user('Archive this release approval record for the launch review.', [recentAttachmentName]),
    assistant('Archived. I will use the final record if you ask for the authorization later.'),
  ],
  'What is the exact final release authorization code? Reply with the code only.',
  'The assistant returns the exact authorization code from the attachment in the immediately preceding turn.',
  { mustMention: ['ORCHID-7419'], mustNotMention: ['ORCHID-1749'] },
  { cohort: 'expensive-conversations-30d-p25', messageCount: 6 }
)

const middleAttachmentName = 'transition-calendar.txt'
const middleAttachment = attachment(
  middleAttachmentName,
  'The approved production transition date is 17 November 2027. Earlier planning dates are superseded.'
)

export const middleAttachmentScenario = scenario(
  'compression-middle-attachment',
  'Single-turn recall from an attachment three completed turns behind the final question (n-3).',
  [middleAttachment],
  [
    ...routineTurn(1),
    ...routineTurn(2),
    ...routineTurn(3),
    user('Store the approved transition calendar for later.', [middleAttachmentName]),
    assistant('Stored. I will treat the final record as authoritative.'),
    ...routineTurn(5),
    ...routineTurn(6),
  ],
  'According to the approved record, what is the exact production transition date?',
  'The assistant returns the authoritative date from the attachment at n-3, not a guessed planning date.',
  { mustMention: ['17 November 2027'] },
  { cohort: 'expensive-conversations-30d-p50', messageCount: 12 }
)

const recentDecisionText = [
  padding('Architecture decision discussion', 150),
  'Final decision: the migration program codename is Kestrel Blue. This supersedes every working name above.',
].join('\n\n')

export const recentAssistantDecisionScenario = scenario(
  'compression-recent-assistant',
  'Single-turn recall from a long assistant response in the immediately preceding turn (n-1).',
  [],
  [
    ...routineTurn(1),
    ...routineTurn(2),
    user('Record the final architecture decision and its program codename.'),
    assistant(recentDecisionText),
  ],
  'What exact program codename did you record in the final decision? Reply with the codename only.',
  'The assistant recalls the final codename from its own immediately preceding long response.',
  { mustMention: ['Kestrel Blue'] },
  { cohort: 'expensive-conversations-30d-p25', messageCount: 6 }
)

const farToolResult = [
  'Ledger reconciliation export',
  padding('Ledger row', 150),
  'Authoritative reconciled balance: EUR 418,275.60.',
  'A provisional balance of EUR 481,257.60 was rejected and must not be used.',
].join('\n\n')

const farHistory: ReferenceChatMessage[] = [
  user('Run the ledger reconciliation and keep the authoritative balance available.'),
  {
    role: 'assistant',
    text: 'I will query the ledger now.',
    toolCall: { id: 'ledger-call-1', name: 'ledger_lookup', args: { period: 'FY27-Q2' } },
  },
  {
    role: 'tool',
    toolCallId: 'ledger-call-1',
    toolName: 'ledger_lookup',
    result: farToolResult,
  },
  assistant(
    'The reconciliation completed; the authoritative output is recorded in the tool result.'
  ),
  ...Array.from({ length: 14 }, (_, index) => routineTurn(index + 2)).flat(),
]

export const farToolScenario = scenario(
  'compression-far-tool-output',
  'Single-turn recall from a large historical tool result near the start of a 32-message history.',
  [],
  farHistory,
  'What was the exact authoritative reconciled balance from the ledger run? Reply with the amount only, including currency and cents.',
  'The assistant retrieves the original historical tool result and returns the authoritative balance.',
  { mustMention: ['EUR 418,275.60'], mustNotMention: ['EUR 481,257.60'] },
  { cohort: 'expensive-conversations-30d-p75', messageCount: 32 }
)

const irrelevantToolResult = [
  'Historical observability export',
  padding('Archived telemetry row', 150),
  'End of archived export. This payload is unrelated to current escalation routing.',
].join('\n\n')

export const irrelevantOldBulkScenario = scenario(
  'compression-irrelevant-old-bulk',
  'A large far tool result is irrelevant; the answer is in a short recent assistant message.',
  [],
  [
    user('Archive the old observability export.'),
    {
      role: 'assistant',
      toolCall: { id: 'telemetry-call-1', name: 'telemetry_export', args: { period: 'archive' } },
    },
    {
      role: 'tool',
      toolCallId: 'telemetry-call-1',
      toolName: 'telemetry_export',
      result: irrelevantToolResult,
    },
    assistant('The historical export is archived.'),
    ...Array.from({ length: 12 }, (_, index) => routineTurn(index + 2)).flat(),
    user('Record the current escalation channel.'),
    assistant('The current escalation channel is Falcon Desk.'),
  ],
  'What is the current escalation channel? Reply with its name only.',
  'The assistant answers from the recent short message without retrieving the irrelevant old payload.',
  { mustMention: ['Falcon Desk'] },
  { cohort: 'expensive-conversations-30d-p75', messageCount: 30 }
)

const mixedAttachmentName = 'service-acceptance.txt'
const mixedAttachment = attachment(
  mixedAttachmentName,
  'The accepted service restoration window is 14 business days from verified incident closure.'
)
const mixedToolResult = [
  padding('Registry response', 100),
  'The authoritative service registry identifier is LUMEN-83. LUMEN-38 is a retired identifier.',
].join('\n\n')

export const mixedDepthScenario = scenario(
  'compression-mixed-depth',
  'Two-fact recall combining a far tool result with an immediately preceding attachment.',
  [mixedAttachment],
  [
    user('Look up the active service registry identifier.'),
    {
      role: 'assistant',
      toolCall: { id: 'registry-call-1', name: 'service_registry', args: { status: 'active' } },
    },
    {
      role: 'tool',
      toolCallId: 'registry-call-1',
      toolName: 'service_registry',
      result: mixedToolResult,
    },
    assistant('The active identifier is recorded in the registry result.'),
    ...Array.from({ length: 5 }, (_, index) => routineTurn(index + 2)).flat(),
    user('Also store the accepted restoration window.', [mixedAttachmentName]),
    assistant('Stored. The attached acceptance record is authoritative.'),
  ],
  'Give me the exact active service registry identifier and the accepted restoration window. Reply with those two values only.',
  'The assistant combines the far tool result with the recent attached record, without using the retired identifier.',
  { mustMention: ['LUMEN-83', '14 business days'], mustNotMention: ['LUMEN-38'] },
  { cohort: 'expensive-conversations-30d-p50', messageCount: 16 }
)

export const belowTriggerTextScenario = scenario(
  'compression-below-trigger-text',
  'A short text-only conversation stays verbatim because it is well below the global trigger.',
  [],
  [
    user('Record the room for the launch review.'),
    assistant('The launch review is in Cedar Room.'),
    user('Also record the start time.'),
    assistant('The launch review starts at 09:40.'),
  ],
  'Where and when is the launch review? Reply with the room and time only.',
  'The assistant answers from the short verbatim history while compression remains a no-op.',
  { mustMention: ['Cedar Room', '09:40'] },
  { cohort: 'synthetic-below-trigger-text', messageCount: 4 },
  {
    triggered: false,
    applied: false,
    maxSummarizedMessages: 0,
    maxEstimatedHistoryTokenReduction: 0,
  }
)

const tinyAttachmentName = 'desk-label.txt'
const tinyAttachment: CorpusDocument = {
  name: tinyAttachmentName,
  mimeType: 'text/plain',
  text: 'Approved support desk label: Juniper Gate.',
}

export const belowTriggerAttachmentScenario = scenario(
  'compression-below-trigger-attachment',
  'A small historical attachment stays native because the whole conversation is below the trigger.',
  [tinyAttachment],
  [
    user('Keep this short support-desk label for later.', [tinyAttachmentName]),
    assistant('Stored.'),
  ],
  'What is the exact approved support desk label? Reply with the label only.',
  'The assistant reads the small attachment without activating context compression.',
  { mustMention: ['Juniper Gate'] },
  { cohort: 'synthetic-below-trigger-attachment', messageCount: 2 },
  {
    triggered: false,
    applied: false,
    maxSummarizedMessages: 0,
    maxEstimatedHistoryTokenReduction: 0,
  }
)

export const aboveTriggerIncompressibleTextScenario = scenario(
  'compression-above-trigger-incompressible-text',
  'A long history made only of individually short text messages crosses the trigger but has nothing worth summarizing.',
  [],
  [
    ...Array.from({ length: 36 }, (_, index) => routineTurn(index + 1)).flat(),
    user('Record the final routing label.'),
    assistant('The final routing label is Quartz Relay.'),
  ],
  'What is the final routing label? Reply with the label only.',
  'The assistant answers from recent verbatim text; the planner must find no eligible message to summarize.',
  { mustMention: ['Quartz Relay'] },
  { cohort: 'synthetic-above-trigger-no-eligible-content', messageCount: 74 },
  {
    triggered: true,
    applied: false,
    maxSummarizedMessages: 0,
    maxEstimatedHistoryTokenReduction: 0,
  }
)

export const belowTriggerIncompressibleTextScenario = scenario(
  'compression-below-trigger-incompressible-text',
  'A substantial history of individually short messages remains below the trigger and stays verbatim.',
  [],
  [
    ...Array.from({ length: 24 }, (_, index) => routineTurn(index + 1)).flat(),
    user('Record the final dispatch label.'),
    assistant('The final dispatch label is Silver Harbor.'),
  ],
  'What is the final dispatch label? Reply with the label only.',
  'The assistant answers from recent verbatim text without activating compression near the trigger boundary.',
  { mustMention: ['Silver Harbor'] },
  { cohort: 'synthetic-below-trigger-no-eligible-content', messageCount: 50 },
  {
    triggered: false,
    applied: false,
    maxSummarizedMessages: 0,
    maxEstimatedHistoryTokenReduction: 0,
  }
)

export const tinyAttachmentOverheadScenario = scenario(
  'compression-tiny-attachment-overhead',
  'A tiny historical attachment appears in an otherwise incompressible history above the trigger.',
  [tinyAttachment],
  [
    user('Keep this short support-desk label for later.', [tinyAttachmentName]),
    assistant('Stored.'),
    ...Array.from({ length: 36 }, (_, index) => routineTurn(index + 1)).flat(),
    user('Record the current incident colour.'),
    assistant('The current incident colour is Amber Violet.'),
  ],
  'What is the current incident colour? Reply with the colour only.',
  'The assistant answers from recent verbatim text without paying to replace a tiny irrelevant attachment with a larger recovery reference.',
  { mustMention: ['Amber Violet'] },
  { cohort: 'synthetic-above-trigger-tiny-attachment', messageCount: 76 },
  {
    triggered: true,
    applied: false,
    maxSummarizedMessages: 0,
    maxEstimatedHistoryTokenReduction: 0,
  }
)

export const contextCompressionBoundaryScenarios: Scenario[] = [
  belowTriggerTextScenario,
  belowTriggerAttachmentScenario,
  belowTriggerIncompressibleTextScenario,
  aboveTriggerIncompressibleTextScenario,
  tinyAttachmentOverheadScenario,
]

export const contextCompressionScenarios: Scenario[] = [
  recentAttachmentScenario,
  middleAttachmentScenario,
  recentAssistantDecisionScenario,
  farToolScenario,
  irrelevantOldBulkScenario,
  mixedDepthScenario,
  ...contextCompressionBoundaryScenarios,
]
