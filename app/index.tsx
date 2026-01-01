import type { DisplayChannel, DisplayServer, MemberMap, MessageInputHandle, MessageUserInfo, MessagesListHandle } from '@/components/Chat';
import {
  ChannelHeader,
  ChannelsSidebar,
  DirectMessagesList,
  DMChatHeader,
  MessageInput,
  MessagesList,
  ServerSidebar,
  toDisplayChannel,
  toDisplayMessage,
  toDisplayServer,
  UserPanel,
} from '@/components/Chat';
import UserProfileModal from '@/components/UserProfileModal';
import InviteModal from '@/components/InviteModal';
import MiniAppsModal from '@/components/MiniAppsModal';
import BrowserModal from '@/components/BrowserModal';
import NewConversationModal from '@/components/NewConversationModal';
import ProfileModal from '@/components/ProfileModal';
import SocialFeedModal from '@/components/SocialFeedModal';
import SpaceModal from '@/components/SpaceModal';
import SpaceSettingsModal from '@/components/SpaceSettingsModal';
import { IconSymbol } from '@/components/ui/IconSymbol';
import WalletModal from '@/components/WalletModal';
import { useAuth, useWebSocket } from '@/context';
import { useStorageAdapter } from '@/context/StorageContext';
import { useChannels } from '@/hooks/chat/useChannels';
import { useConversation } from '@/hooks/chat/useConversations';
import { useUnifiedConversations } from '@/hooks/chat/useUnifiedConversations';
import { FarcasterDirectMessageView } from '@/components/Chat/FarcasterDirectMessageView';
import { flattenMessages, useMessages } from '@/hooks/chat/useMessages';
import { toRecipientInfo, useHasEncryptionSession, useRecipientRegistration } from '@/hooks/chat/useRecipientRegistration';
import { useSendDirectMessage } from '@/hooks/chat/useSendDirectMessage';
import { useSendEmbedMessage } from '@/hooks/chat/useSendEmbedMessage';
import { useSendSpaceMessage } from '@/hooks/chat/useSendSpaceMessage';
import { useAddSpaceReaction, useRemoveSpaceReaction } from '@/hooks/chat/useSpaceReactions';
import { useSpace, useSpaceMembers, useSpaces } from '@/hooks/chat/useSpaces';
import { getSpaceKey } from '@/services/config/spaceStorage';
import { pickImage, type ProcessedAttachment } from '@/services/media/imageAttachment';
import { loadNavigationState, saveNavigationState } from '@/services/offline/storage';
import { useTheme } from '@/theme';
import type { Group, Message } from '@quilibrium/quorum-shared';
import { logger } from '@quilibrium/quorum-shared';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Dimensions, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';


const { width: SCREEN_WIDTH } = Dimensions.get('window');
const SERVER_SIDEBAR_WIDTH = 64;
const CHANNELS_SIDEBAR_WIDTH = 240;
const EDGE_GESTURE_WIDTH = 32;

