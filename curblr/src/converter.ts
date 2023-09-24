import type * as Cds from '@fabmobqc/cds-types'
import * as CurbLr from '@fabmobqc/curblr-types'
import { buildCurbZones, dumpZonesToGeoJson } from './zones-builder.js'

type CurbLrByLinearReference = Record<CurbLr.Location['shstRefId'], Record<CurbLr.Location['sideOfStreet'], CurbLr.CurbFeature[]>>

const classifyByLinearReference = (curbLrFeatures: CurbLr.CurbFeature[]): CurbLrByLinearReference => {
  return curbLrFeatures.reduce<CurbLrByLinearReference>((acc, curbFeature) => {
    const { shstRefId, sideOfStreet } = curbFeature.properties.location
    if (acc[shstRefId] === undefined) {
      acc[shstRefId] = {
        left: [],
        right: []
      }
    }
    acc[shstRefId][sideOfStreet].push(curbFeature)
    return acc
  }, {})
}

export const convertToCds = (curbLrData: CurbLr.CurbFeatureCollection): void => {
  const zones: Cds.Zone[] = []
  const curbLrByLinearReference = classifyByLinearReference(curbLrData.features)
  Object.values(curbLrByLinearReference).forEach((curbLrBySideOfStreet) => {
    Object.values(curbLrBySideOfStreet).forEach((curbLrFeatures) => {
      if (curbLrFeatures.length === 0) {
        return
      }
      const curbZones = buildCurbZones(curbLrFeatures)
      zones.push(...curbZones)
    })
  })
  dumpZonesToGeoJson(zones)
}
