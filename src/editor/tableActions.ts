import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import { TextSelection, type EditorState } from '@tiptap/pm/state'
import { TableMap } from '@tiptap/pm/tables'
import type { Editor } from '@tiptap/react'

export type TableContext = {
  table: ProseMirrorNode
  /** 表格节点在文档中的起始位置 */
  tablePos: number
  tableDepth: number
  /** 光标所在行的索引 */
  rowIndex: number
  /** 光标所在单元格在该行中的索引 */
  colIndex: number
  rows: ProseMirrorNode[]
  /** 当前行是否处于表头状态（首行由 tableHeader 组成） */
  firstRowIsHeader: boolean
}

export function getTableContext(state: EditorState): TableContext | null {
  const { $from } = state.selection
  let tableDepth = $from.depth
  while (tableDepth > 0 && $from.node(tableDepth).type.name !== 'table') {
    tableDepth -= 1
  }
  if (tableDepth === 0) return null

  const table = $from.node(tableDepth)
  const rowIndex = Math.min($from.index(tableDepth), table.childCount - 1)
  if (rowIndex < 0) return null

  const row = table.child(rowIndex)
  const cellIndex = $from.index(tableDepth + 1)
  const colIndex = Math.min(Math.max(cellIndex, 0), Math.max(row.childCount - 1, 0))

  const rows: ProseMirrorNode[] = []
  table.forEach((r) => rows.push(r))

  const firstRow = table.firstChild
  const firstRowIsHeader =
    firstRow !== null && firstRow.firstChild?.type.name === 'tableHeader'

  return {
    table,
    tablePos: $from.before(tableDepth),
    tableDepth,
    rowIndex,
    colIndex,
    rows,
    firstRowIsHeader,
  }
}

/** 表格内每一行的起始位置（基于当前文档） */
function rowPositions(ctx: TableContext): number[] {
  const positions: number[] = []
  let pos = ctx.tablePos + 1
  ctx.rows.forEach((row) => {
    positions.push(pos)
    pos += row.nodeSize
  })
  return positions
}

/** 读取首行各列的宽度，用于让新插入的表头与现有列对齐 */
function columnWidths(table: ProseMirrorNode, columnCount: number): number[] {
  const widths = new Array<number>(columnCount).fill(0)
  const firstRow = table.firstChild
  if (!firstRow) return widths

  let col = 0
  firstRow.forEach((cell) => {
    const span = (cell.attrs.colspan as number | null) ?? 1
    const colwidth = cell.attrs.colwidth as number[] | null
    for (let index = 0; index < span; index += 1) {
      if (col >= columnCount) break
      widths[col] = colwidth?.[index] ?? colwidth?.[0] ?? 0
      col += 1
    }
  })
  return widths
}

/**
 * 在表格顶部插入一行空表头。
 * 表格原本没有表头时，这一行会成为整张表的表头行；
 * 已经有表头时，则在现有表头之上再加一行表头（双层表头）。
 */
export function addHeaderRow(editor: Editor): boolean {
  const ctx = getTableContext(editor.state)
  if (!ctx) return false

  const { state } = editor
  const headerType = state.schema.nodes.tableHeader
  const rowType = state.schema.nodes.tableRow
  if (!headerType || !rowType) return false

  const map = TableMap.get(ctx.table)
  const cellWidths = columnWidths(ctx.table, map.width)

  const cells: ProseMirrorNode[] = []
  for (let col = 0; col < map.width; col += 1) {
    const width = cellWidths[col] ?? 0
    const cell = headerType.createAndFill({
      colspan: 1,
      rowspan: 1,
      colwidth: width > 0 ? [width] : null,
    })
    if (!cell) return false
    cells.push(cell)
  }

  const row = rowType.create(null, cells)
  const tr = state.tr.insert(ctx.tablePos + 1, row)
  const firstCellContent = ctx.tablePos + 4
  tr.setSelection(TextSelection.near(tr.doc.resolve(firstCellContent)))
  editor.view.dispatch(tr.scrollIntoView())
  editor.commands.focus()
  return true
}

/** 在表格最左侧插入一列空表头 */
export function addHeaderColumn(editor: Editor): boolean {
  const ctx = getTableContext(editor.state)
  if (!ctx) return false

  const { state } = editor
  const headerType = state.schema.nodes.tableHeader
  if (!headerType) return false

  const map = TableMap.get(ctx.table)
  const firstColumnWidth = columnWidths(ctx.table, map.width)[0] ?? 0
  const tr = state.tr
  let rowPos = ctx.tablePos + 1

  ctx.rows.forEach((row) => {
    const width = firstColumnWidth
    const cell = headerType.createAndFill({
      colspan: 1,
      rowspan: 1,
      colwidth: width > 0 ? [width] : null,
    })
    if (!cell) return
    tr.insert(rowPos + 1, cell)
    rowPos += row.nodeSize + cell.nodeSize
  })

  if (!tr.docChanged) return false

  tr.setSelection(TextSelection.near(tr.doc.resolve(ctx.tablePos + 4)))
  editor.view.dispatch(tr.scrollIntoView())
  editor.commands.focus()
  return true
}

