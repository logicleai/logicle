export function splitDataUri(dataURI: string) {
  const split = dataURI.split(',')
  return {
    data: Buffer.from(split[1], 'base64'),
    mimeType: split[0].split(':')[1].split(';')[0],
  }
}
