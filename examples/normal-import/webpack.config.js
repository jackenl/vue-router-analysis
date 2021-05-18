const path = require('path');

module.exports = {
  entry: './examples/normal-import/index.js',
  output: {
    path: path.resolve(__dirname, 'dist'),
    clean: true,
    library: {
      type: 'umd',
    },
  },
  mode: 'production',
  optimization: {
    minimize: false,
  },
};
