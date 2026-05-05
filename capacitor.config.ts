import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.stocknova.app',
  appName: 'stockNova',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  }
};

export default config;