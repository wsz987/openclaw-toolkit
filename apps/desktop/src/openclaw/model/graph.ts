import type { InstallStep, MasterPhase, StepDiagnostic } from './types';

export const installerSteps: Array<{ id: InstallStep; title: string; description: string }> = [
  { id: 'loadManifest', title: '加载 Manifest', description: '读取工具包和制品清单' },
  { id: 'checkEnvironment', title: '检查环境', description: '确认当前系统满足安装前提' },
  { id: 'selectInstallMode', title: '选择安装模式', description: '确认本地、远程或 npm 安装模式' },
  { id: 'resolveOpenClawVersion', title: '解析 OpenClaw 版本', description: '选出当前要安装的 OpenClaw 版本' },
  { id: 'resolveNodeRuntime', title: '解析 Node Runtime', description: '计算受管 Node Runtime 目标目录' },
  { id: 'installNodeRuntime', title: '安装 Node Runtime', description: '下载或解压 Node Runtime' },
  { id: 'resolveOpenClawArtifact', title: '解析 OpenClaw 制品', description: '确定 OpenClaw 制品来源' },
  { id: 'installOpenClaw', title: '安装 OpenClaw', description: '下载安装到目标目录' },
  { id: 'writeInstalledManifest', title: '写入安装记录', description: '记录本机安装结果' },
  { id: 'generateOpenClawConfig', title: '生成 OpenClaw 配置', description: '生成 openclaw.json 配置文件' },
  { id: 'installSkills', title: '安装 Skills', description: '写入并同步技能资源' },
  { id: 'configurePermissions', title: '配置权限', description: '应用文件与命令白名单' },
  { id: 'configureBrowser', title: '配置浏览器环境', description: '确认浏览器运行环境可用' },
  { id: 'verifyRuntime', title: '验证运行环境', description: '执行最终运行校验' }
];

const installerStepSet = new Set(installerSteps.map((step) => step.id));

export function isInstallStep(value: string): value is InstallStep {
  return installerStepSet.has(value as InstallStep);
}

export const masterPhases: MasterPhase[] = [
  {
    id: 'verify-pre',
    label: '基础初始化',
    steps: ['loadManifest', 'checkEnvironment', 'selectInstallMode', 'resolveOpenClawVersion']
  },
  {
    id: 'dependencies',
    label: '激活与配置',
    steps: ['resolveNodeRuntime', 'installNodeRuntime', 'resolveOpenClawArtifact', 'installOpenClaw']
  },
  {
    id: 'config-write',
    label: '核心包部署',
    steps: ['writeInstalledManifest', 'generateOpenClawConfig', 'installSkills', 'configurePermissions']
  },
  {
    id: 'final-check',
    label: '配置与运行验证',
    steps: ['configureBrowser', 'verifyRuntime']
  }
];

