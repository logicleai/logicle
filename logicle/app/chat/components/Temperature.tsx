import { FC, useState } from 'react'
import { useTranslation } from 'next-i18next'

interface Props {
  label: string
  value: number
  onChangeTemperature: (temperature: number) => void
}

export const TemperatureSlider: FC<Props> = ({ label, value, onChangeTemperature }) => {
  const [temperature, setTemperature] = useState(value)
  const { t } = useTranslation()
  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = parseFloat(event.target.value)
    setTemperature(newValue)
    onChangeTemperature(newValue)
  }

  return (
    <div className="flex flex-col">
      <label className="mb-2 text-left">{label}</label>
      <span className="text-[12px] text-sm">
        {t(
          'Higher values like 0.8 will make the output more random, while lower values like 0.2 will make it more focused and deterministic.'
        )}
      </span>
      <span className="mt-2 mb-1 text-center">{temperature.toFixed(1)}</span>
      <input
        className="cursor-pointer"
        type="range"
        min={0}
        max={1}
        step={0.1}
        value={temperature}
        onChange={handleChange}
      />
      <ul className="w mt-2 pb-8 flex justify-between px-[24px]">
        <li className="flex justify-center">
          <span className="absolute">{t('Precise')}</span>
        </li>
        <li className="flex justify-center">
          <span className="absolute">{t('Neutral')}</span>
        </li>
        <li className="flex justify-center">
          <span className="absolute">{t('Creative')}</span>
        </li>
      </ul>
    </div>
  )
}
