'use strict'

const { cliPath, connectAndResetDB } = require('./helper.js')
const { test } = require('tap')
const split = require('split2')
const { once } = require('events')
const { join } = require('path')
const { request } = require('undici')

const fileTypes = ['yaml', 'yml', 'toml', 'tml', 'json', 'json5']
for (const fileType of fileTypes) {
  test(`auto config - ${fileType}`, async ({ equal, same, match, teardown }) => {
    const execa = (await import('execa')).execa
    const db = await connectAndResetDB()
    teardown(() => db.dispose())

    await db.query(db.sql`CREATE TABLE pages (
      id SERIAL PRIMARY KEY,
      title VARCHAR(42)
    );`)

    const child = execa('node', [cliPath, 'start'], {
      cwd: join(__dirname, '..', 'fixtures', 'auto-config', fileType)
    })
    const output = child.stdout.pipe(split(JSON.parse))

    const [{ url }] = await once(output, 'data')

    let id
    {
      const res = await request(`${url}/graphql`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: `
                mutation {
                  savePage(input: { title: "Hello" }) {
                    id
                    title
                  }
                }
              `
        })
      })
      equal(res.statusCode, 200, 'savePage status code')
      const body = await res.body.json()
      match(body, {
        data: {
          savePage: {
            title: 'Hello'
          }
        }
      }, 'savePage response')
      id = body.data.savePage.id
    }

    {
      const res = await request(`${url}/graphql`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: `
                query {
                  getPageById(id: ${id}) {
                    id
                    title
                  }
                }
              `
        })
      })
      equal(res.statusCode, 200, 'pages status code')
      same(await res.body.json(), {
        data: {
          getPageById: {
            id,
            title: 'Hello'
          }
        }
      }, 'pages response')
    }

    {
      const res = await request(`${url}/graphql`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: `
                mutation {
                  savePage(input: { id: ${id}, title: "Hello World" }) {
                    id
                    title
                  }
                }
              `
        })
      })
      equal(res.statusCode, 200, 'savePage status code')
      same(await res.body.json(), {
        data: {
          savePage: {
            id,
            title: 'Hello World'
          }
        }
      }, 'savePage response')
    }

    {
      const res = await request(`${url}/graphql`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: `
                query {
                  getPageById(id: ${id}) {
                    id
                    title
                  }
                }
              `
        })
      })
      equal(res.statusCode, 200, 'pages status code')
      same(await res.body.json(), {
        data: {
          getPageById: {
            id,
            title: 'Hello World'
          }
        }
      }, 'pages response')
    }

    child.kill('SIGINT')
  })
}
