import { makeRng } from '../stats'
import type { CorpusDocument, Scenario } from '../types'

/**
 * Parametric corpus generation.
 *
 * The hand-written corpus in `supplierContracts.ts` answered "which arm wins on five small
 * documents", and every arm scored 100% — which is the wrong question. What matters is *where the
 * curves cross*: below some corpus size an index is not worth building, above another the baseline
 * does not fit in the context window at all, and in between there is a band where it fits but the
 * model starts losing the needle among the distractors.
 *
 * Finding those points needs corpus size to be a dial, not a constant. These are the dials:
 *
 *  - `documents` and `wordsPerDocument` set the total size, which is what the baseline pays.
 *  - `distractors` sets how many *other* documents state the same kind of fact with a different
 *    value. Without them a wrong retrieval produces an obvious failure; with them it produces a
 *    confident wrong answer, which is the failure mode that actually costs users money.
 *  - `needleDepth` places the answer at a fraction of the way through its document, for the
 *    "lost in the middle" effect that only shows up in long contexts.
 *
 * Generation is seeded, so a curve is reproducible and two arms are measured on the same corpus.
 */

export interface CorpusSpec {
  documents: number
  wordsPerDocument: number
  /** Index of the document holding the answer. Defaults to the middle of the corpus. */
  needleDocument?: number
  /** 0 = the answer is at the top of its document, 1 = at the very end. */
  needleDepth?: number
  /** How many other documents state the same clause with a different value. */
  distractors?: number
  seed?: number
  /**
   * Builds the negative half of a flip test by removing the answer from the corpus.
   *
   * `'clause'` keeps the needle document and deletes only its payment clause — the harder and more
   * realistic case, because the document the assistant would retrieve is still there and still
   * looks relevant. `'document'` removes the document entirely, which asks the different question
   * of whether the counterparty is under contract at all.
   *
   * The filler is drawn before the clause is spliced in, so withholding it does not perturb the
   * RNG stream: the two halves differ by that clause and nothing else.
   */
  withholdNeedle?: 'clause' | 'document'
}

export interface GeneratedCorpus {
  documents: CorpusDocument[]
  /** The value only the needle document states. */
  needleValue: string
  /** Values stated by the distractor documents; a correct answer contains none of them. */
  distractorValues: string[]
  needleSupplier: string
  needleReference: string
  approximateWords: number
  /** True when `withholdNeedle` removed the answer, so no correct value exists in this corpus. */
  needleWithheld: boolean
}

const SUPPLIER_FIRST = [
  'Northwind',
  'Corvara',
  'Halcyon',
  'Pellegrini',
  'Verdemar',
  'Aldebaran',
  'Marchetti',
  'Silverbrook',
  'Tramontana',
  'Ostmark',
  'Ferrante',
  'Quilliam',
  'Brenner',
  'Caldora',
  'Westgate',
  'Norrland',
  'Vicenza',
  'Ardenne',
  'Kestrel',
  'Lombardi',
]
const SUPPLIER_SECOND = [
  'Logistics',
  'Metalworks',
  'Data Services',
  'Facility Care',
  'Packaging',
  'Industrial',
  'Components',
  'Chemicals',
  'Freight',
  'Instruments',
  'Textiles',
  'Fabrication',
]

/**
 * Clause bodies used as filler. They are real contract language rather than lorem ipsum because
 * the point of the filler is to be *plausibly confusable* with the needle — text a retriever has
 * to actually discriminate against, not text it can dismiss on surface features.
 */
