import {
	MarkdownPostProcessorContext,
	MarkdownSectionInformation,
	Notice,
	parseYaml,
	stringifyYaml,
} from "obsidian";
import {
	BlockConfig,
	BlockConfigSchema,
	PluginSettingsSchema,
	Settings,
} from "./PluginSettings";
import React, { useCallback, useEffect, useState } from "react";
import DataEdit, { loadDependencies } from "@/main";
import {
	checkForInlineField,
	cn,
	currentLocale,
	dv,
	dvRenderNullAs,
	getColAliasObj,
	getPropertyType,
	iconStyle,
	isDateWithTime,
	iterateStringKeys,
	numberToBase26Letters,
	tryToMarkdownLink,
	updateMetaData,
} from "@/lib/utils";
import { Markdown } from "./Markdown";
import {
	Binary,
	Calendar,
	CheckSquare,
	Clock,
	File,
	Forward,
	Info,
	List,
	Lock,
	Settings as Gear,
	Tags,
	Text,
	Unlock,
	Sparkle,
	ScanText,
	Braces,
	Plus,
	ChevronLeft,
	ChevronRight,
	ChevronLast,
	ChevronFirst,
	CircleX,
} from "lucide-react";
import { ClassValue } from "clsx";
import { create } from "zustand";
import { FILE } from "@/lib/consts";
import { DateTime } from "luxon";
import { InputSwitch } from "./Inputs";
import { ErrorBoundary, FallbackProps } from "react-error-boundary";
import { usePluginSettings } from "@/stores/global";
import { BlockProvider, useBlock } from "./BlockProvider";
import { z } from "zod";
import { word } from "minifaker";
import "minifaker/locales/en";
// import { NumberInput } from "./Inputs";

type ObsdianPropertyType =
	| "aliases"
	| "checkbox"
	| "date"
	| "datetime"
	| "multitext"
	| "number"
	| "tags"
	| "text";

const PropertyIcon = ({
	propertyType,
}: {
	propertyType: ObsdianPropertyType | string;
}) => {
	switch (propertyType) {
		case "aliases": {
			return <Forward style={iconStyle} />;
		}
		case "checkbox": {
			return <CheckSquare style={iconStyle} />;
		}
		case "date": {
			return <Calendar style={iconStyle} />;
		}
		case "datetime": {
			return <Clock style={iconStyle} />;
		}
		case "multitext": {
			return <List style={iconStyle} />;
		}
		case "number": {
			return <Binary style={iconStyle} />;
		}
		case "tags": {
			return <Tags style={iconStyle} />;
		}
		case "text": {
			return <Text style={iconStyle} />;
		}
		case "file": {
			return <File style={iconStyle} />;
		}
		case "inline": {
			return <ScanText style={iconStyle} />;
		}
		case "object": {
			return <Braces style={iconStyle} />;
		}
		default: {
			return <Text style={iconStyle} />;
		}
	}
};

const ensureFileLink = (query: string) => {
	const regex1 = new RegExp(/table without id/gi);
	const regex2 = new RegExp(/file.link/gi);
	if (regex1.test(query) && !regex2.test(query)) {
		const arr = query.split("\n");
		arr[0] += ", file.link";
		return { query: arr.join("\n"), hideFileLink: true };
	}
	return { query: query, hideFileLink: false };
};

const findFileHeaderIndex = (headers: string[]) => {
	const found = headers.findIndex((h) => {
		const l = h.toLowerCase();
		if (l === FILE || l === "file.link") return true;
	});
	if (found === -1)
		throw new Error(
			"Could not find file link header. This should be impossible",
		);
	return found;
};

export const getBlockId = (multiLine: string) => {
	const arr = multiLine.trim().split("\n");
	const line = arr[arr.length - 1];
	const regex = new RegExp(/^ID\s\S/gim);
	const hasId = regex.test(line);
	if (!hasId)
		return {
			blockId: "",
			query: multiLine,
		};
	return {
		blockId: line.slice(3),
		query: arr.slice(0, -1).join("\n"),
	};
};

const getRandomAdjectiveNoun = () => {
	const adjective = word({ type: "adjective" });
	const noun = word({ type: "noun" });
	return adjective + "-" + noun;
};

