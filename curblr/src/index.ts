import type * as CurbLr from '@fabmobqc/curblr-types'

import { loadConfig } from './config.js'
import { convertToCds } from './converter.js'
import { loadJsonFile } from './file-tools.js'

const loadCurbLrData = (curbLrPath: string): CurbLr.CurbFeatureCollection => {
  const data: unknown = loadJsonFile(curbLrPath)
  return data as CurbLr.CurbFeatureCollection // We assume the data is valid
}

const main = (): void => {
  const config = loadConfig()
  const curbLrData = loadCurbLrData(config.curblr_path)
  convertToCds(curbLrData)
}

main()
