import type { MaybeRefOrGetter } from 'vue'
import type { NodePingBar, NodePingMetric } from '@/composables/useNodePingDisplay'
import type { NodePingHistoryPoint, NodePingPerTaskStat, PingTaskInfo } from '@/composables/useNodePingStats'
import { computed, watch } from 'vue'
import { getLatencyToneClass, getLossToneClass } from '@/composables/useNodePingDisplay'
import { NODE_PING_BAR_COUNT, useNodePingStats } from '@/composables/useNodePingStats'
import { formatDateTime } from '@/utils/helper'

/** 卡片最多展示的线路数：取后台延迟监测任务列表的前几个 */
export const NODE_PING_LINE_LIMIT = 3

/** 与 useNodePingDisplay 的查询窗口一致，共用同一份共享数据，不额外发请求 */
const PING_LINES_QUERY_HOURS = 1

/** 圆点颜色：按位置取 PingChart 曲线配色的前三个 */
const PING_LINE_COLORS = ['#FF6B6B', '#4ECDC4', '#A78BFA'] as const

/** 记住上次的线路列表，首屏在共享数据返回前先按它渲染，避免卡片高度跳动 */
const LINE_TASKS_CACHE_KEY = 'komari-theme-emerald:ping-line-tasks'
const LINE_TASKS_CACHE_VERSION = 1

/** 卡片上一条线路对应的延迟监测任务 */
export interface NodePingLineTask {
  id: number
  name: string
}

/** 点击某条线路打开弹窗时传给父组件的信息 */
export interface NodePingFocus {
  taskId: number
  name: string
}

/** 卡片上一条线路的展示数据（延迟、丢包面板共用同一组线路） */
export interface NodePingLine {
  key: string
  /** 对应的延迟监测任务 id；占位行（未配置 / 加载中 / 加载失败）为 null */
  taskId: number | null
  name: string
  /** 圆点颜色；占位行为 null，显示灰色 */
  color: string | null
  latencyText: string
  lossText: string
  latencyBars: NodePingBar[]
  lossBars: NodePingBar[]
}

export interface NodePingLinesStatus {
  /** 共享数据已返回（此时任务列表为空即代表后台未配置） */
  loaded: boolean
  loading: boolean
  error: boolean
}

function isLineTask(value: unknown): value is NodePingLineTask {
  if (!value || typeof value !== 'object')
    return false
  const task = value as Record<string, unknown>
  return typeof task.id === 'number' && typeof task.name === 'string'
}

function readLineTasksCache(): NodePingLineTask[] | null {
  if (typeof window === 'undefined')
    return null

  try {
    const raw = window.localStorage.getItem(LINE_TASKS_CACHE_KEY)
    if (!raw)
      return null

    const parsed = JSON.parse(raw) as { version?: number, tasks?: unknown }
    if (parsed.version !== LINE_TASKS_CACHE_VERSION || !Array.isArray(parsed.tasks) || !parsed.tasks.every(isLineTask))
      return null

    return parsed.tasks.slice(0, NODE_PING_LINE_LIMIT)
  }
  catch {
    return null
  }
}

let cachedLineTasks: NodePingLineTask[] | null = readLineTasksCache()
let cachedLineTasksJson = cachedLineTasks ? JSON.stringify(cachedLineTasks) : ''

function persistLineTasks(tasks: NodePingLineTask[]): void {
  const json = JSON.stringify(tasks)
  // 每张卡片都会触发，内容没变就不重复写入
  if (json === cachedLineTasksJson)
    return

  cachedLineTasks = tasks
  cachedLineTasksJson = json

  if (typeof window === 'undefined')
    return

  try {
    window.localStorage.setItem(
      LINE_TASKS_CACHE_KEY,
      JSON.stringify({ version: LINE_TASKS_CACHE_VERSION, tasks }),
    )
  }
  catch {
  }
}

/** 取后台任务列表的前 NODE_PING_LINE_LIMIT 个，只保留 id 与名称 */
export function pickLineTasks(tasks: PingTaskInfo[]): NodePingLineTask[] {
  return tasks.slice(0, NODE_PING_LINE_LIMIT).map(task => ({
    id: task.id,
    name: task.name || `Ping ${task.id}`,
  }))
}

