import type {
  StudioProductionOptionDescriptor,
  StudioProductionOptionValue,
} from "./studio-production-operation-options";

export function StudioProductionOptionFields({
  descriptors,
  values,
  onChange,
}: {
  readonly descriptors: readonly StudioProductionOptionDescriptor[];
  readonly values: Readonly<Record<string, StudioProductionOptionValue>>;
  readonly onChange: (key: string, value: StudioProductionOptionValue) => void;
}) {
  if (descriptors.length === 0) return null;

  return (
    <fieldset className="mt-3 rounded-xl border border-line bg-card/55 p-3.5">
      <legend className="px-1 text-xs font-bold text-fg-2">작업 옵션</legend>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {descriptors.map((descriptor) => {
          const value = values[descriptor.key] ?? descriptor.defaultValue;
          if (descriptor.kind === "select") {
            return (
              <label
                key={descriptor.key}
                className="grid gap-1.5 text-xs font-semibold text-fg-2"
              >
                {descriptor.label}
                <select
                  value={String(value)}
                  onChange={(event) => {
                    const selected = descriptor.choices.find(({ value: choiceValue }) =>
                      String(choiceValue) === event.currentTarget.value
                    );
                    if (selected) onChange(descriptor.key, selected.value);
                  }}
                  className="min-h-11 rounded-xl border border-line bg-canvas px-3 text-sm text-fg outline-none focus:border-accent"
                >
                  {descriptor.choices.map((choice) => (
                    <option key={String(choice.value)} value={String(choice.value)}>
                      {choice.label}
                    </option>
                  ))}
                </select>
                <span className="font-normal leading-5 text-fg-3">
                  {descriptor.description}
                </span>
              </label>
            );
          }

          if (descriptor.kind === "number") {
            return (
              <label
                key={descriptor.key}
                className="grid gap-1.5 text-xs font-semibold text-fg-2"
              >
                {descriptor.label}
                <input
                  type="number"
                  min={descriptor.min}
                  max={descriptor.max}
                  step={descriptor.step}
                  value={String(value)}
                  onChange={(event) =>
                    onChange(descriptor.key, Number(event.currentTarget.value))
                  }
                  className="min-h-11 rounded-xl border border-line bg-canvas px-3 text-sm text-fg outline-none focus:border-accent"
                />
                <span className="font-normal leading-5 text-fg-3">
                  {descriptor.description}
                </span>
              </label>
            );
          }

          return (
            <label
              key={descriptor.key}
              className="grid gap-1.5 text-xs font-semibold text-fg-2"
            >
              {descriptor.label}
              <input
                type="text"
                value={String(value)}
                maxLength={descriptor.maxLength}
                placeholder={descriptor.placeholder}
                spellCheck={false}
                onChange={(event) =>
                  onChange(descriptor.key, event.currentTarget.value)
                }
                className="min-h-11 rounded-xl border border-line bg-canvas px-3 text-sm text-fg outline-none focus:border-accent"
              />
              <span className="font-normal leading-5 text-fg-3">
                {descriptor.description}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
