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
        resolve(null);
      };
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    return null;
  }
}
