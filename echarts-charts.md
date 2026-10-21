# ECharts 图表示例合集

五个常用图表：饼图、热力图、折线图、箱线图、柱状图。

每个代码块第一行的 `// height: 380` 用来指定图表高度（160–900，不写默认 360）；块内可以直接写 ECharts 的 option，JSON 或一段返回 option 的 JS 都行。

## 1. 饼图 · 流量来源

环形饼图，悬停时该扇区放大并带阴影，其余扇区自动淡出；图例可点击筛选，tooltip 显示数值与占比。

```echarts
// height: 380
const data = [
  { name: '自然搜索', value: 1048 },
  { name: '直接访问', value: 735 },
  { name: '社交媒体', value: 580 },
  { name: '邮件营销', value: 484 },
  { name: '联盟广告', value: 300 },
  { name: '视频广告', value: 256 },
]

const option = {
  color: ['#5B8FF9', '#5AD8A6', '#F6BD16', '#E8684A', '#6DC8EC', '#9270CA'],
  tooltip: {
    trigger: 'item',
    backgroundColor: 'rgba(17, 24, 39, 0.88)',
    borderWidth: 0,
    padding: [10, 14],
    textStyle: { color: '#f8fafc', fontSize: 12 },
    extraCssText: 'border-radius: 8px; box-shadow: 0 8px 24px rgba(15, 23, 42, 0.35);',
    formatter: (p) =>
      `${p.marker} ${p.name}<br/>访问量 <b>${p.value}</b> 次 · 占比 <b>${p.percent}%</b>`,
  },
  legend: {
    type: 'scroll',
    orient: 'vertical',
    right: 6,
    top: 'middle',
    icon: 'circle',
    itemWidth: 8,
    itemHeight: 8,
    itemGap: 16,
    textStyle: { fontSize: 12 },
  },
  series: [
    {
      name: '流量来源',
      type: 'pie',
      radius: ['46%', '70%'],
      center: ['38%', '52%'],
      padAngle: 2,
      itemStyle: { borderRadius: 8, borderWidth: 2, borderColor: 'transparent' },
      label: { formatter: '{b}\n{d}%', fontSize: 11, lineHeight: 16 },
      labelLine: { length: 8, length2: 12 },
      emphasis: {
        focus: 'self',
        scale: true,
        scaleSize: 10,
        label: { fontSize: 13, fontWeight: 'bold' },
        itemStyle: { shadowBlur: 18, shadowColor: 'rgba(15, 23, 42, 0.28)' },
      },
      blur: { label: { opacity: 0.35 }, labelLine: { opacity: 0.2 } },
      data,
    },
  ],
}
```

## 2. 热力图 · 一周访问分布

24 小时 × 7 天的连续色阶，横向 visualMap 可拖动筛选区间；悬停格子有阴影高亮，tooltip 给出精确数值。

```echarts
// height: 400
const days = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']
const hours = Array.from({ length: 24 }, (_, i) => `${i} 时`)

const data = []
for (let day = 0; day < 7; day++) {
  for (let hour = 0; hour < 24; hour++) {
    // 早高峰 10 点、晚高峰 20 点；周末整体上浮
    const peak = Math.exp(-((hour - 10) ** 2) / 8) + Math.exp(-((hour - 20) ** 2) / 10)
    const weekendBoost = day >= 5 ? 1.55 : 1
    const wave = Math.sin(day * 2.3 + hour * 1.7) * 5
    const value = Math.round(Math.max(1, 8 + peak * 40 * weekendBoost + wave))
    data.push([hour, day, value])
  }
}

const values = data.map((item) => item[2])

const option = {
  tooltip: {
    trigger: 'item',
    backgroundColor: 'rgba(17, 24, 39, 0.88)',
    borderWidth: 0,
    padding: [10, 14],
    textStyle: { color: '#f8fafc', fontSize: 12 },
    extraCssText: 'border-radius: 8px; box-shadow: 0 8px 24px rgba(15, 23, 42, 0.35);',
    formatter: (p) =>
      `${days[p.value[1]]} · ${p.value[0]} 时<br/>访问量 <b>${p.value[2]}</b> 次`,
  },
  grid: { left: 56, right: 24, top: 24, bottom: 88 },
  xAxis: {
    type: 'category',
    data: hours,
    axisTick: { show: false },
    axisLabel: { interval: 2, fontSize: 11 },
  },
  yAxis: {
    type: 'category',
    data: days,
    inverse: true,
    axisTick: { show: false },
    axisLine: { show: false },
    axisLabel: { fontSize: 12 },
  },
  visualMap: {
    min: Math.min(...values),
    max: Math.max(...values),
    calculable: true,
    orient: 'horizontal',
    left: 'center',
    bottom: 12,
    itemWidth: 14,
    itemHeight: 150,
    text: ['高峰', '低谷'],
    textStyle: { fontSize: 11 },
    inRange: { color: ['#eef6ff', '#c7e3fb', '#7cc0f5', '#3b82f6', '#1e3a8a'] },
  },
  series: [
    {
      name: '访问量',
      type: 'heatmap',
      data,
      itemStyle: { borderWidth: 1, borderColor: 'transparent', borderRadius: 3 },
      emphasis: {
        itemStyle: {
          shadowBlur: 10,
          shadowColor: 'rgba(15, 23, 42, 0.4)',
          borderColor: 'rgba(255, 255, 255, 0.9)',
        },
      },
    },
  ],
}
```

