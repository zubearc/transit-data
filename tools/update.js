const cp = require('child_process')
const { join } = require('path')
const fs = require('fs')
const dumbcsv = require('dumb-csv')
const data = require('../data/metadata.json')

const head = (url) => fetch(url, { method: 'HEAD' })
const download = (url, dest) => cp.execSync(`curl -o ${dest} ${url}`)
const unzip = (inp, out) => cp.execSync(`7z e ${inp} -o${out}`)

const unwrapEtag = (etag) => etag.replace(/"/g, '').replace('W/', '')

async function process (agency, region, fromFile) {
  const ops = require('./process')(agency, region)
  const outDir = fromFile.replace('.zip', '')
  if (!fs.existsSync(outDir)) {
    console.log('unzipping', fromFile, 'to', outDir)
    unzip(fromFile, outDir)
  }
  // const readText = (path) => fs.readFileSync(join(outDir, path), 'utf8')
  const readCSV = (path) => dumbcsv.fromCSV({ file: join(outDir, path) }).toJSON()

  ops.handleStops(readCSV('stops.txt'))
  ops.handleShapes(readCSV('shapes.txt'))
  ops.handleTrips(readCSV('calendar.txt'), readCSV('trips.txt'), readCSV('stop_times.txt'))
}

async function main (opts) {
  for (const agency in data) {
    console.log('Checking', agency)
    fs.mkdirSync(join(__dirname, `./tmp/${agency}`), { recursive: true })
    const agencyData = data[agency]
    let lastUpdateMetadata = {}
    try {
      lastUpdateMetadata = JSON.parse(fs.readFileSync(join(__dirname, `../data/${agency}/lastUpdate.json`)))
    } catch (e) {
      fs.mkdirSync(join(__dirname, `../data/${agency}`), { recursive: true })
      fs.writeFileSync(join(__dirname, `../data/${agency}/lastUpdate.json`), JSON.stringify(lastUpdateMetadata))
    }
    const urls = agencyData.urls ? agencyData.urls : { base: agencyData.url }
    for (const name in urls) {
      if (name && name !== 'base') fs.mkdirSync(join(__dirname, `./tmp/${agency}/${name}`), { recursive: true })
      const lastUpdate = lastUpdateMetadata[name]
      const url = urls[name]
      const headers = await head(url).then(res => res.headers)
      const currentEtag = headers.get('etag')
      if (opts.forceReprocess || !lastUpdate || (lastUpdate.etag !== currentEtag)) {
        if (opts.forceReprocess) console.log('Force reprocessing', agency, '/', name)
        else console.log('Need to update', agency, '/', name)
        const path = join(__dirname, `./tmp/${agency}/${name}-${unwrapEtag(currentEtag)}.zip`)
        if (!fs.existsSync(path)) {
          console.log('Downloading...', url)
          download(url, path)
        }
        await process(agency, name, path)
        lastUpdateMetadata[name] = { etag: currentEtag, lastModified: headers.get('last-modified'), obtainedOn: Date.now() }
        console.log('Updated payload', lastUpdateMetadata, name)
        fs.writeFileSync(join(__dirname, `../data/${agency}/lastUpdate.json`), JSON.stringify(lastUpdateMetadata, null, 2))
      } else {
        console.log('No update needed', agency, '/', name)
      }
    }
  }
}

main({ forceReprocess: true })
