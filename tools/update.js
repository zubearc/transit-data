const cp = require('child_process')
const { join } = require('path')
const fs = require('fs')
const data = require('../data/metadata.json')

const head = (url) => fetch(url, { method: 'HEAD' })
const download = (url, dest) => cp.execSync(`curl -o ${dest} ${url}`)

const unwrapEtag = (etag) => etag.replace(/"/g, '').replace('W/', '')

async function main () {
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
      const lastUpdate = lastUpdateMetadata[name]
      const url = urls[name]
      const headers = await head(url).then(res => res.headers)
      const currentEtag = headers.get('etag')
      if (!lastUpdate || (lastUpdate.etag !== currentEtag)) {
        console.log('Need to update', agency, '/', name)
        const path = join(__dirname, `./tmp/${agency}/${name}-${unwrapEtag(currentEtag)}.zip`)
        if (!fs.existsSync(path)) {
          console.log('Downloading...', url)
          download(url, path)
        }
        lastUpdateMetadata[name] = { etag: currentEtag, lastModified: headers.get('last-modified'), obtainedOn: Date.now() }
        console.log('Updated payload', lastUpdateMetadata, name)
        fs.writeFileSync(join(__dirname, `../data/${agency}/lastUpdate.json`), JSON.stringify(lastUpdateMetadata, null, 2))
      }
    }
  }
}

main()