## 3. 折线图 · 访问与订单趋势

双折线 + 渐变面积，十字准星 tooltip 同时展示两个系列；图例可切换，均值基准线随数据自动计算。

```echarts
// height: 380
const months = ['1 月', '2 月', '3 月', '4 月', '5 月', '6 月', '7 月', '8 月', '9 月', '10 月', '11 月', '12 月']
const visits = [820, 932, 901, 1290, 1330, 1120, 1450, 1320, 1180, 1520, 1680, 1490]
const orders = [320, 402, 361, 534, 590, 480, 660, 610, 520, 700, 780, 690]

const option = {
  color: ['#3B9EFF', '#36CBCB'],
  tooltip: {
    trigger: 'axis',
    backgroundColor: 'rgba(17, 24, 39, 0.88)',
    borderWidth: 0,
    padding: [10, 14],
    textStyle: { color: '#f8fafc', fontSize: 12 },
    extraCssText: 'border-radius: 8px; box-shadow: 0 8px 24px rgba(15, 23, 42, 0.35);',
    axisPointer: { type: 'cross', label: { backgroundColor: '#64748b' } },
    formatter: (params) => {
      const rows = params.map(
        (p) =>
          `<div style="display:flex;justify-content:space-between;gap:20px;line-height:20px">` +
          `<span>${p.marker}${p.seriesName}</span><b>${p.value}</b></div>`,
      )
      return (
        `<div style="margin-bottom:6px;font-weight:600">${params[0].axisValue}</div>` +
        rows.join('')
      )
    },
  },
  legend: {
    top: 0,
    icon: 'roundRect',
    itemWidth: 14,
    itemHeight: 6,
    itemGap: 20,
    textStyle: { fontSize: 12 },
  },
  grid: { left: 48, right: 24, top: 48, bottom: 32 },
  xAxis: {
    type: 'category',
    boundaryGap: false,
    data: months,
    axisTick: { show: false },
    axisLabel: { fontSize: 11 },
  },
  yAxis: {
    type: 'value',
    splitLine: { lineStyle: { type: 'dashed' } },
    axisLabel: { fontSize: 11 },
  },
  series: [
    {
      name: '访问量',
      type: 'line',
      smooth: true,
      showSymbol: false,
      symbolSize: 8,
      lineStyle: { width: 3, shadowBlur: 8, shadowColor: 'rgba(59, 158, 255, 0.35)' },
      areaStyle: {
        opacity: 0.35,
        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
          { offset: 0, color: 'rgba(59, 158, 255, 0.55)' },
          { offset: 1, color: 'rgba(59, 158, 255, 0.02)' },
        ]),
      },
      emphasis: { focus: 'series' },
      markLine: {
        symbol: 'none',
        silent: true,
        lineStyle: { type: 'dashed', color: 'rgba(148, 163, 184, 0.9)' },
        label: { position: 'end', formatter: '均值 {c}', fontSize: 11 },
        data: [{ type: 'average', name: '均值' }],
      },
      data: visits,
    },
    {
      name: '订单量',
      type: 'line',
      smooth: true,
      showSymbol: false,
      symbolSize: 8,
      lineStyle: { width: 3 },
      areaStyle: {
        opacity: 0.28,
        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
          { offset: 0, color: 'rgba(54, 203, 203, 0.5)' },
          { offset: 1, color: 'rgba(54, 203, 203, 0.02)' },
        ]),
      },
      emphasis: { focus: 'series' },
      data: orders,
    },
  ],
}
```

## 4. 箱线图 · 各班级成绩分布

箱体用渐变填充，悬停高亮并带阴影；tooltip 展开最大值、上四分位、中位数、下四分位、最小值。