export default function HomeScreen() {
  logger.log("in index root");
  // Auth routing is handled by AuthRouter in _layout.tsx
  // This component only renders when user is authenticated

  // Load saved navigation state on mount
  const savedNavState = useRef(loadNavigationState());

  // Refs for scrolling and focusing after send
  const spaceMessagesListRef = useRef<MessagesListHandle>(null);
  const dmMessagesListRef = useRef<MessagesListHandle>(null);
  const spaceMessageInputRef = useRef<MessageInputHandle>(null);
  const dmMessageInputRef = useRef<MessageInputHandle>(null);
  const [selectedSpaceId, setSelectedSpaceId] = useState<string | undefined>(
    savedNavState.current?.selectedSpaceId
  );
  const [selectedChannelId, setSelectedChannelId] = useState<string | undefined>(
    savedNavState.current?.selectedChannelId
  );
  const [selectedConversationId, setSelectedConversationId] = useState<string | undefined>(
    savedNavState.current?.selectedConversationId
  );
  const [isDMsSelected, setIsDMsSelected] = useState(
    savedNavState.current?.isDMsSelected ?? true
  ); // Start with DMs selected if no saved state
  const [messageText, setMessageText] = useState('');
  const [pendingAttachment, setPendingAttachment] = useState<ProcessedAttachment | null>(null);
  const [walletModalVisible, setWalletModalVisible] = useState(false);
  const [profileModalVisible, setProfileModalVisible] = useState(false);
  const [userProfileModalVisible, setUserProfileModalVisible] = useState(false);
  const [selectedUserProfile, setSelectedUserProfile] = useState<MessageUserInfo | null>(null);
  const [miniAppsModalVisible, setMiniAppsModalVisible] = useState(false);
  const [selectedMiniApp, setSelectedMiniApp] = useState<{ url: string; isQNative: boolean; timestamp: number } | null>(null);
  const [socialFeedVisible, setSocialFeedVisible] = useState(false);
  const [feedInitialThread, setFeedInitialThread] = useState<{ username: string; castHashPrefix: string } | undefined>(undefined);
  const [sidebarsVisible, setSidebarsVisible] = useState(true);
  const [newConversationModalVisible, setNewConversationModalVisible] = useState(false);
  const [spaceModalVisible, setSpaceModalVisible] = useState(false);
  const [inviteModalVisible, setInviteModalVisible] = useState(false);
  const [spaceSettingsModalVisible, setSpaceSettingsModalVisible] = useState(false);

  const { theme, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = createStyles(theme, isDark, insets);
  const { user, farcasterAuthToken } = useAuth();
  const storage = useStorageAdapter();
  const { kickedFromSpaceId, clearKickedFromSpace } = useWebSocket();

  // Handle kick navigation - when user is kicked from a space, navigate away
  useEffect(() => {
    if (kickedFromSpaceId && kickedFromSpaceId === selectedSpaceId) {
      logger.log('[index] Kicked from current space, navigating to DMs');
      setSelectedSpaceId(undefined);
      setSelectedChannelId(undefined);
      setIsDMsSelected(true);
      clearKickedFromSpace();
    } else if (kickedFromSpaceId) {
      // Kicked from a different space, just clear the state
      clearKickedFromSpace();
    }
  }, [kickedFromSpaceId, selectedSpaceId, clearKickedFromSpace]);

  // Data hooks
  const { data: spacesData, isLoading: spacesLoading } = useSpaces();
  // Use unified conversations (E2EE + Farcaster)
  const {
    conversations,
    isLoading: conversationsLoading,
    isRefreshing: conversationsRefetching,
    error: conversationsError,
    refetch: refetchConversations,
  } = useUnifiedConversations();

  // Get selected conversation data - first check unified list, then fall back to storage
  const selectedConversationFromList = useMemo(() => {
    if (!selectedConversationId) return undefined;
    return conversations.find(c => c.conversationId === selectedConversationId);
  }, [conversations, selectedConversationId]);

  // For E2EE conversations not in list, fetch from storage
  const isFarcasterConversation = selectedConversationId?.startsWith('farcaster:');
  const { data: selectedConversationFromStorage } = useConversation(selectedConversationId, {
    enabled: !!selectedConversationId && !isFarcasterConversation && !selectedConversationFromList,
  });

  // Use unified conversation data (prefer list, fall back to storage for E2EE)
  const selectedConversationData = selectedConversationFromList ?? selectedConversationFromStorage;

  // Extract recipient address from conversation ID (format: address/address for E2EE)
  const recipientAddress = useMemo(() => {
    if (!selectedConversationId || isFarcasterConversation) return undefined;
    return selectedConversationId.split('/')[0];
  }, [selectedConversationId, isFarcasterConversation]);

  // DM messages for selected conversation
  const {
    data: dmMessagesPages,
    isLoading: dmMessagesLoading,
    isRefetching: dmMessagesRefetching,
    isFetchingNextPage: dmMessagesFetchingMore,
    error: dmMessagesError,
    refetch: refetchDmMessages,
    fetchNextPage: fetchMoreDmMessages,
    hasNextPage: hasMoreDmMessages,
  } = useMessages({
    spaceId: recipientAddress,
    channelId: recipientAddress,
    enabled: !!recipientAddress,
  });

  // Send DM mutation
  const sendDirectMessageMutation = useSendDirectMessage();

  // Encryption: fetch recipient registration for X3DH key exchange
  const { data: recipientRegistration, isLoading: registrationLoading, error: registrationError } = useRecipientRegistration(recipientAddress);
  const hasExistingSession = useHasEncryptionSession(selectedConversationId);

  // Log registration status for debugging
  React.useEffect(() => {
    if (recipientAddress) {
      logger.log('[Registration] Status:', {
        recipientAddress,
        isLoading: registrationLoading,
        hasData: !!recipientRegistration,
        error: registrationError?.message,
      });
    }
  }, [recipientAddress, registrationLoading, recipientRegistration, registrationError]);

  const { data: spaceData } = useSpace(selectedSpaceId, { enabled: !!selectedSpaceId });
  const { data: membersData } = useSpaceMembers(selectedSpaceId, { enabled: !!selectedSpaceId });
  const { data: channelsData } = useChannels(selectedSpaceId, { enabled: !!selectedSpaceId });
  const {
    data: messagesPages,
    isLoading: messagesLoading,
    isRefetching: messagesRefetching,
    isFetchingNextPage: messagesFetchingMore,
    error: messagesError,
    refetch: refetchMessages,
    fetchNextPage: fetchMoreMessages,
    hasNextPage: hasMoreMessages,
  } = useMessages({
    spaceId: selectedSpaceId,
    channelId: selectedChannelId,
    enabled: !!selectedSpaceId && !!selectedChannelId,
  });
  const sendMessageMutation = useSendSpaceMessage();
  const sendEmbedMutation = useSendEmbedMessage();
  const addReactionMutation = useAddSpaceReaction();
  const removeReactionMutation = useRemoveSpaceReaction();

  // Determine if user is space owner (only owners can generate invite links)
  const isSpaceOwner = useMemo(() => {
    if (!selectedSpaceId) return false;
    const ownerKey = getSpaceKey(selectedSpaceId, 'owner');
    return !!ownerKey;
  }, [selectedSpaceId]);

  // Refresh handler
  const handleRefreshMessages = useCallback(() => {
    refetchMessages();
  }, [refetchMessages]);

  // Load more handler
  const handleLoadMoreMessages = useCallback(() => {
    if (hasMoreMessages) {
      fetchMoreMessages();
    }
  }, [fetchMoreMessages, hasMoreMessages]);

  // Build member lookup map
  const memberMap = useMemo<MemberMap>(() => {
    if (!membersData) return {};
    return membersData.reduce((acc: MemberMap, member: MemberMap[string]) => {
      acc[member.address] = member;
      return acc;
    }, {} as MemberMap);
  }, [membersData]);

  // Convert API data to display format
  const servers = useMemo((): DisplayServer[] => {
    if (!spacesData) return [];
    return spacesData.map(toDisplayServer);
  }, [spacesData]);

  const channels = useMemo((): DisplayChannel[] => {
    if (!spaceData) return [];
    return spaceData.groups.flatMap((g: Group) => g.channels).map(toDisplayChannel);
  }, [spaceData]);

  // Auto-select default channel when space is loaded
  useEffect(() => {
    if (spaceData && selectedSpaceId && !selectedChannelId) {
      // Use the space's defaultChannelId, or fall back to first channel
      const defaultChannel = spaceData.defaultChannelId || channels[0]?.id;
      if (defaultChannel) {
        logger.log('[index] Auto-selecting default channel:', defaultChannel);
        setSelectedChannelId(defaultChannel);
      }
    }
  }, [spaceData, selectedSpaceId, selectedChannelId, channels]);

  // Save navigation state whenever it changes
  useEffect(() => {
    saveNavigationState({
      selectedSpaceId,
      selectedChannelId,
      selectedConversationId,
      isDMsSelected,
    });
  }, [selectedSpaceId, selectedChannelId, selectedConversationId, isDMsSelected]);

  const messages = useMemo(() => {
    if (!messagesPages) return [];
    const allMessages = flattenMessages(messagesPages.pages);
    return allMessages.map((msg: Message) => toDisplayMessage(msg, memberMap, user?.address));
  }, [messagesPages, memberMap, user?.address]);

  // Get selected items - use first item as default if nothing selected
  const selectedServer = selectedSpaceId ?? servers[0]?.id;
  const selectedChannel = selectedChannelId ?? channels[0]?.id;

  // Animation values using Reanimated shared values
  const translateX = useSharedValue(0);
  const isVisible = useSharedValue(1);

  const CLOSED_POSITION = -(SERVER_SIDEBAR_WIDTH + CHANNELS_SIDEBAR_WIDTH);
  const springConfig = { damping: 28, stiffness: 300, overshootClamping: true };

  const showSidebars = useCallback(() => {
    setSidebarsVisible(true);
    isVisible.value = 1;
    translateX.value = withSpring(0, springConfig);
  }, [translateX, isVisible]);

  const hideSidebars = useCallback(() => {
    setSidebarsVisible(false);
    isVisible.value = 0;
    translateX.value = withSpring(CLOSED_POSITION, springConfig);
  }, [translateX, isVisible]);

  // Animated styles for the sidebar and chat area
  const sidebarAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const chatAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  // Pan gesture for swipe navigation
  const panGesture = Gesture.Pan()
    .activeOffsetX([-10, 10])
    .onUpdate((event) => {
      const currentVisible = isVisible.value === 1;
      if (currentVisible) {
        // Swiping left to close
        const newX = Math.max(CLOSED_POSITION, Math.min(0, event.translationX));
        translateX.value = newX;
      } else {
        // Swiping right to open - only from left edge
        if (event.x < EDGE_GESTURE_WIDTH) {
          const newX = Math.max(CLOSED_POSITION, Math.min(0, CLOSED_POSITION + event.translationX));
          translateX.value = newX;
        }
      }
    })
    .onEnd((event) => {
      const currentVisible = isVisible.value === 1;
      const threshold = (SERVER_SIDEBAR_WIDTH + CHANNELS_SIDEBAR_WIDTH) / 2;

      if (currentVisible) {
        if (event.translationX < -threshold || event.velocityX < -500) {
          runOnJS(hideSidebars)();
        } else {
          translateX.value = withSpring(0, springConfig);
        }
      } else {
        if (event.translationX > threshold || event.velocityX > 500) {
          runOnJS(showSidebars)();
        } else {
          translateX.value = withSpring(CLOSED_POSITION, springConfig);
        }
      }
    });

  const handleSendMessage = useCallback(() => {
    logger.log('[index] handleSendMessage called', {
      messageText: messageText.trim(),
      selectedSpaceId,
      selectedChannelId,
      hasPendingAttachment: !!pendingAttachment,
    });

    if (!selectedSpaceId || !selectedChannelId) {
      logger.log('[index] handleSendMessage - missing space/channel, returning');
      return;
    }

    // Need either text or an attachment to send
    if (!messageText.trim() && !pendingAttachment) {
      logger.log('[index] handleSendMessage - no content to send, returning');
      return;
    }

    // Send text message if there's text
    if (messageText.trim()) {
      logger.log('[index] handleSendMessage - sending text message');
      sendMessageMutation.mutate({
        spaceId: selectedSpaceId,
        channelId: selectedChannelId,
        text: messageText.trim(),
      });
      setMessageText('');
    }

    // Send embed message if there's an attachment
    if (pendingAttachment) {
      logger.log('[index] handleSendMessage - sending embed message');
      sendEmbedMutation.mutate({
        spaceId: selectedSpaceId,
        channelId: selectedChannelId,
        imageUrl: pendingAttachment.imageUrl,
        thumbnailUrl: pendingAttachment.thumbnailUrl,
        width: pendingAttachment.width,
        height: pendingAttachment.height,
        isLargeGif: pendingAttachment.isLargeGif,
      });
      setPendingAttachment(null);
    }

    // Scroll to bottom and refocus input after sending
    setTimeout(() => {
      spaceMessagesListRef.current?.scrollToEnd(true);
      spaceMessageInputRef.current?.focus();
    }, 100);
  }, [messageText, selectedSpaceId, selectedChannelId, sendMessageMutation, sendEmbedMutation, pendingAttachment]);

  // Handle attachment button press
  const handleAttachmentPress = useCallback(async () => {
    logger.log('[index] handleAttachmentPress');
    const result = await pickImage('library');

    if (result.cancelled) {
      return;
    }

    if (!result.success) {
      if (result.error) {
        Alert.alert('Error', result.error);
      }
      return;
    }

    if (result.attachment) {
      logger.log('[index] Image picked:', {
        width: result.attachment.width,
        height: result.attachment.height,
        isLargeGif: result.attachment.isLargeGif,
      });
      setPendingAttachment(result.attachment);
    }
  }, []);

  // Clear pending attachment
  const handleClearAttachment = useCallback(() => {
    setPendingAttachment(null);
  }, []);

  const handleSelectServer = useCallback((id: string) => {
    setSelectedSpaceId(id);
    setSelectedChannelId(undefined); // Reset channel when server changes
    setIsDMsSelected(false); // Switch to server view
    setSelectedConversationId(undefined); // Clear selected conversation
  }, []);

  const handleSelectDMs = useCallback(() => {
    setIsDMsSelected(true);
    setSelectedSpaceId(undefined); // Clear server selection
    setSelectedChannelId(undefined);
  }, []);

  const handleSelectChannel = useCallback((id: string) => {
    setSelectedChannelId(id);
  }, []);

  const handleSelectConversation = useCallback((id: string) => {
    setSelectedConversationId(id);
  }, []);

  const handleRefreshConversations = useCallback(() => {
    refetchConversations();
  }, [refetchConversations]);

  const handleNewConversation = useCallback(() => {
    setNewConversationModalVisible(true);
  }, []);

  const handleAddSpace = useCallback(() => {
    setSpaceModalVisible(true);
  }, []);

  const handleSpaceCreated = useCallback((spaceId: string) => {
    setSelectedSpaceId(spaceId);
    setIsDMsSelected(false);
  }, []);

  const handleSpaceJoined = useCallback((spaceId: string) => {
    setSelectedSpaceId(spaceId);
    setIsDMsSelected(false);
  }, []);

  const handleOpenInviteModal = useCallback(() => {
    if (selectedSpaceId) {
      setInviteModalVisible(true);
    }
  }, [selectedSpaceId]);

  const handleOpenSpaceSettings = useCallback(() => {
    if (selectedSpaceId) {
      setSpaceSettingsModalVisible(true);
    }
  }, [selectedSpaceId]);

  const handleUserPress = useCallback((userInfo: MessageUserInfo) => {
    setSelectedUserProfile(userInfo);
    setUserProfileModalVisible(true);
  }, []);

  const handleStartDM = useCallback(async (userId: string) => {
    // Check if conversation already exists
    const existingConversation = conversations.find(
      c => c.address?.toLowerCase() === userId.toLowerCase()
    );

    if (existingConversation) {
      // Navigate to existing conversation
      setIsDMsSelected(true);
      setSelectedConversationId(existingConversation.conversationId);
    } else {
      // Create new conversation
      const conversationId = `${userId}/${userId}`;
      try {
        await storage.saveConversation({
          conversationId,
          address: userId,
          type: 'direct',
          timestamp: Date.now(),
          displayName: '',
          icon: '',
        });
        refetchConversations();
        setIsDMsSelected(true);
        setSelectedConversationId(conversationId);
      } catch (err) {
        logger.error('[handleStartDM] Failed to create conversation:', err);
      }
    }
  }, [conversations, storage, refetchConversations]);

  const handleOpenFarcasterCast = useCallback((username: string, castHashPrefix: string) => {
    setFeedInitialThread({ username, castHashPrefix });
    setSocialFeedVisible(true);
  }, []);

  const handleSpaceDeleted = useCallback(() => {
    setSelectedSpaceId(undefined);
    setSelectedChannelId(undefined);
    setIsDMsSelected(true);
  }, []);

  const handleSpaceLeft = useCallback(() => {
    setSelectedSpaceId(undefined);
    setSelectedChannelId(undefined);
    setIsDMsSelected(true);
  }, []);

  const handleJoinSpaceFromLink = useCallback((spaceId: string, channelId: string) => {
    logger.log('[index] Joined space from invite link:', spaceId, channelId);
    setSelectedSpaceId(spaceId);
    setSelectedChannelId(channelId);
    setIsDMsSelected(false);
  }, []);

  const handleAddReaction = useCallback((messageId: string, emoji: string) => {
    if (!selectedSpaceId || !selectedChannelId) return;
    addReactionMutation.mutate({
      spaceId: selectedSpaceId,
      channelId: selectedChannelId,
      messageId,
      emoji,
    });
  }, [selectedSpaceId, selectedChannelId, addReactionMutation]);

  const handleRemoveReaction = useCallback((messageId: string, emoji: string) => {
    if (!selectedSpaceId || !selectedChannelId) return;
    removeReactionMutation.mutate({
      spaceId: selectedSpaceId,
      channelId: selectedChannelId,
      messageId,
      emoji,
    });
  }, [selectedSpaceId, selectedChannelId, removeReactionMutation]);

  const handleConversationCreated = useCallback((conversationId: string) => {
    setSelectedConversationId(conversationId);
    refetchConversations();
  }, [refetchConversations]);

  const handleBackFromConversation = useCallback(() => {
    setSelectedConversationId(undefined);
  }, []);

  const handleSendDirectMessage = useCallback((text: string) => {
    logger.log('[DM] handleSendDirectMessage called:', {
      text,
      selectedConversationId,
      recipientAddress,
      hasExistingSession,
      hasRecipientRegistration: !!recipientRegistration,
    });

    if (!selectedConversationId || !recipientAddress) {
      logger.log('[DM] Missing conversationId or recipientAddress, aborting');
      return;
    }

    // Include recipient info for encryption if available and no existing session
    const recipientInfo = !hasExistingSession && recipientRegistration
      ? toRecipientInfo(recipientRegistration) ?? undefined
      : undefined;

    logger.log('[DM] Calling mutation with recipientInfo:', !!recipientInfo);

    sendDirectMessageMutation.mutate({
      conversationId: selectedConversationId,
      recipientAddress,
      text,
      recipientInfo,
    });

    // Scroll to bottom and refocus input after sending
    setTimeout(() => {
      dmMessagesListRef.current?.scrollToEnd(true);
      dmMessageInputRef.current?.focus();
    }, 100);
  }, [selectedConversationId, recipientAddress, sendDirectMessageMutation, hasExistingSession, recipientRegistration]);

  const handleRefreshDmMessages = useCallback(() => {
    refetchDmMessages();
  }, [refetchDmMessages]);

  const handleLoadMoreDmMessages = useCallback(() => {
    if (hasMoreDmMessages) {
      fetchMoreDmMessages();
    }
  }, [hasMoreDmMessages, fetchMoreDmMessages]);

  // Convert DM messages to display format
  const dmMessages = useMemo(() => {
    if (!dmMessagesPages) return [];
    const allMessages = flattenMessages(dmMessagesPages.pages);
    // For DMs, create a simple member map with recipient info
    const dmMemberMap: MemberMap = {};
    if (selectedConversationData) {
      dmMemberMap[selectedConversationData.address ?? ''] = {
        address: selectedConversationData.address ?? '',
        display_name: selectedConversationData.displayName,
        profile_image: selectedConversationData.icon,
      } as MemberMap[string];
    }
    if (user?.address) {
      dmMemberMap[user.address] = {
        address: user.address,
        display_name: user.displayName || user.username,
        profile_image: user.profileImage,
      } as MemberMap[string];
    }
    return allMessages.map((msg: Message) => toDisplayMessage(msg, dmMemberMap, user?.address));
  }, [dmMessagesPages, selectedConversationData, user]);

  const selectedChannelData = channels.find(c => c.id === selectedChannel);

  // Render content for channels area based on whether DMs or a server is selected
  const renderChannelsArea = () => {
    if (isDMsSelected) {
      return (
        <View style={styles.dmSidebarContainer}>
          <DirectMessagesList
            conversations={conversations}
            selectedConversation={selectedConversationId}
            onSelectConversation={handleSelectConversation}
            onNewConversation={handleNewConversation}
            isLoading={conversationsLoading}
            isRefreshing={conversationsRefetching}
            error={conversationsError ?? undefined}
            onRefresh={handleRefreshConversations}
            theme={theme}
            currentUserAddress={user?.address}
          />
        </View>
      );
    }
    return (
      <ChannelsSidebar
        serverName={servers.find(s => s.id === selectedServer)?.name ?? 'Server'}
        channels={channels}
        selectedChannel={selectedChannel}
        onSelectChannel={handleSelectChannel}
        onOpenSettings={handleOpenSpaceSettings}
        theme={theme}
      />
    );
  };

  // Render content for chat area based on selection
  const renderChatArea = () => {
    // DM conversation view
    if (isDMsSelected) {
      if (selectedConversationId && selectedConversationData) {
        // Farcaster direct cast conversation (not E2EE)
        if (isFarcasterConversation) {
          return (
            <View style={styles.chatArea}>
              <FarcasterDirectMessageView
                conversation={selectedConversationData}
                onBack={showSidebars}
                theme={theme}
                onOpenFarcasterCast={handleOpenFarcasterCast}
              />
            </View>
          );
        }

        // E2EE Quorum conversation
        return (
          <KeyboardAvoidingView
            style={styles.chatArea}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          >
            <DMChatHeader
              conversation={selectedConversationData}
              sidebarsVisible={sidebarsVisible}
              onShowSidebars={showSidebars}
              theme={theme}
            />

            <MessagesList
              ref={dmMessagesListRef}
              messages={dmMessages}
              theme={theme}
              isLoading={dmMessagesLoading}
              isRefreshing={dmMessagesRefetching}
              isLoadingMore={dmMessagesFetchingMore}
              error={dmMessagesError}
              onRefresh={handleRefreshDmMessages}
              onLoadMore={handleLoadMoreDmMessages}
              hasMore={!!hasMoreDmMessages}
              onJoinSpace={handleJoinSpaceFromLink}
              onOpenFarcasterCast={handleOpenFarcasterCast}
              onUserPress={handleUserPress}
            />

            <MessageInput
              ref={dmMessageInputRef}
              value={messageText}
              onChangeText={setMessageText}
              onSend={() => {
                if (messageText.trim() && recipientAddress) {
                  handleSendDirectMessage(messageText.trim());
                  setMessageText('');
                }
              }}
              channelName={selectedConversationData.displayName || selectedConversationData.address?.slice(0, 8) || 'DM'}
              theme={theme}
              isSending={sendDirectMessageMutation.isPending}
            />
          </KeyboardAvoidingView>
        );
      }

      // No conversation selected - show empty state
      return (
        <Pressable
          onPress={sidebarsVisible ? hideSidebars : undefined}
          style={styles.chatArea}
        >
          <View style={styles.emptyChatHeader}>
            {!sidebarsVisible && (
              <TouchableOpacity onPress={showSidebars} style={styles.menuButton}>
                <IconSymbol name="line.3.horizontal" color={theme.colors.textMuted} size={20} />
              </TouchableOpacity>
            )}
            <Text style={styles.emptyChatHeaderText}>Messages</Text>
          </View>
          <View style={styles.emptyChatContent}>
            <IconSymbol name="bubble.left.and.bubble.right" size={48} color={theme.colors.textMuted} />
            <Text style={styles.emptyChatText}>Select a conversation</Text>
          </View>
        </Pressable>
      );
    }

    // Server channel view
    return (
      <KeyboardAvoidingView
        style={styles.chatArea}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <Pressable
          onPress={sidebarsVisible ? hideSidebars : undefined}
          style={styles.chatAreaInner}
        >
          <ChannelHeader
            channelName={selectedChannelData?.name || 'general'}
            sidebarsVisible={sidebarsVisible}
            onShowSidebars={showSidebars}
            onInvite={isSpaceOwner ? handleOpenInviteModal : undefined}
            onOpenSettings={handleOpenSpaceSettings}
            theme={theme}
          />

          <MessagesList
            ref={spaceMessagesListRef}
            messages={messages}
            theme={theme}
            isLoading={messagesLoading}
            isRefreshing={messagesRefetching}
            isLoadingMore={messagesFetchingMore}
            error={messagesError}
            onRefresh={handleRefreshMessages}
            onLoadMore={handleLoadMoreMessages}
            hasMore={!!hasMoreMessages}
            onJoinSpace={handleJoinSpaceFromLink}
            onReaction={handleAddReaction}
            onRemoveReaction={handleRemoveReaction}
            customEmojis={spaceData?.emojis}
            stickers={spaceData?.stickers}
            onOpenFarcasterCast={handleOpenFarcasterCast}
            onUserPress={handleUserPress}
          />

          <MessageInput
            ref={spaceMessageInputRef}
            value={messageText}
            onChangeText={setMessageText}
            onSend={handleSendMessage}
            channelName={selectedChannelData?.name || 'general'}
            theme={theme}
            isSending={sendMessageMutation.isPending || sendEmbedMutation.isPending}
            onAttachmentPress={handleAttachmentPress}
            pendingAttachment={pendingAttachment}
            onClearAttachment={handleClearAttachment}
          />
        </Pressable>
      </KeyboardAvoidingView>
    );
  };

  return (
    <View style={styles.container}>
      <GestureDetector gesture={panGesture}>
        <View style={styles.mainContent}>
          {/* Server Sidebar */}
          <Animated.View style={[styles.serverSidebar, sidebarAnimatedStyle]}>
            <ServerSidebar
              servers={servers}
              selectedServer={selectedServer}
              onSelectServer={handleSelectServer}
              onSelectDMs={handleSelectDMs}
              onAddSpace={handleAddSpace}
              isDMsSelected={isDMsSelected}
              theme={theme}
              isDark={isDark}
              topInset={insets.top}
            />
          </Animated.View>

          {/* Channels/DMs and Chat Area */}
          <Animated.View style={[styles.channelsAndChat, chatAnimatedStyle]}>
            {renderChannelsArea()}
            {renderChatArea()}
          </Animated.View>
        </View>
      </GestureDetector>

      <NewConversationModal
        visible={newConversationModalVisible}
        onClose={() => setNewConversationModalVisible(false)}
        onConversationCreated={handleConversationCreated}
      />

      <SpaceModal
        visible={spaceModalVisible}
        onClose={() => setSpaceModalVisible(false)}
        onSpaceCreated={handleSpaceCreated}
        onSpaceJoined={handleSpaceJoined}
      />

      <InviteModal
        visible={inviteModalVisible}
        onClose={() => setInviteModalVisible(false)}
        spaceId={selectedSpaceId ?? ''}
        spaceName={servers.find(s => s.id === selectedSpaceId)?.name ?? 'Space'}
      />

      {selectedSpaceId && (
        <SpaceSettingsModal
          visible={spaceSettingsModalVisible}
          onClose={() => setSpaceSettingsModalVisible(false)}
          spaceId={selectedSpaceId}
          onSpaceDeleted={handleSpaceDeleted}
          onSpaceLeft={handleSpaceLeft}
        />
      )}

      {/* User Panel */}
      <UserPanel
        userName={user?.displayName || user?.username || 'User'}
        userId={user?.address ? `${user.address}` : ''}
        userAvatar={user?.profileImage ? { uri: user.profileImage } : require('../assets/images/icon.png')}
        socialFeedVisible={socialFeedVisible}
        onToggleSocialFeed={() => setSocialFeedVisible((prev) => !prev)}
        onOpenMiniApps={() => setMiniAppsModalVisible(true)}
        onOpenWallet={() => setWalletModalVisible(true)}
        onOpenProfile={() => setProfileModalVisible(true)}
        theme={theme}
        bottomInset={insets.bottom}
      />

      <WalletModal
        visible={walletModalVisible}
        onClose={() => setWalletModalVisible(false)}
      />

      <ProfileModal
        visible={profileModalVisible}
        onClose={() => setProfileModalVisible(false)}
      />

      <UserProfileModal
        visible={userProfileModalVisible}
        onClose={() => setUserProfileModalVisible(false)}
        user={selectedUserProfile}
        onStartDM={!isDMsSelected ? handleStartDM : undefined}
      />

      <SocialFeedModal
        visible={socialFeedVisible}
        token={farcasterAuthToken ?? undefined}
        onClose={() => {
          setSocialFeedVisible(false);
          setFeedInitialThread(undefined);
        }}
        initialThread={feedInitialThread}
      />

      <MiniAppsModal
        visible={miniAppsModalVisible}
        onClose={() => setMiniAppsModalVisible(false)}
        onOpenMiniApp={(url, isQNative) => setSelectedMiniApp({ url, isQNative, timestamp: Date.now() })}
      />

      <BrowserModal
        visible={selectedMiniApp !== null}
        url={selectedMiniApp?.url ?? ''}
        isQNative={selectedMiniApp?.isQNative ?? false}
        timestamp={selectedMiniApp?.timestamp ?? 0}
        onClose={() => setSelectedMiniApp(null)}
      />
    </View>
  );
}

const createStyles = (theme: any, isDark: boolean, insets: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: isDark ? theme.colors.surface00 : theme.colors.surface1,
  },
  mainContent: {
    flex: 1,
    flexDirection: 'row',
  },
  serverSidebar: {
    // ServerSidebar component handles its own styles
  },
  channelsAndChat: {
    flex: 1,
    flexDirection: 'row',
    paddingTop: insets.top,
  },
  chatArea: {
    flex: 1,
    flexDirection: 'column',
    width: SCREEN_WIDTH,
  },
  chatAreaInner: {
    flex: 1,
    flexDirection: 'column',
  },
  dmContainer: {
    flex: 1,
  },
  dmSidebarContainer: {
    width: CHANNELS_SIDEBAR_WIDTH,
    backgroundColor: theme.colors.surface1,
  },
  emptyChatHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface3,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    width: SCREEN_WIDTH,
  },
  emptyChatHeaderText: {
    color: theme.colors.textMain,
    fontFamily: theme.fonts.medium.fontFamily,
    fontWeight: theme.fonts.medium.fontWeight,
    fontSize: 16,
  },
  menuButton: {
    marginRight: 12,
  },
  emptyChatContent: {
    flex: 1,
    width: SCREEN_WIDTH,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.surface1,
  },
  emptyChatText: {
    marginTop: 16,
    fontSize: 16,
    fontFamily: theme.fonts.regular.fontFamily,
    color: theme.colors.textMuted,
  },
});
