const path = require('path');

module.exports = {
  entry: {
    main: './src/main/main.ts',
    preload: './src/main/preload.ts'
  },
  target: 'electron-main',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: '[name].js'
  },
  resolve: {
    extensions: ['.ts', '.js'],
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@/main': path.resolve(__dirname, 'src/main'),
      '@/renderer': path.resolve(__dirname, 'src/renderer')
    }
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: {
          loader: 'ts-loader',
          options: {
            configFile: 'tsconfig.main.json'
          }
        },
        exclude: /node_modules/
      }
    ]
  },
  node: {
    __dirname: false,
    __filename: false
  },
  externals: {
    'better-sqlite3': 'commonjs better-sqlite3'
  }
};