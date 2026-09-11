import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.cronache.ignoto',
  appName: 'Cronache dell Ignoto',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  }
};

default config;
