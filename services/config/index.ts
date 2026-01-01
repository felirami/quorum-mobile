/**
 * Config service exports
 */

export {
  // Config management
  getConfig,
  saveConfig,
  updateConfig,
  getLocalUserConfig,
  saveLocalUserConfig,
  clearConfigStorage,
  // Profile helpers
  getDisplayName,
  getProfileImage,
  // Bookmark management
  getLocalBookmarks,
  addBookmark,
  removeBookmark,
} from './configService';