export const stepDiagnosticsMap: Record<InstallStep, StepDiagnostic> = {
  loadManifest: {
    title: '加载 Manifest 资源清单',
    description: '正在读取安装包及包含的工具链元数据配置...',
    tasks: [
      { label: '定位内置安装资源目录', key: 'resource-root' },
      { label: '读取 toolkit-manifest.json 配置文件', key: 'toolkit-manifest' }
    ]
  },
  checkEnvironment: {
    title: '系统运行环境检测',
    description: '进行基础环境与架构兼容性检验，确保工具可在当前系统正常运作...',
    tasks: [
      { label: '校验操作系统类型 (当前要求 Windows 架构)', key: 'windows' },
      { label: '测试安装资源目录与访问权限', key: 'resource-root' }
    ]
  },
  selectInstallMode: {
    title: '安装模式与分发源分析',
    description: '识别当前的部署来源 and 网络策略，匹配最优核心包提取逻辑...',
    tasks: [
      { label: '比对安装模式 (本地离线 / 远程下载 / npm 抓取)', key: 'install-mode' },
      { label: '校验安装模式所对应的参数就绪状态', key: 'release-manifest' }
    ]
  },
  resolveOpenClawVersion: {
    title: '解析目标 OpenClaw 版本',
    description: '匹配目标版本或最新推荐标签，校验版本兼容性规则...',
    tasks: [
      { label: '下载/解析制品清单 manifest.json', key: 'release-manifest' },
      { label: '确定部署的目标版本号', key: 'selected-version' }
    ]
  },
  resolveNodeRuntime: {
    title: '计算受管 Node.js 运行时路径',
    description: '匹配系统兼容的受管 Node.js 核心版本，并解析本地目录结构...',
    tasks: [
      { label: '获取此 OpenClaw 版本兼容的 Node.js 版本要求', key: 'node-runtime' },
      { label: '计算受管运行时隔离安装路径', key: 'node-runtime' }
    ]
  },
  installNodeRuntime: {
    title: '部署 Node.js 运行时环境',
    description: '安装并同步所需的沙箱内嵌 Node 运行时，不修改系统全局变量...',
    tasks: [
      { label: '定位离线 Node.js 压缩包或下载远程源制品', key: 'node-runtime' },
      { label: '解压运行时程序，校验核心 Node 二进制执行文件', key: 'node-runtime' }
    ]
  },
  resolveOpenClawArtifact: {
    title: '解析 OpenClaw 主程序制品',
    description: '定位待部署的安装包源路径，校验校验和与完整性...',
    tasks: [
      { label: '寻找匹配版本号的 OpenClaw 安装介质', key: 'release-manifest' },
      { label: '确认制品包分发来源已确定', key: 'release-manifest' }
    ]
  },
  installOpenClaw: {
    title: '安装部署 OpenClaw 核心程序',
    description: '备份已有旧版本文件，解压最新核心程序资源并写入隔离执行环境...',
    tasks: [
      { label: '备份并隔离冲突的旧版本文件夹', key: 'openclaw-install' },
      { label: '写入核心程序文件及依赖模块到 openclaw 目录', key: 'openclaw-install' }
    ]
  },
  writeInstalledManifest: {
    title: '生成并写入安装元数据记录',
    description: '登记本次成功写入本机的组件清单及版本信息，供日后升级校验...',
    tasks: [
      { label: '生成本地安装清单数据 installed-manifest.json', key: 'openclaw-install' },
      { label: '写入信息至 OpenClaw 安装根目录', key: 'openclaw-install' }
    ]
  },
  generateOpenClawConfig: {
    title: '配置系统运行参数 openclaw.json',
    description: '解析配置输入并保存为主程序的配置文件，包括端口、进程守护及运行策略...',
    tasks: [
      { label: '计算端口占用和本地 Node 环境变量映射关系', key: 'config' },
      { label: '生成并持久化 openclaw.json 文件', key: 'config' }
    ]
  },
  installSkills: {
    title: '拷贝并装载技能库资源 (Skills)',
    description: '同步预置技能模块，支持离线或远程扩展的微应用技能加载...',
    tasks: [
      { label: '读取并解析打包带有的技能清单 (Skills)', key: 'openclaw-install' },
      { label: '拷贝并部署技能脚本文件到指定 skills 目录下', key: 'openclaw-install' }
    ]
  },
  configurePermissions: {
    title: '应用命令与路径安全访问限制',
    description: '根据运行策略激活安全限制，限定读写和调用底层工具权限...',
    tasks: [
      { label: '配置命令执行和文件读写白名单', key: 'config' },
      { label: '设置沙箱安全隔离过滤规则', key: 'config' }
    ]
  },
  configureBrowser: {
    title: '配置无头浏览器驱动与运行沙箱',
    description: '扫描系统内置 Chrome/Edge 路径，适配运行时所需的浏览器调用环境...',
    tasks: [
      { label: '寻检系统中符合版本要求的浏览器及驱动位置', key: 'windows' },
      { label: '构建浏览器驱动桥接通道及参数配置', key: 'windows' }
    ]
  },
  verifyRuntime: {
    title: '运行环境就绪性联调验证',
    description: '进行首次冷启动测试，抓取心跳包验证最终运行时生命周期是否正常...',
    tasks: [
      { label: '拉起隔离 Node 服务，加载 OpenClaw 主控制进程', key: 'openclaw-install' },
      { label: '发送健康度检测并接收心跳确认，确认配置就绪', key: 'config' }
    ]
  }
};

export const STEP1_CHECK_IDS = ['windows', 'resource-root', 'toolkit-manifest'];
export const STEP2_CHECK_IDS = ['install-mode', 'release-manifest', 'selected-version', 'system-openclaw'];
export const STEP3_SPLIT_INDEX = 8;
