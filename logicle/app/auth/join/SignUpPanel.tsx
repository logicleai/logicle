'use client'
import { useTranslation } from 'next-i18next'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import toast from 'react-hot-toast'
import * as z from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { Input } from '@/components/ui/input'
import { Link } from '@/components/ui/link'

import { Form, FormField, FormItem } from '@/components/ui/form'
import { post } from '@/lib/fetch'
import { signinWithCredentials } from '@/services/auth'

const formSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email(),
  password: z.string().min(7, 'Password must be at least 7 characters'),
})

type FormFields = z.infer<typeof formSchema>

const Signup = () => {
  const router = useRouter()
  const { t } = useTranslation('common')

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      email: '',
      password: '',
    },
  })

  const onSubmit = async (values: FormFields) => {
    const response = await post('/api/auth/join', values)

    if (response.error) {
      toast.error(response.error.message)
      return
    }

    form.reset()

    toast.success(t('successfully-subscribed'))

    const res = await signinWithCredentials(values.email, values.password)
    if (res.ok) {
      // We need this because using router would not reload the session
      window.location.href = '/chat'
    } else {
      const data = await res.json()
      toast.error(t(data.error))
      router.push('/auth/login')
    }
  }
  return (
    <div>
      <div className="flex flex-col rounded p-6 border gap-2">
        <Form {...form} className="flex flex-col gap-2" onSubmit={form.handleSubmit(onSubmit)}>
          <div className="flex flex-col gap-2">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem label={t('your-name')}>
                  <Input placeholder={t('your-name')} {...field} />
                </FormItem>
              )}
            />
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
          <div></div>
          <div></div>
          <div className="flex flex-col gap-2">
            <Button
              className="w-full"
              type="submit"
              color="primary"
              disabled={!form.formState.isDirty || form.formState.isSubmitting}
              size="default"
            >
              {t('create-account')}
            </Button>
          </div>
        </Form>
      </div>
      <p className="text-center text-sm text-gray-600 pt-2">
      {t('already-have-an-account')}&nbsp;
      <Link href="/auth/login">{t('sign-in')}</Link>
      </p>
    </div>
  )
}

export default Signup