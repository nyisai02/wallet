import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const cli = fileURLToPath(new URL('../node_modules/@angular/cli/bin/ng.js', import.meta.url))
const args = [cli, 'serve']
if (process.env.PORT) args.push('--port', process.env.PORT)

const server = spawn(process.execPath, [...args, ...process.argv.slice(2)], { stdio: 'inherit' })
server.on('error', (error) => {
  console.error(error.message)
  process.exitCode = 1
})
server.on('exit', (code) => {
  process.exitCode = code ?? 1
})
