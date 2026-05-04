export interface ImageEditResult {
  id: string
  name: string
  mimetype: string
  size: number
}

export const editImage = async (params: {
  fileId: string
  prompt: string
  conversationId?: string
  mask?: Blob | null
}): Promise<ImageEditResult> => {
  const form = new FormData()
  form.append('prompt', params.prompt)
  if (params.conversationId) {
    form.append('conversationId', params.conversationId)
  }
  if (params.mask) {
    form.append('mask', params.mask, 'mask.png')
  }

  const response = await fetch(`/api/files/${params.fileId}/edit`, {
    method: 'POST',
    body: form,
  })

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string }
    throw new Error(body.error ?? `Edit failed with status ${response.status}`)
  }

  return response.json() as Promise<ImageEditResult>
}
