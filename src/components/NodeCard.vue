<script setup lang="ts">
import type { NodeData } from '@/stores/nodes'
import { Icon } from '@iconify/vue'
import { computed } from 'vue'
import { CardX } from '@/components/ui/card-x'
import { DataTooltip } from '@/components/ui/data-tooltip'
import { ProgressThin } from '@/components/ui/progress-thin'
import { useNodePingDisplay } from '@/composables/useNodePingDisplay'
import { useAppStore } from '@/stores/app'
import { formatBytesPerSecondWithConfig, formatBytesWithConfig, formatDateTime, formatUptimeWithFormat, getStatus } from '@/utils/helper'
import { getOSImage, getOSName } from '@/utils/osImageHelper'
import { getRegionCode, getRegionDisplayName } from '@/utils/regionHelper'
import { formatPriceWithCycle, getDaysUntilExpired, getExpireStatus, getExpireText, hasIPv4, hasIPv6, parseTags } from '@/utils/tagHelper'

const props = defineProps<{ node: NodeData }>()

const emit = defineEmits<{ click: [] }>()

const appStore = useAppStore()

/** 价格斜杠两侧空格匹配（提到模块作用域避免重复编译） */
const PRICE_SLASH_SPACE_REGEX = /\s*\/\s*/g

const formatBytes = (bytes: number) => formatBytesWithConfig(bytes, appStore.byteDecimals)
const formatBytesPerSecond = (bytes: number) => formatBytesPerSecondWithConfig(bytes, appStore.byteDecimals)
const formatUptime = (seconds: number) => formatUptimeWithFormat(seconds, 'hour')
const offlineTime = computed(() => formatDateTime(props.node.time))

const cpuStatus = computed(() => getStatus(props.node.cpu ?? 0))
const memPercentage = computed(() => (props.node.ram ?? 0) / (props.node.mem_total || 1) * 100)
const memStatus = computed(() => getStatus(memPercentage.value))
const diskPercentage = computed(() => (props.node.disk ?? 0) / (props.node.disk_total || 1) * 100)
const diskStatus = computed(() => getStatus(diskPercentage.value))

const {
  latencyRenderBars,
  lossRenderBars,
  latencyDisplay,
  lossDisplay,
  latencyPanelTooltip,
  lossPanelTooltip,
} = useNodePingDisplay(() => props.node.uuid)

function showTrafficProgress(node: NodeData): boolean {
  return node.traffic_limit > 0
}

const trafficUsed = computed(() => {
  const { net_total_up = 0, net_total_down = 0, traffic_limit_type } = props.node
  switch (traffic_limit_type) {
    case 'up': return net_total_up
    case 'down': return net_total_down
    case 'min': return Math.min(net_total_up, net_total_down)
    case 'max': return Math.max(net_total_up, net_total_down)
    case 'sum':
    default: return net_total_up + net_total_down
  }
})

const trafficUsedPercentage = computed(() => {
  if (props.node.traffic_limit <= 0)
    return 0
  return Math.min((trafficUsed.value / props.node.traffic_limit) * 100, 100)
})

/** 系统 架构 副信息 */
const subText = computed(() => {
  const parts: Array<string> = []
  const osName = getOSName(props.node.os)
  if (osName)
    parts.push(osName)
  if (props.node.arch)
    parts.push(props.node.arch)
  return parts.join(' ')
})

/** CPU 核数 meta */
const cpuMeta = computed(() => {
  const cores = props.node.cpu_cores
  if (!cores || cores <= 0)
    return ''
  return appStore.lang === 'zh-CN' ? `${cores} 核` : `${cores} cores`
})

/** 是否显示价格 */
const showPrice = computed(() => props.node.price !== 0)

/** 价格文本（去除斜杠两侧空格，如 $49/年） */
const priceText = computed(() =>
  formatPriceWithCycle(props.node.price, props.node.billing_cycle, props.node.currency, appStore.lang)
    .replace(PRICE_SLASH_SPACE_REGEX, '/'),
)

/** 到期信息（日期有效时显示；长期显示“长期”，与价格是否为 0 无关） */
const expireInfo = computed(() => {
  if (!props.node.expired_at)
    return null
  const days = getDaysUntilExpired(props.node.expired_at)
  const status = getExpireStatus(props.node.expired_at)
  // 过滤无效/哨兵日期（未设置到期时间）
  if (days < -36500)
    return null
  let colorClass = 'text-foreground/85'
  if (status === 'expired' || status === 'critical')
    colorClass = 'text-red-500'
  else if (status === 'warning')
    colorClass = 'text-amber-500'
  return {
    text: getExpireText(props.node.expired_at, appStore.lang),
    colorClass,
  }
})

