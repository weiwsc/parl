import type { EntityType, NodeValueType, SchemaArrayItem, SchemaValueType } from '../../game/nodes/types';
import { arrayValueType, chartValueType, describeNodeValueType, markdownValueType, primitiveValueType, referenceValueType } from '../../game/nodes/schema';

interface NodeValueTypeEditorProps {
  valueType: NodeValueType;
  typeOptions: EntityType[];
  disabled: boolean;
  onChange: (valueType: NodeValueType) => void;
}

export function NodeValueTypeEditor({ valueType, typeOptions, disabled, onChange }: NodeValueTypeEditorProps) {
  const selectedKind = valueType.kind === 'primitive'
    ? `primitive:${valueType.valueType}`
    : valueType.kind === 'chart'
      ? `chart:${valueType.chart}`
      : valueType.kind === 'markdown'
        ? 'markdown'
      : valueType.kind;

  return (
    <div className="ne-value-type-editor" title={describeNodeValueType(valueType)}>
      <select
        value={selectedKind}
        disabled={disabled}
        onChange={event => {
          const kind = event.target.value;
          if (kind === 'primitive:number') onChange(primitiveValueType('number'));
          else if (kind === 'primitive:string') onChange(primitiveValueType('string'));
          else if (kind === 'primitive:boolean') onChange(primitiveValueType('boolean'));
          else if (kind === 'reference') onChange(referenceValueType(typeOptions[0]?.id ?? ''));
          else if (kind === 'array') onChange(arrayValueType({ kind: 'primitive', valueType: 'number' }));
          else if (kind === 'chart:pie') onChange(chartValueType('pie'));
          else if (kind === 'chart:bar') onChange(chartValueType('bar'));
          else if (kind === 'markdown') onChange(markdownValueType());
          else onChange({ kind: 'any' });
        }}
      >
        <option value="any">any</option>
        <option value="primitive:number">number</option>
        <option value="primitive:string">string</option>
        <option value="primitive:boolean">boolean</option>
        <option value="reference">type</option>
        <option value="array">array</option>
        <option value="chart:pie">pie chart</option>
        <option value="chart:bar">bar chart</option>
        <option value="markdown">markdown</option>
      </select>
      {valueType.kind === 'reference' && (
        <TypeSelect value={valueType.typeId} typeOptions={typeOptions} disabled={disabled} onChange={typeId => onChange(referenceValueType(typeId))} />
      )}
      {valueType.kind === 'array' && (
        <ArrayItemEditor
          item={valueType.item}
          typeOptions={typeOptions}
          disabled={disabled}
          onChange={item => onChange(arrayValueType(item))}
        />
      )}
    </div>
  );
}

function ArrayItemEditor({
  item,
  typeOptions,
  disabled,
  onChange,
}: {
  item: SchemaArrayItem;
  typeOptions: EntityType[];
  disabled: boolean;
  onChange: (item: SchemaArrayItem) => void;
}) {
  return (
    <>
      <select
        value={item.kind}
        disabled={disabled}
        onChange={event => {
          const kind = event.target.value;
          onChange(kind === 'reference'
            ? { kind: 'reference', typeId: typeOptions[0]?.id ?? '' }
            : { kind: 'primitive', valueType: 'number' }
          );
        }}
      >
        <option value="primitive">primitive[]</option>
        <option value="reference">type[]</option>
      </select>
      {item.kind === 'primitive' ? (
        <select
          value={item.valueType}
          disabled={disabled}
          onChange={event => onChange({ kind: 'primitive', valueType: normalizePrimitiveSelectValue(event.target.value) })}
        >
          <option value="number">number</option>
          <option value="string">string</option>
          <option value="boolean">boolean</option>
        </select>
      ) : (
        <TypeSelect value={item.typeId} typeOptions={typeOptions} disabled={disabled} onChange={typeId => onChange({ kind: 'reference', typeId })} />
      )}
    </>
  );
}

function normalizePrimitiveSelectValue(value: string): SchemaValueType {
  if (value === 'string' || value === 'boolean') return value;
  return 'number';
}

function TypeSelect({
  value,
  typeOptions,
  disabled,
  onChange,
}: {
  value: string;
  typeOptions: EntityType[];
  disabled: boolean;
  onChange: (typeId: string) => void;
}) {
  return (
    <select value={value} disabled={disabled} onChange={event => onChange(event.target.value)}>
      <option value="">unbound</option>
      {typeOptions.map(type => (
        <option key={type.id} value={type.id}>{type.name}</option>
      ))}
    </select>
  );
}
