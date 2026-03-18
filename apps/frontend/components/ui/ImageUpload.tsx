import { useTranslation } from 'react-i18next'
import Image from 'next/image'
import { ChangeEvent, MouseEvent, useRef, useId } from 'react'
import { Input } from './input'
import { Button } from './button'
import userDefaultProfile from '../../public/user-default-profile.jpeg'

interface Props {
  value: string | null
  disabled?: boolean
  onChange: (value: string) => void
}

const ImageUpload = ({ value, disabled, onChange }: Props) => {
  const { t } = useTranslation()
  const imageInputRef = useRef(null)
  const inputId = `${useId()}-cover_image`

  const handleImageChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      const reader = new FileReader()
      reader.onloadend = () => {
        const base64String = reader.result as string
        onChange(base64String)
      }
      reader.readAsDataURL(file)
    }
  }

  const handleRemovePhoto = (evt: MouseEvent) => {
    onChange('')
    evt.preventDefault()
  }

  const image = value
  return (
    <div className="flex">
      <div className="flex flex-col gap-3">
        <label className="w-36 h-36 cursor-pointer" htmlFor={inputId}>
          {image ? (
            <Image
              unoptimized={true}
              src={image}
              className="w-36 h-36 rounded-full shadow"
              width={36}
              height={36}
              alt={t('profile-picture')}
            />
          ) : (
            <Image
              src={userDefaultProfile}
              className="w-36 h-36 rounded-full shadow"
              alt={t('profile-picture')}
              width={512}
              height={512}
              style={{ maxWidth: '100%', height: 'auto' }}
            />
          )}
        </label>
        <Input
          disabled={disabled}
          type="file"
          id={inputId}
          className="sr-only"
          ref={imageInputRef}
          onChange={handleImageChange}
        />
        {!disabled && (
          <Button
            type="button"
            disabled={disabled}
            variant="destructive_link"
            size="link"
            className={`uppercase ${(image ?? '') !== '' ? 'visible' : 'invisible'}`}
            onClick={handleRemovePhoto}
          >
            {t('remove-photo')}
          </Button>
        )}
      </div>
    </div>
  )
}

export default ImageUpload
