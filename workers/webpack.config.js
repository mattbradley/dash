const path = require('path');
const webpack = require('webpack');

module.exports = {
  entry: {
    PathPlannerWorker: './src/PathPlannerWorker.js'
  },
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: '[name].js'
  },
  //plugins: [
    //new webpack.ProvidePlugin({
      //THREE: path.resolve(__dirname, '../js/vendor/three.js')
    //})
  //],
  module: {
    rules: [{
      test: /js\/Utils.js$/,
      use: ['script-loader']
    },
    {
      test: /js\/vendor\/three.js$/,
      use: ['script-loader']
    }]
  }
};
