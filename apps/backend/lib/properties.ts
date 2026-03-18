import { AppSettings, AppSettingsDefaults } from '@/types/settings'
import { getPropertyByName } from '@/models/properties'

export class PropertySource {
  static async getBool(name: keyof AppSettings) {
    const value = await getPropertyByName(name)
    if (value?.value === 'true') return true
    else if (value?.value === 'false') return false
    else return AppSettingsDefaults[name]
  }

  static async signupEnabled() {
    return await PropertySource.getBool('enable_signup')
  }
}
