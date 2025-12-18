import { none, some } from '@sapphire/framework';
import { type KeyOfStore, SchemaStore, type UnwrapSchema } from '@sapphire/string-store';

export enum CustomId {
	ArbitraryButton
}

export const StringId = Object.fromEntries(
	Object.entries(CustomId).map(([key, value]) => [key, value.toString()])
) as Record<keyof typeof CustomId, `${number}`>;

export const store = new SchemaStore();

export const parseCustomId = <
	T extends KeyOfStore<typeof store>,
	E extends typeof store extends SchemaStore<infer Entries> ? Entries : never,
	D extends UnwrapSchema<E[T] & object>
>(
	customId: string,
	filter: T,
	filterFn: (parsed: D) => boolean = () => true
) => {
	try {
		const parsed = store.deserialize(customId) as { data: D; id: T };
		return parsed.id === filter && filterFn(parsed.data) ? some(parsed.data) : none;
	} catch {
		return none;
	}
};

export const checkStringId = (customId: string, filter: `${number}`) => {
	return customId === filter ? some() : none;
};
