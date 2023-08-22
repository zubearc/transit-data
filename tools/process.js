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
        id: stop.stop_id,
        name: stop.stop_name,
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
        id: route.route_id,
        name: route.route_short_name,
        description: route.route_long_name,
        type: route.route_type,
        color: route.route_color,
        textColor: route.route_text_color
      })
    }
    writeJSON('routes', result)
    return result
  }

  function handleTrips (calendar, calendarExceptions, trips, stopTimes) {
    // console.log('Processing trips', stopTimes.length, 'stop times')
    const data = processTrips(agency, region, calendar, calendarExceptions, trips, stopTimes, agency)
    writeJSONCompact('trips', data, 9999 + agency === 'nyct-subway' ? 9999 : 100)

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

module.exports = makeOps
