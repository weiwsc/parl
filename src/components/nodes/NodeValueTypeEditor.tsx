import type { EntityType, NodeValueType, SchemaArrayItem } from '../../game/nodes/types';
import { arrayValueType, describeNodeValueType, primitiveValueType, referenceValueType } from '../../game/nodes/schema';

interface NodeValueTypeEditorProps {
  valueType: NodeValueType;
  typeOptions: EntityType[];
  disabled: boolean;
  onChange: (valueType: NodeValueType) => void;
}

export function NodeValueTypeEditor({ valueType, typeOptions, disabled, onChange }: NodeValueTypeEditorProps) {
  return (
    <div className="ne-value-type-editor" title={describeNodeValueType(valueType)}>
      <select
        value={valueType.kind}
        disabled={disabled}
        onChange={event => {
          const kind = event.target.value;
          if (kind === 'primitive') onChange(primitiveValueType('number'));
          else if (kind === 'reference') onChange(referenceValueType(typeOptions[0]?.id ?? ''));
          else if (kind === 'array') onChange(arrayValueType({ kind: 'primitive', valueType: 'number' }));
          else onChange({ kind: 'any' });
        }}
      >
        <option value="any">any</option>
        <option value="primitive">primitive</option>
        <option value="reference">type</option>
        <option value="array">array</option>
      </select>
      {valueType.kind === 'primitive' && (
        <select
          value={valueType.valueType}
          disabled={disabled}
          onChange={event => onChange(primitiveValueType(event.target.value === 'string' ? 'string' : 'number'))}
        >
          <option value="number">number</option>
          <option value="string">string</option>
        </select>
      )}
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
          onChange={event => onChange({ kind: 'primitive', valueType: event.target.value === 'string' ? 'string' : 'number' })}
        >
          <option value="number">number</option>
          <option value="string">string</option>
        </select>
      ) : (
        <TypeSelect value={item.typeId} typeOptions={typeOptions} disabled={disabled} onChange={typeId => onChange({ kind: 'reference', typeId })} />
      )}
    </>
  );
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
