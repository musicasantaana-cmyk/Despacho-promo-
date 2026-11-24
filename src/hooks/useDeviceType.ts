import { useEffect, useState } from 'react';

export type DeviceType = 'mobile' | 'tablet' | 'desktop';
export type DeviceOrientation = 'portrait' | 'landscape';

export interface DeviceInfo {
  deviceType: DeviceType;
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  isTouchDevice: boolean;
  orientation: DeviceOrientation;
  viewportWidth: number;
  viewportHeight: number;
  deviceLabel: 'Celular' | 'Tablet' | 'Escritorio';
}

function classifyDevice(): DeviceInfo {
  if (typeof window === 'undefined') {
    return {
      deviceType: 'desktop',
      isMobile: false,
      isTablet: false,
      isDesktop: true,
      isTouchDevice: false,
      orientation: 'landscape',
      viewportWidth: 1440,
      viewportHeight: 900,
      deviceLabel: 'Escritorio',
    };
  }

  const width = window.innerWidth;
  const height = window.innerHeight;
  const minSide = Math.min(width, height);
  const orientation: DeviceOrientation = height >= width ? 'portrait' : 'landscape';

  const ua = typeof navigator !== 'undefined' ? navigator.userAgent || '' : '';
  const maxTouchPoints = typeof navigator !== 'undefined' ? navigator.maxTouchPoints || 0 : 0;
  const hasCoarsePointer =
    typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
  const hasTouch = hasCoarsePointer || maxTouchPoints > 0;

  const isPhoneUA = /Android.*Mobile|iPhone|iPod|Windows Phone|BlackBerry|Mobile Safari/i.test(ua);
  const isTabletUA =
    /iPad|Tablet|PlayBook|Silk/i.test(ua) ||
    (/Android/i.test(ua) && !/Mobile/i.test(ua)) ||
    (/Macintosh/i.test(ua) && maxTouchPoints > 1);

  let deviceType: DeviceType = 'desktop';

  if (width < 768 || (isPhoneUA && minSide < 600)) {
    deviceType = 'mobile';
  } else if (
    width < 1024 ||
    isTabletUA ||
    (hasTouch && width <= 1366 && minSide >= 600)
  ) {
    deviceType = 'tablet';
  } else {
    deviceType = 'desktop';
  }

  const deviceLabel: DeviceInfo['deviceLabel'] =
    deviceType === 'mobile' ? 'Celular' : deviceType === 'tablet' ? 'Tablet' : 'Escritorio';

  return {
    deviceType,
    isMobile: deviceType === 'mobile',
    isTablet: deviceType === 'tablet',
    isDesktop: deviceType === 'desktop',
    isTouchDevice: deviceType === 'mobile' || deviceType === 'tablet',
    orientation,
    viewportWidth: width,
    viewportHeight: height,
    deviceLabel,
  };
}

export function detectDeviceSnapshot(): DeviceInfo {
  return classifyDevice();
}

export function useDeviceType(): DeviceInfo {
  const [device, setDevice] = useState<DeviceInfo>(() => classifyDevice());

  useEffect(() => {
    const syncDevice = () => {
      const next = classifyDevice();
      if (typeof document !== 'undefined') {
        document.documentElement.dataset.device = next.deviceType;
        document.documentElement.dataset.orientation = next.orientation;
      }
      setDevice(prev => {
        if (
          prev.deviceType === next.deviceType &&
          prev.orientation === next.orientation &&
          prev.viewportWidth === next.viewportWidth &&
          prev.viewportHeight === next.viewportHeight
        ) {
          return prev;
        }
        return next;
      });
    };

    syncDevice();

    window.addEventListener('resize', syncDevice, { passive: true });
    window.addEventListener('orientationchange', syncDevice, { passive: true });

    return () => {
      window.removeEventListener('resize', syncDevice);
      window.removeEventListener('orientationchange', syncDevice);
    };
  }, []);

  return device;
}
