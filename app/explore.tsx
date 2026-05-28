import { Redirect } from 'expo-router';
import React from 'react';

/** Legacy /explore route — redirects to the Explore tab. */
export default function ExploreRedirect() {
  return <Redirect href="/(tabs)/explore" />;
}
