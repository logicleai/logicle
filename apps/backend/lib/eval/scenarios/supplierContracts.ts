import type { CorpusDocument, Scenario } from '../types'

/**
 * A corpus of supplier contracts, built so that the two arms are actually distinguishable.
 *
 * The properties that matter:
 *  - the answer lives in exactly one document, so retrieval has to find the right one;
 *  - the other documents contain the *same kind* of clause with different numbers, so an arm that
 *    retrieves sloppily produces a confident wrong answer rather than an obvious failure — that is
 *    what `mustNotMention` catches;
 *  - each document carries enough standard boilerplate to be realistically expensive, so the
 *    all-in-context arm pays what it would pay in a real deployment.
 */

interface ContractSpec {
  supplier: string
  reference: string
  paymentDays: number
  latePenalty: string
  noticeDays: number
  liabilityCap: string
  renewalMonths: number
}

const specs: ContractSpec[] = [
  {
    supplier: 'Northwind Logistics',
    reference: 'NW-2024-118',
    paymentDays: 45,
    latePenalty: '0.9% per month',
    noticeDays: 60,
    liabilityCap: 'EUR 250,000',
    renewalMonths: 12,
  },
  {
    supplier: 'Corvara Metalworks',
    reference: 'CM-2023-071',
    paymentDays: 30,
    latePenalty: '2.4% per month',
    noticeDays: 90,
    liabilityCap: 'EUR 1,200,000',
    renewalMonths: 24,
  },
  {
    supplier: 'Halcyon Data Services',
    reference: 'HDS-2025-004',
    paymentDays: 60,
    latePenalty: '1.1% per month',
    noticeDays: 30,
    liabilityCap: 'EUR 500,000',
    renewalMonths: 12,
  },
  {
    supplier: 'Pellegrini Facility Care',
    reference: 'PFC-2024-233',
    paymentDays: 30,
    latePenalty: '0.5% per month',
    noticeDays: 45,
    liabilityCap: 'EUR 80,000',
    renewalMonths: 6,
  },
  {
    supplier: 'Verdemar Packaging',
    reference: 'VP-2025-019',
    paymentDays: 45,
    latePenalty: '1.75% per month',
    noticeDays: 60,
    liabilityCap: 'EUR 300,000',
    renewalMonths: 18,
  },
]

/**
 * Standard clauses every contract repeats. Present so the corpus has the bulk a real one has —
 * without it the all-in-context arm would look artificially cheap and the comparison would be
 * meaningless.
 */
const boilerplate = (spec: ContractSpec): string =>
  [
    '## 4. Confidentiality',
    '',
    "Each party shall keep confidential all information disclosed by the other party in connection with this Agreement, whether disclosed orally, in writing or by any other means, and shall not disclose such information to any third party without the prior written consent of the disclosing party. This obligation survives termination of this Agreement for a period of five (5) years. The obligation does not apply to information that is or becomes publicly available otherwise than through breach of this clause, that was lawfully in the receiving party's possession before disclosure, or that is required to be disclosed by law or by a competent regulatory authority, provided that the receiving party gives the disclosing party prompt written notice of such requirement where lawful to do so.",
    '',
    '## 5. Data protection',
    '',
    'Where either party processes personal data on behalf of the other in connection with this Agreement, it shall do so only on documented instructions from the controller, shall ensure that persons authorised to process the personal data are bound by an appropriate duty of confidentiality, and shall implement technical and organisational measures appropriate to the risk. Sub-processors may be engaged only with prior written authorisation, and the processor remains fully liable for their performance. Each party shall assist the other in responding to requests from data subjects and to enquiries from supervisory authorities, and shall notify the other without undue delay upon becoming aware of a personal data breach.',
    '',
    '## 6. Warranties',
    '',
    'The Supplier warrants that the goods and services supplied under this Agreement will conform in all material respects to the specifications set out in the applicable statement of work, will be free from material defects in design, materials and workmanship, and will be performed with the skill and care reasonably expected of a professional supplier in the relevant industry. The Supplier further warrants that it holds all licences, permits and consents necessary to perform its obligations, and that performance of this Agreement will not infringe the intellectual property rights of any third party.',
    '',
    '## 7. Force majeure',
    '',
    'Neither party shall be liable for any failure or delay in performing its obligations under this Agreement to the extent that such failure or delay results from circumstances beyond its reasonable control, including acts of God, flood, fire, earthquake, epidemic, war, terrorism, civil disorder, industrial action affecting third parties, or failure of public infrastructure. The affected party shall notify the other party promptly and shall use reasonable endeavours to mitigate the effects. If the circumstances persist for more than sixty (60) consecutive days, either party may terminate this Agreement on written notice without further liability.',
    '',
    '## 8. Governing law and disputes',
    '',
    `This Agreement is governed by the laws of Italy. The parties shall attempt in good faith to resolve any dispute arising out of or in connection with this Agreement by negotiation between senior representatives within thirty (30) days of written notice of the dispute. Failing resolution, the dispute shall be submitted to the exclusive jurisdiction of the courts of Milan. Reference ${spec.reference} shall be quoted in all correspondence relating to this Agreement.`,
    '',
    '## 9. Entire agreement',
    '',
    'This Agreement, together with its annexes and any statement of work executed under it, constitutes the entire agreement between the parties in relation to its subject matter and supersedes all prior negotiations, representations and agreements, whether written or oral. No variation of this Agreement is effective unless made in writing and signed by an authorised representative of each party. No failure or delay in exercising any right under this Agreement operates as a waiver of that right.',
  ].join('\n')

