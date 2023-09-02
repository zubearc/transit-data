const { join } = require('path')
const fs = require('fs')
const googlePolyline = require('google-polyline')
const compactStringify = require('json-stringify-pretty-compact')
const processTrips = require('./processTrips')

const pp = {
  'nyct-bus': {
    // notes:
    // SDon -> school days only
    stops (stops) {
      for (const stop of stops) {
        stop.accessible = 1
        // bronx
        stop.name = stop.name.replace('BRUCKNER BL/ST JOSEPH"S WAY', "BRUCKNER BL/ST JOSEPH'S WAY")
      }
    }
  }
}

function makeOps (agency, region) {
  const dir = join(__dirname, `../data/${agency}/${region === 'base' ? '' : region}`)
  fs.mkdirSync(dir, { recursive: true })
  const write = (name, data) => fs.writeFileSync(join(dir, name), data)
  const writeJSON = (name, data) => fs.writeFileSync(join(dir, `${name}.json`), JSON.stringify(data, null, 2))
  const writeJSONCompact = (name, data, maxWidth = 9999) =>
    fs.writeFileSync(join(dir, `${name}.json`), compactStringify(data, { maxLength: maxWidth }))

  const servicesAtStop = {}

  function writeStops (stops) {
    if (!Object.keys(servicesAtStop).length) throw new Error('Need to call handleTrips first')
    const updated = []
    for (const stop of stops) {
      updated.push({
        // ix: stop.stop_id,
        id: String(stop.stop_id),
        name: String(stop.stop_name) || '',
        description: stop.stop_desc || '',
        accessible: stop.wheelchair_boarding,
        pos: [parseFloat(stop.stop_lat), parseFloat(stop.stop_lon)],
        services: servicesAtStop[stop.stop_id] || []
      })
    }
    pp[agency]?.stops?.(updated)
    writeJSONCompact('stops', updated, 120)
    return updated
  }

  function writeShapes (shapes) {
    const shapeMap = {}
    for (const shape of shapes) {
      shapeMap[shape.shape_id] ??= []
      shapeMap[shape.shape_id].push([shape.shape_pt_lat, shape.shape_pt_lon])
    }
    const updated = {}
    for (const shapeName in shapeMap) {
      const shape = shapeMap[shapeName]
      updated[shapeName] = googlePolyline.encode(shape)
    }
    pp[agency]?.shapes?.(updated)
    writeJSON('shapes', updated)
    return updated
  }

  function handleRoutes (routes) {
    const result = []
    for (const route of routes) {
      result.push({
        id: String(route.route_id),
        name: String(route.route_short_name) || '',
        description: route.route_long_name,
        type: route.route_type,
        color: String(route.route_color),
        textColor: String(route.route_text_color)
      })
    }
    writeJSON('routes', result)
    return result
  }

  function handleTrips (calendar, calendarExceptions, trips, stopTimes) {
    // console.log('Processing trips', stopTimes.length, 'stop times')
    const data = processTrips(agency, region, calendar, calendarExceptions, trips, stopTimes, agency)

    // Experimental generation of TSV
    const [tsvTrips, tsvExceptions] = tripsJSON2TSV(data)
    write('trips.tsv', tsvTrips)
    write('trips_ex.tsv', tsvExceptions)

    writeJSONCompact('trips', data, 9999 + agency === 'nyct-subway' ? 9999 : 100)

    // Cache some data for other calls
    for (const routeId in data.trips) {
      for (const trip of data.trips[routeId]) {
        for (const [stopId] of trip.stops) {
          servicesAtStop[stopId] ??= []
          if (!servicesAtStop[stopId].includes(routeId)) { servicesAtStop[stopId].push(routeId) }
        }
      }
    }

    return data
  }

  return { handleStops: writeStops, handleShapes: writeShapes, handleRoutes, handleTrips }
}

function tripsJSON2TSV (json) {
  const lines = []
  for (const routeId in json.trips) {
    for (const trip of json.trips[routeId]) {
      const departs = []
      for (const [dayCode, time, exceptionCode] of trip.departs) {
        departs.push(`${dayCode},${time},${exceptionCode || ''}`)
      }
      const stops = []
      for (const [stopId, secondsElapsedSinceLastArrival, loiterTime] of trip.stops) {
        stops.push(`${stopId},${secondsElapsedSinceLastArrival},${loiterTime || ''}`)
      }
      lines.push([routeId, trip.sign, trip.shapeId, departs.join(';'), stops.join(';')].join('\t'))
    }
  }

  const exceptions = []
  for (const exception of json.exceptions) {
    exceptions.push(`${exception.added.join(',')}\t${exception.removed.join(',')}`)
  }

  return [lines.join('\n'), exceptions.join('\n')]
}

module.exports = makeOps
