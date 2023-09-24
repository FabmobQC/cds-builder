import fs from 'fs'
import type * as Cds from '@fabmobqc/cds-types'
import * as CurbLr from '@fabmobqc/curblr-types'
import cleanCoords from '@turf/clean-coords'
import distance from '@turf/distance'
import { lineString, polygon } from '@turf/helpers'
import type { Feature, FeatureCollection, LineString, Polygon, Position, Units } from '@turf/helpers'
import lineOffset from '@turf/line-offset'
import { randomUUID } from 'crypto'
import lineSliceAlong from '@turf/line-slice-along'

const buildLocationReference = (curbLrLocation: CurbLr.Location): Cds.LocationReference => {
  return {
    source: 'https://sharedstreets.io',
    ref_id: curbLrLocation.shstRefId,
    start: curbLrLocation.shstLocationStart,
    end: curbLrLocation.shstLocationEnd,
    side: curbLrLocation.sideOfStreet
  }
}

const findZonesSeparations = (curbLrForSideOfStreet: CurbLr.CurbFeature[]): number[] => {
  const separations = new Set<number>()
  curbLrForSideOfStreet.forEach((curbFeature) => {
    const { location } = curbFeature.properties
    separations.add(location.shstLocationStart)
    separations.add(location.shstLocationEnd)
  })
  return Array.from(separations).sort((a, b) => a - b)
}

const buildPolygonFromLineString = (line: LineString, side: 'left' | 'right', width: number = 5, units: Units = 'meters'): Polygon => {
  const sign = side === 'right' ? 1 : -1
  const offsetLine = lineOffset(line, width * sign, { units })

  const coords = [
    ...line.coordinates,
    ...offsetLine.geometry.coordinates.reverse(),
    line.coordinates[0]
  ]

  return polygon([coords]).geometry
}

const findClosestPosition = (position: Position, positions: Position[]): Position => {
  return positions.slice(0).reduce<Position>((acc, current) => {
    const distanceAcc = distance(position, acc)
    const distanceCurrent = distance(position, current)
    return distanceAcc < distanceCurrent ? acc : current
  }, positions[0])
}

// Build a line connecting the positions of all the curb featurse
const buildFullCurbLine = (curbLrFeatures: CurbLr.CurbFeature[]): Feature<LineString> => {
  interface PositionsAndLimitSegments {
    firstSegment: CurbLr.CurbFeature // Segment with the lowest start
    lastSegment: CurbLr.CurbFeature // Segment with highest end
    positions: Position[]
  }

  const { positions, firstSegment, lastSegment } = curbLrFeatures.reduce<PositionsAndLimitSegments>((result, currentSegment) => {
    result.positions.push(...currentSegment.geometry.coordinates)

    const currentSegmentStart = currentSegment.properties.location.shstLocationStart
    const firstSegmentStart = result.firstSegment.properties.location.shstLocationStart
    if (currentSegmentStart < firstSegmentStart) {
      result.firstSegment = currentSegment
    }

    const currentSegmentEnd = currentSegment.properties.location.shstLocationEnd
    const lastSegmentEnd = result.lastSegment.properties.location.shstLocationEnd
    if (currentSegmentEnd > lastSegmentEnd) {
      result.lastSegment = currentSegment
    }

    return result
  }, { positions: [], firstSegment: curbLrFeatures[0], lastSegment: curbLrFeatures[0] })

  const findFirstPosition = (): Position => {
    // We don't know yet which position is the first
    const firstPositionCandidate1 = firstSegment.geometry.coordinates[0]
    const firstPositionCandidate2 = firstSegment.geometry.coordinates[firstSegment.geometry.coordinates.length - 1]

    const checkFirstAndLastSegmentAreSame = (): boolean => {
      const firstLocation = firstSegment.properties.location
      const lastLocation = lastSegment.properties.location
      const startsAreSame = firstLocation.shstLocationStart === lastLocation.shstLocationStart
      const endsAreSame = firstLocation.shstLocationEnd === lastLocation.shstLocationEnd
      return startsAreSame && endsAreSame
    }

    const findForFirstAndLastSegmentsAreSame = (): Position => {
      const firstSegmentLocation = firstSegment.properties.location
      // Search for a segment of the curb that is not centered into the curb
      const nonCenteredSegment = curbLrFeatures.find((segment) => {
        const segmentLocation = segment.properties.location
        const diffStarts = segmentLocation.shstLocationStart - firstSegmentLocation.shstLocationStart
        const diffEnds = firstSegmentLocation.shstLocationEnd - segmentLocation.shstLocationEnd
        return diffStarts !== diffEnds
      })
      if (nonCenteredSegment === undefined) {
        // The curb is symetric. No way to know. Lets hope for the best.
        return firstSegment.geometry.coordinates[0]
      }
      const nonCenteredSegmentLocation = nonCenteredSegment.properties.location
      const diffStarts = nonCenteredSegmentLocation.shstLocationStart - firstSegmentLocation.shstLocationStart
      const diffEnds = firstSegmentLocation.shstLocationEnd - nonCenteredSegmentLocation.shstLocationEnd
      const startIsLonger = diffStarts > diffEnds

      const nonCenteredSegmentCoords = nonCenteredSegment.geometry.coordinates
      const closestToCandidate1 = findClosestPosition(firstPositionCandidate1, nonCenteredSegmentCoords)
      const closestToCandidate2 = findClosestPosition(firstPositionCandidate2, nonCenteredSegmentCoords)

      const distance1 = distance(firstPositionCandidate1, closestToCandidate1)
      const distance2 = distance(firstPositionCandidate2, closestToCandidate2)

      if (startIsLonger) {
       if (distance1 > distance2) {
          return firstPositionCandidate1
        }
      } else if (distance1 < distance2) {
          return firstPositionCandidate1
      }
      return firstPositionCandidate2
    }
  
    const findForFirstAndLastSegmentsAreDifferent = (): Position => {
      // We don't know yet which position is the last
      const lastPositionCandidate1 = lastSegment.geometry.coordinates[0]
      const lastPositionCandidate2 = lastSegment.geometry.coordinates[lastSegment.geometry.coordinates.length - 1]

      // The distance between the first position and the last position is the longuest
      const distance1 = distance(firstPositionCandidate1, lastPositionCandidate1)
      const distance2 = distance(firstPositionCandidate1, lastPositionCandidate2)
      const distance3 = distance(firstPositionCandidate2, lastPositionCandidate1)
      const distance4 = distance(firstPositionCandidate2, lastPositionCandidate2)
      const max = Math.max(distance1, distance2, distance3, distance4)
      return [distance1, distance2].includes(max) ? firstPositionCandidate1 : firstPositionCandidate2
    }

    if (checkFirstAndLastSegmentAreSame()) {
      return findForFirstAndLastSegmentsAreSame()
    }
    return findForFirstAndLastSegmentsAreDifferent()
  }

  const firstPosition = findFirstPosition()
  positions.sort((a, b) => distance(firstPosition, a) - distance(firstPosition, b))

  return cleanCoords(lineString(positions))
}

