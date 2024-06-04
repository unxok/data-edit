import React, {
	Key,
	KeyboardEventHandler,
	useEffect,
	useRef,
	useState,
} from "react";
import { Markdown } from "@/components/Markdown";
import { InputSwitchProps } from "..";
import {
	dvRenderNullAs,
	getJustifyContentClass,
	updateMetaData,
} from "@/lib/utils";
import { getBlockId } from "@/components/App";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
	Suggester,
} from "@/components/ui/Popover";
import { usePluginSettings } from "@/stores/global";
import { useBlock } from "@/components/BlockProvider";

export const StringInput = (props: InputSwitchProps<string>) => {
	const { propertyName, propertyValue, filePath } = props;
	const { ctx, plugin, blockId } = useBlock();
	const [isEditing, setIsEditing] = useState(false);
	const [isSuggestShown, setIsSuggestShown] = useState(false);
	const [selectedSuggestion, setSelectedSuggestion] = useState<string>();
	const [query, setQuery] = useState(propertyValue);
	const { getBlockConfig } = usePluginSettings();
	const {
		showAutoComplete,
		renderMarkdown,
		horizontalAlignment,
		allowImageFullSize,
		lockEditing,
	} = getBlockConfig(blockId);
	// console.log("blockId: ", blockId);
	// console.log("showAutoComplete: ", showAutoComplete);

	const onBlur = async (value: string) => {
		// console.log(e.target.value);

		await updateMetaData(
			propertyName,
			selectedSuggestion ?? value,
			filePath,
			plugin,
		);
		setIsEditing(false);
		setIsSuggestShown(false);
	};

	const onKeyDown = async (key: string, value: string) => {
		if (key === "Escape") {
			// console.log("esc");
			setIsSuggestShown(false);
		}
		if (key === "Enter") {
			await onBlur(value);
		}
	};

	const getSuggestions = (q: string) => {
		const suggestions: string[] =
			// @ts-ignore
			app.metadataCache.getFrontmatterPropertyValuesForKey(propertyName);
		if (!suggestions || suggestions?.length === 0) return;
		return suggestions.filter((s) => s.includes(q));
	};

	// useEffect(
	// 	() => console.log("selected: ", selectedSuggestion),
	// 	[selectedSuggestion],
	// );

	if (!isEditing || lockEditing) {
		return (
			<Markdown
				disabled={!renderMarkdown}
				app={plugin.app}
				filePath={ctx.sourcePath}
				plainText={propertyValue || dvRenderNullAs}
				className={`flex h-fit min-h-4 w-full break-keep [&_*]:my-0 ${getJustifyContentClass(horizontalAlignment)} ${allowImageFullSize ? "[&_img]:!max-w-[unset]" : ""}`}
				onClick={() => {
					if (!lockEditing) {
						setIsEditing(true);
						setIsSuggestShown(true);
					}
				}}
			/>
		);
	}

	return (
		<Suggester
			open={isSuggestShown}
			query={query}
			onSelect={(text) => {
				// console.log("selected: ", text);
				setSelectedSuggestion(text);
			}}
			getSuggestions={getSuggestions}
			plugin={plugin}
			disabled={!showAutoComplete}
		>
			<input
				type="text"
				defaultValue={propertyValue}
				autoFocus
				onKeyDown={(e) => onKeyDown(e.key, e.currentTarget.value)}
				onChange={(e) => setQuery(e.target.value)}
				onBlur={(e) => onBlur(selectedSuggestion ?? e.target.value)}
			/>
		</Suggester>
	);
};
