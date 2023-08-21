const fs = require('fs')
const dumbcsv = require('dumb-csv')
const compactStringify = require('json-stringify-pretty-compact')

function secondsElapsed (hmsStr1, hmsStr2) {
  const [h1, m1, s1] = hmsStr1.split(':').map(e => parseInt(e))
  const [h2, m2, s2] = hmsStr2.split(':').map(e => parseInt(e))
  return (h2 - h1) * 3600 + (m2 - m1) * 60 + (s2 - s1)
}

module.exports = function process (agency, division, calendar, calendarExceptions, trips, stopTimes) {
  function preprocessCalendar (lines) {
    if (agency === 'nyct-bus') {
      // nyct-bus/bronx fix missing service_id (GH_C3-Weekday-SDon -> GH_C3-Weekday)
      for (const line of lines) {
        if (line.service_id.includes('SDon')) {
          const replaced = line.service_id.replace('-SDon', '')
          if (!lines.some(e => e.service_id === replaced)) {
            lines.push({ ...line, service_id: replaced })
          }
        }
      }
    }
  }
  preprocessCalendar(calendar)

  const stopsByTripId = {}
  for (const stopTime of stopTimes) {
    stopsByTripId[stopTime.trip_id] ??= []
    stopsByTripId[stopTime.trip_id].push({
      arrival: stopTime.arrival_time,
      departure: stopTime.departure_time,
      stopId: stopTime.stop_id
    })
  }
  // const dayPalette = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']
  const serviceIdToDays = {}
  const serverIdToExceptions = {}
  for (const entry of calendar) {
    serviceIdToDays[entry.service_id] = [entry.monday, entry.tuesday, entry.wednesday, entry.thursday, entry.friday, entry.saturday, entry.sunday]
  }
  for (const entry of calendarExceptions) {
    serverIdToExceptions[entry.service_id] ??= { added: [], removed: [] }
    if (entry.exception_type === 1) {
      serverIdToExceptions[entry.service_id].added.push(entry.date)
    } else if (entry.exception_type === 2) {
      serverIdToExceptions[entry.service_id].removed.push(entry.date)
    } else {
      throw new Error('Invalid calendar exception type: ' + entry.exception_type)
    }
  }

  // console.log('Service IDs:', serviceIdToDays)

  const tripsByRoute = {}
  for (const trip of trips) {
    const stops = []
    const lastArrivalTime = stopsByTripId[trip.trip_id][0].arrival
    for (const stop of stopsByTripId[trip.trip_id]) {
      // [stopId, secondsElapsedSinceLastArrival, loiterTime]
      stops.push([stop.stopId, secondsElapsed(lastArrivalTime, stop.arrival), secondsElapsed(stop.arrival, stop.departure)])
    }
    tripsByRoute[trip.route_id] ??= { trips: {} }
    const entry = tripsByRoute[trip.route_id]
    // console.log('SID', trip.service_id)
    // const days = serviceIdToDays[trip.service_id].map((day, i) => day ? dayPalette[i] : '').filter(day => day)
    const daysCode = serviceIdToDays[trip.service_id] ? parseInt(serviceIdToDays[trip.service_id].join(''), 2) : 0
    const exceptionCode = serverIdToExceptions[trip.service_id]
      ? Object.keys(serverIdToExceptions).indexOf(trip.service_id)
      : undefined

    const j = JSON.stringify(stops)
    if (entry.trips[j]) {
      const stops = stopsByTripId[trip.trip_id]
      entry.trips[j].departs.push([daysCode, stops[0].arrival, exceptionCode])
      // entry.trips[j].ids.push(trip.trip_id)
    } else {
      entry.trips[j] = ({
        // ids: [trip.trip_id],
        sign: trip.trip_headsign,
        days: null,
        departs: [[daysCode, stopsByTripId[trip.trip_id][0].arrival, exceptionCode]],
        // endTime: stopsByTripId[trip.trip_id][stopsByTripId[trip.trip_id].length - 1].arrival,
        shape: trip.shape_id,
        stops
      })
    }

    // entry.trips = entry.trips.slice(0, 10)
  }
  for (const routeId in tripsByRoute) {
    const entry = tripsByRoute[routeId]
    entry.trips = Object.values(entry.trips)
    for (const trip of entry.trips) {
      if (trip.departs.every(k => (k[0] === trip.departs[0][0]) && (k[2] === trip.departs[0][2]))) {
        trip.days = trip.departs[0][0]
        trip.exception = trip.departs[0][2]
        trip.departs = trip.departs.map(k => k[1])
      } else {
        delete trip.days
      }
    }
    tripsByRoute[routeId] = entry.trips
  }
  return {
    exceptions: serverIdToExceptions,
    trips: tripsByRoute
  }
}

if (!module.parent) {
  console.time('readCSV')
  const calendar = dumbcsv.fromCSV({ file: 'calendar.txt' }).toJSON()
  const trips = dumbcsv.fromCSV({ file: 'trips.txt' }).toJSON()
  const stopTimes = dumbcsv.fromCSV({ file: 'stop_times.txt' }).toJSON()
  console.timeEnd('readCSV')
  const tripsByRoute = process(calendar, trips, stopTimes)
  const json = compactStringify(tripsByRoute, {
    maxLength: 9999
  })
  fs.writeFileSync('trips.json', json)
}
