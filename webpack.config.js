const path = require('path');
const webpack = require('webpack');
const WrapperPlugin = require('wrapper-webpack-plugin');
const UglifyJSPlugin = require('uglifyjs-webpack-plugin');

module.exports = {
  entry: {
    PathPlannerWorker: './workers/PathPlannerWorker.js',
    Dash: './js/Dash.js'
  },
  devtool: 'source-map',
  plugins: [
    new WrapperPlugin({
      test: /PathPlannerWorker.js/,
      header: 'function dash_initPathPlannerWorker() {',
      footer: '} if (typeof(window) === undefined) dash_initPathPlannerWorker();'
    }),
    new UglifyJSPlugin({ sourceMap: true })
  ],
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: '[name].js'
  }
};