const writeRandomId = async (
	m: MarkdownPostProcessorContext,
	s: MarkdownSectionInformation,
	plugin: DataEdit,
	pluginSettingsConfigs: z.infer<typeof PluginSettingsSchema>["blockConfigs"],
) => {
	const { vault } = plugin.app;
	const file = vault.getFileByPath(m.sourcePath);

	let id = getRandomAdjectiveNoun();
	const existingIds = Object.keys(pluginSettingsConfigs);
	while (existingIds.includes(id)) {
		// Theoretically, one could generate so many random ids that they use every single possible word that could be generated by this. I am pretty sure there are millions of combinations possible so I am not going to worry about it right now ;)
		id = getRandomAdjectiveNoun();
	}
	const e = new Error(
		"Tried writing a random ID to a file but no file was found with filepath: " +
			m.sourcePath,
	);
	if (!file) throw e;
	const content = await vault.read(file);
	if (!content) throw e;
	const lines = content.split("\n");
	lines.splice(s.lineEnd, 0, "ID " + id);
	await vault.modify(file, lines.join("\n"));
	const frag = new DocumentFragment();
	const div1 = document.createElement("div");
	const span1 = document.createElement("span");
	const span2 = document.createElement("span");
	span1.textContent = "Successfully created id: ";
	span2.textContent = id;
	span2.style.color = "var(--text-success)";
	div1.appendChild(span1);
	div1.appendChild(span2);
	const div2 = document.createElement("div");
	div2.textContent = "Click the gear again to configure block";
	frag.appendChild(div1);
	frag.appendChild(div2);
	new Notice(frag);
};

// const cleanUpBlockIds = async (
// 	configObj: Record<string, z.infer<typeof BlockConfigSchema>>,
// 	plugin: DataEdit,
// ) => {
// 	const r = {} as typeof configObj;
// 	for (const k in configObj) {
// 		if (k === "default") {
// 			return (r[k] = configObj[k]);
// 		}
// 		const arr = k.split("|");
// 		const start = Number.isNaN(Number(arr[0])) ? -1 : Number(arr[0]);
// 		const end = Number.isNaN(Number(arr[1])) ? -1 : Number(arr[1]);
// 		if (start + end === -2) return;
// 		const { vault } = plugin.app;
// 		const file = vault.getFileByPath(arr[3]);
// 		if (!file) return;
// 		const content = await vault.cachedRead(file);
// 		const lines = content.split("\n");
// 		const matchStart = lines[start].toLowerCase() === "```dataedit";
// 		const matchEnd = lines[end].toUpperCase() === "```";
// 		if (!(matchStart && matchEnd)) return;
// 		r[k] = configObj[k];
// 	}
// 	return r;
// };

type QueryResults = {
	headers: string[];
	values: any[][];
};

// type BlockState = {
// 	plugin?: DataEdit;
// 	data?: string;
// 	blockId?: string;
// 	ctx?: MarkdownPostProcessorContext;
// 	aliasObj?: Record<string, string>;
// 	setBlockState: (
// 		state: BlockState | ((state: BlockState) => BlockState),
// 	) => void;
// };
// export const useBlock = create<BlockState>()((set) => ({
// 	plugin: undefined,
// 	setBlockState: (state) => {
// 		if (typeof state === "function") {
// 			return set((prev) => state(prev));
// 		}
// 		set(state);
// 	},
// }));

