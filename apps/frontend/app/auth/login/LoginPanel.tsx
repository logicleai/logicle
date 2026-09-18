'use client'
import { ErrorMsg } from '@/components/ui'
import { Button } from '@/components/ui/button'
import { Form, FormField, FormItem } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Link } from '@/components/ui/link'
import { PasswordInput } from '@/components/ui/password-input'
import * as dto from '@/types/dto'
import { zodResolver } from '@hookform/resolvers/zod'
import { useSearchParams } from 'next/navigation'
import { FC, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import * as z from 'zod'

const formSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
})

interface Props {
  connections: dto.PublicIdpConnection[]
  enableSignup: boolean
}

const Login: FC<Props> = ({ connections, enableSignup }) => {
  const { t } = useTranslation()
  const redirectAfterSignIn = '/chat'

  const searchParams = useSearchParams()
  const [errorMessage, setErrorMessage] = useState<string | null>(searchParams.get('error'))
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

        showError(code ? t(code) : t('remote-auth-failure'))
        return
      }

      // ✅ Success
      // /api/auth/login should have set the `session` cookie.
      // Hard reload so all server components see the new session.
      window.location.href = redirectAfterSignIn
    } catch (_e) {
      showError(t('remote-auth-failure'))
    }
  }
  const onSubmitSso = async (client_id: string) => {
    // SSO initiation is a backend route that answers with a redirect to the
    // IdP — it must be a real browser navigation, not a client-side router
    // push (which the SPA router would try to match against its own routes
    // and 404 without ever hitting the server).
    window.location.href = `/api/auth/saml/login?connection=${encodeURIComponent(client_id)}`
  }
  const connectionLabel = (connection: dto.PublicIdpConnection) => {
    const name = connection.name.toLowerCase()
    if (name.includes('google')) return t('continue-with-google')
    if (name.includes('github')) return t('continue-with-github')
    if (connection.type === 'SAML') return t('continue-with-saml-sso')
    return connection.name
  }
  return (
    <div className="flex flex-col">
      <div className="mb-7">
        <h1 className="text-2xl font-bold">{t('sign-in')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('sign-in-with-email')}</p>
      </div>
      {errorMessage && <ErrorMsg>{t(errorMessage)}</ErrorMsg>}
      <div className="flex flex-col gap-6">
        {connections.length !== 0 && (
          <div className="flex flex-col gap-2">
            {connections.map((connection) => (
              <Button
                key={connection.id}
                variant="secondary"
                onClick={() => onSubmitSso(connection.id)}
                className="w-full"
                type="button"
              >
                {connectionLabel(connection)}
              </Button>
            ))}
          </div>
        )}
        {connections.length !== 0 && (
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            <span>{t('or-sign-in-with')}</span>
            <span className="h-px flex-1 bg-border" />
          </div>
        )}
        <Form
          {...form}
          className="flex flex-col gap-4"
          onSubmit={form.handleSubmit((values) => onSubmit(values))}
        >
          <div className="flex flex-col gap-4">
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem label={t('email')}>
                  <Input autoComplete="email" placeholder={t('email')} {...field} />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem label={t('password')}>
                  <PasswordInput
                    autoComplete="current-password"
                    placeholder={t('password')}
                    {...field}
                  />
                </FormItem>
              )}
            />
          </div>
          <div className="flex flex-col gap-3 pt-1">
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
      </div>
      {enableSignup && (
        <p className="pt-8 text-center text-sm text-muted-foreground">
          {t('dont-have-an-account')}&nbsp;
          <Link href="/auth/join">{t('create-a-new-account')}</Link>
        </p>
      )}
    </div>
  )
}

export default Login
