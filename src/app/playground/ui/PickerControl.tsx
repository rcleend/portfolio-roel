import type { Picker } from '../boards/subject';
import { Segmented } from './Segmented';

interface PickerControlProps {
  readonly picker: Picker;
  readonly value: string;
  readonly onChange: (choice: string) => void;
}

/** Every choice of a picker side by side, today's marked and each described on hover. */
export function PickerControl({ picker, value, onChange }: PickerControlProps) {
  return (
    <Segmented
      label={picker.label}
      visibleLabel
      segments={picker.choices.map((choice) => ({
        value: choice.id,
        label: choice.name,
        hint: choice.description,
        current: choice.id === picker.current,
      }))}
      value={value}
      onChange={onChange}
    />
  );
}