export const App = (props: {
	data: string;
	ctx: MarkdownPostProcessorContext;
	getSectionInfo: () => MarkdownSectionInformation;
	// settings: Settings;
	plugin: DataEdit;
}) => {
	const { data, plugin, ctx, getSectionInfo } = props;
	const [queryResults, setQueryResults] = useState<QueryResults>();
	const [fileHeaderIndex, setFileHeaderIndex] = useState<number>(-1);
	const [dvErr, setDvErr] = useState<string>();
	const [showSettings, setShowSettings] = useState(false);
	const [isLocked, setIsLocked] = useState(false);
	const { blockId, query: preQuery } = getBlockId(data);
	const { query, hideFileLink } = ensureFileLink(preQuery);
	const { settings, setSettings, getBlockConfig } = usePluginSettings();
	const aliasObj = getColAliasObj(query);

	/**
	 * Block data becomes undefined in reading mode, so this protects against setting it undefined
	 * @param qr new Query Results
	 */
	const safeSetQueryResults = (qr: QueryResults) => {
		setQueryResults((prev) => {
			if (qr) return qr;
			if (prev) return prev;
			return qr;
		});
	};

	const doQuery = async () => {
		// console.log("do query called: ", query);
		// @ts-ignore
		const dv = app.plugins.plugins.dataview.api;
		if (query.split(" ")[0].toLowerCase() !== "table") {
			const result = eval(`(() => {${query}})()`);
			// console.log("result: ", result);
			if (!result) return;
			return safeSetQueryResults(result);
		}
		const qr = await dv.query(query);
		console.log("dv q: ", qr);
		if (!qr.successful) {
			return setDvErr(qr.error);
		}
		// console.log(qr.value);
		safeSetQueryResults(qr.value);
	};

	useEffect(() => {
		setSettings(() => plugin.settings);
		(async () => {
			const b = await loadDependencies();
			if (!b) {
				return new Notice(
					"Datedit: Failed to load dependencies\n\nIs Dataview installed and enabled?",
				);
			}
			await doQuery();
		})();
		plugin.app.metadataCache.on(
			"dataview:index-ready" as "changed",
			doQuery,
		);
		plugin.app.metadataCache.on(
			"dataview:metadata-change" as "changed",
			doQuery,
		);
		return () => {
			plugin.app.metadataCache.off(
				"dataview:index-ready" as "changed",
				doQuery,
			);
			plugin.app.metadataCache.off(
				"dataview:metadata-change" as "changed",
				doQuery,
			);
			console.log("App unmounted");
		};
	}, []);

	useEffect(() => {
		plugin.updateSettings(settings);
	}, [settings]);

	useEffect(() => {
		console.log("queryResults changed: ", queryResults);
		if (!queryResults) return;
		setFileHeaderIndex(findFileHeaderIndex(queryResults.headers));
	}, [queryResults]);

	if (!settings) return;

	const { pageSize, currentPage } = getBlockConfig(blockId);
	const startIndex = pageSize < 1 ? 0 : (currentPage - 1) * pageSize;
	const endIndex =
		pageSize < 1 ? queryResults?.values?.length : startIndex + pageSize;
	const currentRows = queryResults?.values?.slice(startIndex, endIndex);

	const { blockConfigs } = settings;
	if (!blockConfigs) return;
	const config = blockConfigs[blockId] ?? blockConfigs["default"];

	console.log("config: ", config);

	if (!queryResults || fileHeaderIndex === -1) {
		return (
			<div className="twcss">
				<div>Query results undefined</div>
				<div className="flex flex-row items-center gap-1">
					<div>Dataview error</div>
					<div aria-label={dvErr}>
						<Info className="hover:text-accent" style={iconStyle} />
					</div>
				</div>
			</div>
		);
	}
	return (
		<BlockProvider
			plugin={plugin}
			data={data}
			blockId={blockId}
			ctx={ctx}
			aliasObj={aliasObj}
		>
			<div className="twcss" style={{ overflowX: "scroll" }}>
				<ErrorBoundary FallbackComponent={Fallback}>
					{/* height 1px allows divs to be 100% of the td -_- */}
					<table className="dataedit h-[1px]">
						<thead>
							{false && (
								<tr>
									{queryResults?.headers?.map((_, i) => (
										<th className="!bg-secondary">
											<div className="flex items-center justify-center">
												{numberToBase26Letters(i)}
											</div>
										</th>
									))}
								</tr>
							)}
							<tr>
								{false && (
									<th className="w-fit min-w-0 !bg-secondary">
										<div className="flex h-full w-full items-center justify-center">
											1
										</div>
									</th>
								)}
								{queryResults?.headers?.map((h, i) => (
									<Th
										key={i + "table-header"}
										className=""
										hideFileLink={hideFileLink}
										propertyName={h}
									/>
								))}
							</tr>
						</thead>
						<tbody>
							{currentRows?.map((r, i) => (
								<tr key={i + "-table-body-row"}>
									{false && (
										<td className="w-fit min-w-0 bg-secondary">
											<div className="my-auto flex h-full w-full items-center justify-center">
												{i + 2}
											</div>
										</td>
									)}
									{r?.map((d, k) => (
										<Td
											key={k + "table-data"}
											propertyName={
												queryResults.headers[k]
											}
											propertyValue={d}
											className=""
											hideFileLink={hideFileLink}
											filePath={
												queryResults.values[
													startIndex + i
												][fileHeaderIndex]?.path
											}
											isLocked={isLocked}
										/>
									))}
								</tr>
							))}
						</tbody>
					</table>
					<div className="flex w-full flex-row items-center p-2">
						<PaginationNav totalRows={queryResults.values.length} />
						<PaginationSize />
						<SettingsGear
							blockId={blockId}
							onClick={
								blockId
									? () => setShowSettings(true)
									: async () =>
											await writeRandomId(
												ctx,
												getSectionInfo(),
												plugin,
												settings.blockConfigs,
											)
							}
						/>
						{showSettings && (
							<BlockConfig
								id={blockId}
								filePath={ctx.sourcePath}
								open={showSettings}
								setOpen={setShowSettings}
								// onChange={(bc) => setBlockConfig(bc)}
							/>
						)}
						<LockToggle />
					</div>
				</ErrorBoundary>
			</div>
		</BlockProvider>
	);
};

