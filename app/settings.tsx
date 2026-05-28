import { Redirect } from 'expo-router';
import React from 'react';

/** Legacy /settings route — redirects to the Profile tab. */
export default function SettingsRedirect() {
  return <Redirect href="/(tabs)/profile" />;
}
