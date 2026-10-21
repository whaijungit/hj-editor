import fs from 'node:fs'
import * as echarts from 'echarts'

const md = fs.readFileSync('echarts-charts.md', 'utf8')
const re = /```echarts\r?\n([\s\S]*?)```/g
let match
let index = 0

while ((match = re.exec(md))) {
  index++
  const code = match[1]
  try {
    const option = new Function('echarts', `${code}\n;return option`)(echarts)
    const height = Number(/^\s*\/\/\s*height\s*[:=]\s*(\d{2,4})/im.exec(code)?.[1] ?? 360)
    const chart = echarts.init(null, null, { renderer: 'svg', ssr: true, width: 760, height })
    chart.setOption(option)
    chart.renderToSVGString({ useViewBox: true })
    chart.dispose()
    console.log(`block ${index}: ok`)
  } catch (error) {
    console.log(`block ${index}: FAIL -> ${error.message.split('\n')[0]}`)
  }
}
