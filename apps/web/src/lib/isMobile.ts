/**
 * Detects if the current device is a mobile device.
 * Uses both screen width and user agent for better detection.
 */
export function isMobileDevice(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  // Check screen width (mobile is typically < 768px)
  const isMobileWidth = window.innerWidth < 768;

  // Check user agent for mobile devices
  const userAgent = window.navigator.userAgent.toLowerCase();
  const isMobileUserAgent = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(userAgent);

  // Consider it mobile if either condition is true
  return isMobileWidth || isMobileUserAgent;
}

