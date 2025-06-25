import { ReactNode } from 'react'

interface PropProps {
  label: string
  children: ReactNode
  wrap?: boolean
}

interface PropListProps {
  children: ReactNode | ReactNode[]
}

export const Prop = ({ label, children, wrap }: PropProps) => {
  return (
    <div className="flex flex-col gap-1">
      <div className={`text-label`}>{label}</div>
      <div className={`${wrap ? 'whitespace-pre-wrap' : ''}`}>{children}</div>
    </div>
  )
}

export const PropList = ({ children }: PropListProps) => {
  return <div className="text-body1 flex flex-col gap-4">{children}</div>
}
