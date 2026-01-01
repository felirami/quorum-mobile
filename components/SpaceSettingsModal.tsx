/**
 * SpaceSettingsModal - Modal for managing space settings
 *
 * Tabs (for space owners):
 * - General: Space name, description, icon, banner
 * - Account: Profile in this space, notification settings
 * - Roles: View/manage roles and permissions
 * - Emojis: Custom emoji management
 * - Stickers: Custom sticker management
 * - Invites: Generate and share invite links
 * - Danger: Delete space
 *
 * Tabs (for non-owners):
 * - Account: Profile in this space, notification settings (with leave option)
 */

import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  ScrollView,
  Alert,
  Switch,
  Share,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import { BaseModal } from '@/components/shared';
import { IconSymbol } from '@/components/ui/IconSymbol';
import { KickUserModal } from '@/components/KickUserModal';
import { useTheme } from '@/theme';
import { useAuth } from '@/context';
import { useUpdateSpace, useDeleteSpace, useLeaveSpace } from '@/hooks/chat/useSpaceSettings';
import {
  useRoles,
  useAddRole,
  useUpdateRole,
  useDeleteRole,
} from '@/hooks/chat/useRoleManagement';
import { useGenerateInvite, useShareInvite } from '@/hooks/chat/useInviteManagement';
import { useSpaceMembers } from '@/hooks/chat/useSpaces';
import { getSpace, getSpaceKey } from '@/services/config/spaceStorage';
import { pickImage } from '@/services/media/imageAttachment';
import { pickEmoji, pickSticker } from '@/services/media/customAssets';
import type { Space, Role, Permission, Emoji, Sticker, SpaceMember } from '@quilibrium/quorum-shared';

interface SpaceSettingsModalProps {
  visible: boolean;
  onClose: () => void;
  spaceId: string;
  onSpaceDeleted?: () => void;
  onSpaceLeft?: () => void;
}

type TabType = 'general' | 'account' | 'members' | 'roles' | 'emojis' | 'stickers' | 'invites' | 'danger';

// Validation constants
const MIN_NAME_LENGTH = 2;
const MAX_NAME_LENGTH = 50;
const MAX_DESCRIPTION_LENGTH = 300;
const MAX_EMOJIS = 50;
const MAX_STICKERS = 50;

// Role colors palette
const ROLE_COLORS = [
  '#ef4444', '#f97316', '#f59e0b', '#eab308',
  '#84cc16', '#22c55e', '#14b8a6', '#06b6d4',
  '#0ea5e9', '#3b82f6', '#6366f1', '#8b5cf6',
  '#a855f7', '#d946ef', '#ec4899', '#f43f5e',
];

function getRandomColor(): string {
  return ROLE_COLORS[Math.floor(Math.random() * ROLE_COLORS.length)];
}

// Available permissions for roles
const AVAILABLE_PERMISSIONS: { value: Permission; label: string }[] = [
  { value: 'mention:everyone', label: 'Mention Everyone' },
  { value: 'message:pin', label: 'Pin Messages' },
  { value: 'user:mute', label: 'Mute Users' },
  { value: 'message:delete', label: 'Delete Messages' },
];

// RoleEditor component for inline editing
interface RoleEditorProps {
  role: Role;
  spaceId: string;
  theme: any;
  styles: any;
  onDelete: () => void;
}

