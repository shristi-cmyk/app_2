import fs from 'node:fs'
import path from 'node:path'

// One small JSON file. script_ids are credentials: this file lives on the server only (see .gitignore).
const dir = process.env.DATA_DIR || './data'
const file = path.join(dir, 'state.json')

export function readState() {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    return { auth: {}, scripts: {}, subscription: null }
  }
}

export function writeState(state) {
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(file, JSON.stringify(state, null, 2), { mode: 0o600 })
}

export function updateState(fn) {
  const state = readState()
  fn(state)
  writeState(state)
  return state
}
