import { Redirect } from 'expo-router';
import React from 'react';

/**
 * Root redirect — sends users into the main tab navigator.
 *
 * Legacy route: the Discord-style sliding layout that used to live here has
 * been replaced by the (tabs) group. Deep links to `/` land on the Messages
 * tab.
 */
export default function Index() {
  return <Redirect href="/(tabs)/messages" />;
}
