import { Redirect } from 'expo-router';
import React from 'react';

/** Legacy /apps route — redirects to Profile → Apps. */
export default function AppsRedirect() {
  return <Redirect href="/(tabs)/profile/apps" />;
}
