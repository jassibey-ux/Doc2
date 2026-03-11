module.exports = {
  presets: ['module:@react-native/babel-preset'],
  plugins: [
    [
      'module-resolver',
      {
        root: ['./src'],
        extensions: ['.ios.js', '.android.js', '.js', '.ts', '.tsx', '.json'],
        alias: {
          '@': './src',
          '@api': './src/api',
          '@assets': './src/assets',
          '@components': './src/components',
          '@navigation': './src/navigation',
          '@screens': './src/screens',
          '@store': './src/store',
          '@theme': './src/theme',
          '@utils': './src/utils',
          '@types': './src/types',
          '@hooks': './src/hooks',
          '@styles': './src/styles',
          '@context': './src/context',
          '@socket': './src/socket',
        },
      },
    ],
    'react-native-reanimated/plugin',
  ],
};