/** 与 useNodePingDisplay 中 buildPingBars 的配色和悬停文案保持一致 */
function buildBars(points: NodePingHistoryPoint[], metric: NodePingMetric, keyPrefix: string): NodePingBar[] {
  return points.map((point, index) => {
    const value = point[metric]
    const time = formatDateTime(point.time, 'HH:mm:ss')

    return {
      key: `${keyPrefix}-${point.time}-${index}`,
      className: value === null
        ? 'bg-muted-foreground/15'
        : metric === 'latency'
          ? getLatencyToneClass(value)
          : getLossToneClass(value),
      tooltip: value === null
        ? `${time} N/A`
        : metric === 'latency'
          ? `${time}\n${Math.round(value)} ms`
          : `${time}\n${value.toFixed(1)}%`,
    }
  })
}

/** 与 useNodePingDisplay 中 buildEmptyPingBars 的样式一致 */
function buildEmptyBars(keyPrefix: string, tooltip: string): NodePingBar[] {
  return Array.from({ length: NODE_PING_BAR_COUNT }, (_, index) => ({
    key: `${keyPrefix}-empty-${index}`,
    className: 'bg-muted-foreground/10',
    tooltip,
  }))
}

function getEmptyTooltip(status: NodePingLinesStatus): string {
  if (status.loading)
    return '加载中'
  if (status.error)
    return '加载失败'
  return 'N/A'
}

/**
 * 生成卡片上的线路行。
 * - 有任务：按任务顺序逐条生成；该节点没有这条线路的记录时显示灰色条形与 "-"
 * - 没有任务：显示一行占位（未配置 / 加载中 / 加载失败），条形灰色，数值 "-"
 */
export function buildNodePingLines(
  tasks: NodePingLineTask[] | null,
  perTaskStats: NodePingPerTaskStat[],
  status: NodePingLinesStatus,
): NodePingLine[] {
  const emptyTooltip = getEmptyTooltip(status)

  if (!tasks?.length) {
    const name = status.loaded
      ? '未配置'
      : status.error
        ? '加载失败'
        : status.loading
          ? '加载中'
          : '未配置'

    return [{
      key: 'placeholder',
      taskId: null,
      name,
      color: null,
      latencyText: '-',
      lossText: '-',
      latencyBars: buildEmptyBars('placeholder-latency', emptyTooltip),
      lossBars: buildEmptyBars('placeholder-loss', emptyTooltip),
    }]
  }

  const statsByTaskId = new Map(perTaskStats.map(stat => [stat.taskId, stat]))

  return tasks.map((task, index) => {
    const stat = statsByTaskId.get(task.id)
    const history = stat?.history ?? []
    const keyPrefix = `task-${task.id}`
    const hasHistory = history.length > 0

    return {
      key: keyPrefix,
      taskId: task.id,
      name: task.name,
      color: PING_LINE_COLORS[index] ?? null,
      latencyText: stat && stat.avgLatency >= 0 ? `${Math.round(stat.avgLatency)} ms` : '-',
      lossText: stat ? `${stat.loss.toFixed(1)}%` : '-',
      latencyBars: hasHistory
        ? buildBars(history, 'latency', `${keyPrefix}-latency`)
        : buildEmptyBars(`${keyPrefix}-latency`, emptyTooltip),
      lossBars: hasHistory
        ? buildBars(history, 'loss', `${keyPrefix}-loss`)
        : buildEmptyBars(`${keyPrefix}-loss`, emptyTooltip),
    }
  })
}

/**
 * 卡片分线路延迟 / 丢包：取后台延迟监测任务列表的前三个，按后台顺序从上到下展示。
 * 所有卡片使用同一组线路；某节点没有某条线路的数据时，该行显示灰色条形与 "-"。
 */
export function useNodePingLines(uuid: MaybeRefOrGetter<string>) {
  const pingStats = useNodePingStats(uuid, { hours: PING_LINES_QUERY_HOURS })

  const lineTasks = computed<NodePingLineTask[] | null>(() => {
    const tasks = pingStats.tasks.value
    // 共享数据尚未返回时先用上次记住的线路列表
    if (!tasks)
      return cachedLineTasks
    return pickLineTasks(tasks)
  })

  watch(
    () => pingStats.tasks.value,
    (tasks) => {
      if (tasks)
        persistLineTasks(pickLineTasks(tasks))
    },
    { immediate: true },
  )

  const lines = computed<NodePingLine[]>(() => buildNodePingLines(
    lineTasks.value,
    pingStats.perTaskStats.value,
    {
      loaded: pingStats.tasks.value !== null,
      loading: pingStats.loading.value,
      error: Boolean(pingStats.error.value),
    },
  ))

  return {
    lines,
  }
}