/** 自定义标签（保留颜色信息） */
const customTags = computed(() => parseTags(props.node.tags))

function hasRegion(region: string | null | undefined): boolean {
  return Boolean(region?.trim())
}
</script>

<template>
  <CardX
    hoverable
    class="node-card w-full h-full cursor-pointer bg-background/50 border-none shadow-[0_0_0_3px] shadow-transparent hover:bg-background hover:shadow-slate-500/10 backdrop-blur-sm transition-all duration-200 rounded-md"
    :class="[!props.node.online && '!shadow-red-600/20']" @click="emit('click')"
  >
    <template #header>
      <div class="flex gap-2 min-w-0 items-center">
        <img
          v-if="hasRegion(props.node.region)" :src="`/images/flags/${getRegionCode(props.node.region)}.svg`"
          :alt="getRegionDisplayName(props.node.region)" class="size-5 shrink-0 rounded-[2px]"
        >
        <span class="text-md font-bold flex-1 min-w-0 truncate">{{ props.node.name }}</span>
      </div>
    </template>

    <template #header-extra>
      <div class="flex gap-1.5 items-center">
        <img :src="getOSImage(props.node.os)" :alt="getOSName(props.node.os)" class="size-4 opacity-70">
        <span
          v-if="hasIPv4(props.node.ipv4)"
          class="text-[9px] font-semibold leading-[1.4] px-1.5 rounded-full bg-blue-500/15 text-blue-500 border border-blue-500/20"
        >IPv4</span>
        <span
          v-if="hasIPv6(props.node.ipv6)"
          class="text-[9px] font-semibold leading-[1.4] px-1.5 rounded-full bg-blue-500/15 text-blue-500 border border-blue-500/20"
        >IPv6</span>
        <DataTooltip
          placement="left"
          :content="formatUptime(props.node.uptime ?? 0)"
          class="size-2 rounded-full shrink-0" :class="[props.node.online ? 'bg-green-600' : 'bg-red-600']"
          content-class="whitespace-nowrap"
        >
          <div
            class="animate-ping absolute inset-0 rounded-full opacity-50"
            :class="[props.node.online ? 'bg-green-600' : 'bg-red-600']"
          />
        </DataTooltip>
      </div>
    </template>

    <template #default>
      <div class="flex flex-col gap-3">
        <!-- 副信息行：系统 架构 + 价格 -->
        <div v-if="subText || showPrice" class="flex gap-1.5 items-center -mt-1">
          <span class="text-[11px] text-muted-foreground truncate min-w-0 flex-1">{{ subText || '\u00A0' }}</span>
          <span
            v-if="showPrice"
            class="shrink-0 inline-flex items-center h-[20px] px-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300 text-[11px] font-extrabold leading-none whitespace-nowrap"
          >{{ priceText }}</span>
        </div>

        <!-- 两列主体 -->
        <div class="relative">
          <div
            v-if="!props.node.online"
            class="absolute inset-0 z-1 flex flex-col gap-1 items-center justify-center text-center"
            aria-hidden="true"
          >
            <div class="text-sm font-medium text-destructive">
              离线
            </div>
            <div class="text-xs text-muted-foreground">
              {{ offlineTime }}
            </div>
          </div>

          <div class="grid grid-cols-2 gap-x-3.5" :class="[!props.node.online ? 'blur-xs opacity-60' : '']">
            <!-- 左列 -->
            <div class="flex flex-col gap-[7px] min-w-0">
              <!-- CPU -->
              <div class="flex flex-col gap-[3px]">
                <div class="flex items-center gap-1.5 text-[11px] leading-none">
                  <Icon icon="tabler:cpu" width="14" height="14" class="text-muted-foreground shrink-0" />
                  <span class="font-semibold text-muted-foreground">CPU</span>
                  <span class="text-[10px] font-semibold text-muted-foreground truncate min-w-0 flex-1">{{ cpuMeta }}</span>
                  <span class="ml-auto font-bold text-xs tabular-nums text-foreground/85 shrink-0">{{ (props.node.cpu ?? 0).toFixed(1) }}%</span>
                </div>
                <ProgressThin :percentage="props.node.cpu ?? 0" :status="cpuStatus" bar-class="bg-gradient-to-r from-blue-500 to-blue-400" :height="5" />
              </div>

              <!-- 磁盘 -->
              <div class="flex flex-col gap-[3px]">
                <div class="flex items-center gap-1.5 text-[11px] leading-none">
                  <Icon icon="tabler:database" width="14" height="14" class="text-muted-foreground shrink-0" />
                  <span class="font-semibold text-muted-foreground">磁盘</span>
                  <span class="text-[10px] font-semibold text-muted-foreground truncate min-w-0 flex-1">{{ formatBytes(props.node.disk_total ?? 0) }}</span>
                  <span class="ml-auto font-bold text-xs tabular-nums text-foreground/85 shrink-0">{{ diskPercentage.toFixed(1) }}%</span>
                </div>
                <ProgressThin :percentage="diskPercentage" :status="diskStatus" bar-class="bg-gradient-to-r from-amber-500 to-amber-400" :height="5" />
              </div>

              <!-- 下载速率 -->
              <div class="flex items-center gap-1.5 text-[11px] leading-none">
                <Icon icon="tabler:arrow-down" width="14" height="14" class="text-blue-500 shrink-0" />
                <span class="font-semibold text-muted-foreground">下载</span>
                <span class="ml-auto font-semibold text-xs tabular-nums text-foreground/85">{{ formatBytesPerSecond(props.node.net_in ?? 0) }}</span>
              </div>

              <!-- 下载流量 -->
              <div class="flex items-center gap-1.5 text-[11px] leading-none">
                <Icon icon="tabler:cloud" width="14" height="14" class="text-muted-foreground/70 shrink-0" />
                <span class="font-semibold text-muted-foreground whitespace-nowrap shrink-0">下载流量</span>
                <span class="ml-auto font-semibold text-xs tabular-nums text-foreground/85">{{ formatBytes(props.node.net_total_down ?? 0) }}</span>
              </div>

              <!-- 延迟 -->
              <div class="group/panel flex flex-col gap-1" :title="latencyPanelTooltip">
                <div class="flex items-center gap-1.5 text-[11px] leading-none">
                  <Icon icon="tabler:activity" width="14" height="14" class="text-blue-500 shrink-0" />
                  <span class="font-semibold text-muted-foreground">延迟</span>
                  <span class="ml-auto font-semibold text-xs tabular-nums text-foreground/85">{{ latencyDisplay }}</span>
                </div>
                <div
                  class="grid h-4 items-end gap-[1px] opacity-80 group-hover/panel:opacity-100 cursor-auto"
                  :style="{ gridTemplateColumns: `repeat(${latencyRenderBars.length}, minmax(0, 1fr))` }"
                >
                  <DataTooltip v-for="bar in latencyRenderBars" :key="bar.key" placement="top" :content="bar.tooltip" class="h-full w-full">
                    <span
                      class="block h-full w-full rounded-[1px] transition-transform duration-150 group-hover/data-tooltip:scale-y-160 group-hover/panel:opacity-60 group-hover/data-tooltip:!opacity-100"
                      :class="bar.className"
                    />
                  </DataTooltip>
                </div>
              </div>

              <!-- 到期 -->
              <div
                v-if="expireInfo"
                class="flex items-center gap-1.5 text-[11px] leading-none border-t border-muted-foreground/10 pt-1.5 mt-0.5"
              >
                <Icon icon="tabler:calendar" width="14" height="14" class="text-muted-foreground shrink-0" />
                <span class="font-semibold text-muted-foreground whitespace-nowrap shrink-0">到期</span>
                <span class="ml-auto font-bold text-xs tabular-nums shrink-0" :class="expireInfo.colorClass">{{ expireInfo.text }}</span>
              </div>
            </div>

            <!-- 右列 -->
            <div class="flex flex-col gap-[7px] min-w-0">
              <!-- 内存 -->
              <div class="flex flex-col gap-[3px]">
                <div class="flex items-center gap-1.5 text-[11px] leading-none">
                  <Icon icon="tabler:device-sd-card" width="14" height="14" class="text-muted-foreground shrink-0" />
                  <span class="font-semibold text-muted-foreground">内存</span>
                  <span class="text-[10px] font-semibold text-muted-foreground truncate min-w-0 flex-1">{{ formatBytes(props.node.mem_total ?? 0) }}</span>
                  <span class="ml-auto font-bold text-xs tabular-nums text-foreground/85 shrink-0">{{ memPercentage.toFixed(1) }}%</span>
                </div>
                <ProgressThin :percentage="memPercentage" :status="memStatus" bar-class="bg-gradient-to-r from-purple-500 to-purple-400" :height="5" />
              </div>

              <!-- 月度流量 -->
              <div class="flex flex-col gap-[3px]">
                <div class="flex items-center gap-1.5 text-[11px] leading-none">
                  <Icon icon="tabler:chart-pie" width="14" height="14" class="text-muted-foreground shrink-0" />
                  <span class="font-semibold text-muted-foreground whitespace-nowrap shrink-0">月度</span>
                  <span class="ml-auto font-bold text-xs tabular-nums text-foreground/85 shrink-0 whitespace-nowrap">
                    <template v-if="showTrafficProgress(node)">{{ formatBytes(trafficUsed) }}/{{ formatBytes(props.node.traffic_limit) }}</template>
                    <template v-else>{{ formatBytes(trafficUsed) }}/∞</template>
                  </span>
                </div>
                <ProgressThin :percentage="trafficUsedPercentage" bar-class="bg-gradient-to-r from-emerald-500 to-emerald-400" :height="5" />
              </div>

              <!-- 上传速率 -->
              <div class="flex items-center gap-1.5 text-[11px] leading-none">
                <Icon icon="tabler:arrow-up" width="14" height="14" class="text-green-500 shrink-0" />
                <span class="font-semibold text-muted-foreground">上传</span>
                <span class="ml-auto font-semibold text-xs tabular-nums text-foreground/85">{{ formatBytesPerSecond(props.node.net_out ?? 0) }}</span>
              </div>

              <!-- 上传流量 -->
              <div class="flex items-center gap-1.5 text-[11px] leading-none">
                <Icon icon="tabler:cloud" width="14" height="14" class="text-muted-foreground/70 shrink-0" />
                <span class="font-semibold text-muted-foreground whitespace-nowrap shrink-0">上传流量</span>
                <span class="ml-auto font-semibold text-xs tabular-nums text-foreground/85">{{ formatBytes(props.node.net_total_up ?? 0) }}</span>
              </div>

              <!-- 丢包 -->
              <div class="group/panel flex flex-col gap-1" :title="lossPanelTooltip">
                <div class="flex items-center gap-1.5 text-[11px] leading-none">
                  <Icon icon="tabler:wifi" width="14" height="14" class="text-muted-foreground/70 shrink-0" />
                  <span class="font-semibold text-muted-foreground">丢包</span>
                  <span class="ml-auto font-semibold text-xs tabular-nums text-foreground/85">{{ lossDisplay }}</span>
                </div>
                <div
                  class="grid h-4 items-end gap-[1px] opacity-80 group-hover/panel:opacity-100 cursor-auto"
                  :style="{ gridTemplateColumns: `repeat(${lossRenderBars.length}, minmax(0, 1fr))` }"
                >
                  <DataTooltip v-for="bar in lossRenderBars" :key="bar.key" placement="top" :content="bar.tooltip" class="h-full w-full">
                    <span
                      class="block h-full w-full rounded-[1px] transition-transform duration-150 group-hover/data-tooltip:scale-y-160 group-hover/panel:opacity-60 group-hover/data-tooltip:!opacity-100"
                      :class="bar.className"
                    />
                  </DataTooltip>
                </div>
              </div>

              <!-- 运行时间 -->
              <div class="flex items-center gap-1.5 text-[11px] leading-none border-t border-muted-foreground/10 pt-1.5 mt-0.5">
                <Icon icon="tabler:clock" width="14" height="14" class="text-muted-foreground shrink-0" />
                <span class="font-semibold text-muted-foreground whitespace-nowrap shrink-0">运行时间</span>
                <span class="ml-auto font-bold text-xs tabular-nums text-foreground/85 shrink-0 whitespace-nowrap">{{ formatUptime(props.node.uptime ?? 0) }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- 自定义标签（彩色） -->
        <div v-if="customTags.length > 0" class="flex shrink-0 flex-wrap gap-1 items-center pt-2 border-t border-muted-foreground/10">
          <span
            v-for="(tag, index) in customTags" :key="index"
            class="inline-flex items-center text-[11px] rounded px-1.5 py-0.5 border font-medium leading-none"
            :style="{ color: tag.hex, borderColor: `${tag.hex}33`, backgroundColor: `${tag.hex}14` }"
          >
            {{ tag.text }}
          </span>
        </div>
      </div>
    </template>
  </CardX>
</template>

<style scoped>
.node-card {
  position: relative;
  overflow: hidden;
}
</style>