/** 把当前所在行上移 / 下移一位 */
export function moveRow(editor: Editor, direction: -1 | 1): boolean {
  const ctx = getTableContext(editor.state)
  if (!ctx) return false

  const target = ctx.rowIndex + direction
  if (target < 0 || target >= ctx.rows.length) return false

  const positions = rowPositions(ctx)
  const row = ctx.rows[ctx.rowIndex]
  const tr = editor.state.tr

  if (direction === 1) {
    tr.delete(positions[ctx.rowIndex], positions[ctx.rowIndex] + row.nodeSize)
    const nextRow = ctx.rows[target]
    const insertPos = positions[target] - row.nodeSize + nextRow.nodeSize
    tr.insert(insertPos, row)
  } else {
    tr.insert(positions[target], row)
    tr.delete(
      positions[ctx.rowIndex] + row.nodeSize,
      positions[ctx.rowIndex] + 2 * row.nodeSize,
    )
  }

  // 移动后光标回到同一行
  let newRowStart = ctx.tablePos + 1
  for (let index = 0; index < target; index += 1) {
    const original = index === ctx.rowIndex ? target : index === target ? ctx.rowIndex : index
    newRowStart += ctx.rows[original].nodeSize
  }
  tr.setSelection(TextSelection.near(tr.doc.resolve(newRowStart + 4)))
  editor.view.dispatch(tr.scrollIntoView())
  editor.commands.focus()
  return true
}

/** 把当前所在列左移 / 右移一位（含合并单元格的表格不支持） */
export function moveColumn(editor: Editor, direction: -1 | 1): boolean {
  const ctx = getTableContext(editor.state)
  if (!ctx) return false

  const columnCount = ctx.rows[0]?.childCount ?? 0
  if (columnCount === 0) return false

  const target = ctx.colIndex + direction
  if (target < 0 || target >= columnCount) return false

  // 存在合并单元格时列与列之间不是一一对应，直接放弃
  for (const row of ctx.rows) {
    if (row.childCount !== columnCount) return false
    let merged = false
    row.forEach((cell) => {
      if (cell.attrs.colspan !== 1 || cell.attrs.rowspan !== 1) merged = true
    })
    if (merged) return false
  }

  const positions = rowPositions(ctx)
  const tr = editor.state.tr

  ctx.rows.forEach((row, rowIndex) => {
    const cells: ProseMirrorNode[] = []
    row.forEach((cell) => cells.push(cell))
    const from = Math.min(ctx.colIndex, target)
    const to = Math.max(ctx.colIndex, target)
    ;[cells[from], cells[to]] = [cells[to], cells[from]]
    const nextRow = row.type.create(row.attrs, cells)
    tr.replaceWith(positions[rowIndex], positions[rowIndex] + row.nodeSize, nextRow)
  })

  let newRowStart = ctx.tablePos + 1
  for (let index = 0; index < ctx.rowIndex; index += 1) {
    newRowStart += ctx.rows[index].nodeSize
  }
  tr.setSelection(TextSelection.near(tr.doc.resolve(newRowStart + 4)))
  editor.view.dispatch(tr.scrollIntoView())
  editor.commands.focus()
  return true
}

/** 把首行设为表头 / 取消首行表头 */
export function toggleFirstRowHeader(editor: Editor): boolean {
  const ctx = getTableContext(editor.state)
  if (!ctx) return false

  const firstRow = ctx.rows[0]
  if (!firstRow) return false

  const firstCellContent = ctx.tablePos + 4
  return editor
    .chain()
    .setTextSelection(firstCellContent)
    .toggleHeaderRow()
    .run()
}

/** 表格是否允许移动列（无合并单元格） */
export function canMoveColumn(ctx: TableContext | null): boolean {
  if (!ctx) return false
  const columnCount = ctx.rows[0]?.childCount ?? 0
  if (columnCount < 2) return false
  return ctx.rows.every((row) => {
    if (row.childCount !== columnCount) return false
    let ok = true
    row.forEach((cell) => {
      if (cell.attrs.colspan !== 1 || cell.attrs.rowspan !== 1) ok = false
    })
    return ok
  })
}
