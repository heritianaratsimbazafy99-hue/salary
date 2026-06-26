import { PAY_ITEM_CATEGORIES } from "@/lib/payroll/schema";

type Props = {
  unknownColumns: string[];
};

export function ColumnMappingForm({ unknownColumns }: Props) {
  if (unknownColumns.length === 0) {
    return <p className="text-sm text-muted-foreground">Toutes les colonnes sont reconnues.</p>;
  }

  return (
    <form className="space-y-4">
      {unknownColumns.map((column, index) => {
        const labelId = `mapping-${index}-label`;
        const categoryId = `mapping-${index}-category`;
        const fieldName = `mappings.${index}`;

        return (
          <fieldset key={column} className="grid gap-2 rounded border border-border p-4 md:grid-cols-3">
            <legend className="px-1 text-sm font-medium">{column}</legend>
            <input name={`${fieldName}.sourceColumn`} type="hidden" value={column} />
            <label className="text-sm" htmlFor={labelId}>
              Libelle
              <input
                className="mt-1 w-full rounded border border-border px-3 py-2"
                defaultValue={column}
                id={labelId}
                name={`${fieldName}.label`}
              />
            </label>
            <label className="text-sm" htmlFor={categoryId}>
              Categorie
              <select
                className="mt-1 w-full rounded border border-border px-3 py-2"
                id={categoryId}
                name={`${fieldName}.category`}
              >
                {PAY_ITEM_CATEGORIES.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </label>
          </fieldset>
        );
      })}
    </form>
  );
}
