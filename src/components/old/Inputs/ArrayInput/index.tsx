import { Hash, Plus, X } from "lucide-react";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { useEnter } from "../../../../hooks/useEnter";
import {
	CommonEditableProps,
	DataviewFile,
	QueryResults,
} from "../../../../lib/types";
import {
	toPlainArray,
	iconStyle,
	checkIsTag,
	checkIsLink,
	tryToMarkdownLink,
} from "../../../../lib/utils";
import { useKeyboardClick } from "../../../../hooks/useKeyboardClick";
import { PropertySuggester } from "@/components/PropertySuggester";
import { LinkTableData } from "@/components/old/LinkTableData";
import { Suggest } from "@/hooks/useSuggest";
import { Markdown } from "@/components/Markdown";

export const ArrayInputWrapper = (props: CommonEditableProps) => {
	const {
		propertyValue,
		propertyValueArrIndex,
		propertyValueIndex,
		propertyValueArr,
		propertyName,
		file,
		setQueryResults,
		updateMetaData,
	} = props;

	const plusRef = useRef<HTMLSpanElement>(null);
	useKeyboardClick(plusRef);

	return (
		<ul className="m-0 p-0">
			{propertyValue?.map((val, n) => (
				<ArrayInput
					key={
						propertyValueArrIndex +
						propertyValueIndex +
						n.toString()
					}
					itemValue={val}
					itemIndex={n}
					{...props}
				/>
			))}
			<li className="flex">
				<span
					ref={plusRef}
					tabIndex={0}
					className="multi-select-pill-remove-button focus:border-[1px] focus:border-solid focus:border-secondary-alt"
					onClick={async () => {
						const copyValues = toPlainArray(propertyValueArr);
						const copyList =
							toPlainArray(copyValues[propertyValueIndex]) ?? [];
						copyList.push("");
						copyValues[propertyValueIndex] = copyList;
						setQueryResults((prev) => {
							const copyPrev = { ...prev };
							copyPrev.values[propertyValueArrIndex] = copyValues;
							return copyPrev as QueryResults;
						});
						await updateMetaData(propertyName, copyList, file.path);
					}}
				>
					<Plus style={iconStyle} />
				</span>
				<input
					disabled
					type="text"
					className="m-0 border-transparent bg-transparent p-0"
				/>
			</li>
		</ul>
	);
};

