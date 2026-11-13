/* eslint-disable @typescript-eslint/no-var-requires */
const CopyWebpackPlugin = require('copy-webpack-plugin');

module.exports = {
  entry: './src/index.tsx',
  output: {
    filename: 'RemoteControlPlugin.js',
    library: 'RemoteControlPlugin',
    libraryTarget: 'umd',
    publicPath: '/',
    globalObject: 'this',
    clean: true,
  },
  module: {
    rules: [{ test: /\.tsx?$/, use: 'ts-loader', exclude: /node_modules/ }],
  },
  resolve: { extensions: ['.js', '.tsx', '.ts'] },
  plugins: [new CopyWebpackPlugin({ patterns: [{ from: 'manifest.json', to: './' }] })],
  performance: { hints: false },
};
