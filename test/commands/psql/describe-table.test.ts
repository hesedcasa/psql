/* eslint-disable @typescript-eslint/no-explicit-any */
import {expect} from 'chai'
import esmock from 'esmock'
import {type SinonStub, stub} from 'sinon'

describe('psql:describe-table', () => {
  let PostgresDescribeTable: any
  let describeTableStub: SinonStub
  let closeConnectionsStub: SinonStub

  const mockResult = {data: {result: '┌─────┬──────┐\n│ id  │ name │\n└─────┴──────┘', structure: []}, success: true}

  beforeEach(async () => {
    describeTableStub = stub().resolves(mockResult)
    closeConnectionsStub = stub().resolves()

    const imported = await esmock('../../../src/commands/psql/describe-table.js', {
      '../../../src/psql/index.js': {
        closeConnections: closeConnectionsStub,
        describeTable: describeTableStub,
      },
    })
    PostgresDescribeTable = imported.default
  })

  it('describes table using default profile and logs result', async () => {
    const cmd = new PostgresDescribeTable(['users'], {
      root: process.cwd(),
      runHook: stub().resolves({failures: [], successes: []}),
    } as any)
    const logStub = stub(cmd, 'log')
    const expectedResult = mockResult.data.result

    await cmd.run()

    expect(describeTableStub.calledOnce).to.be.true
    expect(describeTableStub.firstCall.args.slice(1)).to.deep.equal(['users', undefined, 'table'])
    expect(closeConnectionsStub.calledOnce).to.be.true
    expect(logStub.calledOnce).to.be.true
    expect(logStub.firstCall.args[0]).to.equal(expectedResult)
  })

  it('uses provided flags', async () => {
    const cmd = new PostgresDescribeTable(['orders', '--profile', 'prod', '--json'], {
      root: process.cwd(),
      runHook: stub().resolves({failures: [], successes: []}),
    } as any)
    stub(cmd, 'log')

    await cmd.run()

    expect(describeTableStub.firstCall.args.slice(1)).to.deep.equal(['orders', 'prod', 'json'])
  })

  it('throws error when describe fails', async () => {
    describeTableStub.resolves({error: 'relation "nope" does not exist', success: false})

    const cmd = new PostgresDescribeTable(['nope'], {
      root: process.cwd(),
      runHook: stub().resolves({failures: [], successes: []}),
    } as any)

    try {
      await cmd.run()
      expect.fail('Should have thrown')
    } catch {
      // expected
    }

    expect(closeConnectionsStub.calledOnce).to.be.true
  })
})