const ArrayInput = (
	props: CommonEditableProps & { itemValue: string; itemIndex: number },
) => {
	const {
		propertyValue,
		propertyValueArrIndex,
		propertyValueIndex,
		propertyValueArr,
		propertyName,
		file,
		config,
		setQueryResults,
		updateMetaData,
		itemValue,
		itemIndex,
		plugin,
	} = props;
	const [isEditing, setIsEditing] = useState(false);
	const xRef = useRef<HTMLSpanElement>(null);
	// @ts-ignore
	const isLink = checkIsLink(itemValue);
	const updateProperty = async (newItemValue?: string) => {
		const preNewValue = [...propertyValue];
		preNewValue[itemIndex] = newItemValue ?? itemValue;
		const newValue = preNewValue.map((v) => tryToMarkdownLink(v));
		console.log("newValue: ", newValue);
		await updateMetaData(propertyName, newValue, file.path);
	};

	useKeyboardClick(xRef);

	return (
		<li className="flex items-center">
			<span
				className="multi-select-pill-remove-button focus:border-[1px] focus:border-solid focus:border-secondary-alt"
				tabIndex={0}
				ref={xRef}
				onClick={async () => {
					const copyValues = toPlainArray(propertyValueArr);
					const copyList = toPlainArray(
						copyValues[propertyValueIndex],
					).filter((_, index) => index !== itemIndex);
					copyValues[propertyValueIndex] = copyList;
					setQueryResults((prev) => {
						const copyPrev = { ...prev };
						copyPrev.values[propertyValueArrIndex] = copyValues;
						return copyPrev as QueryResults;
					});
					await updateMetaData(propertyName, copyList, file.path);
				}}
			>
				<X style={iconStyle} />
			</span>
			{!isEditing && (
				<span className="flex h-full w-full items-center whitespace-nowrap p-1 focus:border-[1px] focus:border-solid focus:border-secondary-alt">
					{isLink ? (
						// @ts-ignore
						itemValue.embed ? (
							<div className="flex h-full flex-col">
								<Markdown
									app={plugin.app}
									filePath={file.path}
									// @ts-ignore
									plainText={itemValue.markdown()}
								/>
								<span
									className=""
									onClick={() => setIsEditing(true)}
									onFocus={() => setIsEditing(true)}
								>
									&nbsp;
								</span>
							</div>
						) : (
							<>
								<LinkTableData file={itemValue} />
								<span
									className="w-full"
									onClick={() => setIsEditing(true)}
									onFocus={() => setIsEditing(true)}
								>
									&nbsp;
								</span>
							</>
						)
					) : propertyName.toLowerCase() === "tags" ? (
						<>
							<a
								// ref={tagRef}
								href={"#" + itemValue}
								aria-label={"#" + itemValue}
								className="tag whitespace-nowrap"
								target="_blank"
								rel="noopener"
								tabIndex={0}
								// onClick={(e) => setIsEditing(true)}
								// onFocus={() => setIsEditing(true)}
							>
								#{itemValue}
							</a>
							<span
								className="h-full w-full"
								tabIndex={0}
								onClick={() => setIsEditing(true)}
								onFocus={() => setIsEditing(true)}
							>
								&nbsp;
							</span>
						</>
					) : (
						<span
							className="w-full"
							tabIndex={0}
							onClick={() => setIsEditing(true)}
							onFocus={() => setIsEditing(true)}
						>
							{plugin.settings.renderMarkdown ? (
								<Markdown
									app={plugin.app}
									filePath={file.path}
									plainText={
										itemValue || config.emptyValueDisplay
									}
								/>
							) : (
								itemValue || config.emptyValueDisplay
							)}
						</span>
					)}
				</span>
			)}
			{isEditing && (
				<Input
					updateProperty={updateProperty}
					isLink={isLink}
					setIsEditing={setIsEditing}
					{...props}
				/>
			)}
		</li>
	);
};

const Input = ({
	isLink,
	propertyValue,
	propertyName,
	propertyValueIndex,
	propertyValueArr,
	propertyValueArrIndex,
	plugin,
	itemValue,
	itemIndex,
	setQueryResults,
	setIsEditing,
	updateProperty,
}: {
	isLink: boolean;
	itemValue: string;
	itemIndex: number;
	setIsEditing: (value: React.SetStateAction<boolean>) => void;
	updateProperty: (newItemValue?: string) => Promise<void>;
} & CommonEditableProps) => {
	const ref = useRef<HTMLInputElement>(null);
	useEffect(() => {
		if (!ref?.current) return console.log("no ref");
		new Suggest(
			plugin.app,
			ref.current,
			(q) => {
				const sugg =
					// @ts-ignore
					plugin.app.metadataCache?.getFrontmatterPropertyValuesForKey(
						propertyName,
					);
				console.log("sug: ", sugg);
				return [q, ...sugg];
			},
			(v) => updateProperty(v),
		);
		ref.current.focus();
	}, []);
	return (
		<input
			ref={ref}
			type={"text"}
			value={itemValue}
			onChange={(e) => {
				const copyValues = toPlainArray(propertyValueArr);
				console.log("e.value: ", e.target.value);
				const copyList = toPlainArray(copyValues[propertyValueIndex]);
				copyList[itemIndex] = e.target.value;
				copyValues[propertyValueIndex] = copyList;
				setQueryResults((prev) => {
					const copyPrev = { ...prev };
					copyPrev.values[propertyValueArrIndex] = copyValues;
					return copyPrev as QueryResults;
				});
			}}
			onBlur={async () => {
				await updateProperty();
				setIsEditing(false);
			}}
			onFocus={(e) => {}}
			className="relative m-0 border-transparent bg-transparent p-0 text-start"
		/>
	);
};
