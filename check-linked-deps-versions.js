const Promise = require('bluebird')

const path = require('path')
const fs = Promise.promisifyAll(require('fs'))
const proc = Promise.promisifyAll(require('child_process'))

const {pickBy, includes, toPairs} = require('lodash/fp')

// eslint-disable-next-line no-console
const print = console.log;

(async () => {
  print('Checking linked dependencies versions...')

  const symlinks = await fs.readdirAsync('node_modules').filter(
    dir => fs.lstatAsync(path.join('node_modules', dir))
      .call('isSymbolicLink')
  )

  const pkg = JSON.parse(await fs.readFileAsync('package.json'))

  const deps = {...pkg.dependencies, ...pkg.devDependencies}
  const linkedDeps = pickBy((_, dep) => includes(dep, symlinks), deps)

  const depTags = await Promise.all(toPairs(linkedDeps))
    .map(async ([name, url]) => ({
      name,
      specTag: new URL(url).hash.replace(/^#/, ''),
      actualTag: await proc.execAsync(
        'git describe --dirty',
        {cwd: path.join('node_modules', name)}
      ).call('trim')
    }))
    .map(dep => ({...dep, matches: dep.specTag === dep.actualTag}))

  const report = depTags
    .filter(({matches}) => !matches)
    .map(({name, specTag, actualTag, matches}) =>
      `${name}: ${specTag} ${matches ? '==' : '!='} ${actualTag}`)
    .join('\n')

  print(!report ? 'Ok' : 'Mismatch: \n' + report)

  process.exit(report ? 1 : 0)
})()
