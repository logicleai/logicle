import { Button } from '@/components/ui/button'
import { IconTrash } from '@tabler/icons-react'

interface Params {
  onClick: () => void
  disabled?: boolean
  children: string
}

const DeleteButton = ({ onClick, disabled, children }: Params) => {
  return (
    <Button variant="destructive_link" size="link" onClick={onClick} disabled={disabled}>
      <IconTrash size={18}></IconTrash>
      {children}
    </Button>
  )
}

export default DeleteButton
