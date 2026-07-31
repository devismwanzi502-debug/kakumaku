// Path resolution for autocorrect where the Next.js app lives inside frontend/
import '../frontend/styles/globals.css';

import type { AppProps } from 'next/app';

export default function App({ Component, pageProps }: AppProps) {
  return <Component {...pageProps} />;
}