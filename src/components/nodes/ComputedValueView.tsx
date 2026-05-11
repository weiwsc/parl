import type { CSSProperties } from 'react';
import type { NodeComputedViewValueType } from '../../game/nodes/types';
import { runtimeValueLabel, type NodeRuntimeValue } from '../../game/nodes/runtime';
import { MarkdownValueView } from '../ui/MarkdownValueView';

interface ComputedValueViewProps {
  valueType: NodeComputedViewValueType;
  value: NodeRuntimeValue;
}

export interface ComputedChartItem {
  id: string;
  label: string;
  value: number;
  color: string;
}

export interface ComputedPieChartBlock {
  id: string;
  title: string;
  total: number;
  segments: ComputedChartItem[];
}

const PALETTE = [
  'var(--ne-cyan)',
  'var(--ne-accent)',
  'var(--ne-accent-hot)',
  'var(--ne-neutral)',
  'var(--ne-good)',
  'var(--ne-danger)',
  '#8bbcff',
  '#f5d56f',
];

const COLLECTION_KEYS = ['segments', 'data', 'items', 'values', 'entries'];
const VALUE_KEYS = ['value', 'amount', 'count', 'total', 'pct', 'percentage', 'percent', 'seats', 'power', 'population'];
const LABEL_KEYS = ['label', 'name', 'title', 'id', 'key'];
const COLOR_KEYS = ['color', 'colour', 'fill'];

export function ComputedValueView({ valueType, value }: ComputedValueViewProps) {
  if (valueType.kind === 'markdown') {
    return <MarkdownValueView value={value} emptyLabel="no markdown" className="ne-computed-chart ne-computed-markdown" />;
  }

  if (valueType.chart === 'pie') {
    return <ComputedPieChartView value={value} />;
  }

  return <BarComputedValue value={value} />;
}

