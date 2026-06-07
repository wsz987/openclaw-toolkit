import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { spawnSync } from 'node:child_process'
// pnpm plugin:uninstall -- --config D:\OpenClaw\openclaw\2026.5.20\openclaw.json --plugin feishu

function printHelp() {
  console.log(`Usage:
  pnpm plugin:uninstall -- --config <path-to-openclaw.json> --plugin <plugin-id>

Examples:
  pnpm plugin:uninstall -- --config D:\\OpenClaw\\openclaw\\2026.5.20\\openclaw.json --plugin feishu
  pnpm plugin:uninstall -- --config D:\\OpenClaw\\openclaw\\2026.5.20\\openclaw.json --plugin openclaw-lark`)
}

function fail(message) {
  console.error(message)
  process.exit(1)
}

function parseArgs(argv) {
  const parsed = {}

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]

    if (token === '--') {
      continue
    }

    if (token === '--help' || token === '-h') {
      parsed.help = true
      continue
    }

    if (!token.startsWith('--')) {
      fail(`Unknown argument: ${token}`)
    }

    const key = token.slice(2)
    const value = argv[index + 1]
    if (!value || value.startsWith('--')) {
      fail(`Missing value for --${key}`)
    }

    parsed[key] = value
    index += 1
  }

  return parsed
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

function ensureFile(filePath, label) {
  if (!fs.existsSync(filePath)) {
    fail(`${label} not found: ${filePath}`)
  }
}

function findNodeRuntimeFile(nodeDir, fileName) {
  const directPath = path.join(nodeDir, fileName)
  if (fs.existsSync(directPath)) {
    return directPath
  }

  if (!fs.existsSync(nodeDir) || !fs.statSync(nodeDir).isDirectory()) {
    return directPath
  }

  for (const entry of fs.readdirSync(nodeDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue
    }

    const nestedPath = path.join(nodeDir, entry.name, fileName)
    if (fs.existsSync(nestedPath)) {
      return nestedPath
    }
  }

  return directPath
}

function loadPluginCatalog(projectRoot) {
  const pluginCatalogPath = path.join(projectRoot, 'artifacts', 'plugins.json')
  ensureFile(pluginCatalogPath, 'Plugin catalog')
  const pluginCatalog = readJson(pluginCatalogPath)
  return Array.isArray(pluginCatalog.plugins) ? pluginCatalog.plugins : []
}

function resolvePluginRecord(catalog, installedManifest, requestedPlugin) {
  const normalizedRequest = requestedPlugin.toLowerCase()
  const installedPlugin = (installedManifest.plugins || []).find((plugin) => {
    const idMatches = plugin.id?.toLowerCase() === normalizedRequest
    const packageMatches = plugin.package?.toLowerCase() === normalizedRequest
    return idMatches || packageMatches
  })

  const catalogPlugin = catalog.find((plugin) => {
    return (
      plugin.id?.toLowerCase() === normalizedRequest ||
      plugin.package?.toLowerCase() === normalizedRequest ||
      plugin.pluginEntryId?.toLowerCase() === normalizedRequest ||
      (plugin.aliases || []).some(
        (alias) => alias.toLowerCase() === normalizedRequest,
      )
    )
  })

  if (catalogPlugin) {
    return {
      id: catalogPlugin.id,
      package: catalogPlugin.package,
      pluginEntryId: catalogPlugin.pluginEntryId,
      aliases: catalogPlugin.aliases || [],
    }
  }

  if (installedPlugin) {
    return {
      id: installedPlugin.id,
      package: installedPlugin.package || requestedPlugin,
      pluginEntryId: installedPlugin.id,
      aliases: [],
    }
  }

  fail(
    `Plugin not found in artifacts/plugins.json or installed-manifest.json: ${requestedPlugin}`,
  )
}

function disablePluginEntries(config, plugin) {
  if (!config.plugins || typeof config.plugins !== 'object') {
    return false
  }

  if (!config.plugins.entries || typeof config.plugins.entries !== 'object') {
    return false
  }

  let changed = false
  const entryKeys = new Set([
    plugin.id,
    plugin.pluginEntryId,
    ...(plugin.aliases || []),
  ])

  for (const key of entryKeys) {
    const entry = config.plugins.entries[key]
    if (!entry || typeof entry !== 'object') {
      continue
    }

    if (entry.enabled !== false) {
      entry.enabled = false
      changed = true
    }
  }

  return changed
}

function uninstallPackage(packageDir, npmCmd, packageName) {
  const result = spawnSync(
    'cmd.exe',
    [
      '/c',
      npmCmd,
      'uninstall',
      packageName,
      '--omit=dev',
      '--ignore-scripts',
      '--no-audit',
      '--no-fund',
    ],
    {
      cwd: packageDir,
      stdio: 'inherit',
      env: {
        ...process.env,
        npm_config_fund: 'false',
        npm_config_audit: 'false',
      },
    },
  )

  if (result.error) {
    fail(`Failed to run npm uninstall: ${result.error.message}`)
  }

  if (typeof result.status === 'number' && result.status !== 0) {
    fail(`Plugin npm uninstall failed with exit code ${result.status}`)
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    printHelp()
    return
  }

  if (!args.config || !args.plugin) {
    printHelp()
    process.exit(args.help ? 0 : 1)
  }

  const projectRoot = process.cwd()
  const configPath = path.resolve(args.config)
  ensureFile(configPath, 'OpenClaw config')

  const openclawDir = path.dirname(configPath)
  const installedManifestPath = path.join(
    openclawDir,
    'installed-manifest.json',
  )
  ensureFile(installedManifestPath, 'Installed manifest')

  const packageDir = path.join(openclawDir, 'package')
  ensureFile(packageDir, 'OpenClaw package directory')

  const installedManifest = readJson(installedManifestPath)
  const pluginCatalog = loadPluginCatalog(projectRoot)
  const plugin = resolvePluginRecord(
    pluginCatalog,
    installedManifest,
    args.plugin,
  )

  if (!installedManifest.nodeDir) {
    fail(`Installed manifest is missing nodeDir: ${installedManifestPath}`)
  }

  const npmCmd = findNodeRuntimeFile(installedManifest.nodeDir, 'npm.cmd')
  ensureFile(npmCmd, 'Managed npm command')

  uninstallPackage(packageDir, npmCmd, plugin.package)

  const currentPlugins = Array.isArray(installedManifest.plugins)
    ? installedManifest.plugins
    : []
  installedManifest.plugins = currentPlugins.filter(
    (item) => item.id !== plugin.id,
  )
  writeJson(installedManifestPath, installedManifest)

  const config = readJson(configPath)
  const configChanged = disablePluginEntries(config, plugin)
  if (configChanged) {
    writeJson(configPath, config)
  }

  console.log(`Uninstalled plugin ${plugin.id} (${plugin.package}).`)
  console.log(`Updated manifest: ${installedManifestPath}`)
  if (configChanged) {
    console.log(`Disabled plugin entries in config: ${configPath}`)
  } else {
    console.log(`No plugin entry toggle needed in config: ${configPath}`)
  }
}

main()
