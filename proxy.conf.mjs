export default {
  '/api/**': {
    target: process.env.DEMO_WALLET_API_URL || 'http://127.0.0.1:8081',
    changeOrigin: true,
    rewrite: (path) => path.replace(/^\/api(?=\/)/, ''),
  },
}
