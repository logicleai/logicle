import { z } from 'zod'

z.config({
  customError: (iss) => {
    switch (iss.code) {
      case 'invalid-value':
        if (iss.type === 'email') return 'invalid-value-email'
        else return iss.type as string

      case 'too_small':
        if (iss.origin === 'string' && iss.minimum === 1) return 'this-field-is-required'
        return 'value-is-too-short'

      case 'invalid-type':
        break

      case 'invalid-format':
        if (iss.format === 'email') {
          return 'invalid-value-email'
        }
    }
    return iss.type as string
  },
})
