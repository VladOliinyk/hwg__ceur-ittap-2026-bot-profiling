const { defineConfig } = require('@vue/cli-service')
module.exports = defineConfig({
  transpileDependencies: true,
  publicPath: './',
  chainWebpack: config => {
    config.module
      .rule('svg')
      .resourceQuery({ not: [/raw/] })

    config.module
      .rule('svg-raw')
      .test(/\.svg$/)
      .resourceQuery(/raw/)
      .type('asset/source')
  }
})