```echarts
// height: 380
const classes = ['一班', '二班', '三班', '四班', '五班']
// 每组为 [最小值, 下四分位, 中位数, 上四分位, 最大值]
const boxData = [
  [42, 66, 81, 95, 118],
  [38, 58, 72, 86, 104],
  [51, 72, 88, 101, 126],
  [35, 55, 68, 80, 99],
  [46, 69, 85, 98, 120],
]

const option = {
  tooltip: {
    trigger: 'item',
    backgroundColor: 'rgba(17, 24, 39, 0.88)',
    borderWidth: 0,
    padding: [10, 14],
    textStyle: { color: '#f8fafc', fontSize: 12 },
    extraCssText: 'border-radius: 8px; box-shadow: 0 8px 24px rgba(15, 23, 42, 0.35);',
    formatter: (p) => {
      const v = p.value.length > 5 ? p.value.slice(1) : p.value
      return [
        `<div style="margin-bottom:6px;font-weight:600">${p.name}</div>`,
        `最大值 <b>${v[4]}</b>`,
        `上四分位 <b>${v[3]}</b>`,
        `中位数 <b>${v[2]}</b>`,
        `下四分位 <b>${v[1]}</b>`,
        `最小值 <b>${v[0]}</b>`,
      ].join('<br/>')
    },
  },
  grid: { left: 48, right: 24, top: 32, bottom: 40 },
  xAxis: {
    type: 'category',
    data: classes,
    boundaryGap: true,
    axisTick: { show: false },
    axisLabel: { fontSize: 12 },
  },
  yAxis: {
    type: 'value',
    name: '分',
    nameTextStyle: { fontSize: 11 },
    splitLine: { lineStyle: { type: 'dashed' } },
    axisLabel: { fontSize: 11 },
  },
  series: [
    {
      name: '成绩分布',
      type: 'boxplot',
      boxWidth: [16, 34],
      itemStyle: {
        borderWidth: 2,
        borderColor: '#5B8FF9',
        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
          { offset: 0, color: 'rgba(91, 143, 249, 0.42)' },
          { offset: 1, color: 'rgba(91, 143, 249, 0.08)' },
        ]),
      },
      emphasis: {
        itemStyle: {
          borderWidth: 2,
          borderColor: '#2f6fed',
          shadowBlur: 14,
          shadowColor: 'rgba(47, 111, 237, 0.35)',
        },
      },
      data: boxData,
    },
  ],
}
```

## 5. 柱状图 · 季度销售额对比

渐变圆角柱 + 顶部数值标签，tooltip 走阴影指示；悬停某个系列时另一系列自动淡出，同比对比更直观。

```echarts
// height: 380
const quarters = ['Q1', 'Q2', 'Q3', 'Q4']
const thisYear = [4820, 5680, 5210, 6940]
const lastYear = [3960, 4380, 4520, 5180]

const barGradient = (from, to) =>
  new echarts.graphic.LinearGradient(0, 0, 0, 1, [
    { offset: 0, color: from },
    { offset: 1, color: to },
  ])

const option = {
  tooltip: {
    trigger: 'axis',
    backgroundColor: 'rgba(17, 24, 39, 0.88)',
    borderWidth: 0,
    padding: [10, 14],
    textStyle: { color: '#f8fafc', fontSize: 12 },
    extraCssText: 'border-radius: 8px; box-shadow: 0 8px 24px rgba(15, 23, 42, 0.35);',
    axisPointer: { type: 'shadow', shadowStyle: { color: 'rgba(148, 163, 184, 0.12)' } },
    valueFormatter: (value) => `${value} 万元`,
  },
  legend: {
    top: 0,
    icon: 'roundRect',
    itemWidth: 14,
    itemHeight: 6,
    itemGap: 20,
    textStyle: { fontSize: 12 },
  },
  grid: { left: 56, right: 24, top: 56, bottom: 40 },
  xAxis: {
    type: 'category',
    data: quarters,
    axisTick: { show: false },
    axisLabel: { fontSize: 12 },
  },
  yAxis: {
    type: 'value',
    name: '万元',
    nameTextStyle: { fontSize: 11 },
    splitLine: { lineStyle: { type: 'dashed' } },
    axisLabel: { fontSize: 11 },
  },
  series: [
    {
      name: '2026 年',
      type: 'bar',
      barWidth: 34,
      barGap: '25%',
      itemStyle: {
        borderRadius: [8, 8, 0, 0],
        color: barGradient('#5B9DFF', '#3B6EF6'),
      },
      emphasis: {
        focus: 'series',
        itemStyle: { shadowBlur: 16, shadowColor: 'rgba(59, 110, 246, 0.45)' },
      },
      label: {
        show: true,
        position: 'top',
        fontSize: 11,
        formatter: (p) => p.value.toLocaleString(),
      },
      data: thisYear,
    },
    {
      name: '2025 年',
      type: 'bar',
      barWidth: 34,
      itemStyle: {
        borderRadius: [8, 8, 0, 0],
        color: barGradient('#BFD3F5', '#94B4EA'),
      },
      emphasis: {
        focus: 'series',
        itemStyle: { shadowBlur: 16, shadowColor: 'rgba(148, 180, 234, 0.55)' },
      },
      label: {
        show: true,
        position: 'top',
        fontSize: 11,
        formatter: (p) => p.value.toLocaleString(),
      },
      data: lastYear,
    },
  ],
}
```
