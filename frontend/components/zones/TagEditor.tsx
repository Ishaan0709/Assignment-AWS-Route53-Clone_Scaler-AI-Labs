"use client";

import AttributeEditor from "@cloudscape-design/components/attribute-editor";
import Input from "@cloudscape-design/components/input";
import { MAX_TAGS, type TagRow, type TagRowError } from "@/lib/validators";
import type { Tag } from "@/types/api";

interface TagEditorProps {
  rows: TagRow[];
  errors: TagRowError[];
  onChange: (rows: TagRow[]) => void;
  disabled?: boolean;
}

let rowCounter = 0;
export function newTagRow(key = "", value = ""): TagRow {
  rowCounter += 1;
  return { id: `tag-${rowCounter}`, key, value };
}

export function rowsFromTags(tags: readonly Tag[]): TagRow[] {
  return tags.map((tag) => newTagRow(tag.key, tag.value));
}

/** Key/value rows with add and remove, limited to 50 tags like Route 53. */
export function TagEditor({ rows, errors, onChange, disabled = false }: TagEditorProps) {
  const remaining = MAX_TAGS - rows.length;
  const update = (index: number, patch: Partial<TagRow>) => {
    onChange(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };

  return (
    <AttributeEditor<TagRow>
      items={rows}
      addButtonText="Add new tag"
      removeButtonText="Remove"
      disableAddButton={disabled || remaining <= 0}
      additionalInfo={
        remaining > 0
          ? `You can add up to ${remaining} more ${remaining === 1 ? "tag" : "tags"}.`
          : `You have reached the limit of ${MAX_TAGS} tags.`
      }
      empty="No tags associated with the resource."
      onAddButtonClick={() => onChange([...rows, newTagRow()])}
      onRemoveButtonClick={({ detail }) => onChange(rows.filter((_, i) => i !== detail.itemIndex))}
      definition={[
        {
          label: "Key",
          errorText: (_, index) => errors[index]?.key,
          control: (row, index) => (
            <Input
              value={row.key}
              placeholder="Enter key"
              ariaLabel={`Tag ${index + 1} key`}
              disabled={disabled}
              onChange={({ detail }) => update(index, { key: detail.value })}
            />
          ),
        },
        {
          label: "Value - optional",
          errorText: (_, index) => errors[index]?.value,
          control: (row, index) => (
            <Input
              value={row.value}
              placeholder="Enter value"
              ariaLabel={`Tag ${index + 1} value`}
              disabled={disabled}
              onChange={({ detail }) => update(index, { value: detail.value })}
            />
          ),
        },
      ]}
    />
  );
}
