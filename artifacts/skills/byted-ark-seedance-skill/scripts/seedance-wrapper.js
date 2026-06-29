#!/usr/bin/env node

/**
 * byted-ark-seedance-skill - 豆包视频生成 Skill v3
 *
 * 🎯 核心职责变更：
 *    v2: 字符串匹配 + 硬编码路由（导致"快速奔跑"误判为 fast 模型）
 *    v3: 模型能力矩阵 + 自动能力推断 + 用户偏好持久化
 *
 * 设计原则：
 *   1. Agent 层只做语义理解，不猜模型参数
 *   2. Wrapper 层负责模型路由，不做语义猜测
 *   3. 能力推断自动化，Agent 只需传用户给的原始参数
 *   4. 用户偏好持久化到 Skill 同级目录
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const PENDING_FILE = path.join(__dirname, '..', '.pending-tasks.json');
const PREFERENCE_FILE = path.join(__dirname, '..', '.user-preference.json');
const MODEL_MATRIX_FILE = path.join(__dirname, '..', 'references', 'seedance-model-matrix.json');
const CLI_SCRIPT = path.join(__dirname, 'seedance.js');

// ============================================
// 📋 模型能力矩阵加载（支持用户扩展）
// ============================================
//
// 加载顺序：
//   1. 默认矩阵（Skill 维护的 references/seedance-model-matrix.json）
//   2. 用户扩展（skill 同级目录的 .user-model-overrides.json）
//      - 用户可以新增模型或覆盖默认模型的能力字段
//      - 用户配置与默认矩阵深度 merge，用户配置优先
//
// 示例 .user-model-overrides.json：
//   {
//     "doubao-seedance-3.0": {
//       "name": "Seedance 3.0",
//       "capabilities": ["text2video", "image2video"],
//       "max_duration_seconds": 30,
//       "supported_resolutions": ["720p", "1080p", "4K"],
//       ...
//     },
//     "doubao-seedance-2.0": {
//       "max_duration_seconds": 20  // 只覆盖部分字段
//     }
//   }
//
const USER_OVERRIDES_FILE = path.join(__dirname, '..', '.user-model-overrides.json');

function loadModelMatrix() {
  const matrix = JSON.parse(fs.readFileSync(MODEL_MATRIX_FILE, 'utf8'));
  
  // 尝试加载用户扩展配置
  if (fs.existsSync(USER_OVERRIDES_FILE)) {
    try {
      const overrides = JSON.parse(fs.readFileSync(USER_OVERRIDES_FILE, 'utf8'));
      for (const [modelId, modelConfig] of Object.entries(overrides)) {
        if (matrix[modelId]) {
          // 覆盖已有模型的部分字段
          Object.assign(matrix[modelId], modelConfig);
        } else {
          // 新增模型
          matrix[modelId] = modelConfig;
        }
      }
    } catch (e) {
      console.error(`⚠️  加载用户模型扩展配置失败: ${e.message}`);
    }
  }
  
  return matrix;
}

// ============================================
// 👤 用户偏好管理
// ============================================
function loadPreferences() {
  if (!fs.existsSync(PREFERENCE_FILE)) {
    return {};
  }
  try {
    return JSON.parse(fs.readFileSync(PREFERENCE_FILE, 'utf8'));
  } catch (e) {
    return {};
  }
}

function savePreferences(prefs) {
  const tmpFile = `${PREFERENCE_FILE}.tmp.${process.pid}.${Date.now()}`;
  fs.writeFileSync(tmpFile, JSON.stringify(prefs, null, 2), 'utf8');
  fs.renameSync(tmpFile, PREFERENCE_FILE);
}

// ============================================
// 🛠️ 参数工具函数
// ============================================

// 从 args 数组中移除指定参数及其值
function removeArgPair(args, argName) {
  const index = args.indexOf(argName);
  if (index !== -1) {
    const next = args[index + 1];
    const deleteCount = next && !next.startsWith('--') ? 2 : 1;
    args.splice(index, deleteCount);
  }
  return args;
}

// 展开 ~ 开头的路径
function expandHome(p) {
  const os = require('os');
  const home = os.homedir();
  if (p === '~') return home;
  if (p.startsWith('~/')) return path.join(home, p.slice(2));
  return p;
}

// 下载目录三级 fallback
function getDefaultDownloadDir() {
  const os = require('os');
  const home = os.homedir();
  const desktop = path.join(home, 'Desktop');
  
  const paths = [
    process.env.ARK_SEEDANCE_SAVE_PATH ? path.resolve(expandHome(process.env.ARK_SEEDANCE_SAVE_PATH)) : null,
    fs.existsSync(desktop) ? path.join(desktop, 'Seedance-Videos') : null,
    path.join(home, 'Seedance-Videos'),
    path.join(process.cwd(), 'Seedance-Videos'),
  ].filter(Boolean);
  
  for (const p of paths) {
    try {
      if (!fs.existsSync(p)) {
        fs.mkdirSync(p, { recursive: true });
      }
      fs.accessSync(p, fs.constants.W_OK);
      return p;
    } catch (e) {
      continue;
    }
  }
  return paths[paths.length - 1];
}

const DEFAULT_DOWNLOAD_DIR = getDefaultDownloadDir();

// 参数格式兼容：自动把 --key=value 拆分成 --key value
function expandEqualsArgs(args) {
  const result = [];
  for (const arg of args) {
    if (arg.startsWith('--') && arg.includes('=')) {
      const [key, ...rest] = arg.split('=');
      result.push(key, rest.join('='));
    } else {
      result.push(arg);
    }
  }
  return result;
}

// 参数命名兼容层
function normalizeArgs(args) {
  args = expandEqualsArgs(args);
  
  const argMap = {
    '--generate_audio': '--generate-audio',
    '--service_tier': '--service-tier',
    '--enable_web_search': '--enable-web-search',
    '--reference_images': '--image-file',
    '--reference_video': '--video-file',
    '--reference_audio': '--audio-file',
    '--api_key': '--api-key',
    '--user_id': '--user-id',
    '--task_id': '--task-id',
    '--return_last_frame': '--return-last-frame',
    '--camera_fixed': '--camera-fixed',
    '--callback_url': '--callback-url',
    '--payload_file': '--payload-file',
    '--base_url': '--base-url',
    '--save_api_key': '--save-api-key',
    '--save_model_preference': '--save-model-preference',
    '--speed_preference': '--speed-preference',
  };
  return args.map(arg => argMap[arg] || arg);
}

// 安全 JSON 解析
function safeJSONParse(stdoutStr) {
  try {
    return JSON.parse(stdoutStr);
  } catch (e) {
    const firstBrace = stdoutStr.indexOf('{');
    const lastBrace = stdoutStr.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1) {
      try {
        return JSON.parse(stdoutStr.substring(firstBrace, lastBrace + 1));
      } catch (err) {
        throw new Error('截取后依然无法解析 JSON');
      }
    }
    throw e;
  }
}

// 获取 args 中某个参数的值
function getArgValue(args, key) {
  const idx = args.indexOf(key);
  if (idx === -1) return null;
  const val = args[idx + 1];
  if (!val || val.startsWith('--')) return null;
  return val;
}

// 判断 args 中是否包含某个参数（布尔参数）
function hasArg(args, key) {
  const idx = args.indexOf(key);
  if (idx === -1) return false;
  // 检查后面是否跟着 false
  const next = args[idx + 1];
  if (next && !next.startsWith('--') && (next === 'false' || next === '0')) return false;
  return true;
}

// ============================================
// 📋 待办任务管理（与 v2 相同）
// ============================================
function ensurePendingFile() {
  if (!fs.existsSync(PENDING_FILE)) {
    fs.writeFileSync(PENDING_FILE, JSON.stringify([], null, 2), 'utf8');
  }
}

function getPendingTasks() {
  ensurePendingFile();
  return JSON.parse(fs.readFileSync(PENDING_FILE, 'utf8'));
}

function savePendingTasks(tasks) {
  const tmpFile = `${PENDING_FILE}.tmp.${process.pid}.${Date.now()}`;
  fs.writeFileSync(tmpFile, JSON.stringify(tasks, null, 2), 'utf8');
  fs.renameSync(tmpFile, PENDING_FILE);
}

function addPendingTask(taskId, prompt, model) {
  const tasks = getPendingTasks();
  tasks.push({
    task_id: taskId,
    prompt: prompt,
    model: model,
    created_at: Date.now(),
  });
  savePendingTasks(tasks);
  console.log(`✅ 任务 ${taskId} 已加入待办列表`);
}

function removePendingTask(taskId) {
  const tasks = getPendingTasks();
  const newTasks = tasks.filter(t => t.task_id !== taskId);
  if (newTasks.length !== tasks.length) {
    savePendingTasks(newTasks);
    console.log(`✅ 任务 ${taskId} 已从待办列表移除`);
  }
}

// ============================================
// 🔧 底层 CLI 调用
// ============================================
function execCLI(args, { silent = false } = {}) {
  const result = spawnSync('node', [CLI_SCRIPT, ...args], {
    encoding: 'utf8',
    env: process.env,
  });
  
  if (!silent) {
    if (result.stdout) console.log(result.stdout);
    if (result.stderr) console.error(result.stderr);
  }
  
  return result;
}

function parseTaskIdFromOutput(output) {
  const match = output.match(/"id":\s*"(cgt-[^"]+)"/);
  if (match) return match[1];
  
  const match2 = output.match(/Created task:\s*(cgt-\S+)/);
  if (match2) return match2[1];
  
  return null;
}

// ============================================
// 🧠 V3 核心：能力自动推断
// ============================================
//
// Agent 层不需要传递 --need-capability，Wrapper 根据原始参数自动推断：
//
// 用户提供了             → 推断出的能力需求
// --image-file / --image-url  → supports_reference_image: true
// --video-file / --video-url  → supports_reference_video: true
// --audio-file / --audio-url  → supports_reference_audio: true
// --enable-web-search true    → supports_web_search: true
// --draft true                → supports_draft: true
// --service-tier flex         → supports_flex_tier: true
// --resolution 1080p          → 需要支持 1080p
// --duration > 10             → 需要 max_duration_seconds >= 请求值
// 多张 --image-file (>=2)     → supports_start_end_frame: true

function inferCapabilities(args) {
  // 统计图片数量（区分首帧/首尾帧 vs 多模态参考）
  const imageFiles = [];
  for (let i = 0; i < args.length; i++) {
    if ((args[i] === '--image-file' || args[i] === '--image-url') && args[i+1] && !args[i+1].startsWith('--')) {
      imageFiles.push(args[i+1]);
    }
  }
  const imageCount = imageFiles.length;
  
  const needs = {
    // 1~2 张图片 = 图生视频（首帧/首尾帧），非多模态参考
    supports_image_to_video: imageCount >= 1 && imageCount <= 2,
    // 3+ 张图片 = 多模态参考图
    supports_reference_image: imageCount >= 3,
    supports_start_end_frame: imageCount === 2,
    supports_reference_video: hasArg(args, '--video-file') || hasArg(args, '--video-url'),
    supports_reference_audio: hasArg(args, '--audio-file') || hasArg(args, '--audio-url'),
    supports_web_search: hasArg(args, '--enable-web-search'),
    supports_draft: hasArg(args, '--draft'),
    supports_flex_tier: getArgValue(args, '--service-tier') === 'flex',
    min_resolution: '480p',
    min_duration: 4,
  };

  // 分辨率需求
  const resolution = getArgValue(args, '--resolution');
  if (resolution) {
    needs.min_resolution = resolution;
  }

  // 时长需求
  const duration = getArgValue(args, '--duration');
  if (duration) {
    const d = parseInt(duration);
    if (!isNaN(d) && d > 0) {
      needs.min_duration = d;
    }
  }

  return needs;
}

// ============================================
// 🧠 V3 核心：模型路由决策
// ============================================
//
// 输入：用户偏好、能力需求、速度偏好
// 输出：{ model, change_reason }
//
// 规则：
//  1. 有偏好模型 → 检查偏好模型能否满足能力需求
//     - 能 → 用偏好模型
//     - 不能 → 选最佳替代，返回原因
//  2. 无偏好 → 按能力需求匹配最佳模型
//
function selectModel(needs, speedPref, userId) {
  const matrix = loadModelMatrix();
  const modelIds = Object.keys(matrix);
  
  // 1️⃣ 加载用户偏好
  const prefs = loadPreferences();
  let preferredModel = null;
  let preferredModelId = null;
  
  if (userId && prefs[userId]) {
    preferredModelId = prefs[userId].preferred_model;
    if (preferredModelId && matrix[preferredModelId]) {
      preferredModel = matrix[preferredModelId];
    }
  }

  // 2️⃣ 如果有偏好，先检查偏好模型是否能满足需求
  if (preferredModel) {
    const issues = checkModelCompatibility(preferredModelId, preferredModel, needs);
    
    if (issues.length === 0) {
      // 偏好模型完全满足 → 直接使用
      return {
        model: preferredModelId,
        change_reason: null
      };
    }

    // 偏好模型不满足 → 找替代模型
    const alt = findBestModel(modelIds, matrix, needs, speedPref, preferredModelId);
    const bestAlternative = alt.model;
    
    if (bestAlternative) {
      const reasonParts = [...issues];
      if (alt.relaxed_reason) reasonParts.push(alt.relaxed_reason);
      return {
        model: bestAlternative,
        change_reason: {
          preferred: preferredModelId,
          reason: `您偏好的 ${matrix[preferredModelId].name} 不支持：${issues.join('、')}。已自动为您切换到 ${matrix[bestAlternative].name}${alt.relaxed_reason ? '。' + alt.relaxed_reason : ''}`,
          fallback_to: bestAlternative
        }
      };
    }

    // 没有替代模型
    return {
      model: preferredModelId,
      change_reason: {
        preferred: preferredModelId,
        reason: `您偏好的 ${matrix[preferredModelId].name} 不完全满足当前需求（${issues.join('、')}），但找不到完全满足的替代模型，将尝试使用偏好模型。`,
        fallback_to: null,
        warnings: issues
      }
    };
  }

  // 3️⃣ 无偏好 → 按需求匹配最佳模型
  const best = findBestModel(modelIds, matrix, needs, speedPref);
  
  if (!best.model) {
    // 没有匹配模型
    return {
      model: modelIds[0],
      change_reason: null
    };
  }
  
  return {
    model: best.model,
    change_reason: best.relaxed_reason ? {
      preferred: null,
      reason: best.relaxed_reason,
      fallback_to: best.model
    } : null
  };
}

// 检查模型是否满足能力需求，返回不满足的项列表
function checkModelCompatibility(modelId, model, needs) {
  const issues = [];
  
  if (needs.supports_image_to_video && !model.capabilities.includes('image2video')) {
    issues.push('图生视频');
  }
  if (needs.supports_reference_image && !model.supports_reference_image) {
    issues.push('图片参考');
  }
  if (needs.supports_reference_video && !model.supports_reference_video) {
    issues.push('视频参考');
  }
  if (needs.supports_reference_audio && !model.supports_reference_audio) {
    issues.push('音频参考');
  }
  if (needs.supports_web_search && !model.supports_web_search) {
    issues.push('联网搜索');
  }
  if (needs.supports_draft && !model.supports_draft) {
    issues.push('样片预览模式');
  }
  if (needs.supports_flex_tier && !model.supports_flex_tier) {
    issues.push('离线/低成本模式');
  }
  if (needs.supports_start_end_frame && !model.supports_start_end_frame) {
    issues.push('首尾帧控制');
  }
  
  // 分辨率
  if (needs.min_resolution !== '480p') {
    const resMatch = needs.min_resolution.match(/(\d+)p/);
    if (resMatch) {
      const neededRes = parseInt(resMatch[1]);
      const supportedRes = model.supported_resolutions.map(r => parseInt(r.match(/(\d+)p/)?.[1] || 0));
      const maxSupported = Math.max(...supportedRes);
      if (neededRes > maxSupported) {
        issues.push(`${needs.min_resolution} 分辨率`);
      }
    }
  }
  
  // 时长
  if (needs.min_duration > model.max_duration_seconds) {
    issues.push(`超过 ${model.max_duration_seconds} 秒的视频时长`);
  }
  
  return issues;
}

// 找最佳匹配模型（返回 { model, relaxed_reason }）
function findBestModel(modelIds, matrix, needs, speedPref, excludeId) {
  // 第一步：筛选出满足所有能力的模型
  const candidates = modelIds.filter(id => {
    if (excludeId && id === excludeId) return false;
    const model = matrix[id];
    return checkModelCompatibility(id, model, needs).length === 0;
  });
  
  if (candidates.length === 0) {
    // 🐛 没有完全匹配的模型时，尝试去掉冲突参数再匹配一次
    // 典型场景：flex + 图片参考 → 去掉 flex，用 2.0 标准版
    const relaxedNeeds = { ...needs };
    let relaxReason = null;
    
    if (needs.supports_flex_tier && (needs.supports_reference_image || needs.supports_reference_video || needs.supports_reference_audio)) {
      relaxedNeeds.supports_flex_tier = false;
      relaxReason = '低成本模式（flex）不支持多图参考/视频/音频，已自动切换到标准模式';
    }
    
    if (relaxReason) {
      const relaxedCandidates = modelIds.filter(id => {
        if (excludeId && id === excludeId) return false;
        return checkModelCompatibility(id, matrix[id], relaxedNeeds).length === 0;
      });
      
      if (relaxedCandidates.length > 0) {
        const best = (() => {
          if (speedPref === 'fast') {
            const fastModels = relaxedCandidates.filter(id => matrix[id].speed === 'fast');
            if (fastModels.length > 0) return fastModels[0];
          }
          const qualityOrder = { 'high': 2, 'standard': 1 };
          relaxedCandidates.sort((a, b) => (qualityOrder[matrix[b].quality] || 0) - (qualityOrder[matrix[a].quality] || 0));
          return relaxedCandidates[0];
        })();
        
        return { model: best, relaxed_reason: relaxReason };
      }
    }
    
    return { model: null, relaxed_reason: null };
  }
  
  // 第二步：如果有速度偏好，优先选 fast 模型
  if (speedPref === 'fast') {
    const fastModels = candidates.filter(id => matrix[id].speed === 'fast');
    if (fastModels.length > 0) return { model: fastModels[0], relaxed_reason: null };
  }
  
  // 第三步：按质量排序
  const qualityOrder = { 'high': 2, 'standard': 1 };
  candidates.sort((a, b) => (qualityOrder[matrix[b].quality] || 0) - (qualityOrder[matrix[a].quality] || 0));
  
  return { model: candidates[0], relaxed_reason: null };
}

// ============================================
// ✅ 偏好设置空转处理
// ============================================
//
// 当用户只说"以后都用 seedance 2.0"而没有 prompt 时，
// 只保存偏好，不报错。
//
function handleSavePreference(args) {
  const modelId = getArgValue(args, '--save-model-preference');
  const userId = getArgValue(args, '--user-id') || 'default';
  
  if (!modelId) return false; // 没有偏好参数，继续正常流程
  
  // 清除偏好
  if (modelId === 'none' || modelId === 'clear') {
    const prefs = loadPreferences();
    delete prefs[userId];
    savePreferences(prefs);
    console.log(JSON.stringify({
      status: 'success',
      message: '已清除您的模型偏好设置，后续将自动选择最佳模型。'
    }));
    return true;
  }
  
  // 校验模型 ID 是否合法
  const matrix = loadModelMatrix();
  if (!matrix[modelId]) {
    console.error(`❌ 未知模型 ID: ${modelId}。支持的模型：${Object.keys(matrix).join(', ')}`);
    process.exit(1);
  }
  
  // 保存偏好
  const prefs = loadPreferences();
  prefs[userId] = {
    preferred_model: modelId,
    updated_at: new Date().toISOString()
  };
  savePreferences(prefs);
  
  // 空转模式：没有 prompt 时只保存偏好
  if (!hasArg(args, '--prompt') && args.indexOf('create') === -1) {
    console.log(JSON.stringify({
      status: 'success',
      message: `已成功保存模型偏好: ${matrix[modelId].name}（${modelId}）。后续生成视频时将优先使用此模型。如需清除，请告诉我「取消模型偏好」。`
    }));
    return true;
  }
  
  return false; // 有 prompt，继续正常流程
}

// ============================================
// 🖼️ 格式化输出
// ============================================
function formatTaskStatus(taskDetail, pendingInfo, downloadDir) {
  const statusMap = {
    'queued': '排队中',
    'running': '生成中',
    'succeeded': '成功',
    'failed': '失败',
    'cancelled': '已取消',
    'expired': '已过期',
  };
  
  const status = taskDetail.status || 'unknown';
  const prompt = pendingInfo?.prompt || taskDetail.request?.content?.[0]?.text || '(无提示词)';
  const elapsed = pendingInfo ? Math.floor((Date.now() - pendingInfo.created_at) / 1000 / 60) : null;
  
  const result = {
    success: status === 'succeeded',
    task_id: taskDetail.id,
    prompt: prompt,
    model: pendingInfo?.model || taskDetail.model || 'unknown',
    status: status,
    status_text: statusMap[status] || status,
    elapsed_minutes: elapsed ? Math.max(1, Math.floor(elapsed)) : null,
  };
  
  if (status === 'succeeded' && taskDetail.content) {
    if (taskDetail.duration) {
      result.duration_seconds = taskDetail.duration;
    }
    
    if (taskDetail.downloads && taskDetail.downloads.length > 0) {
      result.downloads = taskDetail.downloads.map(dl => ({
        type: dl.type || 'video',
        url: dl.url,
        local_path: dl.local_path,
        download_success: dl.download_success,
        download_error: dl.download_error || null,
      }));
    }
    
    if (taskDetail.usage?.completion_tokens) {
      result.tokens_used = taskDetail.usage.completion_tokens;
    }
  }
  
  if (status === 'failed' && taskDetail.error) {
    result.error = {
      code: taskDetail.error.code,
      message: taskDetail.error.message,
    };
  }
  
  return JSON.stringify(result, null, 2);
}

// ============================================
// 🚀 handleCreate - V3 重写
// ============================================
//
// 核心变化：
//   v2: prompt.includes('快速') → 误判
//   v3: 不再用字符串匹配 prompt，只依赖：
//       1. Agent 传入的 --speed-preference 信号
//       2. 自动能力推断
//       3. 用户偏好
//
async function handleCreate(args) {
  args = normalizeArgs(args);
  
  // 0️⃣ 检查是否是纯偏好设置（空转模式）
  if (handleSavePreference(args)) return;
  
  // 1️⃣ 参数合法性校验（与 v2 相同）
  const durationIndex = args.indexOf('--duration');
  const ratioIndex = args.indexOf('--ratio');
  const resolutionIndex = args.indexOf('--resolution');
  const serviceTierIndex = args.indexOf('--service-tier');
  
  if (durationIndex !== -1) {
    const duration = parseInt(args[durationIndex + 1]);
    if (isNaN(duration) || (duration !== -1 && (duration < 4 || duration > 15))) {
      console.error(`❌ 参数校验失败: --duration 必须是 -1（自动）或 4-15 秒，当前值: ${args[durationIndex + 1]}`);
      process.exit(1);
    }
  }
  
  const validRatios = ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9', 'adaptive'];
  if (ratioIndex !== -1 && !validRatios.includes(args[ratioIndex + 1])) {
    console.error(`❌ 参数校验失败: --ratio 支持的值: ${validRatios.join(' / ')}`);
    console.error(`   当前值: ${args[ratioIndex + 1]}`);
    process.exit(1);
  }
  
  const validResolutions = ['480p', '720p', '1080p'];
  if (resolutionIndex !== -1 && !validResolutions.includes(args[resolutionIndex + 1])) {
    console.error(`❌ 参数校验失败: --resolution 支持的值: ${validResolutions.join(' / ')}`);
    console.error(`   当前值: ${args[resolutionIndex + 1]}`);
    process.exit(1);
  }
  
  const validServiceTiers = ['default', 'flex'];
  if (serviceTierIndex !== -1 && !validServiceTiers.includes(args[serviceTierIndex + 1])) {
    console.error(`❌ 参数校验失败: --service-tier 支持的值: ${validServiceTiers.join(' / ')}`);
    console.error(`   当前值: ${args[serviceTierIndex + 1]}`);
    process.exit(1);
  }

  // 2️⃣ 提取参数
  const userId = getArgValue(args, '--user-id') || 'default';
  const speedPref = getArgValue(args, '--speed-preference');
  const hasExplicitModel = args.indexOf('--model') !== -1;
  
  // 3️⃣ V3 核心：模型路由决策
  if (!hasExplicitModel) {
    // 检查环境变量
    const envModel = process.env.ARK_SEEDANCE_MODEL;
    if (envModel) {
      console.log(`🧠 读取环境变量 ARK_SEEDANCE_MODEL: ${envModel}`);
      
      // 仍然做兼容性校验
      const needs = inferCapabilities(args);
      const matrix = loadModelMatrix();
      
      // 检查环境变量模型是否兼容
      if (matrix[envModel]) {
        const issues = checkModelCompatibility(envModel, matrix[envModel], needs);
        if (issues.length > 0) {
          console.log(`⚠️  环境变量指定模型 ${envModel} 不支持当前需求（${issues.join('、')}）`);
          console.log(`   已自动切换为适配模型`);
          // fallback 到路由
          const { model, change_reason } = selectModel(needs, speedPref, userId);
          args.push('--model', model);
          if (change_reason) {
            console.log(JSON.stringify({ model_change_reason: change_reason }));
          }
          console.log(`🧠 [模型路由] 已选择: ${matrix[model].name}`);
        } else {
          args.push('--model', envModel);
          console.log(`🧠 [模型路由] 使用环境变量指定模型: ${matrix[envModel].name}`);
        }
      } else {
        args.push('--model', envModel);
        console.log(`🧠 [模型路由] 使用环境变量指定模型: ${envModel}`);
      }
    } else {
      // 正常路由流程
      const needs = inferCapabilities(args);
      const { model, change_reason } = selectModel(needs, speedPref, userId);
      
      args.push('--model', model);
      
      const matrix = loadModelMatrix();
      console.log(`🧠 [模型路由] 已选择: ${matrix[model]?.name || model}`);
      
      if (change_reason) {
        console.log(JSON.stringify({ model_change_reason: change_reason }));
      }
    }
    
    // 移除 Agent 传入的偏好/速度参数（不传给底层 CLI）
    removeArgPair(args, '--save-model-preference');
    removeArgPair(args, '--speed-preference');
  }

  // 4️⃣ 检测是否需要移除不兼容参数（与 v2 类似，但逻辑更清晰）
  const finalModelIndex = args.indexOf('--model');
  const finalModel = finalModelIndex !== -1 ? args[finalModelIndex + 1] : '';
  const matrix = loadModelMatrix();
  const modelInfo = matrix[finalModel];
  
  if (modelInfo) {
    // 如果最终选择的模型不支持 draft/flex，移除冲突参数
    if (!modelInfo.supports_draft) {
      removeArgPair(args, '--draft');
    }
    if (!modelInfo.supports_flex_tier) {
      removeArgPair(args, '--service-tier');
    }
  }

  // 5️⃣ 预判任务是否适合一开始就走异步
  const shouldStartAsync = (() => {
    const duration = parseInt(getArgValue(args, '--duration') || '5', 10);
    const resolution = getArgValue(args, '--resolution') || '720p';
    const serviceTier = getArgValue(args, '--service-tier') || 'default';
    const hasVideoRef = hasArg(args, '--video-file') || hasArg(args, '--video-url');
    const hasAudioRef = hasArg(args, '--audio-file') || hasArg(args, '--audio-url');
    const explicitWait = hasArg(args, '--wait');
    
    if (explicitWait) return false;
    if (duration > 10) return true;
    if (resolution === '1080p' && finalModel !== 'doubao-seedance-1.5-pro') return true;
    if (hasVideoRef || hasAudioRef) return true;
    return false;
  })();
  
  const waitIndex = args.indexOf('--wait');
  const shouldWait = waitIndex !== -1 && args[waitIndex + 1] !== 'false' && args[waitIndex + 1] !== '0';
  
  const prompt = getArgValue(args, '--prompt') || '';
  
  // 6️⃣ 先创建任务（不传 --wait），立即写 pending，保证任务不会丢
  const createArgs = [...args];
  removeArgPair(createArgs, '--wait');
  
  const createResult = execCLI(['create', ...createArgs], { silent: true });
  
  if (createResult.status !== 0) {
    console.error('❌ 任务创建失败');
    if (createResult.stderr) console.error(createResult.stderr);
    process.exit(createResult.status);
  }
  
  const taskId = parseTaskIdFromOutput(createResult.stdout);
  if (!taskId) {
    console.error('⚠️ 无法解析任务 ID，任务可能已创建但未加入待办列表');
    process.exit(0);
  }
  
  // 立即写 pending，确保不管后续是否超时/被杀，任务都不会丢
  addPendingTask(taskId, prompt, finalModel);
  
  // 7️⃣ 根据预判决定是否前台轮询等待
  const taskDir = path.join(DEFAULT_DOWNLOAD_DIR, taskId);
  
  if (shouldWait || shouldStartAsync) {
    if (shouldStartAsync) {
      // 预判为长任务 → 直接异步，不等待
      console.log('');
      console.log('='.repeat(50));
      console.log('✅ 视频生成任务已提交！');
      console.log(`🆔 任务 ID: ${taskId}`);
      console.log('');
      console.log('💡 任务预计耗时较长，已转入后台生成，完成后会自动通知您~');
    } else {
      // 显式同步（死等）→ 基于已有 taskId 轮询 get，最长 20 分钟，不重复创建任务
      console.log('⏳ 正在生成（显式同步模式，最长等待 20 分钟）');
      const WAIT_TIMEOUT_SEC = 1200; // 20 分钟
      const POLL_INTERVAL_SEC = 5;
      const waitStart = Date.now();
      let found = false;
      
      while (Date.now() - waitStart < WAIT_TIMEOUT_SEC * 1000) {
        // Node 原生 sleep，兼容 Windows
        const sleepPromise = new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_SEC * 1000));
        // 同步等待
        require('child_process').execSync('node -e "setTimeout(()=>{}, ' + (POLL_INTERVAL_SEC * 1000) + ')"', { stdio: 'ignore' });
        
        const pollResult = spawnSync('node', [CLI_SCRIPT, 'get', '--task-id', taskId, '--download-dir', taskDir], {
          encoding: 'utf8',
          env: process.env,
          timeout: 10000,
        });
        
        if (pollResult.status !== 0) continue;
        
        let taskDetail;
        try {
          taskDetail = safeJSONParse(pollResult.stdout);
        } catch (e) {
          continue;
        }
        
        if (taskDetail.status === 'succeeded') {
          found = true;
          // 成功，再次 get 下载完整结果
          const downloadResult = spawnSync('node', [CLI_SCRIPT, 'get', '--task-id', taskId, '--download-dir', taskDir], {
            encoding: 'utf8',
            env: process.env,
            timeout: 30000,
          });
          
          let finalDetail;
          try {
            finalDetail = safeJSONParse(downloadResult.stdout);
          } catch (e) {
            finalDetail = taskDetail;
          }
          
          removePendingTask(taskId);
          console.log('');
          console.log(formatTaskStatus(finalDetail, { task_id: taskId, prompt, model: finalModel, created_at: Date.now() }, taskDir));
          console.log('');
          console.log('='.repeat(50));
          break;
        }
        
        if (['failed', 'cancelled', 'expired'].includes(taskDetail.status)) {
          found = true;
          removePendingTask(taskId);
          console.log('');
          console.log(formatTaskStatus(taskDetail, { task_id: taskId, prompt, model: finalModel, created_at: Date.now() }, taskDir));
          break;
        }
        
        process.stdout.write('.');
      }
      
      if (!found) {
        console.log('');
        console.log('⚠️ 显式同步超时（20 分钟），任务仍在后台运行，Cron 会继续检查');
      }
    }
    return;
  }
  
  // 8️⃣ 默认同步：前台轮询最多 5 分钟
  const SYNC_TIMEOUT_SEC = 300;
  const POLL_INTERVAL_SEC = 5;
  const startTime = Date.now();
  let lastStatus = '';
  
  process.stdout.write('⏳ 正在生成');
  
  while (Date.now() - startTime < SYNC_TIMEOUT_SEC * 1000) {
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    process.stdout.write('.');
    
    // 轮询间隔（用 node -e setTimeout 代替 Unix sleep，兼容 Windows）
    spawnSync('node', ['-e', `setTimeout(()=>{},${POLL_INTERVAL_SEC * 1000})`], { stdio: 'ignore' });
    
    // 查询任务状态
    const taskDir = path.join(DEFAULT_DOWNLOAD_DIR, taskId);
    const pollResult = spawnSync('node', [CLI_SCRIPT, 'get', '--task-id', taskId, '--download-dir', taskDir], {
      encoding: 'utf8',
      env: process.env,
      timeout: 10000,
    });
    
    if (pollResult.status !== 0) continue;
    
    let taskDetail;
    try {
      taskDetail = safeJSONParse(pollResult.stdout);
    } catch (e) {
      continue;
    }
    
    if (taskDetail.status === 'succeeded') {
      process.stdout.write(' ✅\n');
      const downloadResult = spawnSync('node', [CLI_SCRIPT, 'get', '--task-id', taskId, '--download-dir', taskDir], {
        encoding: 'utf8',
        env: process.env,
        timeout: 30000,
      });
      
      let finalDetail;
      try {
        finalDetail = safeJSONParse(downloadResult.stdout);
      } catch (e) {
        finalDetail = taskDetail;
      }
      
      removePendingTask(taskId);
      console.log('');
      console.log(formatTaskStatus(finalDetail, { task_id: taskId, prompt, model: finalModel, created_at: startTime }, taskDir));
      console.log('');
      console.log('='.repeat(50));
      return;
    }
    
    if (['failed', 'cancelled', 'expired'].includes(taskDetail.status)) {
      process.stdout.write(' ❌\n');
      removePendingTask(taskId);
      console.log('');
      console.log(formatTaskStatus(taskDetail, { task_id: taskId, prompt, model: finalModel, created_at: startTime }, taskDir));
      return;
    }
    
    if (lastStatus !== taskDetail.status) {
      lastStatus = taskDetail.status;
      process.stdout.write(`(${taskDetail.status})`);
    }
  }
  
  // 9️⃣ 5 分钟超时 → 自动转后台，pending 已经存在，无需再写
  process.stdout.write(' ⏰\n');
  console.log('');
  console.log('='.repeat(50));
  console.log('⏰ 当前生成人数较多，视频正在后台生成中，完成后会自动通知您~');
  console.log(`🆔 任务 ID: ${taskId}`);
  console.log('');
  console.log('💡 您可以先去忙别的，稍后我会主动告诉您结果');
}

// ============================================
// 📋 handleGet / handleCheckPending / handleList / handleDelete
// （与 v2 相同，略作兼容性微调）
// ============================================
async function handleGet(args) {
  args = normalizeArgs(args);

  let downloadDir;
  const dirIndex = args.indexOf('--download-dir');
  const taskIdIndex = args.indexOf('--task-id');
  const taskId = taskIdIndex !== -1 ? args[taskIdIndex + 1] : 'unknown';

  if (dirIndex !== -1) {
    downloadDir = args[dirIndex + 1];
  } else {
    downloadDir = path.join(DEFAULT_DOWNLOAD_DIR, taskId);
    args.push('--download-dir', downloadDir);
  }

  const result = execCLI(['get', ...args], { silent: true });
  
  if (result.status !== 0) {
    if (result.stderr) console.error(result.stderr);
    process.exit(result.status);
  }
  
  let taskDetail;
  try {
    taskDetail = safeJSONParse(result.stdout);
  } catch (e) {
    console.log(`⚠️ 无法解析任务状态`);
    return;
  }
  
  const pendingTasks = getPendingTasks();
  const pendingInfo = pendingTasks.find(t => t.task_id === taskDetail.id);
  
  console.log('');
  console.log(formatTaskStatus(taskDetail, pendingInfo, downloadDir));
  console.log('');
  
  const status = taskDetail.status;
  if (['succeeded', 'failed', 'cancelled', 'expired'].includes(status)) {
    removePendingTask(taskDetail.id);
  }
}

async function handleCheckPending(args = []) {
  args = normalizeArgs(args);
  
  const pendingTasks = getPendingTasks();
  
  if (pendingTasks.length === 0) {
    console.log('📭 没有待完成的任务');
    return;
  }
  
  const completedTasks = [];
  const inProgressTasks = [];
  
  for (const pendingTask of pendingTasks) {
    const taskDownloadDir = path.join(DEFAULT_DOWNLOAD_DIR, pendingTask.task_id);
    
    const result = execCLI(['get', ...args, '--task-id', pendingTask.task_id, '--download-dir', taskDownloadDir], { silent: true });
    
    if (result.status !== 0) {
      console.log(`❌ 查询任务 ${pendingTask.task_id} 失败`);
      if (result.stderr) {
        console.log(`   原因: ${result.stderr.trim()}`);
      }
      continue;
    }
    
    let taskDetail;
    try {
      taskDetail = safeJSONParse(result.stdout);
    } catch (e) {
      console.log(`⚠️ 无法解析任务 ${pendingTask.task_id} 的状态`);
      continue;
    }
    
    const status = taskDetail.status;
    
    if (['succeeded', 'failed', 'cancelled', 'expired'].includes(status)) {
      completedTasks.push({ pending: pendingTask, detail: taskDetail, downloadDir: taskDownloadDir });
    } else {
      inProgressTasks.push({ pending: pendingTask, detail: taskDetail });
    }
  }
  
  if (completedTasks.length > 0) {
    for (const item of completedTasks) {
      console.log(formatTaskStatus(item.detail, item.pending, item.downloadDir));
      console.log('');
      
      removePendingTask(item.pending.task_id);
    }
  }
  
  if (inProgressTasks.length > 0) {
    const elapsedList = inProgressTasks.map(item => {
      const elapsed = Math.floor((Date.now() - item.pending.created_at) / 1000 / 60);
      return `${item.pending.task_id} - ${elapsed} 分钟`;
    });
    console.log(`⚙️ 进行中: ${inProgressTasks.length} 个（${elapsedList.join('、')}）`);
  }
}

async function handleList(args) {
  args = normalizeArgs(args);
  const result = execCLI(['list', ...args]);
  if (result.status !== 0) process.exit(result.status);
}

async function handleDelete(args) {
  args = expandEqualsArgs(args);
  args = normalizeArgs(args);
  
  let taskId;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--task-id' && args[i+1]) taskId = args[i+1];
  }
  
  const result = execCLI(['delete', ...args]);
  
  if (taskId) {
    try {
      removePendingTask(taskId);
    } catch (e) {
      // 静默失败
    }
  }
  
  if (result.status !== 0) {
    process.exit(result.status);
  }
}

// ============================================
// 🚪 主入口
// ============================================
async function main() {
  const args = process.argv.slice(2);

  let command = 'help';
  let commandArgs = [];

  if (args.length > 0) {
    if (!args[0].startsWith('--')) {
      // 显式指定了子命令，如 create, get, list
      command = args[0];
      commandArgs = args.slice(1);
    } else {
      // 🚀 核心修复：如果 Agent 没传命令直接传参数，默认视为 create 任务
      command = 'create';
      commandArgs = args;
    }
  }

  // 全局处理偏好设置：任何命令都可能携带偏好参数（尤其是空转模式下的单传）
  if (hasArg(commandArgs, '--save-model-preference')) {
    if (handleSavePreference(commandArgs)) return;
  }

  switch (command) {
    case 'create':
      await handleCreate(commandArgs);
      break;
    case 'get':
      await handleGet(commandArgs);
      break;
    case 'check-pending':
      await handleCheckPending(commandArgs);
      break;
    case 'list':
      await handleList(commandArgs);
      break;
    case 'delete':
      await handleDelete(commandArgs);
      break;
    case 'help':
    default:
      console.log(`
Seedance Skill v3 - 豆包视频生成（模型路由版）

用法:
  node seedance-wrapper.js create [options]   创建视频任务（自动模型路由）
  node seedance-wrapper.js get --task-id <id>  查询单个任务
  node seedance-wrapper.js check-pending        批量检查待办任务
  node seedance-wrapper.js list [options]       列出历史任务
  node seedance-wrapper.js delete --task-id <id> 删除任务

新增 V3 参数:
  --save-model-preference <model-id>  设置用户偏好模型（如 seedance-2.0）
                                      传入 none/clear 清除偏好
  --speed-preference <fast|normal>    速度偏好信号（仅当用户说"快点出"时传）

模型路由机制:
  1. Agent 传 --speed-preference（语义信号），Wrapper 做模型选择
  2. 用户偏好优先，不满足时自动降级并说明原因
  3. 能力自动推断（无需 Agent 传 --need-capability）
      `.trim());
  }
}

main().catch(e => {
  console.error('❌ 执行失败:', e.message);
  console.error(e.stack);
  process.exit(1);
});