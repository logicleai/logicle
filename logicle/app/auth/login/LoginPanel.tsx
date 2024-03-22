'use client'
import { Error } from '@/components/ui'
import { signIn, useSession } from 'next-auth/react'
import { redirect, useSearchParams } from 'next/navigation'
import { useState, FC } from 'react'
import { Button } from '@/components/ui/button'
import * as z from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'

import { Form, FormField, FormItem } from '@/components/ui/form'
import { useForm } from 'react-hook-form'
import { Input } from '@/components/ui/input'
import { useTranslation } from 'next-i18next'
import { signinWithCredentials } from '@/services/auth'
import { Link } from '@/components/ui/link'

const formSchema = z.object({
  email: z.string().email(),
  password: z.string().optional(),
})

interface Idp {
  name: string
  clientID: string
}

interface Props {
  connections: Idp[]
}

const Login: FC<Props> = ({ connections }) => {
  const session = useSession()
  const { t } = useTranslation('common')
  const redirectAfterSignIn = '/chat'

  const searchParams = useSearchParams()
  const [errorMessage, setErrorMessage] = useState<string>(searchParams.get('error') ?? '')
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  })

  if (session.status == 'authenticated') {
    redirect(redirectAfterSignIn)
  }

  const showError = (msg: string) => {
    setErrorMessage(msg)
  }

  const onSubmit = async (values) => {
    showError('')
    const { email, password } = values
    try {
      const res = await signinWithCredentials(email, password)
      const json = await res.json()
      const error = new URL(json.url).searchParams.get('error')
      if (!error) {
        // We need this because using router would not reload the session
        window.location.href = redirectAfterSignIn
      } else {
        // Redirecting to signin?error=... would also be possible here
        showError(t(error))
      }
    } catch (e) {
      showError(t('remote_auth_failure'))
    }
  }

  const onSubmitSso = async (client_id: string) => {
    const state = '1234567' // TODO: need a state here! What to use?
    const signInResult = await signIn('boxyhq-saml', undefined, {
      client_id,
      state: state,
    })
    if (!signInResult?.ok) {
      showError(t(signInResult?.error))
    }
  }

  return (
    <div className="flex flex-col">
      {errorMessage.length > 0 && <Error message={t(errorMessage)} />}
      <div className="flex flex-col rounded p-6 border gap-3">
        <Form
          {...form}
          className="flex flex-col gap-3"
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
              disabled={!form.formState.isDirty || form.formState.isSubmitting}
              size="default"
            >
              {t('sign-in')}
            </Button>
          </div>
        </Form>
        {connections.length != 0 && (
          <div className="flex flex-col gap-3">
            <div className="self-center">{'or login with...'}</div>
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
      <p className="text-center text-sm text-gray-600">
        {t('dont-have-an-account')}&nbsp;
        <Link href="/auth/join">{t('create-a-free-account')}</Link>
      </p>
    </div>
  )
}

export default Login
