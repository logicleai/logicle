function scaleToFit(width: number, height: number, maxWidth: number, maxHeight: number) {
  if (width <= maxWidth && height <= maxHeight) {
    return { width, height }
  }

  // Calculate scale factors for both dimensions
  const widthScale = maxWidth / width
  const heightScale = maxHeight / height

  // Choose the smaller scale factor to maintain aspect ratio
  const scaleFactor = Math.min(widthScale, heightScale)

  // Calculate new dimensions
  const newWidth = width * scaleFactor
  const newHeight = height * scaleFactor
  return { width: newWidth, height: newHeight }
}

/**
 * Resizes an image Blob to the specified dimensions, if necessary, while maintaining aspect ratio.
 * @param imageBlob - The original image Blob to be resized.
 * @param maxWidth - The maximum width for the resized image.
 * @param maxHeight - The maximum height for the resized image.
 * @returns A promise that resolves to the resized image Blob.
 */
export async function limitImageSize(
  imageBlob: Blob,
  maxWidth: number,
  maxHeight: number
): Promise<Blob> {
  // Create an object URL for the image Blob
  const imageUrl = URL.createObjectURL(imageBlob)

  try {
    // Load the image
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image()
      image.onload = () => resolve(image)
      image.onerror = (error) => reject(new Error(`Failed to load image: ${error}`))
      image.src = imageUrl
    })
    if (img.width < maxWidth && img.height < maxHeight) {
      return imageBlob
    }

    // Calculate the new dimensions while maintaining aspect ratio
    let { width, height } = scaleToFit(img.width, img.height, maxWidth, maxHeight)

    // Create a canvas element to draw the resized image
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')

    if (!ctx) {
      throw new Error('Failed to get canvas 2D context.')
    }

    // Draw the resized image onto the canvas
    ctx.drawImage(img, 0, 0, width, height)

    // Convert the canvas content to a Blob
    const resizedBlob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(
        (blob) => resolve(blob),
        imageBlob.type,
        0.9 // Quality parameter for lossy formats like JPEG
      )
    )

    if (!resizedBlob) {
      throw new Error('Failed to create Blob from canvas.')
    }

    return resizedBlob
  } finally {
    // Revoke the object URL to free up memory
    URL.revokeObjectURL(imageUrl)
  }
}
