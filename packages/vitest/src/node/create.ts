import { dirname, resolve } from 'pathe'
import { createServer, mergeConfig } from 'vite'
import type { InlineConfig as ViteInlineConfig, UserConfig as ViteUserConfig } from 'vite'
import { findUp } from 'find-up'
import fg from 'fast-glob'
import type { UserConfig } from '../types'
import { configFiles } from '../constants'
import { Vitest } from './core'
import { VitestPlugin } from './plugins'

export async function createVitest(options: UserConfig, viteOverrides: ViteUserConfig = {}) {
  const ctx = new Vitest()
  const root = resolve(options.root || process.cwd())

  const configPath = options.config
    ? resolve(root, options.config)
    : await findUp(configFiles, { cwd: root } as any)

  const config: ViteInlineConfig = {
    logLevel: 'error',
    configFile: configPath,
    // this will make "mode" = "test" inside defineConfig
    mode: options.mode || process.env.NODE_ENV || 'test',
    plugins: await VitestPlugin(options, ctx),
  }

  const server = await createServer(mergeConfig(config, mergeConfig(viteOverrides, { root: options.root })))

  if (ctx.config.api?.port)
    await server.listen()
  else
    await server.pluginContainer.buildStart({})

  return ctx
}

export async function createVitestProjects(options: UserConfig, viteOverrides: ViteUserConfig = {}) {
  const ctx = await createVitest(options, viteOverrides)

  if (ctx.config.projects.length) {
    const inputs = ctx.config.projects
    const files = (await fg(inputs, {
      cwd: options.root,
      onlyFiles: true,
      ignore: [
        '**/node_modules/**',
      ],
    })).sort()

    ctx.projects = await Promise.all(
      files.map(async (project) => {
        const projectOptions = {
          ...options,
          root: dirname(project),
          config: project,
        }
        const ctx = await createVitest(projectOptions, viteOverrides)
        if (ctx.config.projects.length)
          throw new Error(`Nested projects are not supported. Defined in ${project}`)
        return ctx
      }),
    )
  }

  return ctx
}