const CLAUSES: { heading: string; body: string }[] = [
  {
    heading: 'Confidentiality',
    body: 'Each party shall keep confidential all information disclosed by the other party in connection with this Agreement, whether disclosed orally, in writing or by any other means, and shall not disclose such information to any third party without the prior written consent of the disclosing party. This obligation survives termination for five years. It does not apply to information that is or becomes publicly available otherwise than through breach of this clause, that was lawfully in the receiving party possession before disclosure, or that is required to be disclosed by law or by a competent regulatory authority.',
  },
  {
    heading: 'Data protection',
    body: 'Where either party processes personal data on behalf of the other in connection with this Agreement, it shall do so only on documented instructions from the controller, shall ensure that persons authorised to process the personal data are bound by an appropriate duty of confidentiality, and shall implement technical and organisational measures appropriate to the risk. Sub-processors may be engaged only with prior written authorisation, and the processor remains fully liable for their performance.',
  },
  {
    heading: 'Warranties',
    body: 'The Supplier warrants that the goods and services supplied under this Agreement will conform in all material respects to the specifications set out in the applicable statement of work, will be free from material defects in design, materials and workmanship, and will be performed with the skill and care reasonably expected of a professional supplier in the relevant industry. The Supplier further warrants that it holds all licences, permits and consents necessary to perform its obligations.',
  },
  {
    heading: 'Force majeure',
    body: 'Neither party shall be liable for any failure or delay in performing its obligations under this Agreement to the extent that such failure or delay results from circumstances beyond its reasonable control, including acts of God, flood, fire, earthquake, epidemic, war, terrorism, civil disorder, industrial action affecting third parties, or failure of public infrastructure. The affected party shall notify the other party promptly and shall use reasonable endeavours to mitigate the effects.',
  },
  {
    heading: 'Inspection and acceptance',
    body: 'The Customer may inspect the goods on delivery and shall notify the Supplier of any shortage, damage or non-conformity within ten working days. Goods not rejected within that period are deemed accepted. Where goods are properly rejected the Supplier shall, at its option and at its own cost, repair or replace them, or issue a credit note for the invoiced value. Nothing in this clause limits any statutory right of the Customer.',
  },
  {
    heading: 'Subcontracting',
    body: 'The Supplier shall not subcontract any material part of its obligations under this Agreement without the prior written consent of the Customer, such consent not to be unreasonably withheld or delayed. Where subcontracting is permitted, the Supplier remains responsible for the acts and omissions of its subcontractors as if they were its own, and shall ensure that each subcontract contains terms no less protective of the Customer than those set out here.',
  },
  {
    heading: 'Change control',
    body: 'Any change to the scope, specification, timetable or charges under this Agreement must be recorded in a written change note signed by an authorised representative of each party. Until a change note is signed, both parties shall continue to perform in accordance with the existing terms. Neither party is obliged to agree to a proposed change, and no change note takes effect retrospectively unless it says so expressly.',
  },
  {
    heading: 'Insurance',
    body: 'The Supplier shall maintain, with a reputable insurer, public liability, product liability and professional indemnity insurance at levels appropriate to the risks arising under this Agreement, and shall provide evidence of such cover on reasonable request. The existence of insurance does not limit the Supplier liability under this Agreement, and the Supplier shall not do anything that would render any policy void or voidable.',
  },
  {
    heading: 'Audit',
    body: 'The Customer may, on not less than fifteen working days written notice and no more than once in any twelve month period, audit the Supplier records relating to its performance of this Agreement. Audits shall be conducted during normal business hours, shall not unreasonably disrupt the Supplier operations, and shall be subject to the confidentiality obligations set out in this Agreement. Each party bears its own costs unless the audit reveals a material breach.',
  },
  {
    heading: 'Notices',
    body: 'Any notice given under this Agreement must be in writing and delivered by hand, by prepaid recorded delivery, or by electronic mail to the address notified by the receiving party for that purpose. A notice delivered by hand takes effect on delivery, a notice sent by recorded delivery takes effect two working days after posting, and a notice sent by electronic mail takes effect when the sender receives confirmation of successful transmission.',
  },
]

const wordCount = (text: string): number => text.split(/\s+/).filter(Boolean).length

/** Late-payment rates, spread so no two are within rounding distance of each other. */
const rateFor = (index: number): string => `${(0.4 + index * 0.35).toFixed(2)}% per month`

