import fs from 'fs'

export const loadJsonFile = (filePath: string): JSON => {
  const buffer = fs.readFileSync(filePath)
  return JSON.parse(buffer.toString())
}
