import { loadJsonFile } from './file-tools.js'

const configPath = 'config.json'
const defaultConfigPath = 'config-example.json'

export interface Config {
  curblr_path: string
  comment?: string
}

const checkIsConfig = (value: unknown): value is Config => {
  if (typeof value !== 'object' || value == null) {
    return false
  }
  const config = value as Config
  if (typeof config.curblr_path !== 'string') {
    return false
  }
  return true
}

export const loadConfig = (): Config => {
  for (const path of [configPath, defaultConfigPath]) {
    try {
      const config = loadJsonFile(path)
      if (checkIsConfig(config)) {
        return config
      }
    } catch (err: any) {
      if (err.code !== 'ENOENT') {
        console.error(err)
      }
    }
  }
  throw new Error('Unable to read config')
}