export function ComputedPieChartView({ value, className = '' }: { value: NodeRuntimeValue; className?: string }) {
  const charts = normalizePieCharts(value);

  if (charts.length === 0) {
    return <EmptyComputedChart label={runtimeValueLabel(value) || 'no pie data'} />;
  }

  const rootClassName = ['ne-computed-chart', 'ne-computed-pie-grid', className].filter(Boolean).join(' ');

  return (
    <div className={rootClassName}>
      {charts.map(chart => (
        <div key={chart.id} className="ne-computed-pie-card">
          <div className="ne-computed-chart-head">
            <span>{chart.title}</span>
            <b>{formatNumber(chart.total)}</b>
          </div>
          <div className="ne-computed-pie-body">
            <div
              className="ne-computed-pie"
              style={{ '--pie-gradient': pieGradient(chart.segments, chart.total) } as CSSProperties}
            >
              <span>{chart.segments.length}</span>
            </div>
            <div className="ne-computed-legend">
              {chart.segments.slice(0, 5).map(segment => (
                <div key={segment.id} className="ne-computed-legend-row">
                  <span className="ne-computed-swatch" style={{ background: segment.color }} />
                  <span>{segment.label}</span>
                  <b>{formatPercent(segment.value, chart.total)}</b>
                </div>
              ))}
              {chart.segments.length > 5 && (
                <div className="ne-computed-legend-row ne-computed-legend-more">
                  <span />
                  <span>+{chart.segments.length - 5}</span>
                  <b />
                </div>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function BarComputedValue({ value }: { value: NodeRuntimeValue }) {
  const chart = normalizeBarChart(value);
  const items = chart.items;
  const max = Math.max(...items.map(item => Math.abs(item.value)), 0);

  if (items.length === 0 || max <= 0) {
    return <EmptyComputedChart label={runtimeValueLabel(value) || 'no bar data'} />;
  }

  return (
    <div className="ne-computed-chart ne-computed-bar-chart">
      {chart.title && (
        <div className="ne-computed-chart-head">
          <span>{chart.title}</span>
          <b>{formatNumber(items.reduce((sum, item) => sum + item.value, 0))}</b>
        </div>
      )}
      {items.slice(0, 12).map(item => {
        const width = `${Math.max(2, Math.min(100, (Math.abs(item.value) / max) * 100)).toFixed(2)}%`;
        return (
          <div key={item.id} className="ne-computed-bar-row">
            <span className="ne-computed-swatch" style={{ background: item.color }} />
            <span className="ne-computed-bar-label">{item.label}</span>
            <b>{formatNumber(item.value)}</b>
            <div className="ne-computed-bar-track">
              <span className="ne-computed-bar-fill" style={{ width, background: item.color }} />
            </div>
          </div>
        );
      })}
      {items.length > 12 && (
        <div className="ne-computed-bar-more">+{items.length - 12} more</div>
      )}
    </div>
  );
}

function normalizeBarChart(value: NodeRuntimeValue): { title: string | null; items: ComputedChartItem[] } {
  return {
    title: isRecord(value) ? titleFromRecord(value) : null,
    items: normalizeBarItems(value),
  };
}

function EmptyComputedChart({ label }: { label: string }) {
  return (
    <div className="ne-computed-chart ne-computed-chart-empty">
      {label}
    </div>
  );
}

function normalizePieCharts(value: NodeRuntimeValue): ComputedPieChartBlock[] {
  if (Array.isArray(value)) {
    const nested = value
      .map((entry, index) => pieBlockFromNested(entry, index))
      .filter((entry): entry is ComputedPieChartBlock => !!entry);
    if (nested.length > 0) return nested;

    const block = pieBlockFromSegments(value, 'Pie', 'pie-0');
    return block ? [block] : [];
  }

  if (isRecord(value)) {
    const chartCollection = collectionFromRecord(value, ['charts', 'pies', 'series']);
    if (chartCollection) {
      const nested = chartCollection
        .map((entry, index) => pieBlockFromNested(entry, index))
        .filter((entry): entry is ComputedPieChartBlock => !!entry);
      if (nested.length > 0) return nested;
    }

    const nested = pieBlockFromNested(value, 0);
    if (nested) return [nested];

    const keyedSegments = Object.entries(value)
      .map(([key, entry], index) => segmentFromKeyValue(key, entry, index))
      .filter((entry): entry is ComputedChartItem => !!entry);
    if (keyedSegments.length > 0) {
      return [pieBlockFromItems(keyedSegments, titleFromRecord(value) ?? 'Pie', 'pie-0')];
    }

    const single = pieBlockFromSegments([value], titleFromRecord(value) ?? 'Pie', 'pie-0');
    return single ? [single] : [];
  }

  return [];
}

function pieBlockFromNested(value: NodeRuntimeValue, index: number): ComputedPieChartBlock | null {
  if (Array.isArray(value) && looksLikeDatasetArray(value)) {
    return pieBlockFromSegments(value, `Pie ${index + 1}`, `pie-${index}`);
  }

  if (!isRecord(value)) return null;
  const collection = collectionFromRecord(value, COLLECTION_KEYS);
  if (!collection) return null;

  const title = titleFromRecord(value) ?? `Pie ${index + 1}`;
  return pieBlockFromSegments(collection, title, `pie-${index}`);
}

function pieBlockFromSegments(values: NodeRuntimeValue[], title: string, id: string): ComputedPieChartBlock | null {
  const segments = values
    .map((entry, index) => normalizeChartItem(entry, index))
    .filter((entry): entry is ComputedChartItem => !!entry && entry.value > 0);

  return segments.length > 0 ? pieBlockFromItems(segments, title, id) : null;
}

function looksLikeDatasetArray(value: NodeRuntimeValue[]): boolean {
  return value.length > 0
    && !looksLikeTupleSegment(value)
    && value.some((entry, index) => normalizeChartItem(entry, index));
}

function looksLikeTupleSegment(value: NodeRuntimeValue[]): boolean {
  return value.length >= 2
    && (typeof value[0] === 'string' || typeof value[0] === 'number')
    && coerceNumber(value[1]) !== null;
}

function pieBlockFromItems(segments: ComputedChartItem[], title: string, id: string): ComputedPieChartBlock {
  return {
    id,
    title,
    total: segments.reduce((sum, segment) => sum + segment.value, 0),
    segments,
  };
}

function normalizeBarItems(value: NodeRuntimeValue): ComputedChartItem[] {
  if (Array.isArray(value)) {
    return value
      .map((entry, index) => normalizeChartItem(entry, index))
      .filter((entry): entry is ComputedChartItem => !!entry);
  }

  if (!isRecord(value)) return [];

  const collection = collectionFromRecord(value, COLLECTION_KEYS);
  if (collection) return normalizeBarItems(collection);

  const single = normalizeChartItem(value, 0);
  if (single) return [single];

  return Object.entries(value)
    .map(([key, entry], index) => segmentFromKeyValue(key, entry, index))
    .filter((entry): entry is ComputedChartItem => !!entry);
}

function normalizeChartItem(value: NodeRuntimeValue, index: number): ComputedChartItem | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return chartItem(`item-${index}`, `Item ${index + 1}`, value, colorAt(index));
  }

  if (Array.isArray(value)) {
    const label = runtimeValueLabel(value[0]) || `Item ${index + 1}`;
    const amount = coerceNumber(value[1]);
    const color = typeof value[2] === 'string' && value[2] ? value[2] : colorAt(index);
    return amount === null ? null : chartItem(`item-${index}`, label, amount, color);
  }

  if (!isRecord(value)) return null;

  const amount = numberFromRecord(value, VALUE_KEYS);
  if (amount === null) return null;

  const label = stringFromRecord(value, LABEL_KEYS) ?? `Item ${index + 1}`;
  const color = stringFromRecord(value, COLOR_KEYS) ?? colorAt(index);
  return chartItem(stringFromRecord(value, ['id', 'key']) ?? `item-${index}`, label, amount, color);
}

function segmentFromKeyValue(key: string, value: NodeRuntimeValue, index: number): ComputedChartItem | null {
  const amount = coerceNumber(value);
  return amount === null ? null : chartItem(key, key, amount, colorAt(index));
}

function chartItem(id: string, label: string, value: number, color: string): ComputedChartItem {
  return {
    id,
    label,
    value,
    color,
  };
}

function collectionFromRecord(record: Record<string, NodeRuntimeValue>, keys: string[]): NodeRuntimeValue[] | null {
  for (const key of keys) {
    const value = record[key];
    if (Array.isArray(value)) return value;
  }

  return null;
}

function stringFromRecord(record: Record<string, NodeRuntimeValue>, keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value;
  }

  return null;
}

function numberFromRecord(record: Record<string, NodeRuntimeValue>, keys: string[]): number | null {
  for (const key of keys) {
    const amount = coerceNumber(record[key]);
    if (amount !== null) return amount;
  }

  return null;
}

function titleFromRecord(record: Record<string, NodeRuntimeValue>): string | null {
  return stringFromRecord(record, ['title', 'name', 'label']);
}

function coerceNumber(value: NodeRuntimeValue): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function isRecord(value: NodeRuntimeValue): value is Record<string, NodeRuntimeValue> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function colorAt(index: number): string {
  return PALETTE[index % PALETTE.length];
}

function pieGradient(segments: ComputedChartItem[], total: number): string {
  if (total <= 0) return 'var(--ne-line-soft) 0 100%';

  let cursor = 0;
  return segments.map(segment => {
    const start = cursor;
    cursor += (segment.value / total) * 100;
    return `${segment.color} ${start.toFixed(2)}% ${cursor.toFixed(2)}%`;
  }).join(', ');
}

function formatNumber(value: number): string {
  const compact = Math.abs(value) >= 10000;
  return new Intl.NumberFormat(undefined, {
    notation: compact ? 'compact' : 'standard',
    maximumFractionDigits: Math.abs(value) < 10 ? 1 : 0,
  }).format(value);
}

function formatPercent(value: number, total: number): string {
  if (total <= 0) return '0%';
  return `${Math.round((value / total) * 100)}%`;
}
