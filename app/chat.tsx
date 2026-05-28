import { Redirect } from 'expo-router';
import React from 'react';

/** Legacy /chat route — redirects to the Messages tab. */
export default function Chat() {
  return <Redirect href="/(tabs)/messages" />;
}