const supplierName = (index: number): string =>
  `${SUPPLIER_FIRST[index % SUPPLIER_FIRST.length]} ${
    SUPPLIER_SECOND[Math.floor(index / SUPPLIER_FIRST.length) % SUPPLIER_SECOND.length]
  }${index >= SUPPLIER_FIRST.length * SUPPLIER_SECOND.length ? ` ${index}` : ''}`

const referenceFor = (index: number): string =>
  `REF-${String(2000 + index).padStart(4, '0')}-${String(((index * 7) % 900) + 100)}`

export const generateCorpus = (spec: CorpusSpec): GeneratedCorpus => {
  const {
    documents: documentCount,
    wordsPerDocument,
    needleDocument = Math.floor(documentCount / 2),
    needleDepth = 0.5,
    distractors = Math.max(0, Math.min(documentCount - 1, 4)),
    seed = 1,
    withholdNeedle,
  } = spec

  const rng = makeRng(seed)
  const needleIndex = Math.max(0, Math.min(documentCount - 1, needleDocument))
  const needleValue = rateFor(needleIndex)

  // Distractors are chosen from the documents that are not the needle, walking outwards from it so
  // they land near it in the corpus rather than all at one end.
  const distractorIndexes: number[] = []
  for (let offset = 1; distractorIndexes.length < distractors && offset < documentCount; offset++) {
    for (const candidate of [needleIndex - offset, needleIndex + offset]) {
      if (candidate < 0 || candidate >= documentCount) continue
      if (distractorIndexes.length >= distractors) break
      distractorIndexes.push(candidate)
    }
  }
  const distractorSet = new Set(distractorIndexes)

  const documents: CorpusDocument[] = []
  let approximateWords = 0

  for (let index = 0; index < documentCount; index++) {
    const supplier = supplierName(index)
    const reference = referenceFor(index)
    const isNeedle = index === needleIndex
    const carriesRate = isNeedle || distractorSet.has(index)
    const omitPaymentClause = isNeedle && withholdNeedle === 'clause'

    const paymentClause = carriesRate
      ? {
          heading: 'Payment terms',
          body: `Invoices are payable within ${
            30 + (index % 4) * 15
          } days of the invoice date. Amounts not paid when due accrue interest at ${rateFor(
            index
          )} on the outstanding balance, calculated from the due date until payment is received in full. The Supplier may suspend performance if any undisputed invoice remains unpaid for more than thirty days after the due date.`,
        }
      : undefined

    // Build filler up to the requested size, then splice the payment clause in at the requested
    // depth so the needle's position within its document is a controlled variable.
    const filler: { heading: string; body: string }[] = []
    let words = 0
    const header = `# Supply Agreement — ${supplier}\n\nReference: ${reference}\nCounterparty: ${supplier}\n`
    words += wordCount(header)
    let guard = 0
    while (words < wordsPerDocument && guard++ < 10_000) {
      const clause = CLAUSES[Math.floor(rng() * CLAUSES.length)]!
      filler.push(clause)
      words += wordCount(clause.body) + wordCount(clause.heading)
    }

    const sections = [...filler]
    if (paymentClause) {
      const position = Math.round(Math.max(0, Math.min(1, needleDepth)) * sections.length)
      sections.splice(position, 0, paymentClause)
      words += wordCount(paymentClause.body)
    }

    // Generated headings are deliberately unnumbered. That makes the negative half literally the
    // positive document with one contiguous block deleted, without leaving a numbering gap that
    // would tell the model a section had been removed.
    const renderedSections = sections
      .filter((section) => section !== paymentClause || !omitPaymentClause)
      .map((section) => `## ${section.heading}\n\n${section.body}`)
    const text = [header, ...renderedSections].join('\n\n')

    // Dropped only after being generated, so the documents that follow it draw the same filler as
    // they do in the positive corpus and the two halves stay comparable.
    if (isNeedle && withholdNeedle === 'document') continue

    approximateWords += wordCount(text)
    documents.push({
      name: `${reference} — ${supplier}.md`,
      mimeType: 'text/markdown',
      text,
    })
  }

  return {
    documents,
    needleValue,
    distractorValues: distractorIndexes.map((index) => rateFor(index)),
    needleSupplier: supplierName(needleIndex),
    needleReference: referenceFor(needleIndex),
    approximateWords,
    needleWithheld: withholdNeedle !== undefined,
  }
}

