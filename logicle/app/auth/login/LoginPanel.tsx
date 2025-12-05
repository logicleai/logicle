'use client'
import { ErrorMsg } from '@/components/ui'
import { useRouter, useSearchParams } from 'next/navigation'
import { useState, FC } from 'react'
import { Button } from '@/components/ui/button'
import * as z from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'

import { Form, FormField, FormItem } from '@/components/ui/form'
import { useForm } from 'react-hook-form'
import { Input } from '@/components/ui/input'
import { useTranslation } from 'react-i18next'
import { Link } from '@/components/ui/link'

const formSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1, 'The Password field is required'),
})

interface Idp {
  name: string
  clientID: string
}

interface Props {
  connections: Idp[]
  enableSignup: boolean
}

const Login: FC<Props> = ({ connections, enableSignup }) => {
  const { t } = useTranslation()
  const redirectAfterSignIn = '/chat'

  const searchParams = useSearchParams()
  const [errorMessage, setErrorMessage] = useState<string | null>(searchParams.get('error'))
  const router = useRouter()
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    mode: 'onChange',
    defaultValues: {
      email: '',
      password: '',
    },
  })

  const showError = (msg: string) => {
    setErrorMessage(msg)
  }

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    showError('')
    const { email, password } = values

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      })

      // If login failed, show backend error (if any) or generic one
      if (!res.ok) {
        let code: string | undefined
        try {
          const data = await res.json()
          code = data?.error?.message
        } catch {
          // ignore JSON parse errors, we'll just show generic error below
        }

        showError(code ? t(code) : t('remote_auth_failure'))
        return
      }

      // ✅ Success
      // /api/auth/login should have set the `session` cookie.
      // Hard reload so all server components see the new session.
      window.location.href = redirectAfterSignIn
    } catch (_e) {
      showError(t('remote_auth_failure'))
    }
  }
  const onSubmitSso = async (client_id: string) => {
    router.push(`/api/auth/saml/login?connection=${encodeURIComponent(client_id)}`)
  }
  return (
    <div className="flex flex-col">
      {errorMessage && <ErrorMsg>{t(errorMessage)}</ErrorMsg>}
      <div className="flex flex-col rounded p-6 border gap-3">
        <Form
          {...form}
          className="flex flex-col gap-2"
          onSubmit={form.handleSubmit((values) => onSubmit(values))}
        >
          <div className="flex flex-col gap-3">
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem label={t('email')}>
                  <Input placeholder={t('email')} {...field} />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem label={t('password')}>
                  <Input type="password" placeholder={t('password')} {...field} />
                </FormItem>
              )}
            />
          </div>
          <div />
          <div />
          <div className="flex flex-col gap-3">
            <Button
              className="w-full"
              type="submit"
              color="primary"
              disabled={
                !form.formState.isValid ||
                form.formState.isSubmitting ||
                form.formState.isValidating
              }
              size="default"
            >
              {t('sign-in')}
            </Button>
          </div>
        </Form>
        {connections.length !== 0 && (
          <div className="flex flex-col gap-3">
            <div className="self-center">{t('or-sign-in-with')}</div>
            <div className="flex flex-col gap-3">
              {connections.map((connection) => {
                return (
                  <div key={connection.clientID}>
                    <Button
                      variant="secondary"
                      onClick={() => onSubmitSso(connection.clientID)}
                      className="w-full"
                      type="submit"
                      size="default"
                    >
                      {connection.name}
                    </Button>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
      {enableSignup && (
        <p className="text-center text-sm text-gray-600 pt-2">
          {t('dont-have-an-account')}&nbsp;
          <Link href="/auth/join">{t('create-a-new-account')}</Link>
        </p>
      )}
    </div>
  )
}

export default Login