function RoleEditor({ role, spaceId, theme, styles, onDelete }: RoleEditorProps) {
  const [displayName, setDisplayName] = useState(role.displayName);
  const [roleTag, setRoleTag] = useState(role.roleTag);
  const [permissions, setPermissions] = useState<Permission[]>(role.permissions);
  const [isPublic, setIsPublic] = useState(role.isPublic !== false);
  const [showPermissions, setShowPermissions] = useState(false);

  const updateRoleMutation = useUpdateRole();

  const hasChanges = useMemo(() => {
    return (
      displayName !== role.displayName ||
      roleTag !== role.roleTag ||
      JSON.stringify(permissions.sort()) !== JSON.stringify([...role.permissions].sort()) ||
      isPublic !== (role.isPublic !== false)
    );
  }, [displayName, roleTag, permissions, isPublic, role]);

  const handleSave = useCallback(async () => {
    if (!hasChanges) return;
    try {
      await updateRoleMutation.mutateAsync({
        spaceId,
        roleId: role.roleId,
        displayName,
        roleTag: roleTag.toLowerCase().replace(/[^a-z0-9_]/g, ''),
        permissions,
        isPublic,
      });
    } catch (error) {
      console.error('[RoleEditor] Save failed:', error);
      Alert.alert('Error', 'Failed to save role');
    }
  }, [spaceId, role.roleId, displayName, roleTag, permissions, isPublic, hasChanges, updateRoleMutation]);

  const togglePermission = useCallback((perm: Permission) => {
    setPermissions(prev =>
      prev.includes(perm) ? prev.filter(p => p !== perm) : [...prev, perm]
    );
  }, []);

  return (
    <View style={styles.roleItem}>
      <View style={styles.roleHeader}>
        <View style={[styles.roleColorDot, { backgroundColor: role.color }]} />
        <View style={styles.roleInfo}>
          <View style={styles.roleTagRow}>
            <Text style={styles.roleTagPrefix}>@</Text>
            <TextInput
              style={styles.roleTagInput}
              value={roleTag}
              onChangeText={(text) => setRoleTag(text.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
              onBlur={handleSave}
              placeholder="tag"
              placeholderTextColor={theme.colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>
          <TextInput
            style={[styles.roleNameInput, { color: role.color }]}
            value={displayName}
            onChangeText={setDisplayName}
            onBlur={handleSave}
            placeholder="Role Name"
            placeholderTextColor={theme.colors.textMuted}
          />
        </View>
        <View style={styles.roleActions}>
          <TouchableOpacity
            style={styles.roleActionButton}
            onPress={() => {
              setIsPublic(!isPublic);
              // Save after state update
              setTimeout(() => handleSave(), 0);
            }}
          >
            <IconSymbol
              name={isPublic ? 'eye' : 'eye.slash'}
              size={18}
              color={theme.colors.textMuted}
            />
          </TouchableOpacity>
          <TouchableOpacity style={styles.roleActionButton} onPress={onDelete}>
            <IconSymbol name="trash" size={18} color={theme.colors.danger} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Permissions section */}
      <TouchableOpacity
        style={styles.rolePermissionsHeader}
        onPress={() => setShowPermissions(!showPermissions)}
      >
        <Text style={styles.rolePermissionsLabel}>Permissions:</Text>
        <Text style={styles.rolePermissionsValue}>
          {permissions.length > 0
            ? permissions.map(p => p.split(':')[1]).join(', ')
            : 'None'}
        </Text>
        <IconSymbol
          name={showPermissions ? 'chevron.up' : 'chevron.down'}
          size={14}
          color={theme.colors.textMuted}
        />
      </TouchableOpacity>

      {showPermissions && (
        <View style={styles.permissionsList}>
          {AVAILABLE_PERMISSIONS.map((perm) => (
            <TouchableOpacity
              key={perm.value}
              style={styles.permissionItem}
              onPress={() => {
                togglePermission(perm.value);
                // Save after state update
                setTimeout(() => handleSave(), 0);
              }}
            >
              <View style={[
                styles.permissionCheckbox,
                permissions.includes(perm.value) && styles.permissionCheckboxChecked
              ]}>
                {permissions.includes(perm.value) && (
                  <IconSymbol name="checkmark" size={12} color="#fff" />
                )}
              </View>
              <Text style={styles.permissionLabel}>{perm.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {updateRoleMutation.isPending && (
        <View style={styles.roleSavingIndicator}>
          <ActivityIndicator size="small" color={theme.colors.primary} />
        </View>
      )}
    </View>
  );
}

export default function SpaceSettingsModal({
  visible,
  onClose,
  spaceId,
  onSpaceDeleted,
  onSpaceLeft,
}: SpaceSettingsModalProps) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = createStyles(theme, insets);
  const { user } = useAuth();

  // Determine if user is space owner
  const isSpaceOwner = useMemo(() => {
    const ownerKey = getSpaceKey(spaceId, 'owner');
    return !!ownerKey;
  }, [spaceId]);

  // Load space data
  const [space, setSpace] = useState<Space | null>(null);
  useEffect(() => {
    if (visible && spaceId) {
      const loadedSpace = getSpace(spaceId);
      setSpace(loadedSpace);
    }
  }, [visible, spaceId]);

  // Tab state - default to 'account' for non-owners
  const [activeTab, setActiveTab] = useState<TabType>(isSpaceOwner ? 'general' : 'account');

  // Track content area height for ScrollView
  const [contentHeight, setContentHeight] = useState<number>(0);

  // Reset tab when modal opens
  useEffect(() => {
    if (visible) {
      setActiveTab(isSpaceOwner ? 'general' : 'account');
    }
  }, [visible, isSpaceOwner]);

  // Mutations
  const updateSpaceMutation = useUpdateSpace();
  const deleteSpaceMutation = useDeleteSpace();
  const leaveSpaceMutation = useLeaveSpace();

  // Roles
  const { data: roles = [] } = useRoles(spaceId);
  const addRoleMutation = useAddRole();
  const updateRoleMutation = useUpdateRole();
  const deleteRoleMutation = useDeleteRole();

  // Members
  const { data: members = [] } = useSpaceMembers(spaceId, { enabled: !!spaceId });

  // Invites
  const generateInviteMutation = useGenerateInvite();
  const shareInviteMutation = useShareInvite();

  // General tab state
  const [spaceName, setSpaceName] = useState('');
  const [description, setDescription] = useState('');
  const [iconUrl, setIconUrl] = useState('');
  const [bannerUrl, setBannerUrl] = useState('');
  const [isRepudiable, setIsRepudiable] = useState(true);

  // Initialize form when space loads
  useEffect(() => {
    if (space) {
      setSpaceName(space.spaceName);
      setDescription(space.description || '');
      setIconUrl(space.iconUrl || '');
      setBannerUrl(space.bannerUrl || '');
      setIsRepudiable(space.isRepudiable);
    }
  }, [space]);

  // Invite state
  const [generatedInviteLink, setGeneratedInviteLink] = useState<string | null>(null);

  // Delete/Leave confirmation
  const [deleteConfirmStep, setDeleteConfirmStep] = useState(0);
  const [leaveConfirmStep, setLeaveConfirmStep] = useState(0);

  // Kick modal state
  const [kickTarget, setKickTarget] = useState<{
    address: string;
    displayName: string;
    userIcon?: string;
  } | null>(null);

  // Emoji/Sticker state
  const [isUploadingEmoji, setIsUploadingEmoji] = useState(false);
  const [isUploadingSticker, setIsUploadingSticker] = useState(false);
  const [editingEmojiId, setEditingEmojiId] = useState<string | null>(null);
  const [editingStickerName, setEditingStickerName] = useState<string | null>(null);
  const [editingEmojiName, setEditingEmojiName] = useState('');
  const [editingStickerNameValue, setEditingStickerNameValue] = useState('');

  // Validation
  const nameError = useMemo(() => {
    const trimmed = spaceName.trim();
    if (!trimmed) return 'Space name is required';
    if (trimmed.length < MIN_NAME_LENGTH) return `Name must be at least ${MIN_NAME_LENGTH} characters`;
    if (trimmed.length > MAX_NAME_LENGTH) return `Name must be ${MAX_NAME_LENGTH} characters or less`;
    return null;
  }, [spaceName]);

  const descriptionError = useMemo(() => {
    if (description.length > MAX_DESCRIPTION_LENGTH) {
      return `Description must be ${MAX_DESCRIPTION_LENGTH} characters or less`;
    }
    return null;
  }, [description]);

  const hasGeneralChanges = useMemo(() => {
    if (!space) return false;
    return (
      spaceName.trim() !== space.spaceName ||
      description.trim() !== (space.description || '') ||
      iconUrl !== (space.iconUrl || '') ||
      bannerUrl !== (space.bannerUrl || '') ||
      isRepudiable !== space.isRepudiable
    );
  }, [space, spaceName, description, iconUrl, bannerUrl, isRepudiable]);

  // Handlers
  const handleClose = useCallback(() => {
    setGeneratedInviteLink(null);
    setDeleteConfirmStep(0);
    setLeaveConfirmStep(0);
    setKickTarget(null);
    onClose();
  }, [onClose]);

  const handleSaveGeneral = useCallback(async () => {
    if (nameError || descriptionError) return;

    try {
      await updateSpaceMutation.mutateAsync({
        spaceId,
        spaceName: spaceName.trim(),
        description: description.trim() || undefined,
        iconUrl: iconUrl || undefined,
        bannerUrl: bannerUrl || undefined,
        isRepudiable,
      });
      // Reload space
      const updated = getSpace(spaceId);
      setSpace(updated);
    } catch (error) {
      console.error('[SpaceSettings] Save failed:', error);
      Alert.alert('Error', 'Failed to save changes');
    }
  }, [spaceId, spaceName, description, iconUrl, bannerUrl, isRepudiable, nameError, descriptionError, updateSpaceMutation]);

  const handlePickIcon = useCallback(async () => {
    const result = await pickImage('library');
    if (result.success && result.attachment) {
      setIconUrl(result.attachment.imageUrl);
    }
  }, []);

  const handlePickBanner = useCallback(async () => {
    const result = await pickImage('library');
    if (result.success && result.attachment) {
      setBannerUrl(result.attachment.imageUrl);
    }
  }, []);

  const handleGenerateInvite = useCallback(async () => {
    try {
      const result = await generateInviteMutation.mutateAsync({ spaceId });
      setGeneratedInviteLink(result.inviteLink);
    } catch (error) {
      console.error('[SpaceSettings] Generate invite failed:', error);
      Alert.alert('Error', 'Failed to generate invite link');
    }
  }, [spaceId, generateInviteMutation]);

  const handleCopyInvite = useCallback(async () => {
    if (generatedInviteLink) {
      await Clipboard.setStringAsync(generatedInviteLink);
      Alert.alert('Copied', 'Invite link copied to clipboard');
    }
  }, [generatedInviteLink]);

  const handleShareInvite = useCallback(async () => {
    if (generatedInviteLink && space) {
      try {
        await shareInviteMutation.mutateAsync({
          inviteLink: generatedInviteLink,
          spaceName: space.spaceName,
        });
      } catch (error) {
        console.error('[SpaceSettings] Share failed:', error);
      }
    }
  }, [generatedInviteLink, space, shareInviteMutation]);

  // Emoji handlers
  const handleUploadEmoji = useCallback(async () => {
    if (!space || (space.emojis?.length ?? 0) >= MAX_EMOJIS) {
      Alert.alert('Limit Reached', `You can only have ${MAX_EMOJIS} custom emojis`);
      return;
    }

    setIsUploadingEmoji(true);
    try {
      const result = await pickEmoji();
      if (result.cancelled) {
        setIsUploadingEmoji(false);
        return;
      }
      if (!result.success || !result.asset) {
        Alert.alert('Error', result.error || 'Failed to upload emoji');
        setIsUploadingEmoji(false);
        return;
      }

      const newEmoji: Emoji = {
        id: result.asset.id,
        name: result.asset.name,
        imgUrl: result.asset.imgUrl,
      };

      const updatedEmojis = [...(space.emojis || []), newEmoji];
      await updateSpaceMutation.mutateAsync({
        spaceId,
        emojis: updatedEmojis,
      });

      // Reload space
      const updated = getSpace(spaceId);
      setSpace(updated);
    } catch (error) {
      console.error('[SpaceSettings] Upload emoji failed:', error);
      Alert.alert('Error', 'Failed to upload emoji');
    } finally {
      setIsUploadingEmoji(false);
    }
  }, [space, spaceId, updateSpaceMutation]);

  const handleDeleteEmoji = useCallback(async (emojiId: string) => {
    if (!space) return;

    Alert.alert(
      'Delete Emoji',
      'Are you sure you want to delete this emoji?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const updatedEmojis = (space.emojis || []).filter(e => e.id !== emojiId);
              await updateSpaceMutation.mutateAsync({
                spaceId,
                emojis: updatedEmojis,
              });

              const updated = getSpace(spaceId);
              setSpace(updated);
            } catch (error) {
              console.error('[SpaceSettings] Delete emoji failed:', error);
              Alert.alert('Error', 'Failed to delete emoji');
            }
          },
        },
      ]
    );
  }, [space, spaceId, updateSpaceMutation]);

  const handleSaveEmojiName = useCallback(async (emojiId: string) => {
    if (!space || !editingEmojiName.trim()) {
      setEditingEmojiId(null);
      return;
    }

    const sanitized = editingEmojiName.toLowerCase().replace(/[^a-z0-9_]/g, '_').substring(0, 32);
    if (!sanitized) {
      setEditingEmojiId(null);
      return;
    }

    try {
      const updatedEmojis = (space.emojis || []).map(e =>
        e.id === emojiId ? { ...e, name: sanitized } : e
      );
      await updateSpaceMutation.mutateAsync({
        spaceId,
        emojis: updatedEmojis,
      });

      const updated = getSpace(spaceId);
      setSpace(updated);
    } catch (error) {
      console.error('[SpaceSettings] Rename emoji failed:', error);
      Alert.alert('Error', 'Failed to rename emoji');
    } finally {
      setEditingEmojiId(null);
    }
  }, [space, spaceId, editingEmojiName, updateSpaceMutation]);

  // Sticker handlers
  const handleUploadSticker = useCallback(async () => {
    if (!space || (space.stickers?.length ?? 0) >= MAX_STICKERS) {
      Alert.alert('Limit Reached', `You can only have ${MAX_STICKERS} custom stickers`);
      return;
    }

    setIsUploadingSticker(true);
    try {
      const result = await pickSticker();
      if (result.cancelled) {
        setIsUploadingSticker(false);
        return;
      }
      if (!result.success || !result.asset) {
        Alert.alert('Error', result.error || 'Failed to upload sticker');
        setIsUploadingSticker(false);
        return;
      }

      const newSticker: Sticker = {
        id: result.asset.id,
        name: result.asset.name,
        imgUrl: result.asset.imgUrl,
      };

      const updatedStickers = [...(space.stickers || []), newSticker];
      await updateSpaceMutation.mutateAsync({
        spaceId,
        stickers: updatedStickers,
      });

      const updated = getSpace(spaceId);
      setSpace(updated);
    } catch (error) {
      console.error('[SpaceSettings] Upload sticker failed:', error);
      Alert.alert('Error', 'Failed to upload sticker');
    } finally {
      setIsUploadingSticker(false);
    }
  }, [space, spaceId, updateSpaceMutation]);

  const handleDeleteSticker = useCallback(async (stickerId: string) => {
    if (!space) return;

    Alert.alert(
      'Delete Sticker',
      'Are you sure you want to delete this sticker?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const updatedStickers = (space.stickers || []).filter(s => s.id !== stickerId);
              await updateSpaceMutation.mutateAsync({
                spaceId,
                stickers: updatedStickers,
              });

              const updated = getSpace(spaceId);
              setSpace(updated);
            } catch (error) {
              console.error('[SpaceSettings] Delete sticker failed:', error);
              Alert.alert('Error', 'Failed to delete sticker');
            }
          },
        },
      ]
    );
  }, [space, spaceId, updateSpaceMutation]);

  const handleSaveStickerName = useCallback(async (stickerId: string) => {
    if (!space || !editingStickerNameValue.trim()) {
      setEditingStickerName(null);
      return;
    }

    const sanitized = editingStickerNameValue.toLowerCase().replace(/[^a-z0-9_]/g, '_').substring(0, 32);
    if (!sanitized) {
      setEditingStickerName(null);
      return;
    }

    try {
      const updatedStickers = (space.stickers || []).map(s =>
        s.id === stickerId ? { ...s, name: sanitized } : s
      );
      await updateSpaceMutation.mutateAsync({
        spaceId,
        stickers: updatedStickers,
      });

      const updated = getSpace(spaceId);
      setSpace(updated);
    } catch (error) {
      console.error('[SpaceSettings] Rename sticker failed:', error);
      Alert.alert('Error', 'Failed to rename sticker');
    } finally {
      setEditingStickerName(null);
    }
  }, [space, spaceId, editingStickerNameValue, updateSpaceMutation]);

  const handleAddRole = useCallback(async () => {
    try {
      await addRoleMutation.mutateAsync({
        spaceId,
        displayName: 'New Role',
        roleTag: 'newrole',
        color: getRandomColor(),
        permissions: [],
        isPublic: true,
      });
    } catch (error) {
      console.error('[SpaceSettings] Add role failed:', error);
      Alert.alert('Error', 'Failed to add role');
    }
  }, [spaceId, addRoleMutation]);

  const handleDeleteRole = useCallback(async (roleId: string) => {
    Alert.alert(
      'Delete Role',
      'Are you sure you want to delete this role?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteRoleMutation.mutateAsync({ spaceId, roleId });
            } catch (error) {
              console.error('[SpaceSettings] Delete role failed:', error);
              Alert.alert('Error', 'Failed to delete role');
            }
          },
        },
      ]
    );
  }, [spaceId, deleteRoleMutation]);

  const handleDeleteSpace = useCallback(async () => {
    if (deleteConfirmStep === 0) {
      setDeleteConfirmStep(1);
      setTimeout(() => setDeleteConfirmStep(0), 5000);
      return;
    }

    try {
      await deleteSpaceMutation.mutateAsync({ spaceId });
      handleClose();
      onSpaceDeleted?.();
    } catch (error) {
      console.error('[SpaceSettings] Delete failed:', error);
      Alert.alert('Error', 'Failed to delete space');
    }
  }, [spaceId, deleteConfirmStep, deleteSpaceMutation, handleClose, onSpaceDeleted]);

  const handleLeaveSpace = useCallback(async () => {
    if (leaveConfirmStep === 0) {
      setLeaveConfirmStep(1);
      setTimeout(() => setLeaveConfirmStep(0), 5000);
      return;
    }

    try {
      await leaveSpaceMutation.mutateAsync({ spaceId });
      handleClose();
      onSpaceLeft?.();
    } catch (error) {
      console.error('[SpaceSettings] Leave failed:', error);
      Alert.alert('Error', 'Failed to leave space');
    }
  }, [spaceId, leaveConfirmStep, leaveSpaceMutation, handleClose, onSpaceLeft]);

  // Owner tabs
  const ownerTabs: { key: TabType; label: string; icon: string }[] = [
    { key: 'general', label: 'General', icon: 'gearshape' },
    { key: 'account', label: 'Account', icon: 'person' },
    { key: 'members', label: 'Members', icon: 'person.2' },
    { key: 'roles', label: 'Roles', icon: 'shield' },
    { key: 'emojis', label: 'Emojis', icon: 'face.smiling' },
    { key: 'stickers', label: 'Stickers', icon: 'star' },
    { key: 'invites', label: 'Invites', icon: 'link' },
    { key: 'danger', label: 'Danger', icon: 'exclamationmark.triangle' },
  ];

  // Non-owner tabs
  const memberTabs: { key: TabType; label: string; icon: string }[] = [
    { key: 'account', label: 'Account', icon: 'person' },
    { key: 'members', label: 'Members', icon: 'person.2' },
  ];

  const tabs = isSpaceOwner ? ownerTabs : memberTabs;

  // Tab content renderers
  const renderGeneralTab = () => (
    <View
      style={styles.tabContentWrapper}
      onLayout={(e) => setContentHeight(e.nativeEvent.layout.height)}
    >
      <ScrollView
        style={contentHeight > 0 ? { height: contentHeight } : undefined}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.generalTabContainer}
      >
      {/* Space Name */}
      <View style={styles.inputSection}>
        <Text style={styles.label}>Space Name</Text>
        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            value={spaceName}
            onChangeText={setSpaceName}
            placeholder="Enter space name"
            placeholderTextColor={theme.colors.textMuted}
            maxLength={MAX_NAME_LENGTH}
          />
        </View>
        {spaceName.length > 0 && nameError && (
          <Text style={styles.errorText}>{nameError}</Text>
        )}
      </View>

      {/* Description */}
      <View style={styles.inputSection}>
        <Text style={styles.label}>Description</Text>
        <View style={[styles.inputContainer, styles.textAreaContainer]}>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={description}
            onChangeText={setDescription}
            placeholder="Enter description"
            placeholderTextColor={theme.colors.textMuted}
            multiline
            numberOfLines={3}
            textAlignVertical="top"
            maxLength={MAX_DESCRIPTION_LENGTH + 50}
          />
        </View>
        <View style={styles.charCountRow}>
          {descriptionError && <Text style={styles.errorText}>{descriptionError}</Text>}
          <Text style={[styles.charCount, descriptionError && styles.charCountError]}>
            {description.length}/{MAX_DESCRIPTION_LENGTH}
          </Text>
        </View>
      </View>

      {/* Icon */}
      <View style={styles.inputSection}>
        <Text style={styles.label}>Space Icon</Text>
        <TouchableOpacity style={styles.imagePickerButton} onPress={handlePickIcon}>
          {iconUrl ? (
            <Image source={{ uri: iconUrl }} style={styles.iconPreview} />
          ) : (
            <View style={styles.iconPlaceholder}>
              <IconSymbol name="photo" size={24} color={theme.colors.textMuted} />
            </View>
          )}
          <Text style={styles.imagePickerText}>
            {iconUrl ? 'Change Icon' : 'Upload Icon'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Banner */}
      <View style={styles.inputSection}>
        <Text style={styles.label}>Space Banner</Text>
        <TouchableOpacity style={styles.imagePickerButton} onPress={handlePickBanner}>
          {bannerUrl ? (
            <Image source={{ uri: bannerUrl }} style={styles.bannerPreview} />
          ) : (
            <View style={styles.bannerPlaceholder}>
              <IconSymbol name="photo" size={24} color={theme.colors.textMuted} />
            </View>
          )}
          <Text style={styles.imagePickerText}>
            {bannerUrl ? 'Change Banner' : 'Upload Banner'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Message signing toggle */}
      <View style={styles.toggleRow}>
        <View style={styles.toggleInfo}>
          <Text style={styles.toggleLabel}>Require Message Signing</Text>
          <Text style={styles.toggleDescription}>
            When enabled, senders confirm messages come from their key. When disabled, senders have plausible deniability.
          </Text>
        </View>
        <Switch
          value={!isRepudiable}
          onValueChange={(value) => setIsRepudiable(!value)}
          trackColor={{ false: theme.colors.surface4, true: theme.colors.primary }}
          thumbColor="#fff"
        />
      </View>

      {/* Save button at bottom of scroll content */}
      <TouchableOpacity
        style={[
          styles.saveButton,
          styles.generalSaveButton,
          !hasGeneralChanges && styles.saveButtonDisabled,
          (nameError || descriptionError) && styles.saveButtonDisabled,
        ]}
        onPress={handleSaveGeneral}
        disabled={!hasGeneralChanges || !!nameError || !!descriptionError || updateSpaceMutation.isPending}
      >
        {updateSpaceMutation.isPending ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <Text style={styles.saveButtonText}>Save Changes</Text>
        )}
      </TouchableOpacity>
      </ScrollView>
    </View>
  );

  const renderAccountTab = () => (
    <ScrollView
      style={styles.tabContent}
      contentContainerStyle={styles.tabContentContainer}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.sectionTitle}>Your Profile in This Space</Text>
      <Text style={styles.sectionDescription}>
        Profile settings for this space will be available in a future update.
      </Text>

      <View style={styles.divider} />

      <Text style={styles.sectionTitle}>Notifications</Text>
      <Text style={styles.sectionDescription}>
        Notification settings will be available in a future update.
      </Text>

      {/* Leave space button (for non-owners) */}
      {!isSpaceOwner && (
        <>
          <View style={styles.divider} />
          <View style={styles.dangerSection}>
            <Text style={styles.dangerTitle}>Leave this Space</Text>
            <Text style={styles.dangerDescription}>
              You won't be able to rejoin unless you are re-invited. Your existing messages will NOT be deleted.
            </Text>
            <TouchableOpacity
              style={[styles.dangerButton, styles.dangerButtonOutline]}
              onPress={handleLeaveSpace}
              disabled={leaveSpaceMutation.isPending}
            >
              {leaveSpaceMutation.isPending ? (
                <ActivityIndicator size="small" color={theme.colors.danger} />
              ) : (
                <Text style={styles.dangerButtonOutlineText}>
                  {leaveConfirmStep === 0 ? 'Leave Space' : 'Click again to confirm'}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </>
      )}
    </ScrollView>
  );

  // Helper to get roles for a member
  const getMemberRoles = (memberAddress: string): Role[] => {
    return roles.filter(role => role.members.includes(memberAddress));
  };

  // Helper to truncate address
  const truncateAddress = (address: string | undefined): string => {
    if (!address) return 'Unknown';
    if (address.length <= 16) return address;
    return `${address.slice(0, 8)}...${address.slice(-6)}`;
  };

  const renderMembersTab = () => (
    <View
      style={styles.tabContentWrapper}
      onLayout={(e) => setContentHeight(e.nativeEvent.layout.height)}
    >
      <ScrollView
        style={contentHeight > 0 ? { height: contentHeight } : undefined}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.tabContentContainer}
      >
        <Text style={styles.sectionDescription}>
          {members.length} member{members.length !== 1 ? 's' : ''} in this space
        </Text>

        {members.map((member) => {
          const memberRoles = getMemberRoles(member.address);
          return (
            <View key={member.address} style={styles.memberItem}>
              <View style={styles.memberAvatar}>
                {member.profile_image ? (
                  <Image source={{ uri: member.profile_image }} style={styles.memberAvatarImage} />
                ) : (
                  <View style={styles.memberAvatarPlaceholder}>
                    <Text style={styles.memberAvatarText}>
                      {(member.display_name || member.name || member.address).charAt(0).toUpperCase()}
                    </Text>
                  </View>
                )}
              </View>
              <View style={styles.memberInfo}>
                <Text style={styles.memberName}>
                  {member.display_name || member.name || truncateAddress(member.address)}
                </Text>
                <Text style={styles.memberAddress}>{truncateAddress(member.address)}</Text>
                {memberRoles.length > 0 && (
                  <View style={styles.memberRolesRow}>
                    {memberRoles.map((role) => (
                      <View key={role.roleId} style={[styles.memberRoleBadge, { backgroundColor: role.color + '20' }]}>
                        <View style={[styles.memberRoleDot, { backgroundColor: role.color }]} />
                        <Text style={[styles.memberRoleText, { color: role.color }]}>{role.displayName}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>
              {member.isKicked ? (
                <View style={styles.kickedBadge}>
                  <Text style={styles.kickedBadgeText}>Kicked</Text>
                </View>
              ) : isSpaceOwner && member.address !== user?.address ? (
                <TouchableOpacity
                  style={styles.kickButton}
                  onPress={() => setKickTarget({
                    address: member.address,
                    displayName: member.display_name || member.name || truncateAddress(member.address),
                    userIcon: member.profile_image,
                  })}
                >
                  <Text style={styles.kickButtonText}>Kick</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          );
        })}

        {members.length === 0 && (
          <View style={styles.emptyState}>
            <IconSymbol name="person.2" size={48} color={theme.colors.textMuted} />
            <Text style={styles.emptyStateText}>No members yet</Text>
            <Text style={styles.emptyStateDescription}>
              Invite people to join this space
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );

  const renderRolesTab = () => (
    <ScrollView
      style={styles.tabContent}
      contentContainerStyle={styles.tabContentContainer}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.sectionDescription}>
        Click on the role name and tag to edit them. Grant delete and mute permissions carefully.
      </Text>

      <TouchableOpacity
        style={styles.addButton}
        onPress={handleAddRole}
        disabled={addRoleMutation.isPending}
      >
        {addRoleMutation.isPending ? (
          <ActivityIndicator size="small" color={theme.colors.primary} />
        ) : (
          <>
            <IconSymbol name="plus" size={16} color={theme.colors.primary} />
            <Text style={styles.addButtonText}>Add Role</Text>
          </>
        )}
      </TouchableOpacity>

      {roles.map((role) => (
        <RoleEditor
          key={role.roleId}
          role={role}
          spaceId={spaceId}
          theme={theme}
          styles={styles}
          onDelete={() => handleDeleteRole(role.roleId)}
        />
      ))}

      {roles.length === 0 && (
        <View style={styles.emptyState}>
          <IconSymbol name="shield" size={48} color={theme.colors.textMuted} />
          <Text style={styles.emptyStateText}>No roles yet</Text>
          <Text style={styles.emptyStateDescription}>
            Add roles to organize permissions and mentions
          </Text>
        </View>
      )}
    </ScrollView>
  );

  const renderEmojisTab = () => (
    <ScrollView style={styles.tabContent} contentContainerStyle={styles.tabContentContainer} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
      <Text style={styles.sectionDescription}>
        Add up to {MAX_EMOJIS} custom emoji ({space?.emojis?.length ?? 0}/{MAX_EMOJIS}). Custom emojis can only be used within this Space.
      </Text>

      <TouchableOpacity
        style={[styles.addButton, isUploadingEmoji && styles.addButtonDisabled]}
        onPress={handleUploadEmoji}
        disabled={isUploadingEmoji}
      >
        {isUploadingEmoji ? (
          <ActivityIndicator size="small" color={theme.colors.primary} />
        ) : (
          <>
            <IconSymbol name="plus" size={16} color={theme.colors.primary} />
            <Text style={styles.addButtonText}>Upload Emoji</Text>
          </>
        )}
      </TouchableOpacity>

      {(space?.emojis ?? []).map((emoji) => (
        <View key={emoji.id} style={styles.emojiItem}>
          <Image source={{ uri: emoji.imgUrl }} style={styles.emojiImage} />
          {editingEmojiId === emoji.id ? (
            <View style={styles.emojiEditContainer}>
              <TextInput
                style={styles.emojiEditInput}
                value={editingEmojiName}
                onChangeText={setEditingEmojiName}
                autoFocus
                maxLength={32}
                onBlur={() => handleSaveEmojiName(emoji.id)}
                onSubmitEditing={() => handleSaveEmojiName(emoji.id)}
              />
            </View>
          ) : (
            <TouchableOpacity
              style={styles.emojiNameContainer}
              onPress={() => {
                setEditingEmojiId(emoji.id);
                setEditingEmojiName(emoji.name);
              }}
            >
              <Text style={styles.emojiName}>:{emoji.name}:</Text>
              <IconSymbol name="pencil" size={14} color={theme.colors.textMuted} />
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={styles.emojiDelete}
            onPress={() => handleDeleteEmoji(emoji.id)}
          >
            <IconSymbol name="trash" size={18} color={theme.colors.danger} />
          </TouchableOpacity>
        </View>
      ))}

      {(space?.emojis ?? []).length === 0 && (
        <View style={styles.emptyState}>
          <IconSymbol name="face.smiling" size={48} color={theme.colors.textMuted} />
          <Text style={styles.emptyStateText}>No custom emojis</Text>
          <Text style={styles.emptyStateDescription}>
            Upload custom emojis for your Space
          </Text>
        </View>
      )}
    </ScrollView>
  );

  const renderStickersTab = () => (
    <ScrollView style={styles.tabContent} contentContainerStyle={styles.tabContentContainer} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
      <Text style={styles.sectionDescription}>
        Add up to {MAX_STICKERS} custom stickers ({space?.stickers?.length ?? 0}/{MAX_STICKERS}). Custom stickers can only be used within this Space.
      </Text>

      <TouchableOpacity
        style={[styles.addButton, isUploadingSticker && styles.addButtonDisabled]}
        onPress={handleUploadSticker}
        disabled={isUploadingSticker}
      >
        {isUploadingSticker ? (
          <ActivityIndicator size="small" color={theme.colors.primary} />
        ) : (
          <>
            <IconSymbol name="plus" size={16} color={theme.colors.primary} />
            <Text style={styles.addButtonText}>Upload Sticker</Text>
          </>
        )}
      </TouchableOpacity>

      {(space?.stickers ?? []).map((sticker) => (
        <View key={sticker.id} style={styles.stickerItem}>
          <Image source={{ uri: sticker.imgUrl }} style={styles.stickerImage} />
          {editingStickerName === sticker.id ? (
            <View style={styles.stickerEditContainer}>
              <TextInput
                style={styles.stickerEditInput}
                value={editingStickerNameValue}
                onChangeText={setEditingStickerNameValue}
                autoFocus
                maxLength={32}
                onBlur={() => handleSaveStickerName(sticker.id)}
                onSubmitEditing={() => handleSaveStickerName(sticker.id)}
              />
            </View>
          ) : (
            <TouchableOpacity
              style={styles.stickerNameContainer}
              onPress={() => {
                setEditingStickerName(sticker.id);
                setEditingStickerNameValue(sticker.name);
              }}
            >
              <Text style={styles.stickerName}>{sticker.name}</Text>
              <IconSymbol name="pencil" size={14} color={theme.colors.textMuted} />
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={styles.stickerDelete}
            onPress={() => handleDeleteSticker(sticker.id)}
          >
            <IconSymbol name="trash" size={18} color={theme.colors.danger} />
          </TouchableOpacity>
        </View>
      ))}

      {(space?.stickers ?? []).length === 0 && (
        <View style={styles.emptyState}>
          <IconSymbol name="star" size={48} color={theme.colors.textMuted} />
          <Text style={styles.emptyStateText}>No custom stickers</Text>
          <Text style={styles.emptyStateDescription}>
            Upload custom stickers for your Space
          </Text>
        </View>
      )}
    </ScrollView>
  );

  const renderInvitesTab = () => (
    <ScrollView style={styles.tabContent} contentContainerStyle={styles.tabContentContainer} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
      <Text style={styles.sectionTitle}>Generate Invite Link</Text>
      <Text style={styles.sectionDescription}>
        Create a link to invite others to this Space. The link can be used once per person.
      </Text>

      {!generatedInviteLink ? (
        <TouchableOpacity
          style={styles.generateButton}
          onPress={handleGenerateInvite}
          disabled={generateInviteMutation.isPending}
        >
          {generateInviteMutation.isPending ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <IconSymbol name="link" size={18} color="#fff" />
              <Text style={styles.generateButtonText}>Generate Invite Link</Text>
            </>
          )}
        </TouchableOpacity>
      ) : (
        <View style={styles.inviteLinkContainer}>
          <View style={styles.inviteLinkBox}>
            <Text style={styles.inviteLinkText} numberOfLines={1}>
              {generatedInviteLink}
            </Text>
          </View>
          <View style={styles.inviteLinkActions}>
            <TouchableOpacity style={styles.inviteLinkButton} onPress={handleCopyInvite}>
              <IconSymbol name="doc.on.doc" size={18} color={theme.colors.primary} />
              <Text style={styles.inviteLinkButtonText}>Copy</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.inviteLinkButton} onPress={handleShareInvite}>
              <IconSymbol name="square.and.arrow.up" size={18} color={theme.colors.primary} />
              <Text style={styles.inviteLinkButtonText}>Share</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.inviteLinkButton}
              onPress={() => setGeneratedInviteLink(null)}
            >
              <IconSymbol name="arrow.clockwise" size={18} color={theme.colors.primary} />
              <Text style={styles.inviteLinkButtonText}>New</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </ScrollView>
  );

  const renderDangerTab = () => (
    <ScrollView style={styles.tabContent} contentContainerStyle={styles.tabContentContainer} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
      <View style={styles.dangerSection}>
        <Text style={[styles.dangerTitle, { color: theme.colors.danger }]}>
          Delete this Space
        </Text>
        <Text style={styles.dangerDescription}>
          This action cannot be undone and will permanently remove all the Space settings.
          To delete the Space, you must first delete all Channels.
        </Text>
        <TouchableOpacity
          style={styles.dangerButton}
          onPress={handleDeleteSpace}
          disabled={deleteSpaceMutation.isPending}
        >
          {deleteSpaceMutation.isPending ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.dangerButtonText}>
              {deleteConfirmStep === 0 ? 'Delete Space' : 'Click again to confirm'}
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </ScrollView>
  );

  const renderTabContent = () => {
    switch (activeTab) {
      case 'general':
        return renderGeneralTab();
      case 'account':
        return renderAccountTab();
      case 'members':
        return renderMembersTab();
      case 'roles':
        return renderRolesTab();
      case 'emojis':
        return renderEmojisTab();
      case 'stickers':
        return renderStickersTab();
      case 'invites':
        return renderInvitesTab();
      case 'danger':
        return renderDangerTab();
      default:
        return null;
    }
  };

  if (!space) {
    return null;
  }

  return (
    <BaseModal visible={visible} onClose={handleClose} height={0.80} avoidKeyboard>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Space Settings</Text>
          <Text style={styles.subtitle}>{space.spaceName}</Text>
        </View>

        {/* Tab bar */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.tabBar}
          contentContainerStyle={styles.tabBarContent}
        >
          {tabs.map((tab) => (
            <TouchableOpacity
              key={tab.key}
              style={[styles.tab, activeTab === tab.key && styles.tabActive]}
              onPress={() => setActiveTab(tab.key)}
            >
              <IconSymbol
                name={tab.icon as any}
                size={18}
                color={
                  activeTab === tab.key
                    ? tab.key === 'danger'
                      ? theme.colors.danger
                      : theme.colors.primary
                    : theme.colors.textMuted
                }
              />
              <Text
                style={[
                  styles.tabText,
                  activeTab === tab.key && styles.tabTextActive,
                  tab.key === 'danger' && activeTab === tab.key && { color: theme.colors.danger },
                ]}
              >
                {tab.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Tab content */}
        {renderTabContent()}
      </View>

      {/* Kick User Modal */}
      {kickTarget && (
        <KickUserModal
          visible={true}
          onClose={() => setKickTarget(null)}
          spaceId={spaceId}
          userName={kickTarget.displayName}
          userIcon={kickTarget.userIcon}
          userAddress={kickTarget.address}
        />
      )}
    </BaseModal>
  );
}

const createStyles = (theme: any, insets: any) =>
  StyleSheet.create({
    container: {
      flex: 1,
      paddingHorizontal: 16,
    },
    tabContentWrapper: {
      flex: 1,
    },
    header: {
      paddingVertical: 12,
      alignItems: 'center',
    },
    title: {
      fontSize: 20,
      fontFamily: theme.fonts.bold.fontFamily,
      fontWeight: theme.fonts.bold.fontWeight,
      color: theme.colors.textStrong,
    },
    subtitle: {
      fontSize: 14,
      fontFamily: theme.fonts.regular.fontFamily,
      color: theme.colors.textMuted,
      marginTop: 4,
    },
    tabBar: {
      flexGrow: 0,
      marginBottom: 16,
    },
    tabBarContent: {
      gap: 8,
      paddingHorizontal: 4,
    },
    tab: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 8,
      paddingHorizontal: 12,
      borderRadius: 8,
      backgroundColor: theme.colors.surface3,
      gap: 6,
    },
    tabActive: {
      backgroundColor: theme.colors.surface1,
    },
    tabText: {
      fontSize: 13,
      fontFamily: theme.fonts.medium.fontFamily,
      fontWeight: theme.fonts.medium.fontWeight,
      color: theme.colors.textMuted,
    },
    tabTextActive: {
      color: theme.colors.primary,
    },
    tabContent: {
      flex: 1,
    },
    tabContentContainer: {
      paddingBottom: 16,
    },
    generalTabContainer: {
      paddingBottom: Math.max(insets.bottom, 32),
    },
    inputSection: {
      marginBottom: 16,
    },
    label: {
      fontSize: 14,
      fontFamily: theme.fonts.medium.fontFamily,
      fontWeight: theme.fonts.medium.fontWeight,
      color: theme.colors.textMain,
      marginBottom: 8,
    },
    inputContainer: {
      backgroundColor: theme.colors.surface3,
      borderRadius: 12,
      paddingHorizontal: 16,
    },
    textAreaContainer: {
      paddingVertical: 8,
    },
    input: {
      paddingVertical: 14,
      fontSize: 16,
      fontFamily: theme.fonts.regular.fontFamily,
      color: theme.colors.textMain,
    },
    textArea: {
      minHeight: 80,
      paddingVertical: 8,
    },
    charCountRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginTop: 4,
    },
    charCount: {
      fontSize: 12,
      fontFamily: theme.fonts.regular.fontFamily,
      color: theme.colors.textMuted,
      marginLeft: 'auto',
    },
    charCountError: {
      color: theme.colors.danger,
    },
    errorText: {
      marginTop: 8,
      fontSize: 13,
      fontFamily: theme.fonts.regular.fontFamily,
      color: theme.colors.danger,
    },
    imagePickerButton: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: theme.colors.surface3,
      borderRadius: 12,
      padding: 12,
      gap: 12,
    },
    iconPreview: {
      width: 48,
      height: 48,
      borderRadius: 12,
    },
    iconPlaceholder: {
      width: 48,
      height: 48,
      borderRadius: 12,
      backgroundColor: theme.colors.surface4,
      alignItems: 'center',
      justifyContent: 'center',
    },
    bannerPreview: {
      width: 120,
      height: 48,
      borderRadius: 8,
    },
    bannerPlaceholder: {
      width: 120,
      height: 48,
      borderRadius: 8,
      backgroundColor: theme.colors.surface4,
      alignItems: 'center',
      justifyContent: 'center',
    },
    imagePickerText: {
      fontSize: 14,
      fontFamily: theme.fonts.medium.fontFamily,
      fontWeight: theme.fonts.medium.fontWeight,
      color: theme.colors.primary,
    },
    toggleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: theme.colors.surface3,
      borderRadius: 12,
      padding: 16,
      marginBottom: 16,
    },
    toggleInfo: {
      flex: 1,
      marginRight: 16,
    },
    toggleLabel: {
      fontSize: 15,
      fontFamily: theme.fonts.medium.fontFamily,
      fontWeight: theme.fonts.medium.fontWeight,
      color: theme.colors.textMain,
    },
    toggleDescription: {
      fontSize: 13,
      fontFamily: theme.fonts.regular.fontFamily,
      color: theme.colors.textMuted,
      marginTop: 2,
    },
    saveButton: {
      backgroundColor: theme.colors.primary,
      borderRadius: 12,
      paddingVertical: 14,
      alignItems: 'center',
    },
    generalSaveButton: {
      marginTop: 8,
    },
    saveButtonDisabled: {
      opacity: 0.5,
    },
    saveButtonText: {
      fontSize: 16,
      fontFamily: theme.fonts.medium.fontFamily,
      fontWeight: theme.fonts.medium.fontWeight,
      color: '#fff',
    },
    sectionTitle: {
      fontSize: 17,
      fontFamily: theme.fonts.bold.fontFamily,
      fontWeight: theme.fonts.bold.fontWeight,
      color: theme.colors.textStrong,
      marginBottom: 8,
    },
    sectionDescription: {
      fontSize: 14,
      fontFamily: theme.fonts.regular.fontFamily,
      color: theme.colors.textMuted,
      marginBottom: 16,
      lineHeight: 20,
    },
    divider: {
      height: 1,
      backgroundColor: theme.colors.surface4,
      marginVertical: 24,
    },
    addButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.surface3,
      borderRadius: 12,
      paddingVertical: 12,
      gap: 8,
      marginBottom: 16,
    },
    addButtonText: {
      fontSize: 15,
      fontFamily: theme.fonts.medium.fontFamily,
      fontWeight: theme.fonts.medium.fontWeight,
      color: theme.colors.primary,
    },
    roleItem: {
      backgroundColor: theme.colors.surface3,
      borderRadius: 12,
      padding: 12,
      marginBottom: 8,
    },
    roleHeader: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    roleColorDot: {
      width: 12,
      height: 12,
      borderRadius: 6,
      marginRight: 12,
    },
    roleInfo: {
      flex: 1,
    },
    roleTag: {
      fontSize: 12,
      fontFamily: theme.fonts.mono?.fontFamily || theme.fonts.regular.fontFamily,
      color: theme.colors.textMuted,
    },
    roleName: {
      fontSize: 15,
      fontFamily: theme.fonts.medium.fontFamily,
      fontWeight: theme.fonts.medium.fontWeight,
    },
    roleActions: {
      flexDirection: 'row',
      gap: 8,
    },
    roleActionButton: {
      padding: 8,
    },
    roleTagRow: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    roleTagPrefix: {
      fontSize: 12,
      fontFamily: theme.fonts.mono?.fontFamily || theme.fonts.regular.fontFamily,
      color: theme.colors.textMuted,
    },
    roleTagInput: {
      fontSize: 12,
      fontFamily: theme.fonts.mono?.fontFamily || theme.fonts.regular.fontFamily,
      color: theme.colors.textMuted,
      padding: 0,
      minWidth: 60,
    },
    roleNameInput: {
      fontSize: 15,
      fontFamily: theme.fonts.medium.fontFamily,
      fontWeight: theme.fonts.medium.fontWeight,
      padding: 0,
      marginTop: 2,
    },
    rolePermissionsHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: 8,
      paddingTop: 8,
      borderTopWidth: 1,
      borderTopColor: theme.colors.surface4,
    },
    rolePermissionsLabel: {
      fontSize: 12,
      fontFamily: theme.fonts.regular.fontFamily,
      color: theme.colors.textMuted,
      marginRight: 8,
    },
    rolePermissionsValue: {
      fontSize: 12,
      fontFamily: theme.fonts.regular.fontFamily,
      color: theme.colors.textMain,
      flex: 1,
    },
    permissionsList: {
      marginTop: 8,
      gap: 8,
    },
    permissionItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    permissionCheckbox: {
      width: 20,
      height: 20,
      borderRadius: 4,
      borderWidth: 2,
      borderColor: theme.colors.surface5,
      alignItems: 'center',
      justifyContent: 'center',
    },
    permissionCheckboxChecked: {
      backgroundColor: theme.colors.primary,
      borderColor: theme.colors.primary,
    },
    permissionLabel: {
      fontSize: 14,
      fontFamily: theme.fonts.regular.fontFamily,
      color: theme.colors.textMain,
    },
    roleSavingIndicator: {
      position: 'absolute',
      top: 8,
      right: 8,
    },
    emptyState: {
      alignItems: 'center',
      paddingVertical: 48,
    },
    emptyStateText: {
      fontSize: 17,
      fontFamily: theme.fonts.medium.fontFamily,
      fontWeight: theme.fonts.medium.fontWeight,
      color: theme.colors.textMain,
      marginTop: 16,
    },
    emptyStateDescription: {
      fontSize: 14,
      fontFamily: theme.fonts.regular.fontFamily,
      color: theme.colors.textMuted,
      marginTop: 8,
      textAlign: 'center',
    },
    emojiItem: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: theme.colors.surface3,
      borderRadius: 12,
      padding: 12,
      marginBottom: 8,
    },
    emojiImage: {
      width: 32,
      height: 32,
      borderRadius: 4,
    },
    emojiName: {
      flex: 1,
      fontSize: 14,
      fontFamily: theme.fonts.mono?.fontFamily || theme.fonts.regular.fontFamily,
      color: theme.colors.textMain,
      marginLeft: 12,
    },
    emojiDelete: {
      padding: 8,
    },
    stickerItem: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: theme.colors.surface3,
      borderRadius: 12,
      padding: 12,
      marginBottom: 8,
    },
    stickerImage: {
      width: 64,
      height: 64,
      borderRadius: 8,
    },
    stickerName: {
      flex: 1,
      fontSize: 14,
      fontFamily: theme.fonts.mono?.fontFamily || theme.fonts.regular.fontFamily,
      color: theme.colors.textMain,
      marginLeft: 12,
    },
    stickerDelete: {
      padding: 8,
    },
    // Emoji/sticker editing styles
    addButtonDisabled: {
      opacity: 0.5,
    },
    emojiNameContainer: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      marginLeft: 12,
    },
    emojiEditContainer: {
      flex: 1,
      marginLeft: 12,
    },
    emojiEditInput: {
      fontSize: 14,
      fontFamily: theme.fonts.mono?.fontFamily || theme.fonts.regular.fontFamily,
      color: theme.colors.textMain,
      backgroundColor: theme.colors.surface4,
      borderRadius: 6,
      paddingHorizontal: 8,
      paddingVertical: 4,
    },
    stickerNameContainer: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      marginLeft: 12,
    },
    stickerEditContainer: {
      flex: 1,
      marginLeft: 12,
    },
    stickerEditInput: {
      fontSize: 14,
      fontFamily: theme.fonts.mono?.fontFamily || theme.fonts.regular.fontFamily,
      color: theme.colors.textMain,
      backgroundColor: theme.colors.surface4,
      borderRadius: 6,
      paddingHorizontal: 8,
      paddingVertical: 4,
    },
    generateButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.primary,
      borderRadius: 12,
      paddingVertical: 14,
      gap: 8,
    },
    generateButtonText: {
      fontSize: 16,
      fontFamily: theme.fonts.medium.fontFamily,
      fontWeight: theme.fonts.medium.fontWeight,
      color: '#fff',
    },
    inviteLinkContainer: {
      marginTop: 8,
    },
    inviteLinkBox: {
      backgroundColor: theme.colors.surface3,
      borderRadius: 12,
      padding: 16,
    },
    inviteLinkText: {
      fontSize: 14,
      fontFamily: theme.fonts.mono?.fontFamily || theme.fonts.regular.fontFamily,
      color: theme.colors.textMain,
    },
    inviteLinkActions: {
      flexDirection: 'row',
      marginTop: 12,
      gap: 12,
    },
    inviteLinkButton: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.surface3,
      borderRadius: 12,
      paddingVertical: 12,
      gap: 6,
    },
    inviteLinkButtonText: {
      fontSize: 14,
      fontFamily: theme.fonts.medium.fontFamily,
      fontWeight: theme.fonts.medium.fontWeight,
      color: theme.colors.primary,
    },
    dangerSection: {
      backgroundColor: theme.colors.danger + '15',
      borderRadius: 12,
      padding: 16,
    },
    dangerTitle: {
      fontSize: 17,
      fontFamily: theme.fonts.bold.fontFamily,
      fontWeight: theme.fonts.bold.fontWeight,
      color: theme.colors.textStrong,
      marginBottom: 8,
    },
    dangerDescription: {
      fontSize: 14,
      fontFamily: theme.fonts.regular.fontFamily,
      color: theme.colors.textMuted,
      marginBottom: 16,
      lineHeight: 20,
    },
    dangerButton: {
      backgroundColor: theme.colors.danger,
      borderRadius: 12,
      paddingVertical: 14,
      alignItems: 'center',
    },
    dangerButtonOutline: {
      backgroundColor: 'transparent',
      borderWidth: 1,
      borderColor: theme.colors.danger,
    },
    dangerButtonText: {
      fontSize: 16,
      fontFamily: theme.fonts.medium.fontFamily,
      fontWeight: theme.fonts.medium.fontWeight,
      color: '#fff',
    },
    dangerButtonOutlineText: {
      fontSize: 16,
      fontFamily: theme.fonts.medium.fontFamily,
      fontWeight: theme.fonts.medium.fontWeight,
      color: theme.colors.danger,
    },
    // Member styles
    memberItem: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: theme.colors.surface3,
      borderRadius: 12,
      padding: 12,
      marginBottom: 8,
    },
    memberAvatar: {
      marginRight: 12,
    },
    memberAvatarImage: {
      width: 44,
      height: 44,
      borderRadius: 22,
    },
    memberAvatarPlaceholder: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: theme.colors.surface5,
      alignItems: 'center',
      justifyContent: 'center',
    },
    memberAvatarText: {
      fontSize: 18,
      fontFamily: theme.fonts.bold.fontFamily,
      fontWeight: theme.fonts.bold.fontWeight,
      color: theme.colors.textMain,
    },
    memberInfo: {
      flex: 1,
    },
    memberName: {
      fontSize: 15,
      fontFamily: theme.fonts.medium.fontFamily,
      fontWeight: theme.fonts.medium.fontWeight,
      color: theme.colors.textMain,
    },
    memberAddress: {
      fontSize: 12,
      fontFamily: theme.fonts.mono?.fontFamily || theme.fonts.regular.fontFamily,
      color: theme.colors.textMuted,
      marginTop: 2,
    },
    memberRolesRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
      marginTop: 6,
    },
    memberRoleBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 10,
      gap: 4,
    },
    memberRoleDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
    },
    memberRoleText: {
      fontSize: 11,
      fontFamily: theme.fonts.medium.fontFamily,
      fontWeight: theme.fonts.medium.fontWeight,
    },
    kickedBadge: {
      backgroundColor: theme.colors.danger + '20',
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 6,
    },
    kickedBadgeText: {
      fontSize: 11,
      fontFamily: theme.fonts.medium.fontFamily,
      fontWeight: theme.fonts.medium.fontWeight,
      color: theme.colors.danger,
    },
    kickButton: {
      backgroundColor: theme.colors.danger + '20',
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 6,
    },
    kickButtonText: {
      fontSize: 12,
      fontFamily: theme.fonts.medium.fontFamily,
      fontWeight: theme.fonts.medium.fontWeight,
      color: theme.colors.danger,
    },
  });
