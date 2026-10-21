export type Tool = 'select' | 'hand' | 'text' | 'sticky' | 'shape' | 'connector' | 'pen'
export type ShapeKind = 'rect' | 'rounded' | 'ellipse' | 'diamond'
export type Side = 'top' | 'right' | 'bottom' | 'left'
export type Route = 'straight' | 'elbow' | 'curve'
export type Cap = 'none' | 'arrow'
export type Align = 'left' | 'center' | 'right'
export type VAlign = 'top' | 'middle' | 'bottom'
export type Handle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'

export interface Point {
  x: number
  y: number
}

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

interface BoxBase extends Rect {
  id: string
}

export interface TextElement extends BoxBase {
  type: 'text'
  text: string
  fontSize: number
  color: string
  bold: boolean
  align: Align
  /** When true the box hugs its content; once the user drags a side handle it wraps at `w`. */
  autoWidth: boolean
}

export interface StickyElement extends BoxBase {
  type: 'sticky'
  text: string
  color: string
}

export interface ShapeElement extends BoxBase {
  type: 'shape'
  shape: ShapeKind
  text: string
  stroke: string
  fill: string
  textColor: string
  /** Upper bound for the label; it shrinks automatically when the text does not fit. */
  fontSize: number
  strokeWidth: number
  /** Where the label sits inside the shape. */
  align: Align
  valign: VAlign
}

export interface PathElement extends BoxBase {
  type: 'path'
  /** Flat [x0, y0, x1, y1, ...] list in a local space of size vw × vh, scaled to w × h when drawn. */
  points: number[]
  vw: number
  vh: number
  stroke: string
  strokeWidth: number
}

export interface ConnectorEnd {
  /** Element the end is attached to, or null for a free-floating end at (x, y). */
  id: string | null
  /** Explicit attachment side; null lets the router pick the best side. */
  side: Side | null
  x: number
  y: number
}

export interface ConnectorElement {
  id: string
  type: 'connector'
  from: ConnectorEnd
  to: ConnectorEnd
  stroke: string
  strokeWidth: number
  route: Route
  startCap: Cap
  endCap: Cap
  dashed: boolean
  /** Optional label drawn at the middle of the line. */
  text: string
}

export type BoxElement = TextElement | StickyElement | ShapeElement | PathElement
export type BoardElement = BoxElement | ConnectorElement
export type ElementType = BoardElement['type']

export interface Viewport {
  x: number
  y: number
  zoom: number
}
