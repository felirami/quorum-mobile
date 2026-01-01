/**
 * Image utility functions
 */

/**
 * Fetch a remote image and convert it to a data URI
 * This is needed because Quorum users don't load remote URIs for profile images
 */
export async function fetchImageAsDataUri(url: string): Promise<string | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.warn(`Failed to fetch image from ${url}: ${response.status}`);
      return null;
    }

    const blob = await response.blob();

    // Convert blob to base64
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        resolve(result);
      };
      reader.onerror = () => {
        console.warn('Failed to read image blob');
        resolve(null);
      };
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    console.warn('Failed to fetch image as data URI:', error);
    return null;
  }
}
