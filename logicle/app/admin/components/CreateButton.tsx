import { Button } from '@/components/ui/button'
import { IconPlus } from '@tabler/icons-react'

interface Params {
  onClick?: () => void
}

const CreateButton = ({ onClick }: Params) => {
  return (
    <Button variant="outline" color="primary" className="p-2" onClick={onClick}>
      <IconPlus size={18}></IconPlus>
    </Button>
  )
}

export default CreateButton
