'use client'
import { FC, ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import Link from 'next/link'

interface SPConfig {
  acsUrl: string
  entityId: string
  response: string
  assertionSignature: string
  signatureAlgorithm: string
  publicKey: string
  publicKeyString: string
}

interface Props {
  config: SPConfig
}

const Labeled = ({ label, children }: { label: string; children: ReactNode }) => {
  return (
    <div>
      <div className="flex font-bold text-medium gap-2">{label}</div>
      {children}
    </div>
  )
}

const SPConfig: FC<Props> = ({ config }) => {
  const { t } = useTranslation()
  return (
    <>
      <h1>{t('sp_saml_config_title')}</h1>
      <Labeled label={t('sp_acs_url')}>
        <span>{config.acsUrl}</span>
      </Labeled>
      <Labeled label={t('sp_entity_id')}>
        <span>{config.entityId}</span>
      </Labeled>
      <Labeled label={t('response')}>
        <span>{config.response}</span>
      </Labeled>
      <Labeled label={t('assertion_signature')}>
        <span>{config.assertionSignature}</span>
      </Labeled>
      <Labeled label={t('signature_algorithm')}>
        <span>{config.signatureAlgorithm}</span>
      </Labeled>
      <Labeled label={t('assertion_encryption')}>
        <p className="text-sm">
          If you want to encrypt the assertion, you can&nbsp;
          <Link
            href="/.well-known/saml.cer"
            className="underline underline-offset-4"
            target="_blank"
          >
            download our public certificate.
          </Link>
          &nbsp;Otherwise select the Unencrypted option.
        </p>
      </Labeled>
    </>
  )
}

export default SPConfig
