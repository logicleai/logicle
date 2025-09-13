import { FC } from 'react'

export const Reasoning: FC<{ text: string }> = ({ text }) => {
  return <div className="prose whitespace-pre-wrap">{text}</div>
}
