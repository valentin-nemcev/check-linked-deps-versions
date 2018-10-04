#!/usr/bin/env node

const Promise = require('bluebird')

const path = require('path')
const fs = Promise.promisifyAll(require('fs'))
const proc = Promise.promisifyAll(require('child_process'))
const semver = require('semver')
const chalk = require('chalk')

const {pickBy, includes, toPairs, omit} = require('lodash/fp')

// eslint-disable-next-line no-console
const print = console.log

async function checkLinkedDepsVersions () {
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
      specTag: new URL(url).hash.replace(/^#(semver:)?/, ''),
      actualTag: await proc.execAsync(
        'git describe --dirty',
        {
          cwd: path.join('node_modules', name),
          // Git sets GIT_INDEX_FILE to absolute path to the index file of the
          // repo hooks are running in, not the one we are checking, so we
          // unset it
          env: omit(['GIT_INDEX_FILE'], process.env)
        }
      ).call('trim')
    }))
    .map(dep => ({
      ...dep,
      matches: semver.satisfies(dep.actualTag, dep.specTag)
    }))

  const report = depTags
    // .filter(({matches}) => !matches)
    .map(({name, specTag, actualTag, matches}) =>
      chalk[matches ? 'green' : 'red'](`${name}: ${specTag} ${matches ? 'matches' : 'doesn\'t match'} ${actualTag}`))
    .join('\n')

  print(!report ? chalk.green('No linked dependencies') : 'Linked dependencies versions: \n' + report)

  const ok = depTags.every(({matches}) => matches)
  process.exit(ok ? 0 : 1)
}

checkLinkedDepsVersions().catch(e => {
  console.error(e.toString())
  process.exit(1)
})
