import { Role } from './dto/chat'

/*export interface OpenAIMessage {
  role: Role
  content: string
}*/

export interface OpenAIModel {
  id: string
  name: string
  maxLength: number // maximum length of a message
  tokenLimit: number
}