const contractDocument = (spec: ContractSpec): CorpusDocument => ({
  name: `${spec.reference} — ${spec.supplier}.md`,
  mimeType: 'text/markdown',
  text: [
    `# Supply Agreement — ${spec.supplier}`,
    '',
    `Reference: ${spec.reference}`,
    `Counterparty: ${spec.supplier}`,
    '',
    '## 1. Term and renewal',
    '',
    `This Agreement commences on the date of last signature and continues for an initial term of ${spec.renewalMonths} months. Thereafter it renews automatically for successive periods of ${spec.renewalMonths} months unless either party gives written notice of non-renewal at least ${spec.noticeDays} days before the end of the then-current term.`,
    '',
    '## 2. Payment terms',
    '',
    `Invoices are payable within ${spec.paymentDays} days of the invoice date. Amounts not paid when due accrue interest at ${spec.latePenalty} on the outstanding balance, calculated from the due date until payment is received in full. The Supplier may suspend performance if any undisputed invoice remains unpaid for more than thirty (30) days after the due date, having first given fourteen (14) days written notice of its intention to do so.`,
    '',
    '## 3. Limitation of liability',
    '',
    `Save in respect of death or personal injury caused by negligence, fraud, or any liability that cannot lawfully be limited, the total aggregate liability of either party under this Agreement shall not exceed ${spec.liabilityCap}. Neither party is liable for indirect or consequential loss, loss of profit, loss of anticipated savings or loss of goodwill.`,
    '',
    boilerplate(spec),
  ].join('\n'),
})

export const supplierCorpus: CorpusDocument[] = specs.map(contractDocument)

/**
 * The needle: Corvara's late-payment interest. Every other contract states a *different* rate for
 * the same clause, so an arm that retrieves the wrong document produces a plausible wrong number
 * rather than an obvious failure.
 */
export const supplierPenaltyScenario: Scenario = {
  id: 'supplier-penalty',
  description:
    'One fact from one contract, with four near-identical contracts as distractors. Tests whether retrieval lands on the right document.',
  corpus: supplierCorpus,
  goal: 'You need to know what interest rate applies when your company pays the Corvara Metalworks invoices late. You are about to reply to their credit controller and cannot afford to quote the wrong figure.',
  persona:
    'A procurement manager in a hurry. Writes short messages, asks directly, and pushes back once if the answer is vague or does not name the contract it came from.',
  maxTurns: 6,
  rubric:
    'The assistant states the late-payment interest rate from the Corvara Metalworks agreement (CM-2023-071) and does not confuse it with the rate from another supplier contract.',
  answerKey: {
    mustMention: ['2.4%'],
    mustNotMention: ['0.9%', '1.1%', '0.5%', '1.75%'],
  },
}

/**
 * Two facts from two different documents. Single-shot retrieval tends to find one and stop, so
 * this separates arms that can iterate over the corpus from arms that get one lucky hit.
 */
export const supplierComparisonScenario: Scenario = {
  id: 'supplier-comparison',
  description:
    'Requires facts from two different contracts in one answer. Tests whether the assistant keeps looking after the first hit.',
  corpus: supplierCorpus,
  goal: 'You are preparing a risk review and need to know which of the two contracts — Halcyon Data Services or Verdemar Packaging — caps liability at the higher amount, and what each cap is.',
  persona:
    'A risk analyst. Precise, asks for both figures explicitly, and will not accept an answer that gives only one of them.',
  maxTurns: 6,
  rubric:
    'The assistant gives both liability caps (Halcyon Data Services and Verdemar Packaging) and correctly identifies Halcyon as the higher of the two.',
  answerKey: {
    mustMention: ['500,000', '300,000'],
  },
}

export const builtInScenarios: Scenario[] = [supplierPenaltyScenario, supplierComparisonScenario]