/**
 * Builds a needle-in-a-haystack scenario at a given corpus size. The answer key forbids every
 * distractor's value, so retrieving the wrong document scores zero rather than partial credit.
 */
export const generateNeedleScenario = (spec: CorpusSpec, id?: string): Scenario => {
  const corpus = generateCorpus(spec)
  const bare = (value: string) => value.replace(' per month', '')
  const needle = bare(corpus.needleValue)
  const distractors = corpus.distractorValues.map(bare)

  return {
    id: id ?? `needle-${spec.documents}docs-${spec.wordsPerDocument}w`,
    description: `Generated: ${spec.documents} documents of ~${spec.wordsPerDocument} words, ${
      corpus.distractorValues.length
    } distractor(s), needle at depth ${spec.needleDepth ?? 0.5}${
      corpus.needleWithheld ? `, answer withheld (${spec.withholdNeedle})` : ''
    }.`,
    corpus: corpus.documents,
    // Identical on both halves of a flip pair, and deliberately so: the simulated user must not be
    // able to infer from its own instructions whether the answer exists.
    goal: `You need an evidence-backed answer about what interest rate applies when your company pays the ${corpus.needleSupplier} invoices late. If their contract does not state one, you need to know that instead. You are about to reply to their credit controller and cannot afford to quote the wrong figure.`,
    persona:
      'A procurement manager in a hurry. Writes short messages, asks directly, and pushes back at most once if the answer is vague or does not name the contract it came from. Accepts a clear, evidence-backed statement that the rate is absent, and never asks for rates from other suppliers.',
    maxTurns: 6,
    rubric: corpus.needleWithheld
      ? `The documents do not state a late-payment interest rate for ${corpus.needleSupplier}. The assistant should say that it is not in the documents rather than quoting a figure. It should not quote percentages from other suppliers either, because the user cannot risk carrying the wrong figure into their reply.`
      : `The assistant states the late-payment interest rate from the ${corpus.needleSupplier} agreement (${corpus.needleReference}) and does not confuse it with the rate from another supplier contract.`,
    // On the negative corpus there is no string a correct answer must contain, so the key can only
    // forbid: every rate in play, including the withheld one, is a wrong answer.
    answerKey: corpus.needleWithheld
      ? { mustNotMention: [needle, ...distractors] }
      : { mustMention: [needle], mustNotMention: distractors },
  }
}

/**
 * Builds both halves of a flip test from one spec.
 *
 * The halves share a seed, a goal and a persona, and differ only in whether the answer is present.
 * They are returned as separate scenarios so every existing part of the harness — arms, repetition,
 * cost accounting, reporting — treats them as ordinary runs; only the paired verdict in
 * `abstention.ts` knows they belong together.
 */
export const generateFlipScenarioPair = (
  spec: Omit<CorpusSpec, 'withholdNeedle'>,
  options: { withhold?: 'clause' | 'document'; id?: string } = {}
): [Scenario, Scenario] => {
  const { withhold = 'clause', id } = options
  const pairId = id ?? `flip-${spec.documents}docs-${spec.wordsPerDocument}w`
  const reference = generateCorpus(spec)
  const flip = {
    pairId,
    needleValue: reference.needleValue.replace(' per month', ''),
    distractorValues: reference.distractorValues.map((value) => value.replace(' per month', '')),
  }

  const positive = generateNeedleScenario(spec, `${pairId}-positive`)
  const negative = generateNeedleScenario(
    { ...spec, withholdNeedle: withhold },
    `${pairId}-negative`
  )
  positive.flip = { ...flip, corpus: 'positive' }
  negative.flip = { ...flip, corpus: 'negative' }
  return [positive, negative]
}
