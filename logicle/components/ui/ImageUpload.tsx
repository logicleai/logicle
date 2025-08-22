import { useTranslation } from 'react-i18next'
import Image from 'next/image'
import { ChangeEvent, MouseEvent, useRef, useId } from 'react'
import { Input } from './input'
import { Button } from './button'

interface Props {
  value: string | null
  onValueChange: (value: string) => void
}

const ImageUpload = (props: Props) => {
  const { t } = useTranslation()
  const imageInputRef = useRef(null)
  const inputId = `${useId()}-cover_image`

  const handleImageChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      const reader = new FileReader()
      reader.onloadend = () => {
        const base64String = reader.result as string
        props.onValueChange(base64String)
      }
      reader.readAsDataURL(file)
    }
  }

  const handleRemovePhoto = (evt: MouseEvent) => {
    props.onValueChange('')
    evt.preventDefault()
  }

  const image = props.value
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
              src="/user-default-profile.jpeg"
              className="w-36 h-36 rounded-full shadow"
              alt={t('profile-picture')}
              width={512}
              height={512}
              style={{ maxWidth: '100%', height: 'auto' }}
            />
          )}
        </label>
        <Input
          type="file"
          id={inputId}
          className="sr-only"
          ref={imageInputRef}
          onChange={handleImageChange}
        />
        <Button
          type="button"
          variant="destructive_link"
          size="link"
          className={`uppercase ${(image ?? '') !== '' ? 'visible' : 'invisible'}`}
          onClick={handleRemovePhoto}
        >
          {t('remove-photo')}
        </Button>
      </div>
    </div>
  )
}

export default ImageUpload
