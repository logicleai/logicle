export function splitDataUri(dataURI: string) {
  const split = dataURI.split(',')
  return {
    data: Buffer.from(split[1], 'base64'),
    mimeType: split[0].split(':')[1].split(';')[0],
  }
}

export function toDataUri(data: Buffer, mimeType: string) {
  return `data:${mimeType};base64,${data.toString('base64')}`
}
