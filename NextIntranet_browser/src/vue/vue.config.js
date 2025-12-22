const { defineConfig } = require('@vue/cli-service')
module.exports = defineConfig({
  transpileDependencies: true,
  publicPath: './', // Nastaví relativní cesty
  pluginOptions: {
  },
})
