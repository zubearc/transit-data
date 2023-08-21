const { join } = require('path')
const fs = require('fs')
const googlePolyline = require('google-polyline')
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

  function writeStops (stops) {
    const updated = []
    for (const stop of stops) {
      updated.push({
        // ix: stop.stop_id,
        id: stop.stop_id,
        name: stop.stop_name,
        description: stop.stop_desc || '',
        accessible: stop.wheelchair_boarding,
        lat: stop.stop_lat,
        lng: stop.stop_lon
      })
    }
    pp[agency]?.stops?.(updated)
    writeJSON('stops', updated)
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

  function handleTrips (calendar, trips, stopTimes) {
    // console.log('Processing trips', stopTimes.length, 'stop times')
    const data = processTrips(agency, region, calendar, trips, stopTimes, agency)
    writeJSON('trips', data)
    return data
  }

  return { handleStops: writeStops, handleShapes: writeShapes, handleTrips }
}

module.exports = makeOps
