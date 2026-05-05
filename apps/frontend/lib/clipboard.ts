export const copyImageUrlToClipboard = (imageUrl: string): Promise<void> =>
  fetch(imageUrl)
    .then((res) => res.blob())
    .then((blob) => {
      const data = [new window.ClipboardItem({ [blob.type]: blob })]
      return navigator.clipboard.write(data)
    })
