const path = require('path');
const webpack = require('webpack');

module.exports = {
  entry: {
    PathPlannerWorker: './workers/PathPlannerWorker.js',
    Dash: './js/Dash.js'
  },
  devtool: 'eval-source-map',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: '[name].js'
  }
};
