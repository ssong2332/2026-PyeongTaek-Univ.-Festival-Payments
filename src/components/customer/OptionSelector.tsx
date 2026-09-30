import { CheckIcon } from "@/components/ui/icons";
import type { MenuOptionGroupDto } from "@/lib/dto/menu";
import { formatOptionPrice } from "@/lib/format";

// hint: 그룹의 min/max 안내 문구(예: "원하는 것만 선택", "필수 · 1개 선택") — 화면(훅)이 만들어 넘긴다.
export type OptionGroupView = MenuOptionGroupDto & { hint: string };

export interface OptionSelectorProps {
    groups: readonly OptionGroupView[];
    selectedIds: readonly string[];
    onToggle: (groupId: string, optionId: string) => void;
}

export function OptionSelector({ groups, selectedIds, onToggle }: OptionSelectorProps) {
    if (groups.length === 0) return null;
    return (
        <div className="flex flex-col gap-4">
            {groups.map((group) => {
                // 필수 단일 선택 그룹은 라디오(하나만), 나머지는 체크박스(maxSelect까지).
                const single = group.minSelect === 1 && group.maxSelect === 1;
                const countInGroup = group.options.filter((option) => selectedIds.includes(option.id)).length;
                const labelId = `option-group-${group.id}`;
                const hintId = `option-group-hint-${group.id}`;
                return (
                    <div
                        key={group.id}
                        role="group"
                        aria-labelledby={labelId}
                        aria-describedby={hintId}
                        className="rounded-[20px] border border-orange-100 bg-white p-4"
                    >
                        <div className="mb-3 flex items-baseline justify-between gap-2">
                            <span id={labelId} className="text-sm font-extrabold text-brand-deep">
                                {group.name}
                            </span>
                            <span id={hintId} className="text-xs text-stone-500">
                                {group.hint}
                            </span>
                        </div>
                        {group.options.length === 0 && <p className="text-sm text-stone-500">지금은 고를 수 있는 옵션이 없어요.</p>}
                        <div className="flex flex-col gap-2">
                            {group.options.map((option) => {
                                const checked = selectedIds.includes(option.id);
                                const disabled = !single && !checked && countInGroup >= group.maxSelect;
                                return (
                                    <label
                                        key={option.id}
                                        className={`flex cursor-pointer items-center gap-3 rounded-2xl border px-3 py-3 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-brand ${
                                            checked ? "border-brand bg-orange-50" : "border-orange-100 bg-white"
                                        } ${disabled ? "cursor-not-allowed opacity-50" : ""}`}
                                    >
                                        <input
                                            type={single ? "radio" : "checkbox"}
                                            name={group.id}
                                            checked={checked}
                                            disabled={disabled}
                                            onChange={() => onToggle(group.id, option.id)}
                                            className="sr-only"
                                        />
                                        <span
                                            aria-hidden="true"
                                            className={`flex size-6 shrink-0 items-center justify-center rounded-lg border ${
                                                checked ? "border-brand bg-brand text-white" : "border-stone-300 bg-white"
                                            }`}
                                        >
                                            {checked && <CheckIcon className="size-4" />}
                                        </span>
                                        <span className="flex-1 text-sm font-bold text-neutral-900">{option.name}</span>
                                        <span className={`text-sm font-bold ${checked ? "text-brand" : "text-stone-400"}`}>
                                            {formatOptionPrice(option.extraPrice)}
                                        </span>
                                    </label>
                                );
                            })}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
