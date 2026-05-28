import { Redirect, useLocalSearchParams } from 'expo-router';
import React from 'react';

/** Legacy /feed route — redirects to the Feed tab, preserving params. */
export default function FeedRedirect() {
  const params = useLocalSearchParams<{ username?: string; castHashPrefix?: string }>();
  const query = new URLSearchParams();
  if (params.username) query.set('username', params.username);
  if (params.castHashPrefix) query.set('castHashPrefix', params.castHashPrefix);
  const q = query.toString();
  const href = q ? `/(tabs)/feed?${q}` : '/(tabs)/feed';
  return <Redirect href={href as any} />;
}
