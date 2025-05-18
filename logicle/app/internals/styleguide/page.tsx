'use client'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuButton,
  DropdownMenuLink,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Link } from '@/components/ui/link'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { DropdownMenuContent } from '@radix-ui/react-dropdown-menu'
import { IconPlus } from '@tabler/icons-react'
import { IconUser } from '@tabler/icons-react'

/* eslint-disable i18next/no-literal-string */

const Page = ({ title, children }) => {
  return (
    <div className="p-4">
      <h1 className="mb-2">{title}</h1>
      {children}
    </div>
  )
}

const Typografy = () => {
  return (
    <Page title="Typography">
      <div className="grid grid-cols-2">
        <div>
          <h2>HeadLines</h2>
          <h1>H1 - Red Hat Display Bold</h1>
          <h2>H2 - Red Hat Display Bold</h2>
          <h3>H3 - Red Hat Display Bold</h3>
          <h4>H4 - Red Hat Display Medium</h4>
          <h5>H5 - Red Hat Display Bold</h5>
          <h2>Link, bottoni, Status</h2>
          <Link href="">Link text - Red Hat Display Medium</Link>
        </div>
        <div>
          <h2>Body</h2>
          <div className="text-body1">Body 1 - Red Hat Display Regular</div>
          <div className="text-body2">Body 2 - Red Hat Display Medium</div>
          <div>Checkbox, Radio</div>
        </div>
      </div>
    </Page>
  )
}

const Icons = () => {
  return (
    <Page title="Icons">
      <div className="flex flex-row flex-wrap gap-4">
        <div>
          <h2>Simple (size = 18)</h2>
          <IconPlus size="18"></IconPlus>
        </div>
        <div>
          <h2>Avatar</h2>
          <Avatar fallback="ChatGPT" />
          <Avatar url="https://www.cdnlogo.com/logos/c/38/ChatGPT.svg" fallback="ChatGPT" />
        </div>
      </div>
    </Page>
  )
}

const Colors = () => {
  return (
    <Page title="Colors">
      <div className="flex flex-row flex-wrap gap-4">
        <div>
          <div className={`w-[150px] h-[150px] bg-primary_text_color`}></div>
          <div>primary_text_color</div>
        </div>
        <div>
          <div className={`w-[150px] h-[150px] bg-primary`}></div>
          <div>primary</div>
        </div>
        <div>
          <div className={`w-[150px] h-[150px] bg-accent_color`}></div>
          <div>accent_color</div>
        </div>
        <div>
          <div className={`w-[150px] h-[150px] bg-secondary`}></div>
          <div>secondary</div>
        </div>
        <div>
          <div className={`w-[150px] h-[150px] bg-secondary_text_color`}></div>
          <div>secondary_text_color</div>
        </div>
        <div>
          <div className={`w-[150px] h-[150px] bg-primary-hover`}></div>
          <div>primary-hover</div>
        </div>
        <div>
          <div className={`w-[150px] h-[150px] bg-alert`}></div>
          <div>alert</div>
        </div>
        <div>
          <div className={`w-[150px] h-[150px] bg-secondary-hover`}></div>
          <div>secondary-hover</div>
        </div>
      </div>
    </Page>
  )
}

const Buttons = () => {
  return (
    <Page title="Buttons">
      <div className="flex flex-row flex-wrap gap-10">
        <div>
          <h2>Buttons</h2>
          <div>
            <p>Primary</p>
            <Button variant="primary">Testo</Button>
            <Button variant="primary" disabled>
              Testo
            </Button>
          </div>
          <div>
            <p>Secondary</p>
            <Button variant="secondary">Testo</Button>
            <Button variant="secondary" disabled>
              Testo
            </Button>
          </div>
        </div>
        <div>
          <h2>Links</h2>
          <div className="flex flex-col">
            <Link href="http://foosoft.it">link</Link>
            <Link icon={IconUser} href="http://foosoft.it">
              link with icon
            </Link>
          </div>
        </div>
        <div>
          <h2>Menu</h2>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="px-2">
                <IconPlus size={18} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuButton icon={IconUser}>Button</DropdownMenuButton>
              <DropdownMenuLink href="#" icon={IconUser}>
                Link
              </DropdownMenuLink>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </Page>
  )
}

const Forms = () => {
  return (
    <Page title="Forms">
      <div className="flex flex-row flex-wrap gap-10">
        <div>
          <h2>Input</h2>
          <div>
            <Input placeholder="Enter an input"></Input>
          </div>
        </div>
        <div>
          <h2>Select</h2>
          <div>
            <Select>
              <SelectTrigger>
                <SelectValue placeholder={'placeholder'} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Item1">Item1</SelectItem>
                <SelectItem value="Item2">Item2</SelectItem>
                <SelectItem value="Item3">Item3</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>
    </Page>
  )
}
const styleguide = () => {
  return (
    <div className="flex flex-col gap-10">
      <Typografy />
      <Colors />
      <Icons />
      <Buttons />
      <Forms />
    </div>
  )
}

export default styleguide