const Fallback = ({ error }: FallbackProps) => {
	console.error("Fallback got error: ", error);
	const e = error as Error;
	return (
		<div className="border-[1px] border-dashed border-error p-3">
			<h2 className="text-error">
				Dataedit Error <CircleX className="svg-icon" />
			</h2>
			<p>
				<i>It's not you, it's me</i>
				{"\uff08>\ufe4f<\uff09"}
			</p>
			<p>Sorry about that!</p>
			<p>
				If you'd like this to get fixed, please check the{" "}
				<a href="https://github.com/unxok/dataedit/issues">
					known issues
					<span className="external-link" />
				</a>
				. If there's no open issue yet, please open one and provide the
				info below as well as the steps to reproduce the issue
			</p>
			<details>
				<summary className="hover:cursor-pointer hover:underline">
					Show error details
				</summary>
				<h3>Error message</h3>
				<pre>
					<code>{e?.message}</code>
				</pre>
				<h3>Error stack</h3>
				<pre>
					<code>{e?.stack}</code>
				</pre>
			</details>
		</div>
	);
};

const PaginationSize = () => {
	const [isEditing, setIsEditing] = useState(false);
	const { blockId } = useBlock();
	const { getBlockConfig, setBlockConfig } = usePluginSettings();
	const { pageSize } = getBlockConfig(blockId);

	const setPageSize = (cb: ((num: number) => number) | number) => {
		if (typeof cb === "function") {
			setBlockConfig(blockId, (prev) => {
				const newPage = cb(prev.currentPage);
				console.log("new page: ", newPage);
				return {
					...prev,
					pageSize: newPage,
				};
			});
			return;
		}
		console.log("newPage: ", cb);
		setBlockConfig(blockId, (prev) => ({ ...prev, pageSize: cb }));
	};

	if (!isEditing)
		return (
			<div className="clickable-icon" onClick={() => setIsEditing(true)}>
				{pageSize || "Infinity"} per page
			</div>
		);

	return (
		<input
			type="number"
			autoFocus
			step={1}
			min={0}
			defaultValue={pageSize}
			aria-label="Page size"
			placeholder="∞"
			className="w-8"
			onBlur={(e) => {
				setPageSize((prev) => {
					const num = Math.floor(Number(e.target.value));
					if (num < 0 || Number.isNaN(num)) {
						return 0;
					}
					return num;
				});
				setIsEditing(false);
			}}
			onKeyDown={(e) => {
				if (e.key === "Enter") {
					setPageSize((prev) => {
						const num = Math.floor(Number(e.currentTarget.value));
						if (num < 0 || Number.isNaN(num)) {
							return 0;
						}
						return num;
					});
					setIsEditing(false);
				}
				if (e.key === "Escape") {
					setIsEditing(false);
				}
			}}
		/>
	);
};

