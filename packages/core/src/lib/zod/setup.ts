import { z } from 'zod'

z.config({
  customError: (iss) => {
    switch (iss.code) {
      case 'invalid_value':
        if (iss.type === 'email') return 'invalid_value_email'
        else return iss.type as string

      case 'too_small':
        if (iss.origin === 'string' && iss.minimum === 1) return 'this_field_is_required'
        return 'value_is_too_short'

      case 'invalid_type':
        break

      case 'invalid_format':
        if (iss.format === 'email') {
          return 'invalid_value_email'
        }
    }
    return iss.type as string
  },
})
