const { join } = require('path')
const fs = require('fs')
const googlePolyline = require('google-polyline')

const pp = {
  'nyct-bus': {
    stops(stops) {
      for (const stop of stops) {
        stop.accessible = 1
      }
    }
  }
}

function makeOps(agency, region) {
  const dir = join(__dirname, `../data/${agency}/${region === 'base' ? '' : region}`)
  fs.mkdirSync(dir, { recursive: true })
  const writeJSON = (name, data) => fs.writeFileSync(join(dir, `${name}.json`), JSON.stringify(data, null, 2))

  function writeStops(stops) {
    const updated = []
    for (const stop of stops) {
      updated.push({
        // ix: stop.stop_id,
        id: stop.stop_id,
        name: stop.stop_name,
        description: stop.stop_desc,
        accessible: stop.wheelchair_boarding,
        lat: stop.stop_lat,
        lng: stop.stop_lon
      })
    }
    pp[agency]?.stops?.(updated)
    writeJSON('stops', updated)
    return updated
  }

  function writeShapes(shapes) {
    const shapeMap = {}
    for (const { shape_id, shape_pt_lat, shape_pt_lon } of shapes) {
      shapeMap[shape_id] ??= []
      shapeMap[shape_id].push([shape_pt_lat, shape_pt_lon])
      // if (!longestShape || shapes[shape_id].length > shapes[longestShape].length) longestShape = shape_id
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

  return { handleStops: writeStops, handleShapes: writeShapes }
}

module.exports = makeOps