const PaginationNav = ({ totalRows }: { totalRows: number }) => {
	const [isEditing, setIsEditing] = useState(false);
	const { blockId } = useBlock();
	const { getBlockConfig, setBlockConfig } = usePluginSettings();
	const { currentPage, pageSize } = getBlockConfig(blockId);
	const totalPages = pageSize < 1 ? 1 : Math.floor(totalRows / pageSize);

	const setCurrentPage = (cb: ((num: number) => number) | number) => {
		if (typeof cb === "function") {
			setBlockConfig(blockId, (prev) => {
				const newPage = cb(prev.currentPage);
				console.log("new page: ", newPage);
				return {
					...prev,
					currentPage: newPage,
				};
			});
			return;
		}
		setBlockConfig(blockId, (prev) => ({ ...prev, currentPage: cb }));
	};

	const goPrev = () => {
		if (currentPage > 1) {
			setCurrentPage((prev) => prev - 1);
		}
	};

	const goFirst = () => {
		if (currentPage > 1) {
			setCurrentPage(1);
		}
	};

	const goNext = () => {
		if (currentPage < totalPages) {
			setCurrentPage((prev) => prev + 1);
		}
	};

	const goLast = () => {
		if (currentPage < totalPages) {
			setCurrentPage(totalPages);
		}
	};

	return (
		<div className="flex items-center justify-center">
			<div onClick={goFirst} className="clickable-icon w-fit">
				<ChevronFirst className="svg-icon" />
			</div>
			<div onClick={goPrev} className="clickable-icon w-fit">
				<ChevronLeft className="svg-icon" />
			</div>
			<span className="px-1">
				{!isEditing && (
					<span
						aria-label="Enter page number"
						className="hover:cursor-pointer hover:underline"
						onClick={() => setIsEditing(true)}
					>
						{currentPage}
					</span>
				)}
				{isEditing && (
					<input
						type="number"
						defaultValue={currentPage}
						autoFocus
						step={1}
						className="w-8"
						onBlur={(e) => {
							const newPage = Math.floor(Number(e.target.value));
							if (Number.isNaN(newPage) || newPage < 1) {
								setCurrentPage(1);
								return setIsEditing(false);
							}
							if (newPage > totalPages) {
								setCurrentPage(totalPages);
								return setIsEditing(false);
							}
							setCurrentPage(newPage);
							setIsEditing(false);
						}}
						onKeyDown={(e) => {
							if (e.key === "Enter") {
								const newPage = Math.floor(
									Number(e.currentTarget.value),
								);
								if (Number.isNaN(newPage) || newPage < 1) {
									setCurrentPage(1);
									return setIsEditing(false);
								}
								if (newPage > totalPages) {
									setCurrentPage(totalPages);
									return setIsEditing(false);
								}
								setCurrentPage(newPage);
								setIsEditing(false);
							}
							if (e.key === "Escape") {
								setIsEditing(false);
							}
						}}
					/>
				)}
				<span> of {totalPages}</span>
			</span>
			<div onClick={goNext} className="clickable-icon w-fit">
				<ChevronRight className="svg-icon" />
			</div>
			<div onClick={goLast} className="clickable-icon w-fit">
				<ChevronLast className="svg-icon" />
			</div>
		</div>
	);
};

const LockToggle = () => {
	const { blockId } = useBlock();
	const { getBlockConfig, setBlockConfig } = usePluginSettings();

	const toggleLock = () => {
		setBlockConfig(blockId, (prev) => ({
			...prev,
			lockEditing: !prev.lockEditing,
		}));
	};
	const { lockEditing } = getBlockConfig(blockId);
	const Icon = lockEditing ? Lock : Unlock;
	return (
		<div
			onClick={() => toggleLock()}
			aria-label="Lock editing"
			className="clickable-icon side-dock-ribbon-action"
		>
			<Icon
				className={`svg-icon lucide-lock ${
					!lockEditing
						? "text-muted opacity-50"
						: "text-inherit opacity-100"
				}`}
			/>
		</div>
	);
};

const SettingsGear = ({
	blockId,
	onClick,
}: {
	blockId?: string;
	onClick: React.MouseEventHandler<HTMLDivElement>;
}) => {
	return (
		<div
			onClick={onClick}
			aria-label={
				blockId
					? `id: ${blockId}`
					: `No id found. Click to generate random id`
			}
			className="clickable-icon side-dock-ribbon-action"
		>
			<Gear className="svg-icon lucide-settings" />
		</div>
	);
};

