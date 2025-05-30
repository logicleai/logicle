import * as React from 'react'
import { useState } from 'react'
import { Button } from './button'
import { Input } from './input'
import { IconCheck, IconCopy } from '@tabler/icons-react'

const InputWithCopy = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ ...props }, ref) => {
  const [copied, setCopied] = useState(false)
  const currTimeOut = React.useRef<NodeJS.Timeout>()
  const handleCopy = async () => {
    await navigator.clipboard.writeText('' + props.value)
    setCopied(true)
    if (currTimeOut.current) {
      clearTimeout(currTimeOut.current)
    }
    currTimeOut.current = setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="flex items-center space-x-2">
      <Input ref={ref} {...props} />
      <Button onClick={handleCopy} variant="outline">
        {copied ? <IconCheck /> : <IconCopy />}
      </Button>
    </div>
  )
})
InputWithCopy.displayName = 'Input'

export { InputWithCopy }
