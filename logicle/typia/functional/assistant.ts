import { InsertableAssistant } from '@/types/db'
import typia from 'typia'
export const validateInsertableAssistant = (input: any): typia.IValidation<InsertableAssistant> => {
  const errors = [] as any[]
  const __is = (input: any): input is InsertableAssistant => {
    const $io0 = (input: any): boolean =>
      'string' === typeof input.name &&
      (null === input.icon || undefined === input.icon || 'string' === typeof input.icon) &&
      'string' === typeof input.description &&
      'string' === typeof input.model &&
      'string' === typeof input.systemPrompt &&
      'string' === typeof input.backendId &&
      'number' === typeof input.tokenLimit &&
      'number' === typeof input.temperature
    return 'object' === typeof input && null !== input && $io0(input)
  }
  if (false === __is(input)) {
    const $report = (typia.createValidate as any).report(errors)
    ;((input: any, _path: string, _exceptionable: boolean = true): input is InsertableAssistant => {
      const $vo0 = (input: any, _path: string, _exceptionable: boolean = true): boolean =>
        [
          'string' === typeof input.name ||
            $report(_exceptionable, {
              path: _path + '.name',
              expected: 'string',
              value: input.name,
            }),
          null === input.icon ||
            undefined === input.icon ||
            'string' === typeof input.icon ||
            $report(_exceptionable, {
              path: _path + '.icon',
              expected: '(null | string | undefined)',
              value: input.icon,
            }),
          'string' === typeof input.description ||
            $report(_exceptionable, {
              path: _path + '.description',
              expected: 'string',
              value: input.description,
            }),
          'string' === typeof input.model ||
            $report(_exceptionable, {
              path: _path + '.model',
              expected: 'string',
              value: input.model,
            }),
          'string' === typeof input.systemPrompt ||
            $report(_exceptionable, {
              path: _path + '.systemPrompt',
              expected: 'string',
              value: input.systemPrompt,
            }),
          'string' === typeof input.backendId ||
            $report(_exceptionable, {
              path: _path + '.backendId',
              expected: 'string',
              value: input.backendId,
            }),
          'number' === typeof input.tokenLimit ||
            $report(_exceptionable, {
              path: _path + '.tokenLimit',
              expected: 'number',
              value: input.tokenLimit,
            }),
          'number' === typeof input.temperature ||
            $report(_exceptionable, {
              path: _path + '.temperature',
              expected: 'number',
              value: input.temperature,
            }),
        ].every((flag: boolean) => flag)
      return (
        ((('object' === typeof input && null !== input) ||
          $report(true, {
            path: _path + '',
            expected: 'InsertableAssistant',
            value: input,
          })) &&
          $vo0(input, _path + '', true)) ||
        $report(true, {
          path: _path + '',
          expected: 'InsertableAssistant',
          value: input,
        })
      )
    })(input, '$input', true)
  }
  const success = 0 === errors.length
  return {
    success,
    errors,
    data: success ? input : undefined,
  } as any
}