const Th = ({
	propertyName,
	className,
	hideFileLink,
}: {
	propertyName: string;
	className?: ClassValue;
	hideFileLink: boolean;
}) => {
	const { ctx, plugin, aliasObj } = useBlock();
	const propName = aliasObj[propertyName] ?? propertyName;
	// TODO check for different prop name set in dataview settings?
	const isFileProp =
		propName.toLowerCase() === FILE || propName === "file.link";
	const prePropertyType = isFileProp ? FILE : getPropertyType(propName);
	const propertyType = prePropertyType ?? "inline";
	if (isFileProp && hideFileLink) return;
	return (
		<th className={cn(className)}>
			<div className="flex h-full w-full items-center">
				<Markdown
					app={plugin.app}
					filePath={ctx.sourcePath}
					plainText={propertyName}
				/>
				&nbsp;
				<div
					aria-label={propertyType}
					className="flex items-center justify-center"
				>
					<PropertyIcon propertyType={propertyType} />
				</div>
			</div>
		</th>
	);
};

export type TdProps<T> = {
	propertyName: string;
	propertyValue: T;
	className?: ClassValue;
	hideFileLink: boolean;
	filePath: string;
	isLocked: boolean;
};
const Td = (props: TdProps<unknown>) => {
	const { propertyValue, propertyName, className, hideFileLink, filePath } =
		props;
	const { ctx, plugin, aliasObj } = useBlock();
	const propName = aliasObj[propertyName] ?? propertyName;
	// TODO check for different prop name set in dataview settings?
	const isFileProp =
		propName.toLowerCase() === FILE || propName === "file.link";
	const prePropertyType = isFileProp ? FILE : getPropertyType(propName);
	const propertyType = checkForInlineField(
		propName,
		filePath,
		// @ts-ignore
		plugin.app.plugins.plugins.dataview.api,
	).success
		? "inline"
		: prePropertyType;

	const propValue = tryToMarkdownLink(propertyValue);

	if (isFileProp && hideFileLink) return;

	return (
		<td className={cn(className)}>
			<div className="flex h-full w-full">
				<InputSwitch
					{...props}
					propertyName={propName}
					propertyValue={propValue}
					propertyType={propertyType}
				/>
			</div>
		</td>
	);
};

// const DateInput = (props: InputSwitchProps<DateTime>) => {
// 	const { propertyName, propertyValue, filePath, isLocked } = props;
// 	const { ctx, plugin } = useBlock();
// 	const [isEditing, setIsEditing] = useState(false);
// 	const [{ formattedDate, inputDate }, setDateStrings] = useState({
// 		formattedDate: null,
// 		inputDate: null,
// 	});
// 	const locale = currentLocale();
// 	// @ts-ignore
// 	const { defaultDateFormat } = app.plugins.plugins?.dataview?.settings;

// 	useEffect(() => {
// 		if (!DateTime.isDateTime(propertyValue)) {
// 			setDateStrings({
// 				formattedDate: null,
// 				inputDate: null,
// 			});
// 		}
// 		if (DateTime.isDateTime(propertyValue)) {
// 			const formattedDate = propertyValue
// 				.toLocal()
// 				.toFormat(defaultDateFormat, { locale });
// 			const inputDate = propertyValue.toLocal().toFormat("yyyy-MM-dd");
// 			setDateStrings({ formattedDate, inputDate });
// 		}
// 	}, [propertyValue]);

// 	// useEffect(
// 	// 	() => console.log("inputDateString: ", inputDateString),
// 	// 	[inputDateString],
// 	// );

// 	if (!isEditing || isLocked) {
// 		return (
// 			<Markdown
// 				app={plugin.app}
// 				filePath={ctx.sourcePath}
// 				plainText={formattedDate ?? dvRenderNullAs}
// 				className="h-full min-h-4 w-full break-keep [&_*]:my-0"
// 				onClick={() => {
// 					!isLocked && setIsEditing(true);
// 				}}
// 			/>
// 		);
// 	}

// 	return (
// 		<input
// 			type="date"
// 			max={"9999-12-31"}
// 			defaultValue={inputDate}
// 			autoFocus
// 			onBlur={async (e) => {
// 				await updateMetaData(
// 					propertyName,
// 					e.target.value,
// 					filePath,
// 					plugin,
// 				);

// 				setIsEditing(false);
// 			}}
// 		/>
// 	);
// };
