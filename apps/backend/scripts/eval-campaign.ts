/** Local campaign directory tooling. It never copies or edits evaluation bundles. */
import { initializeCampaign, registerBundle } from '@/backend/lib/eval/campaign'

const args = process.argv.slice(2).filter((arg) => arg !== '--')
const command = args[0]
const flag = (name: string): string | undefined => {
  const index = args.indexOf(`--${name}`)
  return index === -1 ? undefined : args[index + 1]
}
const usage =
  'Usage: eval-campaign.ts init --dir <path> --name <name> | register-bundle --dir <path> --case <opaque-id> --bundle <sqlite> --cohort <name>'
try {
  if (command === 'init') {
    const dir = flag('dir')
    const name = flag('name')
    if (!dir || !name) throw new Error(usage)
    await initializeCampaign(dir, name)
    console.log(`Initialized campaign at ${dir}`)
  } else if (command === 'register-bundle') {
    const dir = flag('dir')
    const caseId = flag('case')
    const bundle = flag('bundle')
    const cohort = flag('cohort')
    if (!dir || !caseId || !bundle || !cohort) throw new Error(usage)
    console.log(JSON.stringify(await registerBundle(dir, caseId, bundle, cohort), null, 2))
  } else throw new Error(usage)
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
}
