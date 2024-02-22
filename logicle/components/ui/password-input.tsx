import { EyeClosedIcon, EyeOpenIcon } from '@radix-ui/react-icons'
import { Input } from '@/components/ui/input'
import { ChangeEventHandler, useState } from 'react'

interface Props {
  value: string
  onChange: ChangeEventHandler | undefined
  placeholder?: string
  onBlur: any
}
const PasswordInput = (props: Props) => {
  const [showPassword, setShowPassword] = useState<boolean>(false)
  const togglePassword = () => {
    setShowPassword(!showPassword)
  }
  return (
    <div className="relative flex items-center bg-background">
      <Input
        className="bg-transparent pr-10"
        type={showPassword ? 'text' : 'password'}
        onChange={props.onChange}
        placeholder={props.placeholder}
        value={props.value}
      />
      <button
        className="border-none absolute right-4 cursor-pointer opacity-50"
        onClick={(evt) => {
          togglePassword()
          evt.preventDefault()
        }}
      >
        {showPassword ? <EyeClosedIcon className="border-none"></EyeClosedIcon> : <EyeOpenIcon />}
      </button>
    </div>
  )
}

export { PasswordInput }
