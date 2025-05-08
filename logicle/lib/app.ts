import packageInfo from '../package.json'
import env from './env'

const app = {
  version: packageInfo.version,
  name: `${env.appDisplayName}`,
  logoUrl: '/public/logo.png',
}

export default app
