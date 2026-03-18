import { EyeClosedIcon, EyeOpenIcon } from '@radix-ui/react-icons'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { useState } from 'react'

type Props = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'>

const PasswordInput = ({ className, ...props }: Props) => {
  const [showPassword, setShowPassword] = useState<boolean>(false)
  const togglePassword = () => {
    setShowPassword(!showPassword)
  }
  return (
    <div className="relative flex items-center bg-background">
      <Input
        className={cn('bg-transparent pr-10', className)}
        type={showPassword ? 'text' : 'password'}
        {...props}
      />
      <button
        type="button"
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
