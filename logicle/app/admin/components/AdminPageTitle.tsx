import React, { FC, ReactNode } from 'react'

interface Props {
  title: string
  children?: ReactNode
}

export const AdminPageTitle: FC<Props> = ({ title, children }) => {
  return (
    <h1 className="flex gap-3 items-center mb-4">
      <span>{title}</span>
      {children}
    </h1>
  )
}
