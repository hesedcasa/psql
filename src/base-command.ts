import {Command} from '@oclif/core'

export abstract class BaseCommand extends Command {
  static override enableJsonFlag = true

  public override jsonEnabled(): boolean {
    const separatorIndex = this.argv.indexOf('--')
    const flagArgs = separatorIndex === -1 ? this.argv : this.argv.slice(0, separatorIndex)

    if (this.hasFormatFlag(flagArgs)) return this.formatFlagValue(flagArgs) === 'json'

    return flagArgs.includes('--json')
  }

  // oclif sets this.parsed=true only after Parser.parse() returns successfully.
  // When parse() throws (e.g. missing required arg), this.parsed stays false and
  // _run() emits an UnparsedCommand warning. The finally block prevents that.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected override async parse(options?: any, argv?: string[]): Promise<any> {
    try {
      return await super.parse(options, argv)
    } finally {
      this.parsed = true
    }
  }

  protected parseJsonOutput(output?: string): unknown {
    if (!output) return null

    try {
      return JSON.parse(output)
    } catch {
      return output
    }
  }

  // oclif's default toErrorJson returns the raw error object which for
  // CLIParseError includes context:this (the full config). Strip it down.
  protected override toErrorJson(err: unknown): {error: string} {
    const message = err instanceof Error ? err.message : String(err)
    return {error: message}
  }

  private formatFlagValue(flagArgs: string[]): string | undefined {
    for (const [index, arg] of flagArgs.entries()) {
      if (arg === '--format') return flagArgs[index + 1]
      if (arg.startsWith('--format=')) return arg.slice('--format='.length)
    }
  }

  private hasFormatFlag(flagArgs: string[]): boolean {
    return flagArgs.some((arg) => arg === '--format' || arg.startsWith('--format='))
  }
}