const buildZoneGeometry = (
  start: number, 
  end: number,
  curbStart: number,
  curbEnd: number,
  fullCurbLine: Feature<LineString>,
  fullCurbLineLength: number,
  sideOfStreet: 'left' | 'right'
): Polygon => {
  const usedCurbLength = curbEnd - curbStart

  const percentStart = (start-curbStart) /  usedCurbLength
  const percentEnd = (end-curbStart) / usedCurbLength
  const segment = lineSliceAlong(fullCurbLine, percentStart*fullCurbLineLength, percentEnd*fullCurbLineLength)
  return buildPolygonFromLineString(segment.geometry, sideOfStreet)
}

const checkFeaturesHaveSameRefIdAndStreetSide = (curbLrFeatures: CurbLr.CurbFeature[]): boolean => {
  const firstFeature = curbLrFeatures[0]
  const refId = firstFeature.properties.location.shstRefId
  const side = firstFeature.properties.location.sideOfStreet
  return curbLrFeatures.every((feature) => {
    const { shstRefId, sideOfStreet } = feature.properties.location
    return shstRefId === refId && sideOfStreet === side
  })
}

// Build the curb zones of a street side between two intersections
export const buildCurbZones = (
  curbLrFeatures: CurbLr.CurbFeature[] // All the curb features must be on the same street and on the same side
): Cds.Zone[] => {
  if (!checkFeaturesHaveSameRefIdAndStreetSide(curbLrFeatures)) {
    throw new Error('All the curb features must be on the same street and on the same side')
  }
  const fullCurbLine = buildFullCurbLine(curbLrFeatures)
  const zonesSeparations = findZonesSeparations(curbLrFeatures)
  const curbStart = zonesSeparations[0]
  const curbEnd = zonesSeparations[zonesSeparations.length - 1]
  const firstFeatureLocation = curbLrFeatures[0].properties.location
  const streetName = curbLrFeatures[0].properties.location.streetName
  const streetSide = curbLrFeatures[0].properties.location.sideOfStreet
  const fullCurbLineLength = distance(fullCurbLine.geometry.coordinates[0], fullCurbLine.geometry.coordinates[fullCurbLine.geometry.coordinates.length - 1])
  const zones = zonesSeparations.slice(0, zonesSeparations.length - 1).map<Cds.Zone>((separation, index) => {
    const nextSeparation = zonesSeparations[index + 1]
    const zone: Cds.Zone = {
      curb_zone_id: randomUUID(),
      geometry: buildZoneGeometry(separation, nextSeparation, curbStart, curbEnd, fullCurbLine, fullCurbLineLength, streetSide),
      curb_policy_ids: [],
      published_date: Date.now(),
      last_updated_date: Date.now(),
      start_date: Date.now(),
      street_name: streetName,
      curb_area_ids: [],
      location_references: [buildLocationReference(firstFeatureLocation)]
    }
    return zone
  })
  return zones
}

export const dumpZonesToGeoJson = (zones: Cds.Zone[]): void => {
  const geojson: FeatureCollection= {
    type: 'FeatureCollection',
    features: zones.map((zone) => ({
      type: 'Feature',
      properties: {
        ...zone,
        geometry: undefined
      },
      geometry: zone.geometry
    }))
  }

  fs.writeFile("zones-dump.geojson", JSON.stringify(geojson), 'utf8', () => {})
}
