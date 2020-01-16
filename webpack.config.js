const path = require('path');
const webpack = require('webpack');
const WrapperPlugin = require('wrapper-webpack-plugin');

module.exports = {
  entry: {
    PathPlannerWorker: './workers/PathPlannerWorker.js',
    Dash: './js/Dash.js'
  },
  devtool: 'eval-source-map',
  plugins: [
    new WrapperPlugin({
      test: /PathPlannerWorker.js/,
      header: 'function dash_initPathPlannerWorker() {',
      footer: '} if (typeof(window) === undefined) dash_initPathPlannerWorker();'
    })
  ],
  performance: {
    hints: 'warning',
    maxEntrypointSize: 5000000,
    maxAssetSize: 5000000
  },
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: '[name].js'
  },
  mode: 'development'
};
