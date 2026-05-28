import { Redirect } from 'expo-router';
import React from 'react';

/** Legacy /wallet route — redirects to the Wallet tab. */
export default function WalletRedirect() {
  return <Redirect href="/(tabs)/wallet" />;
}